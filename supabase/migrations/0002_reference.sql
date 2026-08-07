-- 0002_reference.sql — reference data: article categories, markup rates,
-- charge categories.
--
-- domain-spec §2, §5.2; architecture-spec §2.2.

create table article_category (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,

  -- Contents hint, e.g. 'lait, fromage, yaourt, beurre'. Shown in the count
  -- question so the user knows the whole shelf is being asked about, not just
  -- the crate in their hands. This is the only defence against the
  -- category-scope trap (domain-spec §1.4 item 5), and how well it matches the
  -- real shelves decides how often that trap springs.
  description text not null default '',

  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

comment on column article_category.description is
  'Contents hint shown in the stock-count question. See domain-spec §3.2A.';

-- Markup is a TIME SERIES, never a mutable column.
--
-- Without this, editing a percentage today would retroactively rewrite every
-- past report: a March profit figure would change because a June price changed.
-- An edit inserts a new row; it never updates an old one.
create table markup_rate (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references article_category(id) on delete cascade,
  markup_pct     numeric(6,2) not null check (markup_pct >= 0),
  effective_from date not null,
  created_at     timestamptz not null default now(),
  unique (category_id, effective_from)
);

comment on table markup_rate is
  'Versioned markup on cost. 20 means sells for 1.20x cost. Never updated in place.';

-- Charges and losses share the operating/owner_draw distinction but are
-- different domains, so they get separate enums (plan §1.2 Q7).
create type charge_nature as enum ('operating', 'owner_draw');

create table charge_category (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  nature     charge_nature not null default 'operating',
  is_system  boolean not null default false,   -- seeded; cannot be deleted
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on column charge_category.nature is
  'operating = a cost of running the store, subtracted to reach operating profit. '
  'owner_draw = the owner taking money out, NOT a business cost. Editable on any '
  'category including seeded ones.';

create index markup_rate_lookup
  on markup_rate (category_id, effective_from desc);

create index article_category_active
  on article_category (active, sort_order);
