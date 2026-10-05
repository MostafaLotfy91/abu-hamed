create type public.app_role as enum ('admin','staff','driver','customer');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role in ('admin','staff'))
$$;

create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()));
create policy "admins manage roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.claim_first_admin()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if exists(select 1 from public.user_roles where role='admin') then return false; end if;
  insert into public.user_roles(user_id, role) values (auth.uid(),'admin') on conflict do nothing;
  return true;
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, phone text, email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profile self read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "profile self insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profile self update" on public.profiles for update to authenticated using (id = auth.uid());
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create table public.store_settings (
  id int primary key default 1 check (id = 1),
  name_ar text not null default 'متجري',
  name_en text not null default 'My Store',
  tagline_ar text, tagline_en text,
  logo_url text,
  primary_color text not null default '#0f8a5f',
  secondary_color text not null default '#ffb020',
  currency_code text not null default 'EGP',
  currency_symbol_ar text not null default 'ج.م',
  currency_symbol_en text not null default 'EGP',
  default_language text not null default 'ar' check (default_language in ('ar','en')),
  contact_phone text, whatsapp_number text, email text,
  social_links jsonb not null default '{}'::jsonb,
  delivery_fee numeric(10,2) not null default 0,
  free_delivery_threshold numeric(10,2),
  min_order_amount numeric(10,2) not null default 0,
  working_hours jsonb not null default '{"open":"08:00","close":"23:00"}'::jsonb,
  delivery_slots jsonb not null default '["10:00-12:00","12:00-14:00","14:00-16:00","16:00-18:00","18:00-20:00","20:00-22:00"]'::jsonb,
  features jsonb not null default '{"delivery_tracking":true,"ai_assistant":false,"ai_analytics":false,"online_payment":false,"loyalty":false}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select on public.store_settings to anon, authenticated;
grant update on public.store_settings to authenticated;
grant all on public.store_settings to service_role;
alter table public.store_settings enable row level security;
create policy "settings public read" on public.store_settings for select to anon, authenticated using (true);
create policy "settings admin update" on public.store_settings for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger settings_touch before update on public.store_settings for each row execute function public.touch_updated_at();

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete cascade,
  name_ar text not null, name_en text not null,
  image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index categories_parent_idx on public.categories(parent_id);
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "categories public read" on public.categories for select to anon, authenticated using (is_active or public.is_staff(auth.uid()));
create policy "categories staff write" on public.categories for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name_ar text not null, name_en text not null,
  description_ar text, description_en text,
  brand text,
  sku text unique,
  price numeric(10,2) not null check (price >= 0),
  old_price numeric(10,2),
  unit text not null default 'piece' check (unit in ('piece','kg','gram','pack','liter')),
  step numeric(10,3) not null default 1 check (step > 0),
  min_qty numeric(10,3) not null default 1,
  stock numeric(12,3) not null default 0,
  images text[] not null default '{}',
  is_active boolean not null default true,
  is_featured boolean not null default false,
  flash_price numeric(10,2),
  flash_ends_at timestamptz,
  sold_count int not null default 0,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products(category_id);
create index products_active_idx on public.products(is_active);
create index products_created_idx on public.products(created_at desc);
create index products_sold_idx on public.products(sold_count desc);
create index products_flash_idx on public.products(flash_ends_at);
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "products public read" on public.products for select to anon, authenticated using (is_active or public.is_staff(auth.uid()));
create policy "products staff write" on public.products for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name_ar text not null, name_en text not null,
  attributes jsonb not null default '{}'::jsonb,
  price numeric(10,2) not null,
  old_price numeric(10,2),
  stock numeric(12,3) not null default 0,
  sort_order int not null default 0,
  is_active boolean not null default true
);
create index variants_product_idx on public.product_variants(product_id);
grant select on public.product_variants to anon, authenticated;
grant insert, update, delete on public.product_variants to authenticated;
grant all on public.product_variants to service_role;
alter table public.product_variants enable row level security;
create policy "variants public read" on public.product_variants for select to anon, authenticated using (is_active or public.is_staff(auth.uid()));
create policy "variants staff write" on public.product_variants for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  title_ar text, title_en text,
  subtitle_ar text, subtitle_en text,
  link text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.banners to anon, authenticated;
grant insert, update, delete on public.banners to authenticated;
grant all on public.banners to service_role;
alter table public.banners enable row level security;
create policy "banners public read" on public.banners for select to anon, authenticated using (is_active or public.is_staff(auth.uid()));
create policy "banners staff write" on public.banners for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null, name_en text not null,
  address_ar text, address_en text,
  phone text, lat double precision, lng double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.branches to anon, authenticated;
grant insert, update, delete on public.branches to authenticated;
grant all on public.branches to service_role;
alter table public.branches enable row level security;
create policy "branches public read" on public.branches for select to anon, authenticated using (is_active or public.is_staff(auth.uid()));
create policy "branches staff write" on public.branches for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique(product_id, user_id)
);
create index reviews_product_idx on public.reviews(product_id);
grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;
grant all on public.reviews to service_role;
alter table public.reviews enable row level security;
create policy "reviews public read" on public.reviews for select to anon, authenticated using (true);
create policy "reviews own insert" on public.reviews for insert to authenticated with check (user_id = auth.uid());
create policy "reviews own update" on public.reviews for update to authenticated using (user_id = auth.uid());
create policy "reviews own or staff delete" on public.reviews for delete to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()));

create or replace function public.refresh_product_rating() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p set
    rating_avg = coalesce((select avg(rating) from public.reviews where product_id = pid),0),
    rating_count = (select count(*) from public.reviews where product_id = pid)
  where p.id = pid;
  return null;
end $$;
create trigger reviews_rating after insert or update or delete on public.reviews for each row execute function public.refresh_product_rating();

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'home',
  recipient_name text, phone text,
  city text not null, area text, street text not null, building text, floor text, apartment text,
  notes text, lat double precision, lng double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses(user_id);
grant select, insert, update, delete on public.addresses to authenticated;
grant all on public.addresses to service_role;
alter table public.addresses enable row level security;
create policy "addresses own" on public.addresses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "addresses staff read" on public.addresses for select to authenticated using (public.is_staff(auth.uid()));

create table public.wishlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, product_id)
);
grant select, insert, delete on public.wishlist to authenticated;
grant all on public.wishlist to service_role;
alter table public.wishlist enable row level security;
create policy "wishlist own" on public.wishlist for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percent','fixed')),
  value numeric(10,2) not null check (value > 0),
  min_order numeric(10,2) not null default 0,
  max_discount numeric(10,2),
  max_uses int,
  used_count int not null default 0,
  starts_at timestamptz, ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.coupons to authenticated;
grant all on public.coupons to service_role;
alter table public.coupons enable row level security;
create policy "coupons staff" on public.coupons for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity (start with 1001) unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','confirmed','preparing','out_for_delivery','delivered','cancelled')),
  address jsonb not null,
  delivery_slot text not null default 'asap',
  payment_method text not null default 'cod' check (payment_method in ('cod','online')),
  payment_status text not null default 'unpaid',
  subtotal numeric(10,2) not null,
  delivery_fee numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  coupon_code text,
  notes text,
  driver_id uuid references auth.users(id),
  branch_id uuid references public.branches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on public.orders(user_id, created_at desc);
create index orders_status_idx on public.orders(status);
create index orders_created_idx on public.orders(created_at desc);
grant select, update on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "orders own read" on public.orders for select to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()) or driver_id = auth.uid());
create policy "orders staff update" on public.orders for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  name_ar text not null, name_en text not null,
  variant_name_ar text, variant_name_en text,
  image_url text,
  unit text not null,
  unit_price numeric(10,2) not null,
  quantity numeric(10,3) not null,
  line_total numeric(10,2) not null,
  notes text
);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_product_idx on public.order_items(product_id);
grant select on public.order_items to authenticated;
grant all on public.order_items to service_role;
alter table public.order_items enable row level security;
create policy "order items via order" on public.order_items for select to authenticated using (
  exists(select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff(auth.uid()) or o.driver_id = auth.uid()))
);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  note text,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index osh_order_idx on public.order_status_history(order_id, created_at);
grant select on public.order_status_history to authenticated;
grant all on public.order_status_history to service_role;
alter table public.order_status_history enable row level security;
create policy "history via order" on public.order_status_history for select to authenticated using (
  exists(select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff(auth.uid()) or o.driver_id = auth.uid()))
);

create or replace function public.log_order_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history(order_id, status, changed_by) values (new.id, new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger orders_status_log after insert or update of status on public.orders for each row execute function public.log_order_status();

create or replace function public.validate_coupon(_code text, _subtotal numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.coupons; d numeric;
begin
  select * into c from public.coupons where upper(code) = upper(trim(_code)) and is_active;
  if not found then return jsonb_build_object('valid', false, 'reason', 'not_found'); end if;
  if c.starts_at is not null and now() < c.starts_at then return jsonb_build_object('valid', false, 'reason', 'not_started'); end if;
  if c.ends_at is not null and now() > c.ends_at then return jsonb_build_object('valid', false, 'reason', 'expired'); end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then return jsonb_build_object('valid', false, 'reason', 'exhausted'); end if;
  if _subtotal < c.min_order then return jsonb_build_object('valid', false, 'reason', 'min_order', 'min_order', c.min_order); end if;
  d := case when c.discount_type = 'percent' then round(_subtotal * c.value / 100, 2) else c.value end;
  if c.max_discount is not null then d := least(d, c.max_discount); end if;
  d := least(d, _subtotal);
  return jsonb_build_object('valid', true, 'code', c.code, 'discount', d);
end $$;
grant execute on function public.validate_coupon(text, numeric) to authenticated, anon;

create or replace function public.place_order(_items jsonb, _address_id uuid, _delivery_slot text, _payment_method text, _coupon text, _notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.store_settings;
  addr public.addresses;
  it jsonb; p public.products; v public.product_variants;
  qty numeric; price numeric; sub numeric := 0; fee numeric; disc numeric := 0;
  cres jsonb; oid uuid; vname_ar text; vname_en text;
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
    if qty is null or qty <= 0 then raise exception 'invalid_quantity'; end if;
    if it->>'variant_id' is not null then
      select * into v from public.product_variants where id = (it->>'variant_id')::uuid and product_id = p.id and is_active;
      if not found then raise exception 'variant_unavailable'; end if;
      price := v.price;
      if v.stock < qty then raise exception 'out_of_stock'; end if;
    else
      price := case when p.flash_price is not null and p.flash_ends_at > now() then p.flash_price else p.price end;
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
    vname_ar := null; vname_en := null;
    if it->>'variant_id' is not null then
      select * into v from public.product_variants where id = (it->>'variant_id')::uuid;
      price := v.price; vname_ar := v.name_ar; vname_en := v.name_en;
      update public.product_variants set stock = stock - qty where id = v.id;
    else
      price := case when p.flash_price is not null and p.flash_ends_at > now() then p.flash_price else p.price end;
    end if;
    insert into public.order_items(order_id, product_id, variant_id, name_ar, name_en, variant_name_ar, variant_name_en, image_url, unit, unit_price, quantity, line_total, notes)
    values (oid, p.id, (it->>'variant_id')::uuid, p.name_ar, p.name_en, vname_ar, vname_en, p.images[1], p.unit, price, qty, round(price*qty,2), left(it->>'notes', 300));
    update public.products set stock = stock - case when it->>'variant_id' is null then qty else 0 end, sold_count = sold_count + ceil(qty)::int where id = p.id;
  end loop;
  return oid;
end $$;
grant execute on function public.place_order(jsonb, uuid, text, text, text, text) to authenticated;

create or replace function public.cancel_my_order(_order_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'cancelled' where id = _order_id and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'cannot_cancel'; end if;
end $$;
grant execute on function public.cancel_my_order(uuid) to authenticated;

create or replace function public.admin_stats() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'today', coalesce((select sum(total) from orders where status <> 'cancelled' and created_at >= date_trunc('day', now())),0),
    'week', coalesce((select sum(total) from orders where status <> 'cancelled' and created_at >= now() - interval '7 days'),0),
    'month', coalesce((select sum(total) from orders where status <> 'cancelled' and created_at >= now() - interval '30 days'),0),
    'orders_today', (select count(*) from orders where created_at >= date_trunc('day', now())),
    'orders_total', (select count(*) from orders),
    'pending', (select count(*) from orders where status = 'pending'),
    'daily', coalesce((select jsonb_agg(x order by x.day) from (
        select to_char(d::date,'YYYY-MM-DD') as day,
          coalesce((select sum(total) from orders o where o.status <> 'cancelled' and o.created_at::date = d::date),0) as total
        from generate_series(now() - interval '13 days', now(), interval '1 day') d) x),'[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(t) from (
        select oi.name_ar, oi.name_en, sum(oi.quantity) as qty, sum(oi.line_total) as revenue
        from order_items oi join orders o on o.id = oi.order_id where o.status <> 'cancelled'
        group by oi.name_ar, oi.name_en order by revenue desc limit 5) t),'[]'::jsonb)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.claim_first_admin() to authenticated;

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_status_history;

create policy "store media read" on storage.objects for select to anon, authenticated using (bucket_id = 'store-media');
create policy "store media staff insert" on storage.objects for insert to authenticated with check (bucket_id = 'store-media' and public.is_staff(auth.uid()));
create policy "store media staff update" on storage.objects for update to authenticated using (bucket_id = 'store-media' and public.is_staff(auth.uid()));
create policy "store media staff delete" on storage.objects for delete to authenticated using (bucket_id = 'store-media' and public.is_staff(auth.uid()));

insert into public.store_settings (id, name_ar, name_en, tagline_ar, tagline_en, contact_phone, whatsapp_number, delivery_fee, free_delivery_threshold, min_order_amount, social_links)
values (1, 'سوق الحي', 'Neighborhood Market', 'كل احتياجات بيتك توصلك لحد الباب', 'Everything your home needs, delivered', '+201000000000', '201000000000', 25, 500, 100, '{"facebook":"","instagram":""}')
on conflict (id) do nothing;

insert into public.categories (id, name_ar, name_en, image_url, sort_order) values
 ('11111111-0000-0000-0000-000000000001','خضروات وفواكه','Fruits & Vegetables','/seed/produce.jpg',1),
 ('11111111-0000-0000-0000-000000000002','ألبان وبيض','Dairy & Eggs','/seed/dairy.jpg',2),
 ('11111111-0000-0000-0000-000000000003','مخبوزات','Bakery','/seed/bakery.jpg',3),
 ('11111111-0000-0000-0000-000000000004','مشروبات','Beverages','/seed/drinks.jpg',4),
 ('11111111-0000-0000-0000-000000000005','لحوم ودواجن','Meat & Poultry','/seed/meat.jpg',5),
 ('11111111-0000-0000-0000-000000000006','منظفات','Cleaning','/seed/cleaning.jpg',6);
insert into public.categories (id, parent_id, name_ar, name_en, image_url, sort_order) values
 ('11111111-0000-0000-0000-000000000011','11111111-0000-0000-0000-000000000001','خضروات','Vegetables','/seed/produce.jpg',1),
 ('11111111-0000-0000-0000-000000000012','11111111-0000-0000-0000-000000000001','فواكه','Fruits','/seed/produce.jpg',2);

insert into public.products (category_id, name_ar, name_en, description_ar, brand, price, old_price, unit, step, min_qty, stock, images, is_featured, flash_price, flash_ends_at, sold_count, created_at) values
 ('11111111-0000-0000-0000-000000000011','طماطم بلدي','Local Tomatoes','طماطم طازجة يومياً من المزرعة','المزرعة',18,22,'kg',0.5,0.5,200,'{/seed/produce.jpg}',true,15,now()+interval '2 days',120,now()-interval '20 days'),
 ('11111111-0000-0000-0000-000000000011','خيار','Cucumber','خيار طازج مقرمش','المزرعة',15,null,'kg',0.5,0.5,150,'{/seed/produce.jpg}',false,null,null,90,now()-interval '18 days'),
 ('11111111-0000-0000-0000-000000000011','بطاطس','Potatoes','بطاطس مناسبة للقلي والطهي','المزرعة',12,null,'kg',0.5,1,300,'{/seed/produce.jpg}',false,null,null,150,now()-interval '15 days'),
 ('11111111-0000-0000-0000-000000000012','موز','Bananas','موز ناضج وحلو','الحقول',28,32,'kg',0.5,0.5,120,'{/seed/produce.jpg}',true,null,null,80,now()-interval '3 days'),
 ('11111111-0000-0000-0000-000000000012','تفاح أحمر','Red Apples','تفاح أحمر مستورد','الحقول',65,75,'kg',0.5,0.5,80,'{/seed/produce.jpg}',false,55,now()+interval '1 day',60,now()-interval '2 days'),
 ('11111111-0000-0000-0000-000000000012','برتقال','Oranges','برتقال عصير','الحقول',20,null,'kg',1,1,0,'{/seed/produce.jpg}',false,null,null,40,now()-interval '10 days'),
 ('11111111-0000-0000-0000-000000000002','لبن كامل الدسم ١ لتر','Full Cream Milk 1L','لبن بقري طازج كامل الدسم','ألبان النيل',38,null,'piece',1,1,100,'{/seed/dairy.jpg}',true,null,null,200,now()-interval '25 days'),
 ('11111111-0000-0000-0000-000000000002','جبنة رومي','Roumy Cheese','جبنة رومي معتقة','ألبان النيل',240,280,'kg',0.25,0.25,40,'{/seed/dairy.jpg}',false,210,now()+interval '3 days',35,now()-interval '1 day'),
 ('11111111-0000-0000-0000-000000000002','زبادي طبيعي','Plain Yogurt','زبادي طبيعي ١٠٥ جم','ألبان النيل',8,null,'piece',1,1,300,'{/seed/dairy.jpg}',false,null,null,170,now()-interval '12 days'),
 ('11111111-0000-0000-0000-000000000002','بيض أبيض ٣٠ بيضة','White Eggs 30 pcs','كرتونة بيض أبيض طازج','مزارع الخير',165,180,'pack',1,1,60,'{/seed/dairy.jpg}',true,null,null,140,now()-interval '8 days'),
 ('11111111-0000-0000-0000-000000000003','عيش بلدي','Baladi Bread','٥ أرغفة عيش بلدي طازج','مخبز الحي',10,null,'pack',1,1,200,'{/seed/bakery.jpg}',false,null,null,300,now()-interval '30 days'),
 ('11111111-0000-0000-0000-000000000003','كرواسون زبدة','Butter Croissant','كرواسون فرنسي بالزبدة','مخبز الحي',22,null,'piece',1,1,50,'{/seed/bakery.jpg}',false,null,null,45,now()-interval '1 day'),
 ('11111111-0000-0000-0000-000000000003','عيش توست','Toast Bread','عيش توست أبيض ٦٠٠ جم','مخبز الحي',35,40,'piece',1,1,70,'{/seed/bakery.jpg}',false,null,null,75,now()-interval '6 days'),
 ('11111111-0000-0000-0000-000000000004','مياه معدنية ١.٥ لتر','Mineral Water 1.5L','مياه طبيعية معبأة','نبع',8,null,'piece',1,1,500,'{/seed/drinks.jpg}',false,null,null,400,now()-interval '28 days'),
 ('11111111-0000-0000-0000-000000000004','عصير برتقال ١ لتر','Orange Juice 1L','عصير برتقال طبيعي ١٠٠٪','نبع',45,55,'piece',1,1,90,'{/seed/drinks.jpg}',true,39,now()+interval '2 days',85,now()-interval '4 days'),
 ('11111111-0000-0000-0000-000000000004','مشروب غازي علبة','Soft Drink Can','مشروب غازي ٣٣٠ مل','نبع',15,null,'piece',1,1,250,'{/seed/drinks.jpg}',false,null,null,220,now()-interval '14 days'),
 ('11111111-0000-0000-0000-000000000005','صدور دجاج','Chicken Breast','صدور دجاج طازجة بدون عظم','دواجن الوادي',190,210,'kg',0.5,0.5,60,'{/seed/meat.jpg}',true,null,null,95,now()-interval '5 days'),
 ('11111111-0000-0000-0000-000000000005','لحم بقري مفروم','Minced Beef','لحم بقري طازج مفروم','جزارة الحي',420,null,'kg',0.25,0.25,40,'{/seed/meat.jpg}',false,null,null,70,now()-interval '9 days'),
 ('11111111-0000-0000-0000-000000000006','سائل غسيل أطباق','Dishwashing Liquid','سائل غسيل أطباق برائحة الليمون','نظيف',55,65,'piece',1,1,100,'{/seed/cleaning.jpg}',false,null,null,50,now()-interval '11 days'),
 ('11111111-0000-0000-0000-000000000006','منظف أرضيات','Floor Cleaner','منظف أرضيات ٣ لتر','نظيف',95,null,'piece',1,1,45,'{/seed/cleaning.jpg}',false,null,null,30,now()-interval '7 days');

insert into public.product_variants (product_id, name_ar, name_en, attributes, price, stock, sort_order)
select id, 'صغير ٥٠٠ مل', 'Small 500ml', '{"size":"500ml"}', 30, 50, 1 from public.products where name_en = 'Dishwashing Liquid';
insert into public.product_variants (product_id, name_ar, name_en, attributes, price, stock, sort_order)
select id, 'كبير ١ لتر', 'Large 1L', '{"size":"1L"}', 55, 50, 2 from public.products where name_en = 'Dishwashing Liquid';

insert into public.banners (image_url, title_ar, title_en, subtitle_ar, subtitle_en, link, sort_order) values
 ('/seed/banner-1.jpg','خصومات الأسبوع','Weekly Deals','وفر لحد ٣٠٪ على الخضار والفاكهة','Save up to 30% on fresh produce','/category/11111111-0000-0000-0000-000000000001',1),
 ('/seed/banner-2.jpg','توصيل لحد باب البيت','Delivered to your door','اطلب دلوقتي ووصلك في أقل من ساعة','Order now, arrives within the hour','/products',2);

insert into public.branches (name_ar, name_en, address_ar, address_en, phone) values
 ('الفرع الرئيسي','Main Branch','شارع الجمهورية','Republic St.','+201000000000');

insert into public.coupons (code, discount_type, value, min_order, max_discount) values ('WELCOME10','percent',10,150,50);