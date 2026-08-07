-- 0010_report_period.sql — the dashboard's entire data source.
--
-- domain-spec §6 in full; architecture-spec §3.4; plan §2.1, §2.2, §2.10,
-- §2.11, §2.14; plan_review R1, R4.
--
-- The React app contains NO accounting arithmetic whatsoever. It renders what
-- this function returns. Computing a total on the client is a spec violation
-- (architecture-spec §1.2), so every figure the screen shows has to be born
-- here.
--
-- SECURITY INVOKER, deliberately. It runs as the caller, so RLS on every base
-- table applies and a non-allowlisted user gets an empty report rather than the
-- store's finances.

create function report_period(p_from date, p_to date) returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin

with

-- ---------------------------------------------------------------------------
-- The period, clamped.
--
-- "This month", selected on the 3rd, yields B = the 31st. Without clamping,
-- twenty-eight days that HAVE NOT HAPPENED YET count as unsettled, and a
-- perfectly well-kept shop reads "Low — these figures are largely unsettled"
-- for most of every month. Everywhere a period is evaluated — allocation,
-- coverage, freshness, the unsettled tail — the effective end is
-- B_eff = least(B, store_today()).
--
-- The requested range is still reported, so the UI can label
-- "1–31 August (arrêté au 3 août)" rather than silently changing what was asked.
-- ---------------------------------------------------------------------------
pd as (
  select p_from                                                     as a,
         p_to                                                       as b_req,
         least(p_to, store_today())                                 as b_eff,
         greatest((least(p_to, store_today()) - p_from) + 1, 0)      as period_days
),

-- ---------------------------------------------------------------------------
-- The categories coverage is measured over (plan_review R4).
--
-- domain-spec §6.5 originally said "active at any point in the period", which
-- the schema cannot answer: article_category carries `active`, a CURRENT state,
-- with no record of when deactivation happened. This is the set that is both
-- computable and honest — a category deactivated mid-period still has events in
-- it and must still be assessed; one deactivated long ago and untouched during
-- the period correctly drops out.
-- ---------------------------------------------------------------------------
cats as (
  select c.id, c.name, c.sort_order
  from article_category c
  cross join pd
  where c.active
     or exists (select 1 from stock_count s
                 where s.category_id = c.id
                   and s.occurred_on between pd.a and pd.b_eff)
     or exists (select 1 from purchase s
                 where s.category_id = c.id
                   and s.occurred_on between pd.a and pd.b_eff)
     or exists (select 1 from stock_loss s
                 where s.category_id = c.id
                   and s.occurred_on between pd.a and pd.b_eff)
),

-- ---------------------------------------------------------------------------
-- Allocation — straight-line by days, per window.
--
-- The markup is the rate in force at the window's OPEN date, not at the period
-- end: a window spanning a rate change uses the rate at its start, which is why
-- editing a markup today cannot move last March's profit.
--
-- Anomalous windows are excluded here and their days are excluded from
-- settled_days below. Both halves matter — without the second, a period full of
-- data errors reports full coverage while contributing no profit.
-- ---------------------------------------------------------------------------
alloc_w as (
  select w.category_id,
         window_overlap_days(w.open_on, w.close_on, pd.a, pd.b_eff) as overlap_days,
         w.goods_sold_at_cost,
         w.window_days,
         markup_at(w.category_id, w.open_on) as markup_pct
  from v_count_window w
  cross join pd
  where w.anomaly is null
),
alloc as (
  select category_id,
         -- FULL numeric precision throughout. Rounding happens exactly once,
         -- at emission below (domain-spec §9.5).
         sum(goods_sold_at_cost * overlap_days / window_days) as goods_sold,
         sum(goods_sold_at_cost * overlap_days / window_days
             * markup_pct / 100.0)                            as gross_profit,
         sum(overlap_days)                                    as settled_days
  from alloc_w
  where overlap_days > 0
  group by category_id
),

-- ---------------------------------------------------------------------------
-- Measured quantities. These are facts, never estimated, never labelled as
-- estimates (domain-spec §6.1).
-- ---------------------------------------------------------------------------
meas_cat as (
  select c.id as category_id,
         coalesce((select sum(p.amount_at_cost) from purchase p
                    where p.category_id = c.id
                      and p.occurred_on between pd.a and pd.b_eff), 0) as purchases,
         coalesce((select sum(l.amount_at_cost) from stock_loss l
                    where l.category_id = c.id
                      and l.occurred_on between pd.a and pd.b_eff), 0) as losses
  from cats c
  cross join pd
),
measured as (
  select
    coalesce((select sum(p.amount_at_cost) from purchase p
               where p.occurred_on between pd.a and pd.b_eff), 0) as purchases_total,
    coalesce((select sum(ch.amount) from charge ch
               join charge_category cc on cc.id = ch.charge_category_id
              where ch.occurred_on between pd.a and pd.b_eff
                and cc.nature = 'operating'), 0)                 as operating_charges,
    coalesce((select sum(ch.amount) from charge ch
               join charge_category cc on cc.id = ch.charge_category_id
              where ch.occurred_on between pd.a and pd.b_eff
                and cc.nature = 'owner_draw'), 0)                as owner_draws_cash,
    coalesce((select sum(l.amount_at_cost) from stock_loss l
               where l.occurred_on between pd.a and pd.b_eff
                 and loss_nature(l.reason) = 'shrinkage'), 0)     as shrinkage_losses,
    coalesce((select sum(l.amount_at_cost) from stock_loss l
               where l.occurred_on between pd.a and pd.b_eff
                 and loss_nature(l.reason) = 'owner_draw'), 0)    as owner_draws_in_kind
  from pd
),

-- ---------------------------------------------------------------------------
-- Stock position as of B_eff — not as of "now".
--
-- Reporting a past month must not change because a count was taken last week,
-- otherwise no report is ever reproducible and Phase 6's "a prior month is
-- byte-identical after a rate edit" cannot be asserted at all.
-- ---------------------------------------------------------------------------
counts_upto as (
  select e.category_id, e.occurred_on, e.amount, e.evt_rank,
         row_number() over (partition by e.category_id order by e.evt_rank desc) as rn_desc
  from v_stock_event_ranked e
  cross join pd
  where e.kind = 'count' and e.occurred_on <= pd.b_eff
),
last_count as (
  select category_id, occurred_on as last_on, amount as last_value
  from counts_upto where rn_desc = 1
),

-- ---------------------------------------------------------------------------
-- The unsettled spans (domain-spec §6.4).
--
-- A purchase inside no window at all — before the category's first count, or
-- after its last — is real money that left the wallet whose goods have an
-- unknown fate. The system NEVER extrapolates past the last count, so this is
-- reported as its own number rather than modelled as profit.
--
-- The bounds are over ALL counts, not just those inside the period: a purchase
-- in January sitting in a window that closes in February is settled by that
-- window, and allocation has already handled it.
-- ---------------------------------------------------------------------------
count_bounds as (
  select category_id, min(evt_rank) as first_rank, max(evt_rank) as last_rank
  from v_stock_event_ranked
  where kind = 'count'
  group by category_id
),
unsettled as (
  select e.category_id, sum(e.amount) as amt
  from v_stock_event_ranked e
  left join count_bounds b on b.category_id = e.category_id
  cross join pd
  where e.kind = 'purchase'
    and e.occurred_on between pd.a and pd.b_eff
    and (b.first_rank is null
         or e.evt_rank < b.first_rank
         or e.evt_rank > b.last_rank)
  group by e.category_id
),

-- ---------------------------------------------------------------------------
-- Per-category rows. THIS IS WHERE ROUNDING HAPPENS, exactly once
-- (domain-spec §9.5).
--
-- revenue is derived as cost + margin from the two ALREADY-ROUNDED components
-- rather than rounded independently, and every total below is the sum of these
-- rounded rows. So the category table on screen always adds up to the KPI above
-- it. A total may therefore differ from the unrounded truth by a cent or two;
-- that is the intended trade, because a visible sum that is off by 0.01
-- destroys more trust than the precision is worth.
-- ---------------------------------------------------------------------------
cat_rows as (
  select c.id,
         c.name,
         c.sort_order,
         lc.last_on,
         lc.last_value,
         case when lc.last_on is null then null else pd.b_eff - lc.last_on end as days_since,
         mc.purchases,
         mc.losses,
         markup_at(c.id, pd.b_eff)                    as markup_pct,
         round(coalesce(a.goods_sold, 0), 2)          as gs_r,
         round(coalesce(a.gross_profit, 0), 2)        as gp_r,
         -- Capped at period_days: a zero-length window contributes 1 settled
         -- day on a date the adjacent window also covers, so the raw sum can
         -- exceed the period. Coverage above 100% would be nonsense.
         least(coalesce(a.settled_days, 0), pd.period_days) as settled_days,
         coalesce(u.amt, 0)                           as unsettled_purchases,
         expected_on_hand(c.id, pd.b_eff)             as max_on_hand
  from cats c
  left join alloc      a  on a.category_id  = c.id
  left join meas_cat   mc on mc.category_id = c.id
  left join last_count lc on lc.category_id = c.id
  left join unsettled  u  on u.category_id  = c.id
  cross join pd
),
totals as (
  select coalesce(sum(gs_r), 0)          as goods_sold_at_cost,
         coalesce(sum(gp_r), 0)          as gross_profit_est,
         coalesce(sum(gs_r + gp_r), 0)   as revenue_est,
         coalesce(sum(settled_days), 0)  as settled_days,
         count(*)                        as n_cats
  from cat_rows
),
cover as (
  select case
           when t.n_cats = 0 or pd.period_days = 0 then 0::numeric
           else t.settled_days * 100.0 / (t.n_cats * pd.period_days)
         end as pct
  from totals t cross join pd
)

select jsonb_build_object(

  'period', jsonb_build_object(
    'from',         pd.a,
    'to',           pd.b_req,
    'effective_to', pd.b_eff,
    'clamped',      pd.b_eff < pd.b_req,
    'days',         pd.period_days
  ),

  'measured', jsonb_build_object(
    'purchases_total',     round(m.purchases_total, 2),
    'operating_charges',   round(m.operating_charges, 2),
    'owner_draws_cash',    round(m.owner_draws_cash, 2),
    'shrinkage_losses',    round(m.shrinkage_losses, 2),
    'owner_draws_in_kind', round(m.owner_draws_in_kind, 2),
    'cash_out',            round(m.purchases_total + m.operating_charges
                                 + m.owner_draws_cash, 2)
  ),

  'modelled', jsonb_build_object(
    'goods_sold_at_cost',   t.goods_sold_at_cost,
    'revenue_est',          t.revenue_est,
    'gross_profit_est',     t.gross_profit_est,
    'operating_profit_est', t.gross_profit_est
                            - round(m.operating_charges, 2)
                            - round(m.shrinkage_losses, 2),
    'net_cash_change_est',  t.gross_profit_est
                            - round(m.operating_charges, 2)
                            - round(m.shrinkage_losses, 2)
                            - round(m.owner_draws_cash, 2)
                            - round(m.owner_draws_in_kind, 2),
    'cost_incurred',        t.goods_sold_at_cost
                            + round(m.operating_charges, 2)
                            + round(m.shrinkage_losses, 2)
  ),

  'coverage', jsonb_build_object(
    'pct',   round(cv.pct, 1),
    'level', case when cv.pct >= 90 then 'good'
                  when cv.pct >= 60 then 'partial'
                  else 'low' end,

    'categories_never_counted', coalesce((
      select jsonb_agg(r.name order by r.sort_order, r.name)
      from cat_rows r where r.last_on is null), '[]'::jsonb),

    'categories_stale', coalesce((
      select jsonb_agg(jsonb_build_object(
               'category_id', r.id, 'name', r.name, 'days', r.days_since)
             order by r.days_since desc)
      from cat_rows r where r.days_since > 30), '[]'::jsonb),

    'unsettled_purchases', (
      select round(coalesce(sum(r.unsettled_purchases), 0), 2) from cat_rows r),

    -- Anomalies are SURFACED, never clamped. A window whose numbers cannot be
    -- true is excluded from the profit chain and named here, linked to the
    -- category that produced it, so the underlying data can be fixed.
    'anomalies', coalesce((
      select jsonb_agg(jsonb_build_object(
               'category_id',        w.category_id,
               'category',           ac.name,
               'kind',               w.anomaly,
               'open_on',            w.open_on,
               'close_on',           w.close_on,
               'goods_sold_at_cost', round(w.goods_sold_at_cost, 2))
             order by w.open_on, ac.name)
      from v_count_window w
      join article_category ac on ac.id = w.category_id
      where w.anomaly is not null
        and window_overlap_days(w.open_on, w.close_on, pd.a, pd.b_eff) > 0
    ), '[]'::jsonb)
  ),

  'by_category', coalesce((
    select jsonb_agg(jsonb_build_object(
             'category_id',         r.id,
             'name',                r.name,
             'last_count_value',    r.last_value,
             'last_count_on',       r.last_on,
             'days_since_count',    r.days_since,
             'purchases_in_period', round(r.purchases, 2),
             'losses_in_period',    round(r.losses, 2),
             'markup_pct',          r.markup_pct,
             'goods_sold_at_cost',  r.gs_r,
             'revenue_est',         r.gs_r + r.gp_r,
             'gross_profit_est',    r.gp_r,
             'settled_days',        r.settled_days,
             'coverage_pct',        case when pd.period_days = 0 then 0::numeric
                                    else round(r.settled_days * 100.0 / pd.period_days, 1) end,
             'unsettled_purchases', round(r.unsettled_purchases, 2))
           order by r.sort_order, r.name)
    from cat_rows r), '[]'::jsonb),

  -- Grouped in a subquery first: jsonb_agg over a sum() in one expression is a
  -- nested aggregate and Postgres rejects it.
  'charges_by_category', coalesce((
    select jsonb_agg(jsonb_build_object(
             'charge_category_id', g.id,
             'name',               g.name,
             'nature',             g.nature::text,
             'amount',             round(g.amount, 2))
           order by g.sort_order, g.name)
    from (
      select cc.id, cc.name, cc.nature, cc.sort_order, sum(ch.amount) as amount
      from charge ch
      join charge_category cc on cc.id = ch.charge_category_id
      where ch.occurred_on between pd.a and pd.b_eff
      group by cc.id, cc.name, cc.nature, cc.sort_order
    ) g), '[]'::jsonb),

  'stock_on_hand', jsonb_build_object(
    'total_last_counted', (select round(coalesce(sum(r.last_value), 0), 2)
                             from cat_rows r where r.last_on is not null),
    'oldest_count_on',    (select min(r.last_on) from cat_rows r),
    'max_possible',       (select round(coalesce(sum(r.max_on_hand), 0), 2)
                             from cat_rows r where r.last_on is not null))
)
into v_result
from pd
cross join measured m
cross join totals t
cross join cover cv;

  return v_result;
end
$$;

comment on function report_period(date, date) is
  'The whole of domain-spec §6 as one JSON document. Every figure on the '
  'dashboard originates here; the client does no arithmetic on money.';

grant execute on function report_period(date, date) to authenticated;
