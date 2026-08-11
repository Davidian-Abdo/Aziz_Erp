import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { invalidateLedger, purchasesQueryKey } from './ledger'
import {
  editPurchaseResultSchema,
  plausibilitySchema,
  recordPurchaseResultSchema,
  type EditPurchaseResult,
  type Plausibility,
  type RecordPurchaseResult,
} from '@/types/writes'

/*
 * Purchases (domain-spec §8.1, architecture-spec §4.1).
 *
 * Writes go through `record_purchase` and nowhere else: `authenticated` holds
 * no INSERT grant on `purchase` at all (0006_security.sql), because "a purchase
 * that is the category's newest event must carry a count" is a cross-row rule
 * no constraint can express. A direct insert would bypass it in one call and
 * leave the timeline permanently unsettled.
 *
 * UPDATE and DELETE stay direct and audited.
 */

export type PurchaseRow = {
  id: string
  categoryId: string
  categoryName: string
  occurredOn: string
  amountAtCost: number
  /** Null on a backdated purchase — no count was attached (domain-spec §3.2). */
  priorCountId: string | null
  /**
   * The embedded count's value, so an edit can prefill the §3.2A shelf question
   * instead of making the owner re-answer it to correct an amount. Null exactly
   * when `priorCountId` is.
   */
  priorStockValue: number | null
  note: string | null
}

export function useRecentPurchases(limit = 10) {
  return useQuery({
    queryKey: [...purchasesQueryKey, 'recent', limit] as const,
    queryFn: async (): Promise<PurchaseRow[]> => {
      const { data, error } = await supabase
        .from('purchase')
        .select(
          'id, category_id, occurred_on, amount_at_cost, prior_count_id, note, article_category(name), stock_count(value_at_cost)',
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
        priorCountId: row.prior_count_id,
        priorStockValue: row.stock_count === null ? null : Number(row.stock_count.value_at_cost),
        note: row.note,
      }))
    },
  })
}

/*
 * Which of the two paths of domain-spec §3.2 is this purchase on?
 *
 * Strictly behind the category's last count → backdated, no count is attached.
 * On or after it → the purchase is the newest event and the count is required.
 * The equality case belongs to the second branch deliberately (plan_review R3):
 * a standalone count sorts after all purchases of its date, so an afternoon
 * delivery on the morning of a sweep would otherwise be ordered before that
 * sweep and booked as sold at full markup on the day it arrived.
 *
 * `record_purchase` enforces the same rule server-side; this only lets the form
 * ask the right question instead of showing the user an exception.
 */
export function isBackdated(purchaseDate: string, lastCountOn: string | null): boolean {
  return lastCountOn !== null && purchaseDate < lastCountOn
}

/** The heuristic guard of domain-spec §3.2, run before the count is written. */
export async function checkCountPlausibility(
  categoryId: string,
  asOf: string,
  value: number,
): Promise<Plausibility> {
  const { data, error } = await supabase.rpc('check_count_plausibility', {
    p_category: categoryId,
    p_as_of: asOf,
    p_value: value,
  })
  if (error) throw error
  return plausibilitySchema.parse(data)
}

export type RecordPurchaseInput = {
  /** Generated once per form submission, NOT per attempt (plan §2.12). */
  requestId: string
  categoryId: string
  date: string
  amount: number
  /** The whole shelf before the delivery, or null when backdated. */
  priorStock: number | null
  note: string | null
}

export function useRecordPurchase() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: RecordPurchaseInput): Promise<RecordPurchaseResult> => {
      const { data, error } = await supabase.rpc('record_purchase', {
        p_request_id: input.requestId,
        p_category: input.categoryId,
        p_date: input.date,
        p_amount: input.amount,
        // The generated type says `number` because the SQL parameter has no
        // default; null is exactly what the backdated branch requires, and the
        // function raises if a count is attached there.
        p_prior_stock: input.priorStock as number,
        p_note: input.note ?? undefined,
      })
      if (error) throw error
      return recordPurchaseResultSchema.parse(data)
    },
    onSuccess: async () => {
      await invalidateLedger(qc)
    },
  })
}

export type EditPurchaseInput = {
  id: string
  categoryId: string
  date: string
  /** The whole shelf before the delivery, or null when backdated. */
  priorStock: number | null
  amount: number
  note: string | null
}

/**
 * Correcting an existing purchase (domain-spec §8.5).
 *
 * Through `edit_purchase` rather than a direct UPDATE, for a reason an insert
 * never has to face: an edit can move a purchase ACROSS the §3.2A boundary in
 * either direction. Drag it behind the category's last count and the embedded
 * count must be deleted; drag it forward again and one must be created. Both
 * rows also have to move together or the timeline is silently corrupted — see
 * the defect note at the top of 0014_edit_rpcs.sql.
 *
 * No `requestId`. An edit is idempotent by construction.
 */
export function useEditPurchase() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: EditPurchaseInput): Promise<EditPurchaseResult> => {
      const { data, error } = await supabase.rpc('edit_purchase', {
        p_id: input.id,
        p_category: input.categoryId,
        p_date: input.date,
        p_amount: input.amount,
        // As in useRecordPurchase: the generated type says `number` because the
        // SQL parameter has no default, and null is what the backdated branch
        // requires.
        p_prior_stock: input.priorStock as number,
        p_note: input.note ?? undefined,
      })
      if (error) throw error
      return editPurchaseResultSchema.parse(data)
    },
    onSuccess: async () => {
      await invalidateLedger(qc)
    },
  })
}

export function useDeletePurchase() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // The embedded count goes with it: `cascade_delete_embedded_count` on the
      // table (0004_guards.sql). Deleting the purchase and leaving its count
      // behind would invent a count nobody took.
      const { error } = await supabase.from('purchase').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidateLedger(qc)
    },
  })
}
