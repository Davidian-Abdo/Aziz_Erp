import { addDays, daysBetween, formatDateShort, todayInTimezone } from './dates'

describe('todayInTimezone', () => {
  /*
   * The bug this exists to prevent: the shop is UTC+1, so at 00:30 local it is
   * still 23:30 UTC on the previous day. A date taken from
   * `new Date().toISOString()` would silently label an entry with yesterday —
   * and yesterday may sit inside a count window that is already closed, where
   * the purchase becomes goods sold at full markup on a day it never arrived.
   */
  it('reads the store’s date, not UTC’s, across midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-03T23:30:00Z'))

    expect(todayInTimezone('UTC')).toBe('2026-08-03')
    expect(todayInTimezone('Africa/Casablanca')).toBe('2026-08-04')

    vi.useRealTimers()
  })
})

describe('addDays', () => {
  it('shifts whole days without touching a timezone', () => {
    expect(addDays('2026-08-03', -1)).toBe('2026-08-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('daysBetween', () => {
  it('counts days across a DST change, since business dates have no clocks in them', () => {
    // Morocco moves its clock during Ramadan; a date-only subtraction must not
    // notice.
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30)
    expect(daysBetween('2026-08-03', '2026-08-03')).toBe(0)
  })
})

describe('formatDateShort', () => {
  it('renders in French', () => {
    expect(formatDateShort('2026-08-03')).toMatch(/3 ao/)
  })

  it('passes through anything that is not an ISO date rather than throwing', () => {
    expect(formatDateShort('')).toBe('')
  })
})
