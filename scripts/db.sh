#!/usr/bin/env bash
#
# Local development database driver for Phases 0-2 (plan §3, decision D-D).
#
# Talks to the project-local container `aziz_erp_pg` on port 5434. Everything
# runs through `docker exec`, so no psql client is needed on the box.
#
# From Phase 3 onward the authority is the Supabase dev project, not this
# container (plan §3, documented deviation from cross_projects_policy §7).
#
#   ./scripts/db.sh up      start the container if it is not running
#   ./scripts/db.sh reset   drop and recreate the schema, replay all migrations + seed
#   ./scripts/db.sh migrate replay migrations + seed onto the current database
#   ./scripts/db.sh psql    interactive shell (or: db.sh psql -c "select 1")
#   ./scripts/db.sh test    run the pgTAP suite
#
# Remote mode: set SUPABASE_DB_URL and every command above talks to that
# database instead of the container, through a throwaway psql container on the
# host network (no psql client on the box, and the Supabase host is IPv6-only):
#
#   SUPABASE_DB_URL=postgresql://... ./scripts/db.sh test
#
# From Phase 3 the Supabase dev project is the authority, so the suite must be
# runnable against it and not only against the local container. `reset` is
# refused in remote mode — every fixture rolls back, but a schema drop does not.
#
set -euo pipefail

CONTAINER=aziz_erp_pg
IMAGE=supabase/postgres:17.6.1.158
VOLUME=aziz_erp_pg_data
PORT=5434
# Overridable so the pgTAP suite can be pointed at a database other than the
# working one — specifically the scratch database a restore rehearsal builds
# (`scripts/restore-rehearse.sh`). A backup that has only ever been *taken* is
# not a backup; running the whole suite against the restored copy is what turns
# the dump into evidence.
DB="${AZIZ_DB:-aziz}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# psql that fails loudly: any error aborts.
#
# Migrations run as `postgres`, which in this image is NOT a superuser and does
# NOT own the public schema — exactly as on a real Supabase project. Keeping
# that constraint locally is the point: a migration that needs superuser here
# would fail on deploy.
psql_run() {
  if [ -n "${SUPABASE_DB_URL:-}" ]; then
    docker run --rm -i --network host --memory=128m "$IMAGE" \
      psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --no-psqlrc "$@"
  else
    docker exec -i "$CONTAINER" psql -U postgres -d "$DB" \
      -v ON_ERROR_STOP=1 --no-psqlrc "$@"
  fi
}

# Only the destructive reset needs more than `postgres` has: `public` is owned by
# pg_database_owner. Never used for migrations.
psql_admin() {
  docker exec -i "$CONTAINER" psql -U supabase_admin -d "$DB" \
    -v ON_ERROR_STOP=1 --no-psqlrc "$@"
}

# A schema drop is not something a rolled-back fixture can undo. Remote mode is
# for replaying migrations and running the suite, never for destroying a schema
# that a Supabase project's auth users and API depend on.
refuse_remote() {
  if [ -n "${SUPABASE_DB_URL:-}" ]; then
    echo "$1 is refused in remote mode (SUPABASE_DB_URL is set)" >&2
    exit 1
  fi
}

cmd_up() {
  if [ -n "${SUPABASE_DB_URL:-}" ]; then
    echo "remote mode — no container to start"
    return
  fi
  if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "container $CONTAINER already running on :$PORT"
    return
  fi
  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "starting existing container $CONTAINER"
    docker start "$CONTAINER" >/dev/null
  else
    echo "creating container $CONTAINER on :$PORT"
    docker run -d --name "$CONTAINER" \
      -e POSTGRES_PASSWORD=aziz_dev -e POSTGRES_DB="$DB" \
      -p "$PORT":5432 -v "$VOLUME":/var/lib/postgresql/data \
      --restart unless-stopped --memory=512m "$IMAGE" >/dev/null
  fi
  echo -n "waiting for postgres"
  for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U postgres -d "$DB" >/dev/null 2>&1; then
      echo " — ready"
      return
    fi
    echo -n "."
    sleep 1
  done
  echo " — TIMED OUT" >&2
  exit 1
}

# Replay every migration in order, then the seed.
cmd_migrate() {
  shopt -s nullglob
  local files=("$ROOT"/supabase/migrations/*.sql)
  if [ ${#files[@]} -eq 0 ]; then
    echo "no migrations found in supabase/migrations/" >&2
    exit 1
  fi
  for f in "${files[@]}"; do
    echo "  → $(basename "$f")"
    psql_run -q -f - <"$f"
  done
  if [ -f "$ROOT/supabase/seed.sql" ]; then
    echo "  → seed.sql"
    psql_run -q -f - <"$ROOT/supabase/seed.sql"
  fi
  echo "migrations applied"
}

# A reset must prove the migrations apply from genuinely empty (plan §4.1 exit
# criterion), so the schema is dropped rather than patched.
cmd_reset() {
  echo "resetting database $DB"
  psql_admin -q \
    -c "drop schema if exists public cascade;" \
    -c "create schema public authorization pg_database_owner;" \
    -c "grant usage on schema public to postgres, anon, authenticated, service_role;" \
    -c "grant create on schema public to postgres;" \
    -c "delete from auth.users;"
  cmd_migrate
}

cmd_psql() {
  if [ $# -eq 0 ] && [ -n "${SUPABASE_DB_URL:-}" ]; then
    docker run --rm -it --network host --memory=128m "$IMAGE" psql "$SUPABASE_DB_URL"
  elif [ $# -eq 0 ]; then
    docker exec -it "$CONTAINER" psql -U postgres -d "$DB"
  else
    psql_run "$@"
  fi
}

# Runs each pgTAP file and reports TAP output. A file is a failure if psql exits
# non-zero or if any line begins with "not ok".
cmd_test() {
  shopt -s nullglob
  local files=("$ROOT"/supabase/tests/*.sql)
  if [ ${#files[@]} -eq 0 ]; then
    echo "no pgTAP files found in supabase/tests/" >&2
    exit 1
  fi
  local failed=0 total_failed=0
  for f in "${files[@]}"; do
    local name out rc
    name="$(basename "$f")"
    set +e
    out="$(psql_run -q -t -A -f - <"$f" 2>&1)"
    rc=$?
    set -e
    local nfail ndiag
    nfail="$(printf '%s\n' "$out" | grep -c '^not ok' || true)"
    # pgTAP reports a plan mismatch as a "# Looks like you planned N but ran M"
    # DIAGNOSTIC, not as a failing assertion. Without this check a file that
    # silently ran fewer tests than it declared would pass — a gate whose exit
    # code you do not read is not a gate.
    ndiag="$(printf '%s\n' "$out" | grep -c '^# Looks like' || true)"
    if [ "$rc" -ne 0 ] || [ "$nfail" -gt 0 ] || [ "$ndiag" -gt 0 ]; then
      failed=$((failed + 1))
      total_failed=$((total_failed + nfail))
      echo "FAIL  $name"
      printf '%s\n' "$out" | sed 's/^/      /'
    else
      local nok
      nok="$(printf '%s\n' "$out" | grep -c '^ok' || true)"
      echo "ok    $name  ($nok assertions)"
    fi
  done
  echo
  if [ "$failed" -gt 0 ]; then
    echo "pgTAP: $failed file(s) failed, $total_failed failing assertion(s)" >&2
    exit 1
  fi
  echo "pgTAP: all files passed"
}

case "${1:-}" in
up) cmd_up ;;
reset)
  refuse_remote reset
  cmd_up
  cmd_reset
  ;;
migrate)
  cmd_up
  cmd_migrate
  ;;
psql)
  shift
  cmd_psql "$@"
  ;;
test) cmd_test ;;
*)
  echo "usage: $0 {up|reset|migrate|psql|test}" >&2
  exit 1
  ;;
esac
