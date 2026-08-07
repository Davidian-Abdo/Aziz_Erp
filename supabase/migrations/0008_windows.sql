-- 0008_windows.sql — count windows and the day arithmetic that allocates them.
--
-- domain-spec §6.2, §6.3; architecture-spec §3.2; plan §2.1, §2.7, §2.10;
-- plan_review R1.

-- ---------------------------------------------------------------------------
-- window_overlap_days — how many days of a count window fall inside [A, B_eff].
--
-- Two calendars have to be reconciled here and getting it wrong is how the
-- specs' first worked example ended up claiming 19 + 11 = 31.
--
--   Count windows are HALF-OPEN [open_on, close_on): the opening count's date
--   belongs to the window it opens, the closing count's date belongs to the
--   next one. That partitions time with no day counted twice.
--
--   The requested period is INCLUSIVE of B (domain-spec §9.1).
--
-- So the period is converted to half-open [A, B_eff + 1) before any
-- subtraction, and everything downstream lives in that arithmetic.
--
-- ZERO-LENGTH WINDOWS ARE ALLOCATED WHOLE (plan_review R1). Two counts can
-- share a date — two deliveries of one category in a day, or a delivery
-- followed by a month-end sweep. Then close_on - open_on = 0, the general
-- formula returns an overlap of 0, `window_days` floors to 1, and the window's
-- goods sold get multiplied by zero: REAL MONEY SILENTLY VANISHES FROM EVERY
-- REPORT, with nothing flagged. A zero-length window is a point in time, not a
-- span, so it is worth its whole self on the day it happened and nothing on any
-- other day.
-- ---------------------------------------------------------------------------

create function window_overlap_days(
  p_open date, p_close date, p_a date, p_b_eff date
) returns int
language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when p_b_eff < p_a then 0                      -- period is empty
    when p_close = p_open then
      case when p_open between p_a and p_b_eff then 1 else 0 end
    else greatest(0, least(p_close, p_b_eff + 1) - greatest(p_open, p_a))
  end
$$;

comment on function window_overlap_days(date, date, date, date) is
  'Days of the half-open window [open, close) inside the inclusive period '
  '[A, B_eff]. A zero-length window counts as 1 day when its date is in the '
  'period — see domain-spec §6.3 and plan_review R1.';

-- ---------------------------------------------------------------------------
-- v_count_window — consecutive pairs of counts, and what left the shelf between
-- them.
--
-- Boundaries are RANK-EXCLUSIVE AT BOTH ENDS: window k holds exactly the events
-- with open_rank < evt_rank < close_rank. The event at close_rank *is* the
-- closing count and belongs to no window's interior.
--
-- The trailing `where close_rank is not null` is what implements "never
-- extrapolate past the last count" (domain-spec §6.4): the open tail simply
-- produces no window, so it can contribute no profit. It is reported separately
-- as unsettled, never modelled.
-- ---------------------------------------------------------------------------

create view v_count_window with (security_invoker = true) as
with counts as (
  select category_id,
         occurred_on as open_on,
         amount      as open_value,
         evt_rank    as open_rank,
         lead(occurred_on) over w as close_on,
         lead(amount)      over w as close_value,
         lead(evt_rank)    over w as close_rank
  from v_stock_event_ranked
  where kind = 'count'
  window w as (partition by category_id order by evt_rank)
),
spans as (
  select c.category_id,
         c.open_on,
         c.close_on,
         c.open_rank,
         c.close_rank,
         c.open_value,
         c.close_value,
         -- Floored at 1 so the allocation denominator is never zero. It is NOT
         -- the whole story on its own: see window_overlap_days above.
         greatest(c.close_on - c.open_on, 1) as window_days,
         coalesce(i.amt, 0) as inflow,
         coalesce(l.amt, 0) as losses
  from counts c
  left join lateral (
    select sum(e.amount) as amt
    from v_stock_event_ranked e
    where e.category_id = c.category_id
      and e.kind = 'purchase'
      and e.evt_rank > c.open_rank
      and e.evt_rank < c.close_rank
  ) i on true
  left join lateral (
    select sum(e.amount) as amt
    from v_stock_event_ranked e
    where e.category_id = c.category_id
      and e.kind = 'loss'
      and e.evt_rank > c.open_rank
      and e.evt_rank < c.close_rank
  ) l on true
  where c.close_rank is not null
)
select s.category_id,
       s.open_on,
       s.close_on,
       s.open_rank,
       s.close_rank,
       s.open_value,
       s.close_value,
       s.window_days,
       s.inflow,
       s.losses,
       (s.open_value + s.inflow - s.close_value)              as outflow,
       (s.open_value + s.inflow - s.close_value - s.losses)   as goods_sold_at_cost,
       -- Three anomaly kinds, with different causes and different fixes
       -- (domain-spec §6.2). A flagged window is excluded from the profit chain
       -- AND from settled days — without the second half, a period full of data
       -- errors reports full coverage while contributing no profit, which is
       -- exactly inverted from the truth.
       --
       -- Nothing here is ever silently clamped to zero. The number is wrong;
       -- saying so is the whole point.
       case
         when (s.open_value + s.inflow - s.close_value) < 0
           then 'negative_outflow'
         when (s.open_value + s.inflow - s.close_value - s.losses) < 0
           then 'losses_exceed_outflow'
         when not exists (
           select 1 from markup_rate m where m.category_id = s.category_id
         ) then 'no_markup'
       end as anomaly
from spans s;

comment on view v_count_window is
  'One row per consecutive pair of counts. Boundaries are rank-exclusive at '
  'both ends; the open tail after the last count produces no row at all, which '
  'is how "never extrapolate past the last count" is enforced.';

grant select on v_count_window to authenticated;
grant execute on function window_overlap_days(date, date, date, date) to authenticated;
