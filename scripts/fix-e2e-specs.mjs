import { readFileSync, writeFileSync } from 'node:fs'

const Q  = String.fromCharCode(0x0027)  // ' ASCII single quote (string delimiter)
const AP = String.fromCharCode(0x2019)  // ' RIGHT SINGLE QUOTATION MARK (French apostrophe)
const EM = String.fromCharCode(0x2014)  // — EM DASH
const EA = String.fromCharCode(0x00EA)  // ê (e with circumflex, in "même")
const EG = String.fromCharCode(0x00E9)  // é (e with acute, in "enregistré")
const SS = String.fromCharCode(0x00A7)  // § section sign

// ── purchase.spec.ts ────────────────────────────────────────────────────────
const pFile = 'e2e/purchase.spec.ts'
let pSrc = readFileSync(pFile, 'utf8')

// Fix 1: purchase test 1 — add plausibility handling before status assert
const p1Old = [
  `  await page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer l${AP}achat${Q} }).click()`,
  ``,
  `  await expect(page.getByRole(${Q}status${Q})).toHaveText(${Q}Achat enregistr${EG}.${Q})`,
].join('\n')

const p1New = [
  `  await page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer l${AP}achat${Q} }).click()`,
  ``,
  `  // Plausibility may interpose; it never blocks (${SS}3.2).`,
  `  const plaus1 = page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer quand m${EA}me${Q} })`,
  `  await plaus1.waitFor({ timeout: 5000 }).catch(() => undefined)`,
  `  if (await plaus1.isVisible()) await plaus1.click()`,
  ``,
  `  await expect(page.getByRole(${Q}status${Q})).toHaveText(${Q}Achat enregistr${EG}.${Q})`,
].join('\n')

if (!pSrc.includes(p1Old)) {
  console.error('purchase fix1 OLD not found')
  const idx = pSrc.indexOf('Achat')
  console.error(JSON.stringify(pSrc.slice(Math.max(0, idx - 80), idx + 100)))
  process.exit(1)
}
pSrc = pSrc.replace(p1Old, p1New)
console.log('purchase.spec.ts fix1: OK')

// Fix 2: retried submission — plausibility handling for both saves
const p2Old = [
  `  await page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer l${AP}achat${Q} }).click()`,
  `  await expect(page.getByRole(${Q}alert${Q})).toBeVisible()`,
  ``,
  `  // The shopkeeper presses save again, as anyone would.`,
  `  await page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer l${AP}achat${Q} }).click()`,
  ``,
  `  // The replay is reported as a replay, not as a second purchase.`,
].join('\n')

const p2New = [
  `  await page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer l${AP}achat${Q} }).click()`,
  ``,
  `  // Plausibility may interpose for a 0-stock entry; it never blocks (${SS}3.2).`,
  `  const gate1 = page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer quand m${EA}me${Q} })`,
  `  await gate1.waitFor({ timeout: 5000 }).catch(() => undefined)`,
  `  if (await gate1.isVisible()) await gate1.click()`,
  ``,
  `  await expect(page.getByRole(${Q}alert${Q})).toBeVisible()`,
  ``,
  `  // The shopkeeper presses save again, as anyone would.`,
  `  await page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer l${AP}achat${Q} }).click()`,
  ``,
  `  // Plausibility may interpose again on the retry.`,
  `  const gate2 = page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer quand m${EA}me${Q} })`,
  `  await gate2.waitFor({ timeout: 5000 }).catch(() => undefined)`,
  `  if (await gate2.isVisible()) await gate2.click()`,
  ``,
  `  // The replay is reported as a replay, not as a second purchase.`,
].join('\n')

if (!pSrc.includes(p2Old)) {
  console.error('purchase fix2 OLD not found')
  process.exit(1)
}
pSrc = pSrc.replace(p2Old, p2New)
console.log('purchase.spec.ts fix2: OK')

writeFileSync(pFile, pSrc, 'utf8')

// ── sweep.spec.ts ────────────────────────────────────────────────────────────
const sFile = 'e2e/sweep.spec.ts'
let sSrc = readFileSync(sFile, 'utf8')

// Fix 1: add wait for inputs after tab click (categories load async)
const sOld1 = [
  `  const inputs = page.getByRole(${Q}textbox${Q}, { name: /Valeur au prix d${AP}achat ${EM}/ })`,
  `  const n = await inputs.count()`,
].join('\n')
const sNew1 = [
  `  const inputs = page.getByRole(${Q}textbox${Q}, { name: /Valeur au prix d${AP}achat ${EM}/ })`,
  `  await expect(inputs.first()).toBeVisible()`,
  `  const n = await inputs.count()`,
].join('\n')

if (!sSrc.includes(sOld1)) {
  console.error('sweep fix1 OLD not found')
  const idx = sSrc.indexOf('textbox')
  console.error(JSON.stringify(sSrc.slice(Math.max(0, idx - 5), idx + 120)))
  process.exit(1)
}
sSrc = sSrc.replace(sOld1, sNew1)
console.log('sweep.spec.ts fix1: OK')

// Fix 2: loss prompt test — set a specific past date and fix plausibility race
// The sweep test uses today; the loss prompt test must use a different date
// to avoid unique(category, date, source='standalone') collision.
const sOld2 = [
  `  await page.goto(${Q}/counts${Q})`,
  ``,
  `  await page.getByLabel(${Q}Rayon${Q}).selectOption({ index: 1 })`,
  `  await page.getByLabel(/^Valeur au prix d${AP}achat$/).fill(${Q}250${Q})`,
  `  await page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer le comptage${Q} }).click()`,
  ``,
  `  // A plausibility verdict may interpose itself; it never blocks (${SS}3.2).`,
  `  const saveAnyway = page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer quand m${EA}me${Q} })`,
  `  if (await saveAnyway.isVisible().catch(() => false)) await saveAnyway.click()`,
].join('\n')

const sNew2 = [
  `  await page.goto(${Q}/counts${Q})`,
  ``,
  `  await page.getByLabel(${Q}Rayon${Q}).selectOption({ index: 1 })`,
  `  // Use a past date so this test does not collide with the sweep test which`,
  `  // runs on today${AP}s date in the same session (unique(category, date, source)).`,
  `  await page.getByLabel(/Date du comptage/).fill(${Q}2026-08-07${Q})`,
  `  await page.getByLabel(/^Valeur au prix d${AP}achat$/).fill(${Q}250${Q})`,
  `  await page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer le comptage${Q} }).click()`,
  ``,
  `  // A plausibility verdict may interpose itself; it never blocks (${SS}3.2).`,
  `  // waitFor gives the async check time to complete before testing visibility.`,
  `  const saveAnyway = page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer quand m${EA}me${Q} })`,
  `  await saveAnyway.waitFor({ timeout: 5000 }).catch(() => undefined)`,
  `  if (await saveAnyway.isVisible()) await saveAnyway.click()`,
].join('\n')

if (!sSrc.includes(sOld2)) {
  console.error('sweep fix2 OLD not found')
  const idx = sSrc.indexOf('saveAnyway')
  console.error(JSON.stringify(sSrc.slice(Math.max(0, idx - 300), idx + 50)))
  process.exit(1)
}
sSrc = sSrc.replace(sOld2, sNew2)
console.log('sweep.spec.ts fix2: OK')

writeFileSync(sFile, sSrc, 'utf8')

const pb = readFileSync(pFile)
const sb = readFileSync(sFile)
console.log(`purchase first byte: ${pb[0]} (expected 105)`)
console.log(`sweep first byte: ${sb[0]} (expected 105)`)
