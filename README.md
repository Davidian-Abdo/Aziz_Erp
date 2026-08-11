# Aziz ERP

A mini ERP for a single grocery store.

It is a **periodic inventory system, at category level, valued at buying price**.
There are no barcodes, no product catalogue and no record of individual sales.
Goods are tracked in money at cost, grouped into a dozen categories; stock is
established by counting the shelves; what left between two counts is *inferred*;
and revenue is *modelled* from a per-category markup.

That last point governs the whole design: **every revenue and profit figure this
system shows is an estimate, not a measurement.** The UI is required to make that
impossible to miss — modelled figures carry a `≈`, a distinct tint and a tooltip
explaining the markup they came from. This is not decoration; it is the honesty
mechanism that makes the approach acceptable at all.

## Documents

| Document | What it is |
|---|---|
| [`docs/domain-spec.md`](docs/domain-spec.md) | The business logic and every computation |
| [`docs/architecture-spec.md`](docs/architecture-spec.md) | The technical design |
| [`docs/v1.0_impl_plan.md`](docs/v1.0_impl_plan.md) | The build plan — **normative where it contradicts the specs** |
| [`docs/plan_review.md`](docs/plan_review.md) | Review of the plan, with its findings |
| [`docs/restore-runbook.md`](docs/restore-runbook.md) | How to get the books back from an encrypted backup |
| [`current_state.md`](current_state.md) | Handoff log — read this first |
| [`Hmdnah_Prompt.md`](Hmdnah_Prompt.md) | Session prompt for the agent on the Hetzner dev box |
| [`Amer_Prompt.md`](Amer_Prompt.md) | Session prompt for the agent on the owner's Windows PC |

Two agents build this, on two machines, and the repository is the only channel
between them. Both prompts are **stateless**: where the work stands lives in
exactly one place, the newest entry of `current_state.md`, which is append-only
and therefore cannot go quietly stale. **Read that entry before anything else.**

The machines are not interchangeable. The dev box has no browser — no Chromium
exists for its Ubuntu — so the Playwright flow tests and every visual check
belong to the Windows PC. `e2e/README.md` says what they write and where they
must never be pointed.

## Shape

A static React SPA talking directly to **Supabase** (Postgres + Auth + RLS) over
PostgREST. No API layer, no edge functions, no server code — which is what makes
it free to run and nothing to maintain.

**All accounting logic lives in Postgres**, as views and functions. The React app
contains no accounting arithmetic whatsoever; it renders what the `report_period`
RPC returns. Computing a total on the client is a spec violation, not a shortcut.

## Working on it

Requires Node 20+ and Docker.

```bash
npm install
npm run db:up        # local Postgres (supabase/postgres) on :5434
npm run db:reset     # drop schema, replay every migration + seed
npm run db:test      # the pgTAP suite — the layer that matters
npm run dev          # Vite dev server
npm run verify       # lint + format + typecheck + component tests

./scripts/restore-rehearse.sh   # prove the backup restores, end to end
```

⚠ **`db:test` only passes against a database that has not yet traded.** Every
fixture builds its own ledger and asserts absolute figures, so real purchases
make it red over arithmetic that is perfectly correct. Run it against the local
container or a restored copy — never against a live shop. See
`current_state.md` §3.

The pgTAP suite is the important one. It protects the arithmetic the store's
decisions rest on, and **a wrong number there is worse than a crash, because
nobody notices.**

The local database carries the schema and reporting phases and is then torn down;
from the UI phases onward the app runs against a Supabase project.
