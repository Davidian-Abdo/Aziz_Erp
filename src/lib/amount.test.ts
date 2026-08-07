import { parseAmount } from './amount'

/*
 * What a shopkeeper actually types, on a French keyboard, on a phone.
 *
 * Every rejection here is a real entry refused, so the cases that must PASS
 * matter more than the ones that must fail: an app that will not accept
 * "1 250,50" is an app that gets abandoned for a paper notebook.
 */

describe('parseAmount', () => {
  it('reads a comma as a decimal separator', () => {
    expect(parseAmount('1250,50')).toEqual({ ok: true, value: 1250.5 })
  })

  // Written as escapes on purpose: both non-breaking spaces are invisible in an
  // editor, and a test whose input cannot be read is a test nobody can fix.
  it('ignores thousands separators, including the non-breaking spaces iOS inserts', () => {
    expect(parseAmount('1 250,50')).toEqual({ ok: true, value: 1250.5 })
    expect(parseAmount('1\u00a0250,50')).toEqual({ ok: true, value: 1250.5 })
    expect(parseAmount('1\u202f250,50')).toEqual({ ok: true, value: 1250.5 })
  })

  it('accepts a plain integer and a dot decimal', () => {
    expect(parseAmount('300')).toEqual({ ok: true, value: 300 })
    expect(parseAmount('300.25')).toEqual({ ok: true, value: 300.25 })
  })

  it('refuses a third decimal rather than letting Postgres round it away silently', () => {
    expect(parseAmount('10,005')).toEqual({ ok: false, error: 'too_precise' })
  })

  it('refuses text and negatives', () => {
    expect(parseAmount('abc')).toEqual({ ok: false, error: 'not_a_number' })
    expect(parseAmount('12abc')).toEqual({ ok: false, error: 'not_a_number' })
    expect(parseAmount('-5')).toEqual({ ok: false, error: 'negative' })
    expect(parseAmount('')).toEqual({ ok: false, error: 'empty' })
  })

  /*
   * The one asymmetry in the system: a purchase of 0 is not an event and the
   * table CHECK rejects it, while a count of 0 is a measurement — the shelf was
   * empty (domain-spec §3.1). Getting this backwards would either refuse a
   * legitimate empty shelf or accept a meaningless purchase.
   */
  it('rejects zero for money spent, accepts it for a count', () => {
    expect(parseAmount('0')).toEqual({ ok: false, error: 'not_positive' })
    expect(parseAmount('0', { allowZero: true })).toEqual({ ok: true, value: 0 })
    expect(parseAmount('0,00', { allowZero: true })).toEqual({ ok: true, value: 0 })
  })
})
