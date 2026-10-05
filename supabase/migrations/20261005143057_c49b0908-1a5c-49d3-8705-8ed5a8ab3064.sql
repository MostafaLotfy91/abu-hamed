alter table public.driver_profiles add column if not exists status text not null default 'offline', add column if not exists is_active boolean not null default true;
update public.driver_profiles set status = case when is_available then 'available' else 'offline' end;

create or replace function public.validate_driver_status() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status not in ('available','busy','offline') then raise exception 'invalid_driver_status'; end if;
  new.is_available := (new.status = 'available' and new.is_active);
  if not public.is_staff(auth.uid()) and auth.uid() is not null and new.is_active is distinct from old.is_active then raise exception 'forbidden'; end if;
  return new;
end $$;
drop trigger if exists driver_profiles_validate on public.driver_profiles;
create trigger driver_profiles_validate before insert or update on public.driver_profiles for each row execute function public.validate_driver_status();

create or replace function public.is_active_driver(_uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_uid,'driver') and exists(select 1 from public.driver_profiles where user_id=_uid and is_active)
    and coalesce((select (features->>'delivery_tracking')::boolean from public.store_settings where id=1), false)
$$;
revoke execute on function public.is_active_driver(uuid) from anon, public;
grant execute on function public.is_active_driver(uuid) to authenticated;

create or replace function public.driver_accept_order(_order_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_driver(auth.uid()) then raise exception 'forbidden'; end if;
  update public.orders set driver_accepted_at = now()
   where id = _order_id and driver_id = auth.uid() and status in ('confirmed','preparing') and driver_accepted_at is null;
  if not found then raise exception 'cannot_accept'; end if;
end $$;

create or replace function public.driver_set_status(_order_id uuid, _status text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_driver(auth.uid()) then raise exception 'forbidden'; end if;
  if _status = 'out_for_delivery' then
    update public.orders set status = 'out_for_delivery', driver_accepted_at = coalesce(driver_accepted_at, now())
     where id = _order_id and driver_id = auth.uid() and status in ('confirmed','preparing');
  elsif _status = 'delivered' then
    update public.orders set status = 'delivered', payment_status = case when payment_method='cod' then 'paid' else payment_status end
     where id = _order_id and driver_id = auth.uid() and status = 'out_for_delivery';
  else raise exception 'invalid_status'; end if;
  if not found then raise exception 'invalid_transition'; end if;
end $$;

create or replace function public.driver_order_customers() returns table(order_id uuid, full_name text, phone text) language sql stable security definer set search_path = public as $$
  select o.id, p.full_name, p.phone from public.orders o left join public.profiles p on p.id = o.user_id
  where o.driver_id = auth.uid() and public.has_role(auth.uid(),'driver')
$$;
revoke execute on function public.driver_order_customers() from anon, public;
grant execute on function public.driver_order_customers() to authenticated;

drop policy if exists "driver writes own location" on public.driver_locations;
create policy "driver writes own location" on public.driver_locations for insert to authenticated
with check (driver_id = auth.uid() and public.is_active_driver(auth.uid()) and exists (select 1 from public.orders o where o.id = order_id and o.driver_id = auth.uid() and o.status = 'out_for_delivery'));