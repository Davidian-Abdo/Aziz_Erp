import { useTranslation } from 'react-i18next'
import { Field, inputClass } from '@/components/Field'
import { useDisplaySettings } from '@/lib/display-settings'
import type { AmountError } from '@/lib/amount'

/*
 * A money input.
 *
 * `type="text"` with `inputMode="decimal"` rather than `type="number"`: a
 * number input silently discards what it cannot parse, so a comma typed on a
 * French keyboard can empty the field as the user watches. Here the text stays
 * exactly as typed and `parseAmount` decides what it means.
 *
 * The currency is shown as an adornment, never formatted into the value —
 * formatting money is <Money>'s job and only <Money>'s (architecture-spec §5.4).
 */

type AmountFieldProps = {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  error?: AmountError | null
  autoFocus?: boolean
}

export function AmountField({ label, hint, value, onChange, error, autoFocus }: AmountFieldProps) {
  const { t } = useTranslation()
  const { currencyCode } = useDisplaySettings()

  return (
    <Field label={label} hint={hint} error={error ? t(`amount.error.${error}`) : null}>
      {({ id, describedBy }) => (
        <div className="flex items-center gap-2">
          <input
            id={id}
            aria-describedby={describedBy}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0,00"
            className={`tabular ${inputClass} text-lg`}
          />
          <span aria-hidden="true" className="shrink-0 text-sm opacity-60">
            {currencyCode}
          </span>
        </div>
      )}
    </Field>
  )
}
