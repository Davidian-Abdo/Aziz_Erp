-- 045_helpers.sql — the stock bound and the plausibility heuristics.
--
-- domain-spec §3.2, §6.8; plan §2.3c. Not in plan §5.2's required list, added
-- for the same reason 015_guards.sql was: check_count_plausibility is the only
-- automated defence against the category-scope trap, and a guard nobody
-- exercises is the most reassuring kind of bug.
--
-- These verdicts are ADVISORY. Nothing here may ever block a save — the user
-- may simply be right, and a system that refuses a true number teaches people
-- to lie to it.

begin;
create extension if not exists pgtap;
select plan(13);

delete from article_category;

insert into article_category (id, name, description, sort_order) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'H bound',    'x', 10),
  ('eeeeeeee-0000-0000-0000-0000000000e2', 'G history',  'x', 20),
  ('eeeeeeee-0000-0000-0000-0000000000e3', 'N uncounted', 'x', 30);

insert into markup_rate (category_id, markup_pct, effective_from) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 20, '2026-01-01'),
  ('eeeeeeee-0000-0000-0000-0000000000e2', 20, '2026-01-01'),
  ('eeeeeeee-0000-0000-0000-0000000000e3', 20, '2026-01-01');

-- H — counted once at 1000 on 1 Jan, then a delivery of 400 and a loss of 100.
insert into stock_count (category_id, occurred_on, value_at_cost, source)
values ('eeeeeeee-0000-0000-0000-0000000000e1', '2026-01-01', 1000, 'standalone');
insert into purchase (category_id, occurred_on, amount_at_cost)
values ('eeeeeeee-0000-0000-0000-0000000000e1', '2026-01-05', 400);
insert into stock_loss (category_id, occurred_on, amount_at_cost, reason)
values ('eeeeeeee-0000-0000-0000-0000000000e1', '2026-01-08', 100, 'spoiled');

-- G — three counts ten days apart, 100 leaving each window: a steady 10/day.
insert into stock_count (category_id, occurred_on, value_at_cost, source) values
  ('eeeeeeee-0000-0000-0000-0000000000e2', '2026-01-01', 1000, 'standalone'),
  ('eeeeeeee-0000-0000-0000-0000000000e2', '2026-01-11',  900, 'standalone'),
  ('eeeeeeee-0000-0000-0000-0000000000e2', '2026-01-21',  800, 'standalone');

-- ---------------------------------------------------------------------------
-- expected_on_hand — an UPPER BOUND, and NULL is not zero
-- ---------------------------------------------------------------------------

select is(
  expected_on_hand('eeeeeeee-0000-0000-0000-0000000000e1', '2026-01-10'),
  1300.00::numeric,
  'the bound is last count + everything bought since − everything lost since');

select is(
  expected_on_hand('eeeeeeee-0000-0000-0000-0000000000e1', '2026-01-04'),
  1000.00::numeric,
  'a delivery dated after the as-of date does not raise the bound');

select is(
  expected_on_hand('eeeeeeee-0000-0000-0000-0000000000e1', '2025-12-31'),
  null::numeric,
  'before the first count there is no bound — NULL, and callers must not read it as zero');

select is(
  expected_on_hand('eeeeeeee-0000-0000-0000-0000000000e3', '2026-01-10'),
  null::numeric,
  'a never-counted category has no bound at all');

-- ---------------------------------------------------------------------------
-- The four verdicts
-- ---------------------------------------------------------------------------

select is(
  check_count_plausibility('eeeeeeee-0000-0000-0000-0000000000e1', '2026-01-10', 1400) ->> 'verdict',
  'exceeds_bound',
  'more stock than could possibly be there — a purchase is missing, or the value is wrong');

select is(
  check_count_plausibility('eeeeeeee-0000-0000-0000-0000000000e1', '2026-01-10', 900) ->> 'verdict',
  'ok',
  'a plausible value on a category with no settled history passes');

select is(
  check_count_plausibility('eeeeeeee-0000-0000-0000-0000000000e1', '2026-01-05', 100) ->> 'verdict',
  'suspicious_drop',
  'no history, counted at under a quarter of the bound, only four days elapsed');

select is(
  check_count_plausibility('eeeeeeee-0000-0000-0000-0000000000e2', '2026-02-01', 400) ->> 'verdict',
  'high_outflow',
  'two settled windows average 10/day; 36/day is more than three times that');

select is(
  check_count_plausibility('eeeeeeee-0000-0000-0000-0000000000e2', '2026-02-01', 700) ->> 'verdict',
  'ok',
  '9/day against a 10/day average is ordinary trade');

select is(
  check_count_plausibility('eeeeeeee-0000-0000-0000-0000000000e2', '2026-02-01', 900) ->> 'verdict',
  'exceeds_bound',
  'the bound is checked before the rate, because it is the harder fact');

select is(
  check_count_plausibility('eeeeeeee-0000-0000-0000-0000000000e3', '2026-01-10', 5000) ->> 'verdict',
  'ok',
  'a never-counted category cannot be implausible — this is the opening sweep');

-- ---------------------------------------------------------------------------
-- The verdict has to carry enough to write the message with
-- ---------------------------------------------------------------------------

select is(
  (check_count_plausibility('eeeeeeee-0000-0000-0000-0000000000e1', '2026-01-10', 1400)
     ->> 'expected_on_hand')::numeric,
  1300.00::numeric,
  'the result carries the expected figure — "vous avez saisi X, mais…" needs it');

select is(
  (check_count_plausibility('eeeeeeee-0000-0000-0000-0000000000e2', '2026-02-01', 400)
     ->> 'days_since_last_count')::int,
  11,
  'and the days elapsed, which is what makes a drop large or ordinary');

select * from finish();
rollback;
