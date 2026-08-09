import { readFileSync, writeFileSync } from 'node:fs'

const Q  = String.fromCharCode(0x0027)  // ' ASCII single quote (string delimiter)
const AP = String.fromCharCode(0x2019)  // ' RIGHT SINGLE QUOTATION MARK (French apostrophe)
const EM = String.fromCharCode(0x2014)  // — EM DASH
const SS = String.fromCharCode(0x00A7)  // § section sign
const EA = String.fromCharCode(0x00EA)  // ê (in même)
const EG = String.fromCharCode(0x00E9)  // é (in enregistré, été, compté)
const BT = String.fromCharCode(0x0060)  // ` backtick

const SUPABASE_URL = 'https://bucmxwutpfksjrylijeu.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Y214d3V0cGZrc2pyeWxpamV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2OTg0OTEsImV4cCI6MjEwMTI3NDQ5MX0.SfVCrf11puAT6VnexFoyY9GSseUNvukzHqo7MUWr8vI'

// ── Template-literal helper lines ────────────────────────────────────────────
// These use ${BT}…${BT} to embed backtick-delimited template literals in the
// output file without the script's own template literals interfering.

// `${n} comptages enregistrés.`
const nComptageLine = `  await expect(page.getByRole(${Q}status${Q})).toHaveText(${BT}\${n} comptages enregistr${EG}s.${BT})`

// `https://…/stock_count?occurred_on=eq.${today}&source=eq.standalone`
const sweepDeleteUrl = `      ${BT}${SUPABASE_URL}/rest/v1/stock_count?occurred_on=eq.\${today}&source=eq.standalone${BT},`
const sweepAuthLine  = `          Authorization: ${BT}Bearer \${sweepJwt}${BT},`

// `https://…/stock_count?category_id=eq.${categoryId}&occurred_on=eq.2026-08-07&source=eq.standalone`
const lossDeleteUrl  = `      ${Q}${SUPABASE_URL}/rest/v1/stock_count${Q} +`
const lossDeleteQs   = `        ${BT}?category_id=eq.\${categoryId}&occurred_on=eq.2026-08-07&source=eq.standalone${BT},`
const lossAuthLine   = `          Authorization: ${BT}Bearer \${jwt}${BT},`

const file = 'e2e/sweep.spec.ts'

const content = [
  `import { expect, test } from ${Q}./fixtures${Q}`,
  ``,
  `/*`,
  ` * The month-end sweep (domain-spec ${SS}8.3, plan Phase 4 exit criterion).`,
  ` *`,
  ` * What makes this worth a browser test rather than a unit test: the sweep is one`,
  ` * transaction over every active shelf. A half-written sweep closes some`,
  ` * categories${AP} windows on the date and leaves others open, and the report that`,
  ` * comes out of it looks completely ordinary ${EM} so ${Q}all of them, or none${Q} is a`,
  ` * property that has to be observed against the real RPC.`,
  ` */`,
  ``,
  `test(${Q}a sweep writes every shelf on one date, and offers the loss prompt${Q}, async ({`,
  `  signedIn: page,`,
  `}) => {`,
  `  await page.goto(${Q}/counts${Q})`,
  `  await page.getByRole(${Q}tab${Q}, { name: ${Q}Tous les rayons${Q} }).click()`,
  ``,
  `  const inputs = page.getByRole(${Q}textbox${Q}, { name: /Valeur au prix d${AP}achat ${EM}/ })`,
  `  await expect(inputs.first()).toBeVisible()`,
  `  const n = await inputs.count()`,
  `  expect(n).toBeGreaterThan(0)`,
  ``,
  `  // The previous count is shown beside each input ${EM} the only reference the user`,
  `  // has while standing at the shelf (${SS}8.3).`,
  `  await expect(`,
  `    page.getByText(/Dernier comptage|Ce rayon n${AP}a jamais ${EG}t${EG} compt${EG}/).first(),`,
  `  ).toBeVisible()`,
  ``,
  `  for (let i = 0; i < n; i++) {`,
  `    await inputs.nth(i).fill(String(100 + i))`,
  `  }`,
  ``,
  `  // Delete today${AP}s existing standalone counts so repeated runs don${AP}t hit the`,
  `  // unique(category, date, source=${Q}standalone${Q}) constraint.`,
  `  const sweepJwt = await page.evaluate((): string | null => {`,
  `    const k = Object.keys(localStorage).find(`,
  `      (key) => key.startsWith(${Q}sb-${Q}) && key.endsWith(${Q}-auth-token${Q}),`,
  `    )`,
  `    return k`,
  `      ? (JSON.parse(localStorage.getItem(k)!) as { access_token: string }).access_token`,
  `      : null`,
  `  })`,
  `  if (sweepJwt) {`,
  `    const today = new Date().toISOString().slice(0, 10)`,
  `    await page.request.fetch(`,
  sweepDeleteUrl,
  `      {`,
  `        method: ${Q}DELETE${Q},`,
  `        headers: {`,
  sweepAuthLine,
  `          apikey: ${Q}${ANON_KEY}${Q},`,
  `          Prefer: ${Q}return=minimal${Q},`,
  `        },`,
  `      },`,
  `    )`,
  `  }`,
  ``,
  `  await page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer tous les comptages${Q} }).click()`,
  ``,
  nComptageLine,
  ``,
  `  // domain-spec ${SS}4.3 ${EM} asked while the user is still looking at the shelves,`,
  `  // and refused in one tap.`,
  `  const prompt = page.getByRole(${Q}dialog${Q})`,
  `  await expect(prompt).toContainText(${Q}compt${EG}s comme vendus${Q})`,
  `  await page.getByRole(${Q}button${Q}, { name: ${Q}Non, rien${Q} }).click()`,
  `  await expect(prompt).toBeHidden()`,
  `})`,
  ``,
  `test(${Q}a partly-filled sweep is refused before anything is written${Q}, async ({ signedIn: page }) => {`,
  `  await page.goto(${Q}/counts${Q})`,
  `  await page.getByRole(${Q}tab${Q}, { name: ${Q}Tous les rayons${Q} }).click()`,
  ``,
  `  const inputs = page.getByRole(${Q}textbox${Q}, { name: /Valeur au prix d${AP}achat ${EM}/ })`,
  `  await inputs.first().fill(${Q}100${Q})`,
  ``,
  `  await page.getByRole(${Q}button${Q}, { name: ${Q}Enregistrer tous les comptages${Q} }).click()`,
  ``,
  `  await expect(page.getByRole(${Q}alert${Q})).toContainText(${Q}Renseignez chaque rayon${Q})`,
  `  await expect(page.getByRole(${Q}dialog${Q})).toBeHidden()`,
  `})`,
  ``,
  `/*`,
  ` * The loss prompt is the entry point to the loss screen, and the loss screen is`,
  ` * the only defence against goods that left the shelf being reported as profit.`,
  ` * Following the link is part of the flow, not a separate feature.`,
  ` */`,
  `test(${Q}the loss prompt leads to the loss screen${Q}, async ({ signedIn: page }) => {`,
  `  await page.goto(${Q}/counts${Q})`,
  ``,
  `  await page.getByLabel(${Q}Rayon${Q}).selectOption({ index: 1 })`,
  `  const categoryId = await page`,
  `    .getByLabel(${Q}Rayon${Q})`,
  `    .evaluate((el: HTMLSelectElement) => el.value)`,
  ``,
  `  // Delete any prior run${AP}s count so this test is idempotent across runs.`,
  `  // Without this, a second run hits unique(category, date, source=${Q}standalone${Q}).`,
  `  const jwt = await page.evaluate((): string | null => {`,
  `    const k = Object.keys(localStorage).find(`,
  `      (key) => key.startsWith(${Q}sb-${Q}) && key.endsWith(${Q}-auth-token${Q}),`,
  `    )`,
  `    return k`,
  `      ? (JSON.parse(localStorage.getItem(k)!) as { access_token: string }).access_token`,
  `      : null`,
  `  })`,
  `  if (jwt) {`,
  `    await page.request.fetch(`,
  lossDeleteUrl,
  lossDeleteQs,
  `      {`,
  `        method: ${Q}DELETE${Q},`,
  `        headers: {`,
  lossAuthLine,
  `          apikey:`,
  `            ${Q}${ANON_KEY}${Q},`,
  `          Prefer: ${Q}return=minimal${Q},`,
  `        },`,
  `      },`,
  `    )`,
  `  }`,
  ``,
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
  ``,
  `  await page.getByRole(${Q}button${Q}, { name: ${Q}Oui, d${EG}clarer une perte${Q} }).click()`,
  ``,
  `  await expect(page.getByRole(${Q}heading${Q}, { name: ${Q}Pertes${Q}, exact: true })).toBeVisible()`,
  `  await expect(page.getByText(/compt${EG}s comme vendus/)).toBeVisible()`,
  `})`,
  ``,
].join('\n')

writeFileSync(file, content, 'utf8')
const buf = readFileSync(file)
console.log(`first byte: ${buf[0]} (expected 105)`)

// Verify key lines
const lines = content.split('\n')
console.log('n-line:       ', JSON.stringify(lines.find((l) => l.includes('comptages enregistr'))))
console.log('sweep-del-url:', JSON.stringify(lines.find((l) => l.includes('occurred_on=eq.'))))
console.log('loss-del-url: ', JSON.stringify(lines.find((l) => l.includes('category_id=eq.'))))
console.log('sweep-auth:   ', JSON.stringify(lines.find((l) => l.includes('sweepJwt'))))
console.log('loss-auth:    ', JSON.stringify(lines.find((l) => l.includes('Bearer') && l.includes('jwt'))))
