-- Migration A: order data integrity
--  * stock can never go negative; checkout locks rows and decrements atomically (no overselling)
--  * coupon usage is counted under a row lock, with an optional per-customer limit
--  * order status follows the flow; totals/identity of an order are immutable
--  * cancelling an order restores stock and coupon usage
--  * place_order validates line count, quantities, delivery slot and notes length

-- 1. Stock is never negative ------------------------------------------------
update public.product_variants set stock = 0 where stock < 0;
update public.products set stock = 0 where stock < 0;
alter table public.products add constraint products_stock_nonneg check (stock >= 0);
alter table public.product_variants add constraint product_variants_stock_nonneg check (stock >= 0);

-- 2. Coupons: case-insensitive unique code, per-user limit, redemption log ---
create unique index if not exists coupons_code_upper_key on public.coupons (upper(code));
alter table public.coupons add column if not exists per_user_limit integer
  check (per_user_limit is null or per_user_limit > 0);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index coupon_redemptions_coupon_user_idx on public.coupon_redemptions(coupon_id, user_id);
grant select on public.coupon_redemptions to authenticated;
grant all on public.coupon_redemptions to service_role;
alter table public.coupon_redemptions enable row level security;
-- Read-only for clients; rows are written only by place_order / the cancel trigger.
create policy "redemptions own or staff read" on public.coupon_redemptions for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

-- Backfill from existing, non-cancelled orders so limits and cancel-restores see history.
insert into public.coupon_redemptions (coupon_id, user_id, order_id, created_at)
select c.id, o.user_id, o.id, o.created_at
from public.orders o join public.coupons c on upper(c.code) = upper(o.coupon_code)
where o.coupon_code is not null and o.status <> 'cancelled'
on conflict (order_id) do nothing;

create or replace function public.validate_coupon(_code text, _subtotal numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.coupons; d numeric; used int;
begin
  select * into c from public.coupons where upper(code) = upper(trim(_code)) and is_active;
  if not found then return jsonb_build_object('valid', false, 'reason', 'not_found'); end if;
  if c.starts_at is not null and now() < c.starts_at then return jsonb_build_object('valid', false, 'reason', 'not_started'); end if;
  if c.ends_at is not null and now() > c.ends_at then return jsonb_build_object('valid', false, 'reason', 'expired'); end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then return jsonb_build_object('valid', false, 'reason', 'exhausted'); end if;
  if c.per_user_limit is not null and auth.uid() is not null then
    select count(*) into used from public.coupon_redemptions where coupon_id = c.id and user_id = auth.uid();
    if used >= c.per_user_limit then return jsonb_build_object('valid', false, 'reason', 'per_user_limit'); end if;
  end if;
  if _subtotal < c.min_order then return jsonb_build_object('valid', false, 'reason', 'min_order', 'min_order', c.min_order); end if;
  d := case when c.discount_type = 'percent' then round(_subtotal * c.value / 100, 2) else c.value end;
  if c.max_discount is not null then d := least(d, c.max_discount); end if;
  d := least(d, _subtotal);
  return jsonb_build_object('valid', true, 'code', c.code, 'discount', d);
end $$;

-- 3. place_order: validated input, merged lines, row locks, guarded decrements
create or replace function public.place_order(_items jsonb, _address_id uuid, _delivery_slot text, _payment_method text, _coupon text, _notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.store_settings; addr public.addresses; c public.coupons;
  it record; p public.products; v public.product_variants;
  price numeric; base numeric; sub numeric := 0; fee numeric; disc numeric := 0;
  cres jsonb; oid uuid; slot text;
  coupon_in text := nullif(upper(trim(coalesce(_coupon, ''))), '');
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then raise exception 'empty_cart'; end if;
  if jsonb_array_length(_items) > 50 then raise exception 'too_many_items'; end if;
  if exists (select 1 from jsonb_array_elements(_items) e
             where jsonb_typeof(e) <> 'object' or coalesce(e->>'product_id', '') = ''
                or case when coalesce(e->>'quantity', '') ~ '^[0-9]{1,3}$'
                        then (e->>'quantity')::int not between 1 and 99 else true end) then
    raise exception 'invalid_quantity';
  end if;

  select * into s from public.store_settings where id = 1;
  select * into addr from public.addresses where id = _address_id and user_id = uid;
  if not found then raise exception 'invalid_address'; end if;
  if _payment_method is null or _payment_method not in ('cod','online') then raise exception 'invalid_payment'; end if;
  if _payment_method = 'online' and not coalesce((s.features->>'online_payment')::boolean, false) then raise exception 'payment_unavailable'; end if;
  slot := coalesce(nullif(trim(_delivery_slot), ''), 'asap');
  if slot <> 'asap' and not (coalesce(s.delivery_slots, '[]'::jsonb) ? slot) then raise exception 'invalid_slot'; end if;

  -- Pass 1: merge duplicate lines, lock rows in a fixed order (no deadlocks), price and check stock.
  for it in
    select (e->>'product_id')::uuid as product_id, nullif(e->>'variant_id', '')::uuid as variant_id,
           sum((e->>'quantity')::int)::int as qty
    from jsonb_array_elements(_items) e group by 1, 2 order by 1, 2 nulls first
  loop
    select * into p from public.products where id = it.product_id and is_active for update;
    if not found then raise exception 'product_unavailable'; end if;
    base := case when p.flash_price is not null and p.flash_ends_at > now() then p.flash_price else p.price end;
    if it.variant_id is not null then
      select * into v from public.product_variants where id = it.variant_id and product_id = p.id and is_active for update;
      if not found then raise exception 'variant_unavailable'; end if;
      if v.stock < it.qty then raise exception 'out_of_stock'; end if;
      price := coalesce(v.price, base);
    else
      if exists (select 1 from public.product_variants where product_id = p.id and is_active) then raise exception 'variant_required'; end if;
      if p.stock < it.qty then raise exception 'out_of_stock'; end if;
      price := base;
    end if;
    sub := sub + round(price * it.qty, 2);
  end loop;

  if sub < s.min_order_amount then raise exception 'below_min_order'; end if;
  fee := case when s.free_delivery_threshold is not null and sub >= s.free_delivery_threshold then 0 else s.delivery_fee end;

  -- Coupon: lock the row so concurrent checkouts can't exceed max_uses / per_user_limit.
  if coupon_in is not null then
    select * into c from public.coupons where upper(code) = coupon_in and is_active for update;
    if not found then raise exception 'invalid_coupon: not_found'; end if;
    cres := public.validate_coupon(c.code, sub);
    if not (cres->>'valid')::boolean then raise exception 'invalid_coupon: %', cres->>'reason'; end if;
    disc := (cres->>'discount')::numeric;
    update public.coupons set used_count = used_count + 1 where id = c.id;
  end if;

  insert into public.orders(user_id, address, delivery_slot, payment_method, subtotal, delivery_fee, discount, total, coupon_code, notes)
  values (uid, to_jsonb(addr), slot, _payment_method, sub, fee, disc, sub + fee - disc, c.code,
          nullif(left(trim(coalesce(_notes, '')), 500), ''))
  returning id into oid;
  if c.id is not null then
    insert into public.coupon_redemptions(coupon_id, user_id, order_id) values (c.id, uid, oid);
  end if;

  -- Pass 2: guarded decrements (rows are already locked) and order lines.
  for it in
    select (e->>'product_id')::uuid as product_id, nullif(e->>'variant_id', '')::uuid as variant_id,
           sum((e->>'quantity')::int)::int as qty,
           left(string_agg(nullif(trim(e->>'notes'), ''), ' | '), 300) as notes
    from jsonb_array_elements(_items) e group by 1, 2 order by 1, 2 nulls first
  loop
    select * into p from public.products where id = it.product_id;
    base := case when p.flash_price is not null and p.flash_ends_at > now() then p.flash_price else p.price end;
    if it.variant_id is not null then
      update public.product_variants set stock = stock - it.qty
       where id = it.variant_id and stock >= it.qty returning * into v;
      if not found then raise exception 'out_of_stock'; end if;
      price := coalesce(v.price, base);
    else
      update public.products set stock = stock - it.qty where id = p.id and stock >= it.qty;
      if not found then raise exception 'out_of_stock'; end if;
      v := null;
      price := base;
    end if;
    insert into public.order_items(order_id, product_id, variant_id, name_ar, name_en, variant_name_ar, variant_name_en, size, color_ar, color_en, color_hex,
      image_url, unit, unit_price, quantity, line_total, notes)
    values (oid, p.id, v.id, p.name_ar, p.name_en, v.name_ar, v.name_en, v.size, v.color_ar, v.color_en, v.color_hex,
      p.images[1], 'piece', price, it.qty, round(price * it.qty, 2), it.notes);
    update public.products set sold_count = sold_count + it.qty where id = p.id;
  end loop;
  return oid;
end $$;
revoke execute on function public.place_order(jsonb, uuid, text, text, text, text) from public, anon;
grant execute on function public.place_order(jsonb, uuid, text, text, text, text) to authenticated;

-- 4. Orders: enforce the status flow and freeze money/identity fields -------
create or replace function public.guard_order_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id
     or new.subtotal is distinct from old.subtotal or new.delivery_fee is distinct from old.delivery_fee
     or new.discount is distinct from old.discount or new.total is distinct from old.total
     or new.coupon_code is distinct from old.coupon_code or new.payment_method is distinct from old.payment_method
     or new.address is distinct from old.address or new.created_at is distinct from old.created_at then
    raise exception 'immutable_field';
  end if;
  -- pending -> confirmed -> preparing -> out_for_delivery -> delivered; cancel from any non-final status.
  -- confirmed -> out_for_delivery is allowed because driver_set_status already does it.
  if new.status is distinct from old.status and not (
       (old.status = 'pending'          and new.status in ('confirmed','cancelled')) or
       (old.status = 'confirmed'        and new.status in ('preparing','out_for_delivery','cancelled')) or
       (old.status = 'preparing'        and new.status in ('out_for_delivery','cancelled')) or
       (old.status = 'out_for_delivery' and new.status in ('delivered','cancelled'))) then
    raise exception 'invalid_transition';
  end if;
  return new;
end $$;
drop trigger if exists orders_guard on public.orders;
create trigger orders_guard before update on public.orders
  for each row execute function public.guard_order_update();

-- 5. Cancelling restores stock, sold_count and coupon usage -----------------
create or replace function public.restock_cancelled_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare i record; r record;
begin
  for i in select product_id, variant_id, quantity::int as qty from public.order_items
           where order_id = new.id order by product_id, variant_id loop
    if i.variant_id is not null then
      update public.product_variants set stock = stock + i.qty where id = i.variant_id;
    elsif i.product_id is not null
          and not exists (select 1 from public.product_variants where product_id = i.product_id) then
      update public.products set stock = stock + i.qty where id = i.product_id;
    end if;
    if i.product_id is not null then
      update public.products set sold_count = greatest(0, sold_count - i.qty) where id = i.product_id;
    end if;
  end loop;
  for r in delete from public.coupon_redemptions where order_id = new.id returning coupon_id loop
    update public.coupons set used_count = greatest(0, used_count - 1) where id = r.coupon_id;
  end loop;
  return null;
end $$;
revoke execute on function public.restock_cancelled_order() from public, anon, authenticated;
drop trigger if exists orders_restock_on_cancel on public.orders;
create trigger orders_restock_on_cancel after update of status on public.orders
  for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.restock_cancelled_order();
