alter table public.categories add column if not exists size_type text not null default 'none'
  check (size_type in ('clothes','shoes','kids','none'));

alter table public.products
  add column if not exists size_type text check (size_type in ('clothes','shoes','kids','none')),
  add column if not exists material_ar text,
  add column if not exists material_en text,
  add column if not exists gender text check (gender in ('men','women','kids','unisex')),
  add column if not exists season text check (season in ('summer','winter','all')),
  add column if not exists care_ar text,
  add column if not exists care_en text,
  add column if not exists top_notes text,
  add column if not exists middle_notes text,
  add column if not exists base_notes text,
  add column if not exists volume_ml integer check (volume_ml is null or volume_ml > 0),
  add column if not exists concentration text check (concentration in ('EDP','EDT','Parfum'));
alter table public.products drop column if exists unit, drop column if exists step, drop column if exists min_qty;
alter table public.products alter column stock type integer using greatest(floor(stock),0)::int;
create index if not exists products_gender_idx on public.products(gender);

alter table public.product_variants
  add column if not exists size text,
  add column if not exists color_ar text,
  add column if not exists color_en text,
  add column if not exists color_hex text,
  add column if not exists sku text;
alter table public.product_variants alter column price drop not null;
alter table public.product_variants alter column stock type integer using greatest(floor(stock),0)::int;
create unique index if not exists product_variants_sku_key on public.product_variants(sku) where sku is not null;
create index if not exists product_variants_product_idx on public.product_variants(product_id);

alter table public.order_items
  add column if not exists size text,
  add column if not exists color_ar text,
  add column if not exists color_en text,
  add column if not exists color_hex text;
alter table public.order_items alter column unit set default 'piece';

alter table public.store_settings add column if not exists return_window_days integer not null default 14
  check (return_window_days >= 0);

create or replace function public.sync_product_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products set stock = coalesce((select sum(stock) from public.product_variants where product_id = pid and is_active), 0)
   where id = pid and exists (select 1 from public.product_variants where product_id = pid);
  return null;
end $$;
revoke execute on function public.sync_product_stock() from public, anon, authenticated;
drop trigger if exists variants_sync_stock on public.product_variants;
create trigger variants_sync_stock after insert or update or delete on public.product_variants
  for each row execute function public.sync_product_stock();

create table public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('return','exchange')),
  reason text not null,
  details text,
  exchange_preference text,
  status text not null default 'requested' check (status in ('requested','approved','rejected','received','refunded','exchanged')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.return_requests to authenticated;
grant all on public.return_requests to service_role;
alter table public.return_requests enable row level security;
create policy "Customers read own return requests" on public.return_requests for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));
create policy "Staff update return requests" on public.return_requests for update to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create index return_requests_order_idx on public.return_requests(order_id);
create trigger return_requests_touch before update on public.return_requests for each row execute function public.touch_updated_at();

create or replace function public.request_return(_order_id uuid, _order_item_id uuid, _kind text, _reason text, _details text, _exchange_preference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; delivered_at timestamptz; days int; rid uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if _kind not in ('return','exchange') then raise exception 'invalid_kind'; end if;
  if coalesce(length(trim(_reason)),0) = 0 then raise exception 'reason_required'; end if;
  select * into o from public.orders where id = _order_id and user_id = auth.uid();
  if not found or o.status <> 'delivered' then raise exception 'not_returnable'; end if;
  if _order_item_id is not null and not exists (select 1 from public.order_items where id = _order_item_id and order_id = _order_id) then
    raise exception 'invalid_item'; end if;
  select coalesce(max(created_at), o.updated_at) into delivered_at from public.order_status_history where order_id = _order_id and status = 'delivered';
  select return_window_days into days from public.store_settings where id = 1;
  if now() > delivered_at + make_interval(days => coalesce(days, 0)) then raise exception 'return_window_closed'; end if;
  if exists (select 1 from public.return_requests where order_id = _order_id and order_item_id is not distinct from _order_item_id
             and status in ('requested','approved','received')) then raise exception 'already_requested'; end if;
  insert into public.return_requests(order_id, order_item_id, user_id, kind, reason, details, exchange_preference)
  values (_order_id, _order_item_id, auth.uid(), _kind, left(trim(_reason), 200), left(_details, 1000), left(_exchange_preference, 200))
  returning id into rid;
  return rid;
end $$;
revoke execute on function public.request_return(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.request_return(uuid, uuid, text, text, text, text) to authenticated;

create or replace function public.place_order(_items jsonb, _address_id uuid, _delivery_slot text, _payment_method text, _coupon text, _notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.store_settings; addr public.addresses;
  it jsonb; p public.products; v public.product_variants;
  qty numeric; price numeric; base numeric; sub numeric := 0; fee numeric; disc numeric := 0;
  cres jsonb; oid uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if _items is null or jsonb_array_length(_items) = 0 then raise exception 'empty_cart'; end if;
  select * into s from public.store_settings where id = 1;
  select * into addr from public.addresses where id = _address_id and user_id = uid;
  if not found then raise exception 'invalid_address'; end if;
  if _payment_method not in ('cod','online') then raise exception 'invalid_payment'; end if;
  if _payment_method = 'online' and not coalesce((s.features->>'online_payment')::boolean, false) then raise exception 'payment_unavailable'; end if;

  for it in select * from jsonb_array_elements(_items) loop
    select * into p from public.products where id = (it->>'product_id')::uuid and is_active;
    if not found then raise exception 'product_unavailable'; end if;
    qty := (it->>'quantity')::numeric;
    if qty is null or qty <= 0 or qty <> floor(qty) then raise exception 'invalid_quantity'; end if;
    base := case when p.flash_price is not null and p.flash_ends_at > now() then p.flash_price else p.price end;
    if it->>'variant_id' is not null then
      select * into v from public.product_variants where id = (it->>'variant_id')::uuid and product_id = p.id and is_active;
      if not found then raise exception 'variant_unavailable'; end if;
      price := coalesce(v.price, base);
      if v.stock < qty then raise exception 'out_of_stock'; end if;
    else
      if exists (select 1 from public.product_variants where product_id = p.id and is_active) then raise exception 'variant_required'; end if;
      price := base;
      if p.stock < qty then raise exception 'out_of_stock'; end if;
    end if;
    sub := sub + round(price * qty, 2);
  end loop;

  if sub < s.min_order_amount then raise exception 'below_min_order'; end if;
  fee := case when s.free_delivery_threshold is not null and sub >= s.free_delivery_threshold then 0 else s.delivery_fee end;
  if _coupon is not null and length(trim(_coupon)) > 0 then
    cres := public.validate_coupon(_coupon, sub);
    if not (cres->>'valid')::boolean then raise exception 'invalid_coupon'; end if;
    disc := (cres->>'discount')::numeric;
    update public.coupons set used_count = used_count + 1 where upper(code) = upper(trim(_coupon));
  end if;

  insert into public.orders(user_id, address, delivery_slot, payment_method, subtotal, delivery_fee, discount, total, coupon_code, notes)
  values (uid, to_jsonb(addr), coalesce(nullif(_delivery_slot,''),'asap'), _payment_method, sub, fee, disc, sub + fee - disc, nullif(trim(coalesce(_coupon,'')),''), _notes)
  returning id into oid;

  for it in select * from jsonb_array_elements(_items) loop
    select * into p from public.products where id = (it->>'product_id')::uuid;
    qty := (it->>'quantity')::numeric;
    base := case when p.flash_price is not null and p.flash_ends_at > now() then p.flash_price else p.price end;
    v := null;
    if it->>'variant_id' is not null then
      select * into v from public.product_variants where id = (it->>'variant_id')::uuid;
      price := coalesce(v.price, base);
      update public.product_variants set stock = stock - qty::int where id = v.id;
    else
      price := base;
      update public.products set stock = stock - qty::int where id = p.id;
    end if;
    insert into public.order_items(order_id, product_id, variant_id, name_ar, name_en, variant_name_ar, variant_name_en, size, color_ar, color_en, color_hex,
      image_url, unit, unit_price, quantity, line_total, notes)
    values (oid, p.id, v.id, p.name_ar, p.name_en, v.name_ar, v.name_en, v.size, v.color_ar, v.color_en, v.color_hex,
      p.images[1], 'piece', price, qty, round(price*qty,2), left(it->>'notes', 300));
    update public.products set sold_count = sold_count + qty::int where id = p.id;
  end loop;
  return oid;
end $$;

delete from public.product_variants where product_id is not null;
delete from public.products where id is not null;
delete from public.categories where id is not null;
delete from public.banners where id is not null;

insert into public.categories (id,parent_id,name_ar,name_en,image_url,sort_order,size_type) values
('a277259a-ec31-54fb-bada-cca3b5d78ceb',null,'ملابس رجالي','Men''s clothing','/__l5e/assets-v1/8e4e48b7-b801-4d08-85aa-84513a7ed31a/ah-men.jpg',0,'clothes'),
('3b35b1f0-f0b2-52b1-9859-219a86c2e469','a277259a-ec31-54fb-bada-cca3b5d78ceb','تيشيرتات','T-shirts',null,0,'clothes'),
('249c4f5d-24bc-526b-a70c-5b5f27b056ee','a277259a-ec31-54fb-bada-cca3b5d78ceb','قمصان','Shirts',null,1,'clothes'),
('80ae2630-6634-5e28-bd9e-82995e628072','a277259a-ec31-54fb-bada-cca3b5d78ceb','بناطيل','Trousers',null,2,'clothes'),
('1f07c3d3-8921-594a-960f-3c00f2323073','a277259a-ec31-54fb-bada-cca3b5d78ceb','جاكيتات','Jackets',null,3,'clothes'),
('855c8918-8721-51ab-be97-09b00f50f361','a277259a-ec31-54fb-bada-cca3b5d78ceb','ملابس داخلية','Underwear',null,4,'clothes'),
('e9d25b38-7e62-5d36-bb8e-cb6f212f9416','a277259a-ec31-54fb-bada-cca3b5d78ceb','بدل','Suits',null,5,'clothes'),
('c2f13de9-250f-5d38-ac58-e7d24181eba0',null,'ملابس حريمي','Women''s clothing','/__l5e/assets-v1/5cb54b9f-0497-4ca3-9789-8fb6b42bcd46/ah-women.jpg',1,'clothes'),
('ed09e5a6-749a-5def-90f1-3c16b90e3e94','c2f13de9-250f-5d38-ac58-e7d24181eba0','فساتين','Dresses',null,0,'clothes'),
('0953fdf3-ef8b-5881-8dd8-071186b56810','c2f13de9-250f-5d38-ac58-e7d24181eba0','بلوزات','Blouses',null,1,'clothes'),
('273baa25-e830-5f84-87c1-c852a416a892','c2f13de9-250f-5d38-ac58-e7d24181eba0','بناطيل','Trousers',null,2,'clothes'),
('252974b1-b641-5666-8877-e56c6c65213c','c2f13de9-250f-5d38-ac58-e7d24181eba0','جيبات','Skirts',null,3,'clothes'),
('a038a640-a365-5011-a1fc-3c01e12c8113','c2f13de9-250f-5d38-ac58-e7d24181eba0','ملابس منزلية','Homewear',null,4,'clothes'),
('585ba6b8-741a-5867-a9dd-41a97f3f04c6','c2f13de9-250f-5d38-ac58-e7d24181eba0','حجاب وإيشاربات','Hijabs & scarves',null,5,'clothes'),
('bfa3823d-a7f8-5fdc-b47b-659b1d556785',null,'ملابس أطفال','Kids'' clothing','/__l5e/assets-v1/6ab388f5-5f8d-4572-b90f-3080b0739187/ah-kids.jpg',2,'kids'),
('1ee423e2-3134-5d82-8883-9c373620b691','bfa3823d-a7f8-5fdc-b47b-659b1d556785','ولادي','Boys',null,0,'kids'),
('31a9727d-59e5-5d54-8a81-ca69a89d1768','bfa3823d-a7f8-5fdc-b47b-659b1d556785','بناتي','Girls',null,1,'kids'),
('9f742d93-bcdc-5fdc-8921-3d0e25111606','bfa3823d-a7f8-5fdc-b47b-659b1d556785','رضع','Babies',null,2,'kids'),
('9e1b8518-5df2-51f3-9cf9-1f337d8878ab','bfa3823d-a7f8-5fdc-b47b-659b1d556785','مدرسي','School',null,3,'kids'),
('0e6e2c4e-2df5-5215-8531-7c2ef764c4a7',null,'أحذية','Shoes','/__l5e/assets-v1/7820cc72-3be9-49f5-b677-059a05160255/ah-shoes.jpg',3,'shoes'),
('0804d180-79a8-528d-ae45-e8f032e975c7','0e6e2c4e-2df5-5215-8531-7c2ef764c4a7','رجالي','Men',null,0,'shoes'),
('7cf3ce88-9d72-53da-927f-2e13221a1acf','0e6e2c4e-2df5-5215-8531-7c2ef764c4a7','حريمي','Women',null,1,'shoes'),
('644301e3-af51-5aad-90bc-9b67873d86d6','0e6e2c4e-2df5-5215-8531-7c2ef764c4a7','أطفال','Kids',null,2,'shoes'),
('6cbfea30-7cd2-5390-b30b-07d2ce138402',null,'كوتشيهات','Sneakers','/__l5e/assets-v1/144e6561-49ca-4541-9d51-a29ca8f5f0ff/ah-sneakers.jpg',4,'shoes'),
('f92c33fe-fa44-5dcd-afa3-6435c8deb0b4',null,'شباشب','Slippers','/__l5e/assets-v1/578000cc-a224-4de4-8c83-a5cd03123724/ah-slippers.jpg',5,'shoes'),
('3d6b6055-f692-5d8e-a2a3-49d4951c2269',null,'جلابيب','Galabiyas','/__l5e/assets-v1/66f13a93-d10d-4e6a-8975-f7714624933e/ah-galabiya.jpg',6,'clothes'),
('fcbfe201-315b-5a1b-b4ce-d0d3018a7929','3d6b6055-f692-5d8e-a2a3-49d4951c2269','رجالي','Men',null,0,'clothes'),
('a4b0e768-40cb-57d4-bbef-e671c686e6e2','3d6b6055-f692-5d8e-a2a3-49d4951c2269','أطفال','Kids',null,1,'clothes'),
('eb33cbc0-f711-5f02-a640-d655b73be772','3d6b6055-f692-5d8e-a2a3-49d4951c2269','صيفي','Summer',null,2,'clothes'),
('7c8e9489-3e08-554c-a10c-61d6c1162e86','3d6b6055-f692-5d8e-a2a3-49d4951c2269','شتوي','Winter',null,3,'clothes'),
('931393f1-f194-5733-8323-6c1a56f80516',null,'عبايات','Abayas','/__l5e/assets-v1/dde59da9-35bc-43c5-ba90-3a1b58e71076/ah-abaya.jpg',7,'clothes'),
('2b154eaa-8ece-54dd-87cc-f8623a45647e','931393f1-f194-5733-8323-6c1a56f80516','سادة','Plain',null,0,'clothes'),
('ef20f301-a958-5bf5-a564-aea1ff099e98','931393f1-f194-5733-8323-6c1a56f80516','مطرزة','Embroidered',null,1,'clothes'),
('533a259d-8bdf-5962-a841-df5b96f7483e','931393f1-f194-5733-8323-6c1a56f80516','خليجي','Gulf style',null,2,'clothes'),
('3fbb3893-fb7a-5032-bb4d-f20d0639c446','931393f1-f194-5733-8323-6c1a56f80516','مصري','Egyptian style',null,3,'clothes'),
('b9b87a06-eb54-5210-8dac-9e64e5259be0',null,'العطور','Perfumes','/__l5e/assets-v1/d5b4de43-6a9f-48c0-b023-736494147dc3/ah-perfume.jpg',8,'none'),
('a6ae68bb-1c2c-5239-90ea-b43ea5ba7086','b9b87a06-eb54-5210-8dac-9e64e5259be0','رجالي','Men',null,0,'none'),
('0eda13cf-3feb-54c4-b3f5-6a9644b63c7e','b9b87a06-eb54-5210-8dac-9e64e5259be0','حريمي','Women',null,1,'none'),
('0e02e862-9707-552a-bc62-61ead8fbb7f5','b9b87a06-eb54-5210-8dac-9e64e5259be0','يونيسكس','Unisex',null,2,'none'),
('04e04752-9d12-5477-b31a-5163bc1a29c3','b9b87a06-eb54-5210-8dac-9e64e5259be0','بخور وعود','Incense & oud',null,3,'none'),
('736a95ca-d315-564a-8e99-9c7189ccde43',null,'الإكسسوارات','Accessories','/__l5e/assets-v1/d991d5c1-7876-48dc-8e6a-be68cadbcfca/ah-accessories.jpg',9,'none'),
('2d6c1d01-de48-5beb-8695-8906acc2f8ab','736a95ca-d315-564a-8e99-9c7189ccde43','ساعات','Watches',null,0,'none'),
('dcce8c5c-1bc0-5033-a5e8-24b57fb0c6a8','736a95ca-d315-564a-8e99-9c7189ccde43','حقائب','Bags',null,1,'none'),
('3df25b03-7107-5034-871e-ed12656c6a6c','736a95ca-d315-564a-8e99-9c7189ccde43','نظارات','Sunglasses',null,2,'none'),
('58f4f4e8-24fa-535c-b16e-82fa7e07e1a2','736a95ca-d315-564a-8e99-9c7189ccde43','محافظ','Wallets',null,3,'none'),
('fbf12667-7e5e-5a26-b729-4afe86f8d39a','736a95ca-d315-564a-8e99-9c7189ccde43','أحزمة','Belts',null,4,'none'),
('92c2a814-c15a-5d93-a68b-c18cb4b5c7ad','736a95ca-d315-564a-8e99-9c7189ccde43','مجوهرات','Jewelry',null,5,'none');

insert into public.products (category_id,name_ar,name_en,brand,sku,price,old_price,stock,is_featured,flash_price,flash_ends_at,sold_count,created_at,size_type,material_ar,gender,season,top_notes,middle_notes,base_notes,volume_ml,concentration) values
('3b35b1f0-f0b2-52b1-9859-219a86c2e469','تيشيرت قطن بياقة دائرية','Cotton crew-neck T-shirt','Abu Hamed Basics','AH001',249,320,33,true,199,now() + interval '5 days',170,now() - interval '9 days',null,'قطن 100%','men','summer',null,null,null,null,null),
('249c4f5d-24bc-526b-a70c-5b5f27b056ee','قميص أكسفورد كاجوال','Casual Oxford shirt','Concrete','AH002',499,null,12,false,null,null,338,now() - interval '3 days',null,'قطن أكسفورد','men','all',null,null,null,null,null),
('80ae2630-6634-5e28-bd9e-82995e628072','بنطلون جينز سليم','Slim-fit jeans','Andora','AH003',650,799,31,false,null,null,279,now() - interval '6 days',null,'دنيم قطن مع ليكرا','men','all',null,null,null,null,null),
('1f07c3d3-8921-594a-960f-3c00f2323073','جاكيت جلد صناعي','Faux leather jacket','Town Team','AH004',1450,1800,40,true,1160,now() + interval '5 days',303,now() - interval '3 days',null,'جلد صناعي مبطن','men','winter',null,null,null,null,null),
('855c8918-8721-51ab-be97-09b00f50f361','طقم فانلة وبوكسر قطن','Cotton undershirt & boxer set','Cottonil','AH005',185,null,13,false,null,null,114,now() - interval '2 days',null,'قطن مصري','men','all',null,null,null,null,null),
('e9d25b38-7e62-5d36-bb8e-cb6f212f9416','بدلة رجالي كلاسيك','Classic men''s suit','Diamond','AH006',3900,4500,12,false,null,null,227,now() - interval '26 days',null,'صوف مخلوط','men','winter',null,null,null,null,null),
('ed09e5a6-749a-5def-90f1-3c16b90e3e94','فستان سواريه طويل','Long evening dress','Lavish','AH007',1650,1990,35,true,1320,now() + interval '5 days',128,now() - interval '5 days',null,'شيفون مبطن','women','all',null,null,null,null,null),
('0953fdf3-ef8b-5881-8dd8-071186b56810','بلوزة ستان بكم طويل','Long-sleeve satin blouse','Defacto','AH008',420,null,15,false,null,null,35,now() - interval '36 days',null,'ستان','women','all',null,null,null,null,null),
('273baa25-e830-5f84-87c1-c852a416a892','بنطلون واسع قماش','Wide-leg trousers','LC Waikiki','AH009',480,560,11,false,null,null,119,now() - interval '40 days',null,'كريب','women','all',null,null,null,null,null),
('252974b1-b641-5666-8877-e56c6c65213c','جيبة بليسيه طويلة','Long pleated skirt','Defacto','AH010',390,null,33,false,null,null,300,now() - interval '37 days',null,'بوليستر','women','all',null,null,null,null,null),
('a038a640-a365-5011-a1fc-3c01e12c8113','بيجامة قطن حريمي','Women''s cotton pajamas','Cottonil','AH011',350,420,10,true,280,now() + interval '5 days',30,now() - interval '14 days',null,'قطن','women','summer',null,null,null,null,null),
('585ba6b8-741a-5867-a9dd-41a97f3f04c6','طرحة شيفون','Chiffon hijab','Abu Hamed','AH012',120,null,26,false,null,null,290,now() - interval '8 days','none','شيفون','women','all',null,null,null,null,null),
('1ee423e2-3134-5d82-8883-9c373620b691','طقم ولادي تيشيرت وشورت','Boys T-shirt & shorts set','Baby Jo','AH013',290,350,15,true,232,now() + interval '5 days',219,now() - interval '9 days',null,'قطن','kids','summer',null,null,null,null,null),
('31a9727d-59e5-5d54-8a81-ca69a89d1768','فستان بناتي مشجر','Girls floral dress','Baby Jo','AH014',340,null,19,true,null,null,297,now() - interval '19 days',null,'قطن','kids','summer',null,null,null,null,null),
('9f742d93-bcdc-5fdc-8921-3d0e25111606','أوفرول رضع قطن','Baby cotton romper','Mothercare','AH015',210,null,20,false,null,null,57,now() - interval '37 days',null,'قطن عضوي','kids','all',null,null,null,null,null),
('9e1b8518-5df2-51f3-9cf9-1f337d8878ab','قميص مدرسي أبيض','White school shirt','School Line','AH016',180,null,12,false,null,null,195,now() - interval '6 days',null,'قطن بوليستر','kids','all',null,null,null,null,null),
('1ee423e2-3134-5d82-8883-9c373620b691','جاكيت ولادي شتوي','Boys winter jacket','Baby Jo','AH017',590,690,21,false,null,null,293,now() - interval '3 days',null,'بوليستر مبطن','kids','winter',null,null,null,null,null),
('0804d180-79a8-528d-ae45-e8f032e975c7','حذاء أكسفورد جلد طبيعي','Leather Oxford shoes','Hamada Shoes','AH018',1250,1500,35,false,null,null,259,now() - interval '34 days',null,'جلد طبيعي','men','all',null,null,null,null,null),
('7cf3ce88-9d72-53da-927f-2e13221a1acf','حذاء حريمي بكعب','Women''s heeled pumps','Shoe Room','AH019',780,null,37,true,624,now() + interval '5 days',165,now() - interval '29 days',null,'جلد صناعي','women','all',null,null,null,null,null),
('644301e3-af51-5aad-90bc-9b67873d86d6','حذاء أطفال لاصق','Kids velcro shoes','Baby Jo','AH020',320,null,23,false,null,null,190,now() - interval '19 days',null,'جلد صناعي','kids','all',null,null,null,null,null),
('0804d180-79a8-528d-ae45-e8f032e975c7','حذاء موكاسان','Suede moccasins','Hamada Shoes','AH021',890,990,13,true,null,null,97,now() - interval '15 days',null,'شمواه','men','summer',null,null,null,null,null),
('7cf3ce88-9d72-53da-927f-2e13221a1acf','بوت حريمي شتوي','Women''s winter boots','Shoe Room','AH022',1150,1350,39,false,null,null,299,now() - interval '19 days',null,'جلد صناعي مبطن','women','winter',null,null,null,null,null),
('6cbfea30-7cd2-5390-b30b-07d2ce138402','كوتشي أبيض كلاسيك','Classic white sneakers','Activ','AH023',950,1100,26,true,760,now() + interval '5 days',180,now() - interval '28 days',null,'جلد صناعي','unisex','all',null,null,null,null,null),
('6cbfea30-7cd2-5390-b30b-07d2ce138402','كوتشي جري خفيف','Lightweight running shoes','Activ','AH024',1290,null,15,false,null,null,316,now() - interval '4 days',null,'شبك قابل للتهوية','men','all',null,null,null,null,null),
('6cbfea30-7cd2-5390-b30b-07d2ce138402','كوتشي حريمي مريح','Women''s comfort sneakers','Activ','AH025',880,990,18,false,null,null,267,now() - interval '26 days',null,'قماش','women','all',null,null,null,null,null),
('6cbfea30-7cd2-5390-b30b-07d2ce138402','كوتشي كانفاس','Canvas sneakers','Bata','AH026',450,null,17,false,null,null,392,now() - interval '21 days',null,'كانفاس','unisex','summer',null,null,null,null,null),
('6cbfea30-7cd2-5390-b30b-07d2ce138402','كوتشي سلب أون','Slip-on sneakers','Bata','AH027',520,620,10,false,null,null,255,now() - interval '26 days',null,'قماش مرن','unisex','all',null,null,null,null,null),
('f92c33fe-fa44-5dcd-afa3-6435c8deb0b4','شبشب منزلي فرو','Fur house slippers','Comfy','AH028',160,null,28,true,null,null,347,now() - interval '4 days',null,'فرو صناعي','unisex','winter',null,null,null,null,null),
('f92c33fe-fa44-5dcd-afa3-6435c8deb0b4','صندل رجالي بأستك','Men''s strap sandals','Bata','AH029',380,450,39,true,304,now() + interval '5 days',179,now() - interval '22 days',null,'نايلون ونعل مطاط','men','summer',null,null,null,null,null),
('f92c33fe-fa44-5dcd-afa3-6435c8deb0b4','شبشب بحر','Beach flip-flops','Comfy','AH030',95,null,12,false,null,null,301,now() - interval '29 days',null,'مطاط','unisex','summer',null,null,null,null,null),
('f92c33fe-fa44-5dcd-afa3-6435c8deb0b4','شبشب جلد طبيعي','Leather slides','Hamada Shoes','AH031',420,null,38,false,null,null,52,now() - interval '17 days',null,'جلد طبيعي','men','summer',null,null,null,null,null),
('f92c33fe-fa44-5dcd-afa3-6435c8deb0b4','شبشب حريمي مزين','Embellished women''s slides','Shoe Room','AH032',260,310,11,false,null,null,361,now() - interval '4 days',null,'جلد صناعي','women','summer',null,null,null,null,null),
('fcbfe201-315b-5a1b-b4ce-d0d3018a7929','جلابية رجالي قطن مقلمة','Striped cotton galabiya','El Gabaly','AH033',550,650,36,true,440,now() + interval '5 days',379,now() - interval '19 days',null,'قطن','men','summer',null,null,null,null,null),
('a4b0e768-40cb-57d4-bbef-e671c686e6e2','جلابية أطفال للعيد','Kids Eid galabiya','El Gabaly','AH034',280,null,30,false,null,null,150,now() - interval '24 days','kids','قطن','kids','all',null,null,null,null,null),
('eb33cbc0-f711-5f02-a640-d655b73be772','جلابية كتان صيفي','Linen summer galabiya','El Gabaly','AH035',620,null,30,true,null,null,16,now() - interval '29 days',null,'كتان','men','summer',null,null,null,null,null),
('7c8e9489-3e08-554c-a10c-61d6c1162e86','جلابية صوف شتوي','Wool winter galabiya','El Gabaly','AH036',890,990,15,false,null,null,91,now() - interval '39 days',null,'صوف','men','winter',null,null,null,null,null),
('fcbfe201-315b-5a1b-b4ce-d0d3018a7929','جلابية سعودي بياقة','Saudi-style collared thobe','Al Haramain Thobes','AH037',720,null,21,false,null,null,257,now() - interval '3 days',null,'بوليستر قطن','men','all',null,null,null,null,null),
('2b154eaa-8ece-54dd-87cc-f8623a45647e','عباية سادة كريب','Plain crepe abaya','Lamar','AH038',690,null,16,false,null,null,398,now() - interval '18 days',null,'كريب','women','all',null,null,null,null,null),
('ef20f301-a958-5bf5-a564-aea1ff099e98','عباية مطرزة يدوي','Hand-embroidered abaya','Lamar','AH039',1450,1750,33,true,1160,now() + interval '5 days',383,now() - interval '15 days',null,'كريب مطرز','women','all',null,null,null,null,null),
('533a259d-8bdf-5962-a841-df5b96f7483e','عباية خليجي مفتوحة','Open Gulf-style abaya','Dubai Line','AH040',1200,null,13,false,null,null,205,now() - interval '31 days',null,'نيدا','women','all',null,null,null,null,null),
('3fbb3893-fb7a-5032-bb4d-f20d0639c446','عباية مصري بكم واسع','Egyptian wide-sleeve abaya','Lamar','AH041',780,890,33,false,null,null,90,now() - interval '28 days',null,'كريب','women','all',null,null,null,null,null),
('ef20f301-a958-5bf5-a564-aea1ff099e98','عباية سواريه بالخرز','Beaded evening abaya','Dubai Line','AH042',1890,null,16,true,null,null,286,now() - interval '17 days',null,'شيفون مطرز','women','all',null,null,null,null,null),
('a6ae68bb-1c2c-5239-90ea-b43ea5ba7086','عطر عود ملكي','Royal Oud','Abu Hamed Parfums','AH043',950,1200,25,true,760,now() + interval '5 days',225,now() - interval '35 days','none',null,'men','all','برغموت، فلفل وردي','عود، ورد طائفي','عنبر، مسك، خشب الصندل',100,'EDP'),
('0eda13cf-3feb-54c4-b3f5-6a9644b63c7e','عطر زهور الياسمين','Jasmine Bloom','Abu Hamed Parfums','AH044',780,null,30,false,null,null,366,now() - interval '26 days','none',null,'women','all','كمثرى، ليمون','ياسمين، زنبق','فانيليا، مسك أبيض',75,'EDP'),
('0e02e862-9707-552a-bc62-61ead8fbb7f5','عطر عنبر نوار','Amber Noir','Arabian Oud','AH045',1100,null,22,false,null,null,354,now() - interval '24 days','none',null,'unisex','winter','زعفران','عنبر، لبان','باتشولي، جلد',100,'Parfum'),
('a6ae68bb-1c2c-5239-90ea-b43ea5ba7086','عطر فريش رياضي','Fresh Sport','Abu Hamed Parfums','AH046',520,620,19,false,null,null,82,now() - interval '5 days','none',null,'men','summer','نعناع، جريب فروت','لافندر','أرز، مسك',100,'EDT'),
('04e04752-9d12-5477-b31a-5163bc1a29c3','بخور معمول فاخر','Premium bakhoor','Arabian Oud','AH047',250,null,22,false,null,null,82,now() - interval '14 days','none',null,'unisex','all',null,null,null,null,null),
('0eda13cf-3feb-54c4-b3f5-6a9644b63c7e','عطر ورد الطائف','Taif Rose','Arabian Oud','AH048',890,990,19,false,null,null,11,now() - interval '31 days','none',null,'women','all','ورد، ليتشي','ورد طائفي، فاوانيا','عود ناعم، مسك',50,'Parfum'),
('2d6c1d01-de48-5beb-8695-8906acc2f8ab','ساعة كلاسيك جلد','Classic leather watch','Q&Q','AH049',1350,1600,8,true,1080,now() + interval '5 days',139,now() - interval '18 days','none','ستانلس ستيل وجلد','men','all',null,null,null,null,null),
('dcce8c5c-1bc0-5033-a5e8-24b57fb0c6a8','شنطة يد جلد','Leather handbag','Lamar Bags','AH050',1250,null,31,false,null,null,79,now() - interval '26 days','none','جلد صناعي فاخر','women','all',null,null,null,null,null),
('3df25b03-7107-5034-871e-ed12656c6a6c','نظارة شمس بولارايزد','Polarized sunglasses','Vision','AH051',450,550,28,false,null,null,317,now() - interval '36 days','none','إطار أسيتات','unisex','summer',null,null,null,null,null),
('58f4f4e8-24fa-535c-b16e-82fa7e07e1a2','محفظة رجالي جلد طبيعي','Genuine leather wallet','Hamada Leather','AH052',320,null,11,false,null,null,69,now() - interval '32 days','none','جلد طبيعي','men','all',null,null,null,null,null),
('fbf12667-7e5e-5a26-b729-4afe86f8d39a','حزام جلد بإبزيم','Leather belt','Hamada Leather','AH053',280,null,33,false,null,null,238,now() - interval '35 days','none','جلد طبيعي','men','all',null,null,null,null,null),
('92c2a814-c15a-5d93-a68b-c18cb4b5c7ad','سلسلة فضة بحرف','Silver initial necklace','Silver Line','AH054',390,450,33,false,null,null,208,now() - interval '25 days','none','فضة عيار 925','women','all',null,null,null,null,null);

with colors(en,ar,hex) as (values ('black','أسود','#111111'),('white','أبيض','#f5f5f5'),('navy','كحلي','#1f2a44'),('beige','بيج','#d8c3a5'),('gray','رمادي','#8a8a8a'),('red','أحمر','#b3261e'),('olive','زيتي','#6b7046'),('brown','بني','#6d4c41'),('pink','وردي','#e8a0b4'),('blue','أزرق','#2f6fb5'),('gold','ذهبي','#c8a24a')),
spec(sku,colors,sizes) as (values
('AH001',array['white','black','navy','olive']::text[],array['S','M','L','XL','XXL','XXXL']::text[]),
('AH002',array['blue','white']::text[],array['S','M','L','XL','XXL','XXXL']::text[]),
('AH003',array['navy','black']::text[],array['M','L','XL','XXL']::text[]),
('AH004',array['black','brown']::text[],array['M','L','XL','XXL']::text[]),
('AH005',array['white','gray']::text[],array['S','M','L','XL','XXL','XXXL']::text[]),
('AH006',array['navy','gray','black']::text[],array['M','L','XL','XXL']::text[]),
('AH007',array['navy','red','black']::text[],array['S','M','L','XL']::text[]),
('AH008',array['beige','white','pink']::text[],array['S','M','L','XL','XXL']::text[]),
('AH009',array['black','beige']::text[],array['S','M','L','XL','XXL','XXXL']::text[]),
('AH010',array['olive','navy','beige']::text[],array['S','M','L','XL']::text[]),
('AH011',array['pink','blue']::text[],array['S','M','L','XL','XXL','XXXL']::text[]),
('AH012',array['black','beige','navy','pink']::text[],array[]::text[]),
('AH013',array['blue','olive']::text[],array['2-3y','3-4y','4-5y','5-6y','6-7y']::text[]),
('AH014',array['pink','white']::text[],array['2-3y','3-4y','4-5y','5-6y','6-7y','7-8y']::text[]),
('AH015',array['white','blue','pink']::text[],array['0-3m','3-6m','6-12m','1-2y']::text[]),
('AH016',array['white','blue']::text[],array['6-7y','7-8y','8-10y','10-12y','12-14y']::text[]),
('AH017',array['navy','red']::text[],array['4-5y','5-6y','6-7y','7-8y','8-10y']::text[]),
('AH018',array['brown','black']::text[],array['40','41','42','43','44','45']::text[]),
('AH019',array['black','beige','red']::text[],array['36','37','38','39','40']::text[]),
('AH020',array['blue','pink']::text[],array['36','37','38']::text[]),
('AH021',array['brown','navy']::text[],array['40','41','42','43','44']::text[]),
('AH022',array['black','brown']::text[],array['37','38','39','40','41']::text[]),
('AH023',array['white','black']::text[],array['38','39','40','41','42','43','44']::text[]),
('AH024',array['gray','navy','black']::text[],array['40','41','42','43','44','45']::text[]),
('AH025',array['pink','white']::text[],array['36','37','38','39','40']::text[]),
('AH026',array['navy','red','white']::text[],array['38','39','40','41','42','43']::text[]),
('AH027',array['black','beige']::text[],array['39','40','41','42','43','44']::text[]),
('AH028',array['beige','gray','pink']::text[],array['37','38','39','40','41','42']::text[]),
('AH029',array['olive','black']::text[],array['40','41','42','43','44']::text[]),
('AH030',array['blue','red','black']::text[],array['38','39','40','41','42','43']::text[]),
('AH031',array['brown','black']::text[],array['40','41','42','43','44']::text[]),
('AH032',array['gold','black']::text[],array['36','37','38','39','40']::text[]),
('AH033',array['white','beige']::text[],array['L','XL','XXL','XXXL']::text[]),
('AH034',array['white','navy']::text[],array['1-2y','2-3y','3-4y','4-5y','5-6y','6-7y','7-8y','8-10y','10-12y','12-14y']::text[]),
('AH035',array['beige','white','blue']::text[],array['M','L','XL','XXL']::text[]),
('AH036',array['gray','brown','navy']::text[],array['L','XL','XXL','XXXL']::text[]),
('AH037',array['white']::text[],array['M','L','XL','XXL','XXXL']::text[]),
('AH038',array['black','navy']::text[],array['S','M','L','XL']::text[]),
('AH039',array['black']::text[],array['M','L','XL','XXL']::text[]),
('AH040',array['black','beige']::text[],array['S','M','L','XL']::text[]),
('AH041',array['black','brown']::text[],array['M','L','XL','XXL']::text[]),
('AH042',array['black','navy']::text[],array['S','M','L','XL']::text[]),
('AH049',array['brown','black']::text[],array[]::text[]),
('AH050',array['brown','black','beige']::text[],array[]::text[]),
('AH051',array['black','brown']::text[],array[]::text[]),
('AH052',array['brown','black']::text[],array[]::text[]),
('AH053',array['brown','black']::text[],array[]::text[]),
('AH054',array['gold','gray']::text[],array[]::text[])),
rows as (
  select p.id pid, p.sku, c.en, c.ar, c.hex, c.ord, s.sz, coalesce(s.ord,1) sord
  from spec x join public.products p on p.sku = x.sku
  cross join lateral (select cc.*, u.ord from unnest(x.colors) with ordinality u(en,ord) join colors cc on cc.en = u.en) c
  left join lateral unnest(case when cardinality(x.sizes)=0 then array[null::text] else x.sizes end) with ordinality s(sz,ord) on true
)
insert into public.product_variants (product_id,name_ar,name_en,size,color_ar,color_en,color_hex,sku,stock,sort_order)
select pid, concat_ws(' / ', sz, ar), concat_ws(' / ', sz, initcap(en)), sz, ar, initcap(en), hex,
  sku || '-' || upper(left(en,3)) || coalesce('-' || sz, ''),
  case when abs(hashtext(sku||en||coalesce(sz,''))) % 100 < 12 then 0
       when abs(hashtext(sku||en||coalesce(sz,''))) % 100 < 30 then 1 + abs(hashtext(en||sku)) % 3
       else 5 + abs(hashtext(coalesce(sz,'')||sku||en)) % 20 end,
  ord*100 + sord
from rows;

update public.products p set
  images = array[(select coalesce(c.image_url, pc.image_url) from public.categories c left join public.categories pc on pc.id = c.parent_id where c.id = p.category_id)],
  description_ar = p.name_ar || ' من ' || p.brand || coalesce('. خامة ' || p.material_ar, '') || '، تصميم عملي ومريح يناسب الاستخدام اليومي.',
  care_ar = case when p.material_ar is not null and p.volume_ml is null and p.gender is not null and p.size_type is distinct from 'none' then 'غسيل على 30 درجة، كي على حرارة متوسطة، لا يستخدم الكلور.' end;

insert into public.banners (image_url,title_ar,title_en,subtitle_ar,subtitle_en,link,sort_order) values
('/__l5e/assets-v1/dc0510dc-5a2a-4497-97c9-5f327a7ec261/ah-banner1.jpg','كوليكشن الموسم الجديد','New season collection','أحدث صيحات الموضة لكل العيلة','The latest styles for the whole family','/products',0),
('/__l5e/assets-v1/1414e9cb-edeb-421f-8638-837442ebfdfe/ah-banner2.jpg','عبايات وعطور فاخرة','Luxury abayas & perfumes','خصومات لحد 25%','Up to 25% off','/products',1);

update public.store_settings set name_ar='أبو حامد', name_en='Abu Hamed', tagline_ar='مول الأزياء والموضة لكل العيلة', tagline_en='Fashion mall for the whole family',
  currency_code='EGP', currency_symbol_ar='ج.م', currency_symbol_en='EGP', default_language='ar', primary_color='#1f2a44', secondary_color='#c8a24a' where id = 1;