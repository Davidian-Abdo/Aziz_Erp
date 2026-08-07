import { useState } from 'react'
import { parseAmount } from '@/lib/amount'

/*
 * The state behind a sweep — every active category, one value each, submitted
 * as one transaction (domain-spec §8.3).
 *
 * Shared by the two screens that do it, because they are the same form with
 * different copy: the opening sweep of §3.5, which may deactivate shelves the
 * shop does not stock, and the month-end sweep, which shows the previous count
 * beside each input. Two implementations would drift, and the one that drifted
 * would be the one used once a month.
 */

export type SweepEntry = { categoryId: string; valueAtCost: number }

export function useSweepDraft(categoryIds: string[]) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [skipped, setSkipped] = useState<Set<string>>(new Set())

  /*
   * ONE identifier for this screen, not one per attempt (plan §2.12). A retry
   * after a lost response replays the original sweep from `write_request`
   * rather than writing a second set of counts on the same date — which the
   * partial unique index would reject anyway, leaving the user staring at a
   * duplicate-key error for having a bad connection.
   */
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const included = categoryIds.filter((id) => !skipped.has(id))

  // Not memoised: the caller rebuilds `categoryIds` on every render anyway, and
  // a dozen string-to-number parses is not worth a dependency array that would
  // be wrong more often than it would be fast.
  const entries: SweepEntry[] = included.flatMap((id) => {
    // A count of 0 is a measurement: the shelf was empty (§3.1).
    const parsed = parseAmount(values[id] ?? '', { allowZero: true })
    return parsed.ok ? [{ categoryId: id, valueAtCost: parsed.value }] : []
  })

  const isComplete = included.length > 0 && entries.length === included.length

  /*
   * The running total of the numbers being typed, shown back to the user as
   * they type.
   *
   * This is the one piece of arithmetic on money in the codebase, and it is not
   * what architecture-spec §1.2 forbids: it is a sum of the user's own current
   * input, it never leaves the screen, and it is not a reported figure. Every
   * number on the dashboard still comes from `report_period`.
   */
  const total = entries.reduce((sum, e) => sum + e.valueAtCost, 0)

  return {
    values,
    setValue: (id: string, value: string) => setValues((v) => ({ ...v, [id]: value })),
    skipped,
    toggleSkip: (id: string) =>
      setSkipped((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    entries,
    isComplete,
    total,
    requestId,
    /** After a successful submit: a new sweep is a new submission. */
    reset: () => {
      setValues({})
      setSkipped(new Set())
      setRequestId(crypto.randomUUID())
    },
  }
}
