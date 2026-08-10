import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import problems from '@/test/fixtures/report_period.problems.json'
import worked from '@/test/fixtures/report_period.worked-example.json'
import trendFixture from '@/test/fixtures/report_trend.captured.json'
import { reportPeriodSchema, reportTrendSchema } from '@/types/report'
import { DashboardPage } from './DashboardPage'

/*
 * The dashboard (domain-spec §7.1).
 *
 * Both documents below are REAL `report_period` output, captured from a
 * database, parsed here through the same schema the app uses. That matters more
 * on this screen than anywhere else: the dashboard renders roughly forty
 * figures, and a hand-written fixture would only ever prove that the component
 * agrees with the fixture's author about what the engine returns.
 *
 * What is worth testing here is not that a number appears. It is:
 *   - that every modelled figure carries its ≈ and every measured one does not,
 *     because that distinction is the only thing standing between an estimate
 *     and a claim about the shop's takings (§7.2);
 *   - that the totals on screen are the engine's totals, not sums computed here;
 *   - that a period with problems SAYS SO, prominently, with a way to fix it.
 */

const WORKED = reportPeriodSchema.parse(worked)
const PROBLEMS = reportPeriodSchema.parse(problems)
const TREND = reportTrendSchema.parse(trendFixture)

const state = vi.hoisted(() => ({
  report: null as unknown,
  requested: [] as { from: string; to: string }[],
}))

vi.mock('@/api/settings', () => ({
  // The store's today, not the device's: every preset is computed from it.
  useStoreToday: () => '2026-08-07',
}))

vi.mock('@/api/report', () => ({
  useReportPeriod: (from: string, to: string) => {
    state.requested.push({ from, to })
    return { isPending: false, isError: false, data: state.report }
  },
  useReportTrend: () => ({ isPending: false, isError: false, data: TREND }),
}))

function renderDashboard(report: unknown = WORKED) {
  state.report = report
  state.requested = []
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.requested = []
})

describe('the KPI row', () => {
  it('marks every modelled figure with ≈ and leaves every measured one plain', () => {
    renderDashboard()
    const kpis = screen.getByRole('region', { name: 'Chiffres clés' })

    // Revenue, gross profit and operating profit are inferred from a markup the
    // shop may not actually charge. Charges, cash out and stock were counted.
    for (const label of ['Chiffre d’affaires', 'Marge brute', 'Résultat d’exploitation']) {
      const tile = within(kpis).getByText(label).closest('div')!
      expect(tile.querySelector('[data-kind="modelled"]')).not.toBeNull()
      expect(tile.querySelector('[data-kind="measured"]')).toBeNull()
      expect(tile.textContent).toContain('≈')
    }

    for (const label of ['Charges d’exploitation', 'Sorties d’argent', 'Stock en rayon']) {
      const tile = within(kpis).getByText(label).closest('div')!
      expect(tile.querySelector('[data-kind="measured"]')).not.toBeNull()
      expect(tile.querySelector('[data-kind="modelled"]')).toBeNull()
      expect(tile.textContent).not.toContain('≈')
    }
  })

  /*
   * domain-spec §6.8: stock "today" is not knowable. The counted figure is the
   * figure; the bound is a bound and has to say so in words, or it reads as a
   * balance the shop does not have.
   */
  it('shows stock on hand as a count with an upper bound beside it, not as one number', () => {
    renderDashboard()
    const kpis = screen.getByRole('region', { name: 'Chiffres clés' })
    const tile = within(kpis).getByText('Stock en rayon').closest('div')!

    expect(within(tile).getByText(/au plus/)).toBeInTheDocument()
    expect(within(tile).getByText(/Comptage le plus ancien/)).toBeInTheDocument()
  })
})

describe('the profit waterfall', () => {
  /*
   * Every line is printed as the engine emitted it. The intermediate balance
   * between operating charges and shrinkage is deliberately NOT shown, because
   * `report_period` does not publish it and inventing it here would put a
   * number on screen that no test in the pgTAP suite covers.
   */
  it('prints the chain from revenue to net cash change, all from the document', () => {
    renderDashboard()
    const section = screen.getByRole('region', { name: 'Du chiffre d’affaires au résultat' })

    for (const row of [
      'Chiffre d’affaires estimé',
      'Coût des marchandises vendues',
      'Marge brute',
      'Charges d’exploitation',
      'Pertes du magasin',
      'Résultat d’exploitation',
      'Argent pris par le gérant',
      'Marchandise prise par le gérant',
      'Variation de trésorerie',
    ]) {
      expect(within(section).getByRole('rowheader', { name: row })).toBeInTheDocument()
    }
  })

  // §6.7 — cash out and cost incurred differ by the change in stock, and a
  // dashboard showing only one of them misleads in a predictable direction.
  it('shows both meanings of "spent" side by side', () => {
    renderDashboard()
    const section = screen.getByRole('region', { name: 'Du chiffre d’affaires au résultat' })

    expect(within(section).getByText('Sorties d’argent')).toBeInTheDocument()
    expect(within(section).getByText('Coût de la période')).toBeInTheDocument()
  })
})

describe('stock by category', () => {
  it('adds up to the same totals the KPI row shows, taken from the same document', () => {
    renderDashboard()
    const table = within(screen.getByRole('region', { name: 'Stock par rayon' })).getByRole('table')
    const footer = within(table).getByRole('row', { name: /^Total/ })

    // The worked example: 5 625,00 goods sold and 1 125,00 gross profit — the
    // exact figures the whole plan is sequenced around (plan §2.1). A table
    // that did not add up to the headline would destroy trust in both.
    expect(within(footer).getByText(/5[\s ]?625,00/)).toBeInTheDocument()
    expect(within(footer).getByText(/1[\s ]?125,00/)).toBeInTheDocument()
  })

  it('shows a category with no markup as absent rather than as zero percent', () => {
    renderDashboard(PROBLEMS)
    const table = within(screen.getByRole('region', { name: 'Stock par rayon' })).getByRole('table')
    const row = within(table).getByRole('row', { name: /Surgelés/ })

    // 0 % would be a markup of zero — a shelf sold at cost. There is no rate at
    // all, and the two are not the same statement.
    expect(within(row).queryByText('0 %')).toBeNull()
    expect(within(row).getByTitle(/aucune marge/)).toBeInTheDocument()
  })

  it('names a never-counted shelf instead of printing a zero for it', () => {
    renderDashboard(PROBLEMS)
    const table = within(screen.getByRole('region', { name: 'Stock par rayon' })).getByRole('table')
    const row = within(table).getByRole('row', { name: /Fruits et légumes/ })

    expect(within(row).getByText('jamais compté')).toBeInTheDocument()
  })
})

describe('the charges breakdown', () => {
  /*
   * The separation is the section. An owner draw is not a cost of trading, and
   * a shopkeeper reading one list of numbers will conclude the shop had a bad
   * month when what actually happened is that they took money out of it.
   */
  it('keeps the shop’s expenses and the owner’s draws visually apart', () => {
    renderDashboard(PROBLEMS)
    const section = screen.getByRole('region', { name: 'Dépenses' })

    const operating = within(section).getByText('Dépenses du magasin').closest('div')!
    expect(within(operating).getByText('Loyer')).toBeInTheDocument()
    expect(within(operating).queryByText('Dépenses familiales')).toBeNull()

    const draws = within(section).getByText('Argent pris par le gérant').closest('div')!
    expect(within(draws).getByText('Dépenses familiales')).toBeInTheDocument()
    expect(within(draws).queryByText('Loyer')).toBeNull()
  })

  // Goods taken home are an owner draw AND a loss row. Listing them among the
  // charges would count them twice (§6.6); leaving them out entirely would
  // answer "what did I take out of the shop" with half the truth.
  it('shows goods taken home apart from both lists', () => {
    renderDashboard(PROBLEMS)
    const section = screen.getByRole('region', { name: 'Dépenses' })

    expect(within(section).getByText('Marchandise prise par le gérant')).toBeInTheDocument()
  })
})

describe('the data quality panel', () => {
  /*
   * §7.1: "always visible, never collapsed away when problems exist". This is
   * the section that keeps the rest of the screen honest — a modelled profit
   * over a period that is 10% counted is a number with almost no evidence
   * behind it, and nothing else on the dashboard says so.
   */
  it('names every problem in the period, of all four kinds', () => {
    renderDashboard(PROBLEMS)
    const panel = screen.getByRole('region', { name: 'Fiabilité des chiffres' })

    // A French comma, like every other number on the screen. A dashboard that
    // writes "10,20 MAD" beside "10.2 %" looks like two applications.
    expect(within(panel).getByText(/^10,2 %/)).toBeInTheDocument()

    // Never counted, stale, unsettled, and each of the three anomaly kinds.
    // A shelf can be named twice — Tabac is both stale AND carrying unsettled
    // purchases — and both statements are true and separately actionable.
    expect(within(panel).getByText(/Fruits et légumes — comptez ce rayon/)).toBeInTheDocument()
    expect(within(panel).getByText(/Tabac — dernier comptage il y a 61 jours/)).toBeInTheDocument()
    // Three shelves carry an unsettled tail: Épicerie sèche, Tabac, and Fruits
    // et légumes, which has never been counted at all and says so differently.
    expect(within(panel).getAllByText(/achetés depuis le comptage du/)).toHaveLength(2)
    expect(within(panel).getByText(/sur un rayon jamais compté/)).toBeInTheDocument()
    expect(within(panel).getByText(/le stock a augmenté plus que les achats/)).toBeInTheDocument()
    expect(within(panel).getByText(/les pertes déclarées dépassent/)).toBeInTheDocument()
    expect(within(panel).getByText(/aucune marge n’est configurée/)).toBeInTheDocument()
  })

  it('links each problem to the screen that fixes it', () => {
    renderDashboard(PROBLEMS)
    const panel = screen.getByRole('region', { name: 'Fiabilité des chiffres' })

    // A stale shelf is fixed by counting it, and the link carries the category
    // so the form arrives ready. A warning the owner has to act on from memory
    // is a warning they learn to scroll past.
    const stale = within(panel).getByRole('link', { name: /dernier comptage il y a 61 jours/ })
    expect(stale).toHaveAttribute('href', '/counts?category=a0000000-0000-4000-8000-000000000005')

    // A never-counted category arrives as a NAME only — the id for the link is
    // matched back through `by_category`, where the same shelf also appears.
    const never = within(panel).getByRole('link', { name: /Fruits et légumes — comptez/ })
    expect(never).toHaveAttribute('href', '/counts?category=a0000000-0000-4000-8000-000000000006')

    // A missing markup is not fixed by counting anything.
    const noMarkup = within(panel).getByRole('link', { name: /aucune marge/ })
    expect(noMarkup).toHaveAttribute('href', '/settings')
  })

  it('says so plainly when there is nothing wrong', () => {
    renderDashboard()
    const panel = screen.getByRole('region', { name: 'Fiabilité des chiffres' })

    expect(within(panel).getByText(/Rien à signaler/)).toBeInTheDocument()
  })
})

describe('the period selector', () => {
  it('drives the report, from the store’s today rather than the device’s', async () => {
    const user = userEvent.setup({ delay: null })
    renderDashboard()

    expect(state.requested.at(-1)).toEqual({ from: '2026-08-01', to: '2026-08-31' })

    await user.click(screen.getByRole('tab', { name: 'Le mois dernier' }))
    expect(state.requested.at(-1)).toEqual({ from: '2026-07-01', to: '2026-07-31' })

    await user.click(screen.getByRole('tab', { name: 'Cette année' }))
    expect(state.requested.at(-1)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })

  it('never queries a custom range whose end is before its start', async () => {
    const user = userEvent.setup({ delay: null })
    renderDashboard()

    const before = state.requested.at(-1)
    await user.clear(screen.getByLabelText('Au'))
    await user.type(screen.getByLabelText('Au'), '2026-01-01')

    expect(screen.getByText(/La date de fin doit être postérieure/)).toBeInTheDocument()
    // A half-typed range must not come back looking exactly like a report.
    expect(state.requested.at(-1)).toEqual(before)
  })
})

/*
 * The chart is code-split (recharts is 385 kB), so these await it. That is also
 * the assertion that it still arrives: a lazy chunk that fails to resolve
 * renders the Suspense fallback forever and looks like a slow network.
 */
describe('the trend', () => {
  it('reads the exact monthly figures in a table, not only as a line', async () => {
    renderDashboard()
    const section = await screen.findByRole(
      'region',
      { name: 'Évolution sur 12 mois' },
      { timeout: 10000 },
    )
    const table = within(section).getByRole('table')

    // Twelve months plus the header row.
    expect(within(table).getAllByRole('row')).toHaveLength(13)
  })

  it('marks the current month as in progress rather than as a collapse in trade', async () => {
    renderDashboard()
    const section = await screen.findByRole(
      'region',
      { name: 'Évolution sur 12 mois' },
      { timeout: 10000 },
    )

    expect(within(section).getByText('(en cours)')).toBeInTheDocument()
  })
})

describe('the period heading', () => {
  it('says when the requested period was cut short at today', () => {
    // The engine clamps a period whose end is in the future and reports it
    // (plan §2.2). "This month" three days in is not a bad month.
    renderDashboard({
      ...WORKED,
      period: { ...WORKED.period, to: '2026-08-31', effective_to: '2026-08-07', clamped: true },
    })

    expect(screen.getByText(/arrêté au 7 août 2026/)).toBeInTheDocument()
  })
})
