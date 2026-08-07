import { useMemo, useState } from 'react'
import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subMonths,
} from 'date-fns'
import { useStoreToday } from '@/api/settings'
import { isIsoDate } from '@/lib/dates'

/*
 * The period the whole dashboard is computed over (domain-spec §7.1).
 *
 * Every boundary is derived from the STORE's today, never from `new Date()`.
 * The shop is UTC+1: between midnight and 01:00 local, the device's UTC date is
 * still yesterday, and on the first of a month that puts "this month" one whole
 * month behind — the owner would open the app and read last month's figures
 * under this month's heading. Same rule as every date field on every entry
 * screen (plan §2.6), applied to the screen that reports rather than writes.
 *
 * The end of a preset is the calendar end, deliberately, even when it is in the
 * future: `report_period` clamps it to today and says so through
 * `period.clamped`, which is what the header renders. Clamping here instead
 * would hide from the owner that the month is not over.
 */

export const PERIOD_PRESETS = ['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear'] as const

export type PresetKey = (typeof PERIOD_PRESETS)[number]
export type PeriodKey = PresetKey | 'custom'

export type PeriodRange = { from: string; to: string }

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

/** The calendar range of a preset, relative to the store's today. */
export function presetRange(preset: PresetKey, storeToday: string): PeriodRange {
  const today = parseISO(storeToday)

  switch (preset) {
    case 'thisMonth':
      return { from: iso(startOfMonth(today)), to: iso(endOfMonth(today)) }
    case 'lastMonth': {
      const m = subMonths(today, 1)
      return { from: iso(startOfMonth(m)), to: iso(endOfMonth(m)) }
    }
    case 'thisQuarter':
      return { from: iso(startOfQuarter(today)), to: iso(endOfQuarter(today)) }
    case 'thisYear':
      return { from: iso(startOfYear(today)), to: iso(endOfYear(today)) }
  }
}

export type Period = {
  key: PeriodKey
  /** The range to report over. Only ever a valid one — see `invalid`. */
  range: PeriodRange
  /** The custom inputs as typed, which may be mid-edit and not yet a range. */
  draft: PeriodRange
  /** A custom range whose start is after its end. Nothing is queried. */
  invalid: boolean
  selectPreset: (preset: PresetKey) => void
  setCustomFrom: (value: string) => void
  setCustomTo: (value: string) => void
}

function isValid(range: PeriodRange): boolean {
  return isIsoDate(range.from) && isIsoDate(range.to) && range.from <= range.to
}

export function usePeriod(defaultPreset: PresetKey = 'thisMonth'): Period {
  const storeToday = useStoreToday()

  const initial = useMemo(() => presetRange(defaultPreset, storeToday), [defaultPreset, storeToday])

  const [key, setKey] = useState<PeriodKey>(defaultPreset)
  /*
   * `applied` is the last range that was actually reported on; `draft` is what
   * the custom fields currently hold, which may be mid-edit.
   *
   * They are separate because a date input emits a change on every keystroke,
   * and "2026-0" is not a period. Querying the draft would send half-typed
   * ranges to the server, and — worse — the answer would come back looking
   * exactly like a report: a screen full of confident figures over a range
   * nobody asked for.
   */
  const [applied, setApplied] = useState<PeriodRange | null>(null)
  const [draft, setDraft] = useState<PeriodRange | null>(null)

  const range = applied ?? initial
  const current = draft ?? range
  const invalid = key === 'custom' && !isValid(current)

  function editCustom(next: PeriodRange) {
    setKey('custom')
    setDraft(next)
    // An invalid draft leaves the applied range alone, so the figures on screen
    // stay the ones whose period the heading names.
    if (isValid(next)) setApplied(next)
  }

  return {
    key,
    range,
    draft: current,
    invalid,
    selectPreset: (next) => {
      setKey(next)
      setDraft(null)
      setApplied(presetRange(next, storeToday))
    },
    setCustomFrom: (value) => editCustom({ from: value, to: current.to }),
    setCustomTo: (value) => editCustom({ from: current.from, to: value }),
  }
}
