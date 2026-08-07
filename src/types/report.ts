import { z } from 'zod'

/*
 * The `report_period` document, described by hand and parsed at the boundary
 * (architecture-spec §5.5).
 *
 * Why this exists when `database.ts` is generated: PostgREST hands back a
 * `jsonb` column, and the generator can only type that as `Json`. Everything
 * inside this document — every KPI the owner reads — would otherwise be `any`.
 * A renamed key in a future migration would then render as `undefined`, or
 * worse, `NaN` after arithmetic, instead of failing.
 *
 * Strictness is deliberate. A figure that does not parse is NOT displayed:
 * a wrong number is worse than a missing one, because nobody notices
 * (plan §5.2).
 */

// Money crosses the wire as a JSON number, already rounded to 2 decimals by the
// engine (domain-spec §9.5 — rounded once, at emission). The app never rounds.
const money = z.number()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected an ISO date (YYYY-MM-DD)')

/*
 * Deliberately NOT Zod's own `uuid()`. It validates the RFC 4122 version and variant
 * bits; Postgres's `uuid` type validates only the 8-4-4-4-12 hex layout and
 * happily stores an id those bits reject. Anything the database will hand us
 * must parse here, or the app refuses to display a report over data the
 * database considers perfectly valid — which is exactly what happened the first
 * time this schema met a fixture ledger.
 */
const pgUuid = z
  .string()
  .regex(/^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/, 'expected a uuid')

export const anomalyKindSchema = z.enum(['negative_outflow', 'losses_exceed_outflow', 'no_markup'])
export const coverageLevelSchema = z.enum(['good', 'partial', 'low'])
export const chargeNatureSchema = z.enum(['operating', 'owner_draw'])

export const reportPeriodSchema = z.object({
  period: z.object({
    from: isoDate,
    to: isoDate,
    // `B_eff` — the requested end clamped to today (plan §2.2). The label shown
    // to the user reads the requested range; this is what was actually computed.
    effective_to: isoDate,
    clamped: z.boolean(),
    days: z.number().int(),
  }),

  /** Things that happened. Rendered plain. */
  measured: z.object({
    purchases_total: money,
    operating_charges: money,
    owner_draws_cash: money,
    shrinkage_losses: money,
    owner_draws_in_kind: money,
    cash_out: money,
  }),

  /** Things inferred from a markup. Rendered with `≈` (domain-spec §7.2). */
  modelled: z.object({
    goods_sold_at_cost: money,
    revenue_est: money,
    gross_profit_est: money,
    operating_profit_est: money,
    net_cash_change_est: money,
    cost_incurred: money,
  }),

  coverage: z.object({
    pct: z.number(),
    level: coverageLevelSchema,
    categories_never_counted: z.array(z.string()),
    categories_stale: z.array(
      z.object({
        category_id: pgUuid,
        name: z.string(),
        days: z.number().int(),
      }),
    ),
    unsettled_purchases: money,
    anomalies: z.array(
      z.object({
        category_id: pgUuid,
        category: z.string(),
        kind: anomalyKindSchema,
        open_on: isoDate,
        close_on: isoDate,
        goods_sold_at_cost: money,
      }),
    ),
  }),

  by_category: z.array(
    z.object({
      category_id: pgUuid,
      name: z.string(),
      last_count_value: money.nullable(),
      last_count_on: isoDate.nullable(),
      days_since_count: z.number().int().nullable(),
      purchases_in_period: money,
      losses_in_period: money,
      markup_pct: z.number().nullable(),
      goods_sold_at_cost: money,
      revenue_est: money,
      gross_profit_est: money,
      coverage_pct: z.number(),
      settled_days: z.number().int(),
      unsettled_purchases: money,
    }),
  ),

  charges_by_category: z.array(
    z.object({
      charge_category_id: pgUuid,
      name: z.string(),
      nature: chargeNatureSchema,
      amount: money,
    }),
  ),

  stock_on_hand: z.object({
    total_last_counted: money,
    oldest_count_on: isoDate.nullable(),
    max_possible: money,
  }),
})

export const reportTrendSchema = z.array(
  z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    from: isoDate,
    to: isoDate,
    effective_to: isoDate,
    goods_sold_at_cost: money,
    revenue_est: money,
    gross_profit_est: money,
    operating_charges: money,
    operating_profit_est: money,
    net_cash_change_est: money,
    cash_out: money,
    coverage_pct: z.number(),
  }),
)

export type ReportPeriod = z.infer<typeof reportPeriodSchema>
export type ReportTrend = z.infer<typeof reportTrendSchema>
export type CategoryRow = ReportPeriod['by_category'][number]
export type CoverageLevel = z.infer<typeof coverageLevelSchema>
export type AnomalyKind = z.infer<typeof anomalyKindSchema>
