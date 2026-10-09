-- Driver cash and earnings: COD collection, driver commission and settlements, as an append-only ledger.
--
-- Sign convention (one number per entry, see docs/driver-finance.md):
--   amount > 0  the driver owes the store more        amount < 0  the driver owes the store less
--   cod_collected      +order total for COD (0 for paid-online orders)
--   commission_earned  -commission (what the store owes the driver for the delivery)
--   settlement_paid    -cash the store received from the driver (+ when the store pays the driver)
--   adjustment         either sign, reason required
--   reversal           exactly -(the entry it reverses); points to it with reverses_id
-- owed_to_store = sum(amount) over entries that affect cash. Commission entries written while
-- driver_keeps_commission_from_cash is off have affects_cash = false: the driver hands over all the cash and the
-- commission is paid separately (shown as commission_payable). Balances are always computed, never stored.
--
-- Entries are written only by the security-definer functions below; nobody can update or delete them. Mistakes
-- are corrected with a reversal or an adjustment.

-- 1. Settings -------------------------------------------------------------------------------------------------
alter table public.store_settings
  add column if not exists driver_commission_type text not null default 'fixed',
  add column if not exists driver_commission_value numeric(12,2) not null default 0,
  add column if not exists driver_keeps_commission_from_cash boolean not null default true,
  add column if not exists settlement_mode text not null default 'end_of_day',
  add column if not exists driver_cash_limit numeric(12,2) not null default 0,
  add column if not exists staff_can_record_settlements boolean not null default false,
  add column if not exists timezone text not null default 'Africa/Cairo';
alter table public.store_settings
  add constraint store_settings_commission_type_chk check (driver_commission_type in ('fixed','percent_of_delivery_fee')),
  add constraint store_settings_commission_value_chk check (
    driver_commission_value >= 0 and (driver_commission_type = 'fixed' or driver_commission_value <= 100)),
  add constraint store_settings_settlement_mode_chk check (settlement_mode in ('end_of_day','per_order')),
  add constraint store_settings_cash_limit_chk check (driver_cash_limit >= 0),
  add constraint store_settings_timezone_chk check (timezone ~ '^[A-Za-z][A-Za-z0-9_+/-]{1,63}$');

/** A timezone name Postgres knows; rejects typos before they break day boundaries. */
create or replace function public._valid_timezone() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.timezone is distinct from old.timezone then
    perform now() at time zone new.timezone;
  end if;
  return new;
exception when others then
  raise exception 'invalid_timezone';
end $$;
create trigger store_settings_timezone before update of timezone on public.store_settings
  for each row execute function public._valid_timezone();

-- 2. Per-driver commission override --------------------------------------------------------------------------
create table public.driver_payout_settings (
  driver_id uuid primary key references auth.users(id) on delete cascade,
  commission_type text not null check (commission_type in ('fixed','percent_of_delivery_fee')),
  commission_value numeric(12,2) not null check (
    commission_value >= 0 and (commission_type = 'fixed' or commission_value <= 100)),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
revoke all on public.driver_payout_settings from anon, authenticated; -- Supabase grants everything by default
grant select, insert, update, delete on public.driver_payout_settings to authenticated;
grant all on public.driver_payout_settings to service_role;
alter table public.driver_payout_settings enable row level security;
create policy "payout settings own or staff read" on public.driver_payout_settings for select to authenticated
  using (driver_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));
create policy "payout settings admin insert" on public.driver_payout_settings for insert to authenticated
  with check ((select public.has_role((select auth.uid()), 'admin')));
create policy "payout settings admin update" on public.driver_payout_settings for update to authenticated
  using ((select public.has_role((select auth.uid()), 'admin')))
  with check ((select public.has_role((select auth.uid()), 'admin')));
create policy "payout settings admin delete" on public.driver_payout_settings for delete to authenticated
  using ((select public.has_role((select auth.uid()), 'admin')));

-- 3. Ledger ----------------------------------------------------------------------------------------------------
create table public.driver_ledger (
  id uuid primary key default gen_random_uuid(),
  -- Financial history outlives accounts and orders: no cascade from the driver, and no foreign key to orders.
  driver_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid,
  type text not null check (type in ('cod_collected','commission_earned','settlement_paid','adjustment','reversal')),
  amount numeric(12,2) not null,
  affects_cash boolean not null default true,
  reverses_id uuid unique references public.driver_ledger(id) on delete restrict,
  settlement_id uuid,
  note text check (length(note) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint driver_ledger_amount_sign_chk check (
    case type
      when 'cod_collected' then amount >= 0
      when 'commission_earned' then amount <= 0
      when 'settlement_paid' then amount <> 0
      when 'adjustment' then amount <> 0
      else true
    end),
  constraint driver_ledger_reversal_chk check ((type = 'reversal') = (reverses_id is not null)),
  constraint driver_ledger_order_chk check (type not in ('cod_collected','commission_earned') or order_id is not null),
  constraint driver_ledger_adjustment_note_chk check (type <> 'adjustment' or length(trim(coalesce(note, ''))) >= 3)
);
-- A double "delivered" event can never create a second COD or commission entry for the same order.
create unique index driver_ledger_once_per_order on public.driver_ledger(order_id, type)
  where type in ('cod_collected','commission_earned');
create index driver_ledger_driver_idx on public.driver_ledger(driver_id, created_at);
create index driver_ledger_order_idx on public.driver_ledger(order_id) where order_id is not null;
create index driver_ledger_created_idx on public.driver_ledger(created_at);
revoke all on public.driver_ledger from anon, authenticated;
grant select on public.driver_ledger to authenticated;
grant select, insert on public.driver_ledger to service_role;
alter table public.driver_ledger enable row level security;
create policy "ledger driver own or staff read" on public.driver_ledger for select to authenticated
  using (driver_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));

/** Append-only: corrections are reversals or adjustments, never edits. */
create or replace function public._append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception '% is append-only: add a reversal or an adjustment instead', tg_table_name;
end $$;
create trigger driver_ledger_append_only before update or delete on public.driver_ledger
  for each row execute function public._append_only();
create trigger driver_ledger_no_truncate before truncate on public.driver_ledger
  for each statement execute function public._append_only();

/** A reversal mirrors exactly one earlier entry of the same driver and order (and cannot itself be reversed). */
create or replace function public._ledger_validate() returns trigger
language plpgsql set search_path = public as $$
declare o record;
begin
  if new.type = 'reversal' then
    select driver_id, order_id, type, amount, affects_cash into o from public.driver_ledger where id = new.reverses_id;
    if not found or o.type = 'reversal' or o.driver_id <> new.driver_id or new.amount <> -o.amount
       or new.order_id is distinct from o.order_id or new.affects_cash <> o.affects_cash then
      raise exception 'invalid_reversal';
    end if;
  end if;
  return new;
end $$;
create trigger driver_ledger_validate before insert on public.driver_ledger
  for each row execute function public._ledger_validate();

-- 4. Settlements -------------------------------------------------------------------------------------------------
create table public.driver_settlements (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  expected_amount numeric(12,2) not null,
  received_amount numeric(12,2) not null,
  difference numeric(12,2) generated always as (received_amount - expected_amount) stored,
  received_by uuid not null,
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  constraint driver_settlements_period_chk check (period_end >= period_start),
  constraint driver_settlements_note_chk check (
    received_amount = expected_amount or length(trim(coalesce(note, ''))) >= 3)
);
create index driver_settlements_driver_idx on public.driver_settlements(driver_id, created_at desc);
create index driver_settlements_created_idx on public.driver_settlements(created_at);
revoke all on public.driver_settlements from anon, authenticated;
grant select on public.driver_settlements to authenticated;
grant select, insert on public.driver_settlements to service_role;
alter table public.driver_settlements enable row level security;
create policy "settlements driver own or staff read" on public.driver_settlements for select to authenticated
  using (driver_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));
create trigger driver_settlements_append_only before update or delete on public.driver_settlements
  for each row execute function public._append_only();
alter table public.driver_ledger
  add constraint driver_ledger_settlement_fk foreign key (settlement_id) references public.driver_settlements(id);

-- 5. COD confirmations (what the driver says was collected) ------------------------------------------------------
create table public.cod_collections (
  order_id uuid primary key references public.orders(id) on delete cascade,
  driver_id uuid not null references auth.users(id) on delete cascade,
  expected_amount numeric(12,2) not null,
  collected_amount numeric(12,2) not null check (collected_amount >= 0),
  reason text check (length(reason) <= 500),
  review_status text not null default 'ok' check (review_status in ('ok','pending_review','resolved')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text check (length(review_note) <= 500),
  created_at timestamptz not null default now(),
  constraint cod_collections_reason_chk check (
    collected_amount = expected_amount or length(trim(coalesce(reason, ''))) >= 3)
);
create index cod_collections_review_idx on public.cod_collections(created_at) where review_status = 'pending_review';
create index cod_collections_driver_idx on public.cod_collections(driver_id, created_at desc);
revoke all on public.cod_collections from anon, authenticated;
grant select on public.cod_collections to authenticated;
grant all on public.cod_collections to service_role;
alter table public.cod_collections enable row level security;
create policy "cod collections driver own or staff read" on public.cod_collections for select to authenticated
  using (driver_id = (select auth.uid()) or (select public.is_staff((select auth.uid()))));

-- 6. Money helpers ---------------------------------------------------------------------------------------------
/** Commission for one delivery, rounded half away from zero to 2 decimals (numeric: no float error). */
create or replace function public.driver_commission(_type text, _value numeric, _delivery_fee numeric)
returns numeric language sql immutable set search_path = public as $$
  select case _type
    when 'percent_of_delivery_fee' then round(coalesce(_delivery_fee, 0) * coalesce(_value, 0) / 100, 2)
    else round(coalesce(_value, 0), 2)
  end
$$;

/** The store's local day [start, end) for a date. */
create or replace function public.store_day_bounds(_day date, out day_start timestamptz, out day_end timestamptz)
language sql stable security definer set search_path = public as $$
  select (_day::timestamp) at time zone s.timezone, ((_day + 1)::timestamp) at time zone s.timezone
    from public.store_settings s where s.id = 1
$$;
create or replace function public.store_today() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone timezone)::date from public.store_settings where id = 1
$$;
grant execute on function public.store_day_bounds(date) to authenticated;
grant execute on function public.store_today() to authenticated;

/** Serializes money writes per driver (settlement expected amounts are computed from the balance). */
create or replace function public._lock_driver_ledger(_driver uuid) returns void
language sql security definer set search_path = public as $$
  select pg_advisory_xact_lock(hashtext('driver_ledger:' || _driver::text))
$$;

create or replace function public._driver_owed(_driver uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from public.driver_ledger where driver_id = _driver and affects_cash
$$;

-- 7. Delivery -> ledger -------------------------------------------------------------------------------------------
/**
 * Writes the COD and commission entries of a delivered order (once: a second call changes nothing).
 * Returns 'recorded', 'already_recorded' or 'skipped' (not delivered / no driver).
 */
create or replace function public.record_delivery_financials(_order_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare o record; s record; p record; ctype text; cval numeric; n int := 0; c int;
begin
  select id, driver_id, status, payment_method, total, delivery_fee into o from public.orders where id = _order_id;
  if not found or o.status <> 'delivered' or o.driver_id is null then return 'skipped'; end if;
  select driver_commission_type, driver_commission_value, driver_keeps_commission_from_cash into s
    from public.store_settings where id = 1;
  select commission_type, commission_value into p from public.driver_payout_settings where driver_id = o.driver_id;
  ctype := coalesce(p.commission_type, s.driver_commission_type);
  cval := coalesce(p.commission_value, s.driver_commission_value);
  perform public._lock_driver_ledger(o.driver_id);

  insert into public.driver_ledger(driver_id, order_id, type, amount, note)
  values (o.driver_id, o.id, 'cod_collected',
          case when o.payment_method = 'cod' then o.total else 0 end,
          case when o.payment_method = 'cod' then null else 'paid online: nothing to collect' end)
  on conflict (order_id, type) where type in ('cod_collected','commission_earned') do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into public.driver_ledger(driver_id, order_id, type, amount, affects_cash, note)
  values (o.driver_id, o.id, 'commission_earned', -public.driver_commission(ctype, cval, o.delivery_fee),
          s.driver_keeps_commission_from_cash,
          case ctype when 'fixed' then 'fixed ' || cval else cval || '% of delivery fee ' || o.delivery_fee end)
  on conflict (order_id, type) where type in ('cod_collected','commission_earned') do nothing;
  get diagnostics c = row_count; n := n + c;

  return case when n > 0 then 'recorded' else 'already_recorded' end;
end $$;
revoke execute on function public.record_delivery_financials(uuid) from public, anon, authenticated;

/** Reverses an order's COD and commission entries that are not reversed yet. Returns how many were reversed. */
create or replace function public._reverse_order_financials(_order_id uuid, _note text) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select l.* from public.driver_ledger l
            where l.order_id = _order_id and l.type in ('cod_collected','commission_earned')
              and not exists (select 1 from public.driver_ledger x where x.reverses_id = l.id)
            order by l.created_at loop
    perform public._lock_driver_ledger(r.driver_id);
    insert into public.driver_ledger(driver_id, order_id, type, amount, affects_cash, reverses_id, note)
    values (r.driver_id, r.order_id, 'reversal', -r.amount, r.affects_cash, r.id, left(_note, 500))
    on conflict (reverses_id) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function public._reverse_order_financials(uuid, text) from public, anon, authenticated;

create or replace function public._orders_finance_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'delivered' then
      perform public.record_delivery_financials(new.id);
    elsif old.status = 'delivered' then -- cancelled/returned after delivery (if the order flow ever allows it)
      perform public._reverse_order_financials(new.id, 'order ' || new.status || ' after delivery');
    end if;
  end if;
  return null;
end $$;
revoke execute on function public._orders_finance_after() from public, anon, authenticated;
create trigger orders_finance_after after update of status on public.orders
  for each row execute function public._orders_finance_after();

-- 8. Driver marks a COD order delivered with the amount collected -------------------------------------------------
/**
 * The driver confirms what was collected. The expected amount is the order total and cannot be changed here;
 * a different amount needs a reason and flags the order for admin review (the ledger keeps the expected
 * amount until an admin resolves it).
 */
create or replace function public.driver_mark_delivered(_order_id uuid, _collected numeric default null,
                                                         _reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare o record; mismatch boolean := false;
begin
  if not public.is_active_driver(auth.uid()) then raise exception 'forbidden'; end if;
  select id, driver_id, status, payment_method, total into o from public.orders where id = _order_id for update;
  if not found or o.driver_id is distinct from auth.uid() then raise exception 'invalid_transition'; end if;
  if o.status <> 'out_for_delivery' then raise exception 'invalid_transition'; end if;
  if o.payment_method = 'cod' then
    if _collected is null then raise exception 'amount_required'; end if;
    if _collected < 0 or _collected <> round(_collected, 2) then raise exception 'invalid_amount'; end if;
    mismatch := _collected <> o.total;
    if mismatch and length(trim(coalesce(_reason, ''))) < 3 then raise exception 'reason_required'; end if;
    insert into public.cod_collections(order_id, driver_id, expected_amount, collected_amount, reason, review_status)
    values (o.id, o.driver_id, o.total, _collected, case when mismatch then left(trim(_reason), 500) end,
            case when mismatch then 'pending_review' else 'ok' end)
    on conflict (order_id) do nothing;
  end if;
  update public.orders set status = 'delivered',
         payment_status = case when payment_method = 'cod' then 'paid' else payment_status end
   where id = _order_id;
  return case when mismatch then 'flagged' else 'delivered' end;
end $$;
revoke execute on function public.driver_mark_delivered(uuid, numeric, text) from public, anon;
grant execute on function public.driver_mark_delivered(uuid, numeric, text) to authenticated;

-- 9. Balances ---------------------------------------------------------------------------------------------------
/** Per driver, computed from the ledger (RLS applies: a driver sees their own row, staff see all). */
create view public.driver_balance with (security_invoker = true) as
select l.driver_id,
       (coalesce(sum(l.amount) filter (where k.kind = 'cod_collected'), 0))::numeric(12,2) as cash_collected,
       (-coalesce(sum(l.amount) filter (where k.kind = 'commission_earned'), 0))::numeric(12,2) as commission_earned,
       (-coalesce(sum(l.amount) filter (where k.kind = 'settlement_paid'), 0))::numeric(12,2) as settlements_paid,
       (coalesce(sum(l.amount) filter (where k.kind = 'adjustment'), 0))::numeric(12,2) as adjustments,
       -- Cash in hand: collected minus handed over (the commission a driver keeps is part of it).
       (coalesce(sum(l.amount) filter (where k.kind in ('cod_collected','settlement_paid')), 0))::numeric(12,2) as cash_held,
       (coalesce(sum(l.amount) filter (where l.affects_cash), 0))::numeric(12,2) as owed_to_store,
       (-coalesce(sum(l.amount) filter (where not l.affects_cash), 0))::numeric(12,2) as commission_payable,
       max(l.created_at) filter (where k.kind = 'settlement_paid') as last_settlement_at
  from public.driver_ledger l
  left join public.driver_ledger orig on orig.id = l.reverses_id
  cross join lateral (select coalesce(orig.type, l.type) as kind) k
 group by l.driver_id;
grant select on public.driver_balance to authenticated;

-- 10. Admin actions ------------------------------------------------------------------------------------------------
create or replace function public._can_settle(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(_uid, 'admin')
      or (public.is_staff(_uid) and coalesce((select staff_can_record_settlements from public.store_settings where id = 1), false))
$$;

/**
 * Records cash received from a driver. The expected amount is the driver's balance right now; any difference
 * stays on the balance (and on the settlement row) and needs a note. A negative amount means the store paid the
 * driver (balance below zero). Returns the settlement with the balance after it.
 */
create or replace function public.admin_record_settlement(_driver_id uuid, _received_amount numeric, _note text default null)
returns table(settlement_id uuid, expected_amount numeric, received_amount numeric, difference numeric, balance_after numeric)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare exp numeric; started timestamptz; sid uuid;
begin
  if auth.uid() is null or not public._can_settle(auth.uid()) then raise exception 'forbidden'; end if;
  if _received_amount is null or _received_amount = 0 or _received_amount <> round(_received_amount, 2) then
    raise exception 'invalid_amount';
  end if;
  if not exists (select 1 from public.user_roles where user_id = _driver_id and role = 'driver') then raise exception 'not_a_driver'; end if;
  perform public._lock_driver_ledger(_driver_id);
  exp := public._driver_owed(_driver_id);
  if _received_amount <> exp and length(trim(coalesce(_note, ''))) < 3 then raise exception 'note_required'; end if;
  select coalesce(max(s.period_end), (select min(created_at) from public.driver_ledger where driver_id = _driver_id), now())
    into started from public.driver_settlements s where s.driver_id = _driver_id;
  insert into public.driver_settlements(driver_id, period_start, period_end, expected_amount, received_amount, received_by, note)
  values (_driver_id, least(started, now()), now(), exp, _received_amount, auth.uid(), nullif(left(trim(coalesce(_note, '')), 500), ''))
  returning id into sid;
  insert into public.driver_ledger(driver_id, type, amount, settlement_id, note)
  values (_driver_id, 'settlement_paid', -_received_amount, sid, nullif(left(trim(coalesce(_note, '')), 500), ''));
  return query select sid, exp::numeric(12,2), _received_amount::numeric(12,2), (_received_amount - exp)::numeric(12,2),
                      public._driver_owed(_driver_id)::numeric(12,2);
end $$;
revoke execute on function public.admin_record_settlement(uuid, numeric, text) from public, anon;
grant execute on function public.admin_record_settlement(uuid, numeric, text) to authenticated;

/** A manual correction (+ the driver owes more, - less). Admin only; a reason is required. */
create or replace function public.admin_add_adjustment(_driver_id uuid, _amount numeric, _reason text,
                                                        _order_id uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  if length(trim(coalesce(_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  if _amount is null or _amount = 0 or _amount <> round(_amount, 2) then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from public.user_roles where user_id = _driver_id and role = 'driver') then raise exception 'not_a_driver'; end if;
  perform public._lock_driver_ledger(_driver_id);
  insert into public.driver_ledger(driver_id, order_id, type, amount, note)
  values (_driver_id, _order_id, 'adjustment', _amount, left(trim(_reason), 500)) returning driver_ledger.id into _id;
  return _id;
end $$;
revoke execute on function public.admin_add_adjustment(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.admin_add_adjustment(uuid, numeric, text, uuid) to authenticated;

/** A delivery that did not really happen (refused at the door, marked by mistake): reverses its entries. */
create or replace function public.admin_reverse_delivery(_order_id uuid, _reason text) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  if length(trim(coalesce(_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  return public._reverse_order_financials(_order_id, trim(_reason));
end $$;
revoke execute on function public.admin_reverse_delivery(uuid, text) from public, anon;
grant execute on function public.admin_reverse_delivery(uuid, text) to authenticated;

/**
 * Closes the review of a COD amount mismatch. A non-zero _adjustment is written to the ledger for the order
 * (e.g. -50 when the customer really paid 50 less and the store accepts it).
 */
create or replace function public.admin_resolve_cod_review(_order_id uuid, _adjustment numeric default 0,
                                                            _note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  select * into c from public.cod_collections where order_id = _order_id for update;
  if not found or c.review_status <> 'pending_review' then raise exception 'not_pending'; end if;
  if length(trim(coalesce(_note, ''))) < 3 then raise exception 'note_required'; end if;
  if coalesce(_adjustment, 0) <> 0 then
    perform public.admin_add_adjustment(c.driver_id, _adjustment, _note, _order_id);
  end if;
  update public.cod_collections set review_status = 'resolved', reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = left(trim(_note), 500)
   where order_id = _order_id;
end $$;
revoke execute on function public.admin_resolve_cod_review(uuid, numeric, text) from public, anon;
grant execute on function public.admin_resolve_cod_review(uuid, numeric, text) to authenticated;

-- 11. Reports -----------------------------------------------------------------------------------------------------
/** Ledger entries with order numbers, for the driver (own) or staff (anyone). Filters are optional. */
create or replace function public.driver_ledger_entries(_driver_id uuid, _from timestamptz default null,
                                                         _to timestamptz default null, _types text[] default null)
returns table(id uuid, created_at timestamptz, type text, kind text, amount numeric, affects_cash boolean,
              order_id uuid, order_number bigint, payment_method text, note text, settlement_id uuid)
language sql stable security definer set search_path = public as $$
  select l.id, l.created_at, l.type, coalesce(orig.type, l.type), l.amount, l.affects_cash, l.order_id,
         o.order_number, o.payment_method, l.note, l.settlement_id
    from public.driver_ledger l
    left join public.driver_ledger orig on orig.id = l.reverses_id
    left join public.orders o on o.id = l.order_id
   where l.driver_id = _driver_id
     and (_driver_id = auth.uid() or public.is_staff(auth.uid()))
     and (_from is null or l.created_at >= _from) and (_to is null or l.created_at < _to)
     and (_types is null or l.type = any(_types))
   order by l.created_at desc, l.id
   limit 2000
$$;
revoke execute on function public.driver_ledger_entries(uuid, timestamptz, timestamptz, text[]) from public, anon;
grant execute on function public.driver_ledger_entries(uuid, timestamptz, timestamptz, text[]) to authenticated;

/** Per store-local day, newest first: deliveries, cash, commission, settlements, adjustments, net change. */
create or replace function public.driver_daily_summary(_driver_id uuid, _days integer default 14)
returns table(day date, orders_delivered integer, cash_collected numeric, commission_earned numeric,
              settlements_paid numeric, adjustments numeric, net_to_store numeric)
language sql stable security definer set search_path = public as $$
  with tz as (select timezone from public.store_settings where id = 1),
  e as (
    select (l.created_at at time zone tz.timezone)::date as d, coalesce(orig.type, l.type) as kind, l.type, l.amount,
           l.affects_cash, l.order_id
      from public.driver_ledger l
      cross join tz
      left join public.driver_ledger orig on orig.id = l.reverses_id
     where l.driver_id = _driver_id
       and (_driver_id = auth.uid() or public.is_staff(auth.uid()))
       and l.created_at >= now() - make_interval(days => least(greatest(_days, 1), 366) + 1)
  )
  select d,
         (count(distinct order_id) filter (where type = 'cod_collected'))::int
           - (count(distinct order_id) filter (where type = 'reversal' and kind = 'cod_collected'))::int,
         coalesce(sum(amount) filter (where kind = 'cod_collected'), 0),
         -coalesce(sum(amount) filter (where kind = 'commission_earned'), 0),
         -coalesce(sum(amount) filter (where kind = 'settlement_paid'), 0),
         coalesce(sum(amount) filter (where kind = 'adjustment'), 0),
         coalesce(sum(amount) filter (where affects_cash), 0)
    from e group by d order by d desc
$$;
revoke execute on function public.driver_daily_summary(uuid, integer) from public, anon;
grant execute on function public.driver_daily_summary(uuid, integer) to authenticated;

/**
 * One row per driver for a store-local day (default today): the day's figures plus balances right now and the
 * alerts (over the cash limit; a balance left unsettled from before that day). Staff only.
 */
create or replace function public.admin_driver_cash(_day date default null)
returns table(driver_id uuid, full_name text, phone text, is_active boolean, orders_delivered integer,
              cod_total numeric, commission_earned numeric, settlements_paid numeric, adjustments numeric,
              cash_held numeric, owed_to_store numeric, commission_payable numeric, last_settlement_at timestamptz,
              over_limit boolean, unsettled_from_before boolean, pending_reviews integer)
language sql stable security definer set search_path = public as $$
  with s as (select driver_cash_limit as lim from public.store_settings where id = 1),
  b as (select * from public.store_day_bounds(coalesce(_day, public.store_today()))),
  drivers as (
    select dp.user_id as id, dp.is_active, p.full_name, p.phone
      from public.driver_profiles dp
      left join public.profiles p on p.id = dp.user_id
     where exists (select 1 from public.user_roles ur where ur.user_id = dp.user_id and ur.role = 'driver')
  ),
  e as (
    select l.driver_id, l.created_at, l.type, coalesce(orig.type, l.type) as kind, l.amount, l.affects_cash, l.order_id
      from public.driver_ledger l
      left join public.driver_ledger orig on orig.id = l.reverses_id
  )
  , r(id, full_name, phone, is_active, n, cod, comm, settled, adj, held, owed, payable, last_at, over, carried,
       reviews) as (
    select d.id, d.full_name, d.phone, d.is_active,
           coalesce((select (count(distinct order_id) filter (where type = 'cod_collected'))::int
                          - (count(distinct order_id) filter (where type = 'reversal' and kind = 'cod_collected'))::int
                       from e, b where e.driver_id = d.id and e.created_at >= b.day_start and e.created_at < b.day_end), 0),
           coalesce((select sum(amount) from e, b where e.driver_id = d.id and kind = 'cod_collected'
                       and e.created_at >= b.day_start and e.created_at < b.day_end), 0),
           -coalesce((select sum(amount) from e, b where e.driver_id = d.id and kind = 'commission_earned'
                       and e.created_at >= b.day_start and e.created_at < b.day_end), 0),
           -coalesce((select sum(amount) from e, b where e.driver_id = d.id and kind = 'settlement_paid'
                       and e.created_at >= b.day_start and e.created_at < b.day_end), 0),
           coalesce((select sum(amount) from e, b where e.driver_id = d.id and kind = 'adjustment'
                       and e.created_at >= b.day_start and e.created_at < b.day_end), 0),
           coalesce((select sum(amount) from e where e.driver_id = d.id and kind in ('cod_collected','settlement_paid')), 0),
           coalesce((select sum(amount) from e where e.driver_id = d.id and affects_cash), 0),
           -coalesce((select sum(amount) from e where e.driver_id = d.id and not affects_cash), 0),
           (select max(created_at) from e where e.driver_id = d.id and kind = 'settlement_paid'),
           (select s.lim > 0 from s)
             and coalesce((select sum(amount) from e where e.driver_id = d.id and kind in ('cod_collected','settlement_paid')), 0)
                 > (select lim from s),
           -- Owed at the start of the day, minus what was settled since: something carried over unpaid.
           coalesce((select sum(amount) from e, b where e.driver_id = d.id and affects_cash and e.created_at < b.day_start), 0)
             + coalesce((select sum(amount) from e, b where e.driver_id = d.id and kind = 'settlement_paid'
                           and e.created_at >= b.day_start), 0) > 0,
           (select count(*)::int from public.cod_collections c where c.driver_id = d.id and c.review_status = 'pending_review')
      from drivers d
     where public.is_staff(auth.uid())
  )
  select r.id, r.full_name, r.phone, r.is_active, r.n, r.cod::numeric(12,2), r.comm::numeric(12,2),
         r.settled::numeric(12,2), r.adj::numeric(12,2), r.held::numeric(12,2), r.owed::numeric(12,2),
         r.payable::numeric(12,2), r.last_at, r.over, r.carried, r.reviews
    from r
   order by r.owed desc, r.full_name
$$;
revoke execute on function public.admin_driver_cash(date) from public, anon;
grant execute on function public.admin_driver_cash(date) to authenticated;
