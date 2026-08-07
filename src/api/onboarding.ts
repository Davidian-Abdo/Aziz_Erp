import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { settingsQueryKey } from './settings'
import { categoriesQueryKey } from './categories'

/*
 * Opening the books (domain-spec §3.5, plan §2.13).
 *
 * On day one the shop is full of stock and the database is empty. Every count
 * window needs an opening count and nothing else creates the first one, so the
 * app opens on a mandatory sweep and the dashboard is unreachable until it
 * completes.
 */

export type OpeningCount = { categoryId: string; valueAtCost: number }

export type OpeningSweepInput = {
  /** Generated ONCE per form submission, not per attempt (architecture-spec
   * §4.1). This is what makes a retry on a flaky connection return the original
   * result instead of writing a second set of opening counts. */
  requestId: string
  date: string
  counts: OpeningCount[]
  /** Shelves the shop does not stock, deactivated rather than counted as zero:
   * nobody should have to invent a number for a shelf they do not have, and a
   * zero would read as "empty" rather than "not applicable". */
  deactivateCategoryIds: string[]
}

export function useCompleteOnboarding() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: OpeningSweepInput) => {
      if (input.deactivateCategoryIds.length > 0) {
        const { error } = await supabase
          .from('article_category')
          .update({ active: false })
          .in('id', input.deactivateCategoryIds)
        if (error) throw error
      }

      const { data, error } = await supabase.rpc('record_count_sweep', {
        p_request_id: input.requestId,
        p_date: input.date,
        p_counts: input.counts.map((c) => ({
          category_id: c.categoryId,
          value_at_cost: c.valueAtCost,
        })),
      })
      if (error) throw error

      // Second step, and deliberately after the counts: if this update fails,
      // the gate simply reappears and the same `requestId` replays the sweep
      // from its cache rather than writing it twice. The reverse order could
      // mark the books open with nothing in them.
      const { error: settingsError } = await supabase
        .from('app_settings')
        .update({ onboarded_at: new Date().toISOString() })
        .eq('id', 1)
      if (settingsError) throw settingsError

      return data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: settingsQueryKey })
      await qc.invalidateQueries({ queryKey: categoriesQueryKey })
    },
  })
}
