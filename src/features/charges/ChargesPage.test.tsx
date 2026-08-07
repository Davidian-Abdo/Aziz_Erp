import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChargesPage } from './ChargesPage'
import type { ChargeCategory, ChargeNature } from '@/api/charges'

/*
 * Charge entry (domain-spec §8.2, §6.7).
 *
 * The thing worth testing is not the form, it is the `nature` question. An
 * operating charge reduces the store's result; an owner draw does not. Get it
 * wrong once, at category-creation time, and every charge filed under it is
 * misclassified for good — the numbers cannot be untangled afterwards, because
 * nothing else in the row says which it was.
 */

const CATEGORIES: ChargeCategory[] = [
  {
    id: 'cccccccc-1111-1111-1111-111111111111',
    name: 'Loyer',
    nature: 'operating',
    isSystem: true,
  },
]

const state = vi.hoisted(() => ({
  charges: [] as { chargeCategoryId: string; amount: number; date: string }[],
  created: [] as { name: string; nature: string }[],
}))

vi.mock('@/api/settings', () => ({ useStoreToday: () => '2026-08-03' }))

vi.mock('@/api/charges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/charges')>()
  const NEW_ID = 'dddddddd-2222-2222-2222-222222222222'
  return {
    ...actual,
    useChargeCategories: () => ({ isPending: false, data: CATEGORIES }),
    useCreateChargeCategory: () => ({
      isPending: false,
      mutate: (
        input: { name: string; nature: ChargeNature },
        opts?: { onSuccess?: (c: ChargeCategory) => void },
      ) => {
        state.created.push(input)
        const category: ChargeCategory = { id: NEW_ID, ...input, isSystem: false }
        CATEGORIES.push(category)
        opts?.onSuccess?.(category)
      },
    }),
    useRecordCharge: () => ({
      isPending: false,
      isError: false,
      error: null,
      mutate: (
        input: { chargeCategoryId: string; amount: number; date: string },
        opts?: { onSuccess?: () => void },
      ) => {
        state.charges.push(input)
        opts?.onSuccess?.()
      },
    }),
    useRecentCharges: () => ({ isPending: false, data: [] }),
    useDeleteCharge: () => ({ isPending: false, mutate: vi.fn() }),
  }
})

beforeEach(() => {
  state.charges = []
  state.created = []
  CATEGORIES.length = 1
})

it('records a charge against the chosen category', async () => {
  const user = userEvent.setup()
  render(<ChargesPage />)

  await user.selectOptions(screen.getByLabelText('Type de dépense'), CATEGORIES[0]!.id)
  await user.type(screen.getByLabelText('Montant'), '1200')
  await user.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }))

  await waitFor(() => expect(state.charges).toHaveLength(1))
  expect(state.charges[0]).toMatchObject({
    chargeCategoryId: CATEGORIES[0]!.id,
    amount: 1200,
    date: '2026-08-03',
  })
})

it('creates a category inline, in plain language, and selects it', async () => {
  const user = userEvent.setup()
  render(<ChargesPage />)

  await user.click(screen.getByRole('button', { name: '+ Nouveau type de dépense' }))

  // Not "operating expense" and "owner draw" — the words a shopkeeper uses.
  expect(screen.getByText(/loyer, électricité, transport/)).toBeInTheDocument()
  expect(screen.getByText(/Ce n’est pas une dépense du magasin/)).toBeInTheDocument()

  await user.type(screen.getByLabelText('Nom du type de dépense'), 'Mariage')
  await user.click(screen.getByRole('radio', { name: /Argent que vous prenez/ }))
  await user.click(screen.getByRole('button', { name: 'Ajouter' }))

  expect(state.created[0]).toEqual({ name: 'Mariage', nature: 'owner_draw' })

  // Selected straight away: the user came here to file a charge, not to manage
  // a taxonomy.
  await waitFor(() =>
    expect(screen.getByLabelText<HTMLSelectElement>('Type de dépense').value).toBe(
      'dddddddd-2222-2222-2222-222222222222',
    ),
  )
})

it('refuses a charge with no category rather than guessing one', async () => {
  const user = userEvent.setup()
  render(<ChargesPage />)

  await user.type(screen.getByLabelText('Montant'), '1200')
  await user.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }))

  expect(screen.getByText('Choisissez un type de dépense.')).toBeInTheDocument()
  expect(state.charges).toHaveLength(0)
})
