import empty from '@/test/fixtures/report_period.sample.json'
import problems from '@/test/fixtures/report_period.problems.json'
import worked from '@/test/fixtures/report_period.worked-example.json'
import trend from '@/test/fixtures/report_trend.captured.json'
import { reportPeriodSchema, reportTrendSchema } from './report'

/*
 * The boundary parse (architecture-spec §5.5).
 *
 * Both fixtures are REAL output, captured from the Supabase project by calling
 * `report_period` — not hand-written to match the schema, which would only
 * prove the schema agrees with itself. If a future migration renames a key,
 * these fail, and that is the entire point: the alternative is `undefined`
 * rendering silently where a figure belongs.
 */
describe('reportPeriodSchema', () => {
  it('accepts the normative worked example of domain-spec §10', () => {
    const r = reportPeriodSchema.parse(worked)

    // The gate the whole plan is sequenced around, asserted once more on the
    // app's side of the wire (plan §2.1).
    expect(r.modelled.goods_sold_at_cost).toBe(5625)
    expect(r.modelled.revenue_est).toBe(6750)
    expect(r.modelled.gross_profit_est).toBe(1125)
    expect(r.coverage.pct).toBe(100)
    expect(r.by_category[0]?.markup_pct).toBe(20)
  })

  it('accepts an empty period, where every figure is zero rather than null', () => {
    const r = reportPeriodSchema.parse(empty)
    expect(r.modelled.revenue_est).toBe(0)
    expect(r.measured.cash_out).toBe(0)
    // A category that has never been counted has no date, and that is a null —
    // the distinction the <Money> em dash exists for.
    expect(r.by_category[0]?.last_count_on).toBeNull()
  })

  it('carries the clamp of the requested end to today (plan §2.2)', () => {
    const r = reportPeriodSchema.parse(empty)
    expect(r.period.clamped).toBe(true)
    expect(r.period.effective_to <= r.period.to).toBe(true)
  })

  it('rejects a document whose key was renamed rather than parsing around it', () => {
    const drifted = structuredClone(worked) as Record<string, unknown> & {
      modelled: Record<string, unknown>
    }
    drifted.modelled.gross_profit = drifted.modelled.gross_profit_est
    delete drifted.modelled.gross_profit_est

    expect(() => reportPeriodSchema.parse(drifted)).toThrow()
  })

  /*
   * Until Phase 5 the schema had only ever met documents with EMPTY
   * `anomalies` and `categories_stale` arrays — both fixtures above have
   * nothing wrong with them. An array schema that is only ever handed `[]`
   * proves nothing about the objects inside it, and the data quality panel is
   * the one section that exists purely to render those objects: the first time
   * the shop actually mistyped a count, the whole dashboard would have gone to
   * the "figures unreadable" branch. Captured from a real ledger, not written.
   */
  it('accepts a period that has problems in it — the arrays the empty ones never fill', () => {
    const r = reportPeriodSchema.parse(problems)

    expect(r.coverage.level).toBe('low')
    expect(r.coverage.anomalies.map((a) => a.kind)).toEqual([
      'negative_outflow',
      'losses_exceed_outflow',
      'no_markup',
    ])
    // Surfaced, never clamped: an impossible window keeps its negative figure.
    expect(r.coverage.anomalies[0]?.goods_sold_at_cost).toBeLessThan(0)
    expect(r.coverage.categories_stale[0]?.days).toBe(61)
    expect(r.coverage.categories_never_counted).toEqual(['Fruits et légumes'])
    // A category with no markup row at all — the field is null, not zero, and a
    // zero here would be a 0% markup rather than an absent one.
    expect(r.by_category.find((c) => c.name === 'Surgelés')?.markup_pct).toBeNull()
  })

  it('rejects money arriving as a string, which would concatenate rather than add', () => {
    const drifted = structuredClone(worked) as Record<string, unknown> & {
      measured: Record<string, unknown>
    }
    drifted.measured.cash_out = '2200.00'

    expect(() => reportPeriodSchema.parse(drifted)).toThrow()
  })
})

/*
 * `report_trend` is what the dashboard's 12-month chart reads, and it had no
 * boundary test at all before Phase 5 — the schema existed and had never met
 * the function's output.
 */
describe('reportTrendSchema', () => {
  it('accepts the captured 12-month series', () => {
    const rows = reportTrendSchema.parse(trend)

    expect(rows).toHaveLength(12)
    // Oldest first, ending with the month that contains today (migration 0011).
    expect(rows[0]!.month < rows[11]!.month).toBe(true)
  })

  it('marks the current month as partial rather than as a collapse in trade', () => {
    const rows = reportTrendSchema.parse(trend)
    const last = rows[rows.length - 1]!

    // report_period clamped the month's end to today, and `effective_to`
    // carries that through. Without it the final point of every chart is a
    // cliff, on every day of the month except the last.
    expect(last.effective_to < last.to).toBe(true)
  })
})
