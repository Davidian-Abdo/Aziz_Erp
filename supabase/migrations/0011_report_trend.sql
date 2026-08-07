-- 0011_report_trend.sql — the 12-month series behind the trend chart.
--
-- architecture-spec §3.4; plan §4 Phase 2.
--
-- Deliberately implemented by CALLING report_period once per month rather than
-- by reimplementing the maths over the same views. Twelve calls for a single
-- grocery store is nothing, and it makes "computed by the same primitives"
-- literally true: a correction to the profit chain cannot land in the dashboard
-- and miss the trend, which is exactly the sort of drift that makes two numbers
-- on one screen disagree.

create function report_trend(p_months int default 12) returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
  v_today date := store_today();
  v_n     int  := greatest(least(coalesce(p_months, 12), 60), 1);
  v_from  date;
  v_to    date;
  v_rep   jsonb;
  v_out   jsonb := '[]'::jsonb;
  i       int;
begin
  -- Oldest month first, ending with the month that contains today. The current
  -- month is partial by definition; report_period clamps its end to today, and
  -- `effective_to` is carried through so the chart can mark it as in progress
  -- rather than showing a short month as a collapse in trade.
  for i in reverse (v_n - 1) .. 0 loop
    v_from := (date_trunc('month', v_today::timestamp)
               - make_interval(months => i))::date;
    v_to   := (v_from + interval '1 month' - interval '1 day')::date;

    v_rep := report_period(v_from, v_to);

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'month',                to_char(v_from, 'YYYY-MM'),
      'from',                 v_from,
      'to',                   v_to,
      'effective_to',         v_rep -> 'period'   -> 'effective_to',
      'goods_sold_at_cost',   v_rep -> 'modelled' -> 'goods_sold_at_cost',
      'revenue_est',          v_rep -> 'modelled' -> 'revenue_est',
      'gross_profit_est',     v_rep -> 'modelled' -> 'gross_profit_est',
      'operating_profit_est', v_rep -> 'modelled' -> 'operating_profit_est',
      'net_cash_change_est',  v_rep -> 'modelled' -> 'net_cash_change_est',
      'operating_charges',    v_rep -> 'measured' -> 'operating_charges',
      'cash_out',             v_rep -> 'measured' -> 'cash_out',
      'coverage_pct',         v_rep -> 'coverage' -> 'pct'
    ));
  end loop;

  return v_out;
end
$$;

comment on function report_trend(int) is
  'Monthly series, oldest first, ending with the current (partial) month. '
  'Every figure comes from report_period, never from a parallel computation.';

grant execute on function report_trend(int) to authenticated;
