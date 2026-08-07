-- 0009_helpers.sql — markup resolution, the stock upper bound, and the
-- plausibility check that stands between the user and the category-scope trap.
--
-- domain-spec §2.3, §3.2, §6.3, §6.8; architecture-spec §3.3; plan §2.3c, §2.9.

-- ---------------------------------------------------------------------------
-- markup_at — the rate in force on a date, with a fallback to the earliest.
--
-- The fallback is not tidiness (plan §2.9). A window opening before the
-- category's first `effective_from` — reachable by backdating a purchase — would
-- otherwise return no row, and NULL × goods_sold propagates a silent NULL
-- through the ENTIRE profit chain: revenue, gross profit, operating profit, net
-- cash change, all null, with no error anywhere.
--
-- If the category has no rate at all the function still returns NULL, and
-- v_count_window flags the window as a `no_markup` anomaly instead of letting a
-- null reach the report (domain-spec §6.2).
-- ---------------------------------------------------------------------------

create function markup_at(p_category uuid, p_date date) returns numeric
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select markup_pct from markup_rate
      where category_id = p_category and effective_from <= p_date
      order by effective_from desc limit 1),
    (select markup_pct from markup_rate
      where category_id = p_category
      order by effective_from asc limit 1)
  )
$$;

comment on function markup_at(uuid, date) is
  'Markup percentage in force at a date, falling back to the earliest rate on '
  'record. A window spanning a rate change uses the rate at its START '
  '(domain-spec §6.3), so past reports never move when a rate is edited.';

-- ---------------------------------------------------------------------------
-- expected_on_hand — the UPPER BOUND on what a shelf can hold on a date.
--
--   last counted value
--   + everything bought since that count
--   − everything declared lost since that count
--   = the most that could possibly still be there
--
-- It is a bound, never a measurement: nothing here knows what was sold. The UI
-- must label it as such (domain-spec §6.8).
--
-- Returns NULL when the category has never been counted — there is no bound to
-- offer, and a caller must not read that as zero.
-- ---------------------------------------------------------------------------

create function expected_on_hand(p_category uuid, p_as_of date) returns numeric
language sql stable
set search_path = public, pg_temp
as $$
  with last_count as (
    select evt_rank, amount
    from v_stock_event_ranked
    where category_id = p_category
      and kind = 'count'
      and occurred_on <= p_as_of
    order by evt_rank desc
    limit 1
  )
  select lc.amount
       + coalesce((
           select sum(e.amount) from v_stock_event_ranked e
           where e.category_id = p_category and e.kind = 'purchase'
             and e.evt_rank > lc.evt_rank and e.occurred_on <= p_as_of
         ), 0)
       - coalesce((
           select sum(e.amount) from v_stock_event_ranked e
           where e.category_id = p_category and e.kind = 'loss'
             and e.evt_rank > lc.evt_rank and e.occurred_on <= p_as_of
         ), 0)
  from last_count lc
$$;

comment on function expected_on_hand(uuid, date) is
  'Upper bound on stock at cost for a category on a date. NULL when the '
  'category has never been counted — not zero.';

-- ---------------------------------------------------------------------------
-- check_count_plausibility — the third mitigation of the category-scope trap
-- (plan §2.3, domain-spec §3.2).
--
-- THE TRAP: a category is a basket, a delivery is one product in it. Asked
-- "what was left before this delivery?" while holding a milk crate, a person
-- naturally answers for the milk. The system reads it as the whole Dairy shelf
-- and books the cheese still physically present as sold at full markup. The
-- next count then shows stock rising unexplained — flagged, but by then the
-- false profit is already inside a closed month's report.
--
-- These are HEURISTICS and the system says so. A non-`ok` verdict shows a
-- blocking confirmation with "Corriger" as the primary action; it never
-- prevents saving, because the user may simply be right.
--
-- Returns jsonb rather than a bare verdict so the form can say WHAT it
-- expected — "vous avez saisi 50, mais ce rayon devrait contenir environ
-- 1 000" is actionable; "implausible" is not.
-- ---------------------------------------------------------------------------

create function check_count_plausibility(
  p_category uuid, p_as_of date, p_value numeric
) returns jsonb
language plpgsql stable
set search_path = public, pg_temp
as $$
declare
  v_bound     numeric := expected_on_hand(p_category, p_as_of);
  v_last_on   date;
  v_days      int;
  v_settled   int;
  v_avg_day   numeric;
  v_implied   numeric;
  v_verdict   text := 'ok';
begin
  select max(occurred_on) into v_last_on
  from stock_count
  where category_id = p_category and occurred_on <= p_as_of;

  v_days := p_as_of - v_last_on;

  -- Non-anomalous windows already closed on or before the date in question.
  select count(*) into v_settled
  from v_count_window w
  where w.category_id = p_category
    and w.anomaly is null
    and w.close_on <= p_as_of;

  if v_bound is null then
    -- Never counted: there is no bound, so there is nothing to be implausible
    -- against. The opening sweep of domain-spec §3.5 lands here.
    v_verdict := 'ok';

  elsif p_value > v_bound then
    v_verdict := 'exceeds_bound';

  elsif v_settled >= 2 then
    -- Trailing-90-day outflow per day, over settled windows only.
    select sum(w.outflow) / nullif(sum(w.window_days), 0) into v_avg_day
    from v_count_window w
    where w.category_id = p_category
      and w.anomaly is null
      and w.close_on <= p_as_of
      and w.close_on > p_as_of - 90;

    v_implied := (v_bound - p_value) / greatest(v_days, 1);

    if v_avg_day is not null and v_avg_day > 0 and v_implied > 3 * v_avg_day then
      v_verdict := 'high_outflow';
    end if;

  else
    -- No history yet: fewer than two settled windows, so there is no rate to
    -- compare against and only a crude shape check is possible.
    if p_value < 0.25 * v_bound and v_days < 7 then
      v_verdict := 'suspicious_drop';
    end if;
  end if;

  return jsonb_build_object(
    'verdict',               v_verdict,
    'entered',              round(p_value, 2),
    'expected_on_hand',     case when v_bound is null then null else round(v_bound, 2) end,
    'last_count_on',        v_last_on,
    'days_since_last_count', v_days,
    'settled_windows',      v_settled
  );
end
$$;

comment on function check_count_plausibility(uuid, date, numeric) is
  'Heuristic verdict on an entered count: ok | exceeds_bound | high_outflow | '
  'suspicious_drop. Advisory only — it never blocks a save.';

grant execute on function markup_at(uuid, date)                          to authenticated;
grant execute on function expected_on_hand(uuid, date)                   to authenticated;
grant execute on function check_count_plausibility(uuid, date, numeric)  to authenticated;
