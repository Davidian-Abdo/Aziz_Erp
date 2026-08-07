import { useTranslation } from 'react-i18next'
import { Field, inputClass } from '@/components/Field'
import { addDays, formatDate } from '@/lib/dates'

/*
 * A business date (domain-spec §8.5: no future dates, backdating without limit).
 *
 * `max` is the STORE's today, not the browser's — see lib/dates.ts. The server
 * enforces the same rule as a trigger (plan §2.6); this only keeps the user
 * from meeting that error.
 *
 * "Yesterday" is one tap because it is the single most common backdate: the
 * delivery arrived, the shop was busy, it is entered the next morning.
 */

type DateFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  /** The store's today. Also the maximum selectable date. */
  today: string
  error?: string | null
}

export function DateField({ label, value, onChange, today, error }: DateFieldProps) {
  const { t } = useTranslation()
  const yesterday = addDays(today, -1)

  return (
    <Field label={label} error={error}>
      {({ id, describedBy }) => (
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={id}
            aria-describedby={describedBy}
            type="date"
            value={value}
            max={today}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} w-auto grow`}
          />
          <div className="flex gap-2">
            <QuickDate label={t('date.today')} date={today} value={value} onChange={onChange} />
            <QuickDate
              label={t('date.yesterday')}
              date={yesterday}
              value={value}
              onChange={onChange}
            />
          </div>
          {value !== today && value !== yesterday && (
            <span className="basis-full text-xs opacity-70">{formatDate(value)}</span>
          )}
        </div>
      )}
    </Field>
  )
}

function QuickDate({
  label,
  date,
  value,
  onChange,
}: {
  label: string
  date: string
  value: string
  onChange: (v: string) => void
}) {
  const selected = value === date
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onChange(date)}
      className={`rounded-lg border px-3 py-2 text-sm ${
        selected
          ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
          : 'border-black/20 dark:border-white/25'
      }`}
    >
      {label}
    </button>
  )
}
