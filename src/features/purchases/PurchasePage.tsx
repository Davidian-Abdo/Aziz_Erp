import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCategories } from '@/api/categories'
import { useLatestCount } from '@/api/counts'
import {
  isBackdated,
  useDeletePurchase,
  useRecentPurchases,
  useRecordPurchase,
} from '@/api/purchases'
import { useStoreToday } from '@/api/settings'
import { AmountField } from '@/components/AmountField'
import { CategorySelect } from '@/components/CategorySelect'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DateField } from '@/components/DateField'
import { Field, inputClass, primaryButtonClass } from '@/components/Field'
import { Money } from '@/components/Money'
import { RecentPanel, RecentRow } from '@/components/RecentPanel'
import { StockQuestion } from './StockQuestion'
import { parseAmount, type AmountError } from '@/lib/amount'
import { formatDateShort } from '@/lib/dates'
import { writeErrorKey } from '@/lib/pg-errors'

/*
 * Purchase entry (domain-spec §8.1) — two screens, because they ask two
 * different questions and mixing them is how the second one gets answered
 * carelessly:
 *
 *   1. what you bought;
 *   2. what was on the shelf BEFORE it arrived (§3.2A) — unless the purchase is
 *      backdated behind the category's last count, in which case no count is
 *      recorded at all and the form says so (§2.4).
 *
 * Both rows are written in one transaction by `record_purchase`. A purchase
 * that requires a count never exists without it.
 */

type Step = 'details' | 'stock'

export function PurchasePage() {
  const { t } = useTranslation()
  const today = useStoreToday()
  const categories = useCategories()
  const record = useRecordPurchase()

  const [step, setStep] = useState<Step>('details')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(today)
  const [amountText, setAmountText] = useState('')
  const [note, setNote] = useState('')
  const [amountError, setAmountError] = useState<AmountError | null>(null)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ replayed: boolean } | null>(null)

  /*
   * ONE identifier per submission, not per attempt (domain-spec §8.1).
   *
   * It is created when the user first presses save and survives every retry of
   * that same purchase, so a lost response over a shop's connection replays the
   * original write instead of posting a second one. A duplicated purchase
   * inflates outflow, and this model reports outflow as PROFIT — a double-post
   * is a false profit figure, not a cosmetic bug.
   */
  const requestId = useRef<string | null>(null)

  const latestCount = useLatestCount(step === 'stock' ? categoryId : null)
  const backdated = isBackdated(date, latestCount.data?.occurredOn ?? null)

  const category = (categories.data ?? []).find((c) => c.id === categoryId)

  function toStockStep(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseAmount(amountText)
    setAmountError(parsed.ok ? null : parsed.error)
    setCategoryError(categoryId ? null : t('purchases.categoryRequired'))
    if (!parsed.ok || !categoryId) return
    setSaved(null)
    setStep('stock')
  }

  function save(priorStock: number | null) {
    const parsed = parseAmount(amountText)
    if (!parsed.ok) {
      setStep('details')
      setAmountError(parsed.error)
      return
    }
    requestId.current ??= crypto.randomUUID()
    record.mutate(
      {
        requestId: requestId.current,
        categoryId,
        date,
        amount: parsed.value,
        priorStock,
        note: note.trim() || null,
      },
      {
        onSuccess: (result) => {
          setSaved({ replayed: result.replayed })
          // A new purchase is a new submission and needs a new identifier;
          // reusing this one would replay the purchase just written.
          requestId.current = null
          setStep('details')
          setCategoryId('')
          setAmountText('')
          setNote('')
        },
      },
    )
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 pb-24">
      <h1 className="text-2xl font-semibold">{t('nav.purchases')}</h1>

      {saved && (
        <p role="status" className="rounded-lg bg-black/5 p-3 text-sm dark:bg-white/10">
          {saved.replayed ? t('purchases.savedReplayed') : t('purchases.saved')}
        </p>
      )}

      {step === 'details' ? (
        <form onSubmit={toStockStep} className="flex flex-col gap-4">
          <CategorySelect
            label={t('purchases.category')}
            placeholder={t('purchases.categoryPlaceholder')}
            categories={categories.data ?? []}
            value={categoryId}
            onChange={(id) => {
              setCategoryId(id)
              setCategoryError(null)
            }}
            error={categoryError}
          />

          <DateField label={t('purchases.date')} value={date} onChange={setDate} today={today} />

          <AmountField
            label={t('purchases.amount')}
            hint={t('purchases.amountHint')}
            value={amountText}
            onChange={(v) => {
              setAmountText(v)
              setAmountError(null)
            }}
            error={amountError}
          />

          <Field label={t('common.noteOptional')}>
            {({ id }) => (
              <input
                id={id}
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={inputClass}
              />
            )}
          </Field>

          <button type="submit" className={primaryButtonClass}>
            {t('common.next')}
          </button>
        </form>
      ) : (
        <section className="flex flex-col gap-4">
          <PurchaseSummary
            categoryName={category?.name ?? ''}
            date={date}
            amountText={amountText}
          />

          {latestCount.isPending ? (
            <p className="text-sm opacity-70">{t('app.loading')}</p>
          ) : backdated ? (
            <BackdatedNotice
              lastCountOn={latestCount.data?.occurredOn ?? date}
              busy={record.isPending}
              onBack={() => setStep('details')}
              onSave={() => save(null)}
            />
          ) : (
            <StockQuestion
              categoryId={categoryId}
              categoryName={category?.name ?? ''}
              categoryDescription={category?.description ?? ''}
              date={date}
              busy={record.isPending}
              onBack={() => setStep('details')}
              onAnswer={(priorStock) => save(priorStock)}
            />
          )}

          {record.isError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {t(`write.error.${writeErrorKey(record.error)}`)}
            </p>
          )}
        </section>
      )}

      <RecentPurchases />
    </main>
  )
}

function PurchaseSummary({
  categoryName,
  date,
  amountText,
}: {
  categoryName: string
  date: string
  amountText: string
}) {
  const { t } = useTranslation()
  const parsed = parseAmount(amountText)
  return (
    <p className="text-sm opacity-70">
      {categoryName} · {formatDateShort(date)} ·{' '}
      {parsed.ok ? <Money value={parsed.value} kind="measured" /> : t('common.unknownAmount')}
    </p>
  )
}

/*
 * The backdating exception (domain-spec §3.2, plan §2.4).
 *
 * The purchase lands inside a window that is already closed at both ends, so
 * there is nothing to count: it is simply inflow. Saying so is not optional —
 * a form that silently skipped the question it asked five seconds ago for every
 * other purchase would look like a bug.
 */
function BackdatedNotice({
  lastCountOn,
  busy,
  onBack,
  onSave,
}: {
  lastCountOn: string
  busy: boolean
  onBack: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl border border-black/10 p-4 text-sm leading-relaxed dark:border-white/15">
        {t('purchases.backdated', { date: formatDateShort(lastCountOn) })}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button type="button" onClick={onSave} disabled={busy} className={primaryButtonClass}>
          {busy ? t('purchases.saving') : t('purchases.save')}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="rounded-lg border border-black/20 px-4 py-3 font-medium dark:border-white/25"
        >
          {t('common.back')}
        </button>
      </div>
    </div>
  )
}

function RecentPurchases() {
  const { t } = useTranslation()
  const recent = useRecentPurchases()
  const remove = useDeletePurchase()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const rows = recent.data ?? []

  return (
    <>
      <RecentPanel
        title={t('purchases.recent')}
        isPending={recent.isPending}
        isEmpty={rows.length === 0}
      >
        {rows.map((row) => (
          <RecentRow
            key={row.id}
            primary={row.categoryName}
            secondary={`${formatDateShort(row.occurredOn)}${
              row.priorCountId ? '' : ` · ${t('purchases.noCountAttached')}`
            }`}
            amount={<Money value={row.amountAtCost} kind="measured" />}
            onDelete={() => setPendingDelete(row.id)}
            deleteLabel={t('common.delete')}
          />
        ))}
      </RecentPanel>

      {pendingDelete && (
        <ConfirmDialog
          title={t('purchases.deleteTitle')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          emphasise="cancel"
          busy={remove.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() =>
            remove.mutate(pendingDelete, { onSettled: () => setPendingDelete(null) })
          }
        >
          <p>{t('purchases.deleteBody')}</p>
        </ConfirmDialog>
      )}
    </>
  )
}
