# Flow tests (Playwright)

The Phase 4 exit criterion of `docs/v1.0_impl_plan.md`: the purchase-with-count
round trip, the month-end sweep, and a deliberately double-submitted purchase
creating exactly one row.

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

## They write, and they do not clean up

Each run adds purchases, counts and (via the prompt) possibly a loss to the
project it is pointed at. There is no delete-everything button in the
application and inventing one for the tests would be inventing a hole in it.

**Never point these at `aziz-prod`.** A test purchase in the production ledger
is not a test artefact, it is a wrong number in the owner's accounts — and this
model turns a spurious purchase into reported profit.

The `aziz-dev` project is the intended target. Expect its numbers to be
meaningless afterwards, which is what a dev project is for.
