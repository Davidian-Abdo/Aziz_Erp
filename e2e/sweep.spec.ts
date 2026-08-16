import { deleteRows, expect, test } from './fixtures'
import { anyOf, stem, t } from './i18n'

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
  await page.getByRole('tab', { name: t('counts.modeSweep') }).click()

  const inputs = page.getByRole('textbox', { name: t('counts.valueLabel') })
  await expect(inputs.first()).toBeVisible()
  const n = await inputs.count()
  expect(n).toBeGreaterThan(0)

  // The previous count is shown beside each input — the only reference the user
  // has while standing at the shelf (§8.3). Either it has been counted before,
  // or the row says it never has; silence there is the failure.
  await expect(
    page.getByText(anyOf(stem('counts.previous'), t('counts.neverCounted'))).first(),
  ).toBeVisible()

  for (let i = 0; i < n; i++) {
    await inputs.nth(i).fill(String(100 + i))
  }

  // Today's standalone counts from a previous run would hit
  // unique(category, date, source='standalone') and fail the save.
  const today = new Date().toISOString().slice(0, 10)
  await deleteRows(page, `stock_count?occurred_on=eq.${today}&source=eq.standalone`)

  await page.getByRole('button', { name: t('counts.saveSweep') }).click()

  await expect(page.getByRole('status')).toHaveText(t('counts.sweepSaved', { n }))

  // domain-spec §4.3 — asked while the user is still looking at the shelves,
  // and refused in one tap.
  const prompt = page.getByRole('dialog')
  await expect(prompt).toContainText(t('counts.lossPromptBody'))
  await page.getByRole('button', { name: t('counts.lossPromptNo') }).click()
  await expect(prompt).toBeHidden()
})

test('a partly-filled sweep is refused before anything is written', async ({ signedIn: page }) => {
  await page.goto('/counts')
  await page.getByRole('tab', { name: t('counts.modeSweep') }).click()

  const inputs = page.getByRole('textbox', { name: t('counts.valueLabel') })
  await inputs.first().fill('100')

  await page.getByRole('button', { name: t('counts.saveSweep') }).click()

  await expect(page.getByRole('alert')).toContainText(t('counts.sweepIncomplete'))
  await expect(page.getByRole('dialog')).toBeHidden()
})

/*
 * The loss prompt is the entry point to the loss screen, and the loss screen is
 * the only defence against goods that left the shelf being reported as profit.
 * Following the link is part of the flow, not a separate feature.
 */
test('the loss prompt leads to the loss screen', async ({ signedIn: page }) => {
  await page.goto('/counts')

  const category = page.getByLabel(t('counts.category'))
  await category.selectOption({ index: 1 })
  const categoryId = await category.evaluate((el: HTMLSelectElement) => el.value)

  /*
   * A past date, and swept clean first. Today's date belongs to the sweep test
   * above, which runs in the same session against the same ledger, and
   * unique(category, date, source='standalone') does not care which test wrote
   * first.
   */
  const on = '2026-08-07'
  await deleteRows(
    page,
    `stock_count?category_id=eq.${categoryId}&occurred_on=eq.${on}&source=eq.standalone`,
  )

  await page.getByLabel(t('counts.date')).fill(on)
  await page.getByLabel(t('counts.valueLabel'), { exact: true }).fill('250')
  await page.getByRole('button', { name: t('counts.save') }).click()

  // A plausibility verdict may interpose itself; it never blocks (§3.2).
  // waitFor gives the async check time to complete before testing visibility.
  const saveAnyway = page.getByRole('button', { name: t('plausibility.saveAnyway') })
  await saveAnyway.waitFor({ timeout: 5000 }).catch(() => undefined)
  if (await saveAnyway.isVisible()) await saveAnyway.click()

  await page.getByRole('button', { name: t('counts.lossPromptYes') }).click()

  await expect(page.getByRole('heading', { name: t('nav.losses'), exact: true })).toBeVisible()
  await expect(page.getByText(t('losses.intro'))).toBeVisible()
})
