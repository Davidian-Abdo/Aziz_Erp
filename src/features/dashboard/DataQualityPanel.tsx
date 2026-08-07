import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Money } from '@/components/Money'
import { formatDateShort } from '@/lib/dates'
import type { ReportPeriod } from '@/types/report'

/*
 * The data quality panel (domain-spec §6.5 and §7.1).
 *
 * "Always visible when problems exist, never collapsed away." Every other
 * section of this dashboard answers "how did the shop do"; this one answers
 * "how much of that is actually known", and it is the section that keeps the
 * rest honest. A modelled profit over a period that is 40% uncounted is not a
 * small error — it is a number with no evidence behind it, and nothing else on
 * the screen says so.
 *
 * Each item links to the screen that FIXES it, because a warning the owner
 * cannot act on is a warning they learn to scroll past. Counting a shelf is the
 * fix for all of them except a missing markup, which lives in settings.
 */
export function DataQualityPanel({ report }: { report: ReportPeriod }) {
  const { t } = useTranslation()
  const { coverage } = report

  const unsettled = report.by_category.filter((c) => c.unsettled_purchases > 0)

  const problems =
    coverage.categories_never_counted.length > 0 ||
    coverage.categories_stale.length > 0 ||
    coverage.anomalies.length > 0 ||
    unsettled.length > 0

  // Never-counted categories arrive as names — `report_period` emits a name
  // array for that key. The id needed for the link is looked up in
  // `by_category`, where the same category also appears; `article_category.name`
  // is UNIQUE in the schema, so the match is exact and not a heuristic.
  const idByName = new Map(report.by_category.map((c) => [c.name, c.category_id]))

  return (
    <section
      aria-label={t('dashboard.quality.title')}
      className={`rounded-xl border p-4 ${
        problems ? 'border-amber-500/50 bg-amber-500/5' : 'border-black/10 dark:border-white/15'
      }`}
    >
      <h2 className="text-sm font-semibold">{t('dashboard.quality.title')}</h2>

      <p className="mt-1 text-sm">
        <span className="font-semibold tabular">
          {t('dashboard.quality.coverageValue', { pct: coverage.pct })}
        </span>{' '}
        <span className="opacity-80">{t(`dashboard.coverageLevel.${coverage.level}`)}</span>
      </p>

      {!problems ? (
        <p className="mt-2 text-sm opacity-70">{t('dashboard.quality.allClear')}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {coverage.categories_never_counted.length > 0 && (
            <Group title={t('dashboard.quality.neverCounted')}>
              {coverage.categories_never_counted.map((name) => (
                <Item key={name} to={countLink(idByName.get(name))}>
                  {t('dashboard.quality.neverCountedItem', { category: name })}
                </Item>
              ))}
            </Group>
          )}

          {coverage.categories_stale.length > 0 && (
            <Group title={t('dashboard.quality.stale')}>
              {coverage.categories_stale.map((row) => (
                <Item key={row.category_id} to={countLink(row.category_id)}>
                  {t('dashboard.quality.staleItem', { category: row.name, days: row.days })}
                </Item>
              ))}
            </Group>
          )}

          {unsettled.length > 0 && (
            <Group title={t('dashboard.quality.unsettled')}>
              {/* §6.4's own wording: what was bought, since when, and what to do
                  about it. The system never extrapolates past the last count, so
                  this money is in cash out and in no profit figure at all. */}
              {unsettled.map((row) => (
                <Item key={row.category_id} to={countLink(row.category_id)}>
                  <span className="font-medium">{row.name}</span> —{' '}
                  <Money value={row.unsettled_purchases} kind="measured" />{' '}
                  {row.last_count_on
                    ? t('dashboard.quality.unsettledSince', {
                        date: formatDateShort(row.last_count_on),
                      })
                    : t('dashboard.quality.unsettledNeverCounted')}
                </Item>
              ))}
            </Group>
          )}

          {coverage.anomalies.length > 0 && (
            <Group title={t('dashboard.quality.anomalies')}>
              {/* Surfaced, never clamped (architecture-spec §3.4): an impossible
                  window is excluded from the profit chain AND named here, so the
                  underlying data can be corrected rather than quietly averaged
                  into a plausible-looking total. */}
              {coverage.anomalies.map((a) => (
                <Item
                  key={`${a.category_id}-${a.open_on}-${a.kind}`}
                  to={a.kind === 'no_markup' ? '/settings' : countLink(a.category_id)}
                >
                  <span className="font-medium">{a.category}</span>{' '}
                  <span className="opacity-70">
                    ({formatDateShort(a.open_on)} – {formatDateShort(a.close_on)})
                  </span>{' '}
                  — {t(`dashboard.quality.anomaly.${a.kind}`)}
                </Item>
              ))}
            </Group>
          )}
        </div>
      )}
    </section>
  )
}

function countLink(categoryId: string | undefined): string {
  return categoryId ? `/counts?category=${categoryId}` : '/counts'
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase opacity-60">{title}</h3>
      <ul className="mt-1 flex flex-col gap-1 text-sm">{children}</ul>
    </div>
  )
}

function Item({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="underline decoration-black/25 dark:decoration-white/30">
        {children}
      </Link>
    </li>
  )
}
