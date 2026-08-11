import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LossesPage } from './LossesPage'
import type { LossReason } from '@/api/losses'

/*
 * Loss entry (domain-spec §4).
 *
 * The screen has one job beyond recording a number: to make the difference
 * between "the store lost it" and "I took it home" visible while the user is
 * choosing. Those two are never summed into one figure (§4.2), and the only
 * moment anybody decides which it was is here.
 */

const DAIRY = {
  id: 'eeeeeeee-1111-1111-1111-111111111111',
  name: 'Produits laitiers',
  description: 'lait, fromage',
  active: true,
  sortOrder: 1,
}

const state = vi.hoisted(() => ({
  losses: [] as { categoryId: string; amount: number; reason: LossReason }[],
  edited: [] as unknown[],
  recent: [] as unknown[],
}))

vi.mock('@/api/categories', () => ({
  useCategories: () => ({ isPending: false, data: [DAIRY] }),
  categoriesQueryKey: ['article_category'],
}))

vi.mock('@/api/settings', () => ({ useStoreToday: () => '2026-08-03' }))

vi.mock('@/api/losses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/losses')>()
  return {
    ...actual,
    useEditLoss: () => ({
      isPending: false,
      isError: false,
      error: null,
      mutate: (input: unknown, opts?: { onSuccess?: () => void }) => {
        state.edited.push(input)
        opts?.onSuccess?.()
      },
    }),
    useRecordLoss: () => ({
      isPending: false,
      isError: false,
      error: null,
      mutate: (
        input: { categoryId: string; amount: number; reason: LossReason },
        opts?: { onSuccess?: () => void },
      ) => {
        state.losses.push(input)
        opts?.onSuccess?.()
      },
    }),
    useRecentLosses: () => ({ isPending: false, data: state.recent }),
    useDeleteLoss: () => ({ isPending: false, mutate: vi.fn() }),
  }
})

beforeEach(() => {
  state.losses = []
})

it('says why declaring a loss matters at all', () => {
  render(<LossesPage />)
  // Without this sentence the screen looks optional. It is: and skipping it
  // turns every loss into reported profit.
  expect(screen.getByText(/comptés comme vendus/)).toBeInTheDocument()
})

it('groups the reasons by what they mean, not as one flat list', () => {
  render(<LossesPage />)

  expect(screen.getByText('Perte du magasin')).toBeInTheDocument()
  expect(screen.getByText('Pris pour vous')).toBeInTheDocument()
  expect(screen.getByText(/ce n’est pas une perte du magasin/i)).toBeInTheDocument()

  // All seven of §4.2 are offered; a missing one becomes "Autre", which is
  // classified as shrinkage and hides an owner draw inside the store's losses.
  for (const label of [
    'Abîmé ou périmé',
    'Cassé',
    'Volé',
    'Offert ou donné',
    'Pris par la famille',
    'Consommation personnelle',
    'Autre',
  ]) {
    expect(screen.getByRole('radio', { name: label })).toBeInTheDocument()
  }
})

it('records the loss with the reason chosen, at buying price', async () => {
  const user = userEvent.setup()
  render(<LossesPage />)

  await user.selectOptions(screen.getByLabelText('Rayon'), DAIRY.id)
  await user.type(screen.getByLabelText(/Montant au prix d’achat/), '120,50')
  await user.click(screen.getByRole('radio', { name: 'Pris par la famille' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer la perte' }))

  await waitFor(() => expect(state.losses).toHaveLength(1))
  expect(state.losses[0]).toMatchObject({
    categoryId: DAIRY.id,
    amount: 120.5,
    reason: 'family_taken',
  })
})

/*
 * Editing a loss (domain-spec §8.5).
 *
 * The field that matters is `reason`, because it is the only thing deciding
 * whether the amount is the store's shrinkage or the owner taking goods home —
 * `loss_nature()` in SQL, §4.2 — and the two must never be summed. Picking the
 * wrong radio is the likeliest mistake on this screen, and before editing
 * existed the only correction was to DELETE a real loss and retype it, which is
 * a strictly worse operation to ask of someone fixing a misclick.
 */
describe('editing a loss (domain-spec §8.5)', () => {
  const ROW = {
    id: 'eeeeeeee-9999-9999-9999-999999999999',
    categoryId: DAIRY.id,
    categoryName: DAIRY.name,
    occurredOn: '2026-07-22',
    amountAtCost: 300,
    reason: 'family_taken' as const,
    note: null,
  }

  beforeEach(() => {
    state.recent = [ROW]
    state.edited = []
    state.losses = []
  })

  afterEach(() => {
    state.recent = []
  })

  it('prefills the reason that was recorded, not the default', async () => {
    const user = userEvent.setup({ delay: null })
    render(<LossesPage />)

    await user.click(screen.getByRole('button', { name: `Modifier — ${DAIRY.name}` }))

    // 'spoiled' is the form's default. If the prefill missed the reason, an
    // owner draw would silently become shrinkage on the next save.
    expect(screen.getByRole('radio', { name: 'Pris par la famille' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Abîmé ou périmé' })).not.toBeChecked()
    expect(screen.getByLabelText<HTMLInputElement>('Montant au prix d’achat').value).toBe('300')
  })

  it('RECLASSIFIES rather than recording a second loss', async () => {
    const user = userEvent.setup({ delay: null })
    render(<LossesPage />)

    await user.click(screen.getByRole('button', { name: `Modifier — ${DAIRY.name}` }))
    await user.click(screen.getByRole('radio', { name: 'Volé' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }))

    expect(state.edited).toEqual([
      {
        id: ROW.id,
        categoryId: DAIRY.id,
        date: '2026-07-22',
        amount: 300,
        reason: 'stolen',
        note: null,
      },
    ])
    // The whole point: 300 moved from owner_draw to shrinkage. An insert would
    // have left 300 in each, and the shop would report 600 of goods gone.
    expect(state.losses).toHaveLength(0)
  })
})
