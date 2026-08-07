-- 010_schema.sql — the schema is what the specs say it is.
--
-- plan §5.2. Enums, constraints, triggers and the absence of the things that
-- were deliberately removed.

begin;
create extension if not exists pgtap;
select plan(46);

-- ---------------------------------------------------------------------------
-- Tables exist
-- ---------------------------------------------------------------------------

select has_table('app_settings');
select has_table('article_category');
select has_table('markup_rate');
select has_table('charge_category');
select has_table('stock_count');
select has_table('purchase');
select has_table('stock_loss');
select has_table('charge');
select has_table('takings');
select has_table('audit_log');
select has_table('app_user');
select has_table('write_request');

-- ---------------------------------------------------------------------------
-- Enums carry exactly the specified values
-- ---------------------------------------------------------------------------

select has_type('charge_nature');
select has_type('count_source');
select has_type('loss_reason');
select has_type('loss_nature_t');

select enum_has_labels('charge_nature', array['operating', 'owner_draw']);
select enum_has_labels('count_source', array['standalone', 'purchase']);
select enum_has_labels('loss_nature_t', array['shrinkage', 'owner_draw']);
select enum_has_labels('loss_reason', array[
  'spoiled', 'broken', 'stolen', 'given_away',
  'family_taken', 'personal_use', 'other'
]);

-- ---------------------------------------------------------------------------
-- Money is numeric(14,2), never a float
-- ---------------------------------------------------------------------------

select col_type_is('stock_count', 'value_at_cost', 'numeric(14,2)');
select col_type_is('purchase', 'amount_at_cost', 'numeric(14,2)');
select col_type_is('stock_loss', 'amount_at_cost', 'numeric(14,2)');
select col_type_is('charge', 'amount', 'numeric(14,2)');

-- Business date vs audit time are never conflated (domain-spec §9.1).
select col_type_is('purchase', 'occurred_on', 'date');
select col_type_is('purchase', 'created_at', 'timestamp with time zone');

-- ---------------------------------------------------------------------------
-- prior_count_id is NULLABLE (plan §2.4) but still unique
-- ---------------------------------------------------------------------------

select col_is_null('purchase', 'prior_count_id',
  'prior_count_id is nullable: a backdated purchase carries no count');
select col_not_null('purchase', 'category_id');
select col_not_null('purchase', 'amount_at_cost');

select isnt_empty($$
  select 1 from pg_indexes
  where tablename = 'purchase' and indexdef ilike '%unique%prior_count_id%'
$$, 'prior_count_id is unique — one count belongs to at most one purchase');

-- ---------------------------------------------------------------------------
-- NO `current_date` CHECK anywhere.
--
-- This is the constraint that would make a pg_dump taken today fail to load
-- tomorrow. Its absence is a requirement, not an accident (plan §2.6).
-- ---------------------------------------------------------------------------

select is_empty($$
  select conname from pg_constraint
  where contype = 'c'
    and pg_get_constraintdef(oid) ilike '%current_date%'
$$, 'no CHECK constraint references current_date — it would break restores');

-- ---------------------------------------------------------------------------
-- The guards that replaced it
-- ---------------------------------------------------------------------------

select has_function('store_today');
select function_returns('store_today', 'date');

select has_trigger('stock_count', 'stock_count_not_future');
select has_trigger('purchase', 'purchase_not_future');
select has_trigger('stock_loss', 'stock_loss_not_future');
select has_trigger('charge', 'charge_not_future');
select has_trigger('takings', 'takings_not_future');
select has_trigger('purchase', 'purchase_count_coherent');
select has_trigger('purchase', 'purchase_delete_embedded_count');

-- ---------------------------------------------------------------------------
-- Audit triggers on all five audited tables (domain-spec §9.2)
-- ---------------------------------------------------------------------------

select has_trigger('purchase', 'audit_purchase');
select has_trigger('stock_count', 'audit_stock_count');
select has_trigger('stock_loss', 'audit_stock_loss');
select has_trigger('charge', 'audit_charge');
select has_trigger('markup_rate', 'audit_markup_rate');

-- ---------------------------------------------------------------------------
-- Partial unique on standalone counts (plan §2.15e)
-- ---------------------------------------------------------------------------

select isnt_empty($$
  select 1 from pg_indexes
  where tablename = 'stock_count'
    and indexname = 'stock_count_one_standalone_per_day'
$$, 'one standalone count per category per day');

select * from finish();
rollback;
