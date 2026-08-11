import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { invalidateLedger, lossesQueryKey } from './ledger'

/*
 * Stock losses (domain-spec §4).
 *
 * Optional, and the only defence against the model's blindest spot: goods that
 * left the shelf without being sold are otherwise inferred as sold, at full
 * markup, and reported as profit. A crate of spoiled milk reads as a good week.
 *
 * The `shrinkage` / `owner_draw` split mirrors the same distinction on charges.
 * "The store lost 740" and "I took 300 home" are different facts and must never
 * be summed into one number (§4.2).
 */

export type LossReason =
  'spoiled' | 'broken' | 'stolen' | 'given_away' | 'family_taken' | 'personal_use' | 'other'

export type LossNature = 'shrinkage' | 'owner_draw'

/*
 * The reasons of §4.2, in the order they are offered, with the nature each one
 * carries.
 *
 * ⚠ This mapping is a COPY of the `loss_nature()` function in
 * 0003_transactions.sql, which is the source of truth — the report is computed
 * from the SQL, never from this table. It exists only so the form can group the
 * reasons under two headings and say plainly what each one means. It is pinned
 * to the SQL by `loss-nature-matches-sql.test.ts`, so a reclassification in a
 * future migration cannot leave this list quietly disagreeing with the reports.
 */
export const LOSS_REASONS: { reason: LossReason; nature: LossNature }[] = [
  { reason: 'spoiled', nature: 'shrinkage' },
  { reason: 'broken', nature: 'shrinkage' },
  { reason: 'stolen', nature: 'shrinkage' },
  { reason: 'given_away', nature: 'shrinkage' },
  { reason: 'family_taken', nature: 'owner_draw' },
  { reason: 'personal_use', nature: 'owner_draw' },
  { reason: 'other', nature: 'shrinkage' },
]

export type LossRow = {
  id: string
  /** Needed to prefill the form when this row is edited (domain-spec §8.5). */
  categoryId: string
  categoryName: string
  occurredOn: string
  amountAtCost: number
  reason: LossReason
  note: string | null
}

export function useRecentLosses(limit = 10) {
  return useQuery({
    queryKey: [...lossesQueryKey, 'recent', limit] as const,
    queryFn: async (): Promise<LossRow[]> => {
      const { data, error } = await supabase
        .from('stock_loss')
        .select(
          'id, category_id, occurred_on, amount_at_cost, reason, note, article_category(name)',
        )
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data.map((row) => ({
        id: row.id,
        categoryId: row.category_id,
        categoryName: row.article_category?.name ?? '',
        occurredOn: row.occurred_on,
        amountAtCost: Number(row.amount_at_cost),
        reason: row.reason,
        note: row.note,
      }))
    },
  })
}

export function useRecordLoss() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      categoryId: string
      date: string
      amount: number
      reason: LossReason
      note: string | null
    }) => {
      const { error } = await supabase.from('stock_loss').insert({
        category_id: input.categoryId,
        occurred_on: input.date,
        amount_at_cost: input.amount,
        reason: input.reason,
        note: input.note,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidateLedger(qc)
    },
  })
}

/**
 * Correcting an existing loss (domain-spec §8.5).
 *
 * An ordinary update, like a charge — one row, no companion. The field worth
 * being able to correct is `reason`: it is what decides whether the amount is
 * counted as the store's shrinkage or as the owner taking goods home
 * (`loss_nature()` in SQL, §4.2), and those two must never be summed. Picking
 * the wrong one from the list is exactly the mistake this screen exists to let
 * the owner undo.
 */
export function useEditLoss() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      categoryId: string
      date: string
      amount: number
      reason: LossReason
      note: string | null
    }) => {
      const { error } = await supabase
        .from('stock_loss')
        .update({
          category_id: input.categoryId,
          occurred_on: input.date,
          amount_at_cost: input.amount,
          reason: input.reason,
          note: input.note,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidateLedger(qc)
    },
  })
}

export function useDeleteLoss() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stock_loss').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidateLedger(qc)
    },
  })
}
