import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { todayInTimezone } from '@/lib/dates'
import type { DisplaySettings } from '@/lib/display-settings'

/*
 * `app_settings` and the allowlist check.
 *
 * These two are what the shell needs before it can decide which screen the user
 * belongs on: signed in but not allowlisted, signed in but the books are not
 * open yet, or signed in and ready.
 */

export type Settings = DisplaySettings & {
  timezone: string
  onboardedAt: string | null
}

export const settingsQueryKey = ['app_settings'] as const
export const allowlistQueryKey = ['app_user', 'self'] as const

export function useSettings() {
  return useQuery({
    queryKey: settingsQueryKey,
    queryFn: async (): Promise<Settings | null> => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('currency_code, locale, store_name, timezone, onboarded_at')
        .eq('id', 1)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        currencyCode: data.currency_code,
        locale: data.locale,
        storeName: data.store_name,
        timezone: data.timezone,
        onboardedAt: data.onboarded_at,
      }
    },
    // Settings change in one screen, by one person, a handful of times ever.
    staleTime: 5 * 60_000,
  })
}

/*
 * The store's today, as `YYYY-MM-DD`.
 *
 * Every entry screen needs it twice: as the default date, and as the maximum
 * one. It must come from the store's timezone, not the device's — the server
 * rejects a future date against `store_today()` (plan §2.6), and a phone whose
 * clock sits an hour ahead would otherwise offer a date the database refuses.
 *
 * Falls back to the seeded default so the field is never empty while settings
 * are still loading.
 */
export function useStoreToday(): string {
  const settings = useSettings()
  return todayInTimezone(settings.data?.timezone ?? 'Africa/Casablanca')
}

/*
 * Is this user actually allowed in?
 *
 * `app_user` carries a self-read policy, so an allowlisted user sees exactly one
 * row and everybody else sees none. Without this check the two failure modes —
 * "you are not on the allowlist" and "the shop has no data yet" — look identical
 * on screen: every table returns empty, no error is raised, and the owner has no
 * way to tell a permission problem from an empty database.
 */
export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      storeName?: string
      currencyCode?: string
      locale?: string
      timezone?: string
    }) => {
      const { error } = await supabase
        .from('app_settings')
        .update({
          ...(input.storeName !== undefined && { store_name: input.storeName }),
          ...(input.currencyCode !== undefined && { currency_code: input.currencyCode }),
          ...(input.locale !== undefined && { locale: input.locale }),
          ...(input.timezone !== undefined && { timezone: input.timezone }),
        })
        .eq('id', 1)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: settingsQueryKey })
    },
  })
}

export function useIsAllowlisted() {
  return useQuery({
    queryKey: allowlistQueryKey,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.from('app_user').select('user_id, active')
      if (error) throw error
      return data.some((row) => row.active)
    },
    staleTime: 5 * 60_000,
    retry: 1,
  })
}
