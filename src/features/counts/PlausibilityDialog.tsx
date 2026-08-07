import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Money } from '@/components/Money'
import type { Plausibility } from '@/types/writes'

/*
 * "Vous avez saisi 50, mais Produits laitiers devrait contenir environ 1 000.
 * Est-ce correct ?" — domain-spec §3.2.
 *
 * The expected figure is in the message on purpose. A verdict of "implausible"
 * tells the user they are wrong; the figure tells them what to go and look at.
 * Both amounts are measured, not modelled: one was typed, the other is derived
 * from counts and purchases without a markup anywhere in it (§6.8).
 */
export function PlausibilityDialog({
  verdict,
  categoryName,
  onFix,
  onSaveAnyway,
}: {
  verdict: Plausibility
  categoryName: string
  onFix: () => void
  onSaveAnyway: () => void
}) {
  const { t } = useTranslation()

  return (
    <ConfirmDialog
      title={t('plausibility.title')}
      // "Corriger" carries the weight: the verdict exists because the figure is
      // probably a mistake, and a dialog whose loudest button saves teaches the
      // user to dismiss it.
      emphasise="cancel"
      cancelLabel={t('plausibility.fix')}
      confirmLabel={t('plausibility.saveAnyway')}
      onCancel={onFix}
      onConfirm={onSaveAnyway}
    >
      <p>
        {t('plausibility.entered')} <Money value={verdict.entered} kind="measured" />
        {verdict.expected_on_hand !== null && (
          <>
            {' '}
            {t('plausibility.butExpected', { category: categoryName })}{' '}
            <Money value={verdict.expected_on_hand} kind="measured" />
          </>
        )}
        .
      </p>
      <p className="mt-2 opacity-80">{t(`plausibility.verdict.${verdict.verdict}`)}</p>
      <p className="mt-2 text-xs opacity-70">{t('plausibility.heuristic')}</p>
    </ConfirmDialog>
  )
}
