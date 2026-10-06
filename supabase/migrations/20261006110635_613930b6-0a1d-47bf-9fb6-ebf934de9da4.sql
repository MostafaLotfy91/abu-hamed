CREATE TABLE public.ai_insights_cache (
  kind text PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_insights_cache TO authenticated;
GRANT ALL ON public.ai_insights_cache TO service_role;
ALTER TABLE public.ai_insights_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage insights cache" ON public.ai_insights_cache FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Fixed, aggregated, admin-only queries. The AI can only pick a name + bounded params.
CREATE OR REPLACE FUNCTION public.admin_insight(_name text, _params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  d int := greatest(1, least(coalesce((_params->>'days')::int, 7), 365));
  lim int := greatest(1, least(coalesce((_params->>'limit')::int, 10), 50));
  asc_order boolean := coalesce(_params->>'order','desc') = 'asc';
  since timestamptz := now() - make_interval(days => d);
  r jsonb;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  case _name
  when 'sales_by_period' then
    select coalesce(jsonb_agg(x order by x.day),'[]') into r from (
      select to_char(g::date,'YYYY-MM-DD') as day,
        coalesce((select sum(total) from orders o where o.status<>'cancelled' and o.created_at::date=g::date),0) sales,
        (select count(*) from orders o where o.status<>'cancelled' and o.created_at::date=g::date) orders
      from generate_series(now()-make_interval(days=>d-1), now(), interval '1 day') g) x;
  when 'top_products' then
    select coalesce(jsonb_agg(x),'[]') into r from (
      select p.name_ar product, coalesce(sum(oi.quantity) filter (where o.id is not null),0)::int qty,
        coalesce(sum(oi.line_total) filter (where o.id is not null),0) revenue
      from products p left join order_items oi on oi.product_id=p.id
      left join orders o on o.id=oi.order_id and o.status<>'cancelled' and o.created_at>=since
      where p.is_active group by p.id, p.name_ar
      order by case when asc_order then coalesce(sum(oi.quantity) filter (where o.id is not null),0) end asc,
               case when not asc_order then coalesce(sum(oi.quantity) filter (where o.id is not null),0) end desc
      limit lim) x;
  when 'sales_by_category' then
    select coalesce(jsonb_agg(x order by x.revenue desc),'[]') into r from (
      select coalesce(c.name_ar,'—') category, sum(oi.quantity)::int qty, sum(oi.line_total) revenue
      from order_items oi join orders o on o.id=oi.order_id and o.status<>'cancelled' and o.created_at>=since
      left join products p on p.id=oi.product_id left join categories c on c.id=p.category_id
      group by c.name_ar) x;
  when 'stock_by_variant' then
    select coalesce(jsonb_agg(x),'[]') into r from (
      select p.name_ar product, v.size, v.color_ar color, v.stock,
        coalesce((select sum(oi.quantity) from order_items oi join orders o on o.id=oi.order_id
          where oi.variant_id=v.id and o.status<>'cancelled' and o.created_at>=since),0)::int sold
      from product_variants v join products p on p.id=v.product_id
      where v.is_active and p.is_active
      order by case when coalesce(_params->>'sort','low_stock')='fast_selling' then
        -coalesce((select sum(oi.quantity) from order_items oi join orders o on o.id=oi.order_id
          where oi.variant_id=v.id and o.status<>'cancelled' and o.created_at>=since),0) else v.stock end, v.stock
      limit lim) x;
  when 'orders_by_status' then
    select coalesce(jsonb_agg(x order by x.count desc),'[]') into r from (
      select status, count(*)::int count from orders where created_at>=since group by status) x;
  when 'return_rate' then
    select coalesce(jsonb_agg(x order by x.rate desc),'[]') into r from (
      select case when _params->>'by'='category' then coalesce(c.name_ar,'—') else oi.name_ar end name,
        sum(oi.quantity)::int sold,
        count(distinct rr.id)::int returns,
        round(100.0*count(distinct rr.id)/nullif(count(distinct oi.id),0),1) rate,
        left(string_agg(distinct rr.reason, ' | '), 500) as reasons
      from order_items oi join orders o on o.id=oi.order_id and o.status='delivered' and o.created_at>=since
      left join products p on p.id=oi.product_id left join categories c on c.id=p.category_id
      left join return_requests rr on rr.order_item_id=oi.id or (rr.order_item_id is null and rr.order_id=o.id)
      group by 1 having count(distinct rr.id)>0 limit lim) x;
  when 'avg_order_value' then
    select jsonb_build_array(jsonb_build_object('orders',count(*),'revenue',coalesce(sum(total),0),
      'avg_order_value',coalesce(round(avg(total),2),0))) into r
      from orders where status<>'cancelled' and created_at>=since;
  when 'sales_by_governorate' then
    select coalesce(jsonb_agg(x order by x.revenue desc),'[]') into r from (
      select coalesce(nullif(address->>'city',''),'—') governorate, count(*)::int orders, sum(total) revenue
      from orders where status<>'cancelled' and created_at>=since group by 1) x;
  else raise exception 'unknown_insight';
  end case;
  return r;
end $$;
REVOKE ALL ON FUNCTION public.admin_insight(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_insight(text, jsonb) TO authenticated;