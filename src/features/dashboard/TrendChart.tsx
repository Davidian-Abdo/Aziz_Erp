import { useTranslation } from 'react-i18next'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Money } from '@/components/Money'
import type { ReportTrend } from '@/types/report'

/*
 * The 12-month trend of domain-spec §7.1: monthly gross profit, cash out and
 * operating charges.
 *
 * Three series and not more, because the question this chart answers is "is the
 * shop getting better or worse", and a chart with six lines answers nothing.
 * Gross profit is MODELLED and the other two are MEASURED — the legend says so
 * and the tooltip renders every figure through <Money>, so the ≈ travels with
 * the number even here (§7.2).
 *
 * The chart does not compute anything: `report_trend` calls `report_period`
 * once per month (migration 0011), so a correction to the profit chain cannot
 * land in the KPI row and miss this chart. Recharts is given the figures as
 * they arrived and does its own pixel geometry.
 *
 * The <table> underneath is not a fallback — it is the accessible form of the
 * same data, and the only place the exact monthly figures can be read. An SVG
 * polyline is unreadable to a screen reader and imprecise to everyone else.
 */

const SERIES = [
  { key: 'gross_profit_est', colour: '#b45309', kind: 'modelled' },
  { key: 'cash_out', colour: '#1d4ed8', kind: 'measured' },
  { key: 'operating_charges', colour: '#047857', kind: 'measured' },
] as const

export function TrendChart({ trend }: { trend: ReportTrend }) {
  const { t } = useTranslation()

  const label = (key: (typeof SERIES)[number]['key']) => t(`dashboard.trend.${key}`)

  return (
    <section
      aria-label={t('dashboard.trend.title')}
      className="rounded-xl border border-black/10 p-4 dark:border-white/15"
    >
      <h2 className="text-sm font-semibold">{t('dashboard.trend.title')}</h2>
      <p className="mt-1 text-xs opacity-60">{t('dashboard.trend.note')}</p>

      <div className="mt-3 h-64 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            {/* Ticks are scale gradations, not figures about the shop: the
                figures are in the table below, each one through <Money>. */}
            <YAxis width={64} tick={{ fontSize: 11 }} />
            <Tooltip content={<TrendTooltip />} />
            <Legend formatter={(value: string) => label(value as (typeof SERIES)[number]['key'])} />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.key}
                stroke={s.colour}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 -mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">{t('dashboard.trend.caption')}</caption>
          <thead>
            <tr className="border-b border-black/10 text-start text-xs opacity-70 dark:border-white/15">
              <th scope="col" className="py-2 pe-3 font-medium">
                {t('dashboard.trend.month')}
              </th>
              {SERIES.map((s) => (
                <th key={s.key} scope="col" className="py-2 pe-3 text-end font-medium">
                  {label(s.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">
            {trend.map((row) => (
              <tr key={row.month}>
                <th scope="row" className="py-2 pe-3 text-start font-normal">
                  {row.month}
                  {/* The current month is partial by construction: report_period
                      clamped its end to today. Without this the last point looks
                      like trade collapsing. */}
                  {row.effective_to < row.to && (
                    <span className="ms-1 text-xs opacity-60">
                      {t('dashboard.trend.inProgress')}
                    </span>
                  )}
                </th>
                {SERIES.map((s) => (
                  <td key={s.key} className="py-2 pe-3 text-end">
                    <Money value={row[s.key]} kind={s.kind} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

type TooltipPayload = { name: string; value: number }

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-black/15 bg-white p-2 text-xs shadow dark:border-white/20 dark:bg-black">
      <p className="font-medium">{label}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {payload.map((entry) => {
          const series = SERIES.find((s) => s.key === entry.name)
          if (!series) return null
          return (
            <li key={entry.name} className="flex justify-between gap-3">
              <span className="opacity-70">{t(`dashboard.trend.${series.key}`)}</span>
              <Money value={entry.value} kind={series.kind} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
