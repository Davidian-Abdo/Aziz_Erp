# Flow tests (Playwright)

The Phase 4 exit criterion of `docs/v1.0_impl_plan.md`: the purchase-with-count
round trip, the month-end sweep, and a deliberately double-submitted purchase
creating exactly one row. Since 2026-08-16, also `edit.spec.ts` — correcting a
record in place (Phase 9), including the two defects that building it found.

## ⚠ Selectors name translation KEYS, never literal strings

`import { t } from './i18n'`, and write `t('purchases.save')` rather than
`'Enregistrer l’achat'`. `e2e/i18n.ts` resolves a key the way i18next will at
runtime — the active language first, French as the fallback.

This is not tidiness. Phase 8 switched the app to Arabic (`lng: 'ar'`), and every
spec here was selecting by hardcoded French. **From that commit until
2026-08-16, this suite could not have passed against the built application** —
and nothing said so, because `npm run verify` does not run Playwright and the one
machine with a browser had not run it since. A suite no machine executes does not
fail; it goes quiet, which is worse than failing.

## Type-checking

`tsconfig.e2e.json` puts this directory into `tsc -b`, so `npm run verify`
compiles the specs even where they cannot be run. Before 2026-08-16 `e2e/` was
outside every tsconfig project and was never typechecked at all.

⚠ `scripts/fix-*.mjs` are a **historical record** of a 2026-08-09 tool-encoding
workaround, kept by Entry 9. They rewrite the specs to their pre-Arabic French
text. **Do not run them.** The corruption they existed to catch is now caught by
`tsc -b` instead.

## ⚠ These do not run on the Hetzner dev box

Playwright ships no Chromium build for the box's Ubuntu 26.04 and the box has no
system Chrome (`~/projects/last_session_work.md`). `@playwright/test` is
installed with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, so there is no browser
binary here and `npm run test:e2e` will say so rather than pretend.

**They have therefore never been executed.** Nothing in `current_state.md`
claims otherwise. What *has* been verified on the box is narrower and stated
there: the component suite, and the write path at the HTTP level.

## Running them where a browser exists — the Windows PC, and it is Amer's job

`Amer_Prompt.md` names this as the first item of that agent's session, because
it is the only thing on this project that one machine can do and the other
cannot. Three consecutive entries in `current_state.md` have had to record these
specs as *written and never executed*.

```bash
npx playwright install chromium          # once
export E2E_EMAIL=…                       # an allowlisted user
export E2E_PASSWORD=…                    # of a NON-PRODUCTION project
npm run test:e2e
```

`.env` must point at the same project (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`) — the config builds the app and serves it with
`vite preview`. ⚠ **`.env` is gitignored and does not arrive with a `git
pull`.** Both values come from the owner; `.env.example` explains why holding
them is safe and which key must never appear.

A login that is *not* on the project's `app_user` allowlist reaches a working
application in which every screen is empty. That is the designed behaviour
(`architecture-spec.md` §4.2), not a bug in the tests.

## They write, and they clean up only after themselves

Each run adds purchases, counts and (via the prompt) possibly a loss to the
project it is pointed at. There is no delete-everything button in the
application and inventing one for the tests would be inventing a hole in it.

What the specs do have is `deleteRows()` from `fixtures.ts`: a PostgREST DELETE
as the signed-in user, under RLS, reaching only rows the owner could delete from
the UI anyway. It exists because several assertions are about an **exact row
count**, and a previous run's leftovers make those fail in a way that reads
exactly like a regression. The project it deletes from comes from `.env`, loaded
by `playwright.config.ts` through Vite's own loader — the same value the bundle
under test was built with, so it cannot drift into deleting from a project the
app is not even talking to.

**Never point these at `aziz-prod`.** A test purchase in the production ledger
is not a test artefact, it is a wrong number in the owner's accounts — and this
model turns a spurious purchase into reported profit.

The `aziz-dev` project is the intended target. Expect its numbers to be
meaningless afterwards, which is what a dev project is for.
