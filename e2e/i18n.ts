import { ar } from '../src/i18n/ar'
import { fr } from '../src/i18n/fr'

/*
 * Naming the strings the browser will actually show.
 *
 * ⚠ This module exists because of a defect these tests could not report
 * themselves. Phase 8 switched the running language to Arabic (`src/i18n/index.ts`
 * sets `lng: 'ar'`), and every spec in this directory was selecting by
 * hardcoded French — `getByLabel('Rayon')`, `getByRole('button', { name:
 * 'Suivant' })`. The suite could not have passed against the built app from the
 * moment that line landed. Nothing caught it: `npm run verify` does not run
 * Playwright, the dev box has no browser, and the one machine that has a
 * browser had not run the suite since before Phase 8. A test suite that no
 * machine can execute does not fail — it goes quiet, which is worse.
 *
 * So specs name a translation KEY and this resolves it the way i18next will at
 * runtime: the active language first, French as `fallbackLng`. Change the
 * language again and these tests follow it. Delete a key and they fail loudly
 * here, naming the key, rather than timing out on a selector that matches
 * nothing.
 *
 * It deliberately does NOT import i18next. Reimplementing lookup + fallback +
 * interpolation is ~20 lines; booting the real instance inside Playwright's
 * node process would import React and the app's whole i18n init for the sake of
 * reading strings out of two plain objects.
 */

type Dict = { [key: string]: string | Dict }

const ACTIVE = ar.translation as Dict
const FALLBACK = fr.translation as Dict

function lookup(dict: Dict, key: string): string | undefined {
  const found = key
    .split('.')
    .reduce<string | Dict | undefined>(
      (node, part) => (typeof node === 'object' && node !== null ? node[part] : undefined),
      dict,
    )
  return typeof found === 'string' ? found : undefined
}

/**
 * The string the app will render for `key`, with `{{placeholders}}` filled.
 *
 * Mirrors i18next's fallback: the active language, then French. A key missing
 * from both throws — a spec that asks for a string the app cannot produce is
 * wrong now, not at some later timeout.
 */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const raw = lookup(ACTIVE, key) ?? lookup(FALLBACK, key)
  if (raw === undefined) {
    throw new Error(`e2e/i18n: no translation for "${key}" in ar or fr`)
  }

  // `{{n}}` and i18next's format syntax `{{markup, number}}` — the format part
  // is dropped, since these assertions compare against rendered text, not
  // against a formatting decision (that is <Money>'s job and only <Money>'s).
  return raw.replace(/\{\{\s*([^},]+?)\s*(?:,[^}]*)?\}\}/g, (_match, name: string) => {
    if (!(name in vars)) {
      throw new Error(`e2e/i18n: "${key}" needs a value for {{${name}}}`)
    }
    return String(vars[name])
  })
}

/**
 * The literal part of an interpolated string, up to its first placeholder.
 *
 * For assertions that must match a message whose variable half is a date or a
 * count the spec has no reason to predict — `counts.previous` is *"Dernier
 * comptage (12 août) :"*, and what is being checked is that the reference is
 * shown at all.
 */
export function stem(key: string): string {
  const raw = lookup(ACTIVE, key) ?? lookup(FALLBACK, key)
  if (raw === undefined) {
    throw new Error(`e2e/i18n: no translation for "${key}" in ar or fr`)
  }
  const cut = raw.indexOf('{{')
  return (cut === -1 ? raw : raw.slice(0, cut)).trim()
}

/** A regex matching any one of the given literals, escaped. */
export function anyOf(...literals: string[]): RegExp {
  return new RegExp(literals.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'))
}
