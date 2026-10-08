-- Automatic order dispatching: offers an order to one available driver at a time; the driver accepts or
-- rejects within a timeout; reject/expiry moves on to the next driver.
--
--  * settings: store_settings.features.auto_dispatch_enabled (off by default), dispatch_trigger_status,
--    driver_accept_timeout_seconds, max_active_orders_per_driver, dispatch_alert_after_minutes
--  * order_dispatch_offers   one row per (order, driver) offer. Drivers read their own; writes only through
--                            security-definer functions (driver_respond_to_offer, dispatch_order, ...)
--  * orders.dispatch_status  unassigned | offered | assigned | no_driver_available
--  * driver_dispatch_state   server-maintained load per driver (active orders, open offer, last offer time);
--                            not writable by clients, so a driver cannot fake free capacity
--  * order_dispatch_events   staff-only audit trail (kept out of the customer-visible status history)
--
-- Locking order everywhere: orders row -> offer rows -> driver_dispatch_state row. Driver rows are taken with
-- FOR UPDATE SKIP LOCKED, so parallel dispatches never pick the same driver and never wait on each other.
-- Unique partial indexes are the final guard: at most one open offer per order and per driver.

-- 1. Settings ----------------------------------------------------------------
alter table public.store_settings
  add column if not exists dispatch_trigger_status text not null default 'preparing',
  add column if not exists driver_accept_timeout_seconds integer not null default 120,
  add column if not exists max_active_orders_per_driver integer not null default 3,
  add column if not exists dispatch_alert_after_minutes integer not null default 10;
alter table public.store_settings
  add constraint store_settings_dispatch_trigger_chk check (dispatch_trigger_status in ('confirmed','preparing')),
  add constraint store_settings_accept_timeout_chk check (driver_accept_timeout_seconds between 30 and 1800),
  add constraint store_settings_max_active_chk check (max_active_orders_per_driver between 1 and 20),
  add constraint store_settings_dispatch_alert_chk check (dispatch_alert_after_minutes between 1 and 1440);
update public.store_settings set features = features || '{"auto_dispatch_enabled": false}'::jsonb
 where not (features ? 'auto_dispatch_enabled');

-- Drivers can only answer offers while delivery_tracking is on (is_active_driver), so both flags are required.
create or replace function public.auto_dispatch_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (features->>'auto_dispatch_enabled')::boolean and (features->>'delivery_tracking')::boolean
                     from public.store_settings where id = 1), false)
$$;

-- 2. Orders: dispatch status ---------------------------------------------------
alter table public.orders add column if not exists dispatch_status text not null default 'unassigned';
alter table public.orders add constraint orders_dispatch_status_chk
  check (dispatch_status in ('unassigned','offered','assigned','no_driver_available'));
alter table public.orders disable trigger orders_touch; -- backfill must not change updated_at
update public.orders set dispatch_status = 'assigned' where driver_id is not null;
alter table public.orders enable trigger orders_touch;
create index if not exists orders_dispatch_waiting_idx on public.orders(created_at)
  where dispatch_status = 'no_driver_available';

-- 3. Offers ------------------------------------------------------------------
create table public.order_dispatch_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'offered'
    check (status in ('offered','accepted','rejected','expired','cancelled')),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  unique (order_id, driver_id)
);
create unique index order_dispatch_offers_one_open_per_order on public.order_dispatch_offers(order_id) where status = 'offered';
create unique index order_dispatch_offers_one_open_per_driver on public.order_dispatch_offers(driver_id) where status = 'offered';
create index order_dispatch_offers_open_expiry_idx on public.order_dispatch_offers(expires_at) where status = 'offered';
create index order_dispatch_offers_driver_idx on public.order_dispatch_offers(driver_id, offered_at desc);
revoke all on public.order_dispatch_offers from anon, authenticated; -- Supabase grants everything by default
grant select on public.order_dispatch_offers to authenticated;
grant all on public.order_dispatch_offers to service_role;
alter table public.order_dispatch_offers enable row level security;
create policy "offers driver own or staff read" on public.order_dispatch_offers for select to authenticated
  using (driver_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));
-- No insert/update/delete grants or policies for clients: offers change only through the functions below,
-- which assign the order atomically when an offer is accepted.

-- 4. Driver load -------------------------------------------------------------
create table public.driver_dispatch_state (
  driver_id uuid primary key references public.driver_profiles(user_id) on delete cascade,
  active_orders integer not null default 0,
  current_offer_id uuid references public.order_dispatch_offers(id) on delete set null,
  last_offered_at timestamptz,
  updated_at timestamptz not null default now()
);
revoke all on public.driver_dispatch_state from anon, authenticated; -- Supabase grants everything by default
grant select on public.driver_dispatch_state to authenticated;
grant all on public.driver_dispatch_state to service_role;
alter table public.driver_dispatch_state enable row level security;
create policy "dispatch state driver own or staff read" on public.driver_dispatch_state for select to authenticated
  using (driver_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));

-- 5. Audit trail -------------------------------------------------------------
create table public.order_dispatch_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid,
  offer_id uuid,
  event text not null check (event in ('offered','accepted','rejected','expired','cancelled','no_driver',
                                       'manual_assign','manual_unassign')),
  actor uuid,
  note text,
  created_at timestamptz not null default now()
);
create index order_dispatch_events_order_idx on public.order_dispatch_events(order_id, created_at);
revoke all on public.order_dispatch_events from anon, authenticated; -- Supabase grants everything by default
grant select on public.order_dispatch_events to authenticated;
grant all on public.order_dispatch_events to service_role;
alter table public.order_dispatch_events enable row level security;
create policy "dispatch events staff read" on public.order_dispatch_events for select to authenticated
  using ((select public.is_staff((select auth.uid()))));

-- 6. Internal helpers (not callable by clients) ------------------------------
create or replace function public._dispatch_log(_order uuid, _driver uuid, _offer uuid, _event text, _note text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.order_dispatch_events(order_id, driver_id, offer_id, event, actor, note)
  values (_order, _driver, _offer, _event, auth.uid(), _note)
$$;

/** Recomputes a driver's active order count (orders assigned and not finished). */
create or replace function public._refresh_driver_load(_driver uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if _driver is null then return; end if;
  insert into public.driver_dispatch_state(driver_id)
    select _driver where exists (select 1 from public.driver_profiles where user_id = _driver)
  on conflict do nothing;
  update public.driver_dispatch_state
     set active_orders = (select count(*) from public.orders
                           where driver_id = _driver and status in ('confirmed','preparing','out_for_delivery')),
         updated_at = now()
   where driver_id = _driver;
end $$;

/** Closes an offer (any final status) and frees the driver's open-offer slot. Caller holds the order lock. */
create or replace function public._close_offer(_offer uuid, _status text, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare f record;
begin
  update public.order_dispatch_offers set status = _status, responded_at = now()
   where id = _offer and status = 'offered'
   returning id, order_id, driver_id into f;
  if not found then return; end if;
  update public.driver_dispatch_state set current_offer_id = null, updated_at = now()
   where driver_id = f.driver_id and current_offer_id = f.id;
  perform public._dispatch_log(f.order_id, f.driver_id, f.id,
    case _status when 'expired' then 'expired' when 'rejected' then 'rejected'
                 when 'accepted' then 'accepted' else 'cancelled' end, _note);
end $$;

/**
 * Offers one order to the best available driver. Returns 'offered', 'no_driver_available', 'assigned'
 * (already has a driver), 'skipped' (not in a dispatchable status) or 'busy' (order locked; skip-locked mode).
 * Idempotent: an order with an open, unexpired offer is left alone.
 */
create or replace function public._dispatch(_order_id uuid, _skip_locked boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare
  o record; s record; d uuid; new_offer uuid; r record;
begin
  if _skip_locked then
    select id, status, driver_id, dispatch_status into o from public.orders where id = _order_id for update skip locked;
    if not found then return 'busy'; end if;
  else
    select id, status, driver_id, dispatch_status into o from public.orders where id = _order_id for update;
    if not found then raise exception 'order_not_found'; end if;
  end if;

  for r in select id from public.order_dispatch_offers
            where order_id = _order_id and status = 'offered' and expires_at <= now() loop
    perform public._close_offer(r.id, 'expired');
  end loop;

  if o.driver_id is not null then return 'assigned'; end if;
  if o.status not in ('confirmed','preparing') then
    for r in select id from public.order_dispatch_offers where order_id = _order_id and status = 'offered' loop
      perform public._close_offer(r.id, 'cancelled', 'order ' || o.status);
    end loop;
    return 'skipped';
  end if;
  if exists (select 1 from public.order_dispatch_offers where order_id = _order_id and status = 'offered') then
    return 'offered';
  end if;

  select max_active_orders_per_driver as max_active, driver_accept_timeout_seconds as timeout
    into s from public.store_settings where id = 1;

  select st.driver_id into d
    from public.driver_dispatch_state st
    join public.driver_profiles dp on dp.user_id = st.driver_id
   where dp.is_active and dp.status = 'available'
     and exists (select 1 from public.user_roles ur where ur.user_id = st.driver_id and ur.role = 'driver')
     and st.current_offer_id is null
     and st.active_orders < s.max_active
     and not exists (select 1 from public.order_dispatch_offers x where x.order_id = _order_id and x.driver_id = st.driver_id)
   order by st.active_orders, st.last_offered_at nulls first, st.driver_id
   limit 1
   for update of st skip locked;

  if d is null then
    update public.orders set dispatch_status = 'no_driver_available'
     where id = _order_id and dispatch_status <> 'no_driver_available';
    if found then perform public._dispatch_log(_order_id, null, null, 'no_driver'); end if;
    return 'no_driver_available';
  end if;

  insert into public.order_dispatch_offers(order_id, driver_id, expires_at)
  values (_order_id, d, now() + make_interval(secs => s.timeout))
  returning id into new_offer;
  update public.driver_dispatch_state set current_offer_id = new_offer, last_offered_at = now(), updated_at = now()
   where driver_id = d;
  update public.orders set dispatch_status = 'offered' where id = _order_id;
  perform public._dispatch_log(_order_id, d, new_offer, 'offered');
  return 'offered';
end $$;

/** After an offer was rejected or expired: next driver while auto dispatch is on, otherwise back to unassigned. */
create or replace function public._after_offer_closed(_order_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if public.auto_dispatch_on() then return public._dispatch(_order_id, false); end if;
  update public.orders set dispatch_status = 'unassigned'
   where id = _order_id and driver_id is null and dispatch_status = 'offered'
     and not exists (select 1 from public.order_dispatch_offers where order_id = _order_id and status = 'offered');
  return 'unassigned';
end $$;

/** Offers orders that are waiting for a driver (oldest first). Never waits on a locked order or driver. */
create or replace function public._dispatch_waiting() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id from public.orders
            where dispatch_status = 'no_driver_available' and driver_id is null and status in ('confirmed','preparing')
            order by created_at limit 50 loop
    if public._dispatch(r.id, true) = 'offered' then n := n + 1; end if;
  end loop;
  return n;
end $$;

revoke execute on function public._dispatch_log(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public._refresh_driver_load(uuid) from public, anon, authenticated;
revoke execute on function public._close_offer(uuid, text, text) from public, anon, authenticated;
revoke execute on function public._dispatch(uuid, boolean) from public, anon, authenticated;
revoke execute on function public._after_offer_closed(uuid) from public, anon, authenticated;
revoke execute on function public._dispatch_waiting() from public, anon, authenticated;

-- 7. Public API --------------------------------------------------------------
/** Staff (or the service role / scheduler) dispatches one order now, whatever the auto-dispatch flag. */
create or replace function public.dispatch_order(_order_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  return public._dispatch(_order_id, false);
end $$;
revoke execute on function public.dispatch_order(uuid) from public, anon;
grant execute on function public.dispatch_order(uuid) to authenticated, service_role;

/**
 * The driver's answer to an offer. Returns 'accepted', 'rejected', 'expired' (too late; moved on) or
 * 'taken' (the order was assigned or closed meanwhile). Only one accept can win: the order row is locked
 * and must still have no driver.
 */
create or replace function public.driver_respond_to_offer(_offer_id uuid, _accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare f record; o record;
begin
  if not public.is_active_driver(auth.uid()) then raise exception 'forbidden'; end if;
  select order_id, driver_id into f from public.order_dispatch_offers where id = _offer_id;
  if not found or f.driver_id <> auth.uid() then raise exception 'offer_not_found'; end if;

  select id, status, driver_id into o from public.orders where id = f.order_id for update;
  select * into f from public.order_dispatch_offers where id = _offer_id for update;

  if f.status <> 'offered' then
    return case f.status when 'accepted' then 'accepted' when 'rejected' then 'rejected'
                         when 'expired' then 'expired' else 'taken' end;
  end if;
  if f.expires_at <= now() then
    perform public._close_offer(_offer_id, 'expired');
    perform public._after_offer_closed(f.order_id);
    return 'expired';
  end if;
  if not _accept then
    perform public._close_offer(_offer_id, 'rejected');
    perform public._after_offer_closed(f.order_id);
    return 'rejected';
  end if;
  if o.driver_id is not null or o.status not in ('confirmed','preparing') then
    perform public._close_offer(_offer_id, 'cancelled', 'order no longer available');
    return 'taken';
  end if;

  perform public._close_offer(_offer_id, 'accepted');
  perform set_config('app.dispatch_accept', 'on', true);
  update public.orders set driver_id = f.driver_id, driver_accepted_at = now(), dispatch_status = 'assigned'
   where id = f.order_id;
  perform set_config('app.dispatch_accept', '', true);
  return 'accepted';
end $$;
revoke execute on function public.driver_respond_to_offer(uuid, boolean) from public, anon;
grant execute on function public.driver_respond_to_offer(uuid, boolean) to authenticated;

/** Open offers for the calling driver, with only what is needed to decide (no customer name or phone). */
create or replace function public.driver_my_offers()
returns table(offer_id uuid, order_id uuid, order_number bigint, area text, city text, total numeric,
              payment_method text, cod_amount numeric, items integer, offered_at timestamptz,
              expires_at timestamptz, server_now timestamptz)
language sql stable security definer set search_path = public as $$
  select f.id, o.id, o.order_number, o.address->>'area', o.address->>'city', o.total, o.payment_method,
         case when o.payment_method = 'cod' then o.total else 0 end,
         (select coalesce(sum(i.quantity), 0)::integer from public.order_items i where i.order_id = o.id),
         f.offered_at, f.expires_at, now()
    from public.order_dispatch_offers f
    join public.orders o on o.id = f.order_id
   where f.driver_id = auth.uid() and f.status = 'offered' and f.expires_at > now()
     and public.is_active_driver(auth.uid())
   order by f.offered_at
$$;
revoke execute on function public.driver_my_offers() from public, anon;
grant execute on function public.driver_my_offers() to authenticated;

/** Expires offers past their timeout and moves each order on. Run every minute (pg_cron or a scheduler). */
create or replace function public.expire_stale_offers() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if auth.uid() is not null and not public.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  for r in select distinct order_id from public.order_dispatch_offers
            where status = 'offered' and expires_at <= now() limit 200 loop
    perform 1 from public.orders where id = r.order_id for update skip locked;
    if not found then continue; end if; -- someone is working on this order right now; next run picks it up
    perform public._close_offer(x.id, 'expired')
       from public.order_dispatch_offers x
      where x.order_id = r.order_id and x.status = 'offered' and x.expires_at <= now();
    perform public._after_offer_closed(r.order_id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.expire_stale_offers() from public, anon;
grant execute on function public.expire_stale_offers() to authenticated, service_role;

-- 8. Triggers ----------------------------------------------------------------
/** Assigning/unassigning a driver (manually or by accept) closes open offers and sets dispatch_status. */
create or replace function public._orders_dispatch_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.driver_id is distinct from old.driver_id then
    new.dispatch_status := case when new.driver_id is null then 'unassigned' else 'assigned' end;
    for r in select id from public.order_dispatch_offers where order_id = new.id and status = 'offered' loop
      perform public._close_offer(r.id, 'cancelled', 'assigned manually');
    end loop;
    if coalesce(current_setting('app.dispatch_accept', true), '') <> 'on' then
      perform public._dispatch_log(new.id, coalesce(new.driver_id, old.driver_id), null,
        case when new.driver_id is null then 'manual_unassign' else 'manual_assign' end);
    end if;
  end if;
  if new.status in ('delivered','cancelled') and new.status is distinct from old.status then
    for r in select id from public.order_dispatch_offers where order_id = new.id and status = 'offered' loop
      perform public._close_offer(r.id, 'cancelled', 'order ' || new.status);
    end loop;
  end if;
  return new;
end $$;
revoke execute on function public._orders_dispatch_before() from public, anon, authenticated;
create trigger orders_dispatch_before before update of driver_id, status on public.orders
  for each row execute function public._orders_dispatch_before();

/** Keeps driver loads current, auto-dispatches at the trigger status, and re-offers waiting orders when a driver frees up. */
create or replace function public._orders_dispatch_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare freed boolean := false;
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

  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.driver_id is null
     and new.status = (select dispatch_trigger_status from public.store_settings where id = 1)
     and public.auto_dispatch_on() then
    perform public._dispatch(new.id, false);
  end if;
  if freed and public.auto_dispatch_on() then perform public._dispatch_waiting(); end if;
  return null;
end $$;
revoke execute on function public._orders_dispatch_after() from public, anon, authenticated;
create trigger orders_dispatch_after after insert or update of driver_id, status on public.orders
  for each row execute function public._orders_dispatch_after();

/** New drivers get a load row; a driver who becomes available picks up waiting orders. */
create or replace function public._driver_profiles_dispatch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform public._refresh_driver_load(new.user_id); end if;
  if new.status = 'available' and new.is_active
     and (tg_op = 'INSERT' or old.status is distinct from 'available' or not old.is_active)
     and public.auto_dispatch_on() then
    perform public._dispatch_waiting();
  end if;
  return null;
end $$;
revoke execute on function public._driver_profiles_dispatch() from public, anon, authenticated;
create trigger driver_profiles_dispatch after insert or update of status, is_active on public.driver_profiles
  for each row execute function public._driver_profiles_dispatch();

-- Load rows for existing drivers.
insert into public.driver_dispatch_state(driver_id) select user_id from public.driver_profiles on conflict do nothing;
update public.driver_dispatch_state st
   set active_orders = (select count(*) from public.orders o
                         where o.driver_id = st.driver_id and o.status in ('confirmed','preparing','out_for_delivery'));

-- 9. Realtime: drivers get their offers live (RLS applies to postgres_changes) --
alter publication supabase_realtime add table public.order_dispatch_offers;

-- 10. Expiry schedule ---------------------------------------------------------
-- pg_cron when the project has it. Otherwise schedule the expire-dispatch-offers Edge Function every minute
-- (see docs/dispatch.md). Offers are also expired whenever their order is dispatched or answered.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if not exists (select 1 from cron.job where jobname = 'expire-dispatch-offers') then
      perform cron.schedule('expire-dispatch-offers', '* * * * *', 'select public.expire_stale_offers()');
    end if;
  end if;
exception when others then
  raise notice 'pg_cron not scheduled (%); use the expire-dispatch-offers Edge Function instead', sqlerrm;
end $cron$;
