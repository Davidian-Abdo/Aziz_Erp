import { test as base, expect, type Page } from '@playwright/test'

/*
 * Signing in, once, for every flow test.
 *
 * There is no signup route and public signup is disabled on the project, so the
 * user must already exist AND hold a row in `app_user` — a login that is not
 * allowlisted reaches a screen saying so and nothing else (architecture-spec
 * §4.2). If these tests fail at the first step with "ce compte n'a pas accès",
 * that is the allowlist, not the password.
 */

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

export const test = base.extend<{ signedIn: Page }>({
  signedIn: async ({ page }, use) => {
    if (!EMAIL || !PASSWORD) {
      throw new Error(
        'E2E_EMAIL and E2E_PASSWORD are required — an allowlisted user of a NON-PRODUCTION Supabase project.',
      )
    }

    await page.goto('/login')
    await page.getByLabel('Adresse e-mail').fill(EMAIL)
    await page.getByLabel('Mot de passe').fill(PASSWORD)
    await page.getByRole('button', { name: 'Se connecter' }).click()

    // The three gates of App.tsx have all passed only once a real screen shows.
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 30_000 })
    await use(page)
  },
})

export { expect }
