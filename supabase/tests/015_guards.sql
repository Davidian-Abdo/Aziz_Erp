-- 015_guards.sql — the guards actually fire.
--
-- 010_schema.sql proves the triggers EXIST. That is not the same as proving
-- they work, and a trigger that exists but never fires is the most reassuring
-- kind of bug.

begin;
create extension if not exists pgtap;
select plan(16);

insert into article_category (id, name, description)
values ('22222222-2222-2222-2222-222222222222', 'Guard cat', 'x');
insert into article_category (id, name, description)
values ('55555555-5555-5555-5555-555555555555', 'Other cat', 'y');
insert into charge_category (id, name, nature)
values ('33333333-3333-3333-3333-333333333333', 'Guard charge', 'operating');

-- ---------------------------------------------------------------------------
-- No future dates — on every table (plan §2.6)
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$ insert into stock_count (category_id, occurred_on, value_at_cost, source)
            values ('22222222-2222-2222-2222-222222222222', %L, 100, 'standalone') $$,
         store_today() + 1),
  '23514', null, 'a future stock_count is rejected');

select throws_ok(
  format($$ insert into stock_loss (category_id, occurred_on, amount_at_cost, reason)
            values ('22222222-2222-2222-2222-222222222222', %L, 10, 'spoiled') $$,
         store_today() + 1),
  '23514', null, 'a future stock_loss is rejected');

select throws_ok(
  format($$ insert into charge (charge_category_id, occurred_on, amount)
            values ('33333333-3333-3333-3333-333333333333', %L, 10) $$,
         store_today() + 1),
  '23514', null, 'a future charge is rejected');

select throws_ok(
  format($$ insert into takings (occurred_on, amount) values (%L, 10) $$,
         store_today() + 1),
  '23514', null, 'a future taking is rejected — the spec omitted this guard');

-- Today itself is fine, and so is any past date: backdating is unlimited.
select lives_ok(
  format($$ insert into stock_count (category_id, occurred_on, value_at_cost, source)
            values ('22222222-2222-2222-2222-222222222222', %L, 100, 'standalone') $$,
         store_today()),
  'today is allowed');

select lives_ok(
  $$ insert into stock_count (category_id, occurred_on, value_at_cost, source)
     values ('22222222-2222-2222-2222-222222222222', '2001-01-01', 100, 'standalone') $$,
  'backdating is unlimited');

-- store_today() follows the store's timezone, not UTC.
select is(
  store_today(),
  (now() at time zone 'Africa/Casablanca')::date,
  'store_today() is the date in the shop, not UTC');

-- ---------------------------------------------------------------------------
-- One standalone count per category per day (plan §2.15e)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into stock_count (category_id, occurred_on, value_at_cost, source)
     values ('22222222-2222-2222-2222-222222222222', '2001-01-01', 200, 'standalone') $$,
  '23505', null, 'a second standalone count on one day is rejected');

-- but two purchase-embedded counts on one day are legitimate: two deliveries.
select lives_ok(
  $$ insert into stock_count (id, category_id, occurred_on, value_at_cost, source)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '22222222-2222-2222-2222-222222222222', '2001-01-01', 50, 'purchase') $$,
  'two deliveries in one day may each carry their own count');

select lives_ok(
  $$ insert into stock_count (id, category_id, occurred_on, value_at_cost, source)
     values ('aaaaaaaa-0000-0000-0000-000000000002',
             '22222222-2222-2222-2222-222222222222', '2001-01-01', 60, 'purchase') $$,
  'and a second one is still allowed');

-- ---------------------------------------------------------------------------
-- A purchase and its embedded count must agree (plan §2.8)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into purchase (category_id, occurred_on, amount_at_cost, prior_count_id)
     values ('55555555-5555-5555-5555-555555555555', '2001-01-01', 100,
             'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null,
  'a purchase whose count belongs to another category is rejected');

select throws_ok(
  $$ insert into purchase (category_id, occurred_on, amount_at_cost, prior_count_id)
     values ('22222222-2222-2222-2222-222222222222', '2001-01-02', 100,
             'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null,
  'a purchase whose count carries another date is rejected');

-- A standalone count may not be used as a purchase's embedded count: the two
-- sort differently (domain-spec §3.4), so accepting it would corrupt ordering.
select throws_ok(
  $$ insert into purchase (category_id, occurred_on, amount_at_cost, prior_count_id)
     values ('22222222-2222-2222-2222-222222222222', '2001-01-01', 100,
             (select id from stock_count
              where source = 'standalone' and occurred_on = '2001-01-01')) $$,
  '23514', null,
  'a standalone count cannot be a purchase''s embedded count');

select lives_ok(
  $$ insert into purchase (id, category_id, occurred_on, amount_at_cost, prior_count_id)
     values ('bbbbbbbb-0000-0000-0000-000000000001',
             '22222222-2222-2222-2222-222222222222', '2001-01-01', 100,
             'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'a coherent purchase/count pair is accepted');

-- A backdated purchase carries no count at all (plan §2.4).
select lives_ok(
  $$ insert into purchase (category_id, occurred_on, amount_at_cost, prior_count_id)
     values ('22222222-2222-2222-2222-222222222222', '2001-01-01', 100, null) $$,
  'a purchase with no count is accepted at table level');

-- ---------------------------------------------------------------------------
-- Deleting a purchase removes its embedded count
-- ---------------------------------------------------------------------------

delete from purchase where id = 'bbbbbbbb-0000-0000-0000-000000000001';

select is_empty(
  $$ select 1 from stock_count where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'deleting a purchase removes its embedded count');

select * from finish();
rollback;
