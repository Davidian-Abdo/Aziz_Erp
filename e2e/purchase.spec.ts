import { deleteRows, expect, test } from './fixtures'
import { stem, t } from './i18n'

/*
 * The purchase round trip, and the double-post (plan, Phase 4 exit criterion).
 *
 * These are here rather than in the component suite because the property being
 * tested is a property of the deployed HTTP path: the count and the purchase
 * reach the database in one transaction, and a retried submission is absorbed
 * by `write_request` instead of posting the money twice.
 *
 * Selectors name translation KEYS, never literal strings — see `e2e/i18n.ts`
 * for what that rule cost the project.
 */

test('a purchase and its embedded count are recorded together', async ({ signedIn: page }) => {
  await page.goto('/purchases')

  const category = page.getByLabel(t('purchases.category'))
  await category.selectOption({ index: 1 })
  const categoryName = await category.locator('option:checked').innerText()

  await page.getByLabel(t('purchases.amount')).fill('300')
  await page.getByRole('button', { name: t('common.next') }).click()

  // domain-spec §3.2A: the whole shelf is named, and its contents listed.
  await expect(page.getByText(t('purchases.wholeShelf', { category: categoryName }))).toBeVisible()
  await expect(page.getByText(t('purchases.notOnlyWhatYouBought'))).toBeVisible()

  await page.getByRole('button', { name: t('purchases.somethingWasLeft') }).click()
  await page.getByLabel(t('purchases.priorStockLabel')).fill('1000')
  await page.getByRole('button', { name: t('purchases.save') }).click()

  // Plausibility may interpose; it never blocks (§3.2).
  const plaus = page.getByRole('button', { name: t('plausibility.saveAnyway') })
  await plaus.waitFor({ timeout: 5000 }).catch(() => undefined)
  if (await plaus.isVisible()) await plaus.click()

  await expect(page.getByRole('status')).toHaveText(t('purchases.saved'))

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

  // Previous runs' rows would inflate the exact count this test exists to
  // assert. Their note carries the marker; nothing else in the ledger does.
  await deleteRows(page, 'purchase?note=like.e2e-*')

  const category = page.getByLabel(t('purchases.category'))
  await category.selectOption({ index: 1 })
  const categoryName = await category.locator('option:checked').innerText()

  await page.getByLabel(t('purchases.amount')).fill('137,42')
  await page.getByLabel(t('common.noteOptional')).fill(`e2e-${Date.now()}`)
  await page.getByRole('button', { name: t('common.next') }).click()

  await page.getByRole('button', { name: t('purchases.shelfWasEmpty') }).click()

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

  await page.getByRole('button', { name: t('purchases.save') }).click()

  // Plausibility may interpose for a 0-stock entry; it never blocks (§3.2).
  const gate1 = page.getByRole('button', { name: t('plausibility.saveAnyway') })
  await gate1.waitFor({ timeout: 5000 }).catch(() => undefined)
  if (await gate1.isVisible()) await gate1.click()

  await expect(page.getByRole('alert')).toBeVisible()

  // The shopkeeper presses save again, as anyone would.
  await page.getByRole('button', { name: t('purchases.save') }).click()

  const gate2 = page.getByRole('button', { name: t('plausibility.saveAnyway') })
  await gate2.waitFor({ timeout: 5000 }).catch(() => undefined)
  if (await gate2.isVisible()) await gate2.click()

  // The replay is reported as a replay, not as a second purchase.
  await expect(page.getByRole('status')).toHaveText(t('purchases.savedReplayed'))

  /*
   * And exactly one row in the ledger carries the amount. This is the assertion
   * the whole test exists for.
   *
   * `137,42` is the rendered form under both locales this project uses: `fr`
   * gives "137,42 MAD" and `ar-MA` gives "‏137,42 د.م.‏" — ar-MA resolves to
   * Latin digits (`latn`), checked, not assumed. If this ever fails on the
   * digits rather than the count, the locale changed to one with a different
   * numbering system and <Money> is doing exactly what it should.
   */
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

  await page.getByLabel(t('purchases.category')).selectOption({ index: 1 })
  await page.getByLabel(t('purchases.date')).fill('2020-01-15')
  await page.getByLabel(t('purchases.amount')).fill('80')
  await page.getByRole('button', { name: t('common.next') }).click()

  await expect(page.getByText(stem('purchases.backdated'))).toBeVisible()
  await expect(page.getByText(t('purchases.howMuchWasLeft'))).toBeHidden()

  await page.getByRole('button', { name: t('purchases.save') }).click()
  await expect(page.getByRole('status')).toHaveText(t('purchases.saved'))

  // The list marks it: no count is attached to this one.
  await expect(page.getByText(t('purchases.noCountAttached')).first()).toBeVisible()
})
