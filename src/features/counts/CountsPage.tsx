import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCategories } from '@/api/categories'
import {
  useDeleteCount,
  useLatestCount,
  useLatestCounts,
  useRecentCounts,
  useRecordSweep,
} from '@/api/counts'
import { useStoreToday } from '@/api/settings'
import { AmountField } from '@/components/AmountField'
import { CategorySelect } from '@/components/CategorySelect'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DateField } from '@/components/DateField'
import { primaryButtonClass } from '@/components/Field'
import { Money } from '@/components/Money'
import { RecentPanel, RecentRow } from '@/components/RecentPanel'
import { PlausibilityDialog } from './PlausibilityDialog'
import { SweepRow } from './SweepRow'
import { usePlausibilityGate } from './usePlausibilityGate'
import { useSweepDraft } from './useSweepDraft'
import { parseAmount, type AmountError } from '@/lib/amount'
import { formatDateShort } from '@/lib/dates'
import { writeErrorKey } from '@/lib/pg-errors'

/*
 * Stock count entry (domain-spec §8.3) — two modes:
 *
 *   single — one category, for the shelf that was just recounted;
 *   sweep  — every active category on one date, in one transaction. This is the
 *            month-end path, and it is what makes period reports land on real
 *            boundaries instead of being prorated across a window that happens
 *            to straddle the month.
 *
 * Both go through `record_count_sweep`: a single count is a sweep of one. Same
 * transaction, same idempotency, one code path to be wrong.
 *
 * Both end on the optional loss prompt of §4.3, asked at the moment the user is
 * physically looking at the shelves and most likely to remember. Skipping is
 * one tap and carries no penalty — an undeclared loss is reported as profit,
 * and nagging is how a prompt gets ignored.
 */

type Mode = 'single' | 'sweep'

export function CountsPage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('single')
  const [prompt, setPrompt] = useState(false)

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 pb-24">
      <h1 className="text-2xl font-semibold">{t('nav.counts')}</h1>

      <div role="tablist" aria-label={t('counts.mode')} className="flex gap-2">
        <ModeTab mode="single" current={mode} onSelect={setMode} label={t('counts.modeSingle')} />
        <ModeTab mode="sweep" current={mode} onSelect={setMode} label={t('counts.modeSweep')} />
      </div>

      {mode === 'single' ? (
        <SingleCountForm onSaved={() => setPrompt(true)} />
      ) : (
        <SweepForm onSaved={() => setPrompt(true)} />
      )}

      {prompt && <LossPrompt onClose={() => setPrompt(false)} />}

      <RecentCounts />
    </main>
  )
}

function ModeTab({
  mode,
  current,
  onSelect,
  label,
}: {
  mode: Mode
  current: Mode
  onSelect: (m: Mode) => void
  label: string
}) {
  const selected = mode === current
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(mode)}
      className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
        selected
          ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
          : 'border-black/20 dark:border-white/25'
      }`}
    >
      {label}
    </button>
  )
}

function SingleCountForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation()
  const today = useStoreToday()
  const categories = useCategories()
  const record = useRecordSweep()
  const gate = usePlausibilityGate()

  /*
   * `/counts?category=<id>` — how the dashboard's data quality panel links to
   * the shelf that needs counting (domain-spec §6.5: every item links to the
   * record that caused it). Landing on an empty form and having to remember
   * which of twelve rayons the warning named is how a warning gets ignored.
   *
   * Read once, as the initial value: after that the field belongs to the user,
   * and a URL that keeps re-selecting would fight them.
   */
  const [searchParams] = useSearchParams()

  const [categoryId, setCategoryId] = useState(() => searchParams.get('category') ?? '')
  const [date, setDate] = useState(today)
  const [text, setText] = useState('')
  const [amountError, setAmountError] = useState<AmountError | null>(null)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ replayed: boolean } | null>(null)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const previous = useLatestCount(categoryId || null)
  const category = (categories.data ?? []).find((c) => c.id === categoryId)

  function write(value: number) {
    record.mutate(
      { requestId, date, counts: [{ categoryId, valueAtCost: value }] },
      {
        onSuccess: (result) => {
          setSaved({ replayed: result.replayed })
          setText('')
          setCategoryId('')
          // A new count is a new submission; reusing this id would replay the
          // one just written.
          setRequestId(crypto.randomUUID())
          onSaved()
        },
      },
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseAmount(text, { allowZero: true })
    setAmountError(parsed.ok ? null : parsed.error)
    setCategoryError(categoryId ? null : t('counts.categoryRequired'))
    if (!parsed.ok || !categoryId) return
    setSaved(null)
    await gate.guard(categoryId, date, parsed.value, write)
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      {saved && (
        <p role="status" className="rounded-lg bg-black/5 p-3 text-sm dark:bg-white/10">
          {saved.replayed ? t('counts.savedReplayed') : t('counts.saved')}
        </p>
      )}

      <CategorySelect
        label={t('counts.category')}
        placeholder={t('counts.categoryPlaceholder')}
        categories={categories.data ?? []}
        value={categoryId}
        onChange={(id) => {
          setCategoryId(id)
          setCategoryError(null)
        }}
        error={categoryError}
      />

      <DateField label={t('counts.date')} value={date} onChange={setDate} today={today} />

      {categoryId && (
        <p className="text-xs opacity-70">
          {previous.data ? (
            <>
              {t('counts.previous', { date: formatDateShort(previous.data.occurredOn) })}{' '}
              <Money value={previous.data.valueAtCost} kind="measured" />
            </>
          ) : (
            t('counts.neverCounted')
          )}
        </p>
      )}

      {/* The whole shelf, not one product — the same trap as the purchase
          question (domain-spec §1.4, limitation 5). */}
      <AmountField
        label={t('counts.valueLabel')}
        hint={t('counts.wholeShelfHint')}
        value={text}
        onChange={(v) => {
          setText(v)
          setAmountError(null)
        }}
        error={amountError}
      />

      {record.isError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t(`write.error.${writeErrorKey(record.error)}`)}
        </p>
      )}

      <button
        type="submit"
        disabled={record.isPending || gate.checking}
        className={primaryButtonClass}
      >
        {record.isPending ? t('counts.saving') : t('counts.save')}
      </button>

      {gate.verdict && (
        <PlausibilityDialog
          verdict={gate.verdict}
          categoryName={category?.name ?? ''}
          onFix={gate.dismiss}
          onSaveAnyway={() => gate.override(write)}
        />
      )}
    </form>
  )
}

function SweepForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation()
  const today = useStoreToday()
  const categories = useCategories()
  const record = useRecordSweep()

  const rows = categories.data ?? []
  const draft = useSweepDraft(rows.map((c) => c.id))
  const previous = useLatestCounts(rows.map((c) => c.id))

  const [date, setDate] = useState(today)
  const [showIncomplete, setShowIncomplete] = useState(false)
  const [saved, setSaved] = useState<{ replayed: boolean; n: number } | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.isComplete) {
      setShowIncomplete(true)
      return
    }
    setSaved(null)
    record.mutate(
      { requestId: draft.requestId, date, counts: draft.entries },
      {
        onSuccess: (result) => {
          setSaved({ replayed: result.replayed, n: result.n })
          draft.reset()
          onSaved()
        },
      },
    )
  }

  if (categories.isPending) return <p className="text-sm opacity-70">{t('app.loading')}</p>

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {saved && (
        <p role="status" className="rounded-lg bg-black/5 p-3 text-sm dark:bg-white/10">
          {saved.replayed ? t('counts.savedReplayed') : t('counts.sweepSaved', { n: saved.n })}
        </p>
      )}

      <p className="text-sm opacity-80">{t('counts.sweepIntro')}</p>

      <DateField label={t('counts.date')} value={date} onChange={setDate} today={today} />

      <ul className="flex flex-col gap-3">
        {rows.map((c) => (
          <SweepRow
            key={c.id}
            name={c.name}
            description={c.description}
            value={draft.values[c.id] ?? ''}
            onChange={(v) => draft.setValue(c.id, v)}
            previous={previous.byCategory[c.id] ?? null}
          />
        ))}
      </ul>

      <div className="flex items-baseline justify-between border-t border-black/10 pt-3 dark:border-white/15">
        <span className="text-sm opacity-70">{t('counts.total')}</span>
        <Money value={draft.total} kind="measured" className="text-lg font-semibold" />
      </div>

      {showIncomplete && !draft.isComplete && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t('counts.sweepIncomplete')}
        </p>
      )}

      {record.isError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t(`write.error.${writeErrorKey(record.error)}`)}
        </p>
      )}

      <button type="submit" disabled={record.isPending} className={primaryButtonClass}>
        {record.isPending ? t('counts.saving') : t('counts.saveSweep')}
      </button>
    </form>
  )
}

/*
 * The optional prompt of domain-spec §4.3.
 *
 * Without it, every loss the owner forgets to declare is inferred as goods
 * sold, at full markup, and reported as profit. The moment to ask is now — they
 * are standing at the shelf they just counted.
 */
function LossPrompt({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <ConfirmDialog
      title={t('counts.lossPromptTitle')}
      confirmLabel={t('counts.lossPromptYes')}
      cancelLabel={t('counts.lossPromptNo')}
      onConfirm={() => {
        onClose()
        void navigate('/losses')
      }}
      onCancel={onClose}
    >
      <p>{t('counts.lossPromptBody')}</p>
    </ConfirmDialog>
  )
}

function RecentCounts() {
  const { t } = useTranslation()
  const recent = useRecentCounts()
  const remove = useDeleteCount()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const rows = recent.data ?? []

  return (
    <>
      <RecentPanel
        title={t('counts.recent')}
        isPending={recent.isPending}
        isEmpty={rows.length === 0}
      >
        {rows.map((row) => (
          <RecentRow
            key={row.id}
            primary={row.categoryName}
            secondary={`${formatDateShort(row.occurredOn)} · ${t(`counts.source.${row.source}`)}`}
            amount={<Money value={row.valueAtCost} kind="measured" />}
            // A count embedded in a purchase belongs to that purchase and is
            // deleted with it; offering a delete here would only produce a
            // foreign-key error the user cannot act on.
            onDelete={row.source === 'standalone' ? () => setPendingDelete(row.id) : undefined}
            deleteLabel={t('common.delete')}
          />
        ))}
      </RecentPanel>

      {pendingDelete && (
        <ConfirmDialog
          title={t('counts.deleteTitle')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          emphasise="cancel"
          busy={remove.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() =>
            remove.mutate(pendingDelete, { onSettled: () => setPendingDelete(null) })
          }
        >
          <p>{t('counts.deleteBody')}</p>
        </ConfirmDialog>
      )}
    </>
  )
}

export { SingleCountForm, SweepForm }
