import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCategories } from '@/api/categories'
import { useCompleteOnboarding } from '@/api/onboarding'
import { useStoreToday } from '@/api/settings'
import { DateField } from '@/components/DateField'
import { Money } from '@/components/Money'
import { primaryButtonClass } from '@/components/Field'
import { SweepRow } from '@/features/counts/SweepRow'
import { useSweepDraft } from '@/features/counts/useSweepDraft'

/*
 * The opening sweep (domain-spec §3.5). It is the §8.3 sweep screen with
 * different copy, and it is mandatory: the dashboard is not reachable until it
 * completes, because a dashboard with no opening counts shows nothing but zeros
 * and would teach the owner on their first visit that the app does not work.
 *
 * The one thing this screen has that the month-end sweep does not: a shelf can
 * be deactivated instead of counted. Nobody should have to invent a number for
 * a shelf they do not stock, and a zero would read as "empty" rather than "not
 * applicable".
 */
export function OpeningSweepPage() {
  const { t } = useTranslation()
  const today = useStoreToday()
  const categories = useCategories()
  const complete = useCompleteOnboarding()

  const rows = categories.data ?? []
  const draft = useSweepDraft(rows.map((c) => c.id))
  const [date, setDate] = useState(today)
  const [showIncomplete, setShowIncomplete] = useState(false)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.isComplete) {
      setShowIncomplete(true)
      return
    }
    complete.mutate({
      requestId: draft.requestId,
      date,
      counts: draft.entries.map((e) => ({
        categoryId: e.categoryId,
        valueAtCost: e.valueAtCost,
      })),
      deactivateCategoryIds: [...draft.skipped],
    })
  }

  if (categories.isPending) {
    return <p className="p-6 text-sm opacity-70">{t('app.loading')}</p>
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 pb-24">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t('onboarding.title')}</h1>
        <p className="text-sm leading-relaxed opacity-80">{t('onboarding.intro')}</p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <DateField
          label={t('onboarding.dateLabel')}
          value={date}
          onChange={setDate}
          today={today}
        />

        <ul className="flex flex-col gap-3">
          {rows.map((c) => (
            <SweepRow
              key={c.id}
              name={c.name}
              description={c.description}
              value={draft.values[c.id] ?? ''}
              onChange={(v) => draft.setValue(c.id, v)}
              skipped={draft.skipped.has(c.id)}
              onToggleSkip={() => draft.toggleSkip(c.id)}
              skipLabel={t('onboarding.skipCategory')}
              undoSkipLabel={t('onboarding.undoSkip')}
            />
          ))}
        </ul>

        <div className="flex items-baseline justify-between border-t border-black/10 pt-3 dark:border-white/15">
          <span className="text-sm opacity-70">{t('onboarding.total')}</span>
          {/* Measured: this is money the owner counted, not money the model
              inferred. */}
          <Money value={draft.total} kind="measured" className="text-lg font-semibold" />
        </div>

        {showIncomplete && !draft.isComplete && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {t('onboarding.incomplete')}
          </p>
        )}

        {complete.isError && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {t('onboarding.failed')}
          </p>
        )}

        <button type="submit" disabled={complete.isPending} className={primaryButtonClass}>
          {complete.isPending ? t('onboarding.submitting') : t('onboarding.submit')}
        </button>
      </form>
    </main>
  )
}
