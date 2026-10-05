alter table public.orders add column if not exists driver_accepted_at timestamptz;

create table public.driver_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_available boolean not null default false,
  vehicle text,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.driver_profiles to authenticated;
grant all on public.driver_profiles to service_role;
alter table public.driver_profiles enable row level security;
create policy "driver own profile read" on public.driver_profiles for select to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()));
create policy "driver own profile update" on public.driver_profiles for update to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid())) with check (user_id = auth.uid() or public.is_staff(auth.uid()));
create policy "staff manage driver profiles" on public.driver_profiles for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create trigger driver_profiles_touch before update on public.driver_profiles for each row execute function public.touch_updated_at();

create table public.driver_locations (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  speed double precision,
  accuracy double precision,
  created_at timestamptz not null default now()
);
create index driver_locations_order_idx on public.driver_locations(order_id, created_at desc);
grant select, insert on public.driver_locations to authenticated;
grant all on public.driver_locations to service_role;
alter table public.driver_locations enable row level security;
create policy "driver writes own location" on public.driver_locations for insert to authenticated
  with check (driver_id = auth.uid() and public.has_role(auth.uid(),'driver') and exists (
    select 1 from public.orders o where o.id = order_id and o.driver_id = auth.uid() and o.status = 'out_for_delivery'));
create policy "driver reads own location" on public.driver_locations for select to authenticated using (driver_id = auth.uid() or public.is_staff(auth.uid()));
create policy "customer reads during active delivery" on public.driver_locations for select to authenticated using (exists (
    select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid() and o.status = 'out_for_delivery' and o.driver_id = driver_locations.driver_id));

alter publication supabase_realtime add table public.driver_locations;

create or replace function public.driver_accept_order(_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'driver') then raise exception 'forbidden'; end if;
  update public.orders set driver_accepted_at = now()
   where id = _order_id and driver_id = auth.uid() and status in ('confirmed','preparing') and driver_accepted_at is null;
  if not found then raise exception 'cannot_accept'; end if;
end $$;

create or replace function public.driver_set_status(_order_id uuid, _status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'driver') then raise exception 'forbidden'; end if;
  if _status = 'out_for_delivery' then
    update public.orders set status = 'out_for_delivery', driver_accepted_at = coalesce(driver_accepted_at, now())
     where id = _order_id and driver_id = auth.uid() and status in ('confirmed','preparing');
  elsif _status = 'delivered' then
    update public.orders set status = 'delivered', payment_status = case when payment_method='cod' then 'paid' else payment_status end
     where id = _order_id and driver_id = auth.uid() and status = 'out_for_delivery';
  else raise exception 'invalid_status'; end if;
  if not found then raise exception 'invalid_transition'; end if;
end $$;

create or replace function public.admin_add_driver(_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(_email));
  if uid is null then raise exception 'user_not_found'; end if;
  insert into public.user_roles(user_id, role) values (uid,'driver') on conflict do nothing;
  insert into public.driver_profiles(user_id) values (uid) on conflict do nothing;
  return uid;
end $$;

create or replace function public.admin_remove_driver(_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  delete from public.user_roles where user_id = _user_id and role = 'driver';
  delete from public.driver_profiles where user_id = _user_id;
end $$;

create or replace function public.order_driver_info(_order_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', p.full_name, 'phone', p.phone)
  from public.orders o left join public.profiles p on p.id = o.driver_id
  where o.id = _order_id and o.driver_id is not null and (o.user_id = auth.uid() or public.is_staff(auth.uid()))
$$;

revoke execute on function public.driver_accept_order(uuid), public.driver_set_status(uuid,text), public.admin_add_driver(text), public.admin_remove_driver(uuid), public.order_driver_info(uuid) from anon, public;
grant execute on function public.driver_accept_order(uuid), public.driver_set_status(uuid,text), public.admin_add_driver(text), public.admin_remove_driver(uuid), public.order_driver_info(uuid) to authenticated;