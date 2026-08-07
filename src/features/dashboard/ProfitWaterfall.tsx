import { useTranslation } from 'react-i18next'
import { Money, type MoneyKind } from '@/components/Money'
import type { ReportPeriod } from '@/types/report'

/*
 * The profit waterfall of domain-spec §7.1 and §6.6:
 *
 *   revenue → −cost of goods → gross → −operating charges → −shrinkage
 *   → operating profit → −owner draws → net cash change
 *
 * ⚠ Rendered as a STEPPED STATEMENT, not as a bar chart, and that is a
 * deliberate deviation worth reading before "improving" it.
 *
 * A waterfall chart needs each bar's base, i.e. the running balance at every
 * step. `report_period` publishes three of them — gross profit, operating
 * profit and net cash change (§6.6) — and not the two intermediate ones. Drawing
 * the bars would therefore mean the app subtracting one reported figure from
 * another to place a rectangle, and architecture-spec §1.2 forbids exactly that:
 * "not a subtotal, not a percentage, not a difference between two figures
 * already on screen". A figure invented on the client to make a picture line up
 * is still a figure invented on the client, and it would be the one the eye
 * reads.
 *
 * So every number below is printed exactly as the engine emitted it, the
 * operators (−, =) are typography rather than arithmetic, and the chain reads
 * top to bottom. If the bars are wanted, the intermediate balances belong in
 * `report_period`, not here.
 */

type Step = {
  key: string
  /** The operator column: a deduction, or a subtotal line. */
  op: '−' | '='
  value: number
  kind: MoneyKind
}

export function ProfitWaterfall({ report }: { report: ReportPeriod }) {
  const { t } = useTranslation()
  const { measured, modelled } = report

  const steps: Step[] = [
    { key: 'goodsSold', op: '−', value: modelled.goods_sold_at_cost, kind: 'modelled' },
    { key: 'grossProfit', op: '=', value: modelled.gross_profit_est, kind: 'modelled' },
    { key: 'operatingCharges', op: '−', value: measured.operating_charges, kind: 'measured' },
    { key: 'shrinkage', op: '−', value: measured.shrinkage_losses, kind: 'measured' },
    { key: 'operatingProfit', op: '=', value: modelled.operating_profit_est, kind: 'modelled' },
    { key: 'ownerDrawsCash', op: '−', value: measured.owner_draws_cash, kind: 'measured' },
    { key: 'ownerDrawsInKind', op: '−', value: measured.owner_draws_in_kind, kind: 'measured' },
    { key: 'netCashChange', op: '=', value: modelled.net_cash_change_est, kind: 'modelled' },
  ]

  return (
    <section
      aria-label={t('dashboard.waterfall.title')}
      className="rounded-xl border border-black/10 p-4 dark:border-white/15"
    >
      <h2 className="text-sm font-semibold">{t('dashboard.waterfall.title')}</h2>

      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">{t('dashboard.waterfall.caption')}</caption>
        <tbody>
          <tr>
            <td className="py-1 pr-2 text-center opacity-50" aria-hidden="true" />
            <th scope="row" className="py-1 text-left font-normal">
              {t('dashboard.waterfall.revenue')}
            </th>
            <td className="py-1 text-right">
              <Money value={report.modelled.revenue_est} kind="modelled" />
            </td>
          </tr>

          {steps.map((step) => (
            <tr
              key={step.key}
              className={
                step.op === '='
                  ? 'border-t border-black/15 font-semibold dark:border-white/20'
                  : undefined
              }
            >
              <td className="py-1 pr-2 text-center opacity-50">{step.op}</td>
              <th
                scope="row"
                className={`py-1 text-left ${step.op === '=' ? 'font-semibold' : 'font-normal'}`}
              >
                {t(`dashboard.waterfall.${step.key}`)}
              </th>
              <td className="py-1 text-right">
                <Money value={step.value} kind={step.kind} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* §6.7 — the two meanings of "spent", never merged into one number. */}
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-black/10 pt-3 text-xs dark:border-white/15">
        <div className="flex gap-2">
          <dt className="opacity-70">{t('dashboard.cashOut')}</dt>
          <dd>
            <Money value={report.measured.cash_out} kind="measured" />
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="opacity-70">{t('dashboard.costIncurred')}</dt>
          <dd>
            <Money value={report.modelled.cost_incurred} kind="modelled" />
          </dd>
        </div>
        <p className="basis-full opacity-60">{t('dashboard.spentNote')}</p>
      </dl>
    </section>
  )
}
