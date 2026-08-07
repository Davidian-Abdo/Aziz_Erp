import { useTranslation } from 'react-i18next'
import { Field, inputClass } from '@/components/Field'
import { PERIOD_PRESETS, type Period } from './usePeriod'

/*
 * The period selector (domain-spec §7.1) — it drives everything below it.
 *
 * Presets first and custom last, because a shopkeeper reads "this month" and
 * "last month" ninety-nine times out of a hundred, and typing two dates on a
 * phone to answer "how did last month go" is a tax.
 */
export function PeriodSelector({ period }: { period: Period }) {
  const { t } = useTranslation()

  return (
    <section aria-label={t('dashboard.period')} className="flex flex-col gap-3">
      <div role="tablist" aria-label={t('dashboard.period')} className="flex flex-wrap gap-2">
        {PERIOD_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            role="tab"
            aria-selected={period.key === preset}
            onClick={() => period.selectPreset(preset)}
            className={`rounded-lg border px-3 py-2 text-sm ${
              period.key === preset
                ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                : 'border-black/20 dark:border-white/25'
            }`}
          >
            {t(`dashboard.presets.${preset}`)}
          </button>
        ))}
      </div>

      <details open={period.key === 'custom'} className="text-sm">
        <summary className="cursor-pointer opacity-70">{t('dashboard.presets.custom')}</summary>
        <div className="mt-3 flex flex-wrap gap-3">
          <Field label={t('dashboard.customFrom')}>
            {({ id }) => (
              <input
                id={id}
                type="date"
                value={period.draft.from}
                onChange={(e) => period.setCustomFrom(e.target.value)}
                className={`${inputClass} w-auto`}
              />
            )}
          </Field>
          <Field
            label={t('dashboard.customTo')}
            error={period.invalid ? t('dashboard.customInvalid') : null}
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="date"
                value={period.draft.to}
                onChange={(e) => period.setCustomTo(e.target.value)}
                className={`${inputClass} w-auto`}
              />
            )}
          </Field>
        </div>
      </details>
    </section>
  )
}
