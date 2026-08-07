import { useTranslation } from 'react-i18next'

/*
 * The entry screens are Phase 4 and settings is Phase 6. These routes exist now
 * so the shell is genuinely navigable and the tab bar is not a set of dead
 * links — and they say plainly what they are rather than implying a screen that
 * is nearly finished.
 */
export function PlaceholderPage({ titleKey, bodyKey }: { titleKey: string; bodyKey: string }) {
  const { t } = useTranslation()
  return (
    <main className="flex flex-col gap-2 p-4">
      <h1 className="text-2xl font-semibold">{t(titleKey)}</h1>
      <p className="text-sm opacity-70">{t(bodyKey)}</p>
    </main>
  )
}
