# Aziz ERP — Architecture Specification

Technical design for the mini ERP defined in `domain-spec.md`.

Status: **draft for validation**. Open questions marked **[Q]**.

---

## 1. Constraints and consequences

| Constraint | Consequence |
|---|---|
| Must be free to run | No always-on server, no paid managed services |
| Serverless | No backend process to deploy or maintain |
| Supabase for data | Postgres + Auth + RLS as the entire backend |
| Single user, single store | No tenancy layer, but RLS still enforced |
| Grocery-store user, phone-first entry | Mobile-first UI, PWA installable |
| Reports must never drift | No stored aggregates — everything computed on read |

### 1.1 Shape

```
┌─────────────────────────────┐
│  Static SPA (React + Vite)  │   Cloudflare Pages / Vercel — free, global CDN
│  supabase-js in the browser │
└──────────────┬──────────────┘
               │ HTTPS (PostgREST + GoTrue)
┌──────────────▼──────────────┐
│         Supabase            │   free tier
│  ┌───────────────────────┐  │
│  │ Auth (GoTrue)         │  │   email + password, one account
│  ├───────────────────────┤  │
│  │ Postgres              │  │
│  │  · tables + RLS       │  │   RLS is the security boundary
│  │  · views              │  │   event timeline, count windows
│  │  · RPC functions      │  │   ALL reporting logic lives here
│  │  · triggers           │  │   audit log
│  └───────────────────────┘  │
└─────────────────────────────┘
```

**No API layer, no edge functions, no server code.** The browser talks directly
to Postgres via PostgREST. This is what makes it genuinely free and
zero-maintenance.

### 1.2 The central architectural decision: logic lives in Postgres

All computation from `domain-spec.md` §6 — event ordering, count windows,
allocation, markup application, the profit chain — is implemented as **SQL views
and functions**, not TypeScript.

**Why:**
- The client is untrusted and replaceable; the database is the source of truth.
- One implementation, not one per client. A future mobile app or export script
  calls the same RPC.
- Reporting is set-oriented work; SQL does it in one round trip instead of
  fetching thousands of rows to the phone.
- No stored aggregates means no cache invalidation and no drift when history is
  edited.

**Cost:** logic in SQL is harder to unit-test and harder to debug than
TypeScript. Mitigated by pgTAP tests on the reporting functions (§7).

The React app therefore contains **no accounting arithmetic whatsoever** — it
renders what the RPC returns. Any temptation to "just compute the total on the
client" is a spec violation.

---

## 2. Data model

### 2.1 Conventions

- `numeric(14,2)` for money. Never `float`.
- `occurred_on date` — business date. `created_at timestamptz` — audit time.
- Every table has `id uuid primary key default gen_random_uuid()`.
- Soft deactivation (`active boolean`) for reference data; hard delete only for
  transactions, and always audited.

### 2.2 Reference tables

```sql
create table article_category (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- Versioned markup. Never updated in place; a change inserts a new row.
create table markup_rate (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references article_category(id) on delete cascade,
  markup_pct      numeric(6,2) not null check (markup_pct >= 0),
  effective_from  date not null,
  created_at      timestamptz not null default now(),
  unique (category_id, effective_from)
);

create type charge_nature as enum ('operating', 'owner_draw');

create table charge_category (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  nature      charge_nature not null default 'operating',
  is_system   boolean not null default false,   -- seeded; cannot be deleted
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table app_settings (
  id            int primary key default 1 check (id = 1),   -- singleton
  currency_code text not null default 'MAD',
  locale        text not null default 'fr',
  store_name    text not null default 'Aziz',
  updated_at    timestamptz not null default now()
);
```

### 2.3 Transaction tables

```sql
create type count_source as enum ('standalone', 'purchase');

create table stock_count (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references article_category(id),
  occurred_on   date not null check (occurred_on <= current_date),
  value_at_cost numeric(14,2) not null check (value_at_cost >= 0),
  source        count_source not null,
  note          text,
  created_at    timestamptz not null default now()
);

create table purchase (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references article_category(id),
  occurred_on    date not null check (occurred_on <= current_date),
  amount_at_cost numeric(14,2) not null check (amount_at_cost > 0),
  -- The mandatory "what was left before this delivery?" count.
  prior_count_id uuid not null unique references stock_count(id) on delete restrict,
  note           text,
  created_at     timestamptz not null default now()
);

create type loss_reason as enum (
  'spoiled', 'broken', 'stolen', 'given_away',
  'family_taken', 'personal_use', 'other'
);

create table stock_loss (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references article_category(id),
  occurred_on    date not null check (occurred_on <= current_date),
  amount_at_cost numeric(14,2) not null check (amount_at_cost > 0),
  reason         loss_reason not null default 'other',
  note           text,
  created_at     timestamptz not null default now()
);

create table charge (
  id                 uuid primary key default gen_random_uuid(),
  charge_category_id uuid not null references charge_category(id),
  occurred_on        date not null check (occurred_on <= current_date),
  amount             numeric(14,2) not null check (amount > 0),
  note               text,
  created_at         timestamptz not null default now()
);

-- Reserved. No UI in v1. See domain-spec §9.3.
create table takings (
  id          uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  amount      numeric(14,2) not null check (amount >= 0),
  note        text,
  created_at  timestamptz not null default now()
);
```

Indexes: `(category_id, occurred_on)` on `stock_count`, `purchase`, `stock_loss`;
`(occurred_on)` on `charge`; `(category_id, effective_from desc)` on `markup_rate`.

**Loss reason → nature** is a pure function, implemented as an immutable SQL
function rather than a stored column so reclassification is a one-line change:

```sql
create function loss_nature(r loss_reason) returns charge_nature
language sql immutable as $$
  select case when r in ('family_taken','personal_use')
              then 'owner_draw'::charge_nature
              else 'shrinkage_placeholder' end
$$;
```

> **[Q7]** `shrinkage` is not a `charge_nature` value. Either add a third enum
> value `shrinkage`, or use a separate `loss_nature` enum
> (`shrinkage | owner_draw`). Recommendation: **separate enum**, since charges
> and losses are different domains that happen to share one distinction.

### 2.4 Audit log

```sql
create table audit_log (
  id         bigserial primary key,
  table_name text not null,
  row_id     uuid not null,
  operation  text not null check (operation in ('INSERT','UPDATE','DELETE')),
  before     jsonb,
  after      jsonb,
  actor      uuid,                    -- auth.uid()
  at         timestamptz not null default now()
);
```

One generic `AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW` trigger function
attached to `purchase`, `stock_count`, `stock_loss`, `charge` and `markup_rate`.
Append-only: no update or delete grants to any role.

### 2.5 Referential integrity between purchase and its count

A purchase **cannot exist without its count** (`prior_count_id NOT NULL`), and
the count cannot be deleted while the purchase references it (`ON DELETE
RESTRICT`). Deleting a purchase must cascade to its embedded count — handled by
an `AFTER DELETE` trigger on `purchase` that removes the linked
`stock_count` row when `source = 'purchase'`.

Both are written in one transaction via the `record_purchase` RPC (§4.1), never
by two separate client calls.

---

## 3. Reporting layer

### 3.1 The event timeline view

Implements the ordering rule of `domain-spec.md` §3.4. This is the foundation
every other computation stands on.

```sql
create view v_stock_event as
-- Counts embedded in a purchase: ordered immediately before their purchase,
-- anchored on the purchase's created_at.
select sc.category_id, sc.occurred_on,
       0 as ord_group, p.created_at as ord_anchor, 0 as ord_sub,
       'count'::text as kind, sc.value_at_cost as amount, sc.id as src_id
from stock_count sc
join purchase p on p.prior_count_id = sc.id
where sc.source = 'purchase'

union all
select p.category_id, p.occurred_on,
       0, p.created_at, 1,
       'purchase', p.amount_at_cost, p.id
from purchase p

union all
select l.category_id, l.occurred_on,
       0, l.created_at, 0,
       'loss', l.amount_at_cost, l.id
from stock_loss l

union all
-- Standalone counts: ordered after everything else on the same date.
select sc.category_id, sc.occurred_on,
       1, sc.created_at, 0,
       'count', sc.value_at_cost, sc.id
from stock_count sc
where sc.source = 'standalone';
```

A ranked view assigns a strict per-category sequence:

```sql
create view v_stock_event_ranked as
select *,
       row_number() over (
         partition by category_id
         order by occurred_on, ord_group, ord_anchor, ord_sub, src_id
       ) as evt_rank
from v_stock_event;
```

### 3.2 Count windows view

```sql
create view v_count_window as
with counts as (
  select category_id, occurred_on, amount as value_at_cost, evt_rank,
         lead(occurred_on) over w as close_on,
         lead(amount)      over w as close_value,
         lead(evt_rank)    over w as close_rank
  from v_stock_event_ranked
  where kind = 'count'
  window w as (partition by category_id order by evt_rank)
)
select c.category_id,
       c.occurred_on  as open_on,
       c.close_on,
       c.value_at_cost as open_value,
       c.close_value,
       greatest((c.close_on - c.occurred_on), 1) as window_days,
       coalesce(inflow.amt, 0)  as inflow,
       coalesce(losses.amt, 0)  as losses,
       (c.value_at_cost + coalesce(inflow.amt,0) - c.close_value) as outflow,
       (c.value_at_cost + coalesce(inflow.amt,0) - c.close_value
          - coalesce(losses.amt,0)) as goods_sold_at_cost
from counts c
left join lateral (
  select sum(amount) amt from v_stock_event_ranked e
  where e.category_id = c.category_id and e.kind = 'purchase'
    and e.evt_rank > c.evt_rank and e.evt_rank < c.close_rank
) inflow on true
left join lateral (
  select sum(amount) amt from v_stock_event_ranked e
  where e.category_id = c.category_id and e.kind = 'loss'
    and e.evt_rank > c.evt_rank and e.evt_rank < c.close_rank
) losses on true
where c.close_rank is not null;      -- open tail excluded by construction
```

The final `where` clause is what implements the **"never extrapolate past the
last count"** rule of domain-spec §6.4 — the trailing span simply produces no
window, so it can contribute no profit.

### 3.3 Markup resolution

```sql
create function markup_at(p_category uuid, p_date date)
returns numeric language sql stable as $$
  select markup_pct from markup_rate
  where category_id = p_category and effective_from <= p_date
  order by effective_from desc limit 1
$$;
```

Applied at each window's **open date**, per domain-spec §6.3.

### 3.4 The reporting RPC

One function is the dashboard's entire data source:

```sql
create function report_period(p_from date, p_to date)
returns jsonb language plpgsql stable security invoker as $$ ... $$;
```

Returns a single JSON document:

```jsonc
{
  "period": { "from": "2026-01-01", "to": "2026-01-31", "days": 31 },

  "measured": {
    "purchases_total":     11500.00,
    "operating_charges":    3400.00,
    "owner_draws_cash":     1800.00,
    "shrinkage_losses":      740.00,
    "owner_draws_in_kind":   300.00,
    "cash_out":            16700.00
  },

  "modelled": {
    "goods_sold_at_cost":  10431.25,
    "revenue_est":         12517.50,
    "gross_profit_est":     2086.25,
    "operating_profit_est": -2053.75,
    "net_cash_change_est":  -4153.75,
    "cost_incurred":       14571.25
  },

  "coverage": {
    "pct": 87.4,
    "level": "partial",
    "categories_never_counted": ["Frozen"],
    "categories_stale":         [{ "name": "Tobacco", "days": 47 }],
    "unsettled_purchases":      1400.00,
    "anomalies": [
      { "category": "Dairy", "open_on": "2026-01-12",
        "close_on": "2026-01-28", "goods_sold_at_cost": -150.00 }
    ]
  },

  "by_category": [
    { "category_id": "…", "name": "Beverages",
      "last_count_value": 3200.00, "last_count_on": "2026-01-20",
      "days_since_count": 11, "purchases_in_period": 5500.00,
      "losses_in_period": 200.00, "markup_pct": 20.00,
      "goods_sold_at_cost": 5431.25, "revenue_est": 6517.50,
      "gross_profit_est": 1086.25, "coverage_pct": 100.0,
      "unsettled_purchases": 0.00 }
  ],

  "charges_by_category": [
    { "name": "Rent", "nature": "operating", "amount": 2000.00 }
  ],

  "stock_on_hand": {
    "total_last_counted": 14200.00,
    "oldest_count_on": "2025-12-28",
    "max_possible": 15600.00
  }
}
```

Companion RPC `report_trend(p_months int)` returns the 12-month series for the
trend chart, computed by the same primitives.

**Anomalies are surfaced, never clamped.** A window with negative
`goods_sold_at_cost` is excluded from the profit chain and listed under
`coverage.anomalies` so the user can fix the underlying data.

---

## 4. Write path

### 4.1 Transactional RPCs

Two writes must be atomic and are exposed as functions rather than table inserts:

```sql
-- Writes the count and the purchase together. Neither can exist alone.
create function record_purchase(
  p_category uuid, p_date date,
  p_amount numeric, p_prior_stock numeric, p_note text
) returns uuid ...

-- Writes one count per category in a single transaction (month-end sweep).
create function record_count_sweep(
  p_date date, p_counts jsonb   -- [{category_id, value_at_cost}, …]
) returns int ...
```

Charges, losses and single counts are ordinary PostgREST inserts — they have no
multi-row invariant.

### 4.2 Security

RLS is enabled on **every** table. Because v1 is single-user, policies are:

```sql
alter table purchase enable row level security;
create policy authed on purchase for all
  to authenticated using (true) with check (true);
```

The `anon` role receives no grants on any business table. RLS is enabled even
though there is one user, so that adding a `store_id` or a role column later is
a policy change, not a security retrofit.

`audit_log` grants `INSERT` to the trigger function only (`security definer`),
and `SELECT` to authenticated. No `UPDATE`/`DELETE` grants exist.

**[Q8]** Should staff-vs-owner roles be added now? The domain spec says single
login. Adding a `role` claim later is straightforward given RLS is already on;
recommendation is to defer.

---

## 5. Frontend

### 5.1 Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | React 19 + TypeScript | Ubiquitous, well-supported |
| Build | Vite | Fast, static output, zero config |
| Styling | Tailwind CSS | No stylesheet maintenance |
| Components | shadcn/ui (Radix) | Accessible primitives, owned source |
| Server state | TanStack Query | Caching, invalidation, retries |
| Forms | React Hook Form + Zod | Zod schemas shared with API types |
| Charts | Recharts | Small, declarative, fits the four charts needed |
| Dates | date-fns | Tree-shakeable, locale-aware |
| Data access | supabase-js v2 | Direct PostgREST + Auth |
| i18n | i18next | fr default, ar/en addable |
| Routing | React Router | Four routes |

No state management library. TanStack Query holds server state; React holds the
rest.

### 5.2 Routes

```
/login              email + password
/                   Dashboard (global information)
/purchases          Purchase entry + recent list
/charges            Charge entry + recent list
/counts             Stock count — single and sweep modes
/losses             Loss entry + recent list
/settings           Categories, markups, charge natures, currency, locale
```

Bottom tab bar on mobile, sidebar on desktop.

### 5.3 Mobile-first entry

The person entering data is standing in a shop with a phone. Therefore:

- Numeric inputs use `inputmode="decimal"` and render a large custom keypad.
- Category selection is a full-screen picker with large tap targets, ordered by
  recent use.
- Date defaults to today with one-tap "yesterday"; the picker is secondary.
- The purchase flow is two screens: *amount + category* → *previous stock
  question* → done. No scrolling forms.
- Every submit gives immediate optimistic feedback and is idempotent on retry.

### 5.4 Rendering measured vs modelled

Domain-spec §7.2 is enforced by a single shared component:

```tsx
<Money value={x} kind="measured" />   // plain
<Money value={x} kind="modelled" />   // "≈" prefix, distinct tint, tooltip
```

Raw number formatting anywhere else in the codebase is a review failure. This is
the mechanism that keeps model output from being mistaken for fact.

### 5.5 Type safety

`supabase gen types typescript` generates database types into
`src/types/database.ts`, committed and regenerated on every migration. The
`report_period` JSON shape is additionally described by a hand-written Zod schema
and parsed at the boundary, so a schema drift fails loudly at runtime rather
than rendering `undefined`.

### 5.6 PWA

`vite-plugin-pwa` with a manifest and an app-shell service worker: installable
to the home screen, shell cached for instant launch.

**Offline writes are out of scope for v1.** A write queue with conflict handling
is real complexity, and the model tolerates backdating — a user who loses signal
can enter yesterday's purchase today with the correct date. Revisit if the store
turns out to have poor connectivity.

**[Q9]** Is connectivity in the shop reliable enough for online-only writes?

---

## 6. Deployment and cost

### 6.1 Environments

| | Hosting | Supabase |
|---|---|---|
| Local | `vite dev` | Supabase CLI, local Postgres in Docker |
| Production | Cloudflare Pages | Supabase free project |

Cloudflare Pages over Vercel: unlimited bandwidth on free tier, no commercial-use
ambiguity. Either works — the build output is a static bundle.

### 6.2 Cost: zero

| Resource | Free tier | Expected usage |
|---|---|---|
| Supabase database | 500 MB | < 5 MB after a decade |
| Supabase auth | 50,000 MAU | 1 |
| Supabase bandwidth | 5 GB/mo | negligible |
| Cloudflare Pages | unlimited requests | negligible |
| Cloudflare builds | 500/mo | a few |

Data volume is genuinely tiny: roughly 1,500 rows per year across all tables.

### 6.3 The one real free-tier risk

**Supabase pauses free projects after 7 days of inactivity.** A store that goes
quiet for a week comes back to a paused database and a confusing error.

Mitigations, in order of preference:
1. A GitHub Actions cron (free) issuing a trivial query every 3 days.
2. Document the one-click unpause in the Supabase dashboard.
3. Upgrade to Pro if the store ever depends on it operationally.

Option 1 is specified as part of the build.

### 6.4 Backups

Free-tier Supabase backups are limited. Specified: a GitHub Actions weekly job
running `pg_dump` and committing the encrypted dump to a private repo. The whole
database is a few megabytes, so this is trivial and removes the single worst
failure mode — losing the store's entire financial history.

### 6.5 Migrations

Supabase CLI migrations in `supabase/migrations/`, applied via
`supabase db push` from CI on merge to `main`. Schema changes are never made by
hand in the dashboard.

---

## 7. Testing

| Layer | Tool | Scope |
|---|---|---|
| SQL reporting | **pgTAP** | The critical layer. Fixture ledgers with known answers, asserted against `report_period`. Must cover: the domain-spec §10 worked example; empty categories; a single count; counts out of order on one date; a purchase and standalone count on the same date; negative-outflow anomaly; unsettled tail; period fully before the first count; markup change mid-window |
| RLS | pgTAP | `anon` can read nothing |
| Components | Vitest + Testing Library | `<Money>` rendering, form validation |
| Flows | Playwright | Purchase-with-count round trip; month-end sweep |

The SQL tests matter most: they protect the arithmetic the store's decisions rest
on. A wrong number here is worse than a crash, because nobody notices.

---

## 8. Repository layout

```
Aziz_Erp/
├── docs/
│   ├── domain-spec.md
│   └── architecture-spec.md
├── supabase/
│   ├── migrations/          # ordered SQL migrations
│   ├── seed.sql             # categories, markups, charge categories, settings
│   └── tests/               # pgTAP
├── src/
│   ├── lib/supabase.ts
│   ├── types/database.ts    # generated
│   ├── api/                 # one hook per RPC / table
│   ├── components/          # Money, CategoryPicker, NumericKeypad, …
│   ├── features/
│   │   ├── dashboard/
│   │   ├── purchases/
│   │   ├── charges/
│   │   ├── counts/
│   │   ├── losses/
│   │   └── settings/
│   ├── i18n/
│   └── App.tsx
├── .github/workflows/       # deploy, keepalive, backup
└── e2e/
```

---

## 9. Build phases

Sequencing only — the detailed plan follows spec validation.

1. **Foundation** — Supabase project, migrations, seed, RLS, generated types.
2. **Reporting engine** — views, `markup_at`, `report_period`, pgTAP suite.
   *Built and tested before any UI exists.*
3. **Shell** — auth, routing, layout, `<Money>`, i18n scaffold.
4. **Entry screens** — purchases (with the count question), charges, counts,
   losses.
5. **Dashboard** — KPIs, waterfall, category table, charges breakdown, trend,
   data quality panel.
6. **Settings** — categories, versioned markups, charge natures, currency.
7. **Hardening** — PWA, deploy pipeline, keepalive, backup, e2e.

Phase 2 before phase 3 is deliberate: the reporting engine is where the risk is,
and it is fully testable without a UI.

---

## 10. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| **Q7** | Separate `loss_nature` enum, or extend `charge_nature`? | Separate enum |
| **Q8** | Add owner/staff roles now, or defer? | Defer |
| **Q9** | Is shop connectivity reliable enough for online-only writes? | Assume yes |
| **Q10** | Cloudflare Pages or Vercel? | Cloudflare Pages |
| **Q11** | Is a private GitHub repo available for encrypted backups? | Assume yes |

Plus **Q1–Q6** in `domain-spec.md` §11.
