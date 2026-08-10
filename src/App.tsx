import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/api/auth'
import { useIsAllowlisted, useSettings } from '@/api/settings'
import { DisplaySettingsContext, DEFAULT_DISPLAY_SETTINGS } from '@/lib/display-settings'
import { AppLayout } from '@/components/AppLayout'
import { LoginPage } from '@/features/auth/LoginPage'
import { OpeningSweepPage } from '@/features/onboarding/OpeningSweepPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { PurchasePage } from '@/features/purchases/PurchasePage'
import { ChargesPage } from '@/features/charges/ChargesPage'
import { CountsPage } from '@/features/counts/CountsPage'
import { LossesPage } from '@/features/losses/LossesPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

/*
 * Three gates, in this order — each one only makes sense once the previous
 * passed:
 *
 *   1. signed in?   — otherwise the login screen. No signup route exists.
 *   2. allowlisted? — a successful login is NOT access (architecture-spec §4.2).
 *                     Without this check, a user who is not in `app_user` meets
 *                     a working application in which every screen is empty and
 *                     nothing explains why.
 *   3. books open?  — otherwise the opening sweep (domain-spec §3.5). The
 *                     dashboard is unreachable until it completes.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Gates />
    </BrowserRouter>
  )
}

function Gates() {
  const { t } = useTranslation()
  const auth = useAuth()

  if (auth.status === 'loading') {
    return <FullScreenMessage>{t('app.loading')}</FullScreenMessage>
  }

  if (auth.status === 'signedOut') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return <SignedIn />
}

function SignedIn() {
  const { t } = useTranslation()
  const allowlisted = useIsAllowlisted()
  const settings = useSettings()

  if (allowlisted.isPending || settings.isPending) {
    return <FullScreenMessage>{t('app.loading')}</FullScreenMessage>
  }

  // Authenticated, but not a member of this shop. Say so, rather than showing
  // six empty screens.
  if (allowlisted.data !== true) {
    return <FullScreenMessage role="alert">{t('login.noAccess')}</FullScreenMessage>
  }

  const display = settings.data
    ? {
        locale: settings.data.locale,
        currencyCode: settings.data.currencyCode,
        storeName: settings.data.storeName,
      }
    : DEFAULT_DISPLAY_SETTINGS

  return (
    <DisplaySettingsContext value={display}>
      {settings.data?.onboardedAt ? (
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="/purchases" element={<PurchasePage />} />
            <Route path="/charges" element={<ChargesPage />} />
            <Route path="/counts" element={<CountsPage />} />
            <Route path="/losses" element={<LossesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
        // No other route is reachable until the books are open.
        <Routes>
          <Route path="*" element={<OpeningSweepPage />} />
        </Routes>
      )}
    </DisplaySettingsContext>
  )
}

function FullScreenMessage({
  children,
  role,
}: {
  children: React.ReactNode
  role?: 'alert' | 'status'
}) {
  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-2 p-6 text-center">
      <p role={role} className="text-sm opacity-80">
        {children}
      </p>
    </main>
  )
}
