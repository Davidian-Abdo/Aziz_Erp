/*
 * Reading an amount the user typed on a phone.
 *
 * This is input parsing, not accounting: it turns text into the number that is
 * sent to the database, and nothing here ever combines two amounts.
 * architecture-spec §1.2 forbids the arithmetic, not the keyboard.
 *
 * The French keyboard produces a comma, and iOS inserts a narrow no-break space
 * as a thousands separator when the field is re-rendered. Both must read as the
 * number the user meant, or a perfectly correct entry is rejected as invalid.
 */

export type AmountError = 'empty' | 'not_a_number' | 'negative' | 'too_precise' | 'not_positive'

export type AmountResult = { ok: true; value: number } | { ok: false; error: AmountError }

/**
 * Every space character a phone keyboard or an auto-formatter can produce.
 * `\s` already covers U+00A0 and U+202F — the non-breaking spaces iOS inserts
 * as thousands separators — so listing them individually only invited an
 * invisible character into the source.
 */
const SEPARATORS = /[\s']/g

/**
 * `allowZero` distinguishes the two kinds of amount in this system:
 * a count of 0 is meaningful — the shelf was empty (domain-spec §3.1) — while a
 * purchase, charge or loss of 0 is not an event, and the table CHECKs say so.
 */
export function parseAmount(input: string, { allowZero = false } = {}): AmountResult {
  const cleaned = input.replace(SEPARATORS, '').replace(',', '.')

  if (cleaned === '') return { ok: false, error: 'empty' }
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return { ok: false, error: 'not_a_number' }

  const value = Number.parseFloat(cleaned)
  if (!Number.isFinite(value)) return { ok: false, error: 'not_a_number' }
  if (value < 0) return { ok: false, error: 'negative' }
  if (!allowZero && value === 0) return { ok: false, error: 'not_positive' }

  // Money is `numeric(14,2)` (domain-spec §9.1). A third decimal would be
  // rounded away by Postgres without anyone being told, so it is refused here
  // where the user can still see what they typed.
  const decimals = cleaned.split('.')[1]
  if (decimals !== undefined && decimals.length > 2) return { ok: false, error: 'too_precise' }

  return { ok: true, value }
}
