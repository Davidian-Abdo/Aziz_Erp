import { useTranslation } from 'react-i18next'

/*
 * "What did I just enter?"
 *
 * Every entry screen ends with the last few records it wrote. Without it the
 * only feedback for a mistyped amount is a figure on the dashboard three days
 * later, by which time it is inside a report the owner has already read — and
 * this model turns a duplicated or inflated purchase into PROFIT
 * (plan §2.12), which is the failure nobody notices.
 */

export function RecentPanel({
  title,
  isPending,
  isEmpty,
  children,
}: {
  title: string
  isPending: boolean
  isEmpty: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold opacity-70">{title}</h2>
      {isPending ? (
        <p className="text-sm opacity-60">{t('app.loading')}</p>
      ) : isEmpty ? (
        <p className="text-sm opacity-60">{t('recent.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-black/10 dark:divide-white/10">{children}</ul>
      )}
    </section>
  )
}

export function RecentRow({
  primary,
  secondary,
  amount,
  onEdit,
  editLabel,
  onDelete,
  deleteLabel,
}: {
  primary: string
  secondary: string
  amount: React.ReactNode
  /*
   * Absent where a record cannot be corrected in place — an embedded count
   * belongs to its purchase and is edited from there (domain-spec §8.5,
   * 0014_edit_rpcs.sql). A row that offers an action which can only fail is
   * worse than a row that offers none.
   */
  onEdit?: () => void
  editLabel?: string
  onDelete?: () => void
  deleteLabel: string
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{primary}</p>
        <p className="truncate text-xs opacity-60">{secondary}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {amount}
        {onEdit && editLabel && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`${editLabel} — ${primary}`}
            className="text-xs underline opacity-60"
          >
            {editLabel}
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={deleteLabel}
            className="text-xs underline opacity-60"
          >
            {deleteLabel}
          </button>
        )}
      </div>
    </li>
  )
}
