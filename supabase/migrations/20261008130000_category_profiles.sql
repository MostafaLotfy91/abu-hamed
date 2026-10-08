-- Category-specific behaviour (filters, product fields, sizes, size guide) as data, plus one SQL definition of
-- catalogue search used for the product list, its count and the filter options, so they always agree.

-- 1. Profiles ----------------------------------------------------------------------
create table public.product_profiles (
  key text primary key check (key ~ '^[a-z_]+$'),
  name_ar text not null,
  name_en text not null,
  -- Storefront filters for categories using this profile (price/discount/in_stock are universal).
  filters text[] not null default '{}' check (filters <@ array['size','color','brand','gender','season','concentration','volume','material','type','price','discount','in_stock']::text[]),
  -- Optional product fields the admin form shows for this profile.
  fields text[] not null default '{}' check (fields <@ array['gender','season','material','care','notes','volume','concentration']::text[]),
  -- Size presets for variants and import validation; null = products have no size axis.
  sizes text[],
  -- Which size chart to show on the product page; null = no size guide.
  size_guide text check (size_guide in ('clothes','shoes','kids')),
  sort_order int not null default 0
);
grant select on public.product_profiles to anon, authenticated;
grant all on public.product_profiles to service_role;
alter table public.product_profiles enable row level security;
create policy "profiles public read" on public.product_profiles for select to anon, authenticated using (true);
create policy "profiles admin write" on public.product_profiles for all to authenticated
  using ((select public.has_role((select auth.uid()), 'admin'))) with check ((select public.has_role((select auth.uid()), 'admin')));

insert into public.product_profiles (key, name_ar, name_en, filters, fields, sizes, size_guide, sort_order) values
 ('clothes', 'ملابس', 'Clothing',
   '{size,color,brand,gender,season,price,discount,in_stock}', '{gender,season,material,care}',
   '{XS,S,M,L,XL,XXL,XXXL}', 'clothes', 1),
 ('shoes', 'أحذية', 'Shoes',
   '{size,color,brand,price,discount,in_stock}', '{gender,material}',
   '{36,37,38,39,40,41,42,43,44,45,46}', 'shoes', 2),
 ('kids', 'أطفال', 'Kids',
   '{size,color,gender,price,discount,in_stock}', '{gender,season,material,care}',
   '{0-3m,3-6m,6-12m,1-2y,2-3y,3-4y,4-5y,5-6y,6-7y,7-8y,8-10y,10-12y,12-14y}', 'kids', 3),
 ('modest', 'جلابيب وعبايات', 'Galabeyas & abayas',
   '{size,color,season,price,discount,in_stock}', '{gender,season,material,care}',
   '{S,M,L,XL,XXL,XXXL}', 'clothes', 4),
 ('perfume', 'عطور', 'Perfumes',
   '{concentration,volume,gender,brand,price,discount,in_stock}', '{gender,concentration,volume,notes}',
   null, null, 5),
 ('accessories', 'إكسسوارات', 'Accessories',
   '{type,color,material,brand,price,discount,in_stock}', '{gender,material}',
   null, null, 6),
 ('general', 'عام', 'General',
   '{brand,price,discount,in_stock}', '{gender,material}',
   null, null, 7);

alter table public.categories add column if not exists profile text references public.product_profiles(key) on update cascade;
-- Existing stores: map the old size_type of top-level categories; children inherit (null).
update public.categories set profile = size_type
 where profile is null and parent_id is null and size_type in ('clothes', 'shoes', 'kids');

/** Effective profile of a category: its own, else the nearest ancestor's, else 'general'. */
create or replace function public.category_profile(_category_id uuid) returns text
language sql stable set search_path = public as $$
  with recursive up(id, parent_id, profile, depth) as (
    select id, parent_id, profile, 0 from public.categories where id = _category_id
    union all
    select c.id, c.parent_id, c.profile, up.depth + 1 from public.categories c join up on c.id = up.parent_id where up.depth < 10
  )
  select coalesce((select profile from up where profile is not null order by depth limit 1), 'general')
$$;
grant execute on function public.category_profile(uuid) to anon, authenticated;

-- 2. One definition of "this product matches these filters" -----------------------------
-- f (jsonb, all optional): q, category_ids[], type_ids[], min_price, max_price, brand, gender, season,
-- concentration, volume, material, size, color, discounted, in_stock.
-- skip: one filter to ignore (used to count the options of that filter against all the others).

create or replace function public.effective_price(p public.products) returns numeric
language sql stable set search_path = public as $$
  select case when p.flash_price is not null and p.flash_ends_at > now() then p.flash_price else p.price end
$$;

create or replace function public.catalog_match(p public.products, f jsonb, skip text default '') returns boolean
language sql stable set search_path = public as $$
  select p.is_active
    and (skip = 'q' or coalesce(f->>'q', '') = '' or (
         p.name_ar ilike '%' || replace(replace(replace(f->>'q', '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or p.name_en ilike '%' || replace(replace(replace(f->>'q', '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or coalesce(p.brand, '') ilike '%' || replace(replace(replace(f->>'q', '\', '\\'), '%', '\%'), '_', '\_') || '%'))
    and (coalesce(jsonb_array_length(f->'category_ids'), 0) = 0
         or p.category_id::text in (select jsonb_array_elements_text(f->'category_ids')))
    and (skip = 'type' or coalesce(jsonb_array_length(f->'type_ids'), 0) = 0
         or p.category_id::text in (select jsonb_array_elements_text(f->'type_ids')))
    and (skip = 'price' or f->>'min_price' is null or public.effective_price(p) >= (f->>'min_price')::numeric)
    and (skip = 'price' or f->>'max_price' is null or public.effective_price(p) <= (f->>'max_price')::numeric)
    and (skip = 'brand' or f->>'brand' is null or p.brand = f->>'brand')
    and (skip = 'gender' or f->>'gender' is null or p.gender = f->>'gender')
    and (skip = 'season' or f->>'season' is null or p.season = f->>'season')
    and (skip = 'concentration' or f->>'concentration' is null or p.concentration = f->>'concentration')
    and (skip = 'volume' or f->>'volume' is null or p.volume_ml = (f->>'volume')::int)
    and (skip = 'material' or f->>'material' is null or p.material_ar = f->>'material')
    and (skip = 'discount' or not coalesce((f->>'discounted')::boolean, false) or
         (p.flash_price is not null and p.flash_ends_at > now() and p.flash_price < p.price)
         or (p.old_price is not null and p.old_price > public.effective_price(p)))
    -- Size, colour and stock are checked on the same active variant; products without variants only have stock.
    and (case
      when exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active) then
        (case when (skip = 'size' or f->>'size' is null) and (skip = 'color' or f->>'color' is null)
                   and (skip = 'in_stock' or not coalesce((f->>'in_stock')::boolean, false)) then true
         else exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active
               and (skip = 'size' or f->>'size' is null or v.size = f->>'size')
               and (skip = 'color' or f->>'color' is null or v.color_en = f->>'color')
               and (skip = 'in_stock' or not coalesce((f->>'in_stock')::boolean, false) or v.stock > 0)) end)
      else
        (skip = 'size' or f->>'size' is null) and (skip = 'color' or f->>'color' is null)
        and (skip = 'in_stock' or not coalesce((f->>'in_stock')::boolean, false) or p.stock > 0)
    end)
$$;

/** One page of matching products. Ordering and paging happen here so they use the effective price. */
create or replace function public.catalog_search(f jsonb default '{}', _sort text default 'newest', _limit int default 20, _offset int default 0)
returns setof public.products language sql stable set search_path = public as $$
  select p.* from public.products p
   where public.catalog_match(p, coalesce(f, '{}'))
   order by
     case when _sort = 'price_asc' then public.effective_price(p) end asc nulls last,
     case when _sort = 'price_desc' then public.effective_price(p) end desc nulls last,
     case when _sort = 'popular' then p.sold_count end desc nulls last,
     p.created_at desc, p.id
   limit greatest(1, least(coalesce(_limit, 20), 100)) offset greatest(0, coalesce(_offset, 0))
$$;

create or replace function public.catalog_count(f jsonb default '{}') returns int
language sql stable set search_path = public as $$
  select count(*)::int from public.products p where public.catalog_match(p, coalesce(f, '{}'))
$$;

/** Filter options with counts: each filter's values are counted with all the other active filters applied. */
create or replace function public.catalog_filter_options(f jsonb default '{}') returns jsonb
language sql stable set search_path = public as $$
  with f0 as (select coalesce(f, '{}'::jsonb) as f)
  select jsonb_build_object(
    'sizes', coalesce((select jsonb_agg(jsonb_build_object('value', size, 'count', n)) from (
        select v.size, count(distinct p.id)::int n from public.products p cross join f0
          join public.product_variants v on v.product_id = p.id and v.is_active and v.size is not null
         where public.catalog_match(p, f0.f, 'size')
           and (f0.f->>'color' is null or v.color_en = f0.f->>'color')
           and (not coalesce((f0.f->>'in_stock')::boolean, false) or v.stock > 0)
         group by v.size) s), '[]'::jsonb),
    'colors', coalesce((select jsonb_agg(jsonb_build_object('en', color_en, 'ar', color_ar, 'hex', color_hex, 'count', n) order by n desc, color_en) from (
        select v.color_en, max(v.color_ar) color_ar, max(v.color_hex) color_hex, count(distinct p.id)::int n
          from public.products p cross join f0
          join public.product_variants v on v.product_id = p.id and v.is_active and v.color_en is not null
         where public.catalog_match(p, f0.f, 'color')
           and (f0.f->>'size' is null or v.size = f0.f->>'size')
           and (not coalesce((f0.f->>'in_stock')::boolean, false) or v.stock > 0)
         group by v.color_en) c), '[]'::jsonb),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('value', brand, 'count', n) order by brand) from (
        select p.brand, count(*)::int n from public.products p cross join f0
         where public.catalog_match(p, f0.f, 'brand') and coalesce(p.brand, '') <> '' group by p.brand) b), '[]'::jsonb),
    'genders', coalesce((select jsonb_agg(jsonb_build_object('value', gender, 'count', n)) from (
        select p.gender, count(*)::int n from public.products p cross join f0
         where public.catalog_match(p, f0.f, 'gender') and p.gender is not null group by p.gender) g), '[]'::jsonb),
    'seasons', coalesce((select jsonb_agg(jsonb_build_object('value', season, 'count', n)) from (
        select p.season, count(*)::int n from public.products p cross join f0
         where public.catalog_match(p, f0.f, 'season') and p.season is not null group by p.season) s), '[]'::jsonb),
    'concentrations', coalesce((select jsonb_agg(jsonb_build_object('value', concentration, 'count', n)) from (
        select p.concentration, count(*)::int n from public.products p cross join f0
         where public.catalog_match(p, f0.f, 'concentration') and p.concentration is not null group by p.concentration) c), '[]'::jsonb),
    'volumes', coalesce((select jsonb_agg(jsonb_build_object('value', volume_ml, 'count', n) order by volume_ml) from (
        select p.volume_ml, count(*)::int n from public.products p cross join f0
         where public.catalog_match(p, f0.f, 'volume') and p.volume_ml is not null group by p.volume_ml) v), '[]'::jsonb),
    'materials', coalesce((select jsonb_agg(jsonb_build_object('value', material_ar, 'en', material_en, 'count', n) order by material_ar) from (
        select p.material_ar, max(p.material_en) material_en, count(*)::int n from public.products p cross join f0
         where public.catalog_match(p, f0.f, 'material') and coalesce(p.material_ar, '') <> '' group by p.material_ar) m), '[]'::jsonb),
    -- Per-category counts; the client folds them into the current category's subcategories ("type").
    'categories', coalesce((select jsonb_agg(jsonb_build_object('value', category_id, 'count', n)) from (
        select p.category_id, count(*)::int n from public.products p cross join f0
         where public.catalog_match(p, f0.f, 'type') and p.category_id is not null group by p.category_id) c), '[]'::jsonb),
    'discounted', (select count(*)::int from public.products p cross join f0
         where public.catalog_match(p, f0.f || '{"discounted": true}'::jsonb, '')),
    'in_stock', (select count(*)::int from public.products p cross join f0
         where public.catalog_match(p, f0.f || '{"in_stock": true}'::jsonb, '')),
    'price', (select jsonb_build_object('min', min(public.effective_price(p)), 'max', max(public.effective_price(p)))
         from public.products p cross join f0 where public.catalog_match(p, f0.f, 'price'))
  )
$$;

grant execute on function public.effective_price(public.products), public.catalog_match(public.products, jsonb, text),
  public.catalog_search(jsonb, text, int, int), public.catalog_count(jsonb), public.catalog_filter_options(jsonb)
  to anon, authenticated;
