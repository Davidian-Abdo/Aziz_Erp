import type { QueryClient } from '@tanstack/react-query'
import { reportQueryKey } from './report'

/*
 * The query keys of everything that is an event in the ledger, in one place so
 * that the four entry screens can invalidate each other without importing each
 * other.
 *
 * They all move the same reports: there are no stored aggregates
 * (domain-spec §8.5), so a write invalidates and the next read recomputes from
 * the events themselves. A charge does not change a count window, but it does
 * change operating profit — and the screen the owner looks at next is the one
 * showing it.
 */

export const purchasesQueryKey = ['purchase'] as const
export const countsQueryKey = ['stock_count'] as const
export const chargesQueryKey = ['charge'] as const
export const lossesQueryKey = ['stock_loss'] as const

export async function invalidateLedger(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: purchasesQueryKey }),
    qc.invalidateQueries({ queryKey: countsQueryKey }),
    qc.invalidateQueries({ queryKey: chargesQueryKey }),
    qc.invalidateQueries({ queryKey: lossesQueryKey }),
    qc.invalidateQueries({ queryKey: reportQueryKey }),
  ])
}
