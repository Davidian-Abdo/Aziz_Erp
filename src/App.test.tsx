import { render, screen } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import App from './App'
import type { AuthState } from '@/api/auth'
import type { Settings } from '@/api/settings'

/*
 * The three gates of App.tsx. The middle one is worth testing hardest: a
 * successful login is not access. Without it a user who is authenticated but
 * absent from `app_user` reaches the dashboard and every figure reads zero —
 * which looks exactly like a shop that has not traded, and is the failure mode
 * plan_review R2 was written about.
 */

const auth = vi.hoisted(() => ({ state: { status: 'loading', session: null } as AuthState }))
const remote = vi.hoisted(() => ({
  allowlisted: undefined as boolean | undefined,
  settings: null as Settings | null,
  pending: false,
}))

vi.mock('@/api/auth', () => ({
  useAuth: () => auth.state,
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/api/settings', () => ({
  useIsAllowlisted: () => ({ isPending: remote.pending, data: remote.allowlisted }),
  useSettings: () => ({ isPending: remote.pending, data: remote.settings }),
  useStoreToday: () => '2026-08-03',
  settingsQueryKey: ['app_settings'],
  allowlistQueryKey: ['app_user', 'self'],
}))

vi.mock('@/api/categories', () => ({
  useCategories: () => ({ isPending: false, data: [] }),
  categoriesQueryKey: ['article_category'],
}))

vi.mock('@/api/onboarding', () => ({
  useCompleteOnboarding: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

vi.mock('@/api/report', () => ({
  useReportPeriod: () => ({ isPending: true, isError: false, data: undefined }),
  useReportTrend: () => ({ isPending: true, isError: false, data: undefined }),
}))

const SIGNED_IN: AuthState = {
  status: 'signedIn',
  session: { user: { id: 'u1' } } as unknown as Session,
}

const OPEN_BOOKS: Settings = {
  locale: 'fr',
  currencyCode: 'MAD',
  storeName: 'Aziz',
  timezone: 'Africa/Casablanca',
  onboardedAt: '2026-08-03T09:00:00Z',
}

beforeEach(() => {
  auth.state = { status: 'loading', session: null }
  remote.allowlisted = undefined
  remote.settings = null
  remote.pending = false
  window.history.pushState({}, '', '/')
})

describe('App gates', () => {
  it('shows the login screen when signed out, and offers no way to register', () => {
    auth.state = { status: 'signedOut', session: null }
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Aziz ERP' })).toBeInTheDocument()
    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument()
    // No signup route by design: public signup is disabled on the project, so a
    // form offering it could only ever fail.
    expect(screen.queryByText(/inscri|créer un compte/i)).not.toBeInTheDocument()
  })

  it('tells an authenticated non-allowlisted user why, instead of showing empty screens', () => {
    auth.state = SIGNED_IN
    remote.allowlisted = false
    remote.settings = OPEN_BOOKS
    render(<App />)

    expect(screen.getByRole('alert')).toHaveTextContent(/n’a pas accès/i)
    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).not.toBeInTheDocument()
  })

  it('forces the opening sweep before anything else when the books are not open', () => {
    auth.state = SIGNED_IN
    remote.allowlisted = true
    remote.settings = { ...OPEN_BOOKS, onboardedAt: null }
    window.history.pushState({}, '', '/purchases')
    render(<App />)

    // Even a deep link lands on the sweep: domain-spec §3.5 makes the dashboard
    // unreachable until the books are open.
    expect(screen.getByRole('heading', { name: 'Ouverture des comptes' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('reaches the application once signed in, allowlisted and onboarded', () => {
    auth.state = SIGNED_IN
    remote.allowlisted = true
    remote.settings = OPEN_BOOKS
    render(<App />)

    expect(screen.getByRole('link', { name: 'Achats' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Réglages' })).toBeInTheDocument()
  })
})
