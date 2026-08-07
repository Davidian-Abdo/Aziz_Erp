# Aziz ERP — Review of `v1.0_impl_plan.md`

Reviewer: Hmdnah, Hetzner dev box, 2026-08-02.
Question asked: **is the plan buildable, and will it deliver the app the specs describe?**

---

## Verdict

**Yes — build it.** The plan is sound and unusually strong: it already found and fixed
the specs' real defects (the open RLS policy that let any stranger read the books, the
non-immutable `CHECK` that would break a restore, the `NULL` markup that would silently
poison the whole profit chain, the missing idempotency, the missing onboarding path).
Its corrected worked example in §2.1 is arithmetically right — I recomputed all six
figures independently and they match.

**Phases 0–2 need nothing from the owner and can start immediately.** That is deliberate
and correct: it front-loads the reporting engine, which is where the risk lives, and it
is fully testable with no UI.

Eight findings below. **R1 and R2 are must-fix before the phase they land in ships**;
the rest are cheap corrections best made now, while they are still one-line changes.
None of them changes the plan's shape or its phase order.

---

## R1 — Zero-length count windows silently delete money  ·  High  ·  Phase 2

**Where:** plan §2.1 day arithmetic, against `architecture-spec.md` §3.2's `v_count_window`.

Two counts can land on the same date. Then:

```
window_days  = greatest(close_on - open_on, 1) = greatest(0, 1) = 1
overlap_days = least(close_on, B_eff+1) - greatest(open_on, A)  = 0
allocated    = goods_sold × 0/1                                 = 0
```

The window's `goods_sold_at_cost` is real money that left the shelf, and it is dropped
from every report. Not flagged, not an anomaly — it simply never appears.

**This is reachable through a path the plan itself names.** §2.15b contemplates two
purchases of one category on one day. Buy in the morning (embedded count: 500), buy again
in the afternoon (embedded count: 1,200, morning delivery of 1,000 included). The window
between the two counts holds `500 + 1000 − 1200 = 300` of goods sold, and reports zero.
A same-day purchase plus a month-end sweep does the same thing.

**Fix.** A zero-length window is a point in time, not a span. Give it an overlap of 1 day
when its date falls inside the effective period, 0 otherwise:

```
overlap_days = case when close_on = open_on
                    then (case when open_on between A and B_eff then 1 else 0 end)
                    else greatest(0, least(close_on, B_eff + 1) - greatest(open_on, A))
               end
```

Its 1 settled day is also correct for coverage — that day genuinely is settled, at both
ends. Add a fixture to `050_allocation.sql`: a zero-day window is distinct from the
one-day window already listed there, and only the one-day case is currently covered.

---

## R2 — The allowlist has no way in  ·  High  ·  Phase 1 / Phase 3

**Where:** plan §2.5.

§2.5 is the right fix for the worst defect in either spec, and it is incomplete in a way
that locks the owner out of their own application.

Every business table gets `using (is_app_user())`, which reads `app_user`. Nothing in the
plan says:

- **who inserts the first `app_user` row.** The owner's login is created from the Supabase
  dashboard, which creates an `auth.users` row and nothing else. `app_user` stays empty,
  `is_app_user()` returns false for everyone, and every screen is empty with no in-app way
  to fix it.
- **what policy governs `app_user` itself.** It is a business table by any reasonable
  reading of "every table", so it gets RLS — and if its own policy also calls
  `is_app_user()`, it is unreadable until it is populated, which it cannot be.

**Fix.** Three parts, all cheap:

1. `app_user` gets RLS with a **self-read** policy only — `using (user_id = auth.uid())` —
   and **no** `INSERT`/`UPDATE`/`DELETE` grant to `authenticated`. Membership is not
   self-service.
2. The bootstrap is an explicit, documented step run as `service_role` from the Supabase
   SQL editor after the owner's user exists:
   `insert into app_user (user_id, label) values ('<uuid from auth.users>', 'Aziz');`
3. Add it to §7 as owner action item 2b, blocking Phase 3 alongside the rest. It is the
   step between "the owner has a login" and "the login can see anything".

`020_rls.sql` should assert the lockout directly: an authenticated user with no `app_user`
row reads zero rows from every table. The plan already asks for that test — it just needs
the bootstrap to exist so the positive case is reachable too.

---

## R3 — A same-day purchase lands in the window that already closed  ·  Medium  ·  Phase 2/4

**Where:** plan §2.4 (D-C), against `domain-spec.md` §3.4 rule 3.

§2.4 omits the embedded count when the purchase is dated **at or behind** the category's
last count. But §3.4 rule 3 orders a standalone count **after** all purchases of the same
date. Combined:

The owner sweeps Dairy at 9am (standalone count, 1 Aug). A delivery arrives at 4pm and is
recorded, dated 1 Aug. It is "at" the last count, so no embedded count is written — and
the purchase is then ordered *before* the 9am sweep. Its inflow joins the window that the
sweep closed, inflating that window's outflow by the full delivery amount. Outflow minus
declared losses is goods sold, so the model books an entire delivery as **sold at full
markup on the day it arrived**, and understates the following window by the same amount.

**Fix — one word.** Omit the count only when the purchase is dated **strictly behind** the
last count. A purchase dated *on* the last count date keeps its embedded count, which by
rule 2 sorts immediately before the purchase, while the standalone count still sorts after
both. The resulting order — embedded count, purchase, standalone count — is coherent and
puts the delivery in the window that actually contains it.

Add to `090_write_rpcs.sql`: a purchase dated exactly on the last count date is required to
carry a count, and its inflow lands in the window closing at the standalone count.

---

## R4 — "Categories active at any point in the period" is not computable  ·  Medium  ·  Phase 2

**Where:** plan §2.11.

Overall coverage is defined over "categories **active at any point in the period**".
`article_category` carries only `active boolean` — a current state, with no record of when
deactivation happened. The set the formula names cannot be derived from the schema.

**Fix.** Redefine it as the set that *is* computable and is also the honest one:

```
categories counted = those active now, UNION those with at least one
                     stock_count / purchase / stock_loss event inside [A, B_eff]
```

A category deactivated mid-period still has events in it, so it still counts, which is
right. A category deactivated before the period and untouched during it drops out, which
is also right. No schema change, and it avoids adding `deactivated_at` for one formula.

---

## R5 — The local shim cannot test the RLS matrix  ·  Medium  ·  Phase 0/1

> **RESOLVED IN PHASE 0 — no work needed, and the shim itself is unnecessary.**
> The `supabase/postgres:17.6.1.158` image already ships the `auth` schema, `auth.users`,
> and an `auth.uid()` defined as
> `select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid` — i.e. exactly
> the session-readable form recommended below. The `anon` / `authenticated` /
> `service_role` / `authenticator` roles are present too. Plan §3's
> `supabase/dev/local-bootstrap.sql` is therefore **not built**: it has nothing left to do,
> and local RLS behaviour matches production exactly rather than approximating it.
> The finding is kept below for the record.

**Where:** plan §3, the `local-bootstrap.sql` description.

The shim specifies "an `auth.uid()` returning a **fixed** dev uuid". Fixture `020_rls.sql`
has to exercise three different identities — `anon`, an authenticated user *not* in
`app_user`, and one that is. A constant cannot be three things, so the test as specified
cannot be written.

**Fix.** Have the shim do what Supabase itself does — read the claim out of the session:

```sql
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
```

A test then switches identity with `set local role authenticated;` plus
`set local request.jwt.claim.sub = '…';`, and `anon` is just leaving the claim unset. This
also makes the local behaviour a closer match to production, which matters because §3
already concedes the Supabase project — not this box — is the authority from Phase 3 on.

---

## R6 — Write RPC return types conflict with the idempotency cache  ·  Low  ·  Phase 2

`architecture-spec.md` §4.1 declares `record_purchase … returns uuid` and
`record_count_sweep … returns int`. Plan §2.12 caches results in `write_request.result
jsonb` and returns the cached value on a repeat. A `uuid` return cannot carry back a cached
`jsonb`, and an `int` row count is not enough for the client to reconcile a retry.

**Fix.** Both RPCs return `jsonb`. `record_purchase` returns
`{purchase_id, count_id, replayed: bool}`; `record_count_sweep` returns
`{count_ids: [...], n: int, replayed: bool}`. The `replayed` flag lets the UI tell "saved"
from "already saved", which is the honest message on a retry.

---

## R7 — A loss can sort between a purchase and its own count  ·  Low  ·  Phase 2

**Where:** `architecture-spec.md` §3.1 `v_stock_event`.

The embedded count and its purchase share `p.created_at` as their sort anchor and are
separated by `ord_sub` 0 and 1. A loss carries its own `created_at` with `ord_sub` 0. If a
loss is ever written **in the same transaction** as a purchase, `now()` returns an
identical timestamp for both, the anchors tie, and the ordering falls through to `src_id` —
a random uuid — which can drop the loss *between* the count and the purchase.

No specified flow writes a loss and a purchase together today, so this is latent rather
than live. But `030_event_order.sql` is required to prove "a purchase-embedded count is
never separated from its purchase by a loss on the same date", and as written that claim
rests on timestamps never colliding rather than on the ordering itself.

**Fix.** Give losses `ord_sub = 2`. An exact anchor tie then puts the loss after the pair
and can never split it, and the fixture's claim becomes true by construction.

---

## R8 — `write_request` is missing from the security and migration plans  ·  Low  ·  Phase 1

§2.12 introduces the table but it appears in no migration in the §4.1 Phase 1 table, and
§2.5's "applied to every business table" does not obviously reach it. It needs: a home
(fold into `0006_security.sql`, or a `0006b`), RLS enabled, **no** direct grants to
`authenticated` (only the `security definer` RPCs touch it), and a stated retention — at
roughly 1,500 writes a year, "never pruned" is a legitimate answer, but it should be
written down rather than left as an oversight.

---

## Sequencing corrections

**Phase 0 is self-contradictory as written.** Its deliverables include "two Supabase
projects created by the owner" and "Postgres major version recorded and the local image
pinned to match" — but §7 lists that same item as blocking **Phase 3**. Phase 0 cannot
both start now and depend on it.

Resolved as: the local image is pinned now to **`supabase/postgres:17.6.1.158`** (Postgres
17, the version a Supabase project created today runs), the assumption is recorded here,
and it is re-verified against the real project when it exists. If the project turns out to
run Postgres 15, the container is recreated from the 15.x tag and the migrations replayed —
a few minutes' work, not a redesign, since nothing in the plan uses a version-specific
feature.

**Owner action item 3 (timezone) does not really block Phase 1.** The timezone is a *row
value* in `app_settings`, not a schema decision. Phase 1 ships with the
`'Africa/Casablanca'` default; the owner correcting it later is an `update`, not a
migration. Only the literal default depends on the answer.

---

## What I did not find

To be explicit about the parts I checked and accepted:

- **§2.1's corrected arithmetic is right.** Recomputed independently: window 2 overlaps
  January by 12 days, allocated 2,325.00, `goods_sold` 5,625.00, revenue 6,750.00, gross
  profit 1,125.00, coverage 19 + 12 = 31/31 = 100%.
- **§2.10's insistence that anomalous windows must not count as settled days** is correct
  and is the kind of thing that is normally missed — without it a period full of data
  errors reports full coverage while contributing no profit.
- **§2.14's rounding rule** (full precision throughout, round once at emission, totals as
  the sum of already-rounded parts) is the right trade. It means a total can differ from
  the unrounded truth by a cent or two; on screen, a column that adds up is worth more.
- **The phase order** — engine before UI, gated on a green fixture suite — is the single
  best decision in the plan and should not be softened under time pressure.
