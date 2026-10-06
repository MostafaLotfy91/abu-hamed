alter table public.products add column if not exists thumbnails text[] not null default '{}';

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid(),
  file_name text not null,
  total_rows integer not null default 0,
  products_created integer not null default 0,
  products_updated integer not null default 0,
  variants_created integer not null default 0,
  variants_updated integer not null default 0,
  error_rows integer not null default 0,
  status text not null default 'running' check (status in ('running','completed','failed','undone')),
  created_product_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert on public.import_jobs to authenticated;
grant all on public.import_jobs to service_role;
alter table public.import_jobs enable row level security;
create policy "staff read import jobs" on public.import_jobs for select to authenticated using (public.is_staff(auth.uid()));
create policy "admin create import jobs" on public.import_jobs for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') and created_by = auth.uid() and status = 'running');
create trigger import_jobs_touch before update on public.import_jobs for each row execute function public.touch_updated_at();

create or replace function public.admin_import_batch(_job_id uuid, _rows jsonb, _create_categories boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; seg text; v_cat uuid; v_parent uuid; v_pid uuid; v_vid uuid; v_code text; v_price numeric; v_base numeric;
  v_imgs text[]; pc int := 0; pu int := 0; vc int := 0; vu int := 0;
  errs jsonb := '[]'::jsonb; created uuid[] := '{}'; seen text[] := '{}';
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  if not exists (select 1 from import_jobs where id = _job_id and status = 'running') then raise exception 'invalid_job'; end if;
  for r in select * from jsonb_array_elements(_rows) loop
    v_code := btrim(coalesce(r->>'product_code',''));
    v_price := nullif(r->>'price','')::numeric;
    if v_code = '' or v_price is null or v_price < 0 then
      errs := errs || jsonb_build_object('row', r->'row', 'error', 'invalid_row'); continue;
    end if;
    v_cat := null; v_parent := null;
    if coalesce(r->>'category','') <> '' then
      foreach seg in array regexp_split_to_array(r->>'category', '\s*>\s*') loop
        seg := btrim(seg);
        continue when seg = '';
        select id into v_cat from categories
          where (name_ar = seg or lower(name_en) = lower(seg)) and parent_id is not distinct from v_parent limit 1;
        if v_cat is null then
          if _create_categories then
            insert into categories (name_ar, name_en, parent_id, size_type, sort_order, is_active)
              values (seg, seg, v_parent, 'none', 0, true) returning id into v_cat;
          else exit; end if;
        end if;
        v_parent := v_cat;
      end loop;
      if v_cat is null then
        errs := errs || jsonb_build_object('row', r->'row', 'error', 'unknown_category'); continue;
      end if;
    end if;
    v_imgs := coalesce(array(select jsonb_array_elements_text(coalesce(r->'images','[]'::jsonb))), '{}');
    select id, price into v_pid, v_base from products where sku = v_code;
    if v_pid is null then
      insert into products (sku, name_ar, name_en, category_id, brand, gender, season, material_ar, material_en,
        description_ar, description_en, care_ar, price, old_price, images, is_active,
        top_notes, middle_notes, base_notes, volume_ml, concentration, stock)
      values (v_code, coalesce(nullif(r->>'name_ar',''), v_code), coalesce(nullif(r->>'name_en',''), nullif(r->>'name_ar',''), v_code),
        v_cat, nullif(r->>'brand',''), nullif(r->>'gender',''), nullif(r->>'season',''), nullif(r->>'material',''), nullif(r->>'material',''),
        nullif(r->>'description_ar',''), nullif(r->>'description_en',''), nullif(r->>'care',''), v_price,
        nullif(r->>'old_price','')::numeric, v_imgs, coalesce((r->>'is_active')::boolean, true),
        nullif(r->>'top_notes',''), nullif(r->>'middle_notes',''), nullif(r->>'base_notes',''),
        nullif(r->>'volume_ml','')::int, nullif(r->>'concentration',''), 0)
      returning id, price into v_pid, v_base;
      pc := pc + 1; created := created || v_pid; seen := seen || v_code;
    elsif not (v_code = any(seen)) then
      update products set
        name_ar = coalesce(nullif(r->>'name_ar',''), name_ar), name_en = coalesce(nullif(r->>'name_en',''), name_en),
        category_id = coalesce(v_cat, category_id), brand = coalesce(nullif(r->>'brand',''), brand),
        gender = coalesce(nullif(r->>'gender',''), gender), season = coalesce(nullif(r->>'season',''), season),
        material_ar = coalesce(nullif(r->>'material',''), material_ar),
        description_ar = coalesce(nullif(r->>'description_ar',''), description_ar), description_en = coalesce(nullif(r->>'description_en',''), description_en),
        care_ar = coalesce(nullif(r->>'care',''), care_ar), price = v_price,
        old_price = nullif(r->>'old_price','')::numeric,
        images = case when cardinality(v_imgs) > 0 then v_imgs else images end,
        is_active = coalesce((r->>'is_active')::boolean, is_active),
        top_notes = coalesce(nullif(r->>'top_notes',''), top_notes), middle_notes = coalesce(nullif(r->>'middle_notes',''), middle_notes),
        base_notes = coalesce(nullif(r->>'base_notes',''), base_notes), volume_ml = coalesce(nullif(r->>'volume_ml','')::int, volume_ml),
        concentration = coalesce(nullif(r->>'concentration',''), concentration), updated_at = now()
      where id = v_pid;
      v_base := v_price; pu := pu + 1; seen := seen || v_code;
    end if;

    if coalesce(r->>'size','') = '' and coalesce(r->>'color_ar','') = '' and coalesce(r->>'sku','') = '' then
      update products set stock = coalesce(nullif(r->>'stock','')::int, stock) where id = v_pid;
    else
      v_vid := null;
      if coalesce(r->>'sku','') <> '' then
        select id into v_vid from product_variants where sku = r->>'sku';
      else
        select id into v_vid from product_variants where product_id = v_pid and sku is null
          and size is not distinct from nullif(r->>'size','') and color_ar is not distinct from nullif(r->>'color_ar','') limit 1;
      end if;
      if v_vid is not null then
        update product_variants set
          price = case when v_price = v_base then null else v_price end,
          stock = coalesce(nullif(r->>'stock','')::int, stock),
          is_active = coalesce((r->>'is_active')::boolean, is_active)
        where id = v_vid;
        vu := vu + 1;
      else
        insert into product_variants (product_id, size, color_ar, color_en, color_hex, sku, name_ar, name_en, price, stock, is_active, sort_order, attributes)
        values (v_pid, nullif(r->>'size',''), nullif(r->>'color_ar',''), coalesce(nullif(r->>'color_en',''), nullif(r->>'color_ar','')),
          nullif(r->>'color_hex',''), nullif(r->>'sku',''),
          coalesce(nullif(concat_ws(' / ', nullif(r->>'size',''), nullif(r->>'color_ar','')), ''), v_code),
          coalesce(nullif(concat_ws(' / ', nullif(r->>'size',''), coalesce(nullif(r->>'color_en',''), nullif(r->>'color_ar',''))), ''), v_code),
          case when v_price = v_base then null else v_price end,
          greatest(0, coalesce(nullif(r->>'stock','')::int, 0)), coalesce((r->>'is_active')::boolean, true), 0, '{}'::jsonb);
        vc := vc + 1;
      end if;
    end if;
  end loop;

  update import_jobs set
    products_created = products_created + pc, products_updated = products_updated + pu,
    variants_created = variants_created + vc, variants_updated = variants_updated + vu,
    error_rows = error_rows + jsonb_array_length(errs),
    created_product_ids = created_product_ids || created
  where id = _job_id;
  return jsonb_build_object('products_created', pc, 'products_updated', pu, 'variants_created', vc, 'variants_updated', vu, 'errors', errs);
end $$;

create or replace function public.admin_finish_import(_job_id uuid, _status text, _extra_errors integer default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  if _status not in ('completed','failed') then raise exception 'invalid_status'; end if;
  update import_jobs set status = _status, error_rows = error_rows + greatest(0, _extra_errors)
    where id = _job_id and status = 'running';
end $$;

create or replace function public.admin_undo_import(_job_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  update products set is_active = false
    where id = any (select unnest(created_product_ids) from import_jobs where id = _job_id and status in ('completed','failed'));
  get diagnostics n = row_count;
  update import_jobs set status = 'undone' where id = _job_id and status in ('completed','failed');
  return n;
end $$;

revoke all on function public.admin_import_batch(uuid, jsonb, boolean) from public, anon;
revoke all on function public.admin_finish_import(uuid, text, integer) from public, anon;
revoke all on function public.admin_undo_import(uuid) from public, anon;
grant execute on function public.admin_import_batch(uuid, jsonb, boolean) to authenticated;
grant execute on function public.admin_finish_import(uuid, text, integer) to authenticated;
grant execute on function public.admin_undo_import(uuid) to authenticated;

create policy "store media images only" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'store-media' or lower(storage.extension(name)) in ('webp','jpg','jpeg','png','gif','avif'));
create policy "store media bulk admin only" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'store-media' or name not like 'bulk/%' or public.has_role(auth.uid(), 'admin'));