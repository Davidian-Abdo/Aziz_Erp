-- 030_event_order.sql — the four ordering rules of domain-spec §3.4.
--
-- plan §5.2. Everything downstream stands on this: it is the RANK, never the
-- date, that decides which window a delivery lands in — and therefore whether
-- the money is reported as sold or as stock still on the shelf.
--
-- `created_at` is set explicitly throughout. The rules are about typing order,
-- so a test that let now() supply the timestamps would be asserting whatever
-- order the inserts happened to run in.

begin;
create extension if not exists pgtap;
select plan(14);

delete from article_category;

insert into article_category (id, name, description, sort_order)
values ('cccccccc-0000-0000-0000-00000000000a', 'Ordering', 'x', 10);

insert into markup_rate (category_id, markup_pct, effective_from)
values ('cccccccc-0000-0000-0000-00000000000a', 20, '2026-01-01');

-- ---------------------------------------------------------------------------
-- One earlier date, then six events crammed onto 2026-03-10.
--
--   C1 / P1  an embedded count and its purchase, typed at 10:00
--   L1       a loss typed at EXACTLY 10:00 — the same timestamp as P1
--   L2       a loss typed at 10:30, between the two purchases
--   C2 / P2  a second delivery of the same category, typed at 11:00
--   S        a standalone sweep typed at 09:00, BEFORE everything else
-- ---------------------------------------------------------------------------

insert into stock_count (id, category_id, occurred_on, value_at_cost, source, created_at)
values ('00000000-0000-0000-0000-0000000000e0',
        'cccccccc-0000-0000-0000-00000000000a', '2026-03-01', 2000, 'standalone',
        '2026-03-01 08:00:00+00');

insert into stock_count (id, category_id, occurred_on, value_at_cost, source, created_at)
values ('00000000-0000-0000-0000-0000000000c1',
        'cccccccc-0000-0000-0000-00000000000a', '2026-03-10', 500, 'purchase',
        '2026-03-10 10:00:00+00');
insert into purchase (id, category_id, occurred_on, amount_at_cost, prior_count_id, created_at)
values ('00000000-0000-0000-0000-0000000000f1',
        'cccccccc-0000-0000-0000-00000000000a', '2026-03-10', 1000,
        '00000000-0000-0000-0000-0000000000c1', '2026-03-10 10:00:00+00');

-- The exact-tie loss. This is plan_review R7: an embedded count and its purchase
-- share ONE anchor, so a loss written in the same transaction ties with both and
-- the order would fall through to a random uuid — which can drop the loss
-- BETWEEN the pair. ord_sub = 2 makes that impossible by construction.
insert into stock_loss (id, category_id, occurred_on, amount_at_cost, reason, created_at)
values ('00000000-0000-0000-0000-0000000000a1',
        'cccccccc-0000-0000-0000-00000000000a', '2026-03-10', 40, 'spoiled',
        '2026-03-10 10:00:00+00');

insert into stock_loss (id, category_id, occurred_on, amount_at_cost, reason, created_at)
values ('00000000-0000-0000-0000-0000000000a2',
        'cccccccc-0000-0000-0000-00000000000a', '2026-03-10', 60, 'broken',
        '2026-03-10 10:30:00+00');

insert into stock_count (id, category_id, occurred_on, value_at_cost, source, created_at)
values ('00000000-0000-0000-0000-0000000000c2',
        'cccccccc-0000-0000-0000-00000000000a', '2026-03-10', 1200, 'purchase',
        '2026-03-10 11:00:00+00');
insert into purchase (id, category_id, occurred_on, amount_at_cost, prior_count_id, created_at)
values ('00000000-0000-0000-0000-0000000000f2',
        'cccccccc-0000-0000-0000-00000000000a', '2026-03-10', 900,
        '00000000-0000-0000-0000-0000000000c2', '2026-03-10 11:00:00+00');

-- Typed at 09:00, an hour before anything else on its date, and it must STILL
-- sort last: a physical sweep reflects everything that already happened that day.
insert into stock_count (id, category_id, occurred_on, value_at_cost, source, created_at)
values ('00000000-0000-0000-0000-0000000000e1',
        'cccccccc-0000-0000-0000-00000000000a', '2026-03-10', 1500, 'standalone',
        '2026-03-10 09:00:00+00');

-- A readable view of the sequence.
create temporary view seq as
select evt_rank,
       case src_id
         when '00000000-0000-0000-0000-0000000000e0'::uuid then 'C0'
         when '00000000-0000-0000-0000-0000000000c1'::uuid then 'C1'
         when '00000000-0000-0000-0000-0000000000f1'::uuid then 'P1'
         when '00000000-0000-0000-0000-0000000000a1'::uuid then 'L1'
         when '00000000-0000-0000-0000-0000000000a2'::uuid then 'L2'
         when '00000000-0000-0000-0000-0000000000c2'::uuid then 'C2'
         when '00000000-0000-0000-0000-0000000000f2'::uuid then 'P2'
         when '00000000-0000-0000-0000-0000000000e1'::uuid then 'S'
       end as label,
       kind, occurred_on
from v_stock_event_ranked
where category_id = 'cccccccc-0000-0000-0000-00000000000a';

-- ---------------------------------------------------------------------------
-- The whole sequence, in one assertion
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(label order by evt_rank) from seq),
  array['C0', 'C1', 'P1', 'L1', 'L2', 'C2', 'P2', 'S'],
  'the eight events order exactly as domain-spec §3.4 requires'
);

-- ---------------------------------------------------------------------------
-- Rule 1 — occurred_on ascending
-- ---------------------------------------------------------------------------

select is(
  (select label from seq order by evt_rank limit 1),
  'C0',
  'rule 1: the earlier date sorts first'
);

select ok(
  (select bool_and(a.occurred_on <= b.occurred_on)
   from seq a join seq b on b.evt_rank = a.evt_rank + 1),
  'rule 1: occurred_on never decreases along the rank sequence'
);

-- ---------------------------------------------------------------------------
-- Rule 2 — an embedded count is IMMEDIATELY before its own purchase
-- ---------------------------------------------------------------------------

select is(
  (select (p.evt_rank - c.evt_rank)::int from seq c, seq p
   where c.label = 'C1' and p.label = 'P1'),
  1,
  'rule 2: C1 sits immediately before P1'
);

select is(
  (select (p.evt_rank - c.evt_rank)::int from seq c, seq p
   where c.label = 'C2' and p.label = 'P2'),
  1,
  'rule 2: C2 sits immediately before P2'
);

-- Stated as a property over the whole table, not just these two rows: for every
-- purchase carrying an embedded count, the pair is adjacent.
select is(
  (select count(*)::int
   from purchase p
   join v_stock_event_ranked ep on ep.src_id = p.id and ep.kind = 'purchase'
   join v_stock_event_ranked ec on ec.src_id = p.prior_count_id and ec.kind = 'count'
   where p.prior_count_id is not null
     and ep.evt_rank - ec.evt_rank <> 1),
  0,
  'rule 2: no purchase is ever separated from its own embedded count'
);

-- ---------------------------------------------------------------------------
-- Rule 3 — a standalone count sorts after every purchase and loss of its date
-- ---------------------------------------------------------------------------

select is(
  (select label from seq order by evt_rank desc limit 1),
  'S',
  'rule 3: the standalone sweep sorts last on its date despite being typed first'
);

select ok(
  (select s.evt_rank > max(o.evt_rank)
   from seq s, seq o
   where s.label = 'S' and o.occurred_on = s.occurred_on and o.label <> 'S'
   group by s.evt_rank),
  'rule 3: every other event of 2026-03-10 ranks below the sweep'
);

-- ---------------------------------------------------------------------------
-- Rule 4 — losses sort by typing order, and NEVER split a count/purchase pair
-- ---------------------------------------------------------------------------

select ok(
  (select l1.evt_rank < l2.evt_rank from seq l1, seq l2
   where l1.label = 'L1' and l2.label = 'L2'),
  'rule 4: the loss typed at 10:00 ranks before the one typed at 10:30'
);

select ok(
  (select l.evt_rank > p.evt_rank from seq l, seq p
   where l.label = 'L1' and p.label = 'P1'),
  'rule 4 / R7: a loss tying EXACTLY with a purchase''s timestamp sorts after it'
);

select ok(
  (select l.evt_rank < c.evt_rank from seq l, seq c
   where l.label = 'L2' and c.label = 'C2'),
  'rule 4: a loss typed between two deliveries lands between them'
);

-- The claim the plan requires this file to prove, stated over all the data
-- rather than over the two rows above.
select is(
  (select count(*)::int
   from purchase p
   join v_stock_event_ranked ep on ep.src_id = p.id and ep.kind = 'purchase'
   join v_stock_event_ranked ec on ec.src_id = p.prior_count_id and ec.kind = 'count'
   join v_stock_event_ranked el on el.category_id = p.category_id and el.kind = 'loss'
   where p.prior_count_id is not null
     and el.evt_rank > ec.evt_rank and el.evt_rank < ep.evt_rank),
  0,
  'a loss can never fall between an embedded count and its own purchase'
);

-- ---------------------------------------------------------------------------
-- Two purchases of one category on one day (plan §2.15b, and the ledger behind
-- plan_review R1)
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(label order by evt_rank) from seq
   where label in ('C1', 'P1', 'C2', 'P2')),
  array['C1', 'P1', 'C2', 'P2'],
  'two deliveries in one day: each count stays with its own purchase, in order'
);

-- The second delivery's count must include the first delivery. The window
-- between the two counts is where that shows up:  500 + 1000 − 1200 = 300.
select is(
  (select outflow from v_count_window
   where category_id = 'cccccccc-0000-0000-0000-00000000000a'
     and open_value = 500 and close_value = 1200),
  300.00::numeric,
  'the window between two same-day counts holds the first delivery as inflow'
);

select * from finish();
rollback;
