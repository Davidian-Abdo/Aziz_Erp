import { createContext, useContext } from 'react'

/*
 * Display-only settings (domain-spec §9.1: "currency is a single global
 * setting, applied for display only"). They arrive from `app_settings` once the
 * user is authenticated, but every consumer must work before that resolves —
 * hence a default rather than a required provider.
 *
 * The defaults match `seed.sql`'s settings singleton.
 */
export type DisplaySettings = {
  locale: string
  currencyCode: string
  storeName: string
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  locale: 'fr',
  currencyCode: 'MAD',
  storeName: 'Aziz',
}

export const DisplaySettingsContext = createContext<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS)

export function useDisplaySettings(): DisplaySettings {
  return useContext(DisplaySettingsContext)
}
