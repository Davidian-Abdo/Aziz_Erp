-- 0014_edit_rpcs.sql — editing existing records.
--
-- domain-spec §8.5 ("All records are editable and deletable"); plan §2.8;
-- plan_review R3. Decided by the owner 2026-08-11: Phase 4 shipped deletion
-- only, and correcting a mistake meant delete-and-re-enter.
--
-- Charges, losses and standalone counts are NOT here. They are single rows with
-- no cross-row invariant, `authenticated` already holds UPDATE on them, and the
-- audit trigger of 0005 already records the before/after — so an ordinary
-- PostgREST update is both sufficient and safer than a new SECURITY DEFINER
-- surface. This file exists for the two things that ordinary updates get wrong.

-- ---------------------------------------------------------------------------
-- 1. ⚠ A DEFECT THAT PREDATES THIS FILE: the coherence guard is one-sided.
--
-- 0004_guards.sql protects a purchase and its embedded count with a trigger on
-- `purchase`, fired by changes to prior_count_id, category_id or occurred_on.
-- Nothing guards the OTHER side. `authenticated` holds UPDATE on stock_count
-- (0006_security.sql), so a single PostgREST call moves an embedded count out
-- from under the purchase that owns it:
--
--   update stock_count set occurred_on = '2026-01-02' where id = <embedded>;
--
-- Measured on the local database before this migration existed: the update
-- succeeds, and the purchase and its count then disagree about the date. That
-- is precisely the state 0004's own comment calls "the timeline silently
-- corrupted rather than failing loudly — the worst kind of bug in this system,
-- because the resulting numbers still look plausible." v_stock_event takes the
-- category from the count and the ordering anchor from the purchase, so the
-- delivery is ordered against one date and valued against another.
--
-- This was reachable over the API before any edit screen existed. Building the
-- edit feature is what found it, not what caused it.
--
-- ⚠ DEFERRED, and that is load-bearing rather than a detail. edit_purchase below
-- has to move the count and the purchase to a new date, and whichever it writes
-- first leaves the pair transiently disagreeing. An immediate trigger would
-- refuse its own legitimate two-step move; a deferred CONSTRAINT trigger runs at
-- COMMIT, so it permits any transaction that ends coherent and rejects any that
-- does not — including a lone PostgREST update, which commits by itself.
-- ---------------------------------------------------------------------------

create function guard_embedded_count_coherent() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  p record;
begin
  if new.source <> 'purchase' then
    return null;   -- a standalone count owns nothing and is freely editable
  end if;

  select category_id, occurred_on into p
  from purchase where prior_count_id = new.id;

  if not found then
    return null;   -- not (or no longer) attached to a purchase
  end if;

  if p.category_id <> new.category_id or p.occurred_on <> new.occurred_on then
    raise exception
      'this count belongs to a purchase and must move with it (purchase is % on %, count is % on %)',
      p.category_id, p.occurred_on, new.category_id, new.occurred_on
      using errcode = 'check_violation',
            hint = 'Edit the purchase itself; edit_purchase() moves both rows together.';
  end if;

  return null;
end
$$;

create constraint trigger stock_count_embedded_coherent
  after insert or update on stock_count
  deferrable initially deferred
  for each row execute function guard_embedded_count_coherent();

-- ---------------------------------------------------------------------------
-- 2. edit_purchase — the purchase and its embedded count, moved together.
--
-- SECURITY DEFINER for the same reason record_purchase is: `authenticated` holds
-- no INSERT on `purchase` (0006), and the "a count is required unless the
-- purchase is backdated" rule of domain-spec §3.2A is a cross-row condition no
-- constraint can express. An edit can cross that boundary in BOTH directions —
-- move a backdated purchase forward and it now needs a count that does not
-- exist; move a current one behind the last count and its count must go — so the
-- rule has to be re-evaluated on every edit, not just on insert.
--
-- No p_request_id, deliberately. Idempotency exists to stop a retried INSERT
-- posting money twice; an edit sets fields to given values and converges on
-- replay — running it twice leaves exactly the state running it once does.
-- ---------------------------------------------------------------------------

create function edit_purchase(
  p_id          uuid,
  p_category    uuid,
  p_date        date,
  p_amount      numeric,
  p_prior_stock numeric,
  p_note        text default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_old_count_id uuid;
  v_last_count   date;
  v_count_id     uuid;
begin
  if not is_app_user() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  -- The two-step move below is transiently incoherent by construction, so this
  -- function's correctness depends on the constraint actually being deferred.
  -- It is declared INITIALLY DEFERRED, but `set constraints all immediate`
  -- earlier in the same transaction silently flips it back and the move then
  -- fails on a state it is entitled to pass through. Asserting the mode here
  -- rather than assuming it costs nothing and removes the dependency on
  -- whatever else the transaction has done.
  set constraints stock_count_embedded_coherent deferred;

  select prior_count_id into v_old_count_id
  from purchase where id = p_id;

  if not found then
    raise exception 'purchase % does not exist', p_id
      using errcode = 'no_data_found';
  end if;

  -- The category's last count as it would stand WITHOUT this purchase's own
  -- embedded count. Including it would make every purchase look as though it
  -- sat on its own boundary and could never be edited forward.
  select max(occurred_on) into v_last_count
  from stock_count
  where category_id = p_category
    and (v_old_count_id is null or id <> v_old_count_id);

  if v_last_count is not null and p_date < v_last_count then
    -- Backdated: inflow inside a window already closed at both ends. No count.
    if p_prior_stock is not null then
      raise exception
        'purchase on % is behind the last count (%); no count may be attached',
        p_date, v_last_count
        using errcode = '23514';
    end if;

    -- Order matters: prior_count_id is ON DELETE RESTRICT, so the reference has
    -- to be dropped before the row it points at can go.
    if v_old_count_id is not null then
      update purchase set prior_count_id = null where id = p_id;
      delete from stock_count where id = v_old_count_id and source = 'purchase';
    end if;
    v_count_id := null;

  else
    -- The purchase is the category's newest event, including when dated exactly
    -- ON the last count (plan_review R3 — see record_purchase for why that case
    -- keeps its count rather than being trimmed as an edge).
    if p_prior_stock is null then
      raise exception
        'a count is required: this purchase is the newest event for its category'
        using errcode = '23514',
              hint = 'Ask what was on the shelf before the delivery arrived.';
    end if;

    if v_old_count_id is null then
      insert into stock_count (category_id, occurred_on, value_at_cost, source)
      values (p_category, p_date, p_prior_stock, 'purchase')
      returning id into v_count_id;
    else
      -- Moved first, leaving the pair transiently incoherent. That is exactly
      -- what the DEFERRED constraint trigger above exists to allow.
      update stock_count
      set category_id   = p_category,
          occurred_on   = p_date,
          value_at_cost = p_prior_stock
      where id = v_old_count_id;
      v_count_id := v_old_count_id;
    end if;
  end if;

  update purchase
  set category_id    = p_category,
      occurred_on    = p_date,
      amount_at_cost = p_amount,
      prior_count_id = v_count_id,
      note           = p_note
  where id = p_id;

  return jsonb_build_object('purchase_id', p_id, 'count_id', v_count_id);
end
$$;

comment on function edit_purchase(uuid, uuid, date, numeric, numeric, text) is
  'Edits a purchase and its embedded count atomically, re-evaluating the '
  '§3.2A "count required unless backdated" rule — which an edit can cross in '
  'either direction.';

grant execute on function edit_purchase(uuid, uuid, date, numeric, numeric, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The revoke sweep, moved here — it must be the last statement of the LAST
-- migration (0012's own comment says so, and says the next migration adding a
-- function has to move it). Without this line `anon` would hold the implicit
-- PUBLIC execute grant on edit_purchase — a SECURITY DEFINER function, where
-- RLS does not apply and only its own is_app_user() check stands in the way.
--
-- 020_rls.sql asserts the resulting privilege state as a property over pg_proc
-- rather than function by function, so a future omission fails loudly instead of
-- passing for a coincidental reason.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from anon, public;
