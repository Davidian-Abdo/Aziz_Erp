#!/usr/bin/env bash
#
# Encrypted backup of the store's books (plan §4, Phase 7).
#
# Dumps the `public` schema — schema *and* data — and encrypts it with a
# symmetric passphrase. The output is a single `.sql.gpg` file that
# `scripts/restore-rehearse.sh` can turn back into a working database.
#
#   ./scripts/backup.sh                      # local container → backups/
#   SUPABASE_DB_URL=… ./scripts/backup.sh    # a Supabase project → backups/
#   BACKUP_OUT_DIR=/somewhere ./scripts/backup.sh
#
# The passphrase comes from BACKUP_PASSPHRASE and is never written to disk, put
# on a command line, or echoed. It is not stored on this box (plan §7 item 4);
# in CI it is a GitHub secret.
#
# ---------------------------------------------------------------------------
# What is deliberately NOT in the dump, and what that costs on restore
# ---------------------------------------------------------------------------
#
# The `auth` schema is not dumped. It belongs to Supabase's GoTrue service, is
# managed by the platform, and does not restore cleanly into a different
# project. `app_user` has no foreign key to `auth.users` (checked, not assumed),
# so the public schema is self-contained and restores on its own.
#
# ⚠ The cost is precise and it is the failure mode this project has already been
# bitten by once (plan_review.md R2): `app_user.user_id` in a restored dump
# points at a user id that exists only in the *old* project. Restore into a
# fresh project, log in, and every screen is empty — a working application over
# an empty allowlist, indistinguishable on screen from a shop that never traded.
# `docs/restore-runbook.md` makes re-pointing the allowlist a numbered step
# rather than a thing to remember.
set -euo pipefail

IMAGE=supabase/postgres:17.6.1.158
CONTAINER=aziz_erp_pg
DB="${AZIZ_DB:-aziz}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${BACKUP_OUT_DIR:-$ROOT/backups}"

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "BACKUP_PASSPHRASE is not set — refusing to write an unencrypted dump" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$OUT_DIR/aziz-$stamp.sql.gpg"

# pg_dump runs inside the same image the database runs, so the client version
# always matches the server. A pg_dump older than its server refuses outright,
# and CI runners carry whatever postgresql-client their image happens to ship.
dump() {
  if [ -n "${SUPABASE_DB_URL:-}" ]; then
    docker run --rm --network host --memory=256m "$IMAGE" \
      pg_dump "$SUPABASE_DB_URL" --schema=public --no-subscriptions
  else
    docker exec "$CONTAINER" \
      pg_dump -U postgres -d "$DB" --schema=public --no-subscriptions
  fi
}

# Privileges are kept on purpose. The grant/revoke state is security-critical
# here — the `revoke execute … from anon, public` sweep is what stops a stranger
# calling the SECURITY DEFINER write RPCs — so a dump that dropped privileges
# would restore a database that looks right and is open. `020_rls.sql` asserts
# that property, which is why the rehearsal runs the whole suite.
echo "dumping public schema…"
dump | gpg --batch --yes --symmetric \
  --cipher-algo AES256 --s2k-digest-algo SHA512 \
  --passphrase-fd 3 --output "$out" 3<<<"$BACKUP_PASSPHRASE"

bytes="$(wc -c <"$out")"

# A gpg file of a failed dump is still a valid gpg file. Without a floor, an
# empty or truncated dump encrypts cleanly, commits cleanly, and is discovered
# to be worthless on the day it is needed. The real dump is ~40 kB even with an
# empty ledger, because the schema alone is 13 migrations deep.
if [ "$bytes" -lt 4096 ]; then
  echo "dump is only $bytes bytes — that is not a database. Refusing." >&2
  rm -f "$out"
  exit 1
fi

echo "wrote $out ($bytes bytes, AES256)"
echo "$out"
