/*
 * Turning a Postgres error into something the shopkeeper can act on.
 *
 * Everything the write path can refuse is refused in English, by SQLSTATE, from
 * a trigger or an RPC: "occurred_on 2026-09-01 is in the future", "duplicate key
 * value violates unique constraint stock_count_one_standalone_per_day". Shown
 * raw, those read as a broken app rather than as a rule.
 *
 * The mapping is deliberately narrow. An unrecognised code falls through to a
 * generic message that says the entry was NOT saved — the one thing the user
 * must be certain of, because the alternative is entering it twice.
 */

export type WriteErrorKey =
  | 'future'
  | 'duplicateCount'
  | 'countRequired'
  | 'countOnBackdated'
  | 'notAuthorised'
  | 'offline'
  | 'unknown'

type PostgrestLike = { code?: string; message?: string; details?: string | null }

export function writeErrorKey(error: unknown): WriteErrorKey {
  if (!error || typeof error !== 'object') return 'unknown'

  const e = error as PostgrestLike
  const message = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase()

  // supabase-js reports a failed fetch as a TypeError with no SQLSTATE.
  if (e.code === undefined && /fetch|network/.test(message)) return 'offline'

  switch (e.code) {
    case '42501':
      return 'notAuthorised'
    case '23505':
      return 'duplicateCount'
    case '23514':
      // Both branches of record_purchase raise check_violation, and they mean
      // opposite things: one wants a count that is missing, the other refuses a
      // count that should not be there. The message is the only discriminator
      // the RPC gives us.
      if (message.includes('no count may be attached')) return 'countOnBackdated'
      if (message.includes('a count is required')) return 'countRequired'
      if (message.includes('in the future')) return 'future'
      return 'unknown'
    default:
      return 'unknown'
  }
}
