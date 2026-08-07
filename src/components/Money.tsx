import { useTranslation } from 'react-i18next'
import { useDisplaySettings } from '@/lib/display-settings'

/*
 * <Money> — the honesty mechanism, not a formatting helper.
 *
 * domain-spec §7.2 is binding: every figure on screen is either MEASURED
 * (purchases, charges, losses, count values, cash out — things that happened)
 * or MODELLED (revenue, profit, allocated goods sold — things inferred from a
 * markup the shop may not actually charge). A modelled figure carries `≈`, a
 * distinct tint and a tooltip saying where it came from.
 *
 * The owner must never be able to mistake a model output for a measurement.
 * That is why `kind` is REQUIRED and has no default: a default would be chosen
 * once, here, and then silently applied to a figure nobody thought about.
 *
 * architecture-spec §5.4: raw number formatting anywhere else in the codebase is
 * a review failure. This is the only module in src/ that turns an amount into
 * text.
 */

export type MoneyKind = 'measured' | 'modelled'

type MoneyProps = {
  value: number | null | undefined
  kind: MoneyKind
  /** Markup behind a modelled figure, when one specific rate explains it. */
  markupPct?: number | null
  /** Renders the sign for negatives explicitly, for waterfall rows. */
  signed?: boolean
  className?: string
}

// Not exported, deliberately. If this were importable, any component could
// format an amount without deciding whether it is measured or modelled — which
// is the one decision domain-spec §7.2 does not allow to be skipped.
function formatAmount(value: number, locale: string, currencyCode: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function Money({ value, kind, markupPct, signed = false, className = '' }: MoneyProps) {
  const { t } = useTranslation()
  const { locale, currencyCode } = useDisplaySettings()

  // A missing figure is rendered as an em dash, never as 0. `report_period`
  // returns zeros for an empty period (asserted in 100_report_shape.sql), so a
  // null here means something did not arrive — and "0,00 MAD" would be a
  // statement about the shop rather than about the data.
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <span className={`tabular ${className}`} aria-label="—">
        —
      </span>
    )
  }

  const formatted = formatAmount(value, locale, currencyCode)
  const body = signed && value > 0 ? `+${formatted}` : formatted

  if (kind === 'measured') {
    return (
      <span className={`tabular ${className}`} data-kind="measured">
        {body}
      </span>
    )
  }

  const hint =
    markupPct === null || markupPct === undefined
      ? t('money.modelledHint')
      : t('money.modelledHintWithMarkup', { markup: markupPct })

  return (
    <span
      className={`tabular text-amber-700 dark:text-amber-400 ${className}`}
      data-kind="modelled"
      title={hint}
    >
      <abbr
        className="no-underline"
        title={hint}
        aria-label={`${t('money.modelledLabel')}: ${body}`}
      >
        <span aria-hidden="true">≈&nbsp;</span>
        {body}
      </abbr>
    </span>
  )
}
