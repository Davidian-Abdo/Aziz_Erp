// The migration itself, read at build time by Vite rather than through `fs` —
// this test belongs to the app project, and application code has no filesystem.
import sql from '../../supabase/migrations/0003_transactions.sql?raw'
import { LOSS_REASONS } from '@/api/losses'

/*
 * `LOSS_REASONS` in the client is a COPY of `loss_nature()` in
 * 0003_transactions.sql. The SQL is the source of truth — every report is
 * computed from it — and the copy exists only so the loss form can group the
 * seven reasons under two headings and explain each one.
 *
 * A copy nobody checks is a copy that drifts, and this one would drift
 * silently in a specific, damaging way: the form would file "pris par la
 * famille" under the store's losses while the dashboard counted it as an owner
 * draw, teaching the user the opposite of what the numbers say.
 *
 * So it is pinned. If a future migration reclassifies a reason or adds one,
 * this fails and names it.
 */

/** The `in (...)` list from `loss_nature()`'s owner_draw branch. */
function ownerDrawReasonsFromSql(): string[] {
  const match = /when r in \(([^)]*)\) then 'owner_draw'/.exec(sql)
  if (!match?.[1]) throw new Error('could not find the owner_draw branch of loss_nature()')
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort()
}

/** The enum labels, so a reason added in SQL cannot go unoffered by the form. */
function reasonsFromSql(): string[] {
  const match = /create type loss_reason as enum \(([^)]*)\)/.exec(sql)
  if (!match?.[1]) throw new Error('could not find the loss_reason enum')
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort()
}

describe('the loss reasons the form offers match the database', () => {
  it('reads the migration it is meant to be pinned to', () => {
    // A bad path would otherwise turn both assertions below into no-ops.
    expect(sql).toMatch(/create type loss_reason as enum/)
  })

  it('offers exactly the reasons the enum defines', () => {
    const offered = LOSS_REASONS.map((r) => r.reason).sort()
    expect(offered).toEqual(reasonsFromSql())
  })

  it('classifies them exactly as loss_nature() does', () => {
    const ownerDraw = LOSS_REASONS.filter((r) => r.nature === 'owner_draw')
      .map((r) => r.reason)
      .sort()
    expect(ownerDraw).toEqual(ownerDrawReasonsFromSql())
  })
})
