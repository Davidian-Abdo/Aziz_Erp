import { useId } from 'react'

/*
 * The shared shape of every entry field (domain-spec §8.5).
 *
 * The person filling these in is standing in a shop holding a phone, often with
 * one hand: targets are large, labels are always visible rather than collapsing
 * into placeholders, and an error is text next to the field, never a colour.
 */

type FieldProps = {
  label: string
  hint?: string
  error?: string | null
  children: (props: { id: string; describedBy: string | undefined }) => React.ReactNode
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-xs opacity-70">
          {hint}
        </p>
      )}
      {children({ id, describedBy })}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

export const inputClass =
  'w-full rounded-lg border border-black/20 bg-transparent px-3 py-3 text-base dark:border-white/25'

export const primaryButtonClass =
  'rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black'

export const secondaryButtonClass =
  'rounded-lg border border-black/20 px-4 py-3 font-medium disabled:opacity-50 dark:border-white/25'
