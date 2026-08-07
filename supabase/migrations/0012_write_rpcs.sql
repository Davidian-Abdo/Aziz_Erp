-- 0012_write_rpcs.sql — the two writes that must be atomic.
--
-- domain-spec §3.2, §3.5; architecture-spec §4.1; plan §2.4, §2.12;
-- plan_review R3, R6.
--
-- ⚠ THIS FILE IS NOT IN THE PLAN'S MIGRATION LIST, and it has to exist.
-- Plan §4 gives Phase 1 files 0001–0006 and Phase 2 files 0007–0011; neither
-- includes record_purchase or record_count_sweep, yet §5.2 requires fixture
-- `090_write_rpcs.sql` to pass before Phase 2 closes, and Phase 4 is UI work.
-- The RPCs therefore have no home in the plan as written. They belong to the
-- engine, so they are built here, as 0012.
--
-- Charges, losses and single counts stay ordinary PostgREST inserts — they have
-- no multi-row invariant to protect.

-- ---------------------------------------------------------------------------
-- record_purchase — the count and the purchase, written together or not at all.
--
-- SECURITY DEFINER, because `authenticated` deliberately holds no INSERT grant
-- on `purchase` (0006_security.sql): the "a purchase needs its count" rule is a
-- cross-row condition no constraint can express, so if a client could INSERT
-- directly it could bypass the rule with one PostgREST call, and a purchase
-- without its count silently unsettles the whole timeline.
--
-- Because it is DEFINER, RLS does not protect it — so the allowlist is checked
-- here explicitly. A security-definer function that skips that check is a hole
-- straight through §2.5.
-- ---------------------------------------------------------------------------

create function record_purchase(
  p_request_id uuid,
  p_category   uuid,
  p_date       date,
  p_amount     numeric,
  p_prior_stock numeric,
  p_note       text default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_cached       jsonb;
  v_cached_rpc   text;
  v_last_count   date;
  v_count_id     uuid;
  v_purchase_id  uuid;
  v_result       jsonb;
begin
  if not is_app_user() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'p_request_id is required — it is what makes a retry safe'
      using errcode = '22004';
  end if;

  -- Reserve the request id BEFORE doing any work. A concurrent duplicate then
  -- blocks on this primary key rather than racing us to a second purchase; when
  -- the first transaction commits, the second lands in the handler below and
  -- replays its result instead of posting the money twice.
  begin
    insert into write_request (request_id, rpc, result)
    values (p_request_id, 'record_purchase', '{}'::jsonb);
  exception when unique_violation then
    select rpc, result into v_cached_rpc, v_cached
    from write_request where request_id = p_request_id;
    if v_cached_rpc is distinct from 'record_purchase' then
      raise exception 'request_id % was already used by %', p_request_id, v_cached_rpc
        using errcode = '23505';
    end if;
    return v_cached || jsonb_build_object('replayed', true);
  end;

  select max(occurred_on) into v_last_count
  from stock_count where category_id = p_category;

  if v_last_count is not null and p_date < v_last_count then
    -- Backdated: the purchase lands inside a window that is already closed at
    -- both ends, so there is nothing to count — it is simply inflow.
    if p_prior_stock is not null then
      raise exception
        'purchase on % is behind the last count (%); no count may be attached',
        p_date, v_last_count
        using errcode = '23514';
    end if;
    v_count_id := null;

  else
    -- The purchase is the category's newest event — INCLUDING when it is dated
    -- exactly ON the last count (plan_review R3). That case is not an edge to
    -- trim: a standalone count sorts after all purchases of its date (rule 3),
    -- so an afternoon delivery on the morning of a sweep would otherwise be
    -- ordered BEFORE that sweep, dumping the whole delivery into the window
    -- that just closed and booking it as sold at full markup on the day it
    -- arrived. Keeping the embedded count gives the coherent order
    -- embedded count → purchase → standalone count.
    if p_prior_stock is null then
      raise exception
        'a count is required: this purchase is the newest event for its category'
        using errcode = '23514',
              hint = 'Ask what was on the shelf before the delivery arrived.';
    end if;

    insert into stock_count (category_id, occurred_on, value_at_cost, source)
    values (p_category, p_date, p_prior_stock, 'purchase')
    returning id into v_count_id;
  end if;

  insert into purchase (category_id, occurred_on, amount_at_cost, prior_count_id, note)
  values (p_category, p_date, p_amount, v_count_id, p_note)
  returning id into v_purchase_id;

  v_result := jsonb_build_object(
    'purchase_id', v_purchase_id,
    'count_id',    v_count_id
  );

  update write_request set result = v_result where request_id = p_request_id;

  return v_result || jsonb_build_object('replayed', false);
end
$$;

comment on function record_purchase(uuid, uuid, date, numeric, numeric, text) is
  'Writes a purchase and its embedded count atomically. Idempotent on '
  'p_request_id, which is generated once per form submission — not per attempt.';

-- ---------------------------------------------------------------------------
-- record_count_sweep — one count per category, in a single transaction.
--
-- Used for month-end closing and for the opening sweep of domain-spec §3.5. A
-- half-written sweep is worse than none: it would close some categories'
-- windows on a date and leave others open, and the resulting report would look
-- perfectly ordinary.
-- ---------------------------------------------------------------------------

create function record_count_sweep(
  p_request_id uuid,
  p_date       date,
  p_counts     jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_cached     jsonb;
  v_cached_rpc text;
  v_ids        uuid[] := '{}';
  v_id         uuid;
  v_item       jsonb;
  v_result     jsonb;
begin
  if not is_app_user() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'p_request_id is required — it is what makes a retry safe'
      using errcode = '22004';
  end if;

  if p_counts is null or jsonb_typeof(p_counts) <> 'array'
     or jsonb_array_length(p_counts) = 0 then
    raise exception 'p_counts must be a non-empty array of {category_id, value_at_cost}'
      using errcode = '22023';
  end if;

  begin
    insert into write_request (request_id, rpc, result)
    values (p_request_id, 'record_count_sweep', '{}'::jsonb);
  exception when unique_violation then
    select rpc, result into v_cached_rpc, v_cached
    from write_request where request_id = p_request_id;
    if v_cached_rpc is distinct from 'record_count_sweep' then
      raise exception 'request_id % was already used by %', p_request_id, v_cached_rpc
        using errcode = '23505';
    end if;
    return v_cached || jsonb_build_object('replayed', true);
  end;

  for v_item in select * from jsonb_array_elements(p_counts) loop
    insert into stock_count (category_id, occurred_on, value_at_cost, source)
    values ((v_item ->> 'category_id')::uuid,
            p_date,
            (v_item ->> 'value_at_cost')::numeric,
            'standalone')
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  v_result := jsonb_build_object(
    'count_ids', to_jsonb(v_ids),
    'n',         array_length(v_ids, 1)
  );

  update write_request set result = v_result where request_id = p_request_id;

  return v_result || jsonb_build_object('replayed', false);
end
$$;

comment on function record_count_sweep(uuid, date, jsonb) is
  'Writes one standalone count per category in a single transaction. '
  'All-or-nothing: a half-written sweep produces a report that looks ordinary '
  'and is wrong.';

grant execute on function record_purchase(uuid, uuid, date, numeric, numeric, text)
  to authenticated;
grant execute on function record_count_sweep(uuid, date, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The revoke sweep, repeated — and this is not belt-and-braces.
--
-- architecture-spec §4.2 calls `revoke execute on all functions in schema public
-- from anon, public` "the last statement of the grants migration", and in
-- 0006_security.sql it is. But EVERY function created after it — all of
-- 0007–0012 — is created with the implicit PUBLIC execute grant intact, so the
-- sweep no longer covers them. Measured before this line existed: `anon` held
-- EXECUTE on report_period, report_trend, record_purchase, record_count_sweep,
-- markup_at, expected_on_hand, check_count_plausibility and window_overlap_days.
--
-- For the SECURITY INVOKER functions that was survivable — they read tables
-- `anon` has no grant on, so the call failed one step later with the same error
-- code, which is why the RLS fixture passed and hid it.
--
-- For the two SECURITY DEFINER write RPCs it was not. They run as their owner,
-- RLS does not apply, and only their own is_app_user() check stood between an
-- unauthenticated caller and a write. That check holds, but a single in-function
-- `if` is not the two independent defences §2.5 requires.
--
-- So: the sweep belongs at the end of the LAST migration, not the last security
-- one. Any future migration that adds a function must move it again.
--
-- Revoking from PUBLIC does not touch the explicit grants to `authenticated`
-- above, which is why they are made first.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from anon, public;
