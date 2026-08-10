import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PurchasePage } from './PurchasePage'
import type { RecordPurchaseInput } from '@/api/purchases'
import type { Plausibility } from '@/types/writes'

/*
 * The purchase flow — where the two rules that cost real money live:
 *
 *   §3.2 the embedded count is required when the purchase is the category's
 *        newest event, and must NOT be attached when it is backdated;
 *   §8.1 one identifier per submission, so a retry replays instead of posting a
 *        second purchase. A duplicated purchase inflates outflow, and this model
 *        reports outflow as profit.
 *
 * The api modules are mocked; what is under test is the decision the form makes
 * and the arguments it sends, which is exactly where those two rules are either
 * honoured or lost.
 */

const DAIRY = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Produits laitiers',
  description: 'lait, fromage, yaourt, beurre',
  active: true,
  sortOrder: 1,
}

const state = vi.hoisted(() => ({
  lastCountOn: null as string | null,
  verdict: 'ok' as Plausibility['verdict'],
  calls: [] as RecordPurchaseInput[],
  /** Set to make `mutate` succeed; while false every attempt "fails". */
  succeeds: true,
}))

vi.mock('@/api/categories', () => ({
  useCategories: () => ({ isPending: false, data: [DAIRY] }),
  categoriesQueryKey: ['article_category'],
}))

vi.mock('@/api/settings', () => ({
  useStoreToday: () => '2026-08-03',
}))

vi.mock('@/api/counts', () => ({
  useLatestCount: () => ({
    isPending: false,
    data: state.lastCountOn ? { occurredOn: state.lastCountOn, valueAtCost: 1000 } : null,
  }),
  useExpectedOnHand: () => ({ isPending: false, data: 1000 }),
}))

vi.mock('@/api/purchases', async (importOriginal) => {
  // `isBackdated` is kept real: which branch the form takes is the thing being
  // tested, so stubbing it would prove nothing.
  const actual = await importOriginal<typeof import('@/api/purchases')>()
  return {
    ...actual,
    checkCountPlausibility: (): Promise<Plausibility> =>
      Promise.resolve({
        verdict: state.verdict,
        entered: 50,
        expected_on_hand: 1000,
        last_count_on: state.lastCountOn,
        days_since_last_count: 3,
        settled_windows: 2,
      }),
    useRecordPurchase: () => ({
      isPending: false,
      isError: false,
      error: null,
      mutate: (input: RecordPurchaseInput, opts?: { onSuccess?: (r: unknown) => void }) => {
        state.calls.push(input)
        if (state.succeeds)
          opts?.onSuccess?.({ purchase_id: 'p1', count_id: null, replayed: false })
      },
    }),
    useRecentPurchases: () => ({ isPending: false, data: [] }),
    useDeletePurchase: () => ({ isPending: false, mutate: vi.fn() }),
  }
})

function renderPage() {
  return render(
    <MemoryRouter>
      <PurchasePage />
    </MemoryRouter>,
  )
}

/** Fills the first screen and moves to the stock question. */
async function fillDetails(user: ReturnType<typeof userEvent.setup>, amount = '300') {
  await user.selectOptions(screen.getByLabelText('Rayon'), DAIRY.id)
  await user.type(screen.getByLabelText(/Montant payé/), amount)
  await user.click(screen.getByRole('button', { name: 'Suivant' }))
}

beforeEach(() => {
  state.lastCountOn = null
  state.verdict = 'ok'
  state.calls = []
  state.succeeds = true
})

describe('the purchase is the category’s newest event', () => {
  it('asks for the WHOLE shelf and lists what is on it', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await fillDetails(user)

    // domain-spec §3.2A. This wording is the only defence against the
    // category-scope trap, so it is asserted rather than left to review.
    expect(screen.getByText(/Tout le rayon Produits laitiers/)).toBeInTheDocument()
    expect(screen.getByText('lait, fromage, yaourt, beurre')).toBeInTheDocument()
    expect(screen.getByText('Pas seulement ce que vous venez d’acheter.')).toBeInTheDocument()
    expect(screen.getByText('Combien restait-il, au prix d’achat ?')).toBeInTheDocument()
  })

  it('records 0 when the shelf was empty — a count, not a skipped question', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await fillDetails(user)

    await user.click(screen.getByRole('button', { name: 'Rien, le rayon était vide' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’achat' }))

    await waitFor(() => expect(state.calls).toHaveLength(1))
    expect(state.calls[0]).toMatchObject({ amount: 300, priorStock: 0, date: '2026-08-03' })
  })

  it('sends the value that was counted', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await fillDetails(user)

    await user.click(screen.getByRole('button', { name: 'Il restait quelque chose' }))
    await user.type(screen.getByLabelText(/Valeur restante/), '1 040,50')
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’achat' }))

    await waitFor(() => expect(state.calls).toHaveLength(1))
    expect(state.calls[0]?.priorStock).toBe(1040.5)
  })
})

describe('the purchase is backdated (domain-spec §3.2, plan §2.4)', () => {
  it('explains that no count will be recorded, and attaches none', async () => {
    state.lastCountOn = '2026-08-02'
    const user = userEvent.setup({ delay: null })
    renderPage()

    // Dated the 1st, behind the last count on the 2nd.
    await user.selectOptions(screen.getByLabelText('Rayon'), DAIRY.id)
    await user.clear(screen.getByLabelText(/Date de l’achat/))
    await user.type(screen.getByLabelText(/Date de l’achat/), '2026-08-01')
    await user.type(screen.getByLabelText(/Montant payé/), '300')
    await user.click(screen.getByRole('button', { name: 'Suivant' }))

    expect(screen.getByText(/aucun comptage ne sera enregistré/)).toBeInTheDocument()
    expect(screen.queryByText(/Combien restait-il/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enregistrer l’achat' }))
    await waitFor(() => expect(state.calls).toHaveLength(1))
    expect(state.calls[0]?.priorStock).toBeNull()
  })

  /*
   * The equality case, and it is not an edge to trim (plan_review R3): a
   * standalone count sorts AFTER all purchases of its date, so an afternoon
   * delivery on the morning of a sweep would otherwise be ordered before that
   * sweep — dumping the delivery into the window that just closed and booking it
   * as sold at full markup on the day it arrived.
   */
  it('still asks the question when the purchase is dated ON the last count', async () => {
    state.lastCountOn = '2026-08-03'
    const user = userEvent.setup({ delay: null })
    renderPage()
    await fillDetails(user)

    expect(screen.getByText(/Tout le rayon/)).toBeInTheDocument()
    expect(screen.queryByText(/aucun comptage ne sera enregistré/)).not.toBeInTheDocument()
  })
})

describe('the plausibility check (domain-spec §3.2, plan §2.3c)', () => {
  it('blocks with Corriger as the primary action and writes nothing', async () => {
    state.verdict = 'exceeds_bound'
    const user = userEvent.setup({ delay: null })
    renderPage()
    await fillDetails(user)

    await user.click(screen.getByRole('button', { name: 'Il restait quelque chose' }))
    await user.type(screen.getByLabelText(/Valeur restante/), '50')
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’achat' }))

    const dialog = await screen.findByRole('dialog')
    // The figure is in the message: "implausible" is not actionable, "should
    // hold about 1 000" is.
    expect(dialog).toHaveTextContent(/devrait contenir environ/)
    expect(state.calls).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Corriger' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(state.calls).toHaveLength(0)
  })

  it('never prevents saving — the user may simply be right', async () => {
    state.verdict = 'suspicious_drop'
    const user = userEvent.setup({ delay: null })
    renderPage()
    await fillDetails(user)

    await user.click(screen.getByRole('button', { name: 'Il restait quelque chose' }))
    await user.type(screen.getByLabelText(/Valeur restante/), '50')
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’achat' }))

    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Enregistrer quand même' }))

    await waitFor(() => expect(state.calls).toHaveLength(1))
    expect(state.calls[0]?.priorStock).toBe(50)
  })
})

describe('idempotency (domain-spec §8.1, plan §2.12)', () => {
  it('reuses one request_id across retries of the same purchase', async () => {
    state.succeeds = false // every attempt "fails" — the retry path
    const user = userEvent.setup({ delay: null })
    renderPage()
    await fillDetails(user)

    await user.click(screen.getByRole('button', { name: 'Rien, le rayon était vide' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’achat' }))
    await waitFor(() => expect(state.calls).toHaveLength(1))

    // The shopkeeper presses save again on a bad connection.
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’achat' }))
    await waitFor(() => expect(state.calls).toHaveLength(2))

    // Same identifier: the second call replays the first from `write_request`
    // instead of writing a second purchase.
    expect(state.calls[1]?.requestId).toBe(state.calls[0]?.requestId)
  })

  it('takes a NEW request_id for the next purchase', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()

    await fillDetails(user)
    await user.click(screen.getByRole('button', { name: 'Rien, le rayon était vide' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’achat' }))
    await waitFor(() => expect(state.calls).toHaveLength(1))

    await fillDetails(user, '450')
    await user.click(screen.getByRole('button', { name: 'Rien, le rayon était vide' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’achat' }))
    await waitFor(() => expect(state.calls).toHaveLength(2))

    // Otherwise the second purchase would be swallowed by the first one's cache
    // entry and silently never recorded.
    expect(state.calls[1]?.requestId).not.toBe(state.calls[0]?.requestId)
    expect(state.calls[1]?.amount).toBe(450)
  })
})
