import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { countsQueryKey, invalidateLedger } from './ledger'
import { recordSweepResultSchema, type RecordSweepResult } from '@/types/writes'

/*
 * Stock counts (domain-spec §3, §8.3).
 *
 * A count is the only measurement in the system: everything else — goods sold,
 * revenue, profit — is inferred between two of them. That is why both entry
 * modes go through `record_count_sweep` and neither inserts directly: a
 * half-written sweep closes some categories' windows on a date and leaves
 * others open, and the report that comes out of it looks perfectly ordinary.
 *
 * A single count is a sweep of one. Same RPC, same idempotency, one code path.
 */

export type LatestCount = { occurredOn: string; valueAtCost: number }

/**
 * The category's most recent count, whatever its source.
 *
 * Two screens need it and for different reasons: the count form shows it beside
 * the input as the reference figure (§8.3), and the purchase form uses its date
 * to decide whether the embedded count is required at all (§3.2).
 *
 * ⚠ `excludeCountId` exists for exactly one caller and it is not an optimisation.
 *
 * When the purchase form is EDITING an existing purchase, the category's latest
 * count is very often that purchase's own embedded count. Left in, the client
 * compares the new date against a count that is about to move with it and
 * concludes the purchase is backdated when it is not — so the form shows the
 * "no count will be recorded" notice, saves with a null prior stock, and
 * `edit_purchase` rejects it with "a count is required". The SQL excludes the
 * purchase's own count from that maximum (0014_edit_rpcs.sql); this is the
 * client half of the same rule, and the two have to agree or the form asks the
 * wrong question.
 */
export function useLatestCount(categoryId: string | null, excludeCountId?: string | null) {
  return useQuery({
    queryKey: latestCountKey(categoryId, excludeCountId ?? null),
    enabled: Boolean(categoryId),
    queryFn: () => fetchLatestCount(categoryId as string, excludeCountId ?? null),
  })
}

/**
 * The same, for every category on the sweep screen at once.
 *
 * One query per category rather than one query over all counts: PostgREST has
 * no "latest row per group", and a single bounded query would quietly miss
 * exactly the categories that matter most here — the stale ones, whose last
 * count is far enough back to fall outside any limit.
 */
export function useLatestCounts(categoryIds: string[]) {
  const results = useQueries({
    queries: categoryIds.map((id) => ({
      queryKey: latestCountKey(id),
      queryFn: () => fetchLatestCount(id),
    })),
  })

  const byCategory: Record<string, LatestCount | null> = {}
  categoryIds.forEach((id, i) => {
    byCategory[id] = results[i]?.data ?? null
  })

  return { byCategory, isPending: results.some((r) => r.isPending) }
}

function latestCountKey(categoryId: string | null, excludeCountId: string | null = null) {
  return [...countsQueryKey, 'latest', categoryId, excludeCountId] as const
}

async function fetchLatestCount(
  categoryId: string,
  excludeCountId: string | null = null,
): Promise<LatestCount | null> {
  let query = supabase
    .from('stock_count')
    .select('occurred_on, value_at_cost')
    .eq('category_id', categoryId)
  if (excludeCountId) query = query.neq('id', excludeCountId)
  const { data, error } = await query
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? { occurredOn: data.occurred_on, valueAtCost: Number(data.value_at_cost) } : null
}

/**
 * What the records say should be on the shelf on a given date (§6.8).
 *
 * Shown beside the count input, and it is the answer to plan §2.15b: two
 * purchases of one category on one day, where the second count must include the
 * first delivery. Without the figure in front of them, the user counts the
 * shelf as they remember it that morning and the first delivery vanishes.
 *
 * Null when the category has never been counted — there is no bound yet.
 */
export function useExpectedOnHand(categoryId: string | null, asOf: string) {
  return useQuery({
    queryKey: [...countsQueryKey, 'expected', categoryId, asOf] as const,
    enabled: Boolean(categoryId),
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase.rpc('expected_on_hand', {
        p_category: categoryId as string,
        p_as_of: asOf,
      })
      if (error) throw error
      return data === null ? null : Number(data)
    },
  })
}

export type CountRow = {
  id: string
  categoryId: string
  categoryName: string
  occurredOn: string
  valueAtCost: number
  source: 'standalone' | 'purchase'
}

export function useRecentCounts(limit = 12) {
  return useQuery({
    queryKey: [...countsQueryKey, 'recent', limit] as const,
    queryFn: async (): Promise<CountRow[]> => {
      const { data, error } = await supabase
        .from('stock_count')
        .select('id, category_id, occurred_on, value_at_cost, source, article_category(name)')
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data.map((row) => ({
        id: row.id,
        categoryId: row.category_id,
        categoryName: row.article_category?.name ?? '',
        occurredOn: row.occurred_on,
        valueAtCost: Number(row.value_at_cost),
        source: row.source,
      }))
    },
  })
}

export type SweepInput = {
  /** Generated once per form submission, not per attempt (plan §2.12). */
  requestId: string
  date: string
  counts: { categoryId: string; valueAtCost: number }[]
}

export function useRecordSweep() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: SweepInput): Promise<RecordSweepResult> => {
      const { data, error } = await supabase.rpc('record_count_sweep', {
        p_request_id: input.requestId,
        p_date: input.date,
        p_counts: input.counts.map((c) => ({
          category_id: c.categoryId,
          value_at_cost: c.valueAtCost,
        })),
      })
      if (error) throw error
      return recordSweepResultSchema.parse(data)
    },
    onSuccess: async () => {
      await invalidateLedger(qc)
    },
  })
}

/**
 * Correcting an existing count (domain-spec §8.5).
 *
 * ⚠ `.eq('source', 'standalone')` is the same restriction `useDeleteCount` uses
 * below, and here it is load-bearing rather than tidy. A count with
 * `source = 'purchase'` describes the shelf before a specific delivery; moving
 * its date or category away from that delivery corrupts the timeline silently,
 * because `v_stock_event` takes the category from the count and the ordering
 * anchor from the purchase. The database refuses it outright since
 * 0014_edit_rpcs.sql — a deferred constraint trigger — but the filter keeps the
 * screen from ever offering the user an action that can only fail. The way to
 * move an embedded count is to edit its purchase, which moves both rows.
 *
 * The date is editable, and the unique index on (category, date) for standalone
 * counts is what stops an edit landing on top of another count; that surfaces as
 * a duplicate-key error, which `pg-errors.ts` already renders in French.
 */
export function useEditCount() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      categoryId: string
      date: string
      valueAtCost: number
    }) => {
      const { error } = await supabase
        .from('stock_count')
        .update({
          category_id: input.categoryId,
          occurred_on: input.date,
          value_at_cost: input.valueAtCost,
        })
        .eq('id', input.id)
        .eq('source', 'standalone')
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidateLedger(qc)
    },
  })
}

/**
 * Only standalone counts are deletable here.
 *
 * A count with `source = 'purchase'` belongs to its purchase and is removed
 * with it (`on delete restrict` in one direction, the cascade trigger in the
 * other). Deleting it on its own would leave a purchase claiming a count that
 * no longer exists.
 */
export function useDeleteCount() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('stock_count')
        .delete()
        .eq('id', id)
        .eq('source', 'standalone')
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidateLedger(qc)
    },
  })
}
