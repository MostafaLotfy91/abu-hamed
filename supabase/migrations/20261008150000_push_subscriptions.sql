-- Web Push for drivers: a phone gets "أوردر جديد #123" even when the app is closed or the screen is locked.
--
--  * push_subscriptions  one row per browser/device push endpoint; users read and delete only their own.
--                         Registering goes through register_push_subscription(), which also takes over an
--                         endpoint that a previous account on the same device left behind.
--  * When an offer is created, the database calls the Edge Function send-driver-push (pg_net), which
--    sends the push with the VAPID keys kept in Edge Function secrets. The call needs two Vault secrets:
--      driver_push_url     https://<project-ref>.supabase.co/functions/v1/send-driver-push
--      driver_push_secret  same value as the function's DRIVER_PUSH_WEBHOOK_SECRET
--    Without them (or without pg_net) nothing is sent and dispatching is unaffected. See docs/dispatch.md.

-- 1. Subscriptions -------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  keys jsonb not null check (keys ? 'p256dh' and keys ? 'auth'),
  user_agent text check (length(user_agent) <= 400),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
revoke all on public.push_subscriptions from anon, authenticated; -- Supabase grants everything by default
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
alter table public.push_subscriptions enable row level security;
create policy "push subscriptions own read" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "push subscriptions own delete" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

/** Saves this device's push endpoint for the caller. An endpoint is one browser profile, so if another
 *  account registered it before (shared phone, re-login), it now belongs to the caller. */
create or replace function public.register_push_subscription(_endpoint text, _keys jsonb, _user_agent text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  insert into public.push_subscriptions(user_id, endpoint, keys, user_agent)
  values (auth.uid(), _endpoint, jsonb_build_object('p256dh', _keys->>'p256dh', 'auth', _keys->>'auth'), left(_user_agent, 400))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, keys = excluded.keys, user_agent = excluded.user_agent, created_at = now()
  returning push_subscriptions.id into _id;
  return _id;
end $$;
revoke execute on function public.register_push_subscription(text, jsonb, text) from public, anon;
grant execute on function public.register_push_subscription(text, jsonb, text) to authenticated;

-- 2. New offer -> push -----------------------------------------------------------
do $net$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
exception when others then
  raise notice 'pg_net not enabled (%); offer pushes need it', sqlerrm;
end $net$;

/** Asks send-driver-push to notify the offered driver. Only the offer id is sent; the function reads the
 *  rest itself. Never blocks or fails a dispatch: missing setup or errors are only logged. */
create or replace function public._offer_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare _url text; _secret text;
begin
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then return null; end if;
  select decrypted_secret into _url from vault.decrypted_secrets where name = 'driver_push_url';
  select decrypted_secret into _secret from vault.decrypted_secrets where name = 'driver_push_secret';
  if _url is null or _secret is null then return null; end if;
  perform net.http_post(
    url := _url,
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || _secret),
    body := jsonb_build_object('offer_id', new.id),
    timeout_milliseconds := 5000);
  return null;
exception when others then
  raise warning 'offer push not queued: %', sqlerrm;
  return null;
end $$;
revoke execute on function public._offer_push() from public, anon, authenticated;
create trigger order_dispatch_offers_push after insert on public.order_dispatch_offers
  for each row execute function public._offer_push();
