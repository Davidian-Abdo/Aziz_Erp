-- 0003_transactions.sql — the transaction tables.
--
-- domain-spec §3, §4, §5, §9.3; architecture-spec §2.3.
--
-- NOTE on every `occurred_on` here: there is deliberately NO
-- `check (occurred_on <= current_date)`. Two reasons, both serious:
--
--   1. It is a non-immutable expression in a CHECK. Postgres accepts it at DDL
--      time but re-validates on restore, so a pg_dump taken today can fail to
--      load tomorrow — the worst possible failure mode for the one artefact
--      protecting the store's entire financial history.
--   2. `current_date` is UTC while the shop is UTC+1.
--
-- The guard is a trigger against store_today() instead — see 0004_guards.sql.

create type count_source as enum ('standalone', 'purchase');

-- A stock count is a declaration: "on date D, category C held V at buying
-- price." It is the ONLY measurement of stock in the system.
create table stock_count (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references article_category(id),
  occurred_on   date not null,
  value_at_cost numeric(14,2) not null check (value_at_cost >= 0),  -- 0 = empty
  source        count_source not null,
  note          text,
  created_at    timestamptz not null default now()
);

-- At most one standalone count per category per date (plan §2.15e). Purchase
-- counts are excluded: two deliveries in one day legitimately produce two.
create unique index stock_count_one_standalone_per_day
  on stock_count (category_id, occurred_on)
  where source = 'standalone';

create table purchase (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references article_category(id),
  occurred_on    date not null,
  amount_at_cost numeric(14,2) not null check (amount_at_cost > 0),

  -- The "what was left before this delivery?" count.
  --
  -- NULLABLE. Required when the purchase is the category's newest event;
  -- omitted when the purchase is dated STRICTLY BEFORE the category's last
  -- count, in which case it is simply inflow inside an existing window
  -- (domain-spec §3.2A). That is a cross-row condition, so it lives in
  -- record_purchase(), not in a table constraint — and `authenticated` gets no
  -- INSERT grant here, so the RPC cannot be bypassed (0006_security.sql).
  prior_count_id uuid unique references stock_count(id) on delete restrict,

  note           text,
  created_at     timestamptz not null default now()
);

create type loss_reason as enum (
  'spoiled', 'broken', 'stolen', 'given_away',
  'family_taken', 'personal_use', 'other'
);

create type loss_nature_t as enum ('shrinkage', 'owner_draw');

-- Pure function rather than a stored column, so reclassifying a reason is a
-- one-line change that also corrects every historical report.
create function loss_nature(r loss_reason) returns loss_nature_t
language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when r in ('family_taken', 'personal_use') then 'owner_draw'::loss_nature_t
    else 'shrinkage'::loss_nature_t
  end
$$;

comment on function loss_nature(loss_reason) is
  '"The store lost 740" and "I took 300 home" are different facts and must never '
  'be summed into one number. See domain-spec §4.2.';

create table stock_loss (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references article_category(id),
  occurred_on    date not null,
  amount_at_cost numeric(14,2) not null check (amount_at_cost > 0),
  reason         loss_reason not null default 'other',
  note           text,
  created_at     timestamptz not null default now()
);

-- Money spent that is NOT the purchase of resale stock.
create table charge (
  id                 uuid primary key default gen_random_uuid(),
  charge_category_id uuid not null references charge_category(id),
  occurred_on        date not null,
  amount             numeric(14,2) not null check (amount > 0),
  note               text,
  created_at         timestamptz not null default now()
);

-- Reserved. No UI in v1.0 (domain-spec §9.3).
--
-- If the owner ever starts counting the till, this turns the dashboard from
-- modelled to measured and yields `variance = declared_takings - revenue_est` —
-- the single most valuable figure a store like this can produce. It costs one
-- empty table today versus a painful migration later.
create table takings (
  id          uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  amount      numeric(14,2) not null check (amount >= 0),
  note        text,
  created_at  timestamptz not null default now()
);

create index stock_count_cat_date on stock_count (category_id, occurred_on);
create index purchase_cat_date    on purchase (category_id, occurred_on);
create index stock_loss_cat_date  on stock_loss (category_id, occurred_on);
create index charge_date          on charge (occurred_on);
create index takings_date         on takings (occurred_on);
