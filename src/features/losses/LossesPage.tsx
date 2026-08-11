import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCategories } from '@/api/categories'
import {
  LOSS_REASONS,
  useDeleteLoss,
  useEditLoss,
  useRecentLosses,
  useRecordLoss,
  type LossNature,
  type LossReason,
  type LossRow,
} from '@/api/losses'
import { useStoreToday } from '@/api/settings'
import { AmountField } from '@/components/AmountField'
import { CategorySelect } from '@/components/CategorySelect'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DateField } from '@/components/DateField'
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from '@/components/Field'
import { Money } from '@/components/Money'
import { RecentPanel, RecentRow } from '@/components/RecentPanel'
import { parseAmount, type AmountError } from '@/lib/amount'
import { formatDateShort } from '@/lib/dates'
import { writeErrorKey } from '@/lib/pg-errors'

/*
 * Loss entry (domain-spec §4, §8.4).
 *
 * Optional, and the only defence against the model's blindest spot. Goods that
 * left the shelf without being sold are otherwise inferred as sold — at full
 * markup — so a crate of spoiled milk reads as a good week. Nothing else in the
 * system can tell the difference.
 *
 * The reasons are grouped by what they mean, not listed flat: four are a loss
 * to the business, two are the owner taking value home. "The store lost 740"
 * and "I took 300 home" are different facts and must never be summed into one
 * number (§4.2), and the grouping is where the user learns that.
 */
export function LossesPage() {
  const { t } = useTranslation()
  const today = useStoreToday()
  const categories = useCategories()
  const record = useRecordLoss()
  const edit = useEditLoss()

  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(today)
  const [text, setText] = useState('')
  const [reason, setReason] = useState<LossReason>('spoiled')
  const [note, setNote] = useState('')
  const [amountError, setAmountError] = useState<AmountError | null>(null)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  /*
   * Correcting a loss reuses this form (domain-spec §8.5). The reason picker is
   * the point: it decides whether the amount is the store's shrinkage or the
   * owner taking goods home, and choosing the wrong radio is the most likely
   * mistake on this screen. Re-entering the record to fix it would mean the
   * owner deleting a real loss, which is a worse operation than editing one.
   */
  const [editingId, setEditingId] = useState<string | null>(null)
  const active = editingId ? edit : record

  function reset() {
    setEditingId(null)
    setText('')
    setNote('')
    setDate(today)
    setCategoryId('')
    setReason('spoiled')
    setAmountError(null)
    setCategoryError(null)
  }

  function startEdit(row: LossRow) {
    setEditingId(row.id)
    setCategoryId(row.categoryId)
    setDate(row.occurredOn)
    setText(String(row.amountAtCost).replace('.', ','))
    setReason(row.reason)
    setNote(row.note ?? '')
    setSaved(false)
    setAmountError(null)
    setCategoryError(null)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseAmount(text)
    setAmountError(parsed.ok ? null : parsed.error)
    setCategoryError(categoryId ? null : t('losses.categoryRequired'))
    if (!parsed.ok || !categoryId) return
    setSaved(false)

    if (editingId) {
      edit.mutate(
        {
          id: editingId,
          categoryId,
          date,
          amount: parsed.value,
          reason,
          note: note.trim() || null,
        },
        {
          onSuccess: () => {
            setSaved(true)
            reset()
          },
        },
      )
      return
    }

    record.mutate(
      { categoryId, date, amount: parsed.value, reason, note: note.trim() || null },
      {
        onSuccess: () => {
          setSaved(true)
          setText('')
          setNote('')
        },
      },
    )
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 pb-24">
      <h1 className="text-2xl font-semibold">{t('nav.losses')}</h1>
      <p className="text-sm opacity-80">{t('losses.intro')}</p>

      {saved && (
        <p role="status" className="rounded-lg bg-black/5 p-3 text-sm dark:bg-white/10">
          {t('losses.saved')}
        </p>
      )}

      {editingId && (
        <p role="status" className="rounded-lg bg-black/5 p-3 text-sm dark:bg-white/10">
          {t('common.editing')}
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <CategorySelect
          label={t('losses.category')}
          placeholder={t('losses.categoryPlaceholder')}
          categories={categories.data ?? []}
          value={categoryId}
          onChange={(id) => {
            setCategoryId(id)
            setCategoryError(null)
          }}
          error={categoryError}
        />

        <DateField label={t('losses.date')} value={date} onChange={setDate} today={today} />

        <AmountField
          label={t('losses.amount')}
          hint={t('losses.amountHint')}
          value={text}
          onChange={(v) => {
            setText(v)
            setAmountError(null)
          }}
          error={amountError}
        />

        <ReasonPicker value={reason} onChange={setReason} />

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

        {active.isError && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {t(`write.error.${writeErrorKey(active.error)}`)}
          </p>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={active.isPending} className={primaryButtonClass}>
            {active.isPending
              ? t('losses.saving')
              : editingId
                ? t('common.saveChanges')
                : t('losses.save')}
          </button>
          {editingId && (
            <button type="button" onClick={reset} className={secondaryButtonClass}>
              {t('common.cancel')}
            </button>
          )}
        </div>
      </form>

      <RecentLosses onEdit={startEdit} />
    </main>
  )
}

function ReasonPicker({
  value,
  onChange,
}: {
  value: LossReason
  onChange: (r: LossReason) => void
}) {
  const { t } = useTranslation()
  const natures: LossNature[] = ['shrinkage', 'owner_draw']

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">{t('losses.reason')}</legend>
      {natures.map((nature) => (
        <div key={nature} className="flex flex-col gap-1">
          <p className="text-xs font-semibold opacity-70">{t(`losses.nature.${nature}`)}</p>
          <p className="text-xs opacity-60">{t(`losses.natureHelp.${nature}`)}</p>
          {LOSS_REASONS.filter((r) => r.nature === nature).map(({ reason }) => (
            <label key={reason} className="flex items-center gap-2 py-1 text-sm">
              <input
                type="radio"
                name="reason"
                value={reason}
                checked={value === reason}
                onChange={() => onChange(reason)}
              />
              {t(`losses.reason_.${reason}`)}
            </label>
          ))}
        </div>
      ))}
    </fieldset>
  )
}

function RecentLosses({ onEdit }: { onEdit: (row: LossRow) => void }) {
  const { t } = useTranslation()
  const recent = useRecentLosses()
  const remove = useDeleteLoss()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const rows = recent.data ?? []

  return (
    <>
      <RecentPanel
        title={t('losses.recent')}
        isPending={recent.isPending}
        isEmpty={rows.length === 0}
      >
        {rows.map((row) => (
          <RecentRow
            key={row.id}
            primary={row.categoryName}
            secondary={`${formatDateShort(row.occurredOn)} · ${t(`losses.reason_.${row.reason}`)}`}
            amount={<Money value={row.amountAtCost} kind="measured" />}
            onEdit={() => onEdit(row)}
            editLabel={t('common.edit')}
            onDelete={() => setPendingDelete(row.id)}
            deleteLabel={t('common.delete')}
          />
        ))}
      </RecentPanel>

      {pendingDelete && (
        <ConfirmDialog
          title={t('losses.deleteTitle')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          emphasise="cancel"
          busy={remove.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() =>
            remove.mutate(pendingDelete, { onSettled: () => setPendingDelete(null) })
          }
        >
          <p>{t('losses.deleteBody')}</p>
        </ConfirmDialog>
      )}
    </>
  )
}
