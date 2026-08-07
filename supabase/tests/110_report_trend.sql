-- 110_report_trend.sql — the companion RPC behind the trend chart.
--
-- architecture-spec §3.4; plan §4 Phase 2 (migration 0011). Not named in plan
-- §5.2's fixture list, which would have left the second reporting RPC entirely
-- unexercised while the phase it belongs to closed as green.
--
-- The property that matters most is the LAST one asserted here: every figure in
-- the trend is the figure report_period produces for the same month. Two numbers
-- for one month on one screen, computed two ways, is how a dashboard starts
-- contradicting itself.
--
-- Dates are relative to store_today() throughout, so this file keeps meaning
-- next month.

begin;
create extension if not exists pgtap;
select plan(11);

delete from article_category;

insert into article_category (id, name, description, sort_order)
values ('7d7d0000-0000-0000-0000-000000000001', 'Trend', 'x', 10);
insert into markup_rate (category_id, markup_pct, effective_from)
values ('7d7d0000-0000-0000-0000-000000000001', 20, '2020-01-01');

-- One window covering the whole of last month exactly: 300 of goods sold, with
-- nothing to prorate.
insert into stock_count (category_id, occurred_on, value_at_cost, source) values
  ('7d7d0000-0000-0000-0000-000000000001',
   (date_trunc('month', store_today()::timestamp) - interval '1 month')::date,
   1000, 'standalone'),
  ('7d7d0000-0000-0000-0000-000000000001',
   date_trunc('month', store_today()::timestamp)::date,
   700, 'standalone');

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------

select is(jsonb_typeof(report_trend(12)), 'array',
          'the trend is a plain array the chart can map over');

select is(jsonb_array_length(report_trend(12)), 12,
          'twelve months by default');

select is(jsonb_array_length(report_trend(3)), 3,
          'and as many as asked for');

select is(jsonb_array_length(report_trend(0)), 1,
          'a nonsensical zero clamps to one month rather than returning nothing');

select is(jsonb_array_length(report_trend(999)), 60,
          'and an unbounded request clamps to five years');

select is(
  (select count(*)::int from jsonb_array_elements(report_trend(12)) e
   where not (e ?& array['month','from','to','effective_to','goods_sold_at_cost',
        'revenue_est','gross_profit_est','operating_profit_est',
        'net_cash_change_est','operating_charges','cash_out','coverage_pct'])),
  0, 'every month carries every key the chart reads');

-- ---------------------------------------------------------------------------
-- Ordering and the partial current month
-- ---------------------------------------------------------------------------

select is(
  (report_trend(12) -> 11 ->> 'month'),
  to_char(store_today(), 'YYYY-MM'),
  'the series ends with the month containing today');

select is(
  (report_trend(12) -> 0 ->> 'month'),
  to_char((date_trunc('month', store_today()::timestamp) - interval '11 months')::date,
          'YYYY-MM'),
  'and begins eleven months earlier — oldest first');

select is(
  (report_trend(12) -> 11 ->> 'effective_to')::date,
  store_today(),
  'the current month is clamped to today, so a partial month is not read as a collapse in trade');

-- ---------------------------------------------------------------------------
-- The figures are report_period's figures
-- ---------------------------------------------------------------------------

select is(
  (select (e ->> 'goods_sold_at_cost')::numeric
   from jsonb_array_elements(report_trend(12)) e
   where e ->> 'month'
       = to_char((date_trunc('month', store_today()::timestamp) - interval '1 month')::date,
                 'YYYY-MM')),
  300.00::numeric,
  'last month reports the whole 300 — its window aligns with the month exactly');

select is(
  (select jsonb_build_array(e -> 'goods_sold_at_cost', e -> 'revenue_est',
                            e -> 'gross_profit_est', e -> 'coverage_pct')
   from jsonb_array_elements(report_trend(12)) e
   where e ->> 'month'
       = to_char((date_trunc('month', store_today()::timestamp) - interval '1 month')::date,
                 'YYYY-MM')),
  (select jsonb_build_array(d -> 'modelled' -> 'goods_sold_at_cost',
                            d -> 'modelled' -> 'revenue_est',
                            d -> 'modelled' -> 'gross_profit_est',
                            d -> 'coverage' -> 'pct')
   from (select report_period(
           (date_trunc('month', store_today()::timestamp) - interval '1 month')::date,
           (date_trunc('month', store_today()::timestamp) - interval '1 day')::date) as d) x),
  'the trend and the dashboard cannot disagree — same month, same numbers');

select * from finish();
rollback;
