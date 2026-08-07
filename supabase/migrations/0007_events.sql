-- 0007_events.sql — the event timeline.
--
-- domain-spec §3.4; architecture-spec §3.1.
--
-- This is the foundation every other computation stands on. Windows are defined
-- by RANK, not by date (domain-spec §6.2), because several events can share one
-- date and the order between them decides which window a delivery lands in —
-- and therefore whether it is reported as sold or as stock.

-- ---------------------------------------------------------------------------
-- v_stock_event — one row per stock-affecting event, carrying its sort keys.
--
-- The sort key is (occurred_on, ord_group, ord_anchor, ord_sub, src_id):
--
--   ord_group  0 = everything else, 1 = standalone counts.
--              Rule 3: a physical sweep reflects everything that already
--              happened that day, so it sorts after all of it.
--
--   ord_anchor the created_at the event sorts by. An EMBEDDED COUNT BORROWS ITS
--              PURCHASE'S created_at — that is rule 2, and it is what keeps the
--              pair adjacent no matter when the count row was physically
--              written.
--
--   ord_sub    0 = embedded count, 1 = its purchase, 2 = a loss.
--              Rules 2 and 4 together.
--
--   src_id     the final tiebreak (rule 5).
-- ---------------------------------------------------------------------------

create view v_stock_event with (security_invoker = true) as

-- Counts embedded in a purchase: immediately before their own purchase,
-- anchored on the purchase's created_at. They describe the shelf as it was
-- BEFORE the delivery arrived.
select sc.category_id,
       sc.occurred_on,
       0                  as ord_group,
       p.created_at       as ord_anchor,
       0                  as ord_sub,
       'count'::text      as kind,
       sc.value_at_cost   as amount,
       sc.id              as src_id
from stock_count sc
join purchase p on p.prior_count_id = sc.id
where sc.source = 'purchase'

union all

select p.category_id,
       p.occurred_on,
       0,
       p.created_at,
       1,
       'purchase',
       p.amount_at_cost,
       p.id
from purchase p

union all

-- ord_sub = 2 is a correction, not a detail (plan_review R7).
--
-- An embedded count (0) and its purchase (1) share ONE anchor. A loss written
-- in the SAME TRANSACTION as a purchase gets the identical now() timestamp, so
-- it ties on ord_anchor and the order falls through to src_id — a random uuid,
-- which can drop the loss BETWEEN the count and the purchase it belongs to.
-- Sorting losses after the pair on an exact tie makes the pair indivisible by
-- construction rather than by the accident of two timestamps differing.
select l.category_id,
       l.occurred_on,
       0,
       l.created_at,
       2,
       'loss',
       l.amount_at_cost,
       l.id
from stock_loss l

union all

select sc.category_id,
       sc.occurred_on,
       1,
       sc.created_at,
       0,
       'count',
       sc.value_at_cost,
       sc.id
from stock_count sc
where sc.source = 'standalone';

comment on view v_stock_event is
  'Every stock-affecting event with the sort keys of domain-spec §3.4. '
  'security_invoker: RLS on the base tables must follow the caller, not the '
  'view owner — the owner is the table owner and would bypass it entirely.';

-- ---------------------------------------------------------------------------
-- v_stock_event_ranked — the strict per-category sequence.
--
-- It is this rank, never the date, that defines window boundaries.
-- ---------------------------------------------------------------------------

create view v_stock_event_ranked with (security_invoker = true) as
select *,
       row_number() over (
         partition by category_id
         order by occurred_on, ord_group, ord_anchor, ord_sub, src_id
       ) as evt_rank
from v_stock_event;

comment on view v_stock_event_ranked is
  'v_stock_event with a strict per-category rank. Window boundaries are '
  'rank-exclusive at both ends (domain-spec §6.2); any date-based phrasing of '
  'that rule is wrong, because several events can share one date.';

grant select on v_stock_event, v_stock_event_ranked to authenticated;
