-- 070_coverage.sql — how much of the period the data actually accounts for.
--
-- plan §5.2, §2.2, §2.11; domain-spec §6.4, §6.5; plan_review R4.
--
-- Coverage is the number that tells the owner how far to trust everything else
-- on the screen. If it lies, every other figure inherits the lie with a
-- confident face on it.
--
-- Five categories, one of each way a period can be incompletely settled, plus
-- one that must NOT be counted at all.

begin;
create extension if not exists pgtap;
select plan(19);

delete from article_category;

insert into article_category (id, name, description, active, sort_order) values
  ('cafe0000-0000-0000-0000-000000000001', 'N jamais compte', 'x', true,  10),
  ('cafe0000-0000-0000-0000-000000000002', 'S obsolete',      'x', true,  20),
  ('cafe0000-0000-0000-0000-000000000003', 'T queue',         'x', true,  30),
  ('cafe0000-0000-0000-0000-000000000004', 'H tete',          'x', true,  40),
  ('cafe0000-0000-0000-0000-000000000005', 'W desactive',     'x', false, 50),
  ('cafe0000-0000-0000-0000-000000000006', 'X inactive',      'x', false, 60);

insert into markup_rate (category_id, markup_pct, effective_from)
select id, 20, '2025-01-01' from article_category;

-- N — bought from, never counted. Contributes nothing but drags coverage down,
--     which is correct: an uncounted shelf genuinely is unsettled.
insert into purchase (category_id, occurred_on, amount_at_cost)
values ('cafe0000-0000-0000-0000-000000000001', '2026-01-10', 500);

-- S — last counted 1 December, 61 days before the period ends. Its one window
--     lies entirely before the period, so it settles none of it.
insert into stock_count (category_id, occurred_on, value_at_cost, source) values
  ('cafe0000-0000-0000-0000-000000000002', '2025-11-01', 1200, 'standalone'),
  ('cafe0000-0000-0000-0000-000000000002', '2025-12-01', 1000, 'standalone');
insert into purchase (category_id, occurred_on, amount_at_cost)
values ('cafe0000-0000-0000-0000-000000000002', '2026-01-12', 200);

-- T — an UNSETTLED TAIL: bought after the last count. Real money out, unknown
--     fate. The system never extrapolates past the last count.
insert into stock_count (category_id, occurred_on, value_at_cost, source) values
  ('cafe0000-0000-0000-0000-000000000003', '2026-01-01', 1000, 'standalone'),
  ('cafe0000-0000-0000-0000-000000000003', '2026-01-15',  800, 'standalone');
insert into purchase (category_id, occurred_on, amount_at_cost)
values ('cafe0000-0000-0000-0000-000000000003', '2026-01-20', 400);

-- H — an UNSETTLED HEAD: bought before the category's first count ever.
insert into purchase (category_id, occurred_on, amount_at_cost)
values ('cafe0000-0000-0000-0000-000000000004', '2026-01-05', 300);
insert into stock_count (category_id, occurred_on, value_at_cost, source) values
  ('cafe0000-0000-0000-0000-000000000004', '2026-01-10', 1000, 'standalone'),
  ('cafe0000-0000-0000-0000-000000000004', '2026-01-25',  700, 'standalone');

-- W — deactivated, but with a purchase inside the period. It must still be
--     assessed: the shelf was traded during the period being reported on.
insert into purchase (category_id, occurred_on, amount_at_cost)
values ('cafe0000-0000-0000-0000-000000000005', '2026-01-12', 250);

-- X — deactivated and untouched. It must drop out of the denominator entirely,
--     or every long-abandoned shelf would permanently depress coverage.

-- ---------------------------------------------------------------------------
-- The set coverage is measured over (plan_review R4)
-- ---------------------------------------------------------------------------

select is(
  jsonb_array_length(report_period('2026-01-01', '2026-01-31') -> 'by_category'),
  5, 'a category deactivated long ago and untouched is not counted at all');

select is(
  (select count(*)::int
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31') -> 'by_category') r
   where r ->> 'name' = 'W desactive'),
  1, 'a deactivated category with events in the period IS still assessed');

-- ---------------------------------------------------------------------------
-- Never counted
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(n #>> '{}')
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31')
                             -> 'coverage' -> 'categories_never_counted') n),
  array['N jamais compte', 'W desactive'],
  'both never-counted categories are named, in display order');

select is(
  (select (r ->> 'settled_days')::int
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31') -> 'by_category') r
   where r ->> 'name' = 'N jamais compte'),
  0, 'a never-counted category settles no days');

select is(
  (select (r ->> 'coverage_pct')::numeric
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31') -> 'by_category') r
   where r ->> 'name' = 'N jamais compte'),
  0.0::numeric, 'and reads 0% coverage, not "no data"');

-- ---------------------------------------------------------------------------
-- Stale beyond 30 days
-- ---------------------------------------------------------------------------

select is(
  jsonb_array_length(report_period('2026-01-01','2026-01-31') -> 'coverage' -> 'categories_stale'),
  1, 'exactly one category is stale — the 15-day-old ones are not');

select is(
  (report_period('2026-01-01','2026-01-31') -> 'coverage' -> 'categories_stale' -> 0 ->> 'name'),
  'S obsolete', 'and it is the one last counted on 1 December');

select is(
  (report_period('2026-01-01','2026-01-31') -> 'coverage' -> 'categories_stale' -> 0 ->> 'days')::int,
  61, 'staleness is measured to the period''s effective end, not to today');

-- ---------------------------------------------------------------------------
-- Unsettled head and tail
-- ---------------------------------------------------------------------------

select is(
  (select (r ->> 'settled_days')::int
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31') -> 'by_category') r
   where r ->> 'name' = 'T queue'),
  14, 'T settles 1–14 January and nothing after its last count');

select is(
  (select (r ->> 'unsettled_purchases')::numeric
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31') -> 'by_category') r
   where r ->> 'name' = 'T queue'),
  400.00::numeric, 'the tail purchase is reported as unsettled, never as sold');

select is(
  (select (r ->> 'settled_days')::int
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31') -> 'by_category') r
   where r ->> 'name' = 'H tete'),
  15, 'H settles 10–24 January; the days before its first count are not settled');

select is(
  (select (r ->> 'unsettled_purchases')::numeric
   from jsonb_array_elements(report_period('2026-01-01','2026-01-31') -> 'by_category') r
   where r ->> 'name' = 'H tete'),
  300.00::numeric, 'a purchase before the first count is unsettled at the head too');

select is(
  (report_period('2026-01-01','2026-01-31') -> 'coverage' ->> 'unsettled_purchases')::numeric,
  1650.00::numeric, 'the panel totals every unsettled purchase: 500+200+400+300+250');

-- ---------------------------------------------------------------------------
-- Overall coverage across categories
-- ---------------------------------------------------------------------------

select is(
  (report_period('2026-01-01','2026-01-31') -> 'coverage' ->> 'pct')::numeric,
  18.7::numeric,
  'overall = (0+0+14+15+0) / (5 × 31) = 18.7%, every category weighted equally');

select is(
  (report_period('2026-01-01','2026-01-31') -> 'coverage' ->> 'level'),
  'low', 'below 60% reads "these figures are largely unsettled"');

-- ---------------------------------------------------------------------------
-- The period end is clamped to today (plan §2.2)
--
-- Without this, "this month" selected on the 3rd counts twenty-eight days that
-- HAVE NOT HAPPENED YET as unsettled, and a perfectly well-kept shop reads
-- "Low" for most of every month.
-- ---------------------------------------------------------------------------

select is(
  (report_period(store_today() - 5, store_today() + 30) -> 'period' ->> 'effective_to')::date,
  store_today(), 'a period ending in the future is evaluated only up to today');

select is(
  (report_period(store_today() - 5, store_today() + 30) -> 'period' ->> 'clamped')::boolean,
  true, 'and says so, so the UI can label "arrêté au …"');

select is(
  (report_period(store_today() - 5, store_today() + 30) -> 'period' ->> 'days')::int,
  6, 'the day count is the settled span, not the requested one');

select is(
  (report_period(store_today() - 5, store_today() + 30) -> 'period' ->> 'to')::date,
  store_today() + 30,
  'the REQUESTED range is still reported — the app never silently changes the question');

select * from finish();
rollback;
