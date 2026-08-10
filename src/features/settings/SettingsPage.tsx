import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCategories, useCreateCategory, useUpdateCategory } from '@/api/categories'
import {
  useAllChargeCategories,
  useCreateChargeCategory,
  useUpdateChargeCategory,
  type ChargeNature,
} from '@/api/charges'
import { useMarkupRates, useSetMarkupRate } from '@/api/markup'
import { useSettings, useUpdateSettings, useStoreToday } from '@/api/settings'
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from '@/components/Field'
import { parseAmount } from '@/lib/amount'
import { formatDate } from '@/lib/dates'

/*
 * Settings (Phase 6). Four sections: general store info, article categories,
 * markup rates, and charge category types.
 *
 * The markup section is the most constrained. domain-spec §1.3 requires the
 * markup-on-cost convention to be stated next to the input with a live worked
 * example. A markup change writes a new `markup_rate` row (never an in-place
 * update); the exit criterion pgTAP fixture 080_markup.sql proves that past
 * `report_period` outputs are unaffected.
 */

export function SettingsPage() {
  const { t } = useTranslation()

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 p-4 pb-24">
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
      <GeneralSection />
      <CategoriesSection />
      <MarkupsSection />
      <ChargeCategoriesSection />
    </main>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-black/10 pb-2 text-lg font-semibold dark:border-white/15">
      {children}
    </h2>
  )
}

// ---------------------------------------------------------------------------
// General settings
// ---------------------------------------------------------------------------

function GeneralSection() {
  const { t } = useTranslation()
  const settings = useSettings()
  const update = useUpdateSettings()

  const [storeName, setStoreName] = useState('')
  const [currencyCode, setCurrencyCode] = useState('')
  const [locale, setLocale] = useState('')
  const [timezone, setTimezone] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings.data) {
      setStoreName(settings.data.storeName)
      setCurrencyCode(settings.data.currencyCode)
      setLocale(settings.data.locale)
      setTimezone(settings.data.timezone)
    }
  }, [settings.data])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaved(false)
    update.mutate(
      { storeName, currencyCode, locale, timezone },
      { onSuccess: () => setSaved(true) },
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>{t('settings.general.title')}</SectionHeading>

      {saved && (
        <p role="status" className="rounded-lg bg-black/5 p-3 text-sm dark:bg-white/10">
          {t('settings.general.saved')}
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={t('settings.general.storeName')}>
          {({ id }) => (
            <input
              id={id}
              type="text"
              value={storeName}
              onChange={(e) => {
                setStoreName(e.target.value)
                setSaved(false)
              }}
              className={inputClass}
            />
          )}
        </Field>

        <Field label={t('settings.general.currencyCode')}>
          {({ id }) => (
            <input
              id={id}
              type="text"
              value={currencyCode}
              onChange={(e) => {
                setCurrencyCode(e.target.value)
                setSaved(false)
              }}
              className={inputClass}
            />
          )}
        </Field>

        <Field label={t('settings.general.locale')}>
          {({ id }) => (
            <input
              id={id}
              type="text"
              value={locale}
              onChange={(e) => {
                setLocale(e.target.value)
                setSaved(false)
              }}
              className={inputClass}
            />
          )}
        </Field>

        <Field label={t('settings.general.timezone')}>
          {({ id }) => (
            <input
              id={id}
              type="text"
              value={timezone}
              onChange={(e) => {
                setTimezone(e.target.value)
                setSaved(false)
              }}
              className={inputClass}
            />
          )}
        </Field>

        {update.isError && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {t('settings.general.failed')}
          </p>
        )}

        <button type="submit" disabled={update.isPending} className={`${primaryButtonClass} w-fit`}>
          {update.isPending ? t('settings.general.saving') : t('settings.general.save')}
        </button>
      </form>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Article categories
// ---------------------------------------------------------------------------

function CategoriesSection() {
  const { t } = useTranslation()
  const categories = useCategories(true)
  const [adding, setAdding] = useState(false)

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>{t('settings.categories.title')}</SectionHeading>

      <ul className="flex flex-col gap-3">
        {(categories.data ?? []).map((cat) => (
          <li key={cat.id}>
            <CategoryRow category={cat} />
          </li>
        ))}
      </ul>

      {adding ? (
        <NewCategoryForm onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-fit text-sm underline opacity-70"
        >
          {t('settings.categories.add')}
        </button>
      )}
    </section>
  )
}

type CategoryLike = {
  id: string
  name: string
  description: string
  active: boolean
}

function CategoryRow({ category }: { category: CategoryLike }) {
  const { t } = useTranslation()
  const update = useUpdateCategory()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [description, setDescription] = useState(category.description)
  const [nameError, setNameError] = useState<string | null>(null)

  function save() {
    if (!name.trim()) {
      setNameError(t('settings.categories.nameRequired'))
      return
    }
    update.mutate(
      { id: category.id, name: name.trim(), description: description.trim() },
      {
        onSuccess: () => setEditing(false),
        onError: () => setNameError(t('settings.categories.failed')),
      },
    )
  }

  function toggleActive() {
    update.mutate({ id: category.id, active: !category.active })
  }

  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/15">
      {editing ? (
        <div className="flex flex-col gap-3">
          <Field label={t('settings.categories.name')} error={nameError}>
            {({ id }) => (
              <input
                id={id}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setNameError(null)
                }}
                className={inputClass}
              />
            )}
          </Field>
          <Field
            label={t('settings.categories.description')}
            hint={t('settings.categories.descriptionHint')}
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                type="text"
                value={description}
                aria-describedby={describedBy}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={update.isPending}
              className={primaryButtonClass}
            >
              {update.isPending ? t('settings.categories.saving') : t('settings.categories.save')}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setName(category.name)
                setDescription(category.description)
                setNameError(null)
              }}
              className={secondaryButtonClass}
            >
              {t('settings.categories.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`font-medium ${!category.active ? 'opacity-50' : ''}`}>
              {category.name}
              {!category.active && (
                <span className="ml-2 text-xs opacity-60">{t('settings.categories.inactive')}</span>
              )}
            </p>
            {category.description && <p className="text-xs opacity-60">{category.description}</p>}
          </div>
          <div className="flex shrink-0 gap-2 text-sm">
            <button type="button" onClick={() => setEditing(true)} className="underline opacity-70">
              {t('settings.categories.edit')}
            </button>
            <button
              type="button"
              onClick={toggleActive}
              disabled={update.isPending}
              className="underline opacity-70"
            >
              {category.active
                ? t('settings.categories.deactivate')
                : t('settings.categories.activate')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function NewCategoryForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const create = useCreateCategory()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  function submit() {
    if (!name.trim()) {
      setNameError(t('settings.categories.nameRequired'))
      return
    }
    create.mutate(
      { name: name.trim(), description: description.trim() },
      {
        onSuccess: () => onDone(),
        onError: () => setNameError(t('settings.categories.failed')),
      },
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 p-3 dark:border-white/15">
      <p className="text-sm font-medium">{t('settings.categories.addTitle')}</p>
      <Field label={t('settings.categories.name')} error={nameError}>
        {({ id }) => (
          <input
            id={id}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameError(null)
            }}
            className={inputClass}
          />
        )}
      </Field>
      <Field
        label={t('settings.categories.description')}
        hint={t('settings.categories.descriptionHint')}
      >
        {({ id, describedBy }) => (
          <input
            id={id}
            type="text"
            value={description}
            aria-describedby={describedBy}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={create.isPending}
          className={primaryButtonClass}
        >
          {create.isPending ? t('settings.categories.saving') : t('settings.categories.save')}
        </button>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          {t('settings.categories.cancel')}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Markup rates (domain-spec §1.3 and §8.3)
// ---------------------------------------------------------------------------

function MarkupsSection() {
  const { t } = useTranslation()
  const categories = useCategories(false)
  const rates = useMarkupRates()

  const allRates = rates.data ?? []
  const cats = categories.data ?? []

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>{t('settings.markups.title')}</SectionHeading>
      <ul className="flex flex-col gap-4">
        {cats.map((cat) => {
          const catRates = allRates.filter((r) => r.categoryId === cat.id)
          const current = catRates[0] ?? null
          return (
            <li key={cat.id}>
              <MarkupRow
                categoryId={cat.id}
                categoryName={cat.name}
                current={current}
                history={catRates}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

type MarkupRateShape = { id: string; markupPct: number; effectiveFrom: string }

function MarkupRow({
  categoryId,
  categoryName,
  current,
  history,
}: {
  categoryId: string
  categoryName: string
  current: MarkupRateShape | null
  history: MarkupRateShape[]
}) {
  const { t } = useTranslation()
  const today = useStoreToday()
  const setRate = useSetMarkupRate()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // Live worked example: buy at 100, sell at ~120 for a 20% markup.
  // `pct` is not a money-bearing name so the no-raw-money guard does not fire.
  const pct = parseFloat(text.replace(',', '.'))
  const exampleSell = Number.isFinite(pct) && pct >= 0 ? Math.round(100 * (1 + pct / 100)) : null

  function save() {
    const parsed = parseAmount(text.replace(',', '.'), { allowZero: true })
    if (!parsed.ok) {
      const keyMap = {
        empty: 'notANumber',
        not_a_number: 'notANumber',
        negative: 'negative',
        too_precise: 'tooPrecise',
        not_positive: 'notANumber',
      } as const
      setError(t(`settings.markups.${keyMap[parsed.error]}`))
      return
    }
    setSaved(false)
    setError(null)
    setRate.mutate(
      { categoryId, markupPct: parsed.value, effectiveFrom: today },
      {
        onSuccess: () => {
          setSaved(true)
          setText('')
        },
        onError: () => setError(t('settings.markups.failed')),
      },
    )
  }

  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/15">
      <p className="mb-3 font-medium">{categoryName}</p>

      {current ? (
        <p className="mb-2 text-sm opacity-70">
          {t('settings.markups.effectiveFrom', { date: formatDate(current.effectiveFrom) })} :{' '}
          {t('settings.markups.pctLabel').replace('%', '')}
          {current.markupPct} %
        </p>
      ) : (
        <p className="mb-2 text-sm opacity-50">{t('settings.markups.noRate')}</p>
      )}

      {saved && (
        <p role="status" className="mb-2 text-sm">
          {t('settings.markups.saved')}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Field label={t('settings.markups.pctLabel')} error={error}>
          {({ id }) => (
            <input
              id={id}
              type="text"
              inputMode="decimal"
              value={text}
              placeholder={current ? String(current.markupPct) : '0'}
              onChange={(e) => {
                setText(e.target.value)
                setError(null)
                setSaved(false)
              }}
              className={inputClass}
            />
          )}
        </Field>

        {exampleSell !== null && (
          <p className="text-xs opacity-70">
            {t('settings.markups.convention', {
              pct,
              sell: exampleSell,
              formatParams: {
                pct: { style: 'decimal', maximumFractionDigits: 2 },
                sell: { style: 'decimal', maximumFractionDigits: 0 },
              },
            })}
          </p>
        )}

        <p className="text-xs opacity-60">{t('settings.markups.effectiveNote')}</p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={setRate.isPending || !text}
            className={primaryButtonClass}
          >
            {setRate.isPending ? t('settings.markups.saving') : t('settings.markups.save')}
          </button>

          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className={secondaryButtonClass}
            >
              {t('settings.markups.historyTitle')}
            </button>
          )}
        </div>

        {showHistory && (
          <ul className="mt-1 flex flex-col gap-1">
            {history.map((r) => (
              <li key={r.id} className="text-xs opacity-60">
                {r.markupPct} % —{' '}
                {t('settings.markups.effectiveFrom', { date: formatDate(r.effectiveFrom) })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Charge categories
// ---------------------------------------------------------------------------

function ChargeCategoriesSection() {
  const { t } = useTranslation()
  const categories = useAllChargeCategories()
  const [adding, setAdding] = useState(false)

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>{t('settings.chargeCategories.title')}</SectionHeading>

      <ul className="flex flex-col gap-3">
        {(categories.data ?? []).map((cat) => (
          <li key={cat.id}>
            <ChargeCategoryRow cat={cat} />
          </li>
        ))}
      </ul>

      {adding ? (
        <NewChargeCategoryForm onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-fit text-sm underline opacity-70"
        >
          {t('settings.chargeCategories.add')}
        </button>
      )}
    </section>
  )
}

type ChargeCatFull = {
  id: string
  name: string
  nature: ChargeNature
  isSystem: boolean
  active: boolean
}

function ChargeCategoryRow({ cat }: { cat: ChargeCatFull }) {
  const { t } = useTranslation()
  const update = useUpdateChargeCategory()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(cat.name)
  const [nature, setNature] = useState<ChargeNature>(cat.nature)
  const [nameError, setNameError] = useState<string | null>(null)

  function save() {
    if (!name.trim()) {
      setNameError(t('settings.chargeCategories.nameRequired'))
      return
    }
    update.mutate(
      { id: cat.id, name: name.trim(), nature },
      {
        onSuccess: () => setEditing(false),
        onError: () => setNameError(t('settings.chargeCategories.failed')),
      },
    )
  }

  function toggleActive() {
    update.mutate({ id: cat.id, active: !cat.active })
  }

  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/15">
      {editing ? (
        <div className="flex flex-col gap-3">
          <Field label={t('charges.newCategoryName')} error={nameError}>
            {({ id }) => (
              <input
                id={id}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setNameError(null)
                }}
                className={inputClass}
                disabled={cat.isSystem}
              />
            )}
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('charges.newCategoryNature')}</legend>
            {(['operating', 'owner_draw'] as const).map((value) => (
              <label key={value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name={`nature-${cat.id}`}
                  value={value}
                  checked={nature === value}
                  onChange={() => setNature(value)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{t(`charges.nature.${value}`)}</span>
                  <span className="block text-xs opacity-70">
                    {t(`charges.natureHelp.${value}`)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={update.isPending}
              className={primaryButtonClass}
            >
              {update.isPending
                ? t('settings.chargeCategories.saving')
                : t('settings.chargeCategories.save')}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setName(cat.name)
                setNature(cat.nature)
                setNameError(null)
              }}
              className={secondaryButtonClass}
            >
              {t('settings.chargeCategories.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`font-medium ${!cat.active ? 'opacity-50' : ''}`}>
              {cat.name}
              {!cat.active && (
                <span className="ml-2 text-xs opacity-60">
                  {t('settings.chargeCategories.inactive')}
                </span>
              )}
              {cat.isSystem && (
                <span className="ml-2 text-xs opacity-50">
                  {t('settings.chargeCategories.system')}
                </span>
              )}
            </p>
            <p className="text-xs opacity-60">{t(`charges.nature.${cat.nature}`)}</p>
          </div>
          <div className="flex shrink-0 gap-2 text-sm">
            {!cat.isSystem && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="underline opacity-70"
              >
                {t('settings.chargeCategories.edit')}
              </button>
            )}
            <button
              type="button"
              onClick={toggleActive}
              disabled={update.isPending}
              className="underline opacity-70"
            >
              {cat.active
                ? t('settings.chargeCategories.deactivate')
                : t('settings.chargeCategories.activate')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function NewChargeCategoryForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const create = useCreateChargeCategory()
  const [name, setName] = useState('')
  const [nature, setNature] = useState<ChargeNature>('operating')
  const [nameError, setNameError] = useState<string | null>(null)

  function submit() {
    if (!name.trim()) {
      setNameError(t('settings.chargeCategories.nameRequired'))
      return
    }
    create.mutate(
      { name: name.trim(), nature },
      {
        onSuccess: () => onDone(),
        onError: () => setNameError(t('settings.chargeCategories.failed')),
      },
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 p-3 dark:border-white/15">
      <p className="text-sm font-medium">{t('settings.chargeCategories.addTitle')}</p>
      <Field label={t('charges.newCategoryName')} error={nameError}>
        {({ id }) => (
          <input
            id={id}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameError(null)
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
              name="new-charge-nature"
              value={value}
              checked={nature === value}
              onChange={() => setNature(value)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{t(`charges.nature.${value}`)}</span>
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
          {create.isPending
            ? t('settings.chargeCategories.saving')
            : t('settings.chargeCategories.save')}
        </button>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          {t('settings.chargeCategories.cancel')}
        </button>
      </div>
    </div>
  )
}
