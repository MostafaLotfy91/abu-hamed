-- Migration B: access hardening
--  * banner links can only be same-site paths or https URLs (no javascript:)
--  * store-media bucket is created by migration, with size and MIME limits; uploads/renames stay images-only
--  * no self-service admin: claim_first_admin is removed, the last admin role can't be removed,
--    and the first admin is granted with the service role (see docs/first-admin.md)
--  * coupon checks need a signed-in user and are rate limited
--  * role helpers only answer for the caller; driver management is admin-only
--  * drivers only see customer contact details for their active deliveries
--  * banners and coupons are admin-only

-- 1. Banner links ------------------------------------------------------------
update public.banners set link = null
 where link is not null and link !~ '^(/([^/\\\s<>"][^\s<>"]*)?|https://[^\s<>"]+)$';
alter table public.banners add constraint banners_link_safe_chk
  check (link is null or link ~ '^(/([^/\\\s<>"][^\s<>"]*)?|https://[^\s<>"]+)$');

-- 2. Storage bucket and policies --------------------------------------------
-- Public bucket: images are served from the public URL, so nobody needs list access.
-- 10 MB stays above typical phone photos until uploads are compressed client-side.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-media', 'store-media', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/avif','image/gif'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "store media read" on storage.objects;
create policy "store media staff read" on storage.objects for select to authenticated
  using (bucket_id = 'store-media' and public.is_staff(auth.uid()));

create policy "store media images only on update" on storage.objects as restrictive for update to authenticated
  using (true)
  with check (bucket_id <> 'store-media' or lower(storage.extension(name)) in ('webp','jpg','jpeg','png','gif','avif'));
create policy "store media bulk admin only on update" on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'store-media' or name not like 'bulk/%' or public.has_role(auth.uid(), 'admin'))
  with check (bucket_id <> 'store-media' or name not like 'bulk/%' or public.has_role(auth.uid(), 'admin'));

-- 3. Admin bootstrap ----------------------------------------------------------
drop function if exists public.claim_first_admin();

-- Service role / SQL editor only. Grants admin to an existing user by email.
create or replace function public.grant_admin_by_email(_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(_email));
  if uid is null then raise exception 'user_not_found'; end if;
  insert into public.user_roles(user_id, role) values (uid, 'admin') on conflict do nothing;
  return uid;
end $$;
revoke execute on function public.grant_admin_by_email(text) from public, anon, authenticated;
grant execute on function public.grant_admin_by_email(text) to service_role;

create or replace function public.protect_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin' or new.user_id <> old.user_id) then
    -- Lock all admin rows so two admins can't remove each other at the same time.
    perform 1 from public.user_roles where role = 'admin' for update;
    if not exists (select 1 from public.user_roles where role = 'admin' and id <> old.id) then
      raise exception 'last_admin';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke execute on function public.protect_last_admin() from public, anon, authenticated;
drop trigger if exists user_roles_protect_last_admin on public.user_roles;
create trigger user_roles_protect_last_admin before update or delete on public.user_roles
  for each row execute function public.protect_last_admin();

-- 4. Coupons: signed-in only, rate limited ----------------------------------
create table public.coupon_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index coupon_attempts_user_time_idx on public.coupon_attempts(user_id, created_at desc);
grant select on public.coupon_attempts to authenticated;
grant all on public.coupon_attempts to service_role;
alter table public.coupon_attempts enable row level security;
-- Written only by validate_coupon; staff can read for abuse checks.
create policy "coupon attempts staff read" on public.coupon_attempts for select to authenticated
  using (public.is_staff(auth.uid()));

-- Now volatile (it logs failed guesses). Keeps the per-user limit from the order integrity migration.
create or replace function public.validate_coupon(_code text, _subtotal numeric)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare c public.coupons; d numeric; used int; uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('valid', false, 'reason', 'not_authenticated'); end if;
  if (select count(*) from public.coupon_attempts where user_id = uid and created_at > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('valid', false, 'reason', 'rate_limited');
  end if;
  select * into c from public.coupons where upper(code) = upper(trim(_code)) and is_active;
  if not found then
    insert into public.coupon_attempts(user_id) values (uid);
    delete from public.coupon_attempts where user_id = uid and created_at < now() - interval '1 day';
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if c.starts_at is not null and now() < c.starts_at then return jsonb_build_object('valid', false, 'reason', 'not_started'); end if;
  if c.ends_at is not null and now() > c.ends_at then return jsonb_build_object('valid', false, 'reason', 'expired'); end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then return jsonb_build_object('valid', false, 'reason', 'exhausted'); end if;
  if c.per_user_limit is not null then
    select count(*) into used from public.coupon_redemptions where coupon_id = c.id and user_id = uid;
    if used >= c.per_user_limit then return jsonb_build_object('valid', false, 'reason', 'per_user_limit'); end if;
  end if;
  if _subtotal < c.min_order then return jsonb_build_object('valid', false, 'reason', 'min_order', 'min_order', c.min_order); end if;
  d := case when c.discount_type = 'percent' then round(_subtotal * c.value / 100, 2) else c.value end;
  if c.max_discount is not null then d := least(d, c.max_discount); end if;
  d := least(d, _subtotal);
  return jsonb_build_object('valid', true, 'code', c.code, 'discount', d);
end $$;
revoke execute on function public.validate_coupon(text, numeric) from public, anon;
grant execute on function public.validate_coupon(text, numeric) to authenticated;

-- 5. Role helpers answer only for the caller ---------------------------------
-- They stay executable by anon because RLS policies on public tables call them for anonymous visitors.
-- Every caller passes auth.uid(), so a different id (probing another user) now returns false.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(_user_id = auth.uid(), false)
     and exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(_user_id = auth.uid(), false)
     and exists(select 1 from public.user_roles where user_id = _user_id and role in ('admin','staff'))
$$;

-- Granting or removing the driver role is admin-only.
create or replace function public.admin_add_driver(_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(_email));
  if uid is null then raise exception 'user_not_found'; end if;
  insert into public.user_roles(user_id, role) values (uid, 'driver') on conflict do nothing;
  insert into public.driver_profiles(user_id) values (uid) on conflict do nothing;
  return uid;
end $$;

create or replace function public.admin_remove_driver(_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  delete from public.user_roles where user_id = _user_id and role = 'driver';
  delete from public.driver_profiles where user_id = _user_id;
end $$;

-- 6. Drivers see customer contact details only for active deliveries ---------
create or replace function public.driver_order_customers() returns table(order_id uuid, full_name text, phone text)
language sql stable security definer set search_path = public as $$
  select o.id, p.full_name, p.phone from public.orders o left join public.profiles p on p.id = o.user_id
  where o.driver_id = auth.uid() and o.status in ('confirmed','preparing','out_for_delivery')
    and public.has_role(auth.uid(), 'driver')
$$;

-- 7. Banners and coupons are admin-only --------------------------------------
drop policy if exists "banners staff write" on public.banners;
create policy "banners admin write" on public.banners for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "coupons staff" on public.coupons;
create policy "coupons admin" on public.coupons for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
