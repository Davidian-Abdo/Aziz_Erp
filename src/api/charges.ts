import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { chargesQueryKey, invalidateLedger } from './ledger'

/*
 * Charges — money spent that is not the purchase of resale stock
 * (domain-spec §5, §8.2).
 *
 * These are ordinary PostgREST writes: unlike a purchase, a charge has no
 * companion row and no cross-row invariant to protect, so there is nothing for
 * a transactional RPC to make atomic.
 *
 * The field that matters is `nature`. `operating` is a cost of running the
 * store and lands in operating profit; `owner_draw` is the owner taking money
 * out and is NOT a cost. Summing the two would report a profitable shop as a
 * struggling one, or hide a habit of drawing cash inside "expenses"
 * (domain-spec §6.7).
 */

export type ChargeNature = 'operating' | 'owner_draw'

export type ChargeCategory = {
  id: string
  name: string
  nature: ChargeNature
  isSystem: boolean
}

export const chargeCategoriesQueryKey = ['charge_category'] as const

export function useChargeCategories() {
  return useQuery({
    queryKey: chargeCategoriesQueryKey,
    queryFn: async (): Promise<ChargeCategory[]> => {
      const { data, error } = await supabase
        .from('charge_category')
        .select('id, name, nature, is_system')
        .eq('active', true)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data.map((row) => ({
        id: row.id,
        name: row.name,
        nature: row.nature,
        isSystem: row.is_system,
      }))
    },
    staleTime: 5 * 60_000,
  })
}

export type ChargeCategoryFull = ChargeCategory & { active: boolean }

export const allChargeCategoriesQueryKey = ['charge_category', 'all'] as const

export function useAllChargeCategories() {
  return useQuery({
    queryKey: allChargeCategoriesQueryKey,
    queryFn: async (): Promise<ChargeCategoryFull[]> => {
      const { data, error } = await supabase
        .from('charge_category')
        .select('id, name, nature, is_system, active')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data.map((row) => ({
        id: row.id,
        name: row.name,
        nature: row.nature,
        isSystem: row.is_system,
        active: row.active,
      }))
    },
    staleTime: 5 * 60_000,
  })
}

export function useUpdateChargeCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      name?: string
      nature?: ChargeNature
      active?: boolean
    }) => {
      const { error } = await supabase
        .from('charge_category')
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.nature !== undefined && { nature: input.nature }),
          ...(input.active !== undefined && { active: input.active }),
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: chargeCategoriesQueryKey })
      await qc.invalidateQueries({ queryKey: allChargeCategoriesQueryKey })
    },
  })
}

/**
 * Inline creation, without leaving the form (§8.2).
 *
 * The nature is asked for at creation because it can never be inferred later:
 * "Cadeau" could be a marketing cost or the owner buying a present, and only
 * the person typing it knows which.
 */
export function useCreateChargeCategory() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { name: string; nature: ChargeNature }): Promise<ChargeCategory> => {
      const { data, error } = await supabase
        .from('charge_category')
        .insert({ name: input.name, nature: input.nature })
        .select('id, name, nature, is_system')
        .single()
      if (error) throw error
      return { id: data.id, name: data.name, nature: data.nature, isSystem: data.is_system }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: chargeCategoriesQueryKey })
    },
  })
}

export type ChargeRow = {
  id: string
  /** Needed to prefill the form when this row is edited (domain-spec §8.5). */
  categoryId: string
  categoryName: string
  nature: ChargeNature
  occurredOn: string
  amount: number
  note: string | null
}

export function useRecentCharges(limit = 10) {
  return useQuery({
    queryKey: [...chargesQueryKey, 'recent', limit] as const,
    queryFn: async (): Promise<ChargeRow[]> => {
      const { data, error } = await supabase
        .from('charge')
        .select('id, charge_category_id, occurred_on, amount, note, charge_category(name, nature)')
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data.map((row) => ({
        id: row.id,
        categoryId: row.charge_category_id,
        categoryName: row.charge_category?.name ?? '',
        nature: row.charge_category?.nature ?? 'operating',
        occurredOn: row.occurred_on,
        amount: Number(row.amount),
        note: row.note,
      }))
    },
  })
}

export function useRecordCharge() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      chargeCategoryId: string
      date: string
      amount: number
      note: string | null
    }) => {
      const { error } = await supabase.from('charge').insert({
        charge_category_id: input.chargeCategoryId,
        occurred_on: input.date,
        amount: input.amount,
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
 * Correcting an existing charge (domain-spec §8.5).
 *
 * An ordinary PostgREST update, and it stays one: a charge is a single row with
 * no companion and no cross-row invariant, so there is nothing for a
 * transactional RPC to make atomic. The before/after pair is written to the
 * audit log by the trigger of 0005, which is what §8.5 actually requires.
 */
export function useEditCharge() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      chargeCategoryId: string
      date: string
      amount: number
      note: string | null
    }) => {
      const { error } = await supabase
        .from('charge')
        .update({
          charge_category_id: input.chargeCategoryId,
          occurred_on: input.date,
          amount: input.amount,
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

export function useDeleteCharge() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('charge').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidateLedger(qc)
    },
  })
}
