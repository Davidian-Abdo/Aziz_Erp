-- 100_report_shape.sql — the document's shape, its arithmetic identities, and
-- the rounding rule.
--
-- plan §5.2, §2.14; domain-spec §9.5; architecture-spec §3.4.
--
-- The client parses this document with Zod at the boundary and does no
-- arithmetic on money. That only works if the shape is stable and every money
-- key is a number rather than a null — a null propagating into a React
-- component renders as an empty KPI, which reads as "zero profit" rather than
-- "we do not know".
--
-- The rounding ledger below is chosen so the fractions actually bite: three
-- categories each allocating 3/7 of a window, which is a repeating decimal.

begin;
create extension if not exists pgtap;
select plan(31);

delete from article_category;

insert into article_category (id, name, description, sort_order) values
  ('0f0f0000-0000-0000-0000-000000000001', 'P1', 'x', 10),
  ('0f0f0000-0000-0000-0000-000000000002', 'P2', 'x', 20),
  ('0f0f0000-0000-0000-0000-000000000003', 'P3', 'x', 30),
  ('0f0f0000-0000-0000-0000-000000000004', 'P4 pertes', 'x', 40);

insert into markup_rate (category_id, markup_pct, effective_from)
select id, 20, '2025-01-01' from article_category;

delete from charge_category;
insert into charge_category (id, name, nature, sort_order) values
  ('0f0f0000-0000-0000-0000-0000000000c1', 'Loyer test',     'operating',  10),
  ('0f0f0000-0000-0000-0000-0000000000c2', 'Retrait test',   'owner_draw', 20);

-- Each window runs 1 → 8 January (7 days); the period asks for 1 → 3 January,
-- so each allocates exactly 3/7 of its goods sold.
insert into stock_count (category_id, occurred_on, value_at_cost, source) values
  ('0f0f0000-0000-0000-0000-000000000001', '2026-01-01', 1000, 'standalone'),
  ('0f0f0000-0000-0000-0000-000000000001', '2026-01-08',    0, 'standalone'),
  ('0f0f0000-0000-0000-0000-000000000002', '2026-01-01',  500, 'standalone'),
  ('0f0f0000-0000-0000-0000-000000000002', '2026-01-08',    0, 'standalone'),
  ('0f0f0000-0000-0000-0000-000000000003', '2026-01-01',  100, 'standalone'),
  ('0f0f0000-0000-0000-0000-000000000003', '2026-01-08',    0, 'standalone');

-- Losses and charges on a category with no counts, so the measured figures are
-- non-zero without disturbing the allocation arithmetic above.
insert into stock_loss (category_id, occurred_on, amount_at_cost, reason) values
  ('0f0f0000-0000-0000-0000-000000000004', '2026-01-02', 30, 'spoiled'),
  ('0f0f0000-0000-0000-0000-000000000004', '2026-01-02', 20, 'family_taken');

insert into charge (charge_category_id, occurred_on, amount) values
  ('0f0f0000-0000-0000-0000-0000000000c1', '2026-01-02', 100),
  ('0f0f0000-0000-0000-0000-0000000000c2', '2026-01-02',  50);

create temporary table doc as
select report_period('2026-01-01', '2026-01-03') as d;

create temporary table empty_doc as
select report_period('2020-01-01', '2020-01-31') as d;

-- ---------------------------------------------------------------------------
-- Every documented key is present, and typed
-- ---------------------------------------------------------------------------

select ok(
  (select d ?& array['period','measured','modelled','coverage',
                     'by_category','charges_by_category','stock_on_hand'] from doc),
  'every top-level key of architecture-spec §3.4 is present');

select ok(
  (select d -> 'period' ?& array['from','to','effective_to','clamped','days'] from doc),
  'period carries the requested range, the effective end, and the day count');

select ok(
  (select d -> 'measured' ?& array['purchases_total','operating_charges',
       'owner_draws_cash','shrinkage_losses','owner_draws_in_kind','cash_out'] from doc),
  'measured carries all six figures of domain-spec §6.1');

select is(
  (select count(*)::int from doc, jsonb_each(d -> 'measured') e
   where jsonb_typeof(e.value) <> 'number'),
  0, 'and every one of them is a number');

select ok(
  (select d -> 'modelled' ?& array['goods_sold_at_cost','revenue_est','gross_profit_est',
       'operating_profit_est','net_cash_change_est','cost_incurred'] from doc),
  'modelled carries the whole profit chain of domain-spec §6.6');

select is(
  (select count(*)::int from doc, jsonb_each(d -> 'modelled') e
   where jsonb_typeof(e.value) <> 'number'),
  0, 'and every one of them is a number — never a null from a missing rate');

select ok(
  (select d -> 'coverage' ?& array['pct','level','categories_never_counted',
       'categories_stale','unsettled_purchases','anomalies'] from doc),
  'coverage carries everything the data-quality panel renders');

select is(
  (select jsonb_typeof(d -> 'coverage' -> 'pct') || '/' ||
          jsonb_typeof(d -> 'coverage' -> 'level') from doc),
  'number/string', 'coverage.pct is a number and coverage.level a string');

select is(
  (select jsonb_typeof(d -> 'coverage' -> 'anomalies') || '/' ||
          jsonb_typeof(d -> 'coverage' -> 'categories_stale') || '/' ||
          jsonb_typeof(d -> 'coverage' -> 'categories_never_counted') from doc),
  'array/array/array', 'the three lists are always arrays');

select is(
  (select jsonb_typeof(d -> 'by_category') || '/' ||
          jsonb_typeof(d -> 'charges_by_category') from doc),
  'array/array', 'by_category and charges_by_category are always arrays');

select is(
  (select count(*)::int from doc, jsonb_array_elements(d -> 'by_category') r
   where not (r ?& array['category_id','name','last_count_value','last_count_on',
        'days_since_count','purchases_in_period','losses_in_period','markup_pct',
        'goods_sold_at_cost','revenue_est','gross_profit_est','settled_days',
        'coverage_pct','unsettled_purchases'])),
  0, 'every category row carries every documented key');

select is(
  (select count(*)::int from doc, jsonb_array_elements(d -> 'by_category') r,
        jsonb_each(r) k
   where k.key in ('purchases_in_period','losses_in_period','goods_sold_at_cost',
                   'revenue_est','gross_profit_est','settled_days','coverage_pct',
                   'unsettled_purchases')
     and jsonb_typeof(k.value) <> 'number'),
  0, 'and every money or day figure on a category row is a number');

select ok(
  (select d -> 'stock_on_hand' ?& array['total_last_counted','oldest_count_on',
                                        'max_possible'] from doc),
  'stock_on_hand carries the counted figure, its date, and the upper bound');

-- ---------------------------------------------------------------------------
-- Rounding: the table on screen adds up to the KPI above it (domain-spec §9.5)
-- ---------------------------------------------------------------------------

select is(
  (select sum((r ->> 'goods_sold_at_cost')::numeric)
   from doc, jsonb_array_elements(d -> 'by_category') r),
  (select (d -> 'modelled' ->> 'goods_sold_at_cost')::numeric from doc),
  'the category rows sum EXACTLY to the goods-sold KPI');

select is(
  (select sum((r ->> 'gross_profit_est')::numeric)
   from doc, jsonb_array_elements(d -> 'by_category') r),
  (select (d -> 'modelled' ->> 'gross_profit_est')::numeric from doc),
  'and to the gross-profit KPI');

select is(
  (select sum((r ->> 'revenue_est')::numeric)
   from doc, jsonb_array_elements(d -> 'by_category') r),
  (select (d -> 'modelled' ->> 'revenue_est')::numeric from doc),
  'and to the revenue KPI');

select is(
  (select count(*)::int from doc, jsonb_array_elements(d -> 'by_category') r
   where (r ->> 'revenue_est')::numeric
         <> (r ->> 'goods_sold_at_cost')::numeric + (r ->> 'gross_profit_est')::numeric),
  0, 'and each row is internally consistent: revenue = cost + margin');

-- The documented consequence, asserted rather than left as a claim. The
-- unrounded truth is 1,600 × 3/7 = 685.714…, which rounds to 685.71. The total
-- reports 685.72 because it is the sum of three already-rounded rows. A cent of
-- drift from the truth buys a column that adds up, and that is the intended trade.
select is(
  (select (d -> 'modelled' ->> 'goods_sold_at_cost')::numeric from doc),
  685.72::numeric,
  'the total is the sum of the rounded parts (685.72), not the rounded sum (685.71)');

-- ---------------------------------------------------------------------------
-- The identities of the profit chain
-- ---------------------------------------------------------------------------

select is(
  (select (d -> 'modelled' ->> 'operating_profit_est')::numeric from doc),
  (select (d -> 'modelled' ->> 'gross_profit_est')::numeric
        - (d -> 'measured' ->> 'operating_charges')::numeric
        - (d -> 'measured' ->> 'shrinkage_losses')::numeric from doc),
  'operating profit = gross profit − operating charges − shrinkage');

select is(
  (select (d -> 'modelled' ->> 'net_cash_change_est')::numeric from doc),
  (select (d -> 'modelled' ->> 'operating_profit_est')::numeric
        - (d -> 'measured' ->> 'owner_draws_cash')::numeric
        - (d -> 'measured' ->> 'owner_draws_in_kind')::numeric from doc),
  'net cash change = operating profit − both kinds of owner draw');

select is(
  (select (d -> 'modelled' ->> 'cost_incurred')::numeric from doc),
  (select (d -> 'modelled' ->> 'goods_sold_at_cost')::numeric
        + (d -> 'measured' ->> 'operating_charges')::numeric
        + (d -> 'measured' ->> 'shrinkage_losses')::numeric from doc),
  'cost incurred = goods sold + operating charges + shrinkage (domain-spec §6.7)');

select is(
  (select (d -> 'measured' ->> 'cash_out')::numeric from doc),
  (select (d -> 'measured' ->> 'purchases_total')::numeric
        + (d -> 'measured' ->> 'operating_charges')::numeric
        + (d -> 'measured' ->> 'owner_draws_cash')::numeric from doc),
  'cash out = purchases + all charges — what left the wallet');

-- The two kinds of "spent" are never merged: an owner draw in kind is not a
-- shrinkage loss, and neither is a charge.
select is(
  (select (d -> 'measured' ->> 'shrinkage_losses')::numeric || '/' ||
          (d -> 'measured' ->> 'owner_draws_in_kind')::numeric from doc),
  '30.00/20.00',
  '"the store lost 30" and "I took 20 home" stay separate figures');

-- ---------------------------------------------------------------------------
-- An empty period returns ZEROS, not nulls
--
-- A null money key renders as a blank KPI, which reads as "zero profit" rather
-- than "no data" — the difference between a quiet month and a broken app.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from empty_doc, jsonb_each(d -> 'measured') e
   where jsonb_typeof(e.value) <> 'number'),
  0, 'an empty period still returns six measured NUMBERS');

select is(
  (select count(*)::int from empty_doc, jsonb_each(d -> 'modelled') e
   where jsonb_typeof(e.value) <> 'number'),
  0, 'and six modelled numbers');

select is(
  (select (d -> 'measured' ->> 'purchases_total')::numeric
        + (d -> 'modelled' ->> 'goods_sold_at_cost')::numeric
        + (d -> 'modelled' ->> 'revenue_est')::numeric from empty_doc),
  0.00::numeric, 'and they are zero');

select is(
  (select (d -> 'coverage' ->> 'pct')::numeric from empty_doc),
  0.0::numeric, 'coverage over a period with no counts is 0%, not null');

select is(
  (select jsonb_array_length(d -> 'coverage' -> 'anomalies')
        + jsonb_array_length(d -> 'coverage' -> 'categories_stale') from empty_doc),
  0, 'the lists are empty arrays rather than nulls');

select is(
  (select count(*)::int from empty_doc, jsonb_array_elements(d -> 'by_category') r
   where (r ->> 'goods_sold_at_cost')::numeric <> 0
      or (r ->> 'coverage_pct')::numeric <> 0),
  0, 'every category row reads zero rather than empty');

select is(
  (select (d -> 'stock_on_hand' ->> 'total_last_counted')::numeric from empty_doc),
  0.00::numeric, 'nothing counted yet means a stock value of zero');

select is(
  (select jsonb_typeof(d -> 'stock_on_hand' -> 'oldest_count_on') from empty_doc),
  'null',
  'but the DATE is honestly null — there is no oldest count, and 1970 would be a lie');

select * from finish();
rollback;
