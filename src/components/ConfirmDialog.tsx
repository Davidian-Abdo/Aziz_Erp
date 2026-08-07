import { useEffect, useRef } from 'react'
import { primaryButtonClass, secondaryButtonClass } from '@/components/Field'

/*
 * A blocking confirmation.
 *
 * Used for the plausibility check of domain-spec §3.2 — where `emphasise` is
 * `cancel`, because **Corriger** is the primary action and saving anyway is the
 * quiet one. That is not styling: the verdict exists because the entered figure
 * is probably a mistake, and a dialog whose loudest button is "save" teaches
 * the user to dismiss it.
 *
 * It never prevents saving. These are heuristics and the user may be right.
 *
 * Not a native <dialog>: `showModal()` is unevenly implemented in test
 * environments, and this needs to be exercised by the component suite.
 */

type ConfirmDialogProps = {
  title: string
  children: React.ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** Which button carries the weight. Defaults to the confirming one. */
  emphasise?: 'confirm' | 'cancel'
  busy?: boolean
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  emphasise = 'confirm',
  busy = false,
}: ConfirmDialogProps) {
  const focusRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    focusRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const cancelIsPrimary = emphasise === 'cancel'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-5 shadow-xl dark:bg-neutral-900"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="text-sm leading-relaxed">{children}</div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row-reverse">
          <button
            type="button"
            ref={cancelIsPrimary ? focusRef : null}
            onClick={onCancel}
            disabled={busy}
            className={cancelIsPrimary ? primaryButtonClass : secondaryButtonClass}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={cancelIsPrimary ? null : focusRef}
            onClick={onConfirm}
            disabled={busy}
            className={cancelIsPrimary ? secondaryButtonClass : primaryButtonClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
