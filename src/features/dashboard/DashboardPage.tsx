import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportPeriod, useReportTrend } from '@/api/report'
import { formatDate } from '@/lib/dates'
import { ChargesBreakdown } from './ChargesBreakdown'
import { DataQualityPanel } from './DataQualityPanel'
import { KpiRow } from './KpiRow'
import { PeriodSelector } from './PeriodSelector'
import { ProfitWaterfall } from './ProfitWaterfall'
import { StockByCategory } from './StockByCategory'
import { usePeriod } from './usePeriod'

/*
 * The trend chart is the only thing in this app that needs a charting library,
 * and recharts is 385 kB of the bundle — more than everything else on this
 * screen put together. Loaded eagerly it lands in the first request, on a phone,
 * on a mobile connection, before a single figure is on screen.
 *
 * Split out, the KPI row and the data quality panel render from the first
 * chunk and the chart arrives afterwards. It is the section furthest down the
 * page and the least urgent: nobody opens this app to check a 12-month trend
 * before checking whether yesterday's purchase was recorded.
 */
const TrendChart = lazy(async () => ({ default: (await import('./TrendChart')).TrendChart }))

/*
 * The global information section (domain-spec §7.1), in its order: period
 * selector, KPI row, profit waterfall, stock by category, charges breakdown,
 * trend, data quality.
 *
 * Every figure below originates from `report_period` (plan Phase 5 exit
 * criterion). This file composes and labels; it does not compute, and
 * `no-raw-money.test.ts` fails the build if that stops being true.
 *
 * ⚠ The data quality panel is rendered ABOVE the trend rather than last. §7.1
 * lists it last and says it must never be collapsed away when problems exist —
 * and a panel below a 12-month chart on a phone is collapsed away by the
 * scrollbar. The order of the honest sections is the one thing worth deviating
 * on: the owner should not read a modelled profit and only afterwards learn
 * that half the period was never counted.
 */
export function DashboardPage() {
  const { t } = useTranslation()
  const period = usePeriod()

  const report = useReportPeriod(period.range.from, period.range.to)
  const trend = useReportTrend(12)

  /*
   * The period as the engine actually computed it.
   *
   * `period.to` is what was asked for; `effective_to` is what was reported on,
   * clamped to today (plan §2.2). When they differ the heading has to say so —
   * "this month" three days into the month is not a collapse in trade, and the
   * figures beneath would otherwise read as one.
   */
  const p = report.data?.period
  const heading = !p
    ? null
    : p.clamped
      ? t('dashboard.periodClamped', {
          from: formatDate(p.from),
          to: formatDate(p.to),
          effective: formatDate(p.effective_to),
        })
      : `${formatDate(p.from)} – ${formatDate(p.to)}`

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 pb-24">
      <header>
        <h1 className="text-2xl font-semibold">{t('dashboard.title')}</h1>
        {heading && <p className="text-sm opacity-70">{heading}</p>}
      </header>

      <PeriodSelector period={period} />

      {report.isPending && <p className="text-sm opacity-70">{t('app.loading')}</p>}

      {report.isError && (
        // A document that does not parse is a document that is not displayed:
        // a wrong number is worse than a missing one, because nobody notices.
        <div role="alert" className="rounded-xl border border-red-500/40 p-4">
          <h2 className="font-semibold">{t('error.title')}</h2>
          <p className="mt-1 text-sm opacity-80">{t('error.reportUnreadable')}</p>
        </div>
      )}

      {report.data && (
        <>
          <KpiRow report={report.data} />
          <ProfitWaterfall report={report.data} />
          <StockByCategory report={report.data} />
          <ChargesBreakdown report={report.data} />
          <DataQualityPanel report={report.data} />
        </>
      )}

      {trend.data && (
        <Suspense fallback={<p className="text-sm opacity-70">{t('app.loading')}</p>}>
          <TrendChart trend={trend.data} />
        </Suspense>
      )}
    </main>
  )
}
