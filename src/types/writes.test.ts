import captured from '@/test/fixtures/write-rpcs.captured.json'
import { plausibilitySchema, recordPurchaseResultSchema, recordSweepResultSchema } from './writes'

/*
 * The boundary parsers, tested against what the DATABASE actually returns.
 *
 * `write-rpcs.captured.json` is the literal output of `record_purchase`,
 * `record_count_sweep`, `check_count_plausibility` and `expected_on_hand`,
 * captured from a real database (see `current_state.md`, Entry 6) — not
 * hand-written. A hand-written fixture would only prove these schemas agree
 * with themselves.
 *
 * This matters because the schemas fail CLOSED: a document that does not parse
 * is not displayed and the write reports an error. That is the right default for
 * money, and it is also how a strict schema turns a working RPC into a broken
 * screen — which is exactly what `z.uuid()` did in Phase 3, rejecting ids
 * Postgres considers valid.
 */

describe('record_purchase', () => {
  it('parses a purchase written with its embedded count', () => {
    const result = recordPurchaseResultSchema.parse(captured.record_purchase)
    expect(result.replayed).toBe(false)
    expect(result.count_id).not.toBeNull()
  })

  it('parses a replay, and the replay names the SAME rows', () => {
    const first = recordPurchaseResultSchema.parse(captured.record_purchase)
    const replay = recordPurchaseResultSchema.parse(captured.record_purchase_replayed)

    expect(replay.replayed).toBe(true)
    // The whole point of `write_request`: the second call did not write a second
    // purchase, it returned the first one. If these ids ever differ, the retry
    // posted the money twice.
    expect(replay.purchase_id).toBe(first.purchase_id)
    expect(replay.count_id).toBe(first.count_id)
  })

  it('parses a backdated purchase, whose count_id is null', () => {
    const result = recordPurchaseResultSchema.parse(captured.record_purchase_backdated)
    // domain-spec §3.2: behind the last count, no count is attached at all. A
    // schema that required a uuid here would refuse a legitimate purchase.
    expect(result.count_id).toBeNull()
  })
})

describe('record_count_sweep', () => {
  it('parses a sweep and a single count through the same schema', () => {
    expect(recordSweepResultSchema.parse(captured.record_count_sweep).n).toBe(2)
    expect(recordSweepResultSchema.parse(captured.record_count_sweep_single).n).toBe(1)
  })

  it('parses a replayed sweep', () => {
    const first = recordSweepResultSchema.parse(captured.record_count_sweep)
    const replay = recordSweepResultSchema.parse(captured.record_count_sweep_replayed)

    expect(replay.replayed).toBe(true)
    expect(replay.count_ids).toEqual(first.count_ids)
    // Note the replay was sent ONE count and got TWO back: the cache answers with
    // the original result, whatever the retry happened to contain.
    expect(replay.n).toBe(2)
  })
})

describe('check_count_plausibility', () => {
  it('parses the ok verdict', () => {
    const result = plausibilitySchema.parse(captured.plausibility_ok)
    expect(result.verdict).toBe('ok')
    expect(result.expected_on_hand).toBe(900)
  })

  it('parses a verdict that carries the expected figure the dialog shows', () => {
    const result = plausibilitySchema.parse(captured.plausibility_exceeds_bound)
    expect(result.verdict).toBe('exceeds_bound')
    // "vous avez saisi 99 999, mais ce rayon devrait contenir environ 900" —
    // the message is only actionable because both numbers are in the document.
    expect(result.entered).toBe(99999)
    expect(result.expected_on_hand).toBe(900)
  })

  /*
   * A never-counted category has NO bound, so `expected_on_hand` and
   * `days_since_last_count` are both null and the verdict is `ok` — there is
   * nothing to be implausible against. The opening sweep of §3.5 lands here for
   * every shelf, so a schema that required numbers would make onboarding
   * unusable: the first count of the shop's life would fail to parse.
   */
  it('parses a never-counted category, whose figures are null', () => {
    const result = plausibilitySchema.parse(captured.plausibility_never_counted)
    expect(result).toMatchObject({
      verdict: 'ok',
      expected_on_hand: null,
      last_count_on: null,
      days_since_last_count: null,
    })
  })
})

describe('expected_on_hand', () => {
  it('is a number when the shelf has been counted, and null when it has not', () => {
    expect(captured.expected_on_hand).toBe(900)
    expect(captured.expected_on_hand_never_counted).toBeNull()
  })
})
