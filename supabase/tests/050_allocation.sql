-- 050_allocation.sql — THE most important test in the suite.
--
-- plan §5.2, §2.1; domain-spec §6.3 and the normative worked example of §10;
-- plan_review R1.
--
-- Two calendars meet here and the specs got it wrong once already: count
-- windows are half-open [open_on, close_on) while the requested period is
-- inclusive of B, and an earlier draft mixed the two — computing window 2's
-- overlap as 11 days while still claiming 19 + 11 = 31 of 31 days settled.
-- Both could not be true. If these figures and domain-spec §10 ever disagree,
-- this file is right.
--
-- A wrong number here is worse than a crash, because nobody notices.

begin;
create extension if not exists pgtap;
select plan(24);

delete from article_category;

-- ---------------------------------------------------------------------------
-- Part A — the day arithmetic on its own, against the period [1 Jan, 31 Jan]
--
-- Every geometry the plan requires: wholly inside, wholly outside at each end,
-- overlapping each end, spanning the whole period, one day, and zero days.
-- ---------------------------------------------------------------------------

select is(window_overlap_days('2026-01-05', '2026-01-15', '2026-01-01', '2026-01-31'),
          10, 'a window wholly inside the period contributes all its days');

select is(window_overlap_days('2025-12-01', '2025-12-20', '2026-01-01', '2026-01-31'),
          0, 'a window wholly before the period contributes nothing');

select is(window_overlap_days('2026-02-05', '2026-02-20', '2026-01-01', '2026-01-31'),
          0, 'a window wholly after the period contributes nothing');

select is(window_overlap_days('2025-12-25', '2026-01-10', '2026-01-01', '2026-01-31'),
          9, 'a window overlapping the start contributes only the days inside');

select is(window_overlap_days('2026-01-25', '2026-02-10', '2026-01-01', '2026-01-31'),
          7, 'a window overlapping the end contributes 25–31 Jan, i.e. 7 days');

select is(window_overlap_days('2025-12-01', '2026-02-15', '2026-01-01', '2026-01-31'),
          31, 'a window spanning the whole period contributes all 31 days');

select is(window_overlap_days('2026-01-10', '2026-01-11', '2026-01-01', '2026-01-31'),
          1, 'a one-day window contributes one day');

-- plan_review R1. Without this branch the general formula returns 0 here, the
-- denominator floors to 1, and the window''s goods sold are multiplied by zero:
-- real money disappears from every report with nothing flagged.
select is(window_overlap_days('2026-01-10', '2026-01-10', '2026-01-01', '2026-01-31'),
          1, 'a ZERO-length window inside the period is allocated whole');

select is(window_overlap_days('2026-02-10', '2026-02-10', '2026-01-01', '2026-01-31'),
          0, 'a zero-length window outside the period contributes nothing');

select is(window_overlap_days('2026-01-01', '2026-01-20', '2026-01-01', '2026-01-31'),
          19, '§10 window 1 — 1 Jan to 20 Jan is 19 days, half-open');

select is(window_overlap_days('2026-01-20', '2026-02-05', '2026-01-01', '2026-01-31'),
          12, '§10 window 2 — 20–31 Jan inclusive is 12 days, NOT 11');

-- ---------------------------------------------------------------------------
-- Part B — the normative example of domain-spec §10, end to end.
--
--   Beverages, markup 20%, period 1–31 January.
--   Counts:    1 Jan → 2,000 · 20 Jan → 1,500 · 5 Feb → 900
--   Purchases: 8 Jan → 3,000 · 25 Jan → 2,500
--   Losses:   15 Jan →   200 (spoiled)
-- ---------------------------------------------------------------------------

insert into article_category (id, name, description, sort_order)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'Beverages', 'eau, sodas', 10);
insert into markup_rate (category_id, markup_pct, effective_from)
values ('bbbbbbbb-0000-0000-0000-000000000001', 20, '2025-01-01');

insert into stock_count (category_id, occurred_on, value_at_cost, source) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '2026-01-01', 2000, 'standalone'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '2026-01-20', 1500, 'standalone'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '2026-02-05',  900, 'standalone');

insert into purchase (category_id, occurred_on, amount_at_cost) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '2026-01-08', 3000),
  ('bbbbbbbb-0000-0000-0000-000000000001', '2026-01-25', 2500);

insert into stock_loss (category_id, occurred_on, amount_at_cost, reason)
values ('bbbbbbbb-0000-0000-0000-000000000001', '2026-01-15', 200, 'spoiled');

select is(
  (select round(w.goods_sold_at_cost
                * window_overlap_days(w.open_on, w.close_on, '2026-01-01', '2026-01-31')
                / w.window_days, 2)
   from v_count_window w where w.open_on = '2026-01-01'),
  3300.00::numeric,
  '§10 window 1: 3,300 × 19/19 = 3,300.00');

select is(
  (select round(w.goods_sold_at_cost
                * window_overlap_days(w.open_on, w.close_on, '2026-01-01', '2026-01-31')
                / w.window_days, 2)
   from v_count_window w where w.open_on = '2026-01-20'),
  2325.00::numeric,
  '§10 window 2: 3,100 × 12/16 = 2,325.00  (the spec''s old 2,131.25 was wrong)');

-- THE GATE. Phase 2 does not close until these four are exact.
select is(
  (report_period('2026-01-01', '2026-01-31') -> 'modelled' ->> 'goods_sold_at_cost')::numeric,
  5625.00::numeric, 'THE GATE — goods_sold_at_cost = 5,625.00');

select is(
  (report_period('2026-01-01', '2026-01-31') -> 'modelled' ->> 'revenue_est')::numeric,
  6750.00::numeric, 'THE GATE — revenue_est = 6,750.00');

select is(
  (report_period('2026-01-01', '2026-01-31') -> 'modelled' ->> 'gross_profit_est')::numeric,
  1125.00::numeric, 'THE GATE — gross_profit_est = 1,125.00');

select is(
  (report_period('2026-01-01', '2026-01-31') -> 'coverage' ->> 'pct')::numeric,
  100.0::numeric, 'THE GATE — coverage = 100% (19 + 12 = 31 of 31)');

select is(
  (report_period('2026-01-01', '2026-01-31') -> 'measured' ->> 'purchases_total')::numeric,
  5500.00::numeric, '§10 measured: 5,500 purchased');

-- The observation §6.7 exists to make visible: goods sold (5,625) EXCEED
-- purchases (5,500), so the store drew its shelves down and cash out
-- understates what the month actually cost.
select ok(
  (report_period('2026-01-01', '2026-01-31') -> 'modelled' ->> 'goods_sold_at_cost')::numeric
  > (report_period('2026-01-01', '2026-01-31') -> 'measured' ->> 'cash_out')::numeric,
  '§10: cost incurred exceeds cash out — the shelves were drawn down');

-- ---------------------------------------------------------------------------
-- Part C — plan_review R1, end to end and in the exact shape the review named.
--
-- Buy in the morning (the shelf held 500). Buy again in the afternoon, by which
-- time the shelf holds 1,200 — the morning's 1,000 included. The window between
-- the two counts holds 500 + 1,000 − 1,200 = 300 of goods sold, on a single
-- date. Before the fix it reported ZERO, silently.
-- ---------------------------------------------------------------------------

insert into article_category (id, name, description, sort_order)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'Zero window', 'x', 20);
insert into markup_rate (category_id, markup_pct, effective_from)
values ('bbbbbbbb-0000-0000-0000-000000000002', 20, '2025-01-01');

insert into stock_count (id, category_id, occurred_on, value_at_cost, source, created_at)
values ('30000000-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000002', '2026-01-12', 500, 'purchase',
        '2026-01-12 10:00:00+00');
insert into purchase (category_id, occurred_on, amount_at_cost, prior_count_id, created_at)
values ('bbbbbbbb-0000-0000-0000-000000000002', '2026-01-12', 1000,
        '30000000-0000-0000-0000-000000000001', '2026-01-12 10:00:00+00');

insert into stock_count (id, category_id, occurred_on, value_at_cost, source, created_at)
values ('30000000-0000-0000-0000-000000000002',
        'bbbbbbbb-0000-0000-0000-000000000002', '2026-01-12', 1200, 'purchase',
        '2026-01-12 15:00:00+00');
insert into purchase (category_id, occurred_on, amount_at_cost, prior_count_id, created_at)
values ('bbbbbbbb-0000-0000-0000-000000000002', '2026-01-12', 900,
        '30000000-0000-0000-0000-000000000002', '2026-01-12 15:00:00+00');

select is(
  (select r ->> 'goods_sold_at_cost'
   from jsonb_array_elements(report_period('2026-01-01', '2026-01-31') -> 'by_category') r
   where r ->> 'name' = 'Zero window')::numeric,
  300.00::numeric,
  'R1: the zero-length window reports its 300, not zero');

select is(
  (select r ->> 'settled_days'
   from jsonb_array_elements(report_period('2026-01-01', '2026-01-31') -> 'by_category') r
   where r ->> 'name' = 'Zero window')::int,
  1,
  'R1: its single day is settled at both ends, so it counts for coverage');

select is(
  (select r ->> 'unsettled_purchases'
   from jsonb_array_elements(report_period('2026-01-01', '2026-01-31') -> 'by_category') r
   where r ->> 'name' = 'Zero window')::numeric,
  900.00::numeric,
  'R1: the afternoon delivery opens a tail that never closes — unsettled, not sold');

select is(
  (report_period('2026-01-01', '2026-01-31') -> 'modelled' ->> 'goods_sold_at_cost')::numeric,
  5925.00::numeric,
  'R1: the store-wide total gains exactly the 300 that used to vanish');

select is(
  (report_period('2026-01-01', '2026-01-31') -> 'coverage' ->> 'pct')::numeric,
  51.6::numeric,
  'overall coverage averages the categories: (31 + 1) / (2 × 31) = 51.6%');

select * from finish();
rollback;
