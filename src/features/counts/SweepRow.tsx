import { useTranslation } from 'react-i18next'
import { Money } from '@/components/Money'
import { formatDateShort } from '@/lib/dates'
import type { LatestCount } from '@/api/counts'

/*
 * One shelf in a sweep.
 *
 * The previous count travels with the row (domain-spec §8.3: "shows each
 * category's previous count and date alongside the input"). It is the only
 * reference the user has while standing in front of the shelf, and it is what
 * turns "about a thousand, I think" into "it was 1 040 three weeks ago".
 *
 * The contents hint is shown for the same reason it is shown in the purchase
 * question: the value being asked for is the WHOLE shelf.
 */

export function SweepRow({
  name,
  description,
  value,
  onChange,
  previous,
  skipped,
  onToggleSkip,
  skipLabel,
  undoSkipLabel,
}: {
  name: string
  description: string
  value: string
  onChange: (value: string) => void
  previous?: LatestCount | null
  skipped?: boolean
  onToggleSkip?: () => void
  skipLabel?: string
  undoSkipLabel?: string
}) {
  const { t } = useTranslation()

  return (
    <li
      className={`rounded-xl border border-black/10 p-3 dark:border-white/15 ${
        skipped ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{name}</p>
          {description && <p className="truncate text-xs opacity-70">{description}</p>}
        </div>
        {onToggleSkip && (
          <button
            type="button"
            onClick={onToggleSkip}
            className="shrink-0 text-xs underline opacity-70"
          >
            {skipped ? undoSkipLabel : skipLabel}
          </button>
        )}
      </div>

      {!skipped && (
        <>
          {previous !== undefined && (
            <p className="mt-2 text-xs opacity-70">
              {previous ? (
                <>
                  {t('counts.previous', { date: formatDateShort(previous.occurredOn) })}{' '}
                  <Money value={previous.valueAtCost} kind="measured" />
                </>
              ) : (
                t('counts.neverCounted')
              )}
            </p>
          )}
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label={`${t('counts.valueLabel')} — ${name}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="tabular mt-2 w-full rounded-lg border border-black/20 px-3 py-3 text-lg dark:border-white/25"
            placeholder="0,00"
          />
        </>
      )}
    </li>
  )
}
