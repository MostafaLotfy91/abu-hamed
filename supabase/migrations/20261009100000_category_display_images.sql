-- Picture to show for each category card.
--   source 'own'      the category's own image_url (an absolute http(s) URL)
--   source 'product'  no usable own image: the photo of the best-selling (then newest) active product in the
--                     category or any of its subcategories (thumbnail when there is one)
--   source 'none'     neither: the app shows its designed fallback
-- Nothing is invented; old Lovable paths (/__l5e/...) and other relative paths count as no image.
-- security_invoker: callers see only what RLS lets them see (shoppers: active categories and products).

create or replace view public.category_display_images with (security_invoker = true) as
select
  c.id as category_id,
  case when c.image_url ~ '^https?://' then c.image_url else fp.image end as image_url,
  case when c.image_url ~ '^https?://' then 'own' when fp.image is not null then 'product' else 'none' end
    as source
from public.categories c
left join lateral (
  select coalesce(nullif(p.thumbnails[1], ''), p.images[1]) as image
  from public.products p
  where p.is_active
    and coalesce(array_length(p.images, 1), 0) > 0
    and p.images[1] ~ '^https?://'
    and p.category_id in (
      with recursive sub(id) as (
        select c.id
        union all
        select k.id from public.categories k join sub on k.parent_id = sub.id
      )
      select id from sub
    )
  order by p.sold_count desc, p.created_at desc
  limit 1
) fp on true;

grant select on public.category_display_images to anon, authenticated, service_role;
