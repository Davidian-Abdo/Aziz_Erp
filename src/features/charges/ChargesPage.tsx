import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useChargeCategories,
  useCreateChargeCategory,
  useDeleteCharge,
  useRecentCharges,
  useRecordCharge,
  type ChargeNature,
} from '@/api/charges'
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
 * Charge entry (domain-spec §8.2) — money spent that is not resale stock.
 *
 * The distinction that runs through this screen is `nature`: an operating
 * charge is a cost of running the store and is subtracted to reach operating
 * profit; an owner draw is the owner taking money out and is NOT a cost
 * (§6.7). Summing them would either flatter the shop or bury a habit of taking
 * cash inside "expenses", and neither is recoverable from the numbers
 * afterwards.
 *
 * So the nature is asked for in plain language at the moment a category is
 * created, never inferred: only the person typing "Cadeau" knows whether it was
 * marketing or a present.
 */
export function ChargesPage() {
  const { t } = useTranslation()
  const today = useStoreToday()
  const categories = useChargeCategories()
  const record = useRecordCharge()

  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(today)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [amountError, setAmountError] = useState<AmountError | null>(null)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [adding, setAdding] = useState(false)

  const options = (categories.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    // The nature travels with the name in the picker, so "Retrait personnel"
    // cannot be chosen for a supplier invoice by accident.
    description: t(`charges.nature.${c.nature}`),
  }))

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseAmount(text)
    setAmountError(parsed.ok ? null : parsed.error)
    setCategoryError(categoryId ? null : t('charges.categoryRequired'))
    if (!parsed.ok || !categoryId) return
    setSaved(false)
    record.mutate(
      { chargeCategoryId: categoryId, date, amount: parsed.value, note: note.trim() || null },
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
      <h1 className="text-2xl font-semibold">{t('nav.charges')}</h1>

      {saved && (
        <p role="status" className="rounded-lg bg-black/5 p-3 text-sm dark:bg-white/10">
          {t('charges.saved')}
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <CategorySelect
          label={t('charges.category')}
          placeholder={t('charges.categoryPlaceholder')}
          categories={options}
          value={categoryId}
          onChange={(id) => {
            setCategoryId(id)
            setCategoryError(null)
          }}
          error={categoryError}
        />

        {adding ? (
          <NewChargeCategory
            onCancel={() => setAdding(false)}
            onCreated={(id) => {
              setCategoryId(id)
              setCategoryError(null)
              setAdding(false)
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-fit text-sm underline opacity-70"
          >
            {t('charges.addCategory')}
          </button>
        )}

        <DateField label={t('charges.date')} value={date} onChange={setDate} today={today} />

        <AmountField
          label={t('charges.amount')}
          value={text}
          onChange={(v) => {
            setText(v)
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

        {record.isError && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {t(`write.error.${writeErrorKey(record.error)}`)}
          </p>
        )}

        <button type="submit" disabled={record.isPending} className={primaryButtonClass}>
          {record.isPending ? t('charges.saving') : t('charges.save')}
        </button>
      </form>

      <RecentCharges />
    </main>
  )
}

/*
 * Inline category creation (§8.2) — without leaving the form, because the
 * alternative is that the user files the charge under whatever category is
 * closest and the distinction is lost.
 */
function NewChargeCategory({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (id: string) => void
}) {
  const { t } = useTranslation()
  const create = useCreateChargeCategory()
  const [name, setName] = useState('')
  const [nature, setNature] = useState<ChargeNature>('operating')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (!name.trim()) {
      setError(t('charges.nameRequired'))
      return
    }
    create.mutate(
      { name: name.trim(), nature },
      {
        onSuccess: (category) => onCreated(category.id),
        onError: () => setError(t('charges.categoryFailed')),
      },
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 p-3 dark:border-white/15">
      <Field label={t('charges.newCategoryName')} error={error}>
        {({ id }) => (
          <input
            id={id}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            className={inputClass}
          />
        )}
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('charges.newCategoryNature')}</legend>
        {(['operating', 'owner_draw'] as const).map((value) => (
          <label key={value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="nature"
              value={value}
              checked={nature === value}
              onChange={() => setNature(value)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{t(`charges.nature.${value}`)}</span>
              {/* Plain language, not accounting language: this is the one
                  choice the owner cannot get back later. */}
              <span className="block text-xs opacity-70">{t(`charges.natureHelp.${value}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={create.isPending}
          className={primaryButtonClass}
        >
          {t('charges.createCategory')}
        </button>
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

function RecentCharges() {
  const { t } = useTranslation()
  const recent = useRecentCharges()
  const remove = useDeleteCharge()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const rows = recent.data ?? []

  return (
    <>
      <RecentPanel
        title={t('charges.recent')}
        isPending={recent.isPending}
        isEmpty={rows.length === 0}
      >
        {rows.map((row) => (
          <RecentRow
            key={row.id}
            primary={row.categoryName}
            secondary={`${formatDateShort(row.occurredOn)} · ${t(`charges.nature.${row.nature}`)}`}
            amount={<Money value={row.amount} kind="measured" />}
            onDelete={() => setPendingDelete(row.id)}
            deleteLabel={t('common.delete')}
          />
        ))}
      </RecentPanel>

      {pendingDelete && (
        <ConfirmDialog
          title={t('charges.deleteTitle')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          emphasise="cancel"
          busy={remove.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() =>
            remove.mutate(pendingDelete, { onSettled: () => setPendingDelete(null) })
          }
        >
          <p>{t('charges.deleteBody')}</p>
        </ConfirmDialog>
      )}
    </>
  )
}
