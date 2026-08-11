-- 095_edit_rpcs.sql — editing existing records (migration 0014).
--
-- domain-spec §8.5; plan §2.8; plan_review R3.
--
-- Two things are proved here, and the first matters more than the feature that
-- prompted it:
--
--   A. An embedded count can no longer be moved out from under its purchase by
--      an ordinary UPDATE. That hole was open from 0004 until 0014 and was
--      reachable over PostgREST by any allowlisted user — no edit screen needed.
--   B. edit_purchase re-evaluates the §3.2A "count required unless backdated"
--      rule in BOTH directions. That is what an edit can do and an insert
--      cannot: cross the boundary, in either direction, on an existing row.

begin;
create extension if not exists pgtap;
select plan(21);

delete from article_category;

insert into app_user (user_id, label)
values ('11111111-1111-1111-1111-111111111111', 'Owner')
on conflict (user_id) do nothing;

insert into article_category (id, name, description, sort_order) values
  ('ee000000-0000-0000-0000-00000000000a', 'Rayon A', 'x', 10),
  ('ee000000-0000-0000-0000-00000000000b', 'Rayon B', 'x', 20);

insert into markup_rate (category_id, markup_pct, effective_from)
select id, 20, '2025-01-01' from article_category;

-- The pair under test, inserted directly so the ids are known: a purchase in
-- Rayon A on 10 Jan with its embedded count. Written as the migration role,
-- which is the only one that may INSERT into purchase at all (0006).
insert into stock_count (id, category_id, occurred_on, value_at_cost, source)
values ('cc000000-0000-0000-0000-0000000000c1',
        'ee000000-0000-0000-0000-00000000000a', '2026-01-10', 500, 'purchase');

insert into purchase (id, category_id, occurred_on, amount_at_cost, prior_count_id)
values ('99000000-0000-0000-0000-0000000000f1',
        'ee000000-0000-0000-0000-00000000000a', '2026-01-10', 300,
        'cc000000-0000-0000-0000-0000000000c1');

-- A standalone count in Rayon B, which is what makes the §3.2A boundary of
-- Part D exist at all.
insert into stock_count (id, category_id, occurred_on, value_at_cost, source)
values ('cc000000-0000-0000-0000-0000000000b1',
        'ee000000-0000-0000-0000-00000000000b', '2026-01-05', 800, 'standalone');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Part A — the one-sided guard, now closed
--
-- The check is DEFERRED, so the offending UPDATE itself succeeds and the failure
-- lands at commit. `set constraints all immediate` is what forces that moment to
-- arrive inside a fixture that ends in rollback.
-- ---------------------------------------------------------------------------

savepoint a1;
update stock_count set occurred_on = '2026-01-02'
where id = 'cc000000-0000-0000-0000-0000000000c1';
select throws_ok(
  'set constraints all immediate',
  '23514', null,
  'AN EMBEDDED COUNT CANNOT BE MOVED OUT FROM UNDER ITS PURCHASE');
rollback to savepoint a1;

savepoint a2;
update stock_count set category_id = 'ee000000-0000-0000-0000-00000000000b'
where id = 'cc000000-0000-0000-0000-0000000000c1';
select throws_ok(
  'set constraints all immediate',
  '23514', null,
  'nor moved into another category');
rollback to savepoint a2;

-- The guard has to be narrow, or it makes every count read-only and the counts
-- screen stops working.
savepoint a3;
update stock_count set value_at_cost = 550
where id = 'cc000000-0000-0000-0000-0000000000c1';
set constraints all immediate;
select is(
  (select value_at_cost from stock_count where id = 'cc000000-0000-0000-0000-0000000000c1'),
  550.00::numeric,
  'but its VALUE is still editable — only the pair''s identity is pinned');
rollback to savepoint a3;

update stock_count set occurred_on = '2026-01-06'
where id = 'cc000000-0000-0000-0000-0000000000b1';
set constraints all immediate;
select is(
  (select occurred_on from stock_count where id = 'cc000000-0000-0000-0000-0000000000b1'),
  '2026-01-06'::date,
  'a STANDALONE count moves freely — it owns nothing');

-- `set constraints all immediate` above applies to the REST OF THE TRANSACTION,
-- not to the statement it accompanies. Left as-is it would put every later
-- edit_purchase call into immediate mode and fail the legitimate two-step move
-- of Part C — which is exactly what happened when this fixture was first run,
-- and is why edit_purchase now asserts the mode itself rather than assuming it.
set constraints all deferred;

-- ---------------------------------------------------------------------------
-- Part B — the ordinary correction
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select edit_purchase('99000000-0000-0000-0000-0000000000f1',
       'ee000000-0000-0000-0000-00000000000a', '2026-01-10', 450, 600, 'corrected') $$,
  'the amount, the prior stock and the note can all be corrected');

select is((select amount_at_cost from purchase
           where id = '99000000-0000-0000-0000-0000000000f1'),
          450.00::numeric, 'the purchase carries the new amount');
select is((select note from purchase
           where id = '99000000-0000-0000-0000-0000000000f1'),
          'corrected', 'and the new note');
select is((select value_at_cost from stock_count
           where id = 'cc000000-0000-0000-0000-0000000000c1'),
          600.00::numeric, 'the embedded count carries the new prior stock');
select is((select count(*)::int from purchase), 1,
          'and editing created no second purchase');

-- ---------------------------------------------------------------------------
-- Part C — the pair moves together, to a new date AND a new category
-- ---------------------------------------------------------------------------

select edit_purchase('99000000-0000-0000-0000-0000000000f1',
                     'ee000000-0000-0000-0000-00000000000b',
                     '2026-01-20', 450, 600, 'moved');

select is((select occurred_on from purchase
           where id = '99000000-0000-0000-0000-0000000000f1'),
          '2026-01-20'::date, 'the purchase moved');
select is((select occurred_on from stock_count
           where id = 'cc000000-0000-0000-0000-0000000000c1'),
          '2026-01-20'::date,
          'AND ITS COUNT MOVED WITH IT — the same row, not a new one');
select is((select category_id from stock_count
           where id = 'cc000000-0000-0000-0000-0000000000c1'),
          'ee000000-0000-0000-0000-00000000000b'::uuid,
          'category too, so the deferred check passes at commit');
select is((select count(*)::int from stock_count where source = 'purchase'), 1,
          'still exactly one embedded count — the move orphaned nothing');

-- ---------------------------------------------------------------------------
-- Part D — the §3.2A boundary, crossed in both directions
--
-- Rayon B holds a standalone count on 6 Jan. The purchase now sits on 20 Jan.
-- ---------------------------------------------------------------------------

select edit_purchase('99000000-0000-0000-0000-0000000000f1',
                     'ee000000-0000-0000-0000-00000000000b',
                     '2026-01-02', 450, null, 'backdated');

select is((select prior_count_id from purchase
           where id = '99000000-0000-0000-0000-0000000000f1'), null,
          'MOVED BEHIND THE LAST COUNT: the purchase gives up its count');
select is((select count(*)::int from stock_count
           where id = 'cc000000-0000-0000-0000-0000000000c1'), 0,
          'and the count row is deleted, not left orphaned');

select throws_ok(
  $$ select edit_purchase('99000000-0000-0000-0000-0000000000f1',
       'ee000000-0000-0000-0000-00000000000b', '2026-01-02', 450, 700) $$,
  '23514', null,
  'a backdated purchase still refuses to carry a count');

select throws_ok(
  $$ select edit_purchase('99000000-0000-0000-0000-0000000000f1',
       'ee000000-0000-0000-0000-00000000000b', '2026-01-25', 450, null) $$,
  '23514', null,
  'MOVED FORWARD OF THE LAST COUNT: a count becomes required again');

select edit_purchase('99000000-0000-0000-0000-0000000000f1',
                     'ee000000-0000-0000-0000-00000000000b',
                     '2026-01-25', 450, 700, 'forward');

select isnt((select prior_count_id from purchase
             where id = '99000000-0000-0000-0000-0000000000f1'), null,
            'and supplying one creates it');
select is((select value_at_cost from stock_count
           where id = (select prior_count_id from purchase
                       where id = '99000000-0000-0000-0000-0000000000f1')),
          700.00::numeric, 'with the prior stock the user gave');

-- ---------------------------------------------------------------------------
-- Part E — existence and authorisation
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select edit_purchase('99999999-9999-9999-9999-999999999999',
       'ee000000-0000-0000-0000-00000000000a', '2026-01-10', 100, 100) $$,
  'P0002', null,
  'editing a purchase that does not exist fails cleanly');

set local request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select throws_ok(
  $$ select edit_purchase('99000000-0000-0000-0000-0000000000f1',
       'ee000000-0000-0000-0000-00000000000b', '2026-01-25', 1, 1) $$,
  '42501', null,
  'A NON-ALLOWLISTED USER CANNOT EDIT — SECURITY DEFINER checks it itself');

reset role;

select * from finish();
rollback;
