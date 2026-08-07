import { useTranslation } from 'react-i18next'
import { Money } from '@/components/Money'
import type { ReportPeriod } from '@/types/report'

/*
 * Charges by category, with operating charges and owner draws VISUALLY
 * SEPARATED (domain-spec §7.1).
 *
 * The separation is the whole point of the section, not styling. An operating
 * charge is the shop spending money to trade; an owner draw is the owner taking
 * money out. Only the first reduces the shop's result (§6.6), and a shopkeeper
 * looking at one list of numbers will read a wedding as a bad month.
 *
 * Each group's subtotal comes from `measured.operating_charges` and
 * `measured.owner_draws_cash` — the same figures the KPI row and the waterfall
 * use. Summing the rows here instead would produce a second number that agrees
 * today and drifts the first time rounding changes.
 */
export function ChargesBreakdown({ report }: { report: ReportPeriod }) {
  const { t } = useTranslation()

  const operating = report.charges_by_category.filter((c) => c.nature === 'operating')
  const draws = report.charges_by_category.filter((c) => c.nature === 'owner_draw')

  return (
    <section
      aria-label={t('dashboard.charges.title')}
      className="rounded-xl border border-black/10 p-4 dark:border-white/15"
    >
      <h2 className="text-sm font-semibold">{t('dashboard.charges.title')}</h2>

      {report.charges_by_category.length === 0 ? (
        <p className="mt-2 text-sm opacity-60">{t('dashboard.charges.empty')}</p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <ChargeGroup
            title={t('dashboard.charges.operating')}
            note={t('dashboard.charges.operatingNote')}
            rows={operating}
            total={report.measured.operating_charges}
          />
          <ChargeGroup
            title={t('dashboard.charges.ownerDraws')}
            note={t('dashboard.charges.ownerDrawsNote')}
            rows={draws}
            total={report.measured.owner_draws_cash}
          />
        </div>
      )}

      {/* Goods taken home are an owner draw too, but they are a LOSS row, not a
          charge — so they cannot appear in either list above without being
          counted twice (§6.6). Shown here, apart, because the owner asking
          "what did I take out" means both. */}
      <p className="mt-3 flex flex-wrap items-baseline gap-2 border-t border-black/10 pt-3 text-xs dark:border-white/15">
        <span className="opacity-70">{t('dashboard.charges.inKind')}</span>
        <Money value={report.measured.owner_draws_in_kind} kind="measured" />
        <span className="basis-full opacity-60">{t('dashboard.charges.inKindNote')}</span>
      </p>
    </section>
  )
}

function ChargeGroup({
  title,
  note,
  rows,
  total,
}: {
  title: string
  note: string
  rows: ReportPeriod['charges_by_category']
  total: number
}) {
  const { t } = useTranslation()

  return (
    <div className="rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.06]">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-0.5 text-xs opacity-60">{note}</p>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm opacity-60">{t('dashboard.charges.none')}</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-black/5 text-sm dark:divide-white/10">
          {rows.map((row) => (
            <li key={row.charge_category_id} className="flex justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate">{row.name}</span>
              <Money value={row.amount} kind="measured" />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 flex justify-between gap-3 border-t border-black/10 pt-2 text-sm font-semibold dark:border-white/15">
        <span>{t('dashboard.charges.subtotal')}</span>
        <Money value={total} kind="measured" />
      </p>
    </div>
  )
}
