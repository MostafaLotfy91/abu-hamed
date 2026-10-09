-- Driver notifications that are visible when they fail.
--
-- Before: only a new auto-dispatch offer queued a push, and every failure was silent (auto dispatch off,
-- no available driver, Vault/pg_net missing, driver without a registered device). A manual assignment never
-- notified the driver at all.
--
--  * notification_log     one row per notification attempt: event, recipient, channel, status, error. The
--                         database writes 'queued' (or why nothing was sent); send-driver-push writes the result.
--                         The driver reads their own rows, staff read all.
--  * Who is notified when an order reaches store_settings.dispatch_trigger_status ('preparing' by default):
--      - a driver already assigned to the order: directly (event order_status);
--      - otherwise auto dispatch offers it and the offered driver is notified (event offer_created);
--      - auto dispatch off / no available driver: a 'skipped' row says so (the status change is never blocked).
--    A manual assignment notifies that driver right away (event order_assigned).
--  * push_subscriptions.last_failure_at / last_error per device, and my_push_device() so the driver app can
--    show whether this device is registered and re-subscribe when it is not.

-- 1. Trigger status: preparing (still configurable in admin settings: confirmed | preparing) ---------------
alter table public.store_settings alter column dispatch_trigger_status set default 'preparing';
update public.store_settings set dispatch_trigger_status = 'preparing'
 where id = 1 and dispatch_trigger_status is distinct from 'preparing';

-- 2. Log ----------------------------------------------------------------------------------------------------
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  event text not null check (event in ('offer_created','order_assigned','order_status','test')),
  recipient uuid references auth.users(id) on delete cascade,
  channel text not null default 'web_push' check (channel in ('web_push')),
  status text not null default 'queued'
    check (status in ('queued','sent','partial','failed','no_subscription','not_configured','skipped')),
  error text check (length(error) <= 500),
  order_id uuid references public.orders(id) on delete cascade,
  offer_id uuid references public.order_dispatch_offers(id) on delete set null,
  devices integer,
  sent integer,
  removed integer,
  request_id bigint
);
create index notification_log_recipient_idx on public.notification_log(recipient, created_at desc);
create index notification_log_order_idx on public.notification_log(order_id, created_at);
create index notification_log_created_idx on public.notification_log(created_at);
revoke all on public.notification_log from anon, authenticated; -- Supabase grants everything by default
grant select on public.notification_log to authenticated;
grant all on public.notification_log to service_role;
alter table public.notification_log enable row level security;
create policy "notification log own or staff read" on public.notification_log for select to authenticated
  using (recipient = (select auth.uid()) or (select public.is_staff((select auth.uid()))));
-- No client writes: rows come from the functions below and from send-driver-push (service role).

-- 3. Per-device result ---------------------------------------------------------------------------------------
alter table public.push_subscriptions
  add column if not exists last_failure_at timestamptz,
  add column if not exists last_error text check (length(last_error) <= 300);

-- 4. Queue a push (never blocks or fails the order change) -------------------------------------------------
/** A notification row that says why nothing was sent (no recipient, feature off, ...). */
create or replace function public._notification_skipped(_event text, _order uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_log(event, order_id, status, error) values (_event, _order, 'skipped', _reason);
exception when others then
  raise warning 'notification_log not written: %', sqlerrm;
end $$;

/**
 * Logs a push for one driver and asks send-driver-push (pg_net) to deliver it. Only the log id travels; the
 * function reads the rest. Missing setup ends as status 'not_configured' with the reason, never as an error.
 */
create or replace function public._queue_driver_push(_event text, _recipient uuid, _order uuid, _offer uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid; _url text; _secret text; _req bigint;
begin
  insert into public.notification_log(event, recipient, order_id, offer_id)
  values (_event, _recipient, _order, _offer) returning id into _id;
  delete from public.notification_log where created_at < now() - interval '90 days';
  begin
    if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
      update public.notification_log set status = 'not_configured', error = 'pg_net or Vault is not installed',
             updated_at = now() where id = _id;
      return _id;
    end if;
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into _url using 'driver_push_url';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into _secret using 'driver_push_secret';
    if _url is null or _secret is null then
      update public.notification_log set status = 'not_configured',
             error = 'Vault secrets driver_push_url / driver_push_secret are missing', updated_at = now()
       where id = _id;
      return _id;
    end if;
    -- offer_id too, so a send-driver-push deployed before this migration still delivers offers.
    execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 5000)'
      into _req
      using _url,
            jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || _secret),
            jsonb_strip_nulls(jsonb_build_object('log_id', _id, 'offer_id', _offer));
    update public.notification_log set request_id = _req where id = _id;
  exception when others then
    update public.notification_log set status = 'failed', error = left('not queued: ' || sqlerrm, 500),
           updated_at = now() where id = _id;
  end;
  return _id;
exception when others then
  raise warning 'driver push not logged: %', sqlerrm;
  return null;
end $$;
revoke execute on function public._notification_skipped(text, uuid, text) from public, anon, authenticated;
revoke execute on function public._queue_driver_push(text, uuid, uuid, uuid) from public, anon, authenticated;

-- New offer -> the offered driver (same trigger as before, now logged).
create or replace function public._offer_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._queue_driver_push('offer_created', new.driver_id, new.order_id, new.id);
  return null;
end $$;
revoke execute on function public._offer_push() from public, anon, authenticated;

-- 5. Orders: notify the assigned driver; log why nobody was offered ------------------------------------------
create or replace function public._orders_dispatch_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare freed boolean := false; start_status text; r text;
begin
  if tg_op = 'UPDATE' and old.driver_id is not null
     and (old.driver_id is distinct from new.driver_id or old.status is distinct from new.status) then
    perform public._refresh_driver_load(old.driver_id);
    freed := old.driver_id is distinct from new.driver_id or new.status in ('delivered','cancelled');
  end if;
  if new.driver_id is not null
     and (tg_op = 'INSERT' or old.driver_id is distinct from new.driver_id or old.status is distinct from new.status) then
    perform public._refresh_driver_load(new.driver_id);
  end if;

  select dispatch_trigger_status into start_status from public.store_settings where id = 1;

  if tg_op = 'UPDATE' then
    -- Manual assignment (an accepted offer sets app.dispatch_accept): tell that driver now.
    if new.driver_id is not null and new.driver_id is distinct from old.driver_id
       and coalesce(current_setting('app.dispatch_accept', true), '') <> 'on'
       and new.status not in ('delivered','cancelled') then
      perform public._queue_driver_push('order_assigned', new.driver_id, new.id, null);
    -- Pre-assigned driver: the order reached the start status.
    elsif new.driver_id is not null and new.status is distinct from old.status and new.status = start_status then
      perform public._queue_driver_push('order_status', new.driver_id, new.id, null);
    end if;

    -- No driver yet: offer it (the offer trigger notifies the offered driver), or record why not.
    if new.driver_id is null and new.status is distinct from old.status and new.status = start_status then
      if public.auto_dispatch_on() then
        r := public._dispatch(new.id, false);
        if r = 'no_driver_available' then
          perform public._notification_skipped('offer_created', new.id, 'no_driver_available');
        end if;
      else
        perform public._notification_skipped('offer_created', new.id, 'auto_dispatch_off');
      end if;
    end if;
  end if;

  if freed and public.auto_dispatch_on() then perform public._dispatch_waiting(); end if;
  return null;
end $$;
revoke execute on function public._orders_dispatch_after() from public, anon, authenticated;

-- 6. This device's registration, for the driver app ---------------------------------------------------------
/** Whether the caller's push endpoint is registered to them (and its age and last result), or to another
 *  account (shared phone), or not at all (removed as expired, or never saved). */
create or replace function public.my_push_device(_endpoint text)
returns table(registered boolean, other_account boolean, created_at timestamptz, last_success_at timestamptz,
              last_failure_at timestamptz, last_error text)
language sql stable security definer set search_path = public as $$
  select coalesce(p.user_id = auth.uid(), false),
         coalesce(p.user_id <> auth.uid(), false),
         case when p.user_id = auth.uid() then p.created_at end,
         case when p.user_id = auth.uid() then p.last_success_at end,
         case when p.user_id = auth.uid() then p.last_failure_at end,
         case when p.user_id = auth.uid() then p.last_error end
    from (select 1) one
    left join public.push_subscriptions p on p.endpoint = _endpoint
   where auth.uid() is not null
$$;
revoke execute on function public.my_push_device(text) from public, anon;
grant execute on function public.my_push_device(text) to authenticated;

-- A fresh registration starts with a clean result.
create or replace function public.register_push_subscription(_endpoint text, _keys jsonb, _user_agent text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  insert into public.push_subscriptions(user_id, endpoint, keys, user_agent)
  values (auth.uid(), _endpoint, jsonb_build_object('p256dh', _keys->>'p256dh', 'auth', _keys->>'auth'), left(_user_agent, 400))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, keys = excluded.keys, user_agent = excluded.user_agent, created_at = now(),
        last_failure_at = null, last_error = null
  returning push_subscriptions.id into _id;
  return _id;
end $$;
revoke execute on function public.register_push_subscription(text, jsonb, text) from public, anon;
grant execute on function public.register_push_subscription(text, jsonb, text) to authenticated;
