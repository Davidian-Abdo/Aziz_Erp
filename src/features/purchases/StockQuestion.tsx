import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AmountField } from '@/components/AmountField'
import { Money } from '@/components/Money'
import { primaryButtonClass, secondaryButtonClass } from '@/components/Field'
import { useExpectedOnHand } from '@/api/counts'
import { PlausibilityDialog } from '@/features/counts/PlausibilityDialog'
import { usePlausibilityGate } from '@/features/counts/usePlausibilityGate'
import { parseAmount, type AmountError } from '@/lib/amount'

/*
 * The stock question (domain-spec §3.2A) — the second screen of the purchase
 * flow, and the single most dangerous input in the application.
 *
 * THE TRAP: a category is a basket; a delivery is one product in it. Asked
 * "what was left before this delivery?" while holding a milk crate, a person
 * naturally answers for the milk. The system reads it as the whole Dairy shelf
 * and books the cheese still physically present as sold, at full markup. The
 * next count shows stock rising unexplained and is flagged — by which time the
 * false profit is already inside a month the owner has read.
 *
 * The wording below is BINDING, not copy to be improved: the whole shelf is
 * named, its contents are listed from `article_category.description`, and
 * "pas seulement ce que vous venez d'acheter" is the mitigation.
 *
 * Three defences, in order of how much they help:
 *   1. the wording and the contents list;
 *   2. the expected on-hand figure shown beside the input — the answer to two
 *      purchases of one category on one day (plan §2.15b);
 *   3. the plausibility verdict, which blocks with **Corriger** as the primary
 *      action but never prevents saving, because the user may be right.
 */

type StockQuestionProps = {
  categoryId: string
  categoryName: string
  categoryDescription: string
  date: string
  busy: boolean
  /*
   * The answer already recorded, when an existing purchase is being corrected
   * (domain-spec §8.5). Prefilled so that fixing a mistyped amount does not
   * force the owner to re-answer a question about a shelf they can no longer
   * see — the original answer was given at the delivery and is the better one.
   * Null for a new purchase, and 0 is a real answer (the shelf was empty), not
   * an absent one.
   */
  initialValue?: number | null
  onBack: () => void
  onAnswer: (priorStock: number) => void
}

type Mode = 'unanswered' | 'empty' | 'value'

export function StockQuestion({
  categoryId,
  categoryName,
  categoryDescription,
  date,
  busy,
  initialValue = null,
  onBack,
  onAnswer,
}: StockQuestionProps) {
  const { t } = useTranslation()
  const expected = useExpectedOnHand(categoryId, date)
  const gate = usePlausibilityGate()

  const [mode, setMode] = useState<Mode>(
    initialValue === null ? 'unanswered' : initialValue === 0 ? 'empty' : 'value',
  )
  const [text, setText] = useState(
    initialValue === null || initialValue === 0 ? '' : String(initialValue).replace('.', ','),
  )
  const [error, setError] = useState<AmountError | null>(null)

  async function submit() {
    // A count of 0 is a real measurement — the shelf was empty (§3.1) — so
    // "rien" is an answer, not a way of skipping the question.
    let value = 0
    if (mode === 'value') {
      const parsed = parseAmount(text, { allowZero: true })
      if (!parsed.ok) {
        setError(parsed.error)
        return
      }
      value = parsed.value
    }
    setError(null)
    await gate.guard(categoryId, date, value, onAnswer)
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-xl border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-lg font-semibold">
          {t('purchases.wholeShelf', { category: categoryName })}
        </h2>
        {categoryDescription && <p className="text-sm opacity-70">{categoryDescription}</p>}
        <p className="mt-2 text-sm font-medium">{t('purchases.notOnlyWhatYouBought')}</p>
        <p className="mt-1 text-sm">{t('purchases.howMuchWasLeft')}</p>

        {expected.data !== null && expected.data !== undefined && (
          <p className="mt-3 text-xs opacity-70">
            {t('purchases.expectedPrefix')} <Money value={expected.data} kind="measured" />
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            setMode('empty')
            setText('')
            setError(null)
          }}
          aria-pressed={mode === 'empty'}
          className={mode === 'empty' ? primaryButtonClass : secondaryButtonClass}
        >
          {t('purchases.shelfWasEmpty')}
        </button>
        <button
          type="button"
          onClick={() => setMode('value')}
          aria-pressed={mode === 'value'}
          className={mode === 'value' ? primaryButtonClass : secondaryButtonClass}
        >
          {t('purchases.somethingWasLeft')}
        </button>
      </div>

      {mode === 'value' && (
        <AmountField
          label={t('purchases.priorStockLabel')}
          value={text}
          onChange={(v) => {
            setText(v)
            setError(null)
          }}
          error={error}
          autoFocus
        />
      )}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={mode === 'unanswered' || busy || gate.checking}
          className={primaryButtonClass}
        >
          {busy ? t('purchases.saving') : t('purchases.save')}
        </button>
        <button type="button" onClick={onBack} disabled={busy} className={secondaryButtonClass}>
          {t('common.back')}
        </button>
      </div>

      {gate.verdict && (
        <PlausibilityDialog
          verdict={gate.verdict}
          categoryName={categoryName}
          onFix={gate.dismiss}
          onSaveAnyway={() => gate.override(onAnswer)}
        />
      )}
    </section>
  )
}
