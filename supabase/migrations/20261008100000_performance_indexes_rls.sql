-- Migration C: performance
--  * indexes for foreign keys and filters that RLS policies, driver views, insights and search rely on
--  * RLS policies call auth.uid() / role helpers once per query instead of once per row:
--    wrapping them in (select ...) lets Postgres evaluate them as an init plan.
--    Only the expressions change (alter policy); commands, roles and meaning stay the same.
-- Storage policies are left as they are (admin uploads only, low volume).

-- 1. Indexes -------------------------------------------------------------------
create index if not exists orders_driver_idx on public.orders(driver_id) where driver_id is not null;
create index if not exists order_items_variant_idx on public.order_items(variant_id) where variant_id is not null;
create index if not exists return_requests_user_idx on public.return_requests(user_id);
create index if not exists return_requests_item_idx on public.return_requests(order_item_id) where order_item_id is not null;
create index if not exists driver_locations_driver_idx on public.driver_locations(driver_id);
create index if not exists wishlist_product_idx on public.wishlist(product_id);
create index if not exists reviews_user_idx on public.reviews(user_id);

-- Storefront listings: active products, newest first, overall and per category.
create index if not exists products_active_created_idx on public.products(created_at desc) where is_active;
create index if not exists products_category_active_idx on public.products(category_id, created_at desc) where is_active;

-- Product search uses ilike '%term%' on the names; trigram indexes make that indexable.
create extension if not exists pg_trgm with schema extensions;
create index if not exists products_name_ar_trgm_idx on public.products using gin (name_ar extensions.gin_trgm_ops);
create index if not exists products_name_en_trgm_idx on public.products using gin (name_en extensions.gin_trgm_ops);

-- 2. RLS policies: evaluate auth/role checks once per statement ------------------
-- user_roles
alter policy "own roles readable" on public.user_roles
  using (user_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));
alter policy "admins manage roles" on public.user_roles
  using ((select public.has_role((select auth.uid()), 'admin')))
  with check ((select public.has_role((select auth.uid()), 'admin')));

-- profiles
alter policy "profile self read" on public.profiles
  using (id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));
alter policy "profile self insert" on public.profiles
  with check (id = (select auth.uid()));
alter policy "profile self update" on public.profiles
  using (id = (select auth.uid()));

-- store_settings
alter policy "settings admin update" on public.store_settings
  using ((select public.has_role((select auth.uid()), 'admin')))
  with check ((select public.has_role((select auth.uid()), 'admin')));

-- catalogue: public read of active rows, staff write
alter policy "categories public read" on public.categories
  using (is_active or (select public.is_staff((select auth.uid()))));
alter policy "categories staff write" on public.categories
  using ((select public.is_staff((select auth.uid()))))
  with check ((select public.is_staff((select auth.uid()))));
alter policy "products public read" on public.products
  using (is_active or (select public.is_staff((select auth.uid()))));
alter policy "products staff write" on public.products
  using ((select public.is_staff((select auth.uid()))))
  with check ((select public.is_staff((select auth.uid()))));
alter policy "variants public read" on public.product_variants
  using (is_active or (select public.is_staff((select auth.uid()))));
alter policy "variants staff write" on public.product_variants
  using ((select public.is_staff((select auth.uid()))))
  with check ((select public.is_staff((select auth.uid()))));
alter policy "branches public read" on public.branches
  using (is_active or (select public.is_staff((select auth.uid()))));
alter policy "branches staff write" on public.branches
  using ((select public.is_staff((select auth.uid()))))
  with check ((select public.is_staff((select auth.uid()))));

-- banners (admin write since the access hardening migration)
alter policy "banners public read" on public.banners
  using (is_active or (select public.is_staff((select auth.uid()))));
alter policy "banners admin write" on public.banners
  using ((select public.has_role((select auth.uid()), 'admin')))
  with check ((select public.has_role((select auth.uid()), 'admin')));

-- reviews
alter policy "reviews own insert" on public.reviews
  with check (user_id = (select auth.uid()));
alter policy "reviews own update" on public.reviews
  using (user_id = (select auth.uid()));
alter policy "reviews own or staff delete" on public.reviews
  using (user_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));

-- addresses, wishlist
alter policy "addresses own" on public.addresses
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy "addresses staff read" on public.addresses
  using ((select public.is_staff((select auth.uid()))));
alter policy "wishlist own" on public.wishlist
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- coupons and their logs
alter policy "coupons admin" on public.coupons
  using ((select public.has_role((select auth.uid()), 'admin')))
  with check ((select public.has_role((select auth.uid()), 'admin')));
alter policy "redemptions own or staff read" on public.coupon_redemptions
  using (user_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));
alter policy "coupon attempts staff read" on public.coupon_attempts
  using ((select public.is_staff((select auth.uid()))));

-- orders and children
alter policy "orders own read" on public.orders
  using (user_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))) or driver_id = (select auth.uid()));
alter policy "orders staff update" on public.orders
  using ((select public.is_staff((select auth.uid()))))
  with check ((select public.is_staff((select auth.uid()))));
alter policy "order items via order" on public.order_items
  using (exists (select 1 from public.orders o where o.id = order_id
    and (o.user_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))) or o.driver_id = (select auth.uid()))));
alter policy "history via order" on public.order_status_history
  using (exists (select 1 from public.orders o where o.id = order_id
    and (o.user_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))) or o.driver_id = (select auth.uid()))));

-- returns
alter policy "Customers read own return requests" on public.return_requests
  using (user_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));
alter policy "Staff update return requests" on public.return_requests
  using ((select public.is_staff((select auth.uid()))))
  with check ((select public.is_staff((select auth.uid()))));

-- drivers
alter policy "driver own profile read" on public.driver_profiles
  using (user_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));
alter policy "driver own profile update" on public.driver_profiles
  using (user_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))))
  with check (user_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));
alter policy "staff manage driver profiles" on public.driver_profiles
  using ((select public.is_staff((select auth.uid()))))
  with check ((select public.is_staff((select auth.uid()))));
alter policy "driver writes own location" on public.driver_locations
  with check (driver_id = (select auth.uid()) and (select public.is_active_driver((select auth.uid()))) and exists (
    select 1 from public.orders o where o.id = order_id and o.driver_id = (select auth.uid()) and o.status = 'out_for_delivery'));
alter policy "driver reads own location" on public.driver_locations
  using (driver_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));
alter policy "customer reads during active delivery" on public.driver_locations
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())
    and o.status = 'out_for_delivery' and o.driver_id = driver_locations.driver_id));

-- AI, social links, imports
alter policy "Staff read ai usage" on public.ai_usage_logs
  using ((select public.is_staff((select auth.uid()))));
alter policy "admins manage insights cache" on public.ai_insights_cache
  using ((select public.has_role((select auth.uid()), 'admin')))
  with check ((select public.has_role((select auth.uid()), 'admin')));
alter policy "Public reads active social links" on public.social_links
  using (is_active or (select public.has_role((select auth.uid()), 'admin')));
alter policy "Admins insert social links" on public.social_links
  with check ((select public.has_role((select auth.uid()), 'admin')));
alter policy "Admins update social links" on public.social_links
  using ((select public.has_role((select auth.uid()), 'admin')))
  with check ((select public.has_role((select auth.uid()), 'admin')));
alter policy "Admins delete social links" on public.social_links
  using ((select public.has_role((select auth.uid()), 'admin')));
alter policy "staff read import jobs" on public.import_jobs
  using ((select public.is_staff((select auth.uid()))));
alter policy "admin create import jobs" on public.import_jobs
  with check ((select public.has_role((select auth.uid()), 'admin')) and created_by = (select auth.uid()) and status = 'running');
