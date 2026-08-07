import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { CountsPage } from './CountsPage'
import type { SweepInput } from '@/api/counts'
import type { Plausibility } from '@/types/writes'

/*
 * Count entry (domain-spec §8.3, §4.3).
 *
 * Two properties are asserted here that a screenshot would not show:
 *
 *  - a single count goes through `record_count_sweep` like any other sweep, so
 *    there is one transactional write path rather than two;
 *  - the loss prompt appears after a count is saved. Without it, every
 *    undeclared loss is inferred as goods sold at full markup and reported as
 *    profit — and the moment to ask is while the user is still at the shelf.
 */

const CATEGORIES = [
  {
    id: 'aaaaaaaa-1111-1111-1111-111111111111',
    name: 'Produits laitiers',
    description: 'lait, fromage',
    active: true,
    sortOrder: 1,
  },
  {
    id: 'bbbbbbbb-2222-2222-2222-222222222222',
    name: 'Boissons',
    description: 'eau, jus',
    active: true,
    sortOrder: 2,
  },
]

const state = vi.hoisted(() => ({
  calls: [] as SweepInput[],
  verdict: 'ok' as Plausibility['verdict'],
}))

vi.mock('@/api/categories', () => ({
  useCategories: () => ({ isPending: false, data: CATEGORIES }),
  categoriesQueryKey: ['article_category'],
}))

vi.mock('@/api/settings', () => ({ useStoreToday: () => '2026-08-31' }))

vi.mock('@/api/purchases', () => ({
  checkCountPlausibility: (): Promise<Plausibility> =>
    Promise.resolve({
      verdict: state.verdict,
      entered: 900,
      expected_on_hand: 1000,
      last_count_on: '2026-07-31',
      days_since_last_count: 31,
      settled_windows: 2,
    }),
}))

vi.mock('@/api/counts', () => ({
  useLatestCount: () => ({
    isPending: false,
    data: { occurredOn: '2026-07-31', valueAtCost: 1040 },
  }),
  useLatestCounts: (ids: string[]) => ({
    isPending: false,
    byCategory: Object.fromEntries(
      ids.map((id, i) => [id, { occurredOn: '2026-07-31', valueAtCost: 1000 + i }]),
    ),
  }),
  useRecentCounts: () => ({ isPending: false, data: [] }),
  useDeleteCount: () => ({ isPending: false, mutate: vi.fn() }),
  useRecordSweep: () => ({
    isPending: false,
    isError: false,
    error: null,
    mutate: (input: SweepInput, opts?: { onSuccess?: (r: unknown) => void }) => {
      state.calls.push(input)
      opts?.onSuccess?.({ count_ids: ['c1'], n: input.counts.length, replayed: false })
    },
  }),
}))

function renderPage(entry = '/counts') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CountsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.calls = []
  state.verdict = 'ok'
})

describe('single count', () => {
  it('shows the previous count as a reference and writes one entry through the sweep RPC', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.selectOptions(screen.getByLabelText('Rayon'), CATEGORIES[0]!.id)
    // domain-spec §8.3: the previous value and its date, beside the input.
    expect(screen.getByText(/Dernier comptage/)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/Valeur au prix d’achat/), '900')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le comptage' }))

    await waitFor(() => expect(state.calls).toHaveLength(1))
    expect(state.calls[0]?.counts).toEqual([{ categoryId: CATEGORIES[0]!.id, valueAtCost: 900 }])
  })

  /*
   * The dashboard's data quality panel links here with the shelf it is
   * complaining about (domain-spec §6.5: every item links to the record that
   * caused it). If the form ignored the parameter, the owner would arrive at an
   * empty select having to remember which of a dozen rayons the warning named —
   * which is how a warning becomes something to scroll past.
   */
  it('preselects the category a link arrived with', () => {
    renderPage(`/counts?category=${CATEGORIES[1]!.id}`)

    expect(screen.getByLabelText<HTMLSelectElement>('Rayon').value).toBe(CATEGORIES[1]!.id)
    expect(screen.getByText(/Dernier comptage/)).toBeInTheDocument()
  })

  it('runs the plausibility check on a standalone count too', async () => {
    state.verdict = 'high_outflow'
    const user = userEvent.setup()
    renderPage()

    await user.selectOptions(screen.getByLabelText('Rayon'), CATEGORIES[0]!.id)
    await user.type(screen.getByLabelText(/Valeur au prix d’achat/), '900')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le comptage' }))

    expect(await screen.findByRole('dialog')).toHaveTextContent(/inhabituel/i)
    expect(state.calls).toHaveLength(0)
  })

  it('offers the loss prompt after saving, and skipping is one tap', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.selectOptions(screen.getByLabelText('Rayon'), CATEGORIES[0]!.id)
    await user.type(screen.getByLabelText(/Valeur au prix d’achat/), '900')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le comptage' }))

    // domain-spec §4.3 — asked at the shelf, refused in one tap, no penalty.
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/comptés comme vendus/)
    await user.click(screen.getByRole('button', { name: 'Non, rien' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('month-end sweep', () => {
  it('submits every shelf in ONE call, on one date', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'Tous les rayons' }))

    for (const c of CATEGORIES) {
      await user.type(screen.getByLabelText(`Valeur au prix d’achat — ${c.name}`), '500')
    }
    await user.click(screen.getByRole('button', { name: 'Enregistrer tous les comptages' }))

    // All or nothing: a half-written sweep closes some windows and leaves
    // others open, and the report that comes out looks perfectly ordinary.
    await waitFor(() => expect(state.calls).toHaveLength(1))
    expect(state.calls[0]?.counts).toHaveLength(2)
    expect(state.calls[0]?.date).toBe('2026-08-31')
  })

  it('refuses to submit a partly-filled sweep', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'Tous les rayons' }))
    await user.type(screen.getByLabelText(`Valeur au prix d’achat — ${CATEGORIES[0]!.name}`), '500')
    await user.click(screen.getByRole('button', { name: 'Enregistrer tous les comptages' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Renseignez chaque rayon')
    expect(state.calls).toHaveLength(0)
  })
})
