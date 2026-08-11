import { z } from 'zod'

/*
 * What the write RPCs hand back (0012_write_rpcs.sql), parsed at the boundary
 * for the same reason `report.ts` exists: PostgREST returns `jsonb`, which the
 * type generator can only call `Json`, so without this every field below would
 * be `any`.
 *
 * `replayed` is the one that matters. It is the difference between "your
 * purchase was recorded" and "your purchase was already recorded and this was a
 * retry" — and a UI that cannot tell them apart is a UI that will eventually
 * tell the owner a duplicate was created when it was not, or the reverse.
 */

const pgUuid = z
  .string()
  .regex(/^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/, 'expected a uuid')

export const recordPurchaseResultSchema = z.object({
  purchase_id: pgUuid,
  /** Null when the purchase was backdated behind the last count (§3.2). */
  count_id: pgUuid.nullable(),
  replayed: z.boolean(),
})

export const recordSweepResultSchema = z.object({
  count_ids: z.array(pgUuid),
  n: z.number().int(),
  replayed: z.boolean(),
})

/*
 * `edit_purchase` (0014_edit_rpcs.sql).
 *
 * Deliberately NOT recordPurchaseResultSchema with `replayed` made optional.
 * There is no `replayed` here because an edit needs no idempotency key: it sets
 * fields to given values and converges on replay, where an insert would post the
 * money twice.
 *
 * `count_id` is nullable and the null case is real rather than defensive — it is
 * what an edit returns when it moves a purchase BEHIND the category's last count
 * and the embedded count is therefore deleted. Both branches are captured from
 * the database in `write-rpcs.captured.json`, because the last two times a
 * nullable field here was assumed rather than measured (`z.uuid()` in Phase 3,
 * the plausibility figures in Phase 4) the parse failed closed on data Postgres
 * was perfectly happy with.
 */
export const editPurchaseResultSchema = z.object({
  purchase_id: pgUuid,
  count_id: pgUuid.nullable(),
})

export type RecordPurchaseResult = z.infer<typeof recordPurchaseResultSchema>
export type RecordSweepResult = z.infer<typeof recordSweepResultSchema>
export type EditPurchaseResult = z.infer<typeof editPurchaseResultSchema>

/*
 * The plausibility verdict (domain-spec §3.2, plan §2.3c).
 *
 * It returns a document rather than a bare verdict so the form can say what it
 * expected: "vous avez saisi 50, mais ce rayon devrait contenir environ 1 000"
 * is actionable; "implausible" is not.
 */
export const plausibilityVerdictSchema = z.enum([
  'ok',
  'exceeds_bound',
  'high_outflow',
  'suspicious_drop',
])

export const plausibilitySchema = z.object({
  verdict: plausibilityVerdictSchema,
  entered: z.number(),
  /** Null when the category has never been counted — there is no bound yet. */
  expected_on_hand: z.number().nullable(),
  last_count_on: z.string().nullable(),
  days_since_last_count: z.number().int().nullable(),
  settled_windows: z.number().int(),
})

export type PlausibilityVerdict = z.infer<typeof plausibilityVerdictSchema>
export type Plausibility = z.infer<typeof plausibilitySchema>
