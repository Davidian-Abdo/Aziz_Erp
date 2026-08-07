#!/usr/bin/env bash
#
# Regenerate src/types/database.ts from the live local schema.
#
# architecture-spec §5.5: these types are committed and regenerated on every
# migration. Run this after `npm run db:reset` and commit the diff — a stale
# database.ts is how a schema change reaches the UI as `undefined` instead of a
# compile error.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_URL="${AZIZ_DB_URL:-postgresql://postgres:aziz_dev@localhost:5434/aziz}"
OUT="$ROOT/src/types/database.ts"

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI not on PATH — expected at ~/bin/supabase" >&2
  echo 'try: export PATH="$HOME/bin:$PATH"' >&2
  exit 1
fi

echo "generating types from $DB_URL"
supabase gen types typescript --db-url "$DB_URL" --schema public >"$OUT"
echo "wrote $OUT"
