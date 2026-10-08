-- Admin dashboard alert: orders that need a driver and are not getting one.
--   reason 'no_driver'  dispatch found no available driver (dispatch_status = no_driver_available)
--   reason 'waiting'    still without a driver longer than store_settings.dispatch_alert_after_minutes
--                       since the order entered its current status (confirmed/preparing)
-- Staff only; returns nothing for anyone else.

create index if not exists orders_unassigned_idx on public.orders(created_at)
  where driver_id is null and status in ('confirmed','preparing');

create or replace function public.admin_dispatch_alerts()
returns table(order_id uuid, order_number bigint, status text, dispatch_status text,
              waiting_since timestamptz, waited_minutes integer, reason text)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_number, o.status, o.dispatch_status, w.since,
         floor(extract(epoch from now() - w.since) / 60)::integer,
         case when o.dispatch_status = 'no_driver_available' then 'no_driver' else 'waiting' end
    from public.orders o
    cross join (select dispatch_alert_after_minutes as m from public.store_settings where id = 1) s
    cross join lateral (
      select coalesce(max(h.created_at), o.created_at) as since
        from public.order_status_history h
       where h.order_id = o.id and h.status = o.status) w
   where public.is_staff(auth.uid())
     and o.driver_id is null
     and o.status in ('confirmed','preparing')
     and (o.dispatch_status = 'no_driver_available' or w.since < now() - make_interval(mins => s.m))
   order by w.since
   limit 50
$$;
revoke execute on function public.admin_dispatch_alerts() from public, anon;
grant execute on function public.admin_dispatch_alerts() to authenticated;
