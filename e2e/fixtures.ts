import { test as base, expect, type Page } from '@playwright/test'
import { t } from './i18n'

/*
 * Signing in, once, for every flow test.
 *
 * There is no signup route and public signup is disabled on the project, so the
 * user must already exist AND hold a row in `app_user` — a login that is not
 * allowlisted reaches a screen saying so and nothing else (architecture-spec
 * §4.2). If these tests fail at the first step with the "no access" message,
 * that is the allowlist, not the password.
 */

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

/*
 * The project the app under test is talking to. `playwright.config.ts` loads
 * `.env` into `process.env` with Vite's own loader, so these are exactly the
 * values the built bundle carries — one source, not two.
 *
 * ⚠ Until 2026-08-16 the project ref and the anon key were pasted literally
 * into three specs. That is a copy that cannot follow `.env`: point the app at
 * a second project and the tests keep deleting rows out of the first one, with
 * every assertion still green. In this model a purchase deleted from the wrong
 * ledger is a wrong profit figure, not a lost test artefact.
 */
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

export const test = base.extend<{ signedIn: Page }>({
  signedIn: async ({ page }, use) => {
    if (!EMAIL || !PASSWORD) {
      throw new Error(
        'E2E_EMAIL and E2E_PASSWORD are required — an allowlisted user of a NON-PRODUCTION Supabase project.',
      )
    }

    await page.goto('/login')
    await page.getByLabel(t('login.email')).fill(EMAIL)
    await page.getByLabel(t('login.password')).fill(PASSWORD)
    await page.getByRole('button', { name: t('login.submit') }).click()

    // The three gates of App.tsx have all passed only once a real screen shows.
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 30_000 })
    await use(page)
  },
})

/**
 * The signed-in user's access token, read from the Supabase client's own
 * storage. Used for the housekeeping deletes below — the application has no
 * delete-everything button and inventing one for the tests would be inventing a
 * hole in it (`e2e/README.md`).
 */
async function accessToken(page: Page): Promise<string | null> {
  return page.evaluate((): string | null => {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token'),
    )
    return key
      ? (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token
      : null
  })
}

/**
 * DELETE rows matching a PostgREST query, as the signed-in user.
 *
 * `query` is everything after `/rest/v1/` — e.g.
 * `purchase?note=like.e2e-*`. RLS still applies: this can only reach rows the
 * owner could delete from the UI.
 *
 * These specs are re-run against a long-lived dev project, and several of them
 * assert an EXACT row count or write on a date carrying a uniqueness
 * constraint. Without a swept slate the second run fails over the first run's
 * leftovers, which reads exactly like a regression.
 */
export async function deleteRows(page: Page, query: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required — see e2e/README.md.',
    )
  }

  const jwt = await accessToken(page)
  if (!jwt) return

  const response = await page.request.fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: SUPABASE_ANON_KEY,
      Prefer: 'return=minimal',
    },
  })

  /*
   * A failed cleanup used to be swallowed. It must not be: the delete failing
   * is precisely how the *next* assertion turns into a confusing failure three
   * tests later, and the message here names the cause.
   */
  if (!response.ok()) {
    throw new Error(`cleanup DELETE ${query} failed: ${response.status()} ${await response.text()}`)
  }
}

export { expect }
