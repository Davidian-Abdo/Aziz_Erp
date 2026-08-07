-- 0001_settings.sql — the settings singleton and the store's own clock.
--
-- domain-spec §9.1, plan §2.6.

create extension if not exists pgcrypto;

create table app_settings (
  id            int primary key default 1 check (id = 1),   -- singleton
  currency_code text not null default 'MAD',
  locale        text not null default 'fr',
  store_name    text not null default 'Aziz',

  -- The shop is UTC+1. `current_date` is UTC, so between 23:00 and midnight
  -- local the server's "today" is a day the shopkeeper considers the future —
  -- and the evening's own entries get rejected. Every date guard and every
  -- period clamp goes through store_today() instead.
  timezone      text not null default 'Africa/Casablanca',

  -- Null until the opening sweep completes (domain-spec §3.5). The dashboard is
  -- unreachable while it is null.
  onboarded_at  timestamptz,

  updated_at    timestamptz not null default now()
);

comment on table app_settings is
  'Single-row application settings. id is pinned to 1 by a check constraint.';

-- The store's business date. Deliberately not `current_date`.
--
-- STABLE, not IMMUTABLE: it reads a table and the clock. That is precisely why
-- it can never appear in a CHECK constraint — see 0004_guards.sql.
create function store_today() returns date
language sql stable
set search_path = public, pg_temp
as $$
  select (now() at time zone (select timezone from app_settings where id = 1))::date
$$;

comment on function store_today() is
  'Today in the store''s timezone. Every future-date guard and period clamp uses this, never current_date.';
