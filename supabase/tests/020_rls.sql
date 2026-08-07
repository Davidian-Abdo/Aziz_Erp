-- 020_rls.sql — nobody reads the books without being on the allowlist.
--
-- plan §5.2, §2.5. This file exists because of the single most serious defect in
-- either spec: `to authenticated using (true)` plus Supabase's default-open
-- signup would have let any stranger who registered read and write the store's
-- finances.
--
-- Three identities are exercised:
--   anon                     — not logged in
--   authenticated, no row    — registered, but NOT on the allowlist
--   authenticated, with row  — the owner
--
-- Identity is switched the way Supabase itself does it: `set local role` plus
-- the request.jwt.claim.sub GUC that auth.uid() reads.

begin;
create extension if not exists pgtap;
select plan(37);

-- ---------------------------------------------------------------------------
-- Fixtures, created as the migration role before we drop privileges
-- ---------------------------------------------------------------------------

insert into app_user (user_id, label)
values ('11111111-1111-1111-1111-111111111111', 'Owner');

-- Give every table one row, so "reads nothing" is a real assertion and not just
-- an empty table.
insert into article_category (id, name, description)
values ('22222222-2222-2222-2222-222222222222', 'Test cat', 'x');

insert into markup_rate (category_id, markup_pct, effective_from)
values ('22222222-2222-2222-2222-222222222222', 20, '2026-01-01');

insert into charge_category (id, name, nature)
values ('33333333-3333-3333-3333-333333333333', 'Test charge cat', 'operating');

insert into stock_count (category_id, occurred_on, value_at_cost, source)
values ('22222222-2222-2222-2222-222222222222', '2026-01-01', 100, 'standalone');

insert into stock_loss (category_id, occurred_on, amount_at_cost, reason)
values ('22222222-2222-2222-2222-222222222222', '2026-01-01', 10, 'spoiled');

insert into charge (charge_category_id, occurred_on, amount)
values ('33333333-3333-3333-3333-333333333333', '2026-01-01', 50);

insert into takings (occurred_on, amount) values ('2026-01-01', 500);

-- ---------------------------------------------------------------------------
-- RLS is enabled everywhere. A policy is worthless on a table without it.
-- ---------------------------------------------------------------------------

select ok(
  (select bool_and(rowsecurity) from pg_tables
   where schemaname = 'public'
     and tablename in ('app_settings','article_category','markup_rate',
                       'charge_category','stock_count','purchase','stock_loss',
                       'charge','takings','audit_log','app_user','write_request')),
  'RLS is enabled on every table'
);

select is(
  (select count(*)::int from pg_tables
   where schemaname = 'public' and not rowsecurity),
  0,
  'no table in public is left without RLS'
);

-- ---------------------------------------------------------------------------
-- anon holds EXECUTE on nothing this project creates.
--
-- Stated as a property over pg_proc rather than function by function, because
-- the failure it catches is one of OMISSION. 0006's revoke sweep cannot reach
-- functions created in later migrations, and every function in 0007-0012 kept
-- its implicit PUBLIC execute grant until the sweep was repeated at the end of
-- 0012. Two of those are SECURITY DEFINER writes.
--
-- Extension-owned functions (pgtap's own, created just above) are excluded.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (
       select 1 from pg_depend d
       where d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'anon can execute no function this project creates — including any added later'
);

-- And the six RPCs plan §2.15f names are reachable by the app.
select ok(
  has_function_privilege('authenticated', 'report_period(date,date)', 'execute')
  and has_function_privilege('authenticated', 'report_trend(int)', 'execute')
  and has_function_privilege('authenticated',
        'record_purchase(uuid,uuid,date,numeric,numeric,text)', 'execute')
  and has_function_privilege('authenticated',
        'record_count_sweep(uuid,date,jsonb)', 'execute')
  and has_function_privilege('authenticated',
        'check_count_plausibility(uuid,date,numeric)', 'execute')
  and has_function_privilege('authenticated', 'expected_on_hand(uuid,date)', 'execute'),
  'the six RPCs the app calls are granted to authenticated'
);

-- ---------------------------------------------------------------------------
-- anon reads nothing, anywhere
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok($$ select count(*) from article_category $$, '42501',
  null, 'anon cannot read article_category');
select throws_ok($$ select count(*) from stock_count $$, '42501',
  null, 'anon cannot read stock_count');
select throws_ok($$ select count(*) from purchase $$, '42501',
  null, 'anon cannot read purchase');
select throws_ok($$ select count(*) from charge $$, '42501',
  null, 'anon cannot read charge');
select throws_ok($$ select count(*) from stock_loss $$, '42501',
  null, 'anon cannot read stock_loss');
select throws_ok($$ select count(*) from takings $$, '42501',
  null, 'anon cannot read takings');
select throws_ok($$ select count(*) from app_settings $$, '42501',
  null, 'anon cannot read app_settings');
select throws_ok($$ select count(*) from audit_log $$, '42501',
  null, 'anon cannot read the audit log');
select throws_ok($$ select count(*) from app_user $$, '42501',
  null, 'anon cannot read the allowlist');
select throws_ok(
  $$ insert into charge (charge_category_id, occurred_on, amount)
     values ('33333333-3333-3333-3333-333333333333','2026-01-02',1) $$,
  '42501', null, 'anon cannot write');

-- Added in Phase 2. The reporting layer is a second front door and needs the
-- same lock — the revoke at the end of 0012 is what supplies it. Note these
-- three would have passed anyway, for the wrong reason: without the revoke,
-- `anon` could enter the function and was stopped one step later by the table
-- grants, raising the same 42501. That is why the privilege itself is asserted
-- directly above rather than inferred from behaviour here.
select throws_ok($$ select report_period('2026-01-01','2026-01-31') $$, '42501',
  null, 'anon cannot run the report');
select throws_ok($$ select report_trend(12) $$, '42501',
  null, 'anon cannot run the trend');
select throws_ok($$ select count(*) from v_count_window $$, '42501',
  null, 'anon cannot read the window view either');

reset role;

-- ---------------------------------------------------------------------------
-- An authenticated user who is NOT on the allowlist reads nothing.
--
-- This is the stranger-who-registered case. They hold a valid JWT and the
-- `authenticated` role; only the allowlist stops them.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';

select is((select count(*)::int from article_category), 0,
  'non-allowlisted authenticated reads no categories');
select is((select count(*)::int from stock_count), 0,
  'non-allowlisted authenticated reads no counts');
select is((select count(*)::int from charge), 0,
  'non-allowlisted authenticated reads no charges');
select is((select count(*)::int from stock_loss), 0,
  'non-allowlisted authenticated reads no losses');
select is((select count(*)::int from takings), 0,
  'non-allowlisted authenticated reads no takings');
select is((select count(*)::int from app_settings), 0,
  'non-allowlisted authenticated reads no settings');
select is((select count(*)::int from app_user), 0,
  'non-allowlisted authenticated does not even see the allowlist');

select is(is_app_user(), false, 'is_app_user() is false for a stranger');

select throws_ok(
  $$ insert into charge (charge_category_id, occurred_on, amount)
     values ('33333333-3333-3333-3333-333333333333','2026-01-02',1) $$,
  '42501', null, 'non-allowlisted authenticated cannot write');

-- The stranger CAN execute report_period — and gets nothing out of it. This is
-- what `security invoker` on the RPC and `security_invoker = true` on every
-- reporting view buys: the report is assembled as the CALLER, so RLS reaches
-- all the way through it. A definer-owned view here would hand the store's
-- finances to anyone who registered, with the table policies still perfectly
-- correct and completely bypassed.
select is((select count(*)::int from v_count_window), 0,
  'non-allowlisted authenticated reads no count windows');

select is(
  (report_period('2026-01-01','2026-01-31') -> 'measured' ->> 'shrinkage_losses')::numeric,
  0.00::numeric,
  'and the report itself comes back empty rather than populated');

reset role;

-- ---------------------------------------------------------------------------
-- The owner — allowlisted — sees everything
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select is(is_app_user(), true, 'is_app_user() is true for the owner');

-- Assert the specific fixture row is visible rather than a total count: the
-- seed inserts 12 categories, and a count would silently track that number.
select isnt_empty(
  $$ select 1 from article_category
     where id = '22222222-2222-2222-2222-222222222222' $$,
  'the owner reads categories');
select is((select count(*)::int from stock_count), 1,
  'the owner reads counts');
select is((select count(*)::int from charge), 1,
  'the owner reads charges');

select is(
  (report_period('2026-01-01','2026-01-31') -> 'measured' ->> 'shrinkage_losses')::numeric,
  10.00::numeric,
  'and the same report that was empty for the stranger carries the owner''s figures');

select lives_ok(
  $$ insert into charge (charge_category_id, occurred_on, amount)
     values ('33333333-3333-3333-3333-333333333333','2026-01-02',1) $$,
  'the owner can write');

-- app_user is self-read only: the owner sees their own row and nothing more,
-- and cannot add anyone.
select is((select count(*)::int from app_user), 1,
  'the owner sees only their own allowlist row');

select throws_ok(
  $$ insert into app_user (user_id, label)
     values ('44444444-4444-4444-4444-444444444444', 'Intruder') $$,
  '42501', null,
  'allowlist membership is NOT self-service — no INSERT grant');

-- purchase has no INSERT grant: every creation must go through record_purchase,
-- which is where the "count required unless backdated" rule lives (plan §2.4).
select throws_ok(
  $$ insert into purchase (category_id, occurred_on, amount_at_cost)
     values ('22222222-2222-2222-2222-222222222222','2026-01-02',100) $$,
  '42501', null,
  'purchase cannot be inserted directly — the RPC is unbypassable');

reset role;

select * from finish();
rollback;
