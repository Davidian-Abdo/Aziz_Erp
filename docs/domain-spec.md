# Aziz ERP — Domain Specification

Mini ERP for a single grocery store. Defines the business logic, data meaning,
and every computation the application performs.

Status: **draft for validation**. Open questions are marked **[Q]**.
Companion document: `architecture-spec.md`.

---

## 1. Core accounting model

### 1.1 What this system is

A **periodic inventory system, at category level, valued at buying price.**

The store does not scan barcodes, does not maintain a product catalogue, and does
not record individual sales. Instead:

- Goods are tracked in **money at cost**, never in units.
- Goods are grouped into a small number of **article categories**.
- Stock is established by **counting events**, not by running a per-item ledger.
- The cost of goods that left the shelves is **inferred** between two counts.
- Sales revenue is **modelled** from a per-category markup, not measured.

Everything else in this document follows from that model.

### 1.2 The fundamental identity

For one article category, between two consecutive stock counts:

```
outflow_at_cost = opening_stock + purchases − closing_stock
```

Where all four terms are money at **buying price**. This is the only way the
system learns that goods moved. Nothing else observes it.

Outflow is then split into the two ways goods can leave:

```
outflow_at_cost = goods_sold_at_cost + declared_losses_at_cost
```

`declared_losses` is what the user explicitly recorded (spoiled, stolen, taken
home). Everything not declared is assumed sold.

### 1.3 Revenue model

Revenue is not observed. It is derived by applying a **markup on cost**:

```
markup_pct = 20            means      selling price = 1.20 × cost
multiplier = 1 + markup_pct/100

revenue_est      = goods_sold_at_cost × multiplier
gross_profit_est = goods_sold_at_cost × (multiplier − 1)
```

> **Convention, fixed:** the percentage is **markup on cost**, not margin on
> sale. 20% on a good bought at 100 means it sells for 120 and yields 20 of
> profit. It does **not** mean 20% of the selling price.
>
> The settings screen must state this in plain language next to the input, with
> a live worked example ("buy at 100 → sell at 120"), because the two readings
> differ by 25% on the profit figure and shopkeepers use both phrasings.

**Rule (most likely implementation bug):** the multiplier applies to
`goods_sold_at_cost`, **never** to `purchases`. Goods sitting in the stockroom
have earned nothing.

### 1.4 What this model cannot do

Stated plainly, because the UI must not hide it:

1. **Every revenue and profit figure is an estimate.** It is a model output. If
   the real markup differs from the configured one, or varies by product within
   a category, the estimate drifts and nothing detects it.
2. **Undeclared stock loss becomes phantom profit.** Anything that vanishes
   without being recorded as a loss is treated as sold at full markup. The loss
   entry (§4) is the only defence.
3. **Stock is only truly known at count moments.** Between counts, on-hand value
   is unknown, not merely stale.
4. **Nothing can be attributed after the last count.** Purchases made after the
   most recent count are recorded, but the goods they bought have no known fate
   until the next count.

Design consequences, binding on the UI:

- Modelled figures are visually distinguished from measured ones (§7.2).
- Every period report carries a **data-coverage** indicator (§6.5).
- The dashboard never extrapolates past the last count (§6.4).

---

## 2. Article categories & markup

### 2.1 Article category

An article category is a bucket of goods bought and sold together, sharing one
markup. It is the unit of stock, purchasing, counting, loss and margin.

| Field | Meaning |
|---|---|
| `name` | Display name, unique |
| `active` | Inactive categories are hidden from entry forms but retained in history |
| `sort_order` | Display order in forms and tables |

Users can create, rename, reorder and deactivate categories. Categories are
**never hard-deleted** once they carry history — deactivation only.

### 2.2 Seed categories

Seeded on first run, all fully editable:

Beverages · Dairy · Dry goods (rice, pasta, flour, sugar, oil) · Canned &
preserved · Fruits & vegetables · Bread & pastry · Confectionery & snacks ·
Cleaning products · Hygiene & cosmetics · Frozen · Tobacco · Other

### 2.3 Markup rates are versioned

Markup is **not** a mutable column on the category. It is a time-series:

```
markup_rate(category_id, markup_pct, effective_from)
```

- Every category is seeded at **20%**, effective from the category's creation date.
- Editing a markup **inserts a new row** effective from a date the user picks
  (defaulting to today). It never updates the old row.
- The rate in force for any date is the row with the greatest `effective_from`
  that is `<= date`.

**Why:** without this, editing a percentage today retroactively rewrites every
past report. A March profit figure must not change because a June price changed.

**UI:** the settings screen shows one editable number per category — identical in
feel to a plain field. Versioning is invisible unless the user opens "rate
history". Changing a rate warns: *"applies from {date} forward; earlier reports
keep the old rate."*

**[Q1]** Should editing a markup default `effective_from` to *today*, or to the
*start of the current month*? Today is more literal; start-of-month avoids
splitting the current month across two rates.

---

## 3. Stock counts

### 3.1 Definition

A **stock count** is a declaration: *"on date D, category C held V of goods,
valued at buying price."* It is the only measurement of stock in the system.

| Field | Meaning |
|---|---|
| `category_id` | Category counted |
| `occurred_on` | Date of the physical count |
| `value_at_cost` | Money at buying price, `>= 0`. Zero means empty |
| `source` | `standalone` or `purchase` |
| `purchase_id` | Set when `source = purchase` |
| `note` | Optional free text |

### 3.2 Two ways a count is created

**A. Embedded in a purchase (the primary path).**
When recording a purchase, before submitting, the form asks:

> *Before this delivery, was the previous stock of {category} finished, or is
> some left?*
> — `Finished (empty)` → records a count of 0
> — `Some remains` → numeric input: *"how much is left, at buying price?"*

This is **required**. It is the mechanism that keeps the timeline settled. The
count it produces is timestamped **immediately before** the purchase it belongs
to (see §3.4).

**B. Standalone count (any date, no purchase).**
A dedicated screen to count one category or sweep all of them in a single pass.
Needed for:
- Month-end closing, so period reports land on real boundaries.
- Slow-moving categories that are rarely repurchased and would otherwise go
  uncounted for months.

### 3.3 Count freshness

Every category carries `days_since_last_count`. The dashboard surfaces:
- **Fresh** (≤ 14 days) — normal
- **Ageing** (15–30 days) — soft notice
- **Stale** (> 30 days) — prominent warning; this category's contribution to the
  current period is unsettled

### 3.4 Event ordering rule

Multiple events can share one date. Ordering is deterministic and binding:

1. Order by `occurred_on` ascending.
2. Within a date: a **purchase-embedded count** is ordered **immediately before**
   its own purchase (it describes the shelf *before* the delivery arrived).
3. Within a date: a **standalone count** is ordered **after** all purchases and
   losses of that same date (a physical count reflects everything that already
   happened that day).
4. Remaining ties break by `created_at`, then `id`.

This rule must be implemented explicitly, not left to insertion order.

---

## 4. Stock losses

### 4.1 Purpose

Records goods that left without being sold. Optional, but without it every loss
is silently reported as profit.

| Field | Meaning |
|---|---|
| `category_id` | Category affected |
| `occurred_on` | Date |
| `amount_at_cost` | Money at buying price, `> 0` |
| `reason` | See §4.2 |
| `note` | Optional |

### 4.2 Reasons and their nature

| Reason | Nature | Meaning |
|---|---|---|
| Spoiled / expired | `shrinkage` | Genuine business loss |
| Broken / damaged | `shrinkage` | Genuine business loss |
| Stolen | `shrinkage` | Genuine business loss |
| Given away / promotional | `shrinkage` | Business chose to give it |
| **Taken by family** | `owner_draw` | Owner removing value, not a business cost |
| **Personal consumption** | `owner_draw` | Owner removing value, not a business cost |
| Other | `shrinkage` | Default |

The `shrinkage` / `owner_draw` split mirrors the same distinction on charges
(§5.2) and drives two separate dashboard lines. *"The store lost 740"* and
*"I took 300 home"* are different facts and must never be summed into one number.

### 4.3 Optional prompt at count time

The standalone count form offers a skippable follow-up: *"Anything spoiled,
broken or taken since the last count?"* — asked at the moment the user is
physically looking at the shelves and most likely to remember. Skipping is one
tap and carries no penalty.

---

## 5. Charges

### 5.1 Definition

Money spent that is **not** the purchase of resale stock.

| Field | Meaning |
|---|---|
| `charge_category_id` | Spending category |
| `occurred_on` | Date |
| `amount` | Money, `> 0` |
| `note` | Optional |

Entry is free-form by date — the user records a charge whenever it happens, or
backdates it. There is no forced periodicity.

### 5.2 Charge categories and their nature

Every charge category carries `nature ∈ {operating, owner_draw}`:

- **`operating`** — a cost of running the store. Subtracted to reach operating
  profit. Answers *"is the business healthy?"*
- **`owner_draw`** — the owner taking money out. **Not** a business cost.
  Subtracted only after operating profit. Answers *"did my wallet grow?"*

Seeded categories:

| Category | Nature | System |
|---|---|---|
| Worker cost / salaries | `operating` | ✔ |
| Rent | `operating` | ✔ |
| Electricity & water | `operating` | ✔ |
| Transport & delivery | `operating` | ✔ |
| Taxes & licences | `operating` | ✔ |
| Maintenance & repairs | `operating` | ✔ |
| Phone & internet | `operating` | ✔ |
| Packaging & supplies | `operating` | ✔ |
| **Personal spending** | `owner_draw` | ✔ |
| **Family spending** | `owner_draw` | ✔ |
| **Special event spending** | `owner_draw` | ✔ |
| Other | `operating` | ✔ |

Users may add their own categories and must choose a nature, with the choice
explained in plain language at the point of creation. `nature` is editable on
any category, including seeded ones.

System categories cannot be deleted, only deactivated.

**[Q2]** *Special event spending* is defaulted to `owner_draw`, read as
weddings / Aid / family occasions. If it means shop promotions or store events,
it should be `operating`. Confirm.

---

## 6. The computation engine

This section is normative. It defines exactly what the dashboard shows for a
requested date interval `[A, B]`.

### 6.1 Measured quantities (exact, no inference)

Summed directly from records with `occurred_on BETWEEN A AND B`:

```
purchases_total        = Σ purchase.amount_at_cost
operating_charges      = Σ charge.amount        where nature = 'operating'
owner_draws_cash       = Σ charge.amount        where nature = 'owner_draw'
shrinkage_losses       = Σ loss.amount_at_cost  where nature = 'shrinkage'
owner_draws_in_kind    = Σ loss.amount_at_cost  where nature = 'owner_draw'

cash_out = purchases_total + operating_charges + owner_draws_cash
```

These are facts. They are never estimated and never labelled as estimates.

### 6.2 Count windows

For each category, take its counts ordered per §3.4: `C₀ … Cₙ` at dates
`t₀ … tₙ` with values `V₀ … Vₙ`.

Each consecutive pair forms a **count window** `Wₖ = [tₖ, tₖ₊₁]`:

```
inflowₖ   = Σ purchases with tₖ < event_order ≤ tₖ₊₁
lossesₖ   = Σ losses    with tₖ < event_order ≤ tₖ₊₁

outflowₖ      = Vₖ + inflowₖ − Vₖ₊₁
goods_soldₖ   = outflowₖ − lossesₖ
```

Boundaries use the §3.4 event ordering, not raw dates.

**Anomaly:** `goods_soldₖ < 0` means the closing count exceeds what could
possibly be present — a data error (mistyped count, missing purchase, wrong
date). The window is flagged, excluded from profit, and surfaced in the data
quality panel (§6.5). It is never silently clamped to zero.

### 6.3 Allocating a window to a requested period

A count window rarely aligns with the requested `[A, B]`. Allocation is
**straight-line by days**:

```
overlap_days = days( [tₖ, tₖ₊₁] ∩ [A, B] )
window_days  = days( [tₖ, tₖ₊₁] )                    (minimum 1)

allocated_goods_sold = goods_soldₖ × overlap_days / window_days
```

This is an **allocation**, not a measurement — the dashboard says so. Consumption
is assumed even across the window, which is wrong for seasonal or bursty
categories but is the standard, defensible approximation.

The markup applied is the rate in force at `tₖ` (§2.3). A window spanning a rate
change uses the rate at its start.

**[Q3]** Alternative: instead of prorating, **snap** `[A, B]` outward to the
nearest enclosing counts and report the true window, displaying the effective
period. More truthful, but the reported period stops matching the one requested.
Prorating is the default; snapping could be a toggle. Preference?

### 6.4 The unsettled tail

If `B` falls after a category's **last count** `tₙ`, the span `(tₙ, B]` is
**unsettled**. Purchases in it are real and counted in `cash_out`, but the fate
of those goods is unknown.

**Binding rule: the system never extrapolates past the last count.** No COGS, no
revenue, no profit is attributed to an unsettled span. It is reported separately:

> *"Beverages: 1,400 purchased since the last count (12 June). Count this
> category to settle it."*

The same applies to a head span `[A, t₀)` before a category's first count.

### 6.5 Data coverage

Per period, per category and overall:

```
coverage_pct = settled_days_in_period / total_days_in_period × 100
```

Where settled days are those falling inside a count window. Displayed as a
percentage with a plain-language reading:

- **≥ 90%** — "Good coverage"
- **60–89%** — "Partial — some categories need counting"
- **< 60%** — "Low — these figures are largely unsettled"

The data quality panel lists: categories never counted, categories stale > 30
days, unsettled purchase totals, and negative-outflow anomalies.

### 6.6 The profit chain

```
goods_sold_at_cost   = Σ over categories of allocated goods sold          [modelled]
revenue_est          = Σ goods_soldᶜ × multiplierᶜ                        [modelled]
gross_profit_est     = Σ goods_soldᶜ × (multiplierᶜ − 1)                  [modelled]

operating_profit_est = gross_profit_est
                       − operating_charges                               [measured]
                       − shrinkage_losses                                [measured]

net_cash_change_est  = operating_profit_est
                       − owner_draws_cash                                [measured]
                       − owner_draws_in_kind                             [measured]
```

No double counting: outflow splits into `goods_sold` (which generates margin)
and `losses` (subtracted at cost as their own line).

### 6.7 The two meanings of "spent"

Both are shown, side by side, never merged:

| Figure | Formula | Answers |
|---|---|---|
| **Cash out** | `purchases + all charges` | What left my wallet |
| **Cost incurred** | `goods_sold_at_cost + operating_charges + shrinkage` | What the period actually consumed |

They differ by the change in stock value. A month of heavy restocking looks
alarming on cash out and healthy on cost incurred. Profit derives from the
second; solvency from the first. Showing only one misleads.

### 6.8 Stock on hand

Stock "today" is not directly knowable. Reported as:

```
last_count_value     at last_count_date                     [measured]
+ purchases since last count                                [measured]
− declared losses since last count                          [measured]
= maximum_possible_on_hand                                  [upper bound]
```

Presented as: *"Counted 3,200 on 12 June. Bought 1,400 since, 0 lost. At most
4,600 on hand — 19 days since last count."* The primary figure is the counted
one; the bound is secondary and explicitly labelled as an upper bound.

Store-wide stock value is the sum of last-count values across categories, with
the **oldest** count date shown as the overall freshness.

---

## 7. Global information section (dashboard)

### 7.1 Layout

**Period selector** — presets (This month · Last month · This quarter · This
year · Custom range). Drives everything below.

**KPI row**
`≈ Revenue` · `≈ Gross profit` · `Operating charges` · `≈ Operating profit` ·
`Cash out` · `Stock on hand`

**Profit waterfall** — revenue → −cost of goods → gross → −operating charges →
−shrinkage → operating profit → −owner draws → net cash change.

**Stock by category** — table: category · last count value · count date ·
freshness · purchased since · markup · allocated goods sold · est. gross profit.

**Charges breakdown** — by category, operating and owner draws visually separated.

**Trend** — monthly gross profit, cash out and charges over the trailing 12
months.

**Data quality panel** — coverage %, categories needing a count, unsettled
purchases, anomalies. Always visible, never collapsed away when problems exist.

### 7.2 Measured vs modelled — a binding UI rule

Every figure on screen is one of two kinds and must be unambiguous:

- **Measured** — purchases, charges, losses, count values, cash out. Plain
  styling.
- **Modelled** — revenue, gross profit, operating profit, net cash change,
  allocated goods sold. Prefixed `≈`, rendered in a distinct tint, and carrying
  a tooltip: *"Estimated from a {n}% markup on {amount} of goods sold."*

The owner must never be able to mistake a model output for a measurement. This
rule is not cosmetic; it is the honesty mechanism that makes the markup approach
acceptable.

---

## 8. Input sections

### 8.1 Purchase entry

Fields: category · date (defaults today) · amount at buying price · optional note.

On submit, before writing: the stock question of §3.2A. Both records — count and
purchase — are written in a **single transaction**. A purchase never exists
without its count.

Mobile-first: large numeric keypad, category as a picker, date defaulting to
today with one-tap "yesterday".

### 8.2 Charge entry

Fields: charge category · date · amount · optional note.
Inline "add new category" (name + nature) without leaving the form.

### 8.3 Stock count entry

Two modes:
- **Single** — one category, date, value.
- **Sweep** — all active categories listed, enter a value for each, one date,
  submit as one transaction. The month-end path.

Shows each category's previous count and date alongside the input for reference.
Offers the optional loss prompt of §4.3.

### 8.4 Loss entry

Fields: category · date · amount at buying price · reason (§4.2) · optional note.

### 8.5 Universal rules

- Amounts: positive, 2 decimals, currency from settings.
- Dates: no future dates. Backdating allowed without limit.
- All records are editable and deletable; every mutation is written to an audit
  log (§9.2).
- Editing any record **recomputes reports on read** — no stored aggregates that
  could drift out of sync.

---

## 9. Cross-cutting rules

### 9.1 Money and dates

- Money stored as `numeric(14,2)`. Never floats.
- Currency is a single global setting, applied for display only. No multi-currency.
- `occurred_on` is a `date` (business date). `created_at` is a `timestamptz`
  (audit). They are never conflated.
- All reporting is inclusive of both interval endpoints.

### 9.2 Auditability

Every insert, update and delete on purchases, counts, losses, charges and markup
rates writes to an append-only audit log: table, row id, operation, before/after
snapshot, timestamp. Reports are always recomputed from current data; the log
exists to explain *why a number changed*.

### 9.3 Reserved for later — takings

The schema includes a `takings` table (date, amount, note) with **no UI in v1**.

If the owner ever begins counting the till, entering takings lets the dashboard
switch that period from modelled to measured, and surface:

```
variance = declared_takings − revenue_est
```

A persistently negative variance means goods left the shelves without matching
cash — undeclared loss, theft, or unrecorded credit sales. This is the single
most valuable figure a store like this can produce, and it costs one empty table
today versus a painful migration later.

### 9.4 Explicitly out of scope for v1

Suppliers · customer credit book · multi-store · multi-user roles · per-product
tracking · VAT/tax reporting · barcode scanning · payroll · purchase orders.

The schema should not actively obstruct these, but none are built.

---

## 10. Worked example

Beverages, markup 20%. Requested period: **1–31 January**.

Counts: 1 Jan → 2,000 · 20 Jan → 1,500 · 5 Feb → 900
Purchases: 8 Jan → 3,000 · 25 Jan → 2,500
Losses: 15 Jan → 200 (spoiled)

**Window 1 — 1 Jan to 20 Jan (19 days, fully inside period)**
```
outflow      = 2,000 + 3,000 − 1,500 = 3,500
losses       = 200
goods_sold   = 3,300
allocated    = 3,300 × 19/19 = 3,300
```

**Window 2 — 20 Jan to 5 Feb (16 days, 11 inside period)**
```
outflow      = 1,500 + 2,500 − 900 = 3,100
losses       = 0
goods_sold   = 3,100
allocated    = 3,100 × 11/16 = 2,131.25
```

**Beverages, January**
```
goods_sold_at_cost  = 5,431.25
revenue_est         ≈ 5,431.25 × 1.20 = 6,517.50
gross_profit_est    ≈ 1,086.25
shrinkage           =   200        (measured)
purchases           = 5,500        (measured)
coverage            = 100%         (31 of 31 days settled)
```

Note that **purchases (5,500) exceed goods sold (5,431)** — the store built
stock slightly. Cash out overstates the period's true cost by that difference.
This is precisely the distinction §6.7 exists to make visible.

---

## 11. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| **Q1** | Markup edits effective from *today* or *start of month*? | Today |
| **Q2** | Is "special event spending" `owner_draw` or `operating`? | `owner_draw` |
| **Q3** | Prorate partial count windows, or snap the period to real counts? | Prorate, snapping as a later toggle |
| **Q4** | UI language — French, Arabic, English? Is RTL needed? | French, LTR |
| **Q5** | Currency — MAD, DZD, TND, other? | MAD |
| **Q6** | Should the dashboard have a printable / exportable monthly summary? | Not in v1 |
