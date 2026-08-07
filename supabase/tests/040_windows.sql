-- 040_windows.sql — window boundaries are rank-exclusive at both ends.
--
-- plan §5.2, domain-spec §6.2, §6.4.
--
-- The question this file settles: when a delivery and a count share a date, WHICH
-- WINDOW does the delivery's money belong to? Get it wrong and an entire delivery
-- is booked as sold at full markup on the day it arrived, while the following
-- window is understated by the same amount. Both halves look plausible on screen.
--
-- Two ledgers, one for each way a window can close:
--   category Y — the window closes at a STANDALONE count (an evening sweep)
--   category Z — the window closes at an EMBEDDED count (a second delivery)

begin;
create extension if not exists pgtap;
select plan(16);

delete from article_category;

insert into article_category (id, name, description, sort_order) values
  ('dddddddd-0000-0000-0000-0000000000d1', 'Y sweep close',    'x', 10),
  ('dddddddd-0000-0000-0000-0000000000d2', 'Z embedded close', 'x', 20);

insert into markup_rate (category_id, markup_pct, effective_from) values
  ('dddddddd-0000-0000-0000-0000000000d1', 20, '2026-01-01'),
  ('dddddddd-0000-0000-0000-0000000000d2', 20, '2026-01-01');

-- ---------------------------------------------------------------------------
-- Y — 1 Mar sweep 1000; 10 Mar a delivery of 300 (shelf held 700 before it);
--     10 Mar evening sweep 900.
--
-- Ranks: S1=1, Cp=2, P=3, S2=4.
--   window [1,2] interior is EMPTY — the delivery is NOT in the window that
--                closes at its own count, even though they share a date
--   window [2,4] interior is the delivery
-- ---------------------------------------------------------------------------

insert into stock_count (id, category_id, occurred_on, value_at_cost, source, created_at)
values ('10000000-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-0000000000d1', '2026-03-01', 1000, 'standalone',
        '2026-03-01 08:00:00+00');

insert into stock_count (id, category_id, occurred_on, value_at_cost, source, created_at)
values ('10000000-0000-0000-0000-000000000002',
        'dddddddd-0000-0000-0000-0000000000d1', '2026-03-10', 700, 'purchase',
        '2026-03-10 14:00:00+00');
insert into purchase (id, category_id, occurred_on, amount_at_cost, prior_count_id, created_at)
values ('10000000-0000-0000-0000-000000000003',
        'dddddddd-0000-0000-0000-0000000000d1', '2026-03-10', 300,
        '10000000-0000-0000-0000-000000000002', '2026-03-10 14:00:00+00');

insert into stock_count (id, category_id, occurred_on, value_at_cost, source, created_at)
values ('10000000-0000-0000-0000-000000000004',
        'dddddddd-0000-0000-0000-0000000000d1', '2026-03-10', 900, 'standalone',
        '2026-03-10 18:00:00+00');

-- ---------------------------------------------------------------------------
-- Z — 1 Mar sweep 1000; 5 Mar delivery of 200 (shelf held 900); 5 Mar a second
--     delivery of 150 (shelf held 1050, the first delivery included).
--
-- Ranks: S1=1, Cp1=2, P1=3, Cp2=4, P2=5.
--   window [1,2] interior EMPTY        — P1 is outside it although same date
--   window [2,4] interior is P1 only   — P2 at rank 5 is outside
--   P2 opens a tail that never closes  — NO window, and therefore no profit
-- ---------------------------------------------------------------------------

insert into stock_count (id, category_id, occurred_on, value_at_cost, source, created_at)
values ('20000000-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-0000000000d2', '2026-03-01', 1000, 'standalone',
        '2026-03-01 08:00:00+00');

insert into stock_count (id, category_id, occurred_on, value_at_cost, source, created_at)
values ('20000000-0000-0000-0000-000000000002',
        'dddddddd-0000-0000-0000-0000000000d2', '2026-03-05', 900, 'purchase',
        '2026-03-05 10:00:00+00');
insert into purchase (id, category_id, occurred_on, amount_at_cost, prior_count_id, created_at)
values ('20000000-0000-0000-0000-000000000003',
        'dddddddd-0000-0000-0000-0000000000d2', '2026-03-05', 200,
        '20000000-0000-0000-0000-000000000002', '2026-03-05 10:00:00+00');

insert into stock_count (id, category_id, occurred_on, value_at_cost, source, created_at)
values ('20000000-0000-0000-0000-000000000004',
        'dddddddd-0000-0000-0000-0000000000d2', '2026-03-05', 1050, 'purchase',
        '2026-03-05 15:00:00+00');
insert into purchase (id, category_id, occurred_on, amount_at_cost, prior_count_id, created_at)
values ('20000000-0000-0000-0000-000000000005',
        'dddddddd-0000-0000-0000-0000000000d2', '2026-03-05', 150,
        '20000000-0000-0000-0000-000000000004', '2026-03-05 15:00:00+00');

-- ---------------------------------------------------------------------------
-- Y: closing on a standalone sweep
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from v_count_window
   where category_id = 'dddddddd-0000-0000-0000-0000000000d1'),
  2, 'Y produces two windows — the tail after the last count produces none');

select is(
  (select inflow from v_count_window
   where category_id = 'dddddddd-0000-0000-0000-0000000000d1' and open_value = 1000),
  0::numeric,
  'Y: the 10 Mar delivery is NOT inflow of the window closing at its own count');

select is(
  (select outflow from v_count_window
   where category_id = 'dddddddd-0000-0000-0000-0000000000d1' and open_value = 1000),
  300.00::numeric, 'Y: first window outflow is 1000 − 700');

select is(
  (select window_days from v_count_window
   where category_id = 'dddddddd-0000-0000-0000-0000000000d1' and open_value = 1000),
  9, 'Y: first window spans 9 days, half-open [1 Mar, 10 Mar)');

select is(
  (select inflow from v_count_window
   where category_id = 'dddddddd-0000-0000-0000-0000000000d1' and open_value = 700),
  300.00::numeric,
  'Y: the delivery lands in the window closed by the evening sweep');

select is(
  (select outflow from v_count_window
   where category_id = 'dddddddd-0000-0000-0000-0000000000d1' and open_value = 700),
  100.00::numeric, 'Y: second window outflow is 700 + 300 − 900');

select is(
  (select window_days from v_count_window
   where category_id = 'dddddddd-0000-0000-0000-0000000000d1' and open_value = 700),
  1, 'Y: a same-date window floors window_days at 1, never 0');

-- ---------------------------------------------------------------------------
-- Z: closing on an embedded count
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from v_count_window
   where category_id = 'dddddddd-0000-0000-0000-0000000000d2'),
  2, 'Z produces two windows');

select is(
  (select inflow from v_count_window
   where category_id = 'dddddddd-0000-0000-0000-0000000000d2' and open_value = 1000),
  0::numeric,
  'Z: the 5 Mar delivery is outside the window that closes at its own count');

select is(
  (select outflow from v_count_window
   where category_id = 'dddddddd-0000-0000-0000-0000000000d2' and open_value = 1000),
  100.00::numeric, 'Z: first window outflow is 1000 − 900');

-- The exclusivity assertion with teeth: P1 sits at close_rank − 1 and P2 at
-- close_rank + 1. Only P1 may count.
select is(
  (select inflow from v_count_window
   where category_id = 'dddddddd-0000-0000-0000-0000000000d2' and open_value = 900),
  200.00::numeric,
  'Z: only the delivery STRICTLY between the two counts is inflow');

select is(
  (select outflow from v_count_window
   where category_id = 'dddddddd-0000-0000-0000-0000000000d2' and open_value = 900),
  50.00::numeric, 'Z: second window outflow is 900 + 200 − 1050');

-- ---------------------------------------------------------------------------
-- Never extrapolate past the last count (domain-spec §6.4)
-- ---------------------------------------------------------------------------

select is(
  (select coalesce(sum(inflow), 0) from v_count_window
   where category_id = 'dddddddd-0000-0000-0000-0000000000d2'),
  200.00::numeric,
  'Z: the trailing delivery of 150 belongs to no window at all');

select is(
  (select coalesce(sum(amount_at_cost), 0) from purchase
   where category_id = 'dddddddd-0000-0000-0000-0000000000d2'),
  350.00::numeric,
  'Z: …even though 350 was genuinely spent — it is unsettled, not modelled');

-- ---------------------------------------------------------------------------
-- Properties that must hold for every window, on any ledger
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int
   from v_count_window w
   join v_stock_event_ranked e on e.category_id = w.category_id
   where e.evt_rank in (w.open_rank, w.close_rank)
     and e.kind <> 'count'),
  0, 'every window boundary is a count, never a purchase or a loss');

select is(
  (select count(*)::int from v_count_window where close_rank <= open_rank),
  0, 'a window never closes at or before it opens');

select * from finish();
rollback;
