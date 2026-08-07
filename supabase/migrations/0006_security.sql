-- 0006_security.sql — RLS, the allowlist, and every grant.
--
-- architecture-spec §4.2; plan §2.5, §2.12, §2.15f.
--
-- THE DEFECT THIS FIXES. An earlier draft used
-- `create policy ... to authenticated using (true)`. Combined with Supabase's
-- default-open email signup, any stranger who registered would become
-- `authenticated` and gain full read/write on the store's finances. Two
-- independent defences are required, and this file is only the second of them:
--
--   1. Public signup disabled in the project's Auth settings  (owner action)
--   2. Policies that check an ALLOWLIST, not merely authentication  (below)

-- ---------------------------------------------------------------------------
-- The allowlist
-- ---------------------------------------------------------------------------

create table app_user (
  user_id uuid primary key,           -- auth.users.id
  label   text not null,
  active  boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table app_user is
  'Allowlist. A login is not access: a row here is. Membership is NOT '
  'self-service — the first row is inserted once as service_role from the '
  'Supabase SQL editor after the owner''s user exists. See plan §7 item 2b.';

-- SECURITY DEFINER so it can read app_user through that table's own RLS.
create function is_app_user() returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from app_user where user_id = auth.uid() and active
  )
$$;

-- ---------------------------------------------------------------------------
-- Idempotency cache for the write RPCs (plan §2.12)
--
-- On a flaky phone connection a retried record_purchase would post the purchase
-- twice — and a duplicated purchase inflates outflow, which this model reports
-- as PROFIT. Written only by the security-definer RPCs; no role holds a grant.
-- At ~1,500 writes a year it is never pruned.
-- ---------------------------------------------------------------------------

create table write_request (
  request_id uuid primary key,
  rpc        text not null,
  result     jsonb not null,
  at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS on every table
-- ---------------------------------------------------------------------------

alter table app_settings     enable row level security;
alter table article_category enable row level security;
alter table markup_rate      enable row level security;
alter table charge_category  enable row level security;
alter table stock_count      enable row level security;
alter table purchase         enable row level security;
alter table stock_loss       enable row level security;
alter table charge           enable row level security;
alter table takings          enable row level security;
alter table audit_log        enable row level security;
alter table app_user         enable row level security;
alter table write_request    enable row level security;

-- Business tables: full access to allowlisted users only.
create policy app_user_all on app_settings     for all to authenticated using (is_app_user()) with check (is_app_user());
create policy app_user_all on article_category for all to authenticated using (is_app_user()) with check (is_app_user());
create policy app_user_all on markup_rate      for all to authenticated using (is_app_user()) with check (is_app_user());
create policy app_user_all on charge_category  for all to authenticated using (is_app_user()) with check (is_app_user());
create policy app_user_all on stock_count      for all to authenticated using (is_app_user()) with check (is_app_user());
create policy app_user_all on purchase         for all to authenticated using (is_app_user()) with check (is_app_user());
create policy app_user_all on stock_loss       for all to authenticated using (is_app_user()) with check (is_app_user());
create policy app_user_all on charge           for all to authenticated using (is_app_user()) with check (is_app_user());
create policy app_user_all on takings          for all to authenticated using (is_app_user()) with check (is_app_user());

-- Audit log is readable but never writable from a client.
create policy app_user_read on audit_log for select to authenticated using (is_app_user());

-- app_user: SELF-READ ONLY, and no write policy at all. Membership is granted
-- out of band, never from inside the app.
create policy self_read on app_user for select to authenticated using (user_id = auth.uid());

-- write_request: no policy. Only the security-definer RPCs touch it, and they
-- bypass RLS by definition. An RLS-enabled table with no policy denies all.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Start from nothing. `anon` never receives a grant anywhere.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- NOTE: no `grant usage on schema public to authenticated` here. The migration
-- role does not own the public schema (it belongs to pg_database_owner, both in
-- this image and on a real Supabase project), so the grant would be a no-op that
-- emits a warning. Supabase grants that usage itself.

grant select, insert, update, delete on
  app_settings, article_category, markup_rate, charge_category,
  stock_count, stock_loss, charge, takings
to authenticated;

-- PURCHASE IS DIFFERENT: no INSERT.
--
-- The "count required unless backdated" rule is a cross-row condition that a
-- constraint cannot express, so it lives in record_purchase(). Granting INSERT
-- here would make that rule bypassable with a single PostgREST call, and a
-- purchase without its count silently unsettles the whole timeline.
grant select, update, delete on purchase to authenticated;

grant select on audit_log to authenticated;
grant select on app_user to authenticated;

-- ---------------------------------------------------------------------------
-- Function grants
--
-- Order matters: revoke the implicit PUBLIC execute grant first, then hand back
-- exactly what `authenticated` needs.
--
-- `is_app_user()` MUST be granted. An RLS policy expression is evaluated as the
-- CALLING user, so without EXECUTE here every policy fails with "permission
-- denied for function is_app_user" and the whole app is locked out — including
-- the owner. Granting it is safe: it is SECURITY DEFINER and reveals only
-- whether the caller is themselves allowlisted.
--
-- `store_today()` is called by the future-date triggers, which are plain
-- (non-definer) functions running as the caller.
--
-- The reporting RPCs of 0007-0011 grant themselves as they are created.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from anon, public;

grant execute on function is_app_user()             to authenticated;
grant execute on function store_today()             to authenticated;
grant execute on function loss_nature(loss_reason)  to authenticated;
