-- 090_write_rpcs.sql — the two writes that must be atomic, and idempotent.
--
-- plan §5.2, §2.4, §2.12; architecture-spec §4.1; domain-spec §3.2;
-- plan_review R3, R6.
--
-- The failure this file exists to prevent: a retried purchase on a flaky phone
-- connection posts the money twice, and a duplicated purchase inflates outflow —
-- which this model reports as PROFIT. Nothing about the resulting number looks
-- wrong.
--
-- Everything after the setup runs as an ALLOWLISTED AUTHENTICATED user, the way
-- the app will. Both RPCs are SECURITY DEFINER, so RLS does not protect them and
-- they check the allowlist themselves; that check is asserted at the end.

begin;
create extension if not exists pgtap;
select plan(23);

delete from article_category;

insert into app_user (user_id, label)
values ('11111111-1111-1111-1111-111111111111', 'Owner');

insert into article_category (id, name, description, sort_order) values
  ('0b0b0000-0000-0000-0000-00000000000a', 'K', 'x', 10),
  ('0b0b0000-0000-0000-0000-00000000000b', 'L', 'x', 20);

insert into markup_rate (category_id, markup_pct, effective_from)
select id, 20, '2025-01-01' from article_category;

-- An opening sweep for each, on 10 May. L's is a MORNING sweep — that matters
-- for the same-date case below.
insert into stock_count (category_id, occurred_on, value_at_cost, source, created_at) values
  ('0b0b0000-0000-0000-0000-00000000000a', '2026-05-10', 1000, 'standalone',
   '2026-05-10 09:00:00+00'),
  ('0b0b0000-0000-0000-0000-00000000000b', '2026-05-10', 1000, 'standalone',
   '2026-05-10 09:00:00+00');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- The embedded count is required when the purchase is the newest event
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select record_purchase('a0000000-0000-0000-0000-000000000001',
       '0b0b0000-0000-0000-0000-00000000000a', '2026-05-20', 300, null, null) $$,
  '23514', null,
  'a current-dated purchase with no count is rejected');

select is(
  (select count(*)::int from purchase
   where category_id = '0b0b0000-0000-0000-0000-00000000000a'),
  0, 'and nothing was written — the rejection is atomic');

select isnt(
  record_purchase('a0000000-0000-0000-0000-000000000002',
    '0b0b0000-0000-0000-0000-00000000000a', '2026-05-20', 300, 800, null) ->> 'count_id',
  null, 'with the count supplied, the pair is written');

select is(
  (record_purchase('a0000000-0000-0000-0000-000000000002',
     '0b0b0000-0000-0000-0000-00000000000a', '2026-05-20', 300, 800, null)
   ->> 'replayed')::boolean,
  true, 'a repeat of the same request_id is a REPLAY, not a second write');

select is(
  (select count(*)::int from purchase
   where category_id = '0b0b0000-0000-0000-0000-00000000000a'),
  1, 'the same request_id twice creates exactly one purchase');

-- The cache is invisible to the app. Only the SECURITY DEFINER RPCs touch it;
-- `authenticated` holds no grant, and RLS is on with no policy at all.
select throws_ok(
  $$ select count(*) from write_request $$,
  '42501', null,
  'the idempotency cache is not readable by the client at any point');

reset role;
select is(
  (select count(*)::int from write_request
   where request_id = 'a0000000-0000-0000-0000-000000000002'),
  1, 'and holds exactly one cache row for the replayed request');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Backdating (plan §2.4, D-C)
-- ---------------------------------------------------------------------------

select is(
  record_purchase('a0000000-0000-0000-0000-000000000003',
    '0b0b0000-0000-0000-0000-00000000000a', '2026-05-15', 150, null, null)
  ->> 'count_id',
  null,
  'a purchase STRICTLY behind the last count saves with no count attached');

select is(
  (select prior_count_id from purchase
   where category_id = '0b0b0000-0000-0000-0000-00000000000a'
     and occurred_on = '2026-05-15'),
  null, 'it is recorded as inflow inside the window that already contains it');

select throws_ok(
  $$ select record_purchase('a0000000-0000-0000-0000-000000000004',
       '0b0b0000-0000-0000-0000-00000000000a', '2026-05-15', 150, 900, null) $$,
  '23514', null,
  'offering a count on a backdated purchase is refused rather than ignored');

-- ---------------------------------------------------------------------------
-- plan_review R3 — a purchase dated EXACTLY on the last count date
--
-- The one-word difference between "at or behind" and "strictly behind". A
-- standalone count sorts after all purchases of its date (rule 3), so an
-- afternoon delivery on the morning of a sweep would otherwise be ordered
-- BEFORE that sweep — dumping the whole delivery into the window that just
-- closed and booking it as sold at full markup on the day it arrived.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select record_purchase('a0000000-0000-0000-0000-000000000005',
       '0b0b0000-0000-0000-0000-00000000000b', '2026-05-10', 400, null, null) $$,
  '23514', null,
  'R3: a purchase dated ON the last count date still REQUIRES its count');

select isnt(
  record_purchase('a0000000-0000-0000-0000-000000000006',
    '0b0b0000-0000-0000-0000-00000000000b', '2026-05-10', 400, 700, null) ->> 'count_id',
  null, 'R3: supplied, it is written');

select is(
  (select array_agg(kind order by evt_rank) from v_stock_event_ranked
   where category_id = '0b0b0000-0000-0000-0000-00000000000b'),
  array['count', 'purchase', 'count'],
  'R3: the order is embedded count → purchase → standalone sweep');

select is(
  (select inflow from v_count_window
   where category_id = '0b0b0000-0000-0000-0000-00000000000b'),
  400.00::numeric,
  'R3: the delivery lands in the window the sweep closes, not the one before it');

-- ---------------------------------------------------------------------------
-- record_purchase is atomic
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select record_purchase('a0000000-0000-0000-0000-000000000007',
       '0b0b0000-0000-0000-0000-00000000000a', '2026-05-28', 0, 500, null) $$,
  '23514', null,
  'a purchase of zero is refused by the table check');

select is(
  (select count(*)::int from stock_count
   where category_id = '0b0b0000-0000-0000-0000-00000000000a'
     and occurred_on = '2026-05-28'),
  0, 'and its count is rolled back with it — no orphan count is left behind');

-- ---------------------------------------------------------------------------
-- record_count_sweep
-- ---------------------------------------------------------------------------

select is(
  (record_count_sweep('b0000000-0000-0000-0000-000000000001', '2026-05-25',
     '[{"category_id":"0b0b0000-0000-0000-0000-00000000000a","value_at_cost":900},
       {"category_id":"0b0b0000-0000-0000-0000-00000000000b","value_at_cost":1200}]'::jsonb)
   ->> 'n')::int,
  2, 'a sweep writes one count per category');

select is(
  (record_count_sweep('b0000000-0000-0000-0000-000000000001', '2026-05-25',
     '[{"category_id":"0b0b0000-0000-0000-0000-00000000000a","value_at_cost":900},
       {"category_id":"0b0b0000-0000-0000-0000-00000000000b","value_at_cost":1200}]'::jsonb)
   ->> 'replayed')::boolean,
  true, 'and replays on the same request_id rather than sweeping twice');

select is(
  (select count(*)::int from stock_count
   where occurred_on = '2026-05-25' and source = 'standalone'),
  2, 'still exactly two counts on that date');

-- All-or-nothing: the second element collides with the first on the partial
-- unique index. A HALF-WRITTEN SWEEP IS WORSE THAN NONE — it would close some
-- categories' windows on a date and leave others open, and the report would
-- look perfectly ordinary.
select throws_ok(
  $$ select record_count_sweep('b0000000-0000-0000-0000-000000000002', '2026-05-26',
       '[{"category_id":"0b0b0000-0000-0000-0000-00000000000a","value_at_cost":500},
         {"category_id":"0b0b0000-0000-0000-0000-00000000000a","value_at_cost":600}]'::jsonb) $$,
  '23505', null,
  'a sweep with a duplicate category is rejected');

select is(
  (select count(*)::int from stock_count where occurred_on = '2026-05-26'),
  0, 'and leaves nothing behind — not even the element that succeeded');

-- ---------------------------------------------------------------------------
-- Deleting a purchase removes its embedded count
--
-- The count describes a shelf before a delivery that no longer exists. Leaving
-- it would invent a count the user never took, and close a window at a value
-- nobody measured.
-- ---------------------------------------------------------------------------

delete from purchase
where category_id = '0b0b0000-0000-0000-0000-00000000000a' and occurred_on = '2026-05-20';

select is(
  (select count(*)::int from stock_count
   where category_id = '0b0b0000-0000-0000-0000-00000000000a'
     and occurred_on = '2026-05-20' and source = 'purchase'),
  0, 'deleting a purchase removes the count embedded in it');

-- ---------------------------------------------------------------------------
-- The allowlist reaches inside the RPCs too
--
-- Both are SECURITY DEFINER, so RLS does NOT protect them. A definer function
-- that skips this check is a hole straight through the allowlist that §2.5
-- exists to be.
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';

select throws_ok(
  $$ select record_purchase('c0000000-0000-0000-0000-000000000001',
       '0b0b0000-0000-0000-0000-00000000000a', '2026-05-29', 100, 500, null) $$,
  '42501', null,
  'an authenticated user who is not on the allowlist cannot record a purchase');

reset role;

select * from finish();
rollback;
