import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type Category = {
  id: string
  name: string
  /** The contents hint — "lait, fromage, yaourt, beurre". Not decoration: it is
   * read out wherever the whole shelf is being asked about, because a category
   * is a basket and a delivery is one product in it (plan §2.3). */
  description: string
  active: boolean
  sortOrder: number
}

export const categoriesQueryKey = ['article_category'] as const

export function useCategories(includeInactive = false) {
  return useQuery({
    queryKey: [...categoriesQueryKey, { includeInactive }] as const,
    queryFn: async (): Promise<Category[]> => {
      let q = supabase
        .from('article_category')
        .select('id, name, description, active, sort_order')
        .order('sort_order')
        .order('name')
      if (!includeInactive) q = q.eq('active', true)
      const { data, error } = await q
      if (error) throw error
      return data.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        active: row.active,
        sortOrder: row.sort_order,
      }))
    },
    staleTime: 5 * 60_000,
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; description: string }): Promise<Category> => {
      const { data, error } = await supabase
        .from('article_category')
        .insert({ name: input.name, description: input.description })
        .select('id, name, description, active, sort_order')
        .single()
      if (error) throw error
      return {
        id: data.id,
        name: data.name,
        description: data.description,
        active: data.active,
        sortOrder: data.sort_order,
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: categoriesQueryKey })
    },
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      name?: string
      description?: string
      active?: boolean
    }) => {
      const { error } = await supabase
        .from('article_category')
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.active !== undefined && { active: input.active }),
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: categoriesQueryKey })
    },
  })
}
