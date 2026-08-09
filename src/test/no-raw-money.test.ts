import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/*
 * "A raw number cannot reach the screen" (plan, Phase 3 exit criterion), and
 * "a repo-wide grep proves no arithmetic on money exists in `src/` outside
 * formatting" (Phase 5 exit criterion). Both are assertions rather than a
 * reviewer's eye, because a rule checked once at the end of a phase is a rule
 * that was broken in the middle of it.
 *
 * The app renders what `report_period` returns (architecture-spec §1.2). It
 * neither formats money nor computes it:
 *
 *   - formatting belongs to <Money> alone, so the measured/modelled distinction
 *     cannot be bypassed by a component that "just needed a number here";
 *   - arithmetic belongs to Postgres alone — not a subtotal, not a percentage,
 *     not a difference between two figures already on screen. A total computed
 *     here would agree with the engine on the day it was written and drift the
 *     first time rounding, allocation or an anomaly rule changed. It would then
 *     be wrong on screen and right in the database, which is the failure nobody
 *     notices.
 */

// Vitest runs from the project root. `import.meta.url` is rewritten during
// transform and does not resolve to a real path here.
const SRC = join(process.cwd(), 'src')
const FORMATTER = 'components/Money.tsx'

// Windows path.relative() returns backslashes; normalise to POSIX for comparisons.
const rel = (f: string) => relative(SRC, f).replace(/\\/g, '/')

// A currency formatter, or a hand-rolled one, anywhere but <Money>.
const FORMATTING = [/Intl\.NumberFormat/, /\.toFixed\s*\(/, /\.toLocaleString\s*\(/]

/*
 * Every money-bearing name the app can hold: the keys of the `report_period`
 * and `report_trend` documents (types/report.ts), plus the amount fields the
 * write path carries. If one of these appears next to an arithmetic operator,
 * the app is computing money.
 */
const MONEY_NAMES = [
  // report_period.measured / .modelled
  'purchases_total',
  'operating_charges',
  'owner_draws_cash',
  'owner_draws_in_kind',
  'shrinkage_losses',
  'cash_out',
  'goods_sold_at_cost',
  'revenue_est',
  'gross_profit_est',
  'operating_profit_est',
  'net_cash_change_est',
  'cost_incurred',
  // report_period.by_category / .coverage / .stock_on_hand
  'last_count_value',
  'purchases_in_period',
  'losses_in_period',
  'unsettled_purchases',
  'total_last_counted',
  'max_possible',
  // the write path and the read models around it
  'valueAtCost',
  'amount',
  'expectedOnHand',
  'priorStockValue',
]

/*
 * ONE exemption, named rather than hidden.
 *
 * The sweep echoes back the running total of the values the user is typing
 * right now (features/counts/useSweepDraft.ts). That is the user's own input
 * added up before it has been sent anywhere — not a reported figure, and not
 * one that can disagree with the engine, because the engine has not seen it
 * yet. Keeping the exemption visible here is the point: an exception that lives
 * only in a comment beside the code it excuses is not an exception, it is a
 * loophole.
 */
const ARITHMETIC_EXEMPT = ['features/counts/useSweepDraft.ts']

const OPERATOR = String.raw`[+\-*/]`

/*
 * An optional `a.b?.c.` in front of the name, so `report.measured.cash_out`
 * counts as an occurrence of `cash_out`. The prefix has to END in a dot:
 * without that anchor the path swallows the name itself and the pattern
 * silently matches nothing — which is exactly what the "would catch" cases
 * below caught when this was first written.
 */
const PROPERTY_PREFIX = String.raw`(?:[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\??\.)?`

/** `x.cash_out + …` or `… + x.cash_out` — an operator adjacent to money. */
function arithmeticOn(name: string): RegExp {
  return new RegExp(
    String.raw`\b${name}\b\s*${OPERATOR}[^=/*]|` +
      String.raw`${OPERATOR}\s*${PROPERTY_PREFIX}\b${name}\b`,
  )
}

/*
 * Comments and import paths are not code, and both produce false matches: a
 * comment explaining why a total is NOT computed here reads exactly like one
 * that is, and `from '@/lib/amount'` is a `/` in front of a money name.
 *
 * Stripped rather than special-cased, so the guard reads the program and not
 * the prose around it. `//` is only treated as a comment when it is not
 * preceded by `:`, which keeps a `https://` inside a string from blanking the
 * rest of its line.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^\s*(?:import|export)\b[^\n]*\bfrom\s*['"][^'"]*['"][^\n]*$/gm, '')
    .replace(/^\s*import\s*['"][^'"]*['"][^\n]*$/gm, '')
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

describe('money never bypasses <Money>', () => {
  const files = walk(SRC).filter((f) => !/\.test\.tsx?$/.test(f))

  it('finds the source tree it is meant to be guarding', () => {
    // Without this, a broken path silently turns the whole guard into a no-op
    // that passes forever.
    expect(files.length).toBeGreaterThan(10)
    expect(files.some((f) => rel(f) === FORMATTER)).toBe(true)
  })

  it.each(FORMATTING.map((re) => [re.source, re] as const))(
    'no %s outside <Money>',
    (_label, pattern) => {
      const offenders = files
        .filter((f) => rel(f) !== FORMATTER)
        .filter((f) => pattern.test(readFileSync(f, 'utf8')))
        .map((f) => rel(f))

      expect(offenders).toEqual([])
    },
  )
})

describe('the app renders money, it never computes it', () => {
  const files = walk(SRC)
    .filter((f) => !/\.test\.tsx?$/.test(f))
    .filter((f) => !ARITHMETIC_EXEMPT.includes(rel(f)))

  it.each(MONEY_NAMES)('no arithmetic on `%s`', (name) => {
    const pattern = arithmeticOn(name)
    const offenders = files
      .filter((f) => pattern.test(code(readFileSync(f, 'utf8'))))
      .map((f) => rel(f))

    expect(offenders).toEqual([])
  })

  /*
   * The guard has to be able to FIRE, not merely to pass. A grep that matches
   * nothing looks identical to a codebase that obeys the rule — and the
   * difference only shows up years later, when it turns out the pattern never
   * worked.
   */
  it.each([
    'const total = report.modelled.revenue_est + other',
    'const each = row.goods_sold_at_cost / n',
    'const delta = a - report.measured.cash_out',
    'const half = amount * 0.5',
  ])('would catch `%s`', (snippet) => {
    const caught = MONEY_NAMES.some((name) => arithmeticOn(name).test(snippet))
    expect(caught).toBe(true)
  })

  it('does not fire on a property access, a JSX prop or a comparison', () => {
    const innocent = [
      'const v = report.measured.cash_out',
      '<Money value={row.last_count_value} kind="measured" />',
      'rows.filter((c) => c.unsettled_purchases > 0)',
      'const { amount } = props',
    ]

    for (const snippet of innocent) {
      const caught = MONEY_NAMES.filter((name) => arithmeticOn(name).test(snippet))
      expect(caught, snippet).toEqual([])
    }
  })

  it('names the exemption it grants, and grants only that one', () => {
    // If the sweep total moves or is deleted, this list must be revisited
    // rather than left to quietly excuse a file that no longer needs it.
    expect(ARITHMETIC_EXEMPT).toEqual(['features/counts/useSweepDraft.ts'])
    const source = readFileSync(join(SRC, 'features/counts/useSweepDraft.ts'), 'utf8')
    expect(source).toMatch(/sum \+ e\.valueAtCost/)
  })

  /*
   * Stripping comments must not strip code. If `code()` ever over-reaches, the
   * whole arithmetic guard silently degrades into a no-op that passes on an
   * empty string — the same failure mode as a walk() over the wrong directory.
   */
  it('strips comments and imports without eating the program', () => {
    const source = [
      "import { x } from '@/lib/amount'",
      '/* a block comment about amount + charges */',
      '// a line comment about revenue_est + 1',
      'const total = report.modelled.revenue_est + other',
    ].join('\n')

    const stripped = code(source)
    expect(stripped).toContain('const total = report.modelled.revenue_est + other')
    expect(stripped).not.toContain('block comment')
    expect(stripped).not.toContain('line comment')
    expect(stripped).not.toContain('@/lib/amount')
    expect(arithmeticOn('revenue_est').test(stripped)).toBe(true)
  })
})
