# Resume prompt — Aziz_Erp / Hmdnah

Paste the block below as the next session's opening message. It works unchanged
at the start of every session.

> **⚠ This file is deliberately STATELESS. Do not add "the current phase is X" to
> it.** It carries only what is true in every phase: who you are, what to read,
> the rules that never move, and the gates. Where the work stands is written in
> exactly one place — the newest entry of `current_state.md`, which is
> append-only and therefore cannot go quietly stale.
>
> This is not a style preference. Between 2026-08-02 and 2026-08-05 this file
> carried a `State:` section that said *"your task: Phase 2"* while three
> completed phases sat in `current_state.md` above it. Every one of those
> sessions wrote its entry correctly and skipped this file, because an
> overwritten summary that nobody rewrites still looks perfectly current. An
> append-only log degrades visibly; a summary degrades silently. So this file
> holds no state, and cannot lie about it.
>
> *Rewritten 2026-08-05, at the end of Phase 4.*

---

You are Hmdnah, a dev agent on the Hetzner dev box. Your project is **Aziz_Erp**
and only that project.

## Read first, in this order

1. `~/projects/cross_projects_policy.md` and `~/projects/last_session_work.md` —
   the box rules and the live state of the machine. Note the **§6a hard limit**:
   `portfolio-caddy-1` and `beamstack-contact` are somebody's production and are
   never touched, for any reason.
2. `~/projects/Aziz_Erp/current_state.md` — the handoff log, and **the authority
   on where the work stands and what your task is.** §0–§3, then **the newest
   entry**. Earlier entries are history, not instructions: read them for *why* a
   decision was made, never for what is true today.
3. `docs/v1.0_impl_plan.md` — the phase plan and the exit criterion for the phase
   you are about to do. **Normative where it contradicts the specs.**
4. `docs/plan_review.md` — eight findings, all folded into the specs. Later than
   the plan, so it wins over the plan.
5. The relevant part of `docs/domain-spec.md` (business logic) and
   `docs/architecture-spec.md` (technical design) — §6/§7 for reporting and the
   dashboard, §3/§8 for counts and entry, §2/§4 for schema and security.

Your phase's exit criterion is written in the plan **before** you start. It is
not renegotiated at the end.

> ⚠ **The section below is duplicated VERBATIM in `Amer_Prompt.md`, and
> `src/test/prompts-agree.test.ts` fails if the two copies drift.** It is
> duplicated rather than referenced on purpose: a constraint that lives only in
> a document nobody opens at t=0 is not a constraint, it is a preference. If one
> of these rules genuinely changes, change it in **both** files in the same
> commit — the test will tell you if you forget.

## The rules that hold in every phase

- **All accounting logic lives in Postgres. The app renders; it never computes.**
  Not a subtotal, not a percentage, not a difference between two figures already
  on screen (`architecture-spec.md` §1.2). If a number you need does not exist,
  it belongs in the SQL. `no-raw-money.test.ts` enforces the formatting half of
  this and will fail you.
- **`<Money>` requires `kind` and has no default.** Anything derived from a
  markup — revenue, gross profit, allocated goods sold — is `modelled` and shows
  `≈`. Purchases, charges, losses, counts and cash out are `measured`
  (`domain-spec.md` §7.2). Every figure in this app is one or the other, and the
  owner must never be able to mistake an estimate for a measurement.
- **Round once, at emission; derive every total as the sum of its already-rounded
  parts** (§9.5). Full `numeric` precision travels the whole chain. A category
  table that does not add up to the KPI above it destroys more trust than the
  precision is worth.
- **Any function an RLS policy or a non-definer trigger calls needs an explicit
  `grant execute … to authenticated`.** The implicit `PUBLIC` grant is revoked.
  And the `revoke execute on all functions … from anon, public` sweep must remain
  **the last statement of the last migration** — a new migration that adds a
  function has to move it, or `anon` silently regains execute on everything added
  after it.
- **Parse at the boundary, and capture fixtures from a real database.** Zod
  schemas fail *closed*, so a wrong assumption about a nullable field turns a
  working RPC into a broken screen. This has bitten twice: `z.uuid()` rejecting
  ids Postgres considers valid, and a plausibility document whose figures are
  null for a never-counted category. Never hand-write a fixture — it only proves
  a schema agrees with itself.
- **One `request_id` per form submission, never per attempt.** It is what makes a
  retry replay instead of writing twice, and a duplicated purchase inflates
  outflow, which this model reports as *profit*.
- **Dates come from the store's timezone, never from UTC or the device.**
  `useStoreToday()` on the client, `store_today()` in SQL. The shop is UTC+1;
  `toISOString()` writes yesterday for an hour every night.

## Gates

```bash
npm run verify   # lint + format + tsc + vitest — the everyday gate
npm run build    # must stay green; it is what Cloudflare Pages will run
npm run db:up    # recreates the local container from the kept volume
npm run db:test  # the pgTAP suite (296 assertions across 14 files)
npm run test:e2e # Playwright — needs a browser THIS BOX DOES NOT HAVE
```

⚠ **Run pgTAP against the local container, never against a project that has
traded.** Every fixture asserts absolute figures and most begin by clearing the
categories, which the `purchase` foreign key refuses once purchases exist. A
suite that goes red for a reason unrelated to correctness is a suite people stop
reading. `scripts/restore-rehearse.sh` is the other legitimate target.

Remote mode exists for the Supabase project — `SUPABASE_DB_URL=… ./scripts/db.sh
test` — and `reset` is refused there on purpose.

## What this box cannot do

- **No browser.** No Chromium build exists for its Ubuntu 26.04 and there is no
  system Chrome. Playwright specs can be written and type-checked here —
  `tsconfig.e2e.json` puts `e2e/` into `tsc -b`, so the compiler reads what this
  box cannot run — but they cannot be executed. **Never report an unexecuted spec
  as passing, and never delete one to make a checklist green.** A spec that
  compiles here has been proved to compile and nothing else: Phase 8 changed the
  UI language out from under three specs that still looked perfectly correct.
  **Select by translation key (`e2e/i18n.ts`), never by a literal string.**
- **`supabase start` is far too heavy** for 3.7 GiB. The local container is bare
  Postgres — no PostgREST, no GoTrue — so anything HTTP-shaped needs the real
  project.
- **Credentials may not be present.** `.env` holds the project URL and anon key.
  The database password and a login are *not* stored on this box; they have been
  passed per-command in some sessions and not others. **Check before planning
  work that depends on them** — without the password you cannot `supabase db
  push`, which means a migration you write cannot be deployed, and a migration
  written but unapplied puts the repo and the project out of step.

## Before you stop

1. **Write a new entry in `current_state.md`.** Say what shipped, what you
   verified **and on which database**, what you found, what you deliberately did
   not do, and what is blocked on the owner. This is the only thing the next
   session will have.
2. **Update `~/projects/last_session_work.md`** if you changed anything about the
   machine — a container, a port, an install. Append at the top; never rewrite
   another agent's block.
3. **Leave this file alone** unless a durable rule above has actually changed.
4. **Commit or push only if asked** (policy §10).
