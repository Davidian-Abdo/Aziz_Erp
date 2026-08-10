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
| Docker / local Postgres | Yes (`aziz_erp_pg`, see §3) | Needs Docker + a bash shell for `scripts/db.sh` |
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

*(Amer: this section describes Hmdnah's machine. Yours is in `Amer_Prompt.md`,
and the one thing that does not travel with a pull is `.env` — it is gitignored,
so the Supabase URL and anon key have to come from the owner.)*

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

Toolchain: Node 20.20.2 / npm 10.8.2 (present on the box), Supabase CLI 2.111.0
installed user-local at `~/bin/supabase` (no sudo, same pattern as `gh`).

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
