import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

/*
 * Business dates (domain-spec §9.1: `occurred_on` is a date, `created_at` is a
 * timestamp, and they are never conflated).
 *
 * "Today" is the SHOP's today, not the browser's and not UTC. The shop is
 * UTC+1, so between midnight and 01:00 local `new Date().toISOString()` still
 * reads yesterday — a purchase entered at 00:30 would be silently dated to the
 * previous day, landing in a window that may already be closed. The server has
 * the same problem in reverse and solves it with `store_today()` (plan §2.6);
 * this is the client half of that rule.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Today in the store's timezone, as `YYYY-MM-DD`. */
export function todayInTimezone(timezone: string): string {
  // `en-CA` formats as YYYY-MM-DD, which is the ISO layout Postgres wants.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Shifts an ISO date by whole days, without ever touching a timezone. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  // UTC arithmetic on a date-only value: no local offset can move the result.
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)
  return new Date(t).toISOString().slice(0, 10)
}

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value)
}

/** "3 août 2026" — for reading back what was entered. */
export function formatDate(isoDate: string): string {
  if (!isIsoDate(isoDate)) return isoDate
  return format(parseISO(isoDate), 'd MMMM yyyy', { locale: fr })
}

/** "3 août" — the compact form, for dense lists. */
export function formatDateShort(isoDate: string): string {
  if (!isIsoDate(isoDate)) return isoDate
  return format(parseISO(isoDate), 'd MMM', { locale: fr })
}

/** Whole days between two ISO dates, `to - from`. Used only for wording. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const a = Date.UTC(fy ?? 1970, (fm ?? 1) - 1, fd ?? 1)
  const b = Date.UTC(ty ?? 1970, (tm ?? 1) - 1, td ?? 1)
  return Math.round((b - a) / 86_400_000)
}
