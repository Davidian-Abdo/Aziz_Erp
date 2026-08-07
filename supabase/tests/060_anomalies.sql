-- 060_anomalies.sql — the three kinds, and the exclusion that is easy to miss.
--
-- plan §5.2, §2.10; domain-spec §6.2.
--
-- An anomalous window is excluded from the profit chain AND its days do not
-- count as settled. BOTH halves matter. Without the second, a period full of
-- data errors reports 100% coverage while contributing no profit — precisely
-- inverted from the truth, and the most confident possible way to be wrong.
--
-- Nothing here is ever silently clamped to zero. The numbers cannot be true;
-- saying so, and naming the record that caused it, is the entire point.

begin;
create extension if not exists pgtap;
select plan(15);

delete from article_category;

insert into article_category (id, name, description, sort_order) values
  ('aaaa0000-0000-0000-0000-000000000001', 'A negatif',     'x', 10),
  ('aaaa0000-0000-0000-0000-000000000002', 'B pertes',      'x', 20),
  ('aaaa0000-0000-0000-0000-000000000003', 'C sans marge',  'x', 30),
  ('aaaa0000-0000-0000-0000-000000000004', 'D correct',     'x', 40);

-- C deliberately gets NO markup_rate row. That is the no_markup anomaly.
insert into markup_rate (category_id, markup_pct, effective_from) values
  ('aaaa0000-0000-0000-0000-000000000001', 20, '2025-01-01'),
  ('aaaa0000-0000-0000-0000-000000000002', 20, '2025-01-01'),
  ('aaaa0000-0000-0000-0000-000000000004', 20, '2025-01-01');

-- A — the shelf ends fuller than it started with nothing bought: a mistyped
--     count, a missing purchase, or a wrong date.
insert into stock_count (category_id, occurred_on, value_at_cost, source) values
  ('aaaa0000-0000-0000-0000-000000000001', '2026-01-01', 1000, 'standalone'),
  ('aaaa0000-0000-0000-0000-000000000001', '2026-01-20', 1500, 'standalone');

-- B — 100 left the shelf and 200 was declared lost from it.
insert into stock_count (category_id, occurred_on, value_at_cost, source) values
  ('aaaa0000-0000-0000-0000-000000000002', '2026-01-01', 1000, 'standalone'),
  ('aaaa0000-0000-0000-0000-000000000002', '2026-01-20',  900, 'standalone');
insert into stock_loss (category_id, occurred_on, amount_at_cost, reason)
values ('aaaa0000-0000-0000-0000-000000000002', '2026-01-10', 200, 'spoiled');

-- C — an entirely ordinary 200 of trade that cannot be valued.
insert into stock_count (category_id, occurred_on, value_at_cost, source) values
  ('aaaa0000-0000-0000-0000-000000000003', '2026-01-01', 1000, 'standalone'),
  ('aaaa0000-0000-0000-0000-000000000003', '2026-01-20',  800, 'standalone');

-- D — the control. 200 sold at 20%.
insert into stock_count (category_id, occurred_on, value_at_cost, source) values
  ('aaaa0000-0000-0000-0000-000000000004', '2026-01-01', 1000, 'standalone'),
  ('aaaa0000-0000-0000-0000-000000000004', '2026-01-20',  800, 'standalone');

-- ---------------------------------------------------------------------------
-- The window is flagged with the right kind
-- ---------------------------------------------------------------------------

select is(
  (select anomaly from v_count_window where category_id = 'aaaa0000-0000-0000-0000-000000000001'),
  'negative_outflow', 'the closing count exceeds opening plus purchases');

select is(
  (select anomaly from v_count_window where category_id = 'aaaa0000-0000-0000-0000-000000000002'),
  'losses_exceed_outflow', 'declared losses exceed everything that left the shelf');

select is(
  (select anomaly from v_count_window where category_id = 'aaaa0000-0000-0000-0000-000000000003'),
  'no_markup', 'a category with no markup row at all');

select is(
  (select anomaly from v_count_window where category_id = 'aaaa0000-0000-0000-0000-000000000004'),
  null, 'the control window is not flagged');

-- The arithmetic is reported as it stands, never clamped.
select is(
  (select goods_sold_at_cost from v_count_window
   where category_id = 'aaaa0000-0000-0000-0000-000000000001'),
  -500.00::numeric, 'the negative figure is preserved, not clamped to zero');

-- ---------------------------------------------------------------------------
-- Excluded from the profit chain
-- ---------------------------------------------------------------------------

select is(
  (report_period('2026-01-01', '2026-01-31') -> 'modelled' ->> 'goods_sold_at_cost')::numeric,
  200.00::numeric, 'only the unflagged window contributes goods sold');

select is(
  (report_period('2026-01-01', '2026-01-31') -> 'modelled' ->> 'gross_profit_est')::numeric,
  40.00::numeric, 'and only its margin — 200 at 20%');

select is(
  (select r ->> 'goods_sold_at_cost'
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31') -> 'by_category') r
   where r ->> 'name' = 'C sans marge')::numeric,
  0.00::numeric,
  'a category with no rate contributes nothing rather than a guessed valuation');

-- ---------------------------------------------------------------------------
-- Excluded from SETTLED DAYS — the half that is easy to miss
-- ---------------------------------------------------------------------------

select is(
  (select array_agg((r ->> 'settled_days')::int order by r ->> 'name')
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31') -> 'by_category') r),
  array[0, 0, 0, 19],
  'the three flagged categories settle no days at all; only the control does');

select is(
  (report_period('2026-01-01', '2026-01-31') -> 'coverage' ->> 'pct')::numeric,
  15.3::numeric,
  'coverage reads 15.3%, not 100% — a period of data errors is NOT well covered');

select is(
  (report_period('2026-01-01', '2026-01-31') -> 'coverage' ->> 'level'),
  'low', 'and it is labelled "low", which is the honest reading');

-- ---------------------------------------------------------------------------
-- Surfaced, with the record that caused them
-- ---------------------------------------------------------------------------

select is(
  jsonb_array_length(report_period('2026-01-01', '2026-01-31') -> 'coverage' -> 'anomalies'),
  3, 'all three anomalies appear in the data-quality panel');

select is(
  (select array_agg(a ->> 'kind' order by a ->> 'category')
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31')
                             -> 'coverage' -> 'anomalies') a),
  array['negative_outflow', 'losses_exceed_outflow', 'no_markup'],
  'each is named by kind, because each has a different fix');

select is(
  (select a ->> 'category_id'
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31')
                             -> 'coverage' -> 'anomalies') a
   where a ->> 'kind' = 'negative_outflow'),
  'aaaa0000-0000-0000-0000-000000000001',
  'and carries the category id, so the panel can link to the offending record');

-- ---------------------------------------------------------------------------
-- A measured fact stays measured even when its window is excluded
-- ---------------------------------------------------------------------------

select is(
  (report_period('2026-01-01', '2026-01-31') -> 'measured' ->> 'shrinkage_losses')::numeric,
  200.00::numeric,
  'B''s declared loss is still a fact — exclusion touches the model, not the record');

select * from finish();
rollback;
