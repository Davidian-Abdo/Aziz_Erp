import { expect, test } from './fixtures'

/*
 * The purchase round trip, and the double-post (plan, Phase 4 exit criterion).
 *
 * These two are here rather than in the component suite because the property
 * being tested is a property of the deployed HTTP path: the count and the
 * purchase reach the database in one transaction, and a retried submission is
 * absorbed by `write_request` instead of posting the money twice.
 */

test('a purchase and its embedded count are recorded together', async ({ signedIn: page }) => {
  await page.goto('/purchases')

  const category = page.getByLabel('Rayon')
  await category.selectOption({ index: 1 })
  const categoryName = await category.locator('option:checked').innerText()

  await page.getByLabel(/Montant payé/).fill('300')
  await page.getByRole('button', { name: 'Suivant' }).click()

  // domain-spec §3.2A: the whole shelf is named, and its contents listed.
  await expect(page.getByText(`Tout le rayon ${categoryName}`)).toBeVisible()
  await expect(page.getByText('Pas seulement ce que vous venez d’acheter.')).toBeVisible()

  await page.getByRole('button', { name: 'Il restait quelque chose' }).click()
  await page.getByLabel(/Valeur restante/).fill('1000')
  await page.getByRole('button', { name: 'Enregistrer l’achat' }).click()

  // Plausibility may interpose; it never blocks (§3.2).
  const plaus1 = page.getByRole('button', { name: 'Enregistrer quand même' })
  await plaus1.waitFor({ timeout: 5000 }).catch(() => undefined)
  if (await plaus1.isVisible()) await plaus1.click()

  await expect(page.getByRole('status')).toHaveText('Achat enregistré.')

  // The purchase is readable back, which means the transaction committed.
  const recent = page.getByRole('list').last()
  await expect(recent.getByText(categoryName).first()).toBeVisible()
})

/*
 * A DELIBERATE double submission creates exactly one row.
 *
 * The first attempt is dropped at the network layer — a lost response, which is
 * what a shop's connection actually does — so the user presses save again. The
 * `request_id` was generated once per submission (domain-spec §8.1), so the
 * second call replays the first from `write_request`.
 *
 * If this ever fails, the symptom in production is not an error message: it is a
 * purchase counted twice, which inflates outflow, which this model reports as
 * PROFIT.
 */
test('a retried submission does not post the purchase twice', async ({ signedIn: page }) => {
  await page.goto('/purchases')
  // Delete any purchases from previous test runs that would inflate the count.
  // Without this, each run adds a 137,42 row that the toHaveCount(1) assertion catches.
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
      'https://bucmxwutpfksjrylijeu.supabase.co/rest/v1/purchase?note=like.e2e-*',
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

  const category = page.getByLabel('Rayon')
  await category.selectOption({ index: 1 })
  const categoryName = await category.locator('option:checked').innerText()

  const marker = `e2e-${Date.now()}`
  await page.getByLabel(/Montant payé/).fill('137,42')
  await page.getByLabel(/Note/).fill(marker)
  await page.getByRole('button', { name: 'Suivant' }).click()

  await page.getByRole('button', { name: 'Rien, le rayon était vide' }).click()

  // Drop the response of the FIRST record_purchase call only. The write itself
  // reaches Postgres and commits; the client never hears about it.
  let dropped = false
  await page.route('**/rest/v1/rpc/record_purchase', async (route) => {
    if (!dropped) {
      dropped = true
      await route.fetch().catch(() => undefined)
      await route.abort('connectionfailed')
      return
    }
    await route.continue()
  })

  await page.getByRole('button', { name: 'Enregistrer l’achat' }).click()

  // Plausibility may interpose for a 0-stock entry; it never blocks (§3.2).
  const gate1 = page.getByRole('button', { name: 'Enregistrer quand même' })
  await gate1.waitFor({ timeout: 5000 }).catch(() => undefined)
  if (await gate1.isVisible()) await gate1.click()

  await expect(page.getByRole('alert')).toBeVisible()

  // The shopkeeper presses save again, as anyone would.
  await page.getByRole('button', { name: 'Enregistrer l’achat' }).click()

  // Plausibility may interpose again on the retry.
  const gate2 = page.getByRole('button', { name: 'Enregistrer quand même' })
  await gate2.waitFor({ timeout: 5000 }).catch(() => undefined)
  if (await gate2.isVisible()) await gate2.click()

  // The replay is reported as a replay, not as a second purchase.
  await expect(page.getByRole('status')).toHaveText(
    'Cet achat était déjà enregistré. Rien n’a été ajouté une deuxième fois.',
  )

  // And exactly one row in the ledger carries the amount. This is the assertion
  // the whole test exists for.
  const rows = page.getByRole('listitem').filter({ hasText: '137,42' })
  await expect(rows).toHaveCount(1)
  expect(categoryName).not.toBe('')
})

/*
 * The backdating exception (domain-spec §3.2, plan §2.4). A purchase dated
 * behind the category's last count records no count at all, and the form says
 * so instead of silently skipping the question it asked a moment ago.
 */
test('a backdated purchase records no count', async ({ signedIn: page }) => {
  await page.goto('/purchases')

  await page.getByLabel('Rayon').selectOption({ index: 1 })
  await page.getByLabel(/Date de l’achat/).fill('2020-01-15')
  await page.getByLabel(/Montant payé/).fill('80')
  await page.getByRole('button', { name: 'Suivant' }).click()

  await expect(page.getByText(/aucun comptage ne sera enregistré/)).toBeVisible()
  await expect(page.getByText('Combien restait-il, au prix d’achat ?')).toBeHidden()

  await page.getByRole('button', { name: 'Enregistrer l’achat' }).click()
  await expect(page.getByRole('status')).toHaveText('Achat enregistré.')

  // The list marks it: no count is attached to this one.
  await expect(page.getByText('sans comptage').first()).toBeVisible()
})
