-- Remove the template's demo/sample data and grocery leftovers; add catalog facets from real data.
--
-- Safe on a store that already has real data: only rows created by the Lovable seed migrations are matched
-- (exact demo SKUs, the fixed demo category ids, demo banner titles, the exact WELCOME10 definition), demo
-- categories are kept while real products still use them, and store_settings fields are reset only while they
-- still hold the demo values. Real users and roles are never touched. Demo data for local development now lives
-- in supabase/seed.sql (applied by `supabase start` / local resets only, never by `db push`).

-- 1. Demo catalogue -------------------------------------------------------------
create temp table _demo_products on commit drop as
  select id from public.products where sku in ('AH001', 'AH002', 'AH003', 'AH004', 'AH005', 'AH006', 'AH007', 'AH008', 'AH009', 'AH010', 'AH011', 'AH012', 'AH013', 'AH014', 'AH015', 'AH016', 'AH017', 'AH018', 'AH019', 'AH020', 'AH021', 'AH022', 'AH023', 'AH024', 'AH025', 'AH026', 'AH027', 'AH028', 'AH029', 'AH030', 'AH031', 'AH032', 'AH033', 'AH034', 'AH035', 'AH036', 'AH037', 'AH038', 'AH039', 'AH040', 'AH041', 'AH042', 'AH043', 'AH044', 'AH045', 'AH046', 'AH047', 'AH048', 'AH049', 'AH050', 'AH051', 'AH052', 'AH053', 'AH054');

-- Orders made only of demo products are demo orders (test purchases of the sample catalogue).
delete from public.orders o
 where exists (select 1 from public.order_items oi where oi.order_id = o.id)
   and not exists (
     select 1 from public.order_items oi
      where oi.order_id = o.id and (oi.product_id is null or oi.product_id not in (select id from _demo_products)));

delete from public.products where id in (select id from _demo_products); -- variants, reviews, wishlist cascade

-- Demo categories (fixed ids from the seed), leaves first, only while no products or child categories use them.
create temp table _demo_categories on commit drop as
  select unnest(array[
    'a277259a-ec31-54fb-bada-cca3b5d78ceb',
    '3b35b1f0-f0b2-52b1-9859-219a86c2e469',
    '249c4f5d-24bc-526b-a70c-5b5f27b056ee',
    '80ae2630-6634-5e28-bd9e-82995e628072',
    '1f07c3d3-8921-594a-960f-3c00f2323073',
    '855c8918-8721-51ab-be97-09b00f50f361',
    'e9d25b38-7e62-5d36-bb8e-cb6f212f9416',
    'c2f13de9-250f-5d38-ac58-e7d24181eba0',
    'ed09e5a6-749a-5def-90f1-3c16b90e3e94',
    '0953fdf3-ef8b-5881-8dd8-071186b56810',
    '273baa25-e830-5f84-87c1-c852a416a892',
    '252974b1-b641-5666-8877-e56c6c65213c',
    'a038a640-a365-5011-a1fc-3c01e12c8113',
    '585ba6b8-741a-5867-a9dd-41a97f3f04c6',
    'bfa3823d-a7f8-5fdc-b47b-659b1d556785',
    '1ee423e2-3134-5d82-8883-9c373620b691',
    '31a9727d-59e5-5d54-8a81-ca69a89d1768',
    '9f742d93-bcdc-5fdc-8921-3d0e25111606',
    '9e1b8518-5df2-51f3-9cf9-1f337d8878ab',
    '0e6e2c4e-2df5-5215-8531-7c2ef764c4a7',
    '0804d180-79a8-528d-ae45-e8f032e975c7',
    '7cf3ce88-9d72-53da-927f-2e13221a1acf',
    '644301e3-af51-5aad-90bc-9b67873d86d6',
    '6cbfea30-7cd2-5390-b30b-07d2ce138402',
    'f92c33fe-fa44-5dcd-afa3-6435c8deb0b4',
    '3d6b6055-f692-5d8e-a2a3-49d4951c2269',
    'fcbfe201-315b-5a1b-b4ce-d0d3018a7929',
    'a4b0e768-40cb-57d4-bbef-e671c686e6e2',
    'eb33cbc0-f711-5f02-a640-d655b73be772',
    '7c8e9489-3e08-554c-a10c-61d6c1162e86',
    '931393f1-f194-5733-8323-6c1a56f80516',
    '2b154eaa-8ece-54dd-87cc-f8623a45647e',
    'ef20f301-a958-5bf5-a564-aea1ff099e98',
    '533a259d-8bdf-5962-a841-df5b96f7483e',
    '3fbb3893-fb7a-5032-bb4d-f20d0639c446',
    'b9b87a06-eb54-5210-8dac-9e64e5259be0',
    'a6ae68bb-1c2c-5239-90ea-b43ea5ba7086',
    '0eda13cf-3feb-54c4-b3f5-6a9644b63c7e',
    '0e02e862-9707-552a-bc62-61ead8fbb7f5',
    '04e04752-9d12-5477-b31a-5163bc1a29c3',
    '736a95ca-d315-564a-8e99-9c7189ccde43',
    '2d6c1d01-de48-5beb-8695-8906acc2f8ab',
    'dcce8c5c-1bc0-5033-a5e8-24b57fb0c6a8',
    '3df25b03-7107-5034-871e-ed12656c6a6c',
    '58f4f4e8-24fa-535c-b16e-82fa7e07e1a2',
    'fbf12667-7e5e-5a26-b729-4afe86f8d39a',
    '92c2a814-c15a-5d93-a68b-c18cb4b5c7ad'
  ]::uuid[]) as id;
do $$
begin
  for i in 1..4 loop
    delete from public.categories c
     where c.id in (select id from _demo_categories)
       and not exists (select 1 from public.products p where p.category_id = c.id)
       and not exists (select 1 from public.categories ch where ch.parent_id = c.id);
  end loop;
end $$;

delete from public.banners
 where title_en in ('New season collection', 'Luxury abayas & perfumes', 'Weekly Deals', 'Delivered to your door');

delete from public.coupons
 where code = 'WELCOME10' and discount_type = 'percent' and value = 10 and min_order = 150 and max_discount = 50;

delete from public.branches
 where name_en = 'Main Branch' and address_en = 'Republic St.' and phone = '+201000000000';

-- 2. Neutral store settings where the demo values are still in place ---------------
update public.store_settings set
  name_ar = case when name_ar in ('أبو حامد', 'سوق الحي') then 'متجري' else name_ar end,
  name_en = case when name_en in ('Abu Hamed', 'Neighborhood Market') then 'My Store' else name_en end,
  tagline_ar = case when tagline_ar in ('مول الأزياء والموضة لكل العيلة', 'كل احتياجات بيتك توصلك لحد الباب') then null else tagline_ar end,
  tagline_en = case when tagline_en in ('Fashion mall for the whole family', 'Everything your home needs, delivered') then null else tagline_en end,
  primary_color = case when lower(primary_color) in ('#1f2a44', '#0f8a5f') then '#111111' else primary_color end,
  secondary_color = case when lower(secondary_color) in ('#c8a24a', '#ffb020') then '#6b7280' else secondary_color end,
  contact_phone = case when contact_phone = '+201000000000' then null else contact_phone end,
  whatsapp_number = case when whatsapp_number = '201000000000' then null else whatsapp_number end,
  delivery_fee = case when delivery_fee = 25 and free_delivery_threshold = 500 and min_order_amount = 100 then 0 else delivery_fee end,
  free_delivery_threshold = case when delivery_fee = 25 and free_delivery_threshold = 500 and min_order_amount = 100 then null else free_delivery_threshold end,
  min_order_amount = case when delivery_fee = 25 and free_delivery_threshold = 500 and min_order_amount = 100 then 0 else min_order_amount end
where id = 1;

alter table public.store_settings
  alter column primary_color set default '#111111',
  alter column secondary_color set default '#6b7280';

-- 3. Grocery leftover: order_items.unit (every line is a piece) --------------------
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
      image_url, unit_price, quantity, line_total, notes)
    values (oid, p.id, v.id, p.name_ar, p.name_en, v.name_ar, v.name_en, v.size, v.color_ar, v.color_en, v.color_hex,
      p.images[1], price, it.qty, round(price * it.qty, 2), it.notes);
    update public.products set sold_count = sold_count + it.qty where id = p.id;
  end loop;
  return oid;
end $$;
revoke execute on function public.place_order(jsonb, uuid, text, text, text, text) from public, anon;

alter table public.order_items drop column if exists unit;

-- 4. Catalog facets: which sizes, colours, brands... actually exist on active products ---------------
-- Security invoker, so RLS decides what the caller can see (anon: active products only).
create or replace function public.catalog_facets(_category_ids uuid[] default null)
returns jsonb language sql stable set search_path = public as $$
  with p as (
    select id, brand, gender, season, concentration, volume_ml from public.products
     where is_active and (_category_ids is null or category_id = any(_category_ids))
  ), v as (
    select v.product_id, v.size, v.color_en, v.color_ar, v.color_hex
      from public.product_variants v join p on p.id = v.product_id where v.is_active
  )
  select jsonb_build_object(
    'sizes', coalesce((select jsonb_agg(jsonb_build_object('value', size, 'count', n)) from
      (select size, count(distinct product_id)::int n from v where size is not null group by size) s), '[]'::jsonb),
    'colors', coalesce((select jsonb_agg(jsonb_build_object('en', color_en, 'ar', color_ar, 'hex', color_hex, 'count', n) order by n desc, color_en) from
      (select color_en, max(color_ar) color_ar, max(color_hex) color_hex, count(distinct product_id)::int n from v where color_en is not null group by color_en) c), '[]'::jsonb),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('value', brand, 'count', n) order by brand) from
      (select brand, count(*)::int n from p where brand is not null and brand <> '' group by brand) b), '[]'::jsonb),
    'genders', coalesce((select jsonb_agg(jsonb_build_object('value', gender, 'count', n)) from
      (select gender, count(*)::int n from p where gender is not null group by gender) g), '[]'::jsonb),
    'seasons', coalesce((select jsonb_agg(jsonb_build_object('value', season, 'count', n)) from
      (select season, count(*)::int n from p where season is not null group by season) s), '[]'::jsonb),
    'concentrations', coalesce((select jsonb_agg(jsonb_build_object('value', concentration, 'count', n)) from
      (select concentration, count(*)::int n from p where concentration is not null group by concentration) c), '[]'::jsonb),
    'volumes', coalesce((select jsonb_agg(jsonb_build_object('value', volume_ml, 'count', n) order by volume_ml) from
      (select volume_ml, count(*)::int n from p where volume_ml is not null group by volume_ml) vm), '[]'::jsonb)
  )
$$;
grant execute on function public.catalog_facets(uuid[]) to anon, authenticated;
