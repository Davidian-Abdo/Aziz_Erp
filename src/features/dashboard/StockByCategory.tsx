import { useTranslation } from 'react-i18next'
import { Money } from '@/components/Money'
import { formatDateShort } from '@/lib/dates'
import type { ReportPeriod } from '@/types/report'

/*
 * Stock by category (domain-spec §7.1), with exactly the columns it names:
 *
 *   category · last count value · count date · freshness · purchased since ·
 *   markup · allocated goods sold · est. gross profit
 *
 * "Purchased since" is `unsettled_purchases` — what was bought after the last
 * count and whose fate is therefore unknown (§6.4). It is NOT part of the profit
 * chain and never will be until the shelf is counted; showing it beside the
 * modelled columns is how the owner sees which numbers are still open.
 *
 * The footer row is the same total the KPI above it shows, taken from the SAME
 * document rather than summed here (§9.5: every total is the sum of its
 * already-rounded parts, done once, in SQL). If a category table did not add up
 * to the headline, the owner would be right to stop trusting both.
 */
export function StockByCategory({ report }: { report: ReportPeriod }) {
  const { t } = useTranslation()

  return (
    <section
      aria-label={t('dashboard.stock.title')}
      className="rounded-xl border border-black/10 p-4 dark:border-white/15"
    >
      <h2 className="text-sm font-semibold">{t('dashboard.stock.title')}</h2>

      {/* Eight columns do not fit a phone. Scrolling the table beats hiding a
          column, because which column matters depends on the question. */}
      <div className="mt-3 -mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-start text-xs opacity-70 dark:border-white/15">
              <th scope="col" className="py-2 pe-3 font-medium">
                {t('dashboard.stock.category')}
              </th>
              <th scope="col" className="py-2 pe-3 text-end font-medium">
                {t('dashboard.stock.lastCount')}
              </th>
              <th scope="col" className="py-2 pe-3 font-medium">
                {t('dashboard.stock.countDate')}
              </th>
              <th scope="col" className="py-2 pe-3 text-end font-medium">
                {t('dashboard.stock.freshness')}
              </th>
              <th scope="col" className="py-2 pe-3 text-end font-medium">
                {t('dashboard.stock.purchasedSince')}
              </th>
              <th scope="col" className="py-2 pe-3 text-end font-medium">
                {t('dashboard.stock.markup')}
              </th>
              <th scope="col" className="py-2 pe-3 text-end font-medium">
                {t('dashboard.stock.goodsSold')}
              </th>
              <th scope="col" className="py-2 text-end font-medium">
                {t('dashboard.stock.grossProfit')}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-black/5 dark:divide-white/10">
            {report.by_category.map((row) => (
              <tr key={row.category_id}>
                <th scope="row" className="py-2 pe-3 text-start font-normal">
                  {row.name}
                </th>
                <td className="py-2 pe-3 text-end">
                  <Money value={row.last_count_value} kind="measured" />
                </td>
                <td className="py-2 pe-3">
                  {row.last_count_on ? (
                    formatDateShort(row.last_count_on)
                  ) : (
                    <span className="opacity-70">{t('dashboard.stock.never')}</span>
                  )}
                </td>
                <td className="py-2 pe-3 text-end tabular">
                  {row.days_since_count === null
                    ? '—'
                    : t('dashboard.stock.days', { count: row.days_since_count })}
                </td>
                <td className="py-2 pe-3 text-end">
                  <Money value={row.unsettled_purchases} kind="measured" />
                </td>
                <td className="py-2 pe-3 text-end tabular">
                  {row.markup_pct === null ? (
                    <span title={t('dashboard.quality.anomaly.no_markup')}>—</span>
                  ) : (
                    t('dashboard.stock.markupValue', { pct: row.markup_pct })
                  )}
                </td>
                <td className="py-2 pe-3 text-end">
                  <Money
                    value={row.goods_sold_at_cost}
                    kind="modelled"
                    markupPct={row.markup_pct}
                  />
                </td>
                <td className="py-2 text-end">
                  <Money value={row.gross_profit_est} kind="modelled" markupPct={row.markup_pct} />
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-black/15 font-semibold dark:border-white/20">
              <th scope="row" className="py-2 pe-3 text-start">
                {t('dashboard.stock.total')}
              </th>
              <td className="py-2 pe-3 text-end">
                <Money value={report.stock_on_hand.total_last_counted} kind="measured" />
              </td>
              <td className="py-2 pe-3" />
              <td className="py-2 pe-3" />
              <td className="py-2 pe-3 text-end">
                <Money value={report.coverage.unsettled_purchases} kind="measured" />
              </td>
              <td className="py-2 pe-3" />
              <td className="py-2 pe-3 text-end">
                <Money value={report.modelled.goods_sold_at_cost} kind="modelled" />
              </td>
              <td className="py-2 text-end">
                <Money value={report.modelled.gross_profit_est} kind="modelled" />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
