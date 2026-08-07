import { useState } from 'react'
import { checkCountPlausibility } from '@/api/purchases'
import type { Plausibility } from '@/types/writes'

/*
 * The plausibility check of domain-spec §3.2, as a gate both count paths pass
 * through — the purchase-embedded count and the standalone one. The heuristic
 * belongs to the count, not to the screen it was typed on.
 *
 * Three properties it must keep, all of them deliberate:
 *
 *  - it NEVER prevents saving. A non-`ok` verdict is a blocking confirmation
 *    with **Corriger** as the primary action, and the user may simply be right;
 *  - if the check itself fails — offline, RPC unavailable — the write proceeds.
 *    Refusing to record a purchase because an advisory warning could not be
 *    computed would be worse than the mistake it looks for;
 *  - it runs before the write, not after. Afterwards the false profit is
 *    already inside a report.
 */
export function usePlausibilityGate() {
  const [verdict, setVerdict] = useState<Plausibility | null>(null)
  const [checking, setChecking] = useState(false)

  /**
   * Runs the check and calls `proceed` unless a verdict needs confirming.
   * When one does, it is held in `verdict` until the user resolves the dialog.
   */
  async function guard(
    categoryId: string,
    asOf: string,
    value: number,
    proceed: (value: number) => void,
  ): Promise<void> {
    setChecking(true)
    try {
      const result = await checkCountPlausibility(categoryId, asOf, value)
      if (result.verdict !== 'ok') {
        setVerdict(result)
        return
      }
    } catch {
      // See above: an advisory check that cannot run does not block a write.
    } finally {
      setChecking(false)
    }
    proceed(value)
  }

  return {
    verdict,
    checking,
    guard,
    /** "Corriger" — back to the input, nothing written. */
    dismiss: () => setVerdict(null),
    /** "Enregistrer quand même" — the user says the figure is right. */
    override: (proceed: (value: number) => void) => {
      if (!verdict) return
      const value = verdict.entered
      setVerdict(null)
      proceed(value)
    },
  }
}
