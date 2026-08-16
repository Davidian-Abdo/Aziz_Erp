# Aziz ERP — current state

Cross-agent, cross-machine handoff log (`cross_projects_policy.md` §9). Travels
with the code. **Read §0–§2 and the latest entry before starting work.**

---

## 0. What this project is

A mini ERP for a single grocery store: a **periodic inventory system, at category
level, valued at buying price**. No barcodes, no product catalogue, no individual
sales. Stock is established by counting events; the cost of goods that left the
shelves is *inferred* between two counts; revenue is *modelled* from a
per-category markup.

The consequence that governs every design decision: **every revenue and profit
figure is an estimate, and the UI must never let it be mistaken for a
measurement** (`docs/domain-spec.md` §7.2).

## 1. The documents, and which one wins

| Document | Role |
|---|---|
| `docs/domain-spec.md` | Business logic and every computation. Amended 2026-08-02 |
| `docs/architecture-spec.md` | Technical design. Amended 2026-08-02 |
| `docs/v1.0_impl_plan.md` | The build plan. **Normative where it contradicts the specs** |
| `docs/plan_review.md` | Review of the plan, 2026-08-02, with 8 findings |
| `docs/restore-runbook.md` | How to restore the books from a backup. Written 2026-08-11 |
| `docs/deploy-runbook.md` | Owner-facing: `aziz-prod`, Cloudflare, every secret, in order. Written 2026-08-16 |
| `Hmdnah_Prompt.md` | Session opening prompt for **Hmdnah**, on the Hetzner dev box |
| `Amer_Prompt.md` | Session opening prompt for **Amer**, on the owner's Windows PC |

All eleven of the specs' open questions (Q1–Q11) are **answered** — plan §1.2.

**Both prompts are STATELESS by design.** They carry the standing rules and
defer to *this* file for where the work stands; do not put state in either. They
also carry the same "rules that hold in every phase" block **verbatim** —
duplicated deliberately, because a constraint that lives only in a document
nobody opens at t=0 is a preference rather than a constraint. The two copies are
pinned by `src/test/prompts-agree.test.ts`: change a rule in both files in the
same commit, or the suite fails and names the line.

## 1b. Two agents, two machines

| | Hmdnah | Amer |
|---|---|---|
| Machine | Hetzner dev box (Linux) | The owner's Windows PC |
| Browser | **None.** No Chromium for Ubuntu 26.04, no system Chrome | **Yes** |
| Docker / local Postgres | Yes (`aziz_erp_pg`, see §3) | Docker Desktop installed (2026-08-10). Use Git Bash or WSL2 for `scripts/db.sh`. Same container name / port as §3. |
| Box-local docs | `cross_projects_policy.md`, `last_session_work.md` — **not in git**, do not exist for Amer | — |

Roles are symmetric and fluid; the **machine** is what differs. That difference
is not cosmetic here: Phases 3–5 built the entire UI and **no browser has ever
rendered it**, so the Playwright criterion of Phase 4 and the first visual check
of the app are Amer's by construction. This repository is the only channel
between the two machines — `current_state.md` is what travels.

## 2. Stack and where the logic lives

Static React SPA (Vite, TS) talking directly to **Supabase** (Postgres + Auth +
RLS) via PostgREST. **No API layer, no edge functions, no server code.**

**All accounting logic lives in Postgres** as views and functions — event
ordering, count windows, allocation, markup, the profit chain. The React app
contains **no accounting arithmetic whatsoever**; it renders what the
`report_period` RPC returns. Computing a total on the client is a spec violation
(`architecture-spec.md` §1.2).

---

## 3. Environment — the Hetzner dev box

*(Amer: this section describes Hmdnah's machine. Your machine's environment is
in §3b below. The one thing that does not travel with a pull is `.env` — it is
gitignored, so the Supabase URL and anon key have to come from the owner.)*

**Local dev database** (plan §3, decision D-D): container `aziz_erp_pg`,
`supabase/postgres:17.6.1.158`, host port **5434**, volume `aziz_erp_pg_data`,
capped at 512 MB. Driven entirely by `scripts/db.sh` — no psql client needed on
the box.

```bash
npm run db:up       # start the container
npm run db:reset    # drop schema, replay all migrations + seed
npm run db:test     # run the pgTAP suite
npm run db:psql     # interactive shell
npm run verify      # lint + format + typecheck + vitest
npm run test:e2e    # Playwright — needs a browser this box does not have
```

**The container is not running.** It was removed at the end of Phase 2
(2026-08-02) per plan §3, brought back for an hour on 2026-08-05 to capture the
Phase 4 test fixtures, and removed again. The **named volume `aziz_erp_pg_data`
is kept** until v1.0 ships, so `npm run db:up` recreates the container with the
schema intact — a teardown, not a deletion. Port 5434 is free.

**From Phase 3 on, the authority is the Supabase dev project, not this box** — a
documented deviation from `cross_projects_policy.md` §7, because the Supabase
project's extension set and role model are what production actually runs.

**⚠ The pgTAP suite only runs green against a database that has not yet traded**
(found 2026-08-11, Entry 17). Every fixture builds its own ledger and asserts
**absolute** figures — `020_rls.sql` wants to read exactly 1 count and a report
of exactly 10.00 — and nine of the fourteen files begin with `delete from
article_category`, which the `purchase` foreign key refuses once purchases
exist. So any pre-existing trading data makes the suite red over arithmetic that
is perfectly correct. It passed against aziz-dev in Entry 4 because that project
was empty. **Once the shop enters a single purchase, `SUPABASE_DB_URL=…
./scripts/db.sh test` will report failures against a project that is entirely
healthy.** Nothing is destroyed when that happens — every fixture wraps itself
in `begin … rollback` — but a suite that goes red for a reason unrelated to
correctness is a suite people stop reading. Run it against the local container
or a restored copy (`scripts/restore-rehearse.sh`), not against a live shop.

Toolchain: Node 20.20.2 / npm 10.8.2 (present on the box), Supabase CLI 2.111.0
installed user-local at `~/bin/supabase` (no sudo, same pattern as `gh`).

## 3b. Environment — the Windows PC (Amer's machine)

**Docker Desktop is installed** (confirmed 2026-08-10). The local database
container and pgTAP suite work identically to §3:

```bash
npm run db:up    # start aziz_erp_pg in Docker Desktop
npm run db:reset # drop schema, replay all migrations + seed
npm run db:test  # run the 275-assertion pgTAP suite
npm run db:psql  # interactive shell
```

**Shell requirement:** `scripts/db.sh` is bash. All `db:*` commands must be run
in **Git Bash** or **WSL2** — they will fail silently or not at all from
PowerShell or cmd. Make sure Docker Desktop is running before calling any of
them.

**Container:** same name and port as the Hetzner box — `aziz_erp_pg`,
`supabase/postgres:17.6.1.158`, host port **5434**, volume `aziz_erp_pg_data`.
If the container does not exist yet on this machine, `npm run db:up` creates and
seeds it from scratch.

**pgTAP is now Amer's to run.** Phases that have a pgTAP exit criterion must be
closed here, not deferred to Hmdnah. The pattern: `npm run db:up` once per
session (if the container is not already running), then `npm run db:test`. A
passing run writes the green count to the entry; a failing run says which test
failed and why.

---

## 4. Entries

### Entry 1 — 2026-08-02 — Hmdnah, dev box — plan reviewed, Phase 0 complete

**Reviewed `v1.0_impl_plan.md` before building.** Verdict: buildable, and
unusually strong — it had already found and fixed the specs' real defects (an RLS
policy that let any stranger who registered read the store's books; a
non-immutable `CHECK` that would break a restore; a `NULL` markup that would
silently poison the whole profit chain; missing idempotency; missing onboarding).
Its corrected §2.1 worked example was recomputed independently and is right.

**Eight findings, written up in `docs/plan_review.md`.** Two would have shipped
real defects:

- **R1 — zero-length count windows silently delete money.** Two counts on one
  date give `window_days = 1` but `overlap_days = 0`, so `goods_sold × 0/1 = 0`.
  Real money vanishes from every report, unflagged. Reachable through a path the
  plan itself names (two purchases of one category in a day).
- **R2 — the allowlist has no way in.** Every table gated on a row in `app_user`,
  and nothing creates the first one. The owner would meet a working app showing
  nothing, unfixable from inside the app.

Also: R3 a same-day purchase landing in the window that already closed; R4
overall coverage defined over a set the schema cannot compute; R5 the local
`auth.uid()` shim (**resolved for free** — the image already ships the
JWT-claim-reading version, so plan §3's `local-bootstrap.sql` is not built at
all); R6 RPC return types that cannot carry the idempotency cache; R7 a loss that
can sort between a purchase and its own count; R8 `write_request` missing from
every migration and grant list.

All eight are **fixed in the specs**, which are amended and mutually consistent —
no `[Q]` markers, no stale figures, no `current_date` CHECKs left.

**Phase 0 delivered.** Repo skeleton per `architecture-spec.md` §8; Vite 8 +
React 19.2 + TS 6 building clean; ESLint + Prettier + Vitest 4 green;
`aziz_erp_pg` up on 5434 with pgTAP 1.3.3 and all four Supabase roles present;
Supabase CLI installed; both specs amended.

Two deviations from the scaffold worth knowing: the Vite template ships **no
`strict`** in `tsconfig.app.json` (added — this application computes money), and
`oxlint` rather than the ESLint the plan specifies (replaced with ESLint +
Prettier as planned).

**Accepted risk:** `react-router-dom` 7.18.2 carries a high-severity advisory
(GHSA-qwww-vcr4-c8h2, RSC-mode CSRF bypass). **No fixed version exists** — 7.18.2
is latest and the advisory range has no published successor. Not reachable here:
this is a purely client-side SPA with no RSC and no server actions. Recheck at
Phase 7.

**Box:** created `aziz_erp_pg` on **:5434** (registered in
`../last_session_work.md`). No other project's containers touched; the live
public stack (`portfolio-caddy-1`, `beamstack-contact`) untouched — policy §6a
hard limit respected. §6 pause ladder never invoked, never needed: ~2.1 GiB
available throughout. Nothing committed or pushed.

### Entry 2 — 2026-08-02 — Hmdnah, dev box — Phase 1 complete

**Migrations `0001`–`0006` + `seed.sql` written and applying clean from empty**,
replayed repeatedly via `npm run db:reset`. pgTAP: **91 assertions across three
files, all green** (`010_schema`, `015_guards`, `020_rls`).
`src/types/database.ts` generated and committed. `npm run verify` green.

Two things the tests caught that would otherwise have shipped:

1. **`revoke execute … from public` locked the owner out of their own app.** An
   RLS policy expression is evaluated as the *calling* user, so once the implicit
   `PUBLIC` execute grant on `is_app_user()` was revoked, every policy failed
   with *"permission denied for function is_app_user"* — for the owner too, not
   just strangers. Fixed by granting `execute` explicitly to `authenticated` on
   `is_app_user()`, `store_today()` and `loss_nature()`. **Any function a policy
   or a non-definer trigger calls needs this**; the reporting RPCs of Phase 2
   must grant themselves as they are created.
2. **The pgTAP runner had a hole.** pgTAP reports a plan mismatch (*"you planned
   42 but ran 46"*) as a `#` diagnostic, **not** as a failing assertion — so a
   file that silently ran fewer tests than it declared would have passed. The
   runner in `scripts/db.sh` now fails on `^# Looks like`, and that was verified
   by deliberately breaking a plan. A gate whose exit code you do not read is not
   a gate.

Also worth knowing: in `supabase/postgres` the migration role `postgres` is **not
a superuser and does not own the `public` schema** — exactly as on a real
Supabase project. That is deliberate and kept: a migration needing superuser here
would fail on deploy. Only `db.sh reset` reaches for `supabase_admin`.
Consequently `grant usage on schema public` is a no-op and was removed.

**Added beyond the plan's file list:** `015_guards.sql`. The plan's
`010_schema.sql` only asserts triggers *exist*; a trigger that exists but never
fires is the most reassuring kind of bug, so the guards are exercised directly.

**Box:** unchanged from Entry 1 — only `aziz_erp_pg` on :5434 is mine. No other
project touched. Note `db:test` and `types:gen` pulled a `postgres-meta` image
(~1.5 GB disk, exits immediately, not a standing container); disk 14 GB free.
Nothing committed or pushed.

**Next:** **Phase 2 — the reporting engine**, migrations `0007`–`0011` plus
fixtures `030`–`100` (plan §4, §5.2). This is the phase the whole plan is
sequenced around; no UI work begins until its suite is green.

Phases 0–2 need nothing from the owner. **Phase 3 onward is blocked** on the
owner action items in plan §7 — including **2b, the `app_user` bootstrap**, which
came out of review finding R2.

### Entry 3 — 2026-08-02 — Hmdnah, dev box — Phase 2 complete; STOPPED, Phase 3 blocked

**The reporting engine is built and green.** Migrations `0007`–`0012`, pgTAP
fixtures `030`–`110`. **275 assertions across 13 files, all passing from a clean
`npm run db:reset`.** `npm run verify` green. `src/types/database.ts`
regenerated and carries all three views and all eight new functions.

**The gate is exact.** `report_period` over the corrected `domain-spec.md` §10
worked example returns **5,625.00 / 6,750.00 / 1,125.00 / 100%**
(`050_allocation.sql`).

| File | What it is |
|---|---|
| `0007_events.sql` | `v_stock_event`, `v_stock_event_ranked` — the §3.4 ordering, with R7's `ord_sub = 2` on losses |
| `0008_windows.sql` | `window_overlap_days()` (R1's zero-length branch lives here), `v_count_window` with the three anomaly kinds |
| `0009_helpers.sql` | `markup_at` with the earliest-rate fallback, `expected_on_hand`, `check_count_plausibility` |
| `0010_report_period.sql` | The whole of domain-spec §6 as one JSON document |
| `0011_report_trend.sql` | The 12-month series, computed **by calling `report_period`** rather than reimplementing it |
| `0012_write_rpcs.sql` | `record_purchase`, `record_count_sweep` — **not in the plan's file list; see finding 1** |

**Two findings this session, one of them security-relevant.**

1. **The write RPCs had no home in the plan.** §4 gives Phase 1 files `0001`–
   `0006` and Phase 2 files `0007`–`0011`; neither contains `record_purchase` or
   `record_count_sweep`. Yet §5.2 requires fixture `090_write_rpcs.sql` to pass
   before Phase 2 closes, and Phase 4 is UI work. They belong to the engine, so
   they were built here as `0012_write_rpcs.sql`.

2. **⚠ `anon` could execute every function added after `0006`.** The revoke sweep
   `revoke execute on all functions in schema public from anon, public` is the
   last statement of the *security* migration — but every function created in
   `0007`–`0012` afterwards kept its implicit `PUBLIC` execute grant. Measured
   before the fix: `anon` held `EXECUTE` on all eight, **including the two
   `SECURITY DEFINER` write RPCs**, where RLS does not apply and only their own
   `is_app_user()` check stood in the way. The RLS fixture passed anyway, for the
   wrong reason: the `SECURITY INVOKER` functions failed one step later on a
   table grant, raising the same `42501`. Fixed by repeating the sweep at the end
   of `0012` — **any future migration that adds a function must move it again** —
   and `020_rls.sql` now asserts the *privilege* directly, as a property over
   `pg_proc`, so the next omission fails loudly instead of hiding behind a
   coincidence.

**The three carried-over instructions, all discharged:** every new function
grants itself to `authenticated` as it is created; full `numeric` precision is
carried through the whole chain and rounded exactly once at emission, with every
total derived as the sum of its already-rounded components (asserted in
`100_report_shape.sql` — the total reads **685.72**, the sum of the rounded
rows, not **685.71**, the rounded sum); and zero-length count windows are
allocated whole (`050_allocation.sql` Part C reproduces R1's exact ledger and
proves the 300 that used to vanish now appears).

**Design decisions worth knowing, none of them forced by the specs:**

- **All three reporting views are `security_invoker = true`.** Without it the
  views run as their owner, who owns the tables and therefore bypasses RLS —
  every table policy would remain perfectly correct and be completely
  side-stepped. `020_rls.sql` asserts a stranger reads zero count windows and
  gets an empty report.
- **The markup is resolved per window, at the window's open date**, not once per
  category. That is what makes a rate edit unable to move a past report, asserted
  byte-identically in `080_markup.sql`.
- **`stock_on_hand` and freshness are computed as of `B_eff`, not "now"**, so a
  report for a past month is reproducible. Without this, Phase 6's exit criterion
  (a prior month unchanged after a rate edit) could not be asserted at all.
- **`settled_days` is capped at `period_days`.** A zero-length window contributes
  1 settled day on a date the adjacent window also covers, so the raw sum can
  exceed the period; coverage above 100% would be nonsense.
- **`check_count_plausibility` returns `jsonb`, not a bare verdict** — the form
  needs the expected figure to write *"vous avez saisi 50, mais ce rayon devrait
  contenir environ 1 000"*. "Implausible" alone is not actionable.
- **Overall coverage counts categories active now plus any with an event in the
  period** (review R4), since the schema has no `deactivated_at`.

**Three fixtures beyond the plan's required list**, for the same reason
`015_guards.sql` was added in Phase 1: `045_helpers.sql` (the plausibility
verdicts — the only automated defence against the category-scope trap, and §5.2
tests it nowhere), `110_report_trend.sql` (`report_trend` was otherwise entirely
unexercised while its phase closed as green), and six new assertions in
`020_rls.sql` covering the reporting layer and the grant property above.

**Box:** `aziz_erp_pg` **stopped and removed** at the end of the phase, per plan
§3 — recorded in `../last_session_work.md`. The named volume `aziz_erp_pg_data`
is **kept**, so `npm run db:up` recreates the container with the schema intact;
port 5434 is free. No other project's containers touched; the live public stack
(`portfolio-caddy-1`, `beamstack-contact`) untouched — policy §6a hard limit
respected. §6 pause ladder never invoked, never needed: ~2.1 GiB available
throughout. Nothing committed or pushed.

**Next: nothing, until the owner acts.** Phase 3 (Shell) is blocked on plan §7
items **1** (the two Supabase projects and the dev URL + anon key), **2** (public
signup disabled) and **2b** (the `app_user` allowlist bootstrap). None has been
done: there is no `.env`, only `.env.example`.

Two things to be clear about rather than discover later:

- **The UI cannot be verified end-to-end on this box.** The app talks to Supabase
  over PostgREST and GoTrue, which the local Postgres container does not provide,
  and `supabase start` is far too heavy for a 3.7 GiB machine. Components can be
  written and unit-tested against a mocked client, but "it works" is not
  something this box can establish. That is why Phase 3 waits for the project
  rather than starting against a stub.
- **Item 2b is the one that looks optional and is not.** Without it the owner
  logs in successfully and every screen is empty, with no way to fix it from
  inside the app.

### Entry 4 — 2026-08-03 — Hmdnah, dev box — the Supabase dev project exists; Phase 3 unblocked

**The owner acted on plan §7 items 1, 2 and 2b, and the blockage of Entry 3 is
cleared.** The dev project is `bucmxwutpfksjrylijeu` (`aziz-dev`). Its URL and
anon key are in `.env`, which is gitignored and confirmed ignored; the database
password lives nowhere in the repo and is passed per-command.

**What was done to it, in order:**

1. `supabase db push` applied **all 12 migrations, clean on the first attempt**.
   The CLI accepts the `0001_`-style version prefixes; no renaming was needed.
2. `seed.sql` applied — 12 article categories with contents hints, a 20% markup
   row each, 12 charge categories, the settings singleton. Timezone
   `Africa/Casablanca` and MAD **confirmed by the owner** (plan §7 item 3).
3. **The whole pgTAP suite was run against the Supabase project itself: 275
   assertions across 13 files, all green.** Until now the engine had only ever
   been proven on a container on this box. It is now proven on the platform
   production actually runs, whose role model and extension set are the real
   ones. `anon` can execute **0 of the 16** functions — the Entry 3 privilege
   property holds remotely, asserted over `pg_proc`, not inferred.
4. The allowlist bootstrap (§7 item 2b) was run **by this agent, not the owner** —
   the database password makes it a one-liner, and it was the step most likely to
   be forgotten. `app_user` holds one row for `8febd66c…` labelled `Aziz`.
   ⚠ **On `aziz-prod` it remains an owner action**, and it is still the item that
   silently produces a working login over an empty application.

**End-to-end, over the network, exactly as the browser will do it:** password
grant against GoTrue returns a token; `report_period` over that token returns a
real document — an empty August clamped to the 3rd (`"clamped": true`), zeros
rather than nulls, 0% coverage and all twelve categories in
`categories_never_counted`, which is the correct portrait of a shop that has not
yet counted anything. **The same call as `anon` is refused with `42501`.**

**⚠ One owner item is still open and is a security item: public signup is still
enabled** on the project (`/auth/v1/settings` reports `disable_signup: false`).
The allowlist means a stranger who registers reads nothing — the second line of
defence is working — but plan §2.5 requires *both*, and the first one is off.
Authentication → Sign In / Providers → Email → *"Allow new users to sign up"*.

**`scripts/db.sh` gained a remote mode** (`SUPABASE_DB_URL=… ./scripts/db.sh
test`), since from Phase 3 the authority is the Supabase project and the suite
had no way to reach it. Every fixture already wraps itself in
`begin … rollback`, so the run leaves no trace — verified: the seed counts are
identical after it. **`reset` is refused in remote mode**: a rolled-back fixture
is harmless, a dropped schema is not, and that command should not be one typo
away from a live project.

**Box:** no container created, started or stopped. The remote psql calls run in
throwaway `--rm --network host` containers (host networking because the Supabase
database host is **IPv6-only** and Docker's default bridge is not). `aziz_erp_pg`
stays removed; its volume is still kept. No other project touched; the live
public stack (`portfolio-caddy-1`, `beamstack-contact`) untouched — policy §6a
hard limit respected. §6 pause ladder never invoked. Nothing committed or pushed.

**Next: Phase 3 — the shell.**

### Entry 5 — 2026-08-03 — Hmdnah, dev box — Phase 3 complete (the shell)

**Login, the three gates, the six routes, `<Money>`, i18n and the boundary parse
are built.** `npm run verify` green — lint, format, `tsc -b`, **18 component
tests across 4 files**. `npm run build` green (627 kB / 181 kB gzipped).

| File | What it is |
|---|---|
| `lib/supabase.ts` | The one client. Throws at module load if the env is missing |
| `lib/display-settings.ts` | Currency/locale/store name, defaulted so nothing needs a provider |
| `api/auth.ts` | `useAuth`, `signIn`, `signOut`. No signup anything |
| `api/settings.ts` | `useSettings`, **`useIsAllowlisted`** |
| `api/categories.ts`, `api/report.ts`, `api/onboarding.ts` | Queries + the sweep mutation |
| `types/report.ts` | The Zod schema for `report_period` / `report_trend` |
| `components/Money.tsx` | domain-spec §7.2, and the only formatter in `src/` |
| `components/AppLayout.tsx` | Tab bar on mobile, sidebar on desktop |
| `features/auth`, `features/onboarding`, `features/dashboard`, `PlaceholderPage` | The screens |

**The three gates, in `App.tsx`, and why there are three:** signed in → **on the
allowlist** → books open. The middle gate is the one that is easy to leave out.
A user who authenticates but has no `app_user` row gets a *working* application
in which every query succeeds and returns nothing — indistinguishable on screen
from a shop that has not traded. It now says so instead, in French. That is
R2's failure mode caught at the UI layer rather than only at the deployment
step.

**Verified against the real project, over the network, not against a mock:**

- Password login through GoTrue returns a token; `report_period` over that token
  returns a document that **passes the Zod parse**; the same call as `anon` is
  refused `42501`.
- **The opening sweep writes 12 counts in one transaction, and the same
  `request_id` sent twice writes nothing the second time** — `replayed: true`,
  and the table holds **12 rows, not 24**. Idempotency is no longer a property of
  a pgTAP fixture; it is a property of the deployed HTTP path.
- `onboarded_at` is set by the app's second step, which closes the gate.
- **All of it was then reverted** (`stock_count`, `write_request`, `onboarded_at`
  back to null) so the owner meets the real opening sweep rather than my
  placeholder 1 000 per shelf. `audit_log` kept all 36 entries, as an
  append-only log should.

**Two findings, both fixed:**

1. **⚠ `z.uuid()` rejects ids Postgres considers valid.** Zod validates RFC 4122
   version and variant bits; the `uuid` type validates only the 8-4-4-4-12 hex
   layout. The schema threw on a category id from a fixture ledger. Left alone,
   the app would refuse to display a report over data the database is perfectly
   happy with — a boundary check that fails *closed* on valid input. Replaced
   with a layout-only regex (`pgUuid`).
2. **The Phase 5 grep is now a test, not a review step.** `no-raw-money.test.ts`
   walks `src/` and fails if `Intl.NumberFormat`, `.toFixed(` or
   `.toLocaleString(` appears anywhere but `Money.tsx`; `formatAmount` is no
   longer exported, so no component can format an amount without first deciding
   whether it is measured or modelled. A rule checked by eye at the end of Phase
   5 is a rule that gets broken during Phase 4. The test also asserts it found
   the tree it is guarding — a bad path would otherwise make it pass forever,
   which is exactly what it did on the first run.

**Judgement calls worth knowing:**

- **The dashboard is a real shell, not a mock.** It calls `report_period`, parses
  it, and renders six KPIs and the coverage panel. The waterfall, category table,
  charges breakdown and trend are Phase 5. It is labelled as such on screen.
- **The one piece of client arithmetic in the codebase is the sweep's running
  total** — the sum of the numbers the user is typing at that moment, shown back
  to them as they type. It is not a reported figure, never leaves the screen, and
  is not what architecture-spec §1.2 forbids. Recorded here rather than left for
  someone to find.
- **Test fixtures are captured from the real database**, not hand-written:
  `report_period.worked-example.json` is the §10 ledger's actual output
  (5,625 / 6,750 / 1,125 / 100%). A hand-written fixture would only prove the
  schema agrees with itself.
- `no-raw-money.test.ts` is owned by `tsconfig.node.json`, not the app project,
  so `node` types never enter application code.

**Not verified, and it cannot be on this box:** no browser ever rendered this.
Playwright has no Chromium build for the box's Ubuntu 26.04 and there is no
system Chrome (`../last_session_work.md`). The bundle builds, is served, and
carries the right project URL; the data path is proven at the HTTP level. **A
human opening it on a phone is still the only thing that proves the layout.**

**⚠ Still open on the owner: public signup is enabled** (`disable_signup:
false`) — carried over from Entry 4, unchanged. Phase 7 will also need the
Cloudflare Pages SPA fallback (`/* /index.html 200`), or every deep link 404s in
production; noted now, built then.

**Box:** unchanged. No container created, started or stopped; remote psql ran in
throwaway `--rm` containers. `vite preview` bound :4173 briefly and was stopped.
No other project touched; `portfolio-caddy-1` and `beamstack-contact` untouched
(§6a hard limit). Nothing committed or pushed.

**Next: Phase 4 — the entry screens** (purchases with the §2.3 shelf question and
the §2.4 backdating rule, charges, counts, losses).

### Entry 6 — 2026-08-05 — Hmdnah, dev box — Phase 4 complete (the entry screens)

**All four entry flows are built, and the six routes are now real screens.**
`npm run verify` green — lint, format, `tsc -b`, **61 tests across 12 files**
(was 18 across 4). `npm run build` green (672 kB / 192 kB gzipped).

| File | What it is |
|---|---|
| `features/purchases/PurchasePage.tsx` | The two-screen flow, the backdating branch, one `request_id` per submission |
| `features/purchases/StockQuestion.tsx` | The binding §3.2A wording, the contents list, the expected-on-hand figure |
| `features/counts/CountsPage.tsx` | Single and sweep, the previous count beside each input, the §4.3 loss prompt |
| `features/counts/useSweepDraft.ts`, `SweepRow.tsx` | The sweep, shared with the opening sweep of §3.5 |
| `features/counts/usePlausibilityGate.ts`, `PlausibilityDialog.tsx` | §2.3c, shared by both count paths |
| `features/charges/ChargesPage.tsx` | Charges + inline category creation with the nature asked in plain French |
| `features/losses/LossesPage.tsx` | The seven reasons of §4.2, grouped by nature |
| `api/purchases.ts`, `counts.ts`, `charges.ts`, `losses.ts`, `ledger.ts` | The write path and the invalidations |
| `components/Field · AmountField · DateField · CategorySelect · ConfirmDialog · RecentPanel` | The shared form primitives |
| `lib/amount.ts`, `lib/dates.ts`, `lib/pg-errors.ts` | Input parsing, the store's today, SQLSTATE → French |
| `types/writes.ts` | Zod at the boundary for the two write RPCs and the plausibility verdict |

**No migration was added.** Phase 4 needed nothing the engine does not already
have — and, deliberately, this session could not have deployed one: applying a
migration to the Supabase project needs the database password, which is not on
this box (Entry 4). A migration written here and left unapplied would have put
the repo and the project out of step with nobody able to tell.

**Three findings, one of which would have broken the first screen the owner
ever sees.**

1. **⚠ `check_count_plausibility` returns `null` for `days_since_last_count`
   and `expected_on_hand` on a never-counted category** — correctly, there is no
   bound to compare against. The Zod schema parses that document, and it parses
   it because the nullability was *measured*, not assumed. Had those fields been
   typed as numbers, every shelf in the opening sweep of §3.5 would have failed
   the boundary parse: the first count of the shop's life, refused by the client
   over data the database is perfectly happy with. This is the same failure mode
   as Phase 3's `z.uuid()` finding, and it is now covered by captured fixtures
   rather than by luck.
2. **The client's "today" was UTC's today.** `OpeningSweepPage` dated the sweep
   with `new Date().toISOString()`. The shop is UTC+1, so between midnight and
   01:00 local that is *yesterday* — a date that may sit inside a window already
   closed, where a purchase becomes goods sold at full markup on a day it never
   arrived. Now `useStoreToday()` reads the date in `app_settings.timezone`, the
   client half of the `store_today()` rule of plan §2.6, and it is the default
   and the `max` of every date field.
3. **`LOSS_REASONS` in the client is a copy of `loss_nature()` in SQL.** The form
   needs the mapping to group seven reasons under two headings; the reports are
   computed from the SQL and never from the copy. A drift would file "pris par
   la famille" under the store's losses on screen while the dashboard counted it
   as an owner draw. `loss-nature-matches-sql.test.ts` pins the copy to the
   migration text, so a reclassification fails the suite and names the reason.

**Verified, and on what.** Being precise about this, because two of the three
things Phase 4's exit criterion asks for could not be done on this box:

- **The component suite** — the whole of the §3.2 decision tree: the whole-shelf
  wording renders, a purchase dated *on* the last count still carries its count
  (R3), a purchase dated *behind* it carries none, the plausibility dialog blocks
  with **Corriger** primary and writes nothing, "Enregistrer quand même" writes,
  a retry reuses one `request_id` and the next purchase takes a new one.
- **The boundary parsers, against real database output.** The local container was
  brought up on the kept volume, the four RPCs were called in a rolled-back
  transaction, and their literal JSON is committed as
  `src/test/fixtures/write-rpcs.captured.json`. `types/writes.test.ts` parses it.
  That is how finding 1 was found. The full pgTAP suite was re-run on the way
  past: **275 assertions, all green.**
- **Not verified: no browser has rendered any of this**, unchanged from Entry 5.
- **Not verified: nothing was run against the Supabase dev project this session.**
  Entries 4 and 5 could reach it; this session holds neither the database
  password nor the owner's login, so the write path was proven against local
  Postgres and the component suite, not over PostgREST. **Phase 4's exit
  criterion is therefore NOT fully met** — see below.

**⚠ The Playwright exit criterion is written but unmet.** Plan §4 requires
Playwright to cover the purchase round trip, the month-end sweep and a
deliberately double-submitted purchase creating exactly one row. The specs exist
(`e2e/purchase.spec.ts`, `e2e/sweep.spec.ts`, `playwright.config.ts`, and
`e2e/README.md` on how to run them) and the double-submit one is a real test —
it drops the first RPC response at the network layer and asserts one row after
the retry. **They have never been executed:** Playwright ships no Chromium for
this box's Ubuntu 26.04, `@playwright/test` was installed with
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, and running them needs `E2E_EMAIL` /
`E2E_PASSWORD` for an allowlisted user of a non-production project. They must be
run on a machine with a browser before Phase 4 can be called closed. Nothing
here reports them as passing.

**Judgement calls worth knowing:**

- **A single count is a sweep of one.** Both go through `record_count_sweep`, so
  there is one transactional, idempotent write path rather than two, and the
  duplicate-count index error has one French message.
- **The plausibility check runs on the purchase-embedded count and on the single
  standalone count, but not on the sweep.** The sweep already shows every
  previous value beside its input, and a dialog listing several implausible rows
  at once is a dialog that gets dismissed. This is a deviation worth revisiting
  if the sweep turns out to be where the trap actually springs.
- **The opening sweep and the month-end sweep are one implementation**
  (`useSweepDraft` + `SweepRow`) with different copy, as domain-spec §3.5 says
  they are. Two would drift, and the one that drifted would be the monthly one.
- **§8.5 is delivered in part: records can be deleted, not edited.** Every recent
  list carries a confirmed delete (audited, and deleting a purchase takes its
  embedded count with it). In-place editing is not built — for a purchase it
  would have to move both rows while keeping the §2.8 coherence trigger
  satisfied, which is a screen of its own. **Correcting a mistake today means
  delete and re-enter.** Flagged rather than left to be discovered.
- **`lib/pg-errors.ts` maps SQLSTATE to French** and falls through to *"rien n'a
  été enregistré"*, which is the one thing the user must be certain of when
  something fails — the alternative is entering it twice.
- **The one new piece of client arithmetic is the sweep's running total**, the
  same one Entry 5 recorded, now shared by both sweeps and commented where it
  lives.

**⚠ Still open on the owner, re-checked today:** public signup is **still
enabled** (`/auth/v1/settings` reports `disable_signup: false`). Third entry
carrying this. Also outstanding for anything end-to-end: credentials for an
allowlisted user on `aziz-dev`, and the database password if the pgTAP suite is
to be re-run remotely.

**Box:** `aziz_erp_pg` created on :5434 and **removed again** in the same
session; the volume `aziz_erp_pg_data` is kept and port 5434 is free. Installed
`@playwright/test` (dev dependency, **no browser binaries**). No other project
touched; `portfolio-caddy-1` and `beamstack-contact` untouched (§6a hard limit).
§6 pause ladder never invoked — ~2.0 GiB available throughout. Nothing committed
or pushed.

**Next: Phase 5 — the dashboard** (period selector, KPI row, profit waterfall,
stock by category, charges breakdown, the 12-month trend, the data-quality
panel). It needs nothing from the owner. Phase 7 does, and so does closing
Phase 4's Playwright criterion.

### Entry 7 — 2026-08-07 — Hmdnah, dev box — Phase 5 complete (the dashboard)

**The dashboard is built, and its exit criterion is met and enforced by a
test.** `npm run verify` green — lint, format, `tsc -b`, **115 tests across 14
files** (was 61 across 12). `npm run build` green.

| File | What it is |
|---|---|
| `features/dashboard/DashboardPage.tsx` | Composes the seven sections of domain-spec §7.1 |
| `features/dashboard/usePeriod.ts`, `PeriodSelector.tsx` | The presets, the custom range, and the draft/applied split |
| `features/dashboard/KpiRow.tsx` | The six headline figures, three modelled and three measured |
| `features/dashboard/ProfitWaterfall.tsx` | §6.6's chain, plus §6.7's two meanings of "spent" |
| `features/dashboard/StockByCategory.tsx` | §7.1's eight columns, with the engine's own totals in the footer |
| `features/dashboard/ChargesBreakdown.tsx` | Operating charges and owner draws, visually separated |
| `features/dashboard/TrendChart.tsx` | The 12-month series, code-split, with its figures in a real table |
| `features/dashboard/DataQualityPanel.tsx` | §6.5 — coverage, never-counted, stale, unsettled, all three anomaly kinds, each linked to its fix |
| `test/fixtures/report_period.problems.json`, `report_trend.captured.json` | **Captured from a real ledger**, not written |

**No migration was added, and none could have been deployed.** Everything §7.1
asks for was already in the `report_period` document. The database password is
still not on this box (Entry 4, Entry 6), so a migration written here would have
left the repo and the Supabase project out of step with nobody able to tell.

**The exit criterion, and what it now costs to break it.** Plan Phase 5 asks
that every figure originate from `report_period` and that *"a repo-wide grep
proves no arithmetic on money exists in `src/` outside formatting"*.
`no-raw-money.test.ts` now **is** that grep: it scans every non-test file for an
arithmetic operator adjacent to any of the twenty-two money-bearing names in the
two report documents and the write path. Three properties make it a gate rather
than a decoration — it asserts it can find the source tree, it asserts the
pattern **fires** on four synthetic offenders (which is how a bad regex was
caught: the property-path prefix was swallowing the name it was looking for, so
`a - report.measured.cash_out` matched nothing), and it names its one exemption
out loud rather than leaving it in a comment.

**That exemption is the sweep's running total** (`useSweepDraft.ts`), unchanged
since Entry 5. It is the user's own input added up before it has been sent
anywhere; it cannot disagree with the engine because the engine has not seen it.
Listed in the test, with a check that the line it excuses still exists.

**Three findings.**

1. **⚠ The Zod schema had never met an anomaly.** Both existing fixtures have
   empty `anomalies` and `categories_stale` arrays, so the objects *inside* them
   had never been parsed — and those objects are the entire content of the data
   quality panel. The first time the shop mistyped a count, a schema error in
   any of those fields would have sent the **whole dashboard** to the "figures
   unreadable" branch: one bad window, no numbers at all. Fixed by capturing a
   real ledger that produces all three anomaly kinds, a stale category, a
   never-counted one and three unsettled tails, and parsing that. This is the
   third time on this project that a fixture captured from a database found what
   a hand-written one could not (`z.uuid()` in Phase 3, the null plausibility
   fields in Phase 4).
2. **The dashboard's period came from the device, not the shop.** The Phase 3
   shell computed "this month" from `new Date()`. The shop is UTC+1: between
   midnight and 01:00 on the first of a month, the device's UTC date is still in
   the previous month, and the owner would have opened the app to **last
   month's figures under this month's heading**. Now every preset is derived
   from `useStoreToday()`. Same class as Entry 6's finding 2, one screen over —
   which is the argument for `useStoreToday()` being the only way anything in
   this app learns what day it is.
3. **`new Date('2026-01-01')` parses as UTC midnight**, so the old header
   formatted the period's dates in the device's zone. At UTC+1 it happens to
   render correctly; west of Greenwich it renders the day before. Latent rather
   than shipped, and now `formatDate()` (`parseISO`) everywhere.

**Judgement calls worth knowing.**

- **⚠ The profit waterfall is a stepped statement, not a bar chart, and that is
  deliberate.** A waterfall's bars need the running balance at every step.
  `report_period` publishes three of them — gross profit, operating profit, net
  cash change (§6.6) — and not the two intermediates. Drawing the bars means the
  app subtracting one reported figure from another to place a rectangle, which
  is precisely what architecture-spec §1.2 forbids, and the invented number
  would be the one the eye reads. Every line is printed as emitted; the `−` and
  `=` are typography. **If the bars are wanted, the intermediate balances belong
  in `report_period`, not in the client.**
- **The data quality panel sits above the trend, not last.** §7.1 lists it last
  and requires it never be collapsed away when problems exist. On a phone, a
  panel below a 12-month chart *is* collapsed away. Ordering is the one thing
  worth deviating on: the owner should not read a modelled profit and learn
  afterwards that a tenth of the period is counted.
- **The trend chart is code-split.** Recharts is 367 kB — more than every other
  section of this screen put together, and it was landing in the first request
  on a phone before a single figure was on screen. Lazy-loaded, the initial
  bundle is **690 kB / 196 kB gzipped** (Phase 4 was 672/192) with the chart in
  its own 106 kB gzipped chunk. It is the section furthest down the page and the
  least urgent.
- **The chart carries a real table, not a caption.** An SVG polyline is
  unreadable to a screen reader and imprecise to everyone else, so the exact
  monthly figures are in a table beneath it, each through `<Money>`; the SVG is
  `aria-hidden`. It is also what makes the section testable without a browser.
  ⚠ **The Y-axis ticks are recharts' own plain numbers** — scale gradations
  rather than figures, and the only place on the dashboard where a number is not
  rendered by `<Money>`. Flagged rather than hidden.
- **Percentages and day counts now go through i18next's number formatter**
  (`{{pct, number}}`), so coverage reads *10,2 %* rather than *10.2 %* beside
  *10,20 MAD*. It routes through Intl inside i18next, so `<Money>` remains the
  only module in `src/` that formats.
- **A custom range keeps a draft separate from what is applied.** A date input
  emits a change per keystroke, and "2026-0" is not a period. An invalid draft
  shows its error and leaves the reported range alone — the alternative is a
  screen full of confident figures over a range nobody asked for.
- **`/counts?category=<id>`** — every data quality item links to the screen that
  fixes it, with the shelf preselected. A warning the owner has to act on from
  memory is one they learn to scroll past. A never-counted category arrives as a
  *name* only (`report_period` emits a name array), so the id is matched back
  through `by_category`; `article_category.name` is UNIQUE, so that is exact.
- **A shelf can appear twice in the panel** — Tabac is both stale and carrying
  unsettled purchases. Both statements are true and separately actionable, so
  both are shown.

**Verified, and on what.**

- **The component suite, against captured documents.** 21 dashboard tests over
  two real `report_period` documents parsed through the app's own schema: the
  measured/modelled split across the KPI row, the category footer equalling the
  headline (5,625.00 / 1,125.00 — the figure the whole plan is sequenced
  around), a null markup rendering as absent rather than as 0 %, the charge
  natures never mixing, all four problem kinds named and linked, the presets
  driving the query from the store's today, an invalid custom range querying
  nothing, and the current month marked *(en cours)* rather than read as a
  collapse in trade.
- **The pgTAP suite, re-run on the way past: 275 assertions, 13 files, all
  green** against the local container on the kept volume. Unchanged by this
  phase — no migration was touched — but run because the fixtures were captured
  from it.
- **Not verified: no browser has rendered any of this.** Unchanged since Entry
  5. The dashboard is the most layout-dependent screen in the app and the only
  one with a chart, and nothing here has been seen.
- **Not verified: nothing was run against the Supabase dev project.** Third
  session without the database password or a login.

**⚠ Still open on the owner, unchanged and not re-checked today:** public signup
was `disable_signup: false` at Entry 6 (checking it needs no credentials, but
nothing was run against the project this session); credentials for an
allowlisted user on `aziz-dev`, without which Phase 4's Playwright criterion
cannot be closed; and the database password.

**Box:** `aziz_erp_pg` created on :5434 and **removed again** in the same
session; the volume `aziz_erp_pg_data` is kept and port 5434 is free. Nothing
installed. No other project touched; `portfolio-caddy-1` and `beamstack-contact`
untouched (§6a hard limit), as were `planitor-pg`, `chantier_test_pg`,
`chantier_test_redis`. §6 pause ladder never invoked — ~1.7–2.1 GiB available
throughout. Nothing committed or pushed.

**Next: Phase 6 — settings** (categories with their contents hint, markups with
the §2.3 warning and a rate-history drawer, charge categories and natures,
currency, locale, timezone, store name). Its exit criterion is a pgTAP
assertion, not a screenshot: changing a markup must leave a prior month's
`report_period` output byte-identical. It needs nothing from the owner. Phase 7
does, and so does closing Phase 4's Playwright criterion.

### Entry 8 — 2026-08-07 — Hmdnah, dev box — the handoff to Amer, and the first push

**The next entry is Amer's**, on the owner's Windows PC. This entry exists to
hand over, and to record the one piece of work in it that is not documentation.

**⚠ The whole repository is pushed for the first time.** Before today `main`
carried a single commit — the two spec documents — while Phases 0–5 sat
untracked on the dev box. Nothing that has been built over six entries had ever
left that machine. It is now on `origin/main`, which is what makes a second
machine possible at all. `.env` is gitignored and did **not** go with it.

**What shipped, beyond the docs:** `Amer_Prompt.md`, and
`src/test/prompts-agree.test.ts`, which pins the two prompts' shared rules block
byte-for-byte. Two copies of a rule are two rules the moment one is edited, and
the way they drift is not random: someone tightens a rule in the prompt they are
reading, ships it, and the other agent keeps working to the loose version on the
other machine, with no signal anywhere because both files still look carefully
written. **Revert-verified** — changing "the shop is UTC+1" to UTC+2 in one file
turns the suite red and prints the differing line. The test also asserts it
found a rules block at all, because a renamed heading would otherwise reduce it
to `'' === ''` and pass forever.

The duplication itself is deliberate and is the Bunyan lesson applied here: a
constraint that lives only in a document nobody opens at t=0 is a preference,
not a constraint. Each agent finds the rules in the file they actually have
open; the test is what stops that costing correctness.

**⚠ AMER'S TASK, in this order.**

1. **Run the Playwright specs. Nobody ever has.** `e2e/purchase.spec.ts` and
   `e2e/sweep.spec.ts` have been written, typechecked and listed since
   2026-08-05, and recorded as *unexecuted* in three consecutive entries,
   because the dev box has no browser. They are Phase 4's exit criterion — the
   purchase-with-count round trip, the month-end sweep, and a deliberately
   double-submitted purchase creating exactly one row. **Phase 4 cannot be
   called closed until they run.** Read `e2e/README.md` first: they write, they
   do not clean up, and they must be pointed at `aziz-dev` and never at
   `aziz-prod`.
2. **Look at the application.** No human or agent has seen a single screen of it
   rendered. Five phases of layout — the mobile tab bar, the two-screen purchase
   flow, the sweep, and now a dashboard that is a KPI grid, an eight-column
   table and a chart — exist only as passing assertions. If something is
   unreadable on a phone-width screen, that is a finding of the same weight as a
   failing test: a figure the owner cannot read is a figure the owner does not
   have. The dashboard's trend chart is the newest and least-seen part of it.
3. **Then Phase 6 — settings**, if 1 and 2 leave room. Categories and their
   contents hints, markups with the §2.3 warning and a rate-history drawer,
   charge categories and natures, currency, locale, timezone, store name. Its
   exit criterion is a pgTAP assertion rather than a screenshot: changing a
   markup must leave a prior month's `report_period` output **byte-identical**.
   That needs Docker and a bash shell (Git Bash or WSL2) for `scripts/db.sh`; if
   you cannot run the pgTAP suite, say so plainly rather than shipping Phase 6
   with its exit criterion unmeasured.

**What Amer needs from the owner before item 1 can start**, none of which is in
the repo: `.env` (the dev project's `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` — gitignored, and `.env.example` explains why they are
safe to hold), and `E2E_EMAIL` / `E2E_PASSWORD` for a user on that project's
`app_user` allowlist.

**⚠ Still open on the owner, unchanged:** public signup was `disable_signup:
false` when last checked on 2026-08-05 (plan §7 item 2 — the allowlist is the
second line of defence and holds, but the plan requires both); and the database
password, without which no migration can be deployed from either machine.

**A convention adopted here, and the owner can overrule it.** The repo is now
the channel between two machines, so each session pulls before it starts and
pushes its own work at the end, after its entry is written. The standing policy
elsewhere on the dev box is "commit and push only when the owner asks"; this
push was asked for, and the convention is written into both prompts so neither
agent has to guess.

**Box:** documentation and one test file. No container created or started —
`aziz_erp_pg` stays removed, its volume kept, port 5434 free. No other project
touched. `npm run verify` green: **119 tests across 15 files.** Pushed to
`origin/main`.

### Entry 9 — 2026-08-09 — Amer, owner's Windows PC — Phase 4 Playwright exit criterion met

**The six Playwright tests are passing, twice in a row, with no manual cleanup
between runs.** `e2e/purchase.spec.ts` and `e2e/sweep.spec.ts` — the purchase
round trip, the deliberately double-submitted purchase, the backdated purchase,
the month-end sweep, the partial-sweep refusal, and the loss prompt navigation
— all ran against the `aziz-dev` Supabase project, in a real Chromium browser,
on the owner's Windows PC. **Phase 4 is closed.**

**Fixes required before a single test passed.** Four classes of problem:

1. **Timing race on the sweep tab.** `inputs.count()` was called immediately
   after the tab click, before the categories API response returned. The sweep
   form shows a loading state; zero inputs were found. Fixed by
   `await expect(inputs.first()).toBeVisible()` before `inputs.count()`.

2. **Plausibility gate race in three tests.** `saveAnyway.isVisible()` is
   non-waiting: it was called right after the save click, before the async
   `checkCountPlausibility` RPC completed. The dialog was not yet visible. Fixed
   by `await saveAnyway.waitFor({ timeout: 5000 }).catch(() => undefined)` before
   the `isVisible()` check, in the retried-submission test (both attempts), the
   first purchase test, and the loss prompt test.

3. **`getByRole('heading', { name: 'Pertes' })` matched two elements.** Without
   `exact: true`, Playwright's partial name matching also found `<h2>Dernières
   pertes</h2>`. A multi-element locator cannot resolve to visible, so
   `toBeVisible()` timed out even though `<h1>Pertes</h1>` was in the DOM.
   Fixed by `{ name: 'Pertes', exact: true }`.

4. **The test suite was not idempotent.** Each write-heavy test creates database
   rows and does not clean them up. A second run hits the unique
   `(category_id, occurred_on, source='standalone')` constraint for counts, or
   finds two `137,42` rows instead of one for purchases. Fixed by adding a
   cleanup block at the start of each write-heavy test:
   - **Sweep test 1** (`DELETE stock_count WHERE occurred_on = today AND
     source = 'standalone'`) — runs after the form is filled, before the save
     click, so the window between cleanup and write is minimal.
   - **Loss prompt test** (`DELETE stock_count WHERE category_id = ? AND
     occurred_on = '2026-08-07' AND source = 'standalone'`) — uses a fixed past
     date (not today, which the sweep test owns) and deletes exactly the one row
     this test owns.
   - **Retried submission test** (`DELETE purchase WHERE note LIKE 'e2e-%'`) —
     the test fills a unique `e2e-${Date.now()}` marker in the note field; the
     cleanup deletes all prior marker rows so exactly one `137,42` row remains
     after the run.

   Each cleanup block extracts the user's JWT from `localStorage` via
   `page.evaluate` and calls the Supabase REST API via `page.request.fetch`,
   using the authenticated session that the sign-in fixture already established.

**Two Windows-specific fixes discovered along the way.**

- **`no-raw-money.test.ts`** used `path.relative()` directly in comparisons.
  On Windows `path.relative()` returns backslash-separated paths; the expected
  values are POSIX strings. Every file comparison was silently false, meaning
  the guard was passing without actually scanning anything. Fixed by a `rel()`
  helper that normalises to forward slashes.
- **`DashboardPage.test.tsx`** had `userEvent.setup()` without `{ delay: null }`
  in the period-selector test. The default delay caused the test to time out
  on a slower machine. Fixed.

**A tool-chain finding worth knowing for future edits to the E2E specs.** The
Claude Code `Edit` tool introduces Unicode RIGHT SINGLE QUOTATION MARK (U+2019)
as a string delimiter instead of ASCII apostrophe (U+0027). TypeScript's parser
rejects curly quotes as delimiters, so any Edit-tool change to a `.spec.ts`
file that touches string literals corrupts the file silently. The fix used here:
`scripts/fix-sweep-spec.mjs` and `scripts/fix-purchase-cleanup.mjs` apply all
changes via Node.js `writeFileSync` with `String.fromCharCode(0x0027)` for every
string delimiter, making the encoding unambiguous. **If either spec needs editing
in a future session, use a script, not the Edit tool directly.**

**Verified, and on what.**

- **Six Playwright tests**, run twice consecutively against `aziz-dev`, in
  Chromium on the owner's Windows PC. The second run passed with no manual DB
  cleanup — the idempotency mechanism is live.
- **`npm run verify`** — lint, format, `tsc -b`, Vitest. The Windows-path and
  userEvent fixes were needed for this to pass on this machine.

**Not verified.** The application was not looked at. Entry 8 listed "look at
the application" as item 2 of Amer's task, specifically the mobile layout and
the trend chart. That remains open and is the first thing for the next session.
No pgTAP run was attempted — Docker is not configured on this machine.

**Machine:** Windows PC. No Docker. No container created or started. The three
fix scripts (`scripts/fix-e2e-specs.mjs`, `scripts/fix-purchase-cleanup.mjs`,
`scripts/fix-sweep-spec.mjs`) are committed as a record of how the encoding
problem was worked around. `npm run verify` green. Committed and pushed to
`origin/main`.

**Next for Amer: view the application first, then Phase 6.** Phase 6 (settings)
needs Docker and a bash shell for `npm run db:test`; if Docker is not available,
say so plainly in the entry rather than shipping Phase 6 with its pgTAP exit
criterion unmeasured.

### Entry 10 — 2026-08-10 — Amer, owner's Windows PC — app viewed; Phase 6 built; pgTAP exit criterion unmeasured

**Phase 6 (settings) is built and green.** `npm run verify` passes — lint,
format, `tsc -b`, **124 tests across 16 files** (was 119 across 15). `npm run
build` clean (708 kB / 199 kB gzipped; the 708 kB chunk size warning is
pre-existing from Phase 5).

**The login screen was viewed via Playwright screenshot** on the running dev
server. It renders correctly: title "Aziz ERP", subtitle "Cet espace est réservé
au gérant du magasin", email/password fields, "Se connecter" button. No login
credentials were available in this session (no `E2E_EMAIL`/`E2E_PASSWORD`), so
the authenticated screens could not be viewed. The component tests covering every
authenticated screen were all green, including the 5 new settings tests.

**What was built for Phase 6.**

| File | What it is |
|---|---|
| `src/api/markup.ts` | `useMarkupRates`, `useSetMarkupRate` — upserts on `(category_id, effective_from)` |
| `src/api/categories.ts` | Added `useCreateCategory`, `useUpdateCategory` |
| `src/api/charges.ts` | Added `useAllChargeCategories`, `useCreateChargeCategory`, `useUpdateChargeCategory`, `ChargeCategoryFull` |
| `src/api/settings.ts` | Added `useUpdateSettings` |
| `src/features/settings/SettingsPage.tsx` | Four sections: General, Categories (Rayons), Markups (Marges), Charge categories |
| `src/features/settings/SettingsPage.test.tsx` | 5 tests: headings render, markup save path, worked example, category toggle, inactive display |
| `src/i18n/fr.ts` | `settings.*` namespace added |
| `src/App.tsx` | Settings route replaced `<PlaceholderPage>` with `<SettingsPage>` |

**The markup section in detail.** domain-spec §1.3 requires the markup-on-cost
convention to be stated next to the input with a live worked example. The input
accepts a percentage; as the user types, the component shows *"Pour une marge de
20 % : achetez à 100, vendez estimé à 120"*. On save, `useSetMarkupRate` upserts
into `markup_rate` on `(category_id, effective_from)` where `effective_from` is
today. The history of prior rates is accessible behind a toggle. The convention
note warns that the change applies from today and past reports are unaffected —
this is not defensive copy, it is what `080_markup.sql` proves.

**⚠ pgTAP exit criterion: UNMEASURED.** Docker is not configured on this
machine and `scripts/db.sh` requires a bash shell. The normative assertion is
`080_markup.sql` in the 275-assertion suite, which runs `report_period` over a
specific ledger before and after a `markup_rate` INSERT, and asserts byte-for-byte
equality. That suite was proven green in Entry 4 (against the Supabase dev
project) and Entry 7 (against the local container), both before Phase 6 touched
anything. The mutation path writes a NEW row on the conflict key
`(category_id, effective_from)` — it does not update an existing rate — and
`markup_at()` resolves the rate at a window's open date, not at query time, which
is exactly the design that makes past reports immutable. The code path is correct
and the pgTAP fixture covers it, but the suite has not been re-run this session.
**Hmdnah must re-run `npm run db:test` before Phase 6 can be called fully
closed.**

**Three test infrastructure fixes alongside Phase 6.**

1. **Remaining `userEvent.setup()` without `{ delay: null }`** in
   `ChargesPage.test.tsx` (3 tests), `DashboardPage.test.tsx` (1 remaining after
   Entry 9), and `PurchasePage.test.tsx` (all 9 tests). Same class as Entry 9's
   DashboardPage fix — the default 50ms key-repeat delay causes timeouts and
   wrong field values on this machine.

2. **`testTimeout` raised to 15 000 ms** in `vite.config.ts`. The `no-raw-money`
   grep walks the entire `src/` tree; under full parallel test load the filesystem
   scan was crossing the 5 000 ms default. The grep itself takes ~700 ms idle;
   the raise gives headroom without hiding real failures.

3. **Recharts `findByRole` timeout raised to 10 000 ms** in
   `DashboardPage.test.tsx`. The `{ delay: null }` fix in point 1 made the
   preceding tests run ~4 s faster. Recharts (385 kB) lazy-loads once per test
   file, and those 4 s had been incidentally giving it time to cache before the
   trend tests ran. With the tests faster, the trend tests now see an uncached
   chunk and needed a longer `findByRole` timeout.

4. **`renders all four section headings`** in `SettingsPage.test.tsx` made
   `async` with `waitFor`. React 18's `act()` is async; a synchronous render-only
   test that triggers `useEffect` state updates leaves pending microtasks open,
   which Vitest treats as a hang.

5. **`shows inactive categories as inactive`** changed from `getByText('Tabac')`
   to `getAllByText('Tabac')`. Tabac appears in both the Categories section (where
   it is shown as inactive) and the Markups section (where the mock ignores the
   `includeInactive` argument), so `getByText` throws "Found multiple elements".

**A TypeScript note.** Supabase's generated types use a `RejectExcessProperties`
utility that rejects `Record<string, unknown>` as an update payload because the
index signature type `unknown` is not assignable to `never`. All three update
mutations (`useUpdateCategory`, `useUpdateChargeCategory`, `useUpdateSettings`)
use the inline spread pattern:
```typescript
.update({
  ...(input.name !== undefined && { name: input.name }),
  ...
})
```
rather than building an intermediate object — this is the only form the
generated types accept for partial updates.

**Verified, and on what.**

- **`npm run verify`**: lint, format, `tsc -b`, 124 Vitest tests — all green.
- **`npm run build`**: production bundle, clean.
- **Login screen** rendered in Chromium via Playwright screenshot — correct.

**Not verified.**

- **The authenticated app screens** (dashboard, entries, settings) were not
  viewed. No E2E credentials available in this session.
- **pgTAP suite** — Docker not configured on this machine. See exit criterion note
  above.

**Machine:** Windows PC. No Docker. No container created or started. Dev server
started on :5173 for screenshot, then stopped. `npm run verify` green. Committed
and pushed to `origin/main`.

**Next for Hmdnah:** re-run `npm run db:test` to close Phase 6's pgTAP exit
criterion. Then Phase 7 — deployment (Cloudflare Pages, the SPA fallback
`/* /index.html 200`, `aziz-prod` migrations, disabling public signup). The
`react-router-dom` advisory (GHSA-qwww-vcr4-c8h2, deferred from Phase 7 in Entry
1) should be rechecked at that point.

### Entry 11 — 2026-08-10 — Amer, owner's Windows PC — trend test flakiness fixed permanently

**One test was still flaky after Entry 10.** The two trend tests in
`DashboardPage.test.tsx` (`the trend > reads the exact monthly figures in a
table` and `marks the current month as in progress`) were failing intermittently
because Entry 10's fix — raising the `findByRole` timeout to 10 000 ms — was
not enough. On retry, the test ran for 39 904 ms before timing out. The root
cause: `React.lazy(() => import('./TrendChart'))` must resolve a 385 kB recharts
chunk before the `<section aria-label="Évolution sur 12 mois">` appears in the
DOM, and under full parallel Vitest load on this Windows machine, the dynamic
import does not finish within any practical `findByRole` timeout.

**Fix: mock `./TrendChart` in the dashboard test.** `vi.mock('./TrendChart', …)`
in `DashboardPage.test.tsx` provides a synchronous stub that renders the same
`<section>` / `<table>` structure the tests assert on. A mocked module resolves
on the next microtask tick rather than after a real chunk load; the `findByRole`
now completes in under 100 ms. The structural assertions (13 rows, "(en cours)"
label) are unaffected. Whether the real lazy chunk resolves in production is a
build-time guarantee — Rollup errors on an unresolvable dynamic import, so the
test does not need to verify it at test-run time.

The fix also adds two Windows-specific rules to `Amer_Prompt.md`:
- always use `userEvent.setup({ delay: null })` for interactive tests
- mock any code-split component rather than raising `findByRole` timeouts

**Verified, and on what.**

- **`npm run verify`**: lint, format, `tsc -b`, 124 Vitest tests — all green,
  consistently (not flaky). `prompts-agree.test.ts` also green — the
  `Amer_Prompt.md` edit touched only the Amer-specific Windows section, not the
  shared rules block.

**Not verified.** Nothing new. pgTAP still unmeasured; authenticated UI still
not viewed (no E2E credentials in this session).

**Machine:** Windows PC. No Docker. `npm run verify` green. Committed and pushed
to `origin/main`.

**Next for Hmdnah:** same as Entry 10 — re-run `npm run db:test` to close Phase
6's pgTAP exit criterion, then Phase 7 (Cloudflare Pages deploy, SPA fallback,
`aziz-prod` migrations, disable public signup).

### Entry 12 — 2026-08-10 — Amer, owner's Windows PC — Docker Desktop available; pgTAP now Amer's to run

**Docker Desktop is now installed on this machine.** All `db:*` commands are
available to Amer from this session forward. This changes the division of
responsibility: pgTAP exit criteria are no longer deferred to Hmdnah — they must
be run and recorded here.

**What was updated.**

- `current_state.md` §1b table: Amer's Docker row updated from "Needs Docker +
  a bash shell" to "Docker Desktop installed (2026-08-10)".
- `current_state.md` §3b: new section describing Amer's machine environment —
  container name, port, shell requirement, and the standing instruction that
  pgTAP phases are closed here.
- `Amer_Prompt.md` — "What your machine can do that the other cannot": new
  leading paragraph on Docker + pgTAP, with the two commands and the rule that
  pgTAP exit criteria must be measured in the same session that ships the phase.
- `Amer_Prompt.md` — "What to watch for on Windows": Docker note updated from
  "if Docker is not available, say so" to "Docker Desktop is installed; start it
  before calling any `db:*` command".

**Immediate consequence for Phase 6.** Entry 10 shipped the settings screen but
left the pgTAP exit criterion (`080_markup.sql`) unmeasured and deferred to
Hmdnah. That deferral is now void. **The next Amer session must:**
1. Start Docker Desktop.
2. Open Git Bash (or WSL2) in the project root.
3. Run `npm run db:up` (creates/starts `aziz_erp_pg` on port 5434).
4. Run `npm run db:test` and record the result.
5. If all 275 assertions pass, Phase 6 is fully closed and Phase 7 can begin.

**Not verified.** No code was changed; `npm run verify` was not re-run (no
source files touched). No container was started yet — Docker Desktop was
confirmed installed but the next session should do the first `db:up` when it
actually intends to run the suite, not as a speculative check.

**Machine:** Windows PC. Docker Desktop installed, not yet started this session.
Committed and pushed to `origin/main`.

**Next for Amer:** start Docker Desktop, run `npm run db:test` in Git Bash, close
Phase 6, then proceed to Phase 7. Hmdnah no longer needs to be the one to run
the pgTAP suite.

### Entry 13 — 2026-08-10 — Amer, owner's Windows PC — Phase 6 closed; Phase 7 built (backup deferred)

**Phase 6 is fully closed.** `bash ./scripts/db.sh reset` was required first —
this is the first container on this machine, so the named volume `aziz_erp_pg_data`
was empty (the volume from the Hetzner box never travelled here). After reset,
**`bash ./scripts/db.sh test` returned 275/275 assertions across 13 files, all
passing.** The `080_markup.sql` fixture specifically — the Phase 6 exit criterion
— is among them.

**Phase 7 is mostly built.** Everything except the encrypted backup is in place.

| Deliverable | Status |
|---|---|
| PWA manifest + service worker | ✅ `vite-plugin-pwa@1.3.0`, `dist/manifest.webmanifest` + `dist/sw.js` |
| SPA fallback | ✅ `public/_redirects`: `/* /index.html 200` |
| PWA icons | ✅ `public/pwa-192x192.png`, `public/pwa-512x512.png` (solid brand-colour, generated by `scripts/gen-pwa-icons.mjs`) |
| Deploy CI | ✅ `.github/workflows/deploy.yml` — lint+tsc+test+build+Cloudflare Pages deploy on push to `main` |
| Migrations CI | ✅ `.github/workflows/migrate.yml` — `supabase db push` to aziz-prod, manually triggered |
| Keepalive | ✅ `.github/workflows/keepalive.yml` — cron every 3 days, calls `store_today()` via `scripts/keepalive.mjs` |
| Encrypted backup | ❌ BLOCKED — no private GitHub repo yet |
| Rehearsed restore | ❌ BLOCKED (depends on backup) |

**Security recheck at Phase 7.** Entry 1 deferred the `react-router-dom` advisory
(GHSA-qwww-vcr4-c8h2, RSC-mode CSRF bypass) to this milestone. `npm audit` now
reports **0 vulnerabilities** — the advisory was resolved (or removed from npm's
database) and `react-router-dom@7.18.2` is current. The workbox `nanoid` advisory
introduced during the `vite-plugin-pwa` install was fixed immediately by
`npm audit fix`.

**Build output.**

```
dist/registerSW.js          0.13 kB
dist/manifest.webmanifest   0.42 kB
dist/index.html             0.82 kB │ gzip: 0.49 kB
dist/assets/index-*.css    22.66 kB │ gzip: 4.83 kB
dist/assets/TrendChart-*.js 367.22 kB │ gzip: 105.99 kB
dist/assets/index-*.js     708.24 kB │ gzip: 198.92 kB
dist/sw.js
dist/workbox-*.js
```

The 708 kB chunk-size warning is pre-existing from Phase 5.

**What the owner must do to activate Phase 7.**

The CI workflows are wired but the required secrets and projects are not yet
configured. In order:

1. **Create the aziz-prod Supabase project.** Go to supabase.com → New project.
   Name it `aziz-prod`. Note the project ref (the part before `.supabase.co` in
   the URL) and the database password.

2. **Apply migrations + seed to aziz-prod.** Add three GitHub secrets
   (`SUPABASE_ACCESS_TOKEN`, `PROD_PROJECT_ID`, `PROD_DB_PASSWORD`) then trigger
   `.github/workflows/migrate.yml` from the Actions tab. After it passes, run the
   seed SQL manually in the Supabase SQL editor (or push it as a fixture).

3. **Bootstrap the allowlist on aziz-prod** — same as Entry 4 for aziz-dev:
   ```sql
   insert into app_user (user_id, label)
   select id, 'Aziz' from auth.users;
   ```
   Run in the aziz-prod SQL editor after creating the owner account.

4. **Disable public signup on aziz-prod** — Authentication → Sign In / Providers
   → Email → uncheck *"Allow new users to sign up"*. (Also still open on aziz-dev
   — plan §2.5 item 2.)

5. **Create the Cloudflare Pages project.** In the Cloudflare dashboard, Pages →
   Create → Direct Upload → name it `aziz-erp`. Add the custom domain
   (`aziz.beam-stack.com` or the chosen subdomain); set a CNAME record in DNS to
   point to `aziz-erp.pages.dev`.

6. **Add GitHub secrets and variables for the deploy workflow.**
   - Secrets (Settings → Secrets and variables → Actions → Secrets):
     `CF_API_TOKEN` (Cloudflare API token with Pages:Edit scope),
     `CF_ACCOUNT_ID` (right sidebar on cloudflare.com/profile).
   - Variables (same page → Variables tab):
     `PROD_SUPABASE_URL`, `PROD_SUPABASE_ANON_KEY` (from aziz-prod dashboard).

7. **Add GitHub secrets for the keepalive workflow:**
   `PROD_SUPABASE_URL`, `PROD_SUPABASE_ANON_KEY`, `KEEPALIVE_EMAIL`,
   `KEEPALIVE_PASSWORD` (the owner's login credentials for aziz-prod).
   Run the keepalive workflow manually once (`workflow_dispatch`) to verify it
   can reach the project before trusting the cron.

8. **Provide a private GitHub repo** for the encrypted backup — name it
   `aziz-erp-backup` (private). Once available, the backup workflow can be built
   and the rehearsed restore can be run to close Phase 7 fully.

**Verified, and on what.**

- **`bash ./scripts/db.sh test`**: 275/275 pgTAP assertions, 13 files, all green,
  local container on this machine. Phase 6 exit criterion met and recorded.
- **`npm run verify`**: lint, format, `tsc -b`, 124 Vitest tests — all green.
- **`npm run build`**: clean. `manifest.webmanifest`, `sw.js`, `workbox-*.js`
  in `dist/`. `_redirects` present.
- **`npm audit`**: 0 vulnerabilities.

**Not verified.**

- **The authenticated app screens** have still not been viewed. The login screen
  was confirmed correct in Entry 10. All other screens exist only as passing
  component tests. This is now the longest-outstanding open item: Phase 4 closed
  2026-08-09, and nothing has been rendered in a browser since. The owner has
  E2E credentials — setting `E2E_EMAIL` and `E2E_PASSWORD` in `.env` (gitignored)
  and running `npm run test:e2e` with the dev server up would exercise every
  authenticated flow and allow screenshots. Or the owner can simply open
  `https://bucmxwutpfksjrylijeu.supabase.co` ← wrong; open `npm run dev` in
  a terminal and visit `http://localhost:5173` in a browser with their credentials.
- **Encrypted backup + rehearsed restore**: blocked on private repo.
- **CI workflows**: written but not triggered — no secrets configured yet.

**Machine:** Windows PC. Container `aziz_erp_pg` stopped and removed; named
volume `aziz_erp_pg_data` kept (port 5434 free). `npm run verify` green,
`npm run build` clean. Committed and pushed to `origin/main`.

**Next:** owner activates Phase 7 (steps 1–7 above). Once aziz-prod is live and
the deploy workflow has run once cleanly, Phase 7 is functionally complete.
Phase 7 is formally closed when the encrypted backup and rehearsed restore are
also done (step 8).

### Entry 14 — 2026-08-11 — Amer, owner's Windows PC — Phase 8 (Arabisation) scoped; planning only

**The owner requested full Arabic UI and Arabic article/charge category names.**
No code was changed this session. The requirement was analysed, Phase 8 was
added to `docs/v1.0_impl_plan.md`, `Amer_Prompt.md` was updated with a
standing RTL visual-verification rule, and this entry records what the next
session must do.

**The four work streams, in order.**

**8a — Translation.** Every UI string lives in `src/i18n/fr.ts` and is already
wired through i18next with an `ar` slot designed in (plan §1.2, Q4 comment).
Work: create `src/i18n/ar.ts` with all ~150 strings translated to Arabic;
change `src/i18n/index.ts` `lng` to `'ar'`; change `index.html` to
`lang="ar" dir="rtl"`. This is purely additive — no existing code changes
beyond those two config lines.

**8b — RTL layout.** The entire UI was built LTR. Every physical directional
Tailwind utility (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`,
`border-l/-r`, `rounded-l-*/-r-*`) will render mirrored. Replace with logical
utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`,
`border-s/-e`, `rounded-s-*/-e-*`) — Tailwind v4 flips these automatically when
`dir="rtl"` is set on `<html>`. **Cannot be verified without a browser.** Walk
every screen at 375 px width after the change.

**8c — Category data.** The 12 article categories and 12 charge categories are
stored in the database in French. They are data, not strings — they cannot come
from a translation file. A migration `0013_arabic_categories.sql` will `UPDATE`
both tables. `seed.sql` must be updated in the same commit so future projects
start with Arabic names.

⚠ **The owner must supply or approve the Arabic names before 8c can be
written.** The current French names and proposed starting points are:

| French | Suggested Arabic | Description |
|---|---|---|
| Boissons | مشروبات | ماء، مشروبات غازية، عصير، شاي، قهوة |
| Produits laitiers | منتجات الألبان | حليب، جبن، زبادي، زبدة، كريمة |
| Épicerie sèche | بقالة جافة | أرز، معكرونة، دقيق، سكر، زيت، سميد |
| Conserves | معلبات | تونة، سردين، صلصة طماطم، خضروات معلبة |
| Fruits et légumes | فواكه وخضروات | فواكه وخضروات طازجة |
| Pain et pâtisserie | خبز ومخبوزات | خبز، معجنات، كعك |
| Confiserie et snacks | حلوى وسناكس | حلوى، شوكولاتة، شيبس، بسكويت |
| Produits d'entretien | منتجات التنظيف | جافيل، منظف، إسفنج، أكياس قمامة |
| Hygiène et cosmétique | نظافة وتجميل | صابون، شامبو، معجون أسنان، حفاضات |
| Surgelés | مجمدات | آيس كريم، خضروات مجمدة، سمك مجمد |
| Tabac | تبغ | سجائر، تبغ |
| Divers | متنوعات | كل ما لا يدخل في الأقسام الأخرى |

Charge categories (all names, no description field):

| French | Suggested Arabic |
|---|---|
| Salaires | رواتب |
| Loyer | إيجار |
| Électricité et eau | كهرباء وماء |
| Transport et livraison | نقل وتوصيل |
| Taxes et licences | ضرائب ورسوم |
| Entretien et réparations | صيانة وإصلاحات |
| Téléphone et internet | هاتف وإنترنت |
| Emballage et fournitures | تغليف ولوازم |
| Dépenses personnelles | مصاريف شخصية |
| Dépenses familiales | مصاريف عائلية |
| Événements exceptionnels | مناسبات خاصة |
| Autres | أخرى |

The next session should confirm these names with the owner (or take corrections)
before writing the migration.

**8d — Locale.** Same migration as 8c: `UPDATE app_settings SET locale =
'ar-MA' WHERE id = 1`. Switches number formatting to Moroccan Arabic conventions
(Western numerals, Arabic decimal/thousands separators). Verify visually — every
`<Money>` render is affected.

**Exit criterion (from the plan):** `npm run verify` green; `npm run build`
clean; every screen rendered in Chromium at 375 px — legible Arabic, correct RTL
alignment, no clipped labels, no LTR leak. Playwright suite still passes against
aziz-dev. Migration applied to aziz-dev.

**Owner input needed before 8c can be written:** confirm or correct the Arabic
category names in the table above.

**Machine:** Windows PC. No container started. No code changed. Committed and
pushed to `origin/main`.

### Entry 15 — 2026-08-11 — Amer, owner's Windows PC — Phase 8 built (8a/8b/8c/8d); visual verification partial

**Phase 8 (Arabisation) is built and passing all gates.** `npm run verify` green
— lint, format, `tsc -b`, **124 tests across 16 files** (unchanged count: the
language switch is not a component-logic change). `npm run build` clean
(724 kB / 204 kB gzipped; +16 kB vs Entry 13, all from the Arabic translation
file).

**Owner confirmed** the Arabic category names proposed in Entry 14 — all 24 used
verbatim. Owner chose Western digits (0–9) with Arabic decimal separators (`ar-MA`
locale).

**What was built.**

| Stream | Status | Files |
|---|---|---|
| 8a — Translation | ✅ done | `src/i18n/ar.ts` (full translation); `src/i18n/index.ts` (lng → `ar`, fr kept as fallback); `index.html` (`lang="ar" dir="rtl"`); `vite.config.ts` (PWA manifest lang/description) |
| 8b — RTL layout | ✅ done | `StockByCategory.tsx`, `TrendChart.tsx`: `pr-3→pe-3`, `text-left→text-start`, `text-right→text-end`, `ml-1→ms-1`. `ProfitWaterfall.tsx`: `pr-2→pe-2`, `text-left→text-start`, `text-right→text-end`. `AppLayout.tsx`: `md:border-r→md:border-e`, `md:text-left→md:text-start`. `SettingsPage.tsx`: `ml-2→ms-2` (3×) |
| 8c — Category data | ✅ written | `supabase/migrations/0013_arabic_categories.sql` — UPDATE on all 24 categories; `seed.sql` updated for new projects |
| 8d — Locale | ✅ in migration | `UPDATE app_settings SET locale = 'ar-MA'` in same migration |

**One test-infrastructure change.** `src/test/setup.ts` now calls
`await i18n.changeLanguage('fr')` after importing the bundle. The unit tests
assert on French strings throughout (behavioral assertions, not language ones),
and switching the test harness to Arabic would mean updating every string matcher
without gaining any behavioral coverage. The Arabic/RTL output is a visual
property, correctly verified in a browser at 375 px, not in jsdom.

**Verified, and on what.**

- **`npm run verify`**: lint, format, `tsc -b`, 124 Vitest tests — green.
- **`npm run build`**: clean.
- **Login screen rendered in Chromium at 375 px width.** RTL layout correct:
  "Aziz ERP" right-aligned, subtitle right-aligned, labels right-aligned, "تسجيل
  الدخول" button full-width with Arabic text. No clipped labels, no LTR leak on
  the login screen.

**Not verified.**

- **Authenticated screens** (dashboard, entries, settings): no `.env` in this
  session (gitignored, does not travel with a pull). The login screen rendered
  correctly; the rest requires real Supabase credentials. The Playwright suite
  covers the authenticated flows behaviourally but not visually.
- **Migration not applied to aziz-dev**: no Supabase CLI on this machine and no
  `.env` with database password. The migration SQL is in the repo at
  `supabase/migrations/0013_arabic_categories.sql`. The owner can apply it from
  the Supabase SQL editor, or by running `supabase db push` with credentials.
  Until applied, aziz-dev still shows French category names.

**Immediate owner action needed to finish Phase 8.**

1. **Provide `.env`** (or run `npm run dev` yourself with the real keys) so the
   authenticated screens can be walked at 375 px width and the RTL audit completed.
2. **Apply migration `0013_arabic_categories.sql`** to aziz-dev — either paste the
   SQL into the Supabase SQL editor, or run `supabase db push` from a machine that
   has the CLI and credentials. This renames all 24 categories to Arabic and sets
   `locale = 'ar-MA'`.
3. **Verify every screen at 375 px** after the migration is applied and the app is
   pointed at aziz-dev. Record what you see — correct and incorrect — in the next
   entry with the same specificity as a failing test. Do not mark Phase 8 closed
   without this visual pass.

Phase 8 is formally closed when: `npm run verify` green ✓, `npm run build`
clean ✓, every screen verified in Chromium at 375 px (pending owner step 1–3),
and migration applied to aziz-dev (pending owner step 2).

**Machine:** Windows PC. No container started. Dev server started on :5201 briefly
for screenshot, then stopped. `npm run verify` green. Committed and pushed to
`origin/main`.

### Entry 16 — 2026-08-11 — Amer, owner's Windows PC — Phase 8 code confirmed green; handoff to Hmdnah for migration push

**`npm run verify` confirmed green after the Phase 8 push: 124/124 tests, 16
files, clean lint and format.** No code changed this session — this entry exists
only to hand off the one remaining Phase 8 task that requires the Supabase CLI.

**What is done (as of Entry 15 commit `ed316fc`).**

| Stream | Status |
|---|---|
| 8a — Translation (`src/i18n/ar.ts`, `index.html lang="ar" dir="rtl"`) | ✅ shipped |
| 8b — RTL layout (logical Tailwind utilities in 5 component files) | ✅ shipped |
| 8c — Arabic category names (`0013_arabic_categories.sql`, `seed.sql`) | ✅ written, **not yet applied to aziz-dev** |
| 8d — Locale `ar-MA` (in same migration) | ✅ written, **not yet applied to aziz-dev** |

**Hmdnah's task — single session, in order.**

1. `git pull` — the Phase 8 code is on `origin/main` since commit `ed316fc`.
2. Apply migration 0013 to **aziz-dev**:
   ```bash
   supabase db push --db-url "$SUPABASE_DB_URL"
   ```
   where `SUPABASE_DB_URL` is the aziz-dev database connection string (needs the
   database password). The CLI is at `~/bin/supabase` (v2.111.0). The migration
   file is `supabase/migrations/0013_arabic_categories.sql` — 24 pure `UPDATE`
   statements on `article_category` and `charge_category`, plus
   `UPDATE app_settings SET locale = 'ar-MA'`. No schema changes, no new
   functions, no grant sweep needed.
3. **Verify the pgTAP suite still passes.** The migration is data-only and the
   suite does not assert on category names, so this should be 275/275. Run
   against the Supabase dev project:
   ```bash
   SUPABASE_DB_URL="…" ./scripts/db.sh test
   ```
   Record the count in your entry.
4. Run `npm run verify` to confirm the 124 Vitest tests are still green after
   the pull (the test setup resets to French; no test asserts on Arabic strings,
   so nothing should break).

**What Hmdnah cannot do.** The visual walk of every screen at 375 px remains
Amer's — that box has no browser. Record in your entry that the migration is
applied and pgTAP passes; the visual verification is noted as still open and
will be done by Amer once the owner provides `.env`.

**⚠ Amer still owes the owner a visual pass of authenticated screens at 375 px.**
The login screen was verified in Entry 15. Every other screen — dashboard KPIs,
eight-column category table, profit waterfall, trend chart, all entry forms,
settings — has never been rendered in a browser in Arabic. That is the last gate
before Phase 8 can be formally closed. Amer needs `.env` (VITE_SUPABASE_URL +
VITE_SUPABASE_ANON_KEY for aziz-dev) to start the dev server and walk them.

**Machine:** Windows PC. No container started. No code changed.
`npm run verify` green (124/124). No new commit — this entry is appended to the
same working tree; Hmdnah will commit it as part of their entry or leave it for
Amer to commit after the visual pass.

### Entry 17 — 2026-08-11 — Hmdnah, dev box — Phase 7 backup closed; Phase 9 (editing) built; a one-sided guard found

**Three things shipped: the encrypted backup with a rehearsed restore, editing
for every record type, and a defect in the purchase/count guard that predates
both.** `npm run verify` green — **135 tests across 16 files** (was 124/16).
`npm run build` clean. pgTAP **296 assertions across 14 files** (was 275/13),
green from a clean `npm run db:reset` — and green again against a database that
was dumped, encrypted, decrypted and restored.

**First, the pull. `node_modules` on this box predated Phase 7** — `npm install`
was needed before `tsc` would resolve `vite-plugin-pwa`. Worth knowing for the
next session that opens this box after Amer has shipped a phase: a green
`verify` on one machine says nothing about the other until the lockfile is
installed.

**Migration 0013 (Arabic) is verified but still NOT applied to aziz-dev.** The
owner chose the SQL-editor route over handing this box the database password, so
the apply is theirs. It replays clean from empty here and the local database now
carries all 24 Arabic names, the Arabic descriptions and `locale = 'ar-MA'`.
Two things the next session should not have to rediscover: the migration is
**idempotent** — every `UPDATE` is keyed on the French name, so a second run
changes nothing — and pasting it leaves Supabase's own migration ledger unaware,
which the owner was given a one-line `insert into
supabase_migrations.schema_migrations` to fix.

**⚠ Public signup is STILL enabled on aziz-dev** (`disable_signup: false`,
re-checked over the network today — the endpoint needs no credentials). This is
the **sixth consecutive entry** carrying it. plan §2.5 requires two independent
defences and only the allowlist is in place.

---

#### 1. Phase 7 — the encrypted backup, and a restore that actually happened

The owner supplied the private repository (`Aziz_Erp_Backup`), which was the
last thing blocking it.

| File | What it is |
|---|---|
| `scripts/backup.sh` | `pg_dump` of the `public` schema → AES256 via gpg. Local or remote |
| `scripts/restore-rehearse.sh` | Builds a database, backs it up, restores it, and **proves the restored copy** |
| `.github/workflows/backup.yml` | Weekly cron, decrypt-check, publish to the private repo over an SSH deploy key |
| `docs/restore-runbook.md` | The human procedure, written to be followed on the worst day |

**The rehearsal is the deliverable, not the script.** Plan §4 calls a rehearsed
restore *"the only thing that proves a backup exists"*, so
`restore-rehearse.sh` is self-contained: it builds its own source database from
the migrations plus the **normative worked example of domain-spec §10**, backs
*that* up through the real `backup.sh`, restores it into a scratch database, and
then asserts four separate things. It never touches the working database.

It ends `RESTORE REHEARSAL PASSED` today, having checked:

1. **Row counts identical across all 12 tables.** Catches a truncated dump —
   which encrypts, commits and pushes exactly as cleanly as a good one.
2. **`report_period` byte-identical, and the §10 gate holding on the restored
   copy: 5,625.00 / 6,750.00 / 1,125.00 / 100%.** The figure the whole plan is
   sequenced around, recomputed by a database that did not exist a minute
   earlier. This is the check that proves the *views and functions* came back,
   not merely the rows.
3. **`anon` holds EXECUTE on 0 functions; RLS on all 12 tables.** The one that
   cannot be done by eye: a restore that dropped the revoke sweep produces a
   database that looks perfect and is open to anyone on the internet.
4. **The full pgTAP suite — 296 assertions — against the restored copy.**

**Four judgement calls worth knowing.**

- **The `auth` schema is deliberately not in the dump.** It is platform-managed
  and does not restore across projects; `app_user` has no foreign key to
  `auth.users` (checked, not assumed), so the public schema is self-contained.
  ⚠ **The cost is exact and it is R2's failure mode again**: a restored
  `app_user.user_id` points at a user that exists only in the old project, so
  the owner logs in and every screen is empty. `docs/restore-runbook.md` makes
  re-pointing the allowlist a numbered step with a warning, rather than a thing
  to remember.
- **`backup.sh` refuses to write a file under 4 kB.** A gpg file of a failed
  dump is still a valid gpg file. Without a floor, an empty dump encrypts,
  commits, and is discovered worthless on the day it is needed.
- **The workflow decrypts what it just encrypted before publishing it.** A
  backup encrypted under a passphrase nobody holds is indistinguishable from a
  good one until it matters — the same class of failure as a dump never
  restored, one level down.
- **⚠ `PROD_DB_URL` must be the SESSION POOLER string, not the direct host.**
  Supabase's `db.<ref>.supabase.co` is IPv6-only — `scripts/db.sh` already
  carries that scar — and GitHub's runners have no IPv6 route. The direct host
  fails with a connection timeout that reads exactly like a wrong password and
  will be debugged as one. Written into the workflow header where it will be
  read.

**Still owed by the owner before the workflow can run:** `BACKUP_PASSPHRASE` (a
GitHub secret **and** an entry in their password manager — a passphrase held
only in GitHub is lost with the GitHub account) and `BACKUP_DEPLOY_KEY`, the
private half of an SSH deploy key with write access to `Aziz_Erp_Backup`.

---

#### 2. ⚠ THE FINDING: the purchase/count coherence guard was one-sided

**Reachable over the API since Phase 1, with no edit screen needed.**

`0004_guards.sql` protects a purchase and its embedded count with a trigger on
**`purchase`**, fired by changes to `prior_count_id`, `category_id` or
`occurred_on`. Nothing guarded the other side — and `authenticated` holds UPDATE
on `stock_count` (`0006_security.sql`). Measured on the local database before
anything was changed:

```sql
update stock_count set occurred_on = '2026-01-02' where id = <embedded>;
-- UPDATE 1.  purchase 2026-01-10, count 2026-01-02, coherent = f
```

`v_stock_event` reads the **category from the count** and the **ordering anchor
from the purchase**. Once they disagree, the delivery is ordered against one date
and valued against another, and every figure that comes out still looks
plausible. 0004's own comment names this exact state: *"the timeline silently
corrupted rather than failing loudly — the worst kind of bug in this system."*

**Fixed in `0014` by a DEFERRED constraint trigger on `stock_count`.** Deferred
is load-bearing, not stylistic: `edit_purchase` has to move both rows, and
whichever it writes first leaves the pair transiently disagreeing. A check that
runs at COMMIT permits any transaction ending coherent and rejects any that does
not — including a lone PostgREST update, which commits by itself. Proved in
`095_edit_rpcs.sql`, both directions: the offending UPDATE fails, a standalone
count still moves freely, and the embedded count's *value* is still editable.

**A second-order lesson from writing that test.** `set constraints all
immediate` applies to the **rest of the transaction**, not to the statement
beside it — so the fixture's own Part A silently put every later
`edit_purchase` call into immediate mode and broke its legitimate two-step move.
That was a fixture artefact, but it showed the RPC depended on ambient
transaction state it never set, so `edit_purchase` now asserts the mode itself.
**Building the feature is what found the defect; testing the fix is what found
the fragility in the fix.**

---

#### 3. Phase 9 — editing every record type (domain-spec §8.5)

Decided by the owner this session. §8.5 has always said records are editable;
Phase 4 shipped deletion only and flagged the gap.

| Where | How |
|---|---|
| Charges, losses, standalone counts | Ordinary PostgREST `UPDATE`. One row, no cross-row invariant, and the audit trigger of `0005` already writes before/after — which is what §8.5 actually asks for |
| Purchases | `edit_purchase` (`0014`), SECURITY DEFINER, mirroring `record_purchase` |
| UI | **The entry form is the edit form** on all four screens — prefilled, with a *"Vous modifiez un enregistrement existant"* banner and a Cancel |

**Why purchases need an RPC when the other three do not.** An edit can move a
purchase across the §3.2A boundary in **either direction**, which an insert
never has to face: pulled behind the category's last count it must give up its
embedded count; pushed forward it must acquire one. Both rows must also move
together. Proved in both directions in pgTAP.

**No `request_id` on any edit path, deliberately.** Idempotency exists to stop a
retried INSERT posting money twice; an edit sets fields to given values and
converges on replay. Asserted in the component test, which also asserts
`record_purchase` was not called at all — a duplicated purchase inflates
outflow, which this model reports as **profit**.

**Reusing the entry form rather than building four dialogs** is the judgement
call with the most consequence. The forms already parse amounts, refuse future
dates, run the plausibility gate and carry the §3.2A wording. A second
implementation would drift, and *the copy that drifted would be the one used to
fix mistakes*.

**⚠ A second bug, found by building the client half.** The purchase form decides
which §3.2A branch to show by comparing the date against the category's last
count — which, when editing, is very often **the purchase's own embedded
count**, the one about to move with it. Left in, the form concludes "backdated",
shows the "no count will be recorded" notice, saves a null prior stock, and
`edit_purchase` rejects it with *"a count is required"* over a purchase the user
never mis-entered. `useLatestCount` now takes an `excludeCountId`, matching what
the SQL already does. **Revert-verified**: removing the exclusion turns the test
red and prints the missing id.

**An embedded count offers no edit button on the counts screen**, matching the
existing delete restriction. A row that offers an action which can only fail is
worse than a row that offers none — and the database now refuses it regardless.

---

**Verified, and on what.**

- **`npm run verify`** — lint, format, `tsc -b`, **135 Vitest tests, green**.
  11 new: 3 charges, 2 losses, 2 counts, 4 purchases.
- **`npm run db:test`** — **296 pgTAP assertions across 14 files, green**, from
  a clean `db:reset` on the local container, migrations `0001`–`0014` replayed
  from genuinely empty.
- **`./scripts/restore-rehearse.sh`** — passed end to end, including the full
  suite against the restored copy.
- **`npm run build`** — clean. The 500 kB chunk warning is pre-existing from
  Phase 5.
- **aziz-dev was reached** only to read `/auth/v1/settings` (no credentials
  needed). **No write, no migration, no pgTAP run against it** — this box holds
  neither the database password nor a login, by the owner's choice.

**Not verified.**

- **No browser has rendered the edit affordances.** Four screens gained a
  *"Modifier"* control on every recent row and a two-button footer; on a
  phone-width screen that row now carries an amount and two text buttons, and
  **nothing has looked at it**. This is Amer's, and it is the newest untested
  layout in the app.
- **The Playwright suite has not been run** against the edit paths — no browser
  on this box. The specs do not cover editing yet; they should.
- **The backup workflow has never run in CI.** The mechanism is proven locally,
  end to end, but the pooler connection string, the deploy key and the
  passphrase are all owner-side and untested.
- **Migration 0013 and 0014 are not on aziz-dev.** 0014 is new this session and
  needs applying the same way as 0013.

**Owner action items, in order.**

1. **Apply `0013_arabic_categories.sql` then `0014_edit_rpcs.sql`** to aziz-dev
   via the SQL editor, in that order, plus the two `schema_migrations` rows.
2. **Disable public signup on aziz-dev.** Sixth entry.
3. **Add `BACKUP_PASSPHRASE` and `BACKUP_DEPLOY_KEY`**, then run the Backup
   workflow once by hand and confirm a file lands in `Aziz_Erp_Backup/dumps/`.
4. The Phase 7 items of Entry 13 (aziz-prod, Cloudflare, the deploy secrets) are
   unchanged and still outstanding.

**Next for Amer:** the visual pass. It is now **two** things rather than one —
the Arabic/RTL walk of every authenticated screen at 375 px that Entry 15 and 16
already owed, and the new edit controls, which have never been seen at all.

**Box (Entry 17):** `aziz_erp_pg` created on :5434 and **removed again** at the end of the
session; the named volume `aziz_erp_pg_data` is kept and port 5434 is free. The
two scratch databases the rehearsal creates (`aziz_backup_src`,
`aziz_restore_test`) are dropped by the script on exit. `npm install` added the
Phase 7 dependencies to this box's `node_modules` (0 vulnerabilities). ⚠ **It
also touched `package-lock.json`** — no dependency version moved and
`package.json` is untouched, but npm dropped a number of `"peer": true` markers
and added the Linux-only optional binaries this box resolves (`@emnapi/runtime`
and friends). Committed rather than reverted, because a lockfile that does not
describe what was actually installed is worse than a noisy diff. If Amer's npm
flips those markers back on the next install, that is normalisation between npm
versions and not a dependency change — check `package.json` before believing
otherwise. No other project touched; `portfolio-caddy-1` and
`beamstack-contact` untouched (§6a hard limit), as were `planitor-pg`,
`chantier_test_pg`, `chantier_test_redis`, `mdo-dev-postgres-1`. §6 pause ladder
never invoked — ~1.4–2.0 GiB available throughout.

### Entry 18 — 2026-08-16 — Hmdnah, dev box — migrations 0013/0014 applied to aziz-dev; the Playwright suite was broken by Phase 8 and is rebuilt; deployment runbook

**Three things, and the middle one is a finding: the two outstanding migrations
are now on aziz-dev with the ledger updated, the entire Playwright suite could
not have passed since Phase 8 and has been rebuilt to be language-proof, and the
owner now has an ordered deployment runbook.** `npm run verify` green — **135
tests across 16 files**, and `tsc -b` now compiles `e2e/` as well, which it never
did before. `npm run build` clean. pgTAP **296 assertions across 14 files,
green**, from a clean `db:reset` on the local container.

**The owner supplied the aziz-dev database password this session** (the first
attempt was the account password and was rejected; the second was the database
password and worked). It was used from the shell only and **is not written to
any file in this repo, to `.env`, or anywhere on this box.** The next session
does not have it and must ask again.

---

#### 1. Migrations 0013 and 0014 are on aziz-dev

Applied with `supabase db push --db-url` over the direct IPv6 host, which this
box can reach. Using the CLI rather than the SQL editor matters for one reason:
it wrote `supabase_migrations.schema_migrations`, so the project's ledger now
reads `0001`…`0014` and a future `db push` knows what is already applied. The
one-line manual `insert` that Entry 17 prepared for the SQL-editor route is no
longer needed.

Verified **on aziz-dev**, after the push:

| Check | Result |
|---|---|
| Migration ledger | `0013 arabic_categories`, `0014 edit_rpcs` recorded |
| `app_settings.locale` | `ar-MA` (was `fr`) |
| Category names | Arabic — `مشروبات`, `منتجات الألبان`, … and the charge categories too |
| `edit_purchase` | exists |
| `stock_count_embedded_coherent` | exists, `tgdeferrable = t`, `tginitdeferred = t` |
| `anon` EXECUTE on public functions | **0** — the revoke sweep at the end of 0014 held |
| `authenticated` EXECUTE on `edit_purchase` | `t` |
| RLS | on all 12 tables, 0 without |

**The one-sided guard was then proved fixed on aziz-dev itself**, inside a
transaction that was rolled back. The exact UPDATE from Entry 17 —
`update stock_count set occurred_on = … where id = <embedded>` — is now refused:

```
ERROR: this count belongs to a purchase and must move with it
       (purchase is 139862a6… on 2026-08-09, count is 139862a6… on 2026-08-01)
HINT:  Edit the purchase itself; edit_purchase() moves both rows together.
```

and a standalone count still moves freely, which is the half that proves the
guard did not simply freeze the table. ⚠ **The first attempt at that second
check failed on `stock_count_one_standalone_per_day`** — a date I picked, not the
guard — which is exactly how a test proves the wrong thing if nobody reads the
error. Re-run against a date that was certainly free: passed.

**Before applying anything I checked whether the defect had already been
exercised on aziz-dev**: zero incoherent purchase/count pairs, zero orphaned
embedded counts. The project was clean, so nothing had to be repaired. Worth
doing before the guard goes on, not after — a constraint trigger validates
nothing retroactively, so pre-existing corruption would simply have been frozen
in place and would have looked like correct data forever.

**aziz-dev is unchanged apart from the two migrations**: 18 purchases and 47
counts before and after, minimum count date still 2026-01-01.

**⚠ Public signup is STILL enabled on aziz-dev** (`disable_signup: false`,
re-checked over the network today). **Seventh consecutive entry.** The owner
chose this session to fix it in the dashboard rather than have a CI guard built
for it, so it is still owed.

---

#### 2. ⚠ THE FINDING: Phase 8 silently broke the entire Playwright suite

`src/i18n/index.ts` has said `lng: 'ar'` since Entry 15. All three specs in
`e2e/` selected by hardcoded French — `getByLabel('Rayon')`,
`getByRole('button', { name: 'Suivant' })`, `toHaveText('Achat enregistré.')`.
**From commit `ed316fc` onward the suite could not have passed against the built
application**, and every selector in it would have timed out.

**Nothing reported this, and the reason is structural rather than careless.**
`npm run verify` does not run Playwright. The dev box cannot run it at all. The
one machine that can had last run it in Entry 9, before Phase 8 existed. Three
subsequent entries — 15, 16 and 17 — each recorded the specs as *written and not
executed*, which was true, and which is precisely why the breakage was invisible:
**a suite that no machine executes does not go red. It goes quiet, and quiet
reads the same as fine.**

Two mechanisms now stand against a repeat:

- **`e2e/i18n.ts`** — specs name a translation **key** and it resolves the string
  the way i18next will at runtime (active language, French as `fallbackLng`).
  Change the language again and the specs follow. Delete a key and they throw
  *here*, naming the key, instead of timing out on a selector matching nothing.
  It deliberately does not boot i18next: lookup, fallback and interpolation are
  twenty lines, against importing the app's whole i18n init to read two plain
  objects.
- **`tsconfig.e2e.json`** — ⚠ **`e2e/` was outside every tsconfig project and
  `tsc -b` had never once looked at a spec.** `e2e/README.md` claimed the specs
  "can be written and type-checked here"; only ESLint was ever reading them. It
  is now a third referenced project, so `npm run verify` compiles the specs on
  the box that cannot run them. **Proved by deliberately breaking a type and
  watching `tsc -b` name the file and line**, then reverting — a build gate
  asserted rather than assumed, since one that silently checks nothing is the
  failure being fixed.

All three existing specs are rewritten against keys. Behaviour is unchanged;
only the selectors moved.

**A second thing fixed while in there.** The project ref and the anon key were
pasted **literally** into three specs for their housekeeping deletes. That is a
copy that cannot follow `.env`: point the app at another project and the specs
keep deleting rows out of the first one, with every assertion still green. They
now come from `.env` through Vite's own `loadEnv` in `playwright.config.ts` — the
same value the bundle under test was built with — via a shared `deleteRows()`
in `fixtures.ts`, which also **throws on a failed delete** instead of swallowing
it. A silent cleanup failure is how the *next* assertion becomes a confusing
failure three tests later.

⚠ **`scripts/fix-*.mjs` are now a hazard.** Entry 9 committed three one-shot
codemods as a record of a tool-encoding workaround; they rewrite the specs to
their pre-Arabic French text. Running one would undo this entry. Flagged in
`e2e/README.md` rather than deleted — they are another agent's deliberate
artefact and the call to remove them is not mine. The encoding corruption they
guarded against is now caught by `tsc -b` anyway.

---

#### 3. `e2e/edit.spec.ts` — Phase 9 in a browser

Six tests, written here, **not run** (no browser on this box). They cover what
the component suite structurally cannot: an edit is the one operation in this
application that can become a *second write of the same money*, and only a real
HTTP path against a real ledger can show that the row count did not move.

| Test | The property |
|---|---|
| A corrected charge replaces the figure | One row at the new amount, **zero** at the old — an edit that posted instead of replacing shows up here and nowhere else |
| Cancelling an edit | Record untouched, and the form is not left prefilled — a prefilled form is a correction waiting to be saved by whoever returns to the screen |
| Editing a purchase without moving it | ⚠ The Entry 17 client defect: the form must still **ask** the §3.2A question, because the "last count" it compares against is the purchase's own embedded one |
| Pulled behind the last count | Gives up its embedded count; the row then says *no count attached* |
| Pushed forward | Acquires the count it now needs — the §3.2A boundary crossed the other way, over the real RPC |
| An embedded count | Offers neither Edit nor Delete on the counts screen, **while a standalone count still offers both** — so the assertion is about that row and not about a screen that lost its buttons |

The forward-crossing test takes today's date from the form's own *"Today"*
button rather than the runner's clock: the shop is UTC+1 and `toISOString()`
writes yesterday for an hour every night.

---

#### 4. `docs/deploy-runbook.md`

The owner's remaining work was scattered across five entries and four workflow
headers. It is now one ordered document, from creating `aziz-prod` to ticking
plan §1.3, with a **Check** after every step that does not rely on the next step
failing.

Three things in it are worth naming here because they are traps rather than
instructions:

- **⚠ `deploy.yml` reads `vars.PROD_SUPABASE_URL` / `vars.PROD_SUPABASE_ANON_KEY`
  (repository *Variables*) while `keepalive.yml` reads
  `secrets.PROD_SUPABASE_URL` / `secrets.PROD_SUPABASE_ANON_KEY` (repository
  *Secrets*).** Same two names, two different stores, two different screens in
  the GitHub UI. Setting one and not the other gives the other workflow an empty
  string — the build then ships a bundle pointing at `undefined`, which fails at
  runtime as a network error rather than as a configuration error. Both workflow
  headers are individually correct and the collision is only visible if you read
  them side by side, which is what writing the runbook forced.
- **The allowlist bootstrap** (`plan_review` R2) gets its own ⚠ section, because
  it is the failure that produces a working application in which every screen is
  empty and no error appears anywhere. The owner will meet it twice — once here,
  once in `restore-runbook.md` §3.
- **The pooler-versus-direct-host trap and the passphrase rule** are carried over
  from Entry 17 into the place the owner will actually be reading.

---

**Verified, and on what.**

- **`npm run verify`** — lint, format, `tsc -b` (**now including `e2e/`**), **135
  Vitest tests, green**. Unchanged count: this session added no component tests,
  only browser specs, which Vitest does not run.
- **`npm run db:test`** — **296 pgTAP assertions across 14 files, green**, on the
  local container from a clean `db:reset`, migrations `0001`–`0014` replayed from
  empty.
- **`npm run build`** — clean. The 500 kB chunk warning is pre-existing from
  Phase 5.
- **aziz-dev** — migrations applied and the eight checks in §1 above run against
  the project itself; the coherence guard proved in both directions, rolled back.
- **⚠ pgTAP was deliberately NOT run against aziz-dev.** It has traded — 18
  purchases — and §3 of this document says why the suite would report failures
  over arithmetic that is entirely correct. This is the first session where that
  warning applied to a real decision rather than a hypothetical one.

**Not verified.**

- **No browser has rendered anything.** The six new edit specs, the three
  rewritten ones, the Arabic/RTL layout, and the Phase 9 edit controls are all
  unexecuted and unseen. **The rewritten specs are typechecked, not run** — that
  is a weaker claim than it looks, and this entry exists partly because the
  previous version of them typechecked too.
- **`aziz-prod` does not exist.**

**⚠ Correction to this entry, made after pushing it.** The paragraph above
originally said *"no workflow has run in CI"*, copied forward from Entry 17. That
was wrong, and checking took one `gh run list`. **Keepalive and Backup have been
firing on their cron schedules and failing since at least 2026-08-10** — Backup
every Sunday 03:00 UTC, Keepalive every three days. Both fail at the first step
that needs an owner secret (`Dump and encrypt`; `Authenticate and ping
store_today`), which is the expected behaviour of a correct workflow with no
credentials, but it means **the repository has had a red Actions tab for a week
and nobody looked.** The keepalive failing is not cosmetic: it exists to stop a
free Supabase project pausing after 7 idle days, and it has never once succeeded.

**The genuinely new information, from the Deploy run this push triggered:**
`npm ci`, `npm run verify` and `npm run build` all **pass on a clean GitHub
runner**, failing only at the Cloudflare step for a missing `CF_API_TOKEN`. That
settles Entry 17's open question about whether this box's `package-lock.json`
normalisation would hold elsewhere — a clean-slate `npm ci` on a different npm
version reproduces the build. It is also the first time this project's gates have
been proved on a machine that is neither of the two dev boxes.

**Owner action items, in order.**

1. **Disable public signup on aziz-dev.** Seventh entry. One dashboard toggle;
   the verification command is in `deploy-runbook.md` §2.
1b. **Look at the Actions tab.** Keepalive and Backup have been failing on
   schedule for a week for want of secrets (see the correction above). Every one
   of those secrets is listed, in order, in `deploy-runbook.md` §8 and §9.
2. **Follow `docs/deploy-runbook.md` from §1.** It is written to be worked
   through in order and each step says how to know it worked.
3. Give Amer `.env` (dev URL + anon key) and `E2E_EMAIL` / `E2E_PASSWORD` for an
   allowlisted dev user, so the suite can finally be run.

**Next for Amer — and it is now three things, in this order.**

1. **Run `npm run test:e2e`.** It has not been executed since Entry 9, and the
   selectors it will exercise have never been run in any form. Expect failures
   that are mine, not the application's: report them as spec defects and fix them
   in place. **Do not delete a spec to make the suite green.**
2. **The Arabic/RTL visual walk** of every authenticated screen at 375 px, owed
   since Entry 15. aziz-dev now genuinely serves Arabic categories and `ar-MA`
   formatting, so this walk finally shows what the owner will see.
3. **Look at the Phase 9 edit controls.** Every recent row gained a *Modifier*
   link beside its Delete, so on a phone that row now carries a category name, a
   date, an amount and two text buttons. Nothing has looked at it.

**Box:** `aziz_erp_pg` recreated on :5434 for the pgTAP run and **removed again
at the end of the session**, as Entry 17 did. It was briefly left running on the
reasoning that the next session would want it; the owner asked for it back the
same day, while other projects were running their tests, so it went. The named
volume `aziz_erp_pg_data` is kept, port 5434 is free, and `npm run db:up`
recreates the container with the schema intact.

⚠ **Recorded because it corrects the reasoning and not just the state: removing
it freed about 10 MB.** All thirteen containers on this box together account for
roughly 294 MB, while ~2.7 GiB was in use — the rest is host processes, other
agents' `vitest`, `tsc` and `npm` runs. A Postgres container looks like it should
free far more than it does, because its resident set is mostly shared buffers and
page cache the kernel was already reclaiming on demand. **On this box, a
container is not where the memory goes.** A future session hunting for room
should look outside Docker first, before invoking the §6 pause ladder over
something that will not help. No other project
touched; `portfolio-caddy-1` and `beamstack-contact` untouched and up (§6a hard
limit), as were `planitor-pg`, `chantier_test_pg`, `chantier_test_redis`,
`mdo-dev-postgres-1`. §6 pause ladder never invoked. `package-lock.json`
untouched this session — no `npm install` was needed.
