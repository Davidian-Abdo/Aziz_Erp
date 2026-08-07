import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { signOut } from '@/api/auth'
import { useDisplaySettings } from '@/lib/display-settings'

/*
 * Bottom tab bar on mobile, sidebar on desktop (architecture-spec §5.2).
 *
 * The person entering data is standing in a shop holding a phone, so the
 * primary layout is the phone one and the desktop sidebar is the variant.
 */

const routes = [
  { to: '/', key: 'dashboard', end: true },
  { to: '/purchases', key: 'purchases', end: false },
  { to: '/charges', key: 'charges', end: false },
  { to: '/counts', key: 'counts', end: false },
  { to: '/losses', key: 'losses', end: false },
  { to: '/settings', key: 'settings', end: false },
] as const

export function AppLayout() {
  const { t } = useTranslation()
  const { storeName } = useDisplaySettings()

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <nav
        aria-label={t('nav.dashboard')}
        className="order-2 border-t border-black/10 bg-white/80 backdrop-blur md:order-1 md:w-56 md:shrink-0 md:border-t-0 md:border-r md:bg-transparent dark:border-white/15 dark:bg-black/60 md:dark:bg-transparent"
      >
        <div className="hidden px-4 py-5 md:block">
          <p className="text-lg font-semibold">{storeName}</p>
          <p className="text-xs opacity-60">{t('app.name')}</p>
        </div>

        <ul className="sticky bottom-0 flex justify-around md:flex-col md:justify-start md:gap-1 md:px-2">
          {routes.map((r) => (
            <li key={r.to} className="flex-1 md:flex-none">
              <NavLink
                to={r.to}
                end={r.end}
                className={({ isActive }) =>
                  `block px-2 py-3 text-center text-xs md:rounded-lg md:px-3 md:text-left md:text-sm ${
                    isActive ? 'font-semibold' : 'opacity-70'
                  } ${isActive ? 'bg-black/5 dark:bg-white/10' : ''}`
                }
              >
                {t(`nav.${r.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="hidden px-4 py-4 md:block">
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-xs underline opacity-60"
          >
            {t('nav.signOut')}
          </button>
        </div>
      </nav>

      <div className="order-1 min-w-0 flex-1 md:order-2">
        <Outlet />
      </div>
    </div>
  )
}
