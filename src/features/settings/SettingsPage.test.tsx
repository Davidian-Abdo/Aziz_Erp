import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPage } from './SettingsPage'
import type { Category } from '@/api/categories'
import type { ChargeCategoryFull } from '@/api/charges'
import type { MarkupRate } from '@/api/markup'
import type { Settings } from '@/api/settings'

/*
 * Settings screen (Phase 6).
 *
 * The property most worth testing here is the markup save path: the mutation
 * must call the write path with the correct categoryId, markupPct and
 * effectiveFrom (today). A wrong date would write a rate that never takes
 * effect; a wrong categoryId would change the wrong shelf's figures.
 *
 * Category and charge-category mutations are tested to confirm the toggles
 * and inline edit forms reach the correct API calls.
 */

const TODAY = '2026-08-09'

const CATEGORIES: Category[] = [
  {
    id: 'aaaa-1',
    name: 'Produits laitiers',
    description: 'lait, fromage',
    active: true,
    sortOrder: 1,
  },
  { id: 'aaaa-2', name: 'Tabac', description: 'cigarettes', active: false, sortOrder: 2 },
]

const RATES: MarkupRate[] = [
  { id: 'rrrr-1', categoryId: 'aaaa-1', markupPct: 20, effectiveFrom: '2026-08-01' },
]

const CHARGE_CATS: ChargeCategoryFull[] = [
  { id: 'cccc-1', name: 'Loyer', nature: 'operating', isSystem: true, active: true },
  { id: 'cccc-2', name: 'Perso', nature: 'owner_draw', isSystem: false, active: true },
]

const SETTINGS: Settings = {
  storeName: 'Aziz',
  currencyCode: 'MAD',
  locale: 'fr',
  timezone: 'Africa/Casablanca',
  onboardedAt: '2026-08-01T09:00:00Z',
}

const state = vi.hoisted(() => ({
  categoryUpdates: [] as { id: string; name?: string; active?: boolean }[],
  markupSaves: [] as { categoryId: string; markupPct: number; effectiveFrom: string }[],
  chargeCategoryUpdates: [] as { id: string; active?: boolean }[],
  settingsUpdates: [] as Record<string, unknown>[],
}))

vi.mock('@/api/settings', () => ({
  useSettings: () => ({ isPending: false, data: SETTINGS }),
  useUpdateSettings: () => ({
    isPending: false,
    isError: false,
    mutate: (input: Record<string, unknown>, opts?: { onSuccess?: () => void }) => {
      state.settingsUpdates.push(input)
      opts?.onSuccess?.()
    },
  }),
  useStoreToday: () => TODAY,
}))

vi.mock('@/api/categories', () => ({
  useCategories: () => ({ isPending: false, data: CATEGORIES }),
  useCreateCategory: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useUpdateCategory: () => ({
    isPending: false,
    mutate: (
      input: { id: string; name?: string; active?: boolean },
      opts?: { onSuccess?: () => void },
    ) => {
      state.categoryUpdates.push(input)
      opts?.onSuccess?.()
    },
  }),
}))

vi.mock('@/api/markup', () => ({
  useMarkupRates: () => ({ isPending: false, data: RATES }),
  useSetMarkupRate: () => ({
    isPending: false,
    mutate: (
      input: { categoryId: string; markupPct: number; effectiveFrom: string },
      opts?: { onSuccess?: () => void },
    ) => {
      state.markupSaves.push(input)
      opts?.onSuccess?.()
    },
  }),
}))

vi.mock('@/api/charges', () => ({
  useAllChargeCategories: () => ({ isPending: false, data: CHARGE_CATS }),
  useCreateChargeCategory: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useUpdateChargeCategory: () => ({
    isPending: false,
    mutate: (input: { id: string; active?: boolean }, opts?: { onSuccess?: () => void }) => {
      state.chargeCategoryUpdates.push(input)
      opts?.onSuccess?.()
    },
  }),
}))

beforeEach(() => {
  state.categoryUpdates = []
  state.markupSaves = []
  state.chargeCategoryUpdates = []
  state.settingsUpdates = []
})

it('renders all four section headings', async () => {
  render(<SettingsPage />)

  // React 18 flushes effects asynchronously; waitFor lets act() settle.
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Réglages', level: 1 })).toBeInTheDocument()
  })
  expect(screen.getByRole('heading', { name: 'Magasin', level: 2 })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Rayons', level: 2 })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Marges', level: 2 })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Types de dépenses', level: 2 })).toBeInTheDocument()
})

it('saves a new markup rate with today as effectiveFrom', async () => {
  const user = userEvent.setup({ delay: null })
  render(<SettingsPage />)

  // The first category is Produits laitiers. Find its markup input by
  // locating the category heading and then the input within its section.
  const inputs = screen.getAllByLabelText('Marge (%)')
  await user.type(inputs[0]!, '25')
  await user.click(screen.getAllByRole('button', { name: 'Enregistrer la marge' })[0]!)

  expect(state.markupSaves).toHaveLength(1)
  expect(state.markupSaves[0]).toEqual({
    categoryId: 'aaaa-1',
    markupPct: 25,
    effectiveFrom: TODAY,
  })
})

it('shows the worked example when a valid percentage is typed', async () => {
  const user = userEvent.setup({ delay: null })
  render(<SettingsPage />)

  const inputs = screen.getAllByLabelText('Marge (%)')
  await user.type(inputs[0]!, '20')

  // 20% markup: buy at 100 → sell at 120
  await waitFor(() => {
    expect(screen.getByText(/vendez estimé à 120/)).toBeInTheDocument()
  })
})

it('deactivates a category when its toggle is clicked', async () => {
  const user = userEvent.setup({ delay: null })
  render(<SettingsPage />)

  // Produits laitiers is active; click its Désactiver button
  const deactivateButtons = screen.getAllByRole('button', { name: 'Désactiver' })
  await user.click(deactivateButtons[0]!)

  expect(state.categoryUpdates).toContainEqual({ id: 'aaaa-1', active: false })
})

it('shows inactive categories as inactive', () => {
  render(<SettingsPage />)

  // Tabac is inactive (active: false). It appears in both the Categories section
  // and the Markups section (the mock returns all categories regardless of filter).
  expect(screen.getAllByText('Tabac').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Désactivé').length).toBeGreaterThan(0)
})
