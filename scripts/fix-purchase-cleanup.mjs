import { readFileSync, writeFileSync } from 'node:fs'

const Q = String.fromCharCode(0x0027) // ' ASCII single quote
const AP = String.fromCharCode(0x2019) // ' RIGHT SINGLE QUOTATION MARK
const BT = String.fromCharCode(0x0060) // ` backtick

const SUPABASE_URL = 'https://bucmxwutpfksjrylijeu.supabase.co'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Y214d3V0cGZrc2pyeWxpamV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2OTg0OTEsImV4cCI6MjEwMTI3NDQ5MX0.SfVCrf11puAT6VnexFoyY9GSseUNvukzHqo7MUWr8vI'

const file = 'e2e/purchase.spec.ts'
let src = readFileSync(file, 'utf8')

// Locate the retried-submission test's opening goto line.
// After sign-in (fixture), the page has the auth token in localStorage.
// We delete all e2e-* note purchases before the test so the toHaveCount(1)
// assertion is not inflated by rows from prior runs.

// The marker to find
const marker1 = `test(${Q}a retried submission does not post the purchase twice${Q}`
// Also check curly variant
const marker2 = `test(${String.fromCharCode(0x2018)}a retried submission does not post the purchase twice${String.fromCharCode(0x2019)}`

let startIdx = src.indexOf(marker1)
if (startIdx === -1) startIdx = src.indexOf(marker2)
if (startIdx === -1) {
  console.error('Cannot find retried-submission test')
  process.exit(1)
}

// Find the 'await page.goto(' line within that test
const gotoPattern = `await page.goto(${Q}/purchases${Q})`
let gotoIdx = src.indexOf(gotoPattern, startIdx)
if (gotoIdx === -1) {
  console.error('Cannot find goto line in retried test')
  process.exit(1)
}
const gotoEnd = gotoIdx + gotoPattern.length

// Build the cleanup block
const authLine = `          Authorization: ${BT}Bearer \${jwt}${BT},`
const cleanupBlock = [
  ``,
  `  // Delete any purchases from previous test runs that would inflate the count.`,
  `  // Without this, each run adds a 137,42 row that the toHaveCount(1) assertion catches.`,
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
  `      ${Q}${SUPABASE_URL}/rest/v1/purchase?note=like.e2e-*${Q},`,
  `      {`,
  `        method: ${Q}DELETE${Q},`,
  `        headers: {`,
  authLine,
  `          apikey: ${Q}${ANON_KEY}${Q},`,
  `          Prefer: ${Q}return=minimal${Q},`,
  `        },`,
  `      },`,
  `    )`,
  `  }`,
].join('\n')

// Insert cleanup block after the goto line
src = src.slice(0, gotoEnd) + cleanupBlock + src.slice(gotoEnd)

writeFileSync(file, src, 'utf8')
const buf = readFileSync(file)
console.log(`first byte: ${buf[0]} (expected 105)`)

// Verify the auth line looks right
const written = readFileSync(file, 'utf8')
const lines = written.split('\n')
const authLineIdx = lines.findIndex((l) => l.includes('Authorization:') && l.includes('jwt'))
if (authLineIdx !== -1) {
  console.log('Auth line:', JSON.stringify(lines[authLineIdx]))
} else {
  console.error('Auth line not found!')
}
