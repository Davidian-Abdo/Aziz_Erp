import { expect, test } from './fixtures'

/*
 * The month-end sweep (domain-spec §8.3, plan Phase 4 exit criterion).
 *
 * What makes this worth a browser test rather than a unit test: the sweep is one
 * transaction over every active shelf. A half-written sweep closes some
 * categories’ windows on the date and leaves others open, and the report that
 * comes out of it looks completely ordinary — so 'all of them, or none' is a
 * property that has to be observed against the real RPC.
 */

test('a sweep writes every shelf on one date, and offers the loss prompt', async ({
  signedIn: page,
}) => {
  await page.goto('/counts')
  await page.getByRole('tab', { name: 'Tous les rayons' }).click()

  const inputs = page.getByRole('textbox', { name: /Valeur au prix d’achat —/ })
  await expect(inputs.first()).toBeVisible()
  const n = await inputs.count()
  expect(n).toBeGreaterThan(0)

  // The previous count is shown beside each input — the only reference the user
  // has while standing at the shelf (§8.3).
  await expect(
    page.getByText(/Dernier comptage|Ce rayon n’a jamais été compté/).first(),
  ).toBeVisible()

  for (let i = 0; i < n; i++) {
    await inputs.nth(i).fill(String(100 + i))
  }

  // Delete today’s existing standalone counts so repeated runs don’t hit the
  // unique(category, date, source='standalone') constraint.
  const sweepJwt = await page.evaluate((): string | null => {
    const k = Object.keys(localStorage).find(
      (key) => key.startsWith('sb-') && key.endsWith('-auth-token'),
    )
    return k
      ? (JSON.parse(localStorage.getItem(k)!) as { access_token: string }).access_token
      : null
  })
  if (sweepJwt) {
    const today = new Date().toISOString().slice(0, 10)
    await page.request.fetch(
      `https://bucmxwutpfksjrylijeu.supabase.co/rest/v1/stock_count?occurred_on=eq.${today}&source=eq.standalone`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${sweepJwt}`,
          apikey:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Y214d3V0cGZrc2pyeWxpamV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2OTg0OTEsImV4cCI6MjEwMTI3NDQ5MX0.SfVCrf11puAT6VnexFoyY9GSseUNvukzHqo7MUWr8vI',
          Prefer: 'return=minimal',
        },
      },
    )
  }

  await page.getByRole('button', { name: 'Enregistrer tous les comptages' }).click()

  await expect(page.getByRole('status')).toHaveText(`${n} comptages enregistrés.`)

  // domain-spec §4.3 — asked while the user is still looking at the shelves,
  // and refused in one tap.
  const prompt = page.getByRole('dialog')
  await expect(prompt).toContainText('comptés comme vendus')
  await page.getByRole('button', { name: 'Non, rien' }).click()
  await expect(prompt).toBeHidden()
})

test('a partly-filled sweep is refused before anything is written', async ({ signedIn: page }) => {
  await page.goto('/counts')
  await page.getByRole('tab', { name: 'Tous les rayons' }).click()

  const inputs = page.getByRole('textbox', { name: /Valeur au prix d’achat —/ })
  await inputs.first().fill('100')

  await page.getByRole('button', { name: 'Enregistrer tous les comptages' }).click()

  await expect(page.getByRole('alert')).toContainText('Renseignez chaque rayon')
  await expect(page.getByRole('dialog')).toBeHidden()
})

/*
 * The loss prompt is the entry point to the loss screen, and the loss screen is
 * the only defence against goods that left the shelf being reported as profit.
 * Following the link is part of the flow, not a separate feature.
 */
test('the loss prompt leads to the loss screen', async ({ signedIn: page }) => {
  await page.goto('/counts')

  await page.getByLabel('Rayon').selectOption({ index: 1 })
  const categoryId = await page.getByLabel('Rayon').evaluate((el: HTMLSelectElement) => el.value)

  // Delete any prior run’s count so this test is idempotent across runs.
  // Without this, a second run hits unique(category, date, source='standalone').
  const jwt = await page.evaluate((): string | null => {
    const k = Object.keys(localStorage).find(
      (key) => key.startsWith('sb-') && key.endsWith('-auth-token'),
    )
    return k
      ? (JSON.parse(localStorage.getItem(k)!) as { access_token: string }).access_token
      : null
  })
  if (jwt) {
    await page.request.fetch(
      'https://bucmxwutpfksjrylijeu.supabase.co/rest/v1/stock_count' +
        `?category_id=eq.${categoryId}&occurred_on=eq.2026-08-07&source=eq.standalone`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Y214d3V0cGZrc2pyeWxpamV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2OTg0OTEsImV4cCI6MjEwMTI3NDQ5MX0.SfVCrf11puAT6VnexFoyY9GSseUNvukzHqo7MUWr8vI',
          Prefer: 'return=minimal',
        },
      },
    )
  }

  // Use a past date so this test does not collide with the sweep test which
  // runs on today’s date in the same session (unique(category, date, source)).
  await page.getByLabel(/Date du comptage/).fill('2026-08-07')
  await page.getByLabel(/^Valeur au prix d’achat$/).fill('250')
  await page.getByRole('button', { name: 'Enregistrer le comptage' }).click()

  // A plausibility verdict may interpose itself; it never blocks (§3.2).
  // waitFor gives the async check time to complete before testing visibility.
  const saveAnyway = page.getByRole('button', { name: 'Enregistrer quand même' })
  await saveAnyway.waitFor({ timeout: 5000 }).catch(() => undefined)
  if (await saveAnyway.isVisible()) await saveAnyway.click()

  await page.getByRole('button', { name: 'Oui, déclarer une perte' }).click()

  await expect(page.getByRole('heading', { name: 'Pertes', exact: true })).toBeVisible()
  await expect(page.getByText(/comptés comme vendus/)).toBeVisible()
})
