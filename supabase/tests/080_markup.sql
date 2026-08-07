-- 080_markup.sql — the rate is a time series, and past reports must not move.
--
-- plan §5.2, §2.9; domain-spec §2.3, §6.3; architecture-spec §3.3.
--
-- Two properties are being defended here.
--
-- The first is that editing a percentage today cannot rewrite last March: a
-- March profit figure changing because a June price changed would make every
-- report in the system unfalsifiable.
--
-- The second is quieter and worse. A window opening before the category's first
-- `effective_from` — reachable just by backdating a purchase — used to return no
-- rate, and NULL × goods_sold propagates a silent NULL through revenue, gross
-- profit, operating profit and net cash change. No error, no flag: the whole
-- dashboard simply goes blank in the places that matter.

begin;
create extension if not exists pgtap;
select plan(10);

delete from article_category;

insert into article_category (id, name, description, sort_order) values
  ('facade00-0000-0000-0000-000000000001', 'M1 rate change', 'x', 10),
  ('facade00-0000-0000-0000-000000000002', 'M2 fallback',    'x', 20);

-- M1 — the rate rises mid-window, from 20% to 50% on 15 January.
insert into markup_rate (category_id, markup_pct, effective_from) values
  ('facade00-0000-0000-0000-000000000001', 20, '2026-01-01'),
  ('facade00-0000-0000-0000-000000000001', 50, '2026-01-15');

-- M2 — the only rate on record starts in JUNE, months after the window opens.
insert into markup_rate (category_id, markup_pct, effective_from) values
  ('facade00-0000-0000-0000-000000000002', 30, '2026-06-01');

-- One window each, 1 → 31 January, entirely inside the period.
insert into stock_count (category_id, occurred_on, value_at_cost, source) values
  ('facade00-0000-0000-0000-000000000001', '2026-01-01', 1000, 'standalone'),
  ('facade00-0000-0000-0000-000000000001', '2026-01-31',  800, 'standalone'),
  ('facade00-0000-0000-0000-000000000002', '2026-01-01', 1000, 'standalone'),
  ('facade00-0000-0000-0000-000000000002', '2026-01-31',  900, 'standalone');

-- ---------------------------------------------------------------------------
-- Resolution
-- ---------------------------------------------------------------------------

select is(markup_at('facade00-0000-0000-0000-000000000001', '2026-01-01'),
          20.00::numeric, 'the rate in force on 1 January is 20%');

select is(markup_at('facade00-0000-0000-0000-000000000001', '2026-01-20'),
          50.00::numeric, 'the rate in force on 20 January is 50%');

select is(markup_at('facade00-0000-0000-0000-000000000001', '2025-12-01'),
          20.00::numeric,
          'before any rate exists, the EARLIEST on record is used — never NULL');

select is(markup_at('facade00-0000-0000-0000-000000000002', '2026-01-01'),
          30.00::numeric,
          'a window opening five months before the first rate still resolves');

select is(
  (select anomaly from v_count_window
   where category_id = 'facade00-0000-0000-0000-000000000002'),
  null,
  'and it is NOT a no_markup anomaly — the category has a rate, just a later one');

-- ---------------------------------------------------------------------------
-- A window spanning a rate change uses the rate at its START
-- ---------------------------------------------------------------------------

select is(
  (select (r ->> 'gross_profit_est')::numeric
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31') -> 'by_category') r
   where r ->> 'name' = 'M1 rate change'),
  40.00::numeric,
  '200 sold at the OPENING rate of 20% = 40.00, not 100.00 at the closing 50%');

select is(
  (select (r ->> 'gross_profit_est')::numeric
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31') -> 'by_category') r
   where r ->> 'name' = 'M2 fallback'),
  30.00::numeric,
  '100 sold at the fallback rate of 30% = 30.00');

select isnt(
  (report_period('2026-01-01','2026-01-31') -> 'modelled' -> 'gross_profit_est'),
  'null'::jsonb,
  'the profit chain is not poisoned by a NULL rate anywhere in it');

select is(
  (report_period('2026-01-01','2026-01-31') -> 'modelled' ->> 'gross_profit_est')::numeric,
  70.00::numeric, 'and totals 40 + 30');

-- ---------------------------------------------------------------------------
-- A past report is unchanged by a rate edit (Q1: edits take effect today)
--
-- Asserted as byte-identical JSON rather than by comparing a figure or two:
-- this is the property the whole versioned-rate design exists to provide, and
-- checking one number would let the others drift.
-- ---------------------------------------------------------------------------

create temporary table january_before as
select report_period('2026-01-01', '2026-01-31') as doc;

insert into markup_rate (category_id, markup_pct, effective_from)
values ('facade00-0000-0000-0000-000000000001', 99, store_today());

select is(
  (select doc from january_before),
  report_period('2026-01-01', '2026-01-31'),
  'raising the markup to 99% today leaves January''s report byte-identical');

select * from finish();
rollback;
