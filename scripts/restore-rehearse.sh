#!/usr/bin/env bash
#
# Rehearsed restore (plan §4 Phase 7, §6 risks).
#
#   "A weekly encrypted pg_dump to a private repo — including one rehearsed
#    restore into a scratch database, which is the only thing that proves a
#    backup exists."
#
#   ./scripts/restore-rehearse.sh          # build, back up, restore, verify, clean up
#   KEEP=1 ./scripts/restore-rehearse.sh   # leave the scratch databases behind
#
# Self-contained on purpose. It does not dump the working database: it builds
# its own source database from the migrations plus the normative worked example
# of domain-spec §10, backs *that* up, restores it, and then asserts the restored
# copy answers with the same figures. Nothing it does can touch `aziz`.
#
# ---------------------------------------------------------------------------
# What "verified" means here, and why it is four checks rather than one
# ---------------------------------------------------------------------------
#
# A restore that produces a database is not a restore that produces the books.
# The four checks fail in genuinely different ways:
#
#   1. Row counts       — the data came back. Catches a truncated dump, which
#                         encrypts and commits exactly as cleanly as a good one.
#   2. The §10 gate     — the *computation* came back: 5,625 / 6,750 / 1,125 /
#                         100%, the figure the whole plan is sequenced around.
#                         Catches views and functions restored in a broken order.
#   3. anon privileges  — the *security* came back. A dump that dropped grants
#                         restores a database that looks perfect and is open to
#                         anyone on the internet. This is the check that cannot
#                         be done by eye.
#   4. The pgTAP suite  — all 275 assertions against the restored copy, not the
#                         original. Everything above, plus every rule the engine
#                         is supposed to enforce.
set -euo pipefail

CONTAINER=aziz_erp_pg
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DB=aziz_backup_src
DST_DB=aziz_restore_test
WORK="$(mktemp -d)"

: "${BACKUP_PASSPHRASE:=rehearsal-only-passphrase}"
export BACKUP_PASSPHRASE

cleanup() {
  rm -rf "$WORK"
  if [ -z "${KEEP:-}" ]; then
    admin postgres -q -c "drop database if exists $SRC_DB with (force);" >/dev/null 2>&1 || true
    admin postgres -q -c "drop database if exists $DST_DB with (force);" >/dev/null 2>&1 || true
  fi
}

admin() {
  local db="$1"
  shift
  docker exec -i "$CONTAINER" psql -U supabase_admin -d "$db" \
    -v ON_ERROR_STOP=1 --no-psqlrc "$@"
}

run() {
  local db="$1"
  shift
  docker exec -i "$CONTAINER" psql -U postgres -d "$db" \
    -v ON_ERROR_STOP=1 --no-psqlrc "$@"
}

fail() {
  echo "REHEARSAL FAILED: $*" >&2
  exit 1
}

# A fresh database inherits `public` from template1, where it is owned by
# pg_database_owner and `postgres` holds no CREATE. Migrations run as `postgres`
# — deliberately not a superuser, exactly as on a real Supabase project — so the
# grants have to be laid down first or migration 0001 fails on its first CREATE.
#
# It also inherits no `auth` schema. The supabase/postgres image provisions
# `auth` (and `auth.uid()`, which every RLS policy in this schema calls) into the
# POSTGRES_DB only, so a scratch database on the same cluster does not have it.
# The structure is CLONED from the working database rather than hand-written:
# a shim is a second implementation of `auth.uid()` that can quietly disagree
# with the real one, and Entry 1 declined to build exactly that shim for exactly
# that reason. Structure only — no user rows travel.
make_db() {
  local db="$1"
  admin postgres -q -c "drop database if exists $db with (force);"
  admin postgres -q -c "create database $db;"
  docker exec "$CONTAINER" \
    pg_dump -U supabase_admin -d aziz --schema=auth --schema-only \
    | admin "$db" -q -f - >/dev/null
  admin "$db" -q \
    -c "grant usage on schema public to postgres, anon, authenticated, service_role;" \
    -c "grant create on schema public to postgres;"
}

"$ROOT/scripts/db.sh" up >/dev/null
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Build the source database
# ---------------------------------------------------------------------------
echo "── building source database $SRC_DB"
make_db "$SRC_DB"
AZIZ_DB="$SRC_DB" "$ROOT/scripts/db.sh" migrate >/dev/null

# The worked example of domain-spec §10, inserted directly as `postgres` the way
# the pgTAP fixtures do. Using this ledger rather than an arbitrary one means the
# restored database is checked against the one set of figures this project has
# recomputed by hand and asserted in three separate places.
run "$SRC_DB" -q <<'SQL'
delete from article_category;
insert into article_category (id, name, description, sort_order)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'Beverages', 'eau, sodas', 10);
insert into markup_rate (category_id, markup_pct, effective_from)
values ('bbbbbbbb-0000-0000-0000-000000000001', 20, '2025-01-01');
insert into stock_count (category_id, occurred_on, value_at_cost, source) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '2026-01-01', 2000, 'standalone'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '2026-01-20', 1500, 'standalone'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '2026-02-05',  900, 'standalone');
insert into purchase (category_id, occurred_on, amount_at_cost) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '2026-01-08', 3000),
  ('bbbbbbbb-0000-0000-0000-000000000001', '2026-01-25', 2500);
insert into stock_loss (category_id, occurred_on, amount_at_cost, reason)
values ('bbbbbbbb-0000-0000-0000-000000000001', '2026-01-15', 200, 'spoiled');
SQL

# ---------------------------------------------------------------------------
# 2. Back it up — through the real script, not a shortcut
# ---------------------------------------------------------------------------
echo "── taking an encrypted backup"
dump="$(AZIZ_DB="$SRC_DB" BACKUP_OUT_DIR="$WORK" "$ROOT/scripts/backup.sh" | tail -1)"
[ -s "$dump" ] || fail "backup.sh produced nothing"

# Evidence that the file on disk is genuinely encrypted rather than a dump with
# a .gpg suffix. `file` reads the OpenPGP packet header; grep proves the SQL is
# not sitting there in the clear.
if grep -qa "CREATE TABLE" "$dump"; then
  fail "the backup contains cleartext SQL — it is not encrypted"
fi
echo "   $(basename "$dump") — $(wc -c <"$dump") bytes, no cleartext SQL"

# ---------------------------------------------------------------------------
# 3. Restore it into a scratch database
# ---------------------------------------------------------------------------
echo "── restoring into $DST_DB"
make_db "$DST_DB"
gpg --batch --quiet --decrypt --passphrase-fd 3 "$dump" 3<<<"$BACKUP_PASSPHRASE" \
  >"$WORK/restored.sql" || fail "decryption failed"

# ON_ERROR_STOP is deliberately NOT set for the restore itself. pg_dump emits
# `CREATE SCHEMA public` and a handful of ownership statements that a
# non-superuser `postgres` cannot execute on a Supabase-shaped cluster; those are
# expected and harmless. Whether the restore actually worked is decided by the
# four checks below, on the restored database — never by the exit code of the
# thing being tested.
docker exec -i "$CONTAINER" psql -U postgres -d "$DST_DB" --no-psqlrc -q \
  <"$WORK/restored.sql" >"$WORK/restore.log" 2>&1 || true

# ---------------------------------------------------------------------------
# 4. Check 1 — the data came back
# ---------------------------------------------------------------------------
counts_sql="select string_agg(t || '=' || n, ' ' order by t) from (
  select 'app_settings' t, count(*) n from app_settings
  union all select 'article_category', count(*) from article_category
  union all select 'markup_rate', count(*) from markup_rate
  union all select 'charge_category', count(*) from charge_category
  union all select 'stock_count', count(*) from stock_count
  union all select 'purchase', count(*) from purchase
  union all select 'stock_loss', count(*) from stock_loss
  union all select 'charge', count(*) from charge
  union all select 'takings', count(*) from takings
  union all select 'audit_log', count(*) from audit_log
  union all select 'app_user', count(*) from app_user
  union all select 'write_request', count(*) from write_request) s;"

src_counts="$(run "$SRC_DB" -tAc "$counts_sql")"
dst_counts="$(run "$DST_DB" -tAc "$counts_sql" 2>/dev/null)" || fail "the restored database has no tables — see $WORK/restore.log"
[ "$src_counts" = "$dst_counts" ] || fail "row counts differ
  source:   $src_counts
  restored: $dst_counts"
echo "✓ row counts identical across all 12 tables"
echo "  $src_counts"

# ---------------------------------------------------------------------------
# 5. Check 2 — the computation came back (the §10 gate)
# ---------------------------------------------------------------------------
gate_sql="select report_period('2026-01-01','2026-01-31')::text;"
src_report="$(run "$SRC_DB" -tAc "$gate_sql")"
dst_report="$(run "$DST_DB" -tAc "$gate_sql")" || fail "report_period does not run on the restored database"
[ "$src_report" = "$dst_report" ] || fail "report_period differs between source and restored"

read -r g_goods g_rev g_gross g_cov <<<"$(run "$DST_DB" -tAc "
  select (report_period('2026-01-01','2026-01-31')->'modelled'->>'goods_sold_at_cost')
      || ' ' || (report_period('2026-01-01','2026-01-31')->'modelled'->>'revenue_est')
      || ' ' || (report_period('2026-01-01','2026-01-31')->'modelled'->>'gross_profit_est')
      || ' ' || (report_period('2026-01-01','2026-01-31')->'coverage'->>'pct');")"

[ "$g_goods" = "5625.00" ] || fail "restored goods_sold_at_cost = $g_goods, expected 5625.00"
[ "$g_rev" = "6750.00" ] || fail "restored revenue_est = $g_rev, expected 6750.00"
[ "$g_gross" = "1125.00" ] || fail "restored gross_profit_est = $g_gross, expected 1125.00"
[ "$g_cov" = "100.0" ] || fail "restored coverage = $g_cov, expected 100.0"
echo "✓ report_period byte-identical, and the §10 gate holds on the restored copy"
echo "  $g_goods / $g_rev / $g_gross / $g_cov%"

# ---------------------------------------------------------------------------
# 6. Check 3 — the security came back
# ---------------------------------------------------------------------------
# The one thing that fails silently and catastrophically. `anon` is the role a
# stranger on the internet holds; if a restore dropped the revoke sweep it would
# regain EXECUTE on every function, including the two SECURITY DEFINER write
# RPCs where RLS does not apply at all.
anon_exec="$(run "$DST_DB" -tAc "
  select count(*) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'execute');")"
[ "$anon_exec" = "0" ] || fail "anon holds EXECUTE on $anon_exec function(s) in the restored database"

rls_off="$(run "$DST_DB" -tAc "
  select count(*) from pg_tables
  where schemaname = 'public' and not rowsecurity;")"
[ "$rls_off" = "0" ] || fail "$rls_off restored table(s) came back with row-level security disabled"
echo "✓ anon holds EXECUTE on 0 functions; row-level security on all 12 tables"

# ---------------------------------------------------------------------------
# 7. Check 4 — every rule the engine enforces, against the restored copy
# ---------------------------------------------------------------------------
# ⚠ The transaction rows are cleared first, and that is a property of the suite
# rather than of the restore. The fixtures build their own ledger and assert
# ABSOLUTE figures against it — `020_rls.sql` wants to read exactly 1 count and a
# report of exactly 10.00 — so any pre-existing trading data is added to theirs
# and the assertions fail on arithmetic that is perfectly correct. With the §10
# ledger left in place, 11 of the 13 files fail: two on the absolute figures
# above, nine on `delete from article_category` hitting the purchase foreign key.
#
# The consequence reaches past this script and is recorded in current_state.md:
# **the pgTAP suite can only be run against a database that has not yet traded.**
# It passed against aziz-dev in Entry 4 because that project was empty. Once the
# shop has entered a single purchase, `SUPABASE_DB_URL=… ./scripts/db.sh test`
# will report red against a project that is entirely healthy. Nothing is
# destroyed when that happens — every fixture wraps itself in begin/rollback —
# but a suite that goes red for a reason unrelated to correctness is a suite
# people stop reading.
#
# Clearing here is honest because checks 1–3 above have already proved the data,
# the computation and the privileges on the pristine restored copy. What check 4
# adds is the schema, the logic and the security rules — none of which the
# transaction rows contribute to.
echo "── clearing transaction rows (the fixtures assert absolute figures)"
# Purchases before counts, and that order is not cosmetic: `prior_count_id` is
# ON DELETE RESTRICT, so deleting an embedded count first fails outright.
# Deleting the purchase takes its count with it (the cascade trigger of 0004).
run "$DST_DB" -q -c "
  delete from write_request;
  delete from stock_loss;
  delete from charge;
  delete from takings;
  delete from purchase;
  delete from stock_count;"

echo "── running the pgTAP suite against $DST_DB"
AZIZ_DB="$DST_DB" "$ROOT/scripts/db.sh" test

echo
echo "RESTORE REHEARSAL PASSED — the backup is a backup."
