import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { signIn } from '@/api/auth'

/*
 * The only way in (architecture-spec §5.2). There is no signup route and no
 * password-reset route: public signup is disabled on the project and the single
 * account is created by the owner from the dashboard.
 */
export function LoginPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      // Never distinguish "no such account" from "wrong password" — that
      // difference is only useful to somebody who is guessing.
      const offline = err instanceof Error && /fetch|network/i.test(err.message)
      setError(offline ? t('login.offline') : t('login.failed'))
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">{t('app.name')}</h1>
        <p className="mt-1 text-sm opacity-70">{t('login.subtitle')}</p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t('login.email')}</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-black/20 px-3 py-3 text-base dark:border-white/25"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t('login.password')}</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-black/20 px-3 py-3 text-base dark:border-white/25"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
    </main>
  )
}
