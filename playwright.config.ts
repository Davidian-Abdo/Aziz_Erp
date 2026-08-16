import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

/*
 * `.env` reaches the specs through the same loader that builds the bundle.
 *
 * `vite preview` serves a build that baked `VITE_SUPABASE_URL` in; the specs
 * need the identical value to do their housekeeping deletes over PostgREST.
 * Reading it here means there is one source of that project reference instead
 * of a literal pasted into each spec — a copy that cannot follow `.env`, and
 * therefore one that eventually deletes rows out of a project the app under
 * test is not even talking to.
 */
Object.assign(process.env, loadEnv('production', process.cwd(), 'VITE_'))

/*
 * Flow tests (plan §5.1, Phase 4 exit criterion).
 *
 * These run against a REAL Supabase project and a real browser, because what
 * they check cannot be faked: that a retried purchase creates one row and not
 * two, and that a month-end sweep is written in a single transaction. A mocked
 * client would only prove the mock is idempotent.
 *
 * ⚠ They cannot run on the Hetzner dev box: Playwright ships no Chromium build
 * for its Ubuntu 26.04 and there is no system Chrome (`last_session_work.md`).
 * The specs are written to be run on a machine that has a browser —
 * `npx playwright install chromium` first. See `e2e/README.md`.
 *
 * The suite needs credentials for an ALLOWLISTED user of a NON-PRODUCTION
 * project: it writes purchases, counts and losses, and it does not clean up
 * after itself — an entry screen has no delete-everything button and inventing
 * one for the tests would be inventing a hole in the application.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one shop, one ledger: parallel writes would interfere
  forbidOnly: !!process.env.CI,
  retries: 0, // a retried flow test would hide exactly the double-write it hunts
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    locale: 'fr-MA',
    timezoneId: 'Africa/Casablanca',
  },
  projects: [
    {
      // The person entering data is holding a phone. Test that viewport, not a
      // desktop one that never exists in the shop.
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
