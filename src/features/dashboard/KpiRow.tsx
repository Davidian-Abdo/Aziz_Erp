import { useTranslation } from 'react-i18next'
import { Money } from '@/components/Money'
import { formatDate } from '@/lib/dates'
import type { ReportPeriod } from '@/types/report'

/*
 * The six headline figures of domain-spec §7.1, in its order:
 *
 *   ≈ Revenue · ≈ Gross profit · Operating charges · ≈ Operating profit ·
 *   Cash out · Stock on hand
 *
 * Three of them are modelled and three are measured, and they sit side by side —
 * which is precisely why <Money kind> is mandatory. A tile reading a plain
 * number would be read as a fact about the shop's takings, and this system has
 * never measured a single sale.
 *
 * Stock on hand follows §6.8: the primary figure is the COUNTED value, the
 * upper bound is secondary and says so in words. Both are measured — the bound
 * is last count + purchases − declared losses, with no markup anywhere in it —
 * but a bound presented as a balance would be read as one.
 */
export function KpiRow({ report }: { report: ReportPeriod }) {
  const { t } = useTranslation()

  return (
    <section aria-label={t('dashboard.kpiTitle')} className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Kpi label={t('dashboard.revenue')}>
        <Money value={report.modelled.revenue_est} kind="modelled" />
      </Kpi>

      <Kpi label={t('dashboard.grossProfit')}>
        <Money value={report.modelled.gross_profit_est} kind="modelled" />
      </Kpi>

      <Kpi label={t('dashboard.operatingCharges')}>
        <Money value={report.measured.operating_charges} kind="measured" />
      </Kpi>

      <Kpi label={t('dashboard.operatingProfit')}>
        <Money value={report.modelled.operating_profit_est} kind="modelled" />
      </Kpi>

      <Kpi label={t('dashboard.cashOut')} note={t('dashboard.cashOutNote')}>
        <Money value={report.measured.cash_out} kind="measured" />
      </Kpi>

      <Kpi
        label={t('dashboard.stockOnHand')}
        note={
          report.stock_on_hand.oldest_count_on
            ? t('dashboard.oldestCount', {
                date: formatDate(report.stock_on_hand.oldest_count_on),
              })
            : t('dashboard.neverCountedShort')
        }
      >
        <Money value={report.stock_on_hand.total_last_counted} kind="measured" />
        <span className="mt-1 block text-xs font-normal opacity-70">
          {t('dashboard.atMost')}{' '}
          <Money value={report.stock_on_hand.max_possible} kind="measured" />
        </span>
      </Kpi>
    </section>
  )
}

function Kpi({
  label,
  note,
  children,
}: {
  label: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/15">
      <p className="text-xs opacity-70">{label}</p>
      <p className="mt-1 text-lg font-semibold">{children}</p>
      {note && <p className="mt-1 text-xs opacity-60">{note}</p>}
    </div>
  )
}
