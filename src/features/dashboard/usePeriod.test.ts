import { presetRange } from './usePeriod'

/*
 * The period presets (domain-spec §7.1).
 *
 * These are pure date arithmetic on the STORE's today, and every one of them is
 * a boundary the whole dashboard is computed over: get "last month" wrong on a
 * 31st and the owner reads February's figures under January's heading, with
 * nothing on screen saying so.
 */
describe('presetRange', () => {
  it('gives the calendar month, quarter and year around the store today', () => {
    const today = '2026-08-07'

    expect(presetRange('thisMonth', today)).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    expect(presetRange('lastMonth', today)).toEqual({ from: '2026-07-01', to: '2026-07-31' })
    expect(presetRange('thisQuarter', today)).toEqual({ from: '2026-07-01', to: '2026-09-30' })
    expect(presetRange('thisYear', today)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })

  /*
   * The classic off-by-a-month: subtracting a month from the 31st lands on a
   * shorter month, and a naive implementation then reports 1–28 February as
   * "last month" while March is still running.
   */
  it('gives the whole of February from the 31st of March', () => {
    expect(presetRange('lastMonth', '2026-03-31')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
  })

  it('crosses the year boundary in January', () => {
    expect(presetRange('lastMonth', '2026-01-15')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    })
  })

  /*
   * A preset ends on the CALENDAR end, even when that is in the future.
   * `report_period` clamps it to today and reports `period.clamped`, which is
   * what the heading renders. Clamping here instead would silently hide from
   * the owner that the month is not over yet — the figures would be labelled as
   * a full month and be nothing of the kind.
   */
  it('does not clamp the end of a running month — that is the engine’s job', () => {
    expect(presetRange('thisMonth', '2026-08-07').to).toBe('2026-08-31')
  })
})
