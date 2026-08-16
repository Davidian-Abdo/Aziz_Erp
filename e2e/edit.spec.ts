import type { Page } from '@playwright/test'
import { deleteRows, expect, test } from './fixtures'
import { stem, t } from './i18n'

/*
 * Correcting a record in place (Phase 9, domain-spec §8.5).
 *
 * Phase 4 shipped deletion only, so fixing a mistyped amount meant deleting the
 * record and entering it again. Phase 9 made every record type editable, and
 * building it uncovered two defects — one in the database, reachable over the
 * API since Phase 1, and one in the form. Both are covered here.
 *
 * Why these belong in a browser rather than the component suite: an edit is the
 * one operation in this application that can turn into a SECOND write of the
 * same money. The component tests assert that `record_purchase` was not called;
 * only a real HTTP path against a real ledger can show that the row count did
 * not move. In this model a duplicated purchase inflates outflow, and outflow is
 * reported as PROFIT.
 *
 * ⚠ These write to the ledger and clean up after themselves by note marker.
 * Point them at `aziz-dev`. Never at `aziz-prod` — see `e2e/README.md`.
 */

/** The plausibility gate may interpose on any count value; it never blocks (§3.2). */
async function dismissPlausibility(page: Page): Promise<void> {
  const saveAnyway = page.getByRole('button', { name: t('plausibility.saveAnyway') })
  await saveAnyway.waitFor({ timeout: 5000 }).catch(() => undefined)
  if (await saveAnyway.isVisible()) await saveAnyway.click()
}

/** The recent-list row carrying `amount` as rendered text. */
function rowWith(page: Page, amount: string) {
  return page.getByRole('listitem').filter({ hasText: amount })
}

// ---------------------------------------------------------------------------
// Charges — the ordinary path. No RPC, no cross-row invariant: an UPDATE
// through PostgREST, with 0005's audit trigger recording before and after.
// ---------------------------------------------------------------------------

test('a corrected charge replaces the figure instead of adding a second one', async ({
  signedIn: page,
}) => {
  await page.goto('/charges')
  await deleteRows(page, 'charge?note=like.e2e-*')

  await page.getByLabel(t('charges.category')).selectOption({ index: 1 })
  await page.getByLabel(t('charges.amount')).fill('77,77')
  await page.getByLabel(t('common.noteOptional')).fill(`e2e-${Date.now()}`)
  await page.getByRole('button', { name: t('charges.save') }).click()
  await expect(page.getByRole('status')).toHaveText(t('charges.saved'))
  await expect(rowWith(page, '77,77')).toHaveCount(1)

  await rowWith(page, '77,77')
    .getByRole('button', { name: t('common.edit') })
    .click()

  // The banner is the whole defence against saving what looks like a new entry
  // but is a correction of an old one.
  await expect(page.getByRole('status')).toHaveText(t('common.editing'))
  await expect(page.getByRole('button', { name: t('common.saveChanges') })).toBeVisible()

  await page.getByLabel(t('charges.amount')).fill('88,88')
  await page.getByRole('button', { name: t('common.saveChanges') }).click()
  await expect(page.getByRole('status')).toHaveText(t('charges.saved'))

  // The assertion this test exists for: one row, at the new figure. Two rows
  // here would mean the edit posted rather than replaced.
  await expect(rowWith(page, '88,88')).toHaveCount(1)
  await expect(rowWith(page, '77,77')).toHaveCount(0)
})

test('cancelling an edit leaves the record as it was', async ({ signedIn: page }) => {
  await page.goto('/charges')
  await deleteRows(page, 'charge?note=like.e2e-*')

  await page.getByLabel(t('charges.category')).selectOption({ index: 1 })
  await page.getByLabel(t('charges.amount')).fill('55,55')
  await page.getByLabel(t('common.noteOptional')).fill(`e2e-${Date.now()}`)
  await page.getByRole('button', { name: t('charges.save') }).click()
  await expect(page.getByRole('status')).toHaveText(t('charges.saved'))

  await rowWith(page, '55,55')
    .getByRole('button', { name: t('common.edit') })
    .click()
  await page.getByLabel(t('charges.amount')).fill('99,99')
  await page.getByRole('button', { name: t('common.cancel') }).click()

  // Cancel abandons the edit AND the form: a prefilled form left behind is a
  // correction waiting to be saved by whoever comes back to the screen.
  await expect(page.getByRole('button', { name: t('charges.save') })).toBeVisible()
  await expect(rowWith(page, '55,55')).toHaveCount(1)
  await expect(rowWith(page, '99,99')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Purchases — the `edit_purchase` RPC. An edit can cross the §3.2A boundary in
// either direction, and both rows have to move together (0014_edit_rpcs.sql).
// ---------------------------------------------------------------------------

/** Enters a purchase dated today, with its embedded count. Returns the amount. */
async function enterPurchaseWithCount(page: Page, amount: string): Promise<void> {
  await page.getByLabel(t('purchases.category')).selectOption({ index: 1 })
  await page.getByLabel(t('purchases.amount')).fill(amount)
  await page.getByLabel(t('common.noteOptional')).fill(`e2e-${Date.now()}`)
  await page.getByRole('button', { name: t('common.next') }).click()
  await page.getByRole('button', { name: t('purchases.somethingWasLeft') }).click()
  await page.getByLabel(t('purchases.priorStockLabel')).fill('900')
  await page.getByRole('button', { name: t('purchases.save') }).click()
  await dismissPlausibility(page)
  await expect(page.getByRole('status')).toHaveText(t('purchases.saved'))
}

/*
 * ⚠ THE REGRESSION TEST. Building the edit form found this: the form decides
 * which §3.2A branch to show by comparing the date against the category's last
 * count — which, when editing, is very often the purchase's OWN embedded count,
 * the one about to move with it. The form therefore concluded "backdated",
 * showed the "no count will be recorded" notice, saved a null prior stock, and
 * `edit_purchase` rejected it with "a count is required" over a purchase the
 * user had never mis-entered.
 *
 * `useLatestCount` takes an `excludeCountId` for exactly this, matching what the
 * SQL already does. Opening an unmoved purchase for edit must still ASK.
 */
test('editing a purchase without moving it still asks the stock question', async ({
  signedIn: page,
}) => {
  await page.goto('/purchases')
  await deleteRows(page, 'purchase?note=like.e2e-*')
  await enterPurchaseWithCount(page, '211,11')

  await rowWith(page, '211,11')
    .getByRole('button', { name: t('common.edit') })
    .click()
  await expect(page.getByRole('status')).toHaveText(t('common.editing'))
  await page.getByRole('button', { name: t('common.next') }).click()

  // The question, not the backdating notice. The inverse is the bug.
  await expect(page.getByText(t('purchases.howMuchWasLeft'))).toBeVisible()
  await expect(page.getByText(stem('purchases.backdated'))).toBeHidden()
})

test('a purchase pulled behind the last count gives up its embedded count', async ({
  signedIn: page,
}) => {
  await page.goto('/purchases')
  await deleteRows(page, 'purchase?note=like.e2e-*')
  await enterPurchaseWithCount(page, '212,12')

  await rowWith(page, '212,12')
    .getByRole('button', { name: t('common.edit') })
    .click()
  // Behind every count this shop has ever taken, so the §3.2A rule flips.
  await page.getByLabel(t('purchases.date')).fill('2019-05-06')
  await page.getByRole('button', { name: t('common.next') }).click()

  await expect(page.getByText(stem('purchases.backdated'))).toBeVisible()
  await page.getByRole('button', { name: t('purchases.save') }).click()
  await expect(page.getByRole('status')).toHaveText(t('purchases.saved'))

  // The count went with it — the row now says so.
  await expect(rowWith(page, '212,12')).toContainText(t('purchases.noCountAttached'))
})

test('a purchase pushed forward acquires the count it now needs', async ({ signedIn: page }) => {
  await page.goto('/purchases')
  await deleteRows(page, 'purchase?note=like.e2e-*')

  // A backdated purchase: no count, by the §3.2A rule.
  await page.getByLabel(t('purchases.category')).selectOption({ index: 1 })
  await page.getByLabel(t('purchases.date')).fill('2019-05-07')
  await page.getByLabel(t('purchases.amount')).fill('213,13')
  await page.getByLabel(t('common.noteOptional')).fill(`e2e-${Date.now()}`)
  await page.getByRole('button', { name: t('common.next') }).click()
  await expect(page.getByText(stem('purchases.backdated'))).toBeVisible()
  await page.getByRole('button', { name: t('purchases.save') }).click()
  await expect(page.getByRole('status')).toHaveText(t('purchases.saved'))
  await expect(rowWith(page, '213,13')).toContainText(t('purchases.noCountAttached'))

  // Dragged forward to today it becomes the category's newest event, so the
  // question it was never asked has to be asked now.
  await rowWith(page, '213,13')
    .getByRole('button', { name: t('common.edit') })
    .click()
  // The store's today, from the form's own quick-date button rather than the
  // runner's clock — the shop is UTC+1 and `toISOString()` writes yesterday for
  // an hour every night.
  await page.getByRole('button', { name: t('date.today') }).click()
  await page.getByRole('button', { name: t('common.next') }).click()

  await expect(page.getByText(t('purchases.howMuchWasLeft'))).toBeVisible()
  await page.getByRole('button', { name: t('purchases.somethingWasLeft') }).click()
  await page.getByLabel(t('purchases.priorStockLabel')).fill('800')
  await page.getByRole('button', { name: t('purchases.save') }).click()
  await dismissPlausibility(page)
  await expect(page.getByRole('status')).toHaveText(t('purchases.saved'))

  await expect(rowWith(page, '213,13')).not.toContainText(t('purchases.noCountAttached'))
})

// ---------------------------------------------------------------------------
// The counts screen — the UI half of a rule the database now also enforces.
// ---------------------------------------------------------------------------

/*
 * An embedded count belongs to its purchase and moves with it. Offering an edit
 * control here would offer an action that can only fail: since 0014 a lone
 * UPDATE on such a row is refused by a deferred constraint trigger, which is
 * what makes this a database rule rather than a UI convention.
 *
 * Proved against the database in `095_edit_rpcs.sql`. What is proved here is
 * that the screen does not invite the user into it.
 */
test('an embedded count offers no edit control', async ({ signedIn: page }) => {
  await page.goto('/purchases')
  await deleteRows(page, 'purchase?note=like.e2e-*')
  await enterPurchaseWithCount(page, '214,14')

  await page.goto('/counts')
  const embedded = page.getByRole('listitem').filter({ hasText: t('counts.source.purchase') })
  await expect(embedded.first()).toBeVisible()

  await expect(embedded.first().getByRole('button', { name: t('common.edit') })).toHaveCount(0)
  await expect(embedded.first().getByRole('button', { name: t('common.delete') })).toHaveCount(0)

  // …while an ordinary count still offers both, so the assertion above is about
  // this row and not about a screen that lost its buttons.
  const standalone = page.getByRole('listitem').filter({ hasText: t('counts.source.standalone') })
  if ((await standalone.count()) > 0) {
    await expect(standalone.first().getByRole('button', { name: t('common.edit') })).toHaveCount(1)
  }
})
