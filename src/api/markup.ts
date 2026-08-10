import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { reportQueryKey } from './report'

/*
 * Markup rates — versioned by (category_id, effective_from).
 *
 * A change never touches a past row: it either inserts a new row for today or
 * overwrites today's row if one already exists (upsert). The historical rows are
 * read-only, and the pgTAP fixture 080_markup.sql proves that past
 * `report_period` outputs are byte-identical before and after a rate change.
 */

export const markupQueryKey = ['markup_rate'] as const

export type MarkupRate = {
  id: string
  categoryId: string
  markupPct: number
  effectiveFrom: string
}

export function useMarkupRates() {
  return useQuery({
    queryKey: markupQueryKey,
    queryFn: async (): Promise<MarkupRate[]> => {
      const { data, error } = await supabase
        .from('markup_rate')
        .select('id, category_id, markup_pct, effective_from')
        .order('effective_from', { ascending: false })
      if (error) throw error
      return data.map((r) => ({
        id: r.id,
        categoryId: r.category_id,
        markupPct: Number(r.markup_pct),
        effectiveFrom: r.effective_from,
      }))
    },
    staleTime: 5 * 60_000,
  })
}

export function useSetMarkupRate() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { categoryId: string; markupPct: number; effectiveFrom: string }) => {
      const { error } = await supabase.from('markup_rate').upsert(
        {
          category_id: input.categoryId,
          markup_pct: input.markupPct,
          effective_from: input.effectiveFrom,
        },
        { onConflict: 'category_id,effective_from' },
      )
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: markupQueryKey })
      await qc.invalidateQueries({ queryKey: reportQueryKey })
      await qc.invalidateQueries({ queryKey: ['report_trend'] as const })
    },
  })
}
