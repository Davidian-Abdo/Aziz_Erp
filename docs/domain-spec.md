# Aziz ERP — Domain Specification

Mini ERP for a single grocery store. Defines the business logic, data meaning,
and every computation the application performs.

Status: **approved for build.** Amended 2026-08-02 to match `v1.0_impl_plan.md`
§2 and the findings in `plan_review.md`; all six open questions are answered
(§11). Companion documents: `architecture-spec.md`, `v1.0_impl_plan.md`.

Where this document and the plan disagree, **the plan is normative** — and any
such disagreement is a defect to be fixed here.

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
5. **A count is only as good as the shelf the user had in mind.** A category is a
   basket; a delivery is usually one product in it. Asked *"what was left before
   this delivery?"* while holding a crate of milk, a user naturally answers for
   the milk — and the system reads it as the whole Dairy shelf, booking the
   cheese still physically present as sold at full markup. The next count then
   shows stock rising for no reason, which is flagged as an anomaly, but the
   false profit already sits in a closed month. §3.2 carries three mitigations;
   none of them eliminates this, and the UI says so rather than hiding it.

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
| `description` | Contents hint — *"lait, fromage, yaourt, beurre"*. Shown in the count question (§3.2) so the user knows which shelf is being asked about |
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

**Resolved (Q1):** editing a markup defaults `effective_from` to **today**. It is
the literal reading, and the date remains editable in the rate-history dialog for
anyone who would rather not split the current month across two rates.

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
When recording a purchase, before submitting, the form asks the stock question.
The count it produces is ordered **immediately before** the purchase it belongs
to (see §3.4).

This is the mechanism that keeps the timeline settled, and it is **required
whenever the purchase is the category's newest event** — see the backdating
exception below.

**The question must name the whole shelf, and list what is on it.** This is the
only defence against limitation 5 of §1.4, and the wording is binding:

> **Tout le rayon Produits laitiers** — lait, fromage, yaourt, beurre.
> Pas seulement ce que vous venez d'acheter.
> Combien restait-il, au prix d'achat ?
> — `Rien, le rayon était vide` → records a count of 0
> — `Il restait quelque chose` → numeric input

The contents list comes from `article_category.description` (§2.1), seeded per
category and editable in settings. How well it matches the actual shelves
directly determines how often this trap can be sprung.

**A plausibility check runs before save.** The system compares the entered value
against what could possibly be on the shelf and warns on four verdicts:

| Verdict | Condition | Reading |
|---|---|---|
| `exceeds_bound` | value > maximum possible on hand (§6.8) | more stock than could possibly be there — a purchase is missing, or the value is wrong |
| `high_outflow` | ≥ 2 settled windows exist, and implied outflow per day > 3 × the category's trailing-90-day average | an unusually large drop for the days elapsed |
| `suspicious_drop` | no history yet, value < 0.25 × bound, and fewer than 7 days since the last count | counted much lower than expected after only a few days |
| `ok` | otherwise | — |

A non-`ok` verdict shows a blocking confirmation — *"Vous avez saisi 50, mais
Produits laitiers devrait contenir environ 1 000. Est-ce correct ?"* — with
**Corriger** as the primary action. It **never prevents saving**: these are
heuristics, and the user may simply be right.

**Backdating exception.** The embedded count is required only when the purchase
is the category's newest event. A purchase dated **strictly before** the
category's last count is recorded with **no count attached**; it becomes inflow
inside whichever existing window contains it, and the form explains: *"Cet achat
est antérieur au dernier inventaire de ce rayon ; aucun comptage ne sera
enregistré."*

A purchase dated **on the same date as** the last count still carries its
embedded count. This is deliberate and not an edge case to trim: by §3.4 rule 3 a
standalone count sorts *after* all purchases of its date, so a delivery arriving
in the afternoon of a morning sweep would otherwise be ordered *before* that
sweep — dumping the whole delivery into the window that just closed and booking
it as sold at full markup on the day it arrived. Keeping the embedded count gives
the coherent order *embedded count → purchase → standalone count*.

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
4. Within a date: a **loss** sorts among purchases and embedded counts by
   `created_at`, i.e. by the order it was typed — and never *between* an embedded
   count and its own purchase, which are an indivisible pair.
5. Remaining ties break by `created_at`, then `id`.

This rule must be implemented explicitly, not left to insertion order. It yields
a strict per-category sequence, and it is that **rank**, not the date, that
defines window boundaries (§6.2).

### 3.5 Opening the books

On day one the shop is full of stock and the database is empty. Every window
needs an opening count, and nothing else in this document creates the first one.

Until onboarding completes, the app opens on a mandatory **opening sweep**: every
active category, one value each at buying price, dated today, written as
standalone counts in a single transaction. It is the §8.3 sweep screen with
different copy. **The dashboard is not reachable until it completes** — a
dashboard with no opening counts shows nothing but zeros and unsettled spans, and
would teach the owner on their first visit that the app does not work.

Categories may be deactivated during the sweep, so nobody is forced to invent a
number for a shelf they do not stock. Completion is recorded once
(`app_settings.onboarded_at`) and the gate never appears again.

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

**Resolved (Q2):** *Special event spending* is **`owner_draw`**, read as
weddings / Aid / family occasions. If the owner later means shop promotions by
it, `nature` is editable on any category — including this one — so the correction
costs nothing.

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

Boundaries are **rank-exclusive at both ends**. Writing `rₖ` for the event rank
of count `Cₖ`, window `Wₖ` contains exactly the events with:

```
rₖ < evt_rank < rₖ₊₁
```

The event at `rₖ₊₁` *is* the closing count and belongs to no window's interior.
Only ranks are normative here — any date-based phrasing of this rule is wrong,
because several events can share one date.

```
inflowₖ   = Σ purchases with rₖ < evt_rank < rₖ₊₁
lossesₖ   = Σ losses    with rₖ < evt_rank < rₖ₊₁

outflowₖ      = Vₖ + inflowₖ − Vₖ₊₁
goods_soldₖ   = outflowₖ − lossesₖ
```

**Anomalies.** There are three kinds, with different causes and different fixes.
A window matching any of them is **flagged, excluded from the profit chain, and
its days do not count as settled** (§6.5). None is ever silently clamped to zero.

| Kind | Condition | What it means |
|---|---|---|
| `negative_outflow` | `outflowₖ < 0` | the closing count exceeds opening plus purchases — a mistyped count, a missing purchase, or a wrong date |
| `losses_exceed_outflow` | `outflowₖ ≥ 0` and `goods_soldₖ < 0` | declared losses exceed everything that left the shelf — a double-entered or overstated loss |
| `no_markup` | the category has no `markup_rate` row at all | nothing to value the sale with; see §2.3 |

Excluding an anomalous window from settled days is essential and easy to miss:
without it, a period full of data errors reports full coverage while contributing
no profit — exactly inverted from the truth.

### 6.3 Allocating a window to a requested period

A count window rarely aligns with the requested `[A, B]`. Allocation is
**straight-line by days**.

**Day arithmetic is half-open.** Count windows are `[open_on, close_on)`: the
opening count's date belongs to the window it opens, and the closing count's date
belongs to the *next* window. That partitions time cleanly with no day counted
twice. But the requested period `[A, B]` is inclusive of `B` (§9.1), so the two
must be reconciled before any subtraction. Convert the period to half-open
`[A, B_eff + 1)` and do all day arithmetic there:

```
B_eff        = least(B, store_today())            -- see below
window_days  = greatest(close_on − open_on, 1)
overlap_days = greatest(0, least(close_on, B_eff + 1) − greatest(open_on, A))
period_days  = (B_eff − A) + 1

allocated_goods_sold = goods_soldₖ × overlap_days / window_days
```

**Zero-length windows.** Two counts can fall on the same date — two purchases of
one category in a day, or a purchase followed by a month-end sweep. Then
`close_on − open_on = 0`, and the formula above yields `overlap_days = 0` while
`window_days` floors to 1, so the window's goods sold would be multiplied by zero
and **silently vanish from every report**. That money is real. A zero-length
window is a point in time, not a span, and is allocated whole:

```
overlap_days = 1  if  close_on = open_on  and  A ≤ open_on ≤ B_eff
             = 0  if  close_on = open_on  and  otherwise
```

Its single settled day is correct for coverage too: that day is settled at both
ends.

**The period end is clamped to today.** "This month", selected on the 3rd, yields
`B` = the 31st. Without clamping, twenty-eight days that have not happened yet
count as unsettled, and a perfectly well-kept shop reads *"Low — these figures are
largely unsettled"* for most of every month. Everywhere a period is evaluated —
allocation, coverage, freshness, the unsettled-tail message — the effective end
is `B_eff = least(B, store_today())`. The label shown to the user still reads the
requested range, noting the effective end when it differs: *"1–31 August (arrêté
au 3 août)"*.

`store_today()` is the date in the **store's own timezone** (§9.1), not UTC.

This is an **allocation**, not a measurement — the dashboard says so. Consumption
is assumed even across the window, which is wrong for seasonal or bursty
categories but is the standard, defensible approximation.

The markup applied is the rate in force at `tₖ` (§2.3). A window spanning a rate
change uses the rate at its start.

**Resolved (Q3):** **prorate**, as described above. The alternative — snapping
`[A, B]` outward to the nearest enclosing counts and reporting the true window —
is more truthful but stops the reported period matching the one requested. It is
**not built in v1.0 and no toggle is stubbed**; adding it later is additive.

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

Per period, per category:

```
coverage_pct = settled_days_in_period / period_days × 100
```

Where a **settled day** is one falling inside a **non-anomalous** count window
(§6.2), and `period_days = (B_eff − A) + 1` (§6.3).

**Overall coverage** is the average across categories, weighted by nothing —
every category counts equally, because an uncounted shelf is an uncounted shelf
regardless of its size:

```
overall_coverage_pct = Σ_c settled_days_c / (n_categories × period_days) × 100
```

The set of categories counted in `n_categories` is those **active now**, together
with any category having at least one stock count, purchase or loss dated inside
`[A, B_eff]`. That second clause matters: a category deactivated mid-period still
has events in it and must still be assessed, while one deactivated long ago and
untouched during the period correctly drops out. A never-counted category
contributes zero settled days and is named in `categories_never_counted` — it
*should* drag the number down, because it genuinely is unsettled.

Displayed as a percentage with a plain-language reading:

- **≥ 90%** — "Good coverage"
- **60–89%** — "Partial — some categories need counting"
- **< 60%** — "Low — these figures are largely unsettled"

The data quality panel lists: categories never counted, categories stale > 30
days, unsettled purchase totals, and every anomaly of the three kinds in §6.2,
each linked to the record that caused it.

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

On submit, before writing: the stock question of §3.2A, unless the backdating
exception applies. Both records — count and purchase — are written in a **single
transaction**. A purchase that requires a count never exists without it.

Submission is **idempotent**: an identifier is generated once per form
submission, not per attempt, so a retry on a flaky phone connection returns the
original result instead of posting the purchase twice. A duplicated purchase
inflates outflow, which this model reports as profit — so a double-post is not a
cosmetic bug, it is a false profit figure.

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
- All reporting is inclusive of both interval endpoints. Internally this is
  converted to half-open arithmetic before any day subtraction (§6.3).
- **The store has a timezone**, held in settings and defaulting to
  `Africa/Casablanca`. "Today" always means today *in the shop*, never UTC.
  Between 23:00 and midnight local these differ, and a UTC "today" would reject
  the day's own entries as being in the future.
- **No future dates.** Backdating is allowed without limit. This guard is
  enforced by a trigger, never by a `CHECK` constraint: a `CHECK` containing
  `current_date` is not immutable, so it is re-evaluated on restore and a dump
  taken today can fail to load tomorrow — the worst possible failure mode for the
  one artefact protecting the store's history.

### 9.5 Rounding

Allocation produces fractions, and a figure that does not add up on screen
destroys more trust than the precision is worth.

- Carry **full `numeric` precision** through the entire computation chain.
- Round to 2 decimals **exactly once**, at the point of emission into the report.
- Derive every total as **the sum of its already-rounded components**, so the
  category table always adds up to the KPI above it.

A total may therefore differ from the unrounded truth by a cent or two. That is
the intended trade.

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

All day arithmetic below is half-open, per §6.3: the requested period `[1 Jan,
31 Jan]` becomes `[1 Jan, 1 Feb)`.

**Window 1 — 1 Jan to 20 Jan (19 days, fully inside period)**
```
outflow      = 2,000 + 3,000 − 1,500 = 3,500
losses       = 200
goods_sold   = 3,300
overlap      = min(20 Jan, 1 Feb) − max(1 Jan, 1 Jan) = 19 days
allocated    = 3,300 × 19/19 = 3,300
```

**Window 2 — 20 Jan to 5 Feb (16 days, 12 inside period)**
```
outflow      = 1,500 + 2,500 − 900 = 3,100
losses       = 0
goods_sold   = 3,100
overlap      = min(5 Feb, 1 Feb) − max(20 Jan, 1 Jan) = 12 days   (20–31 Jan inclusive)
allocated    = 3,100 × 12/16 = 2,325.00
```

**Beverages, January**
```
goods_sold_at_cost  = 5,625.00
revenue_est         ≈ 5,625.00 × 1.20 = 6,750.00
gross_profit_est    ≈ 1,125.00
shrinkage           =   200        (measured)
purchases           = 5,500        (measured)
coverage            = 100%         (19 + 12 = 31 of 31 days settled)
```

Note that **goods sold (5,625) exceed purchases (5,500)** — the store drew its
shelves down slightly over the month. Cash out therefore *understates* the
period's true cost by that difference. This is precisely the distinction §6.7
exists to make visible; a month of heavy restocking shows the same effect with
the signs reversed.

> **This example is normative.** It is implemented as pgTAP fixture
> `050_allocation.sql` and is the single most important test in the suite. An
> earlier draft of this document computed window 2's overlap as 11 days and still
> claimed 100% coverage — 19 + 11 = 30 of 31, which cannot both be true. The
> error was mixing an inclusive period end with half-open window arithmetic. If
> these figures and the test ever disagree, the test is right.

---

## 11. Open questions

**All six are answered.** Recorded in `v1.0_impl_plan.md` §1.2 and adopted as
final for v1.0; they are listed here so this document stands on its own.

| # | Question | **Adopted for v1.0** |
|---|---|---|
| **Q1** | Markup edits effective from *today* or *start of month*? | **Today**, and the date stays editable in the rate-history dialog |
| **Q2** | Is "special event spending" `owner_draw` or `operating`? | **`owner_draw`** — weddings, Aid, family occasions |
| **Q3** | Prorate partial count windows, or snap the period to real counts? | **Prorate.** Snapping is not built in v1.0 and no toggle is stubbed |
| **Q4** | UI language — French, Arabic, English? Is RTL needed? | **French, LTR.** i18next scaffolded with `fr` only; `ar`/`en` are additive later |
| **Q5** | Currency — MAD, DZD, TND, other? | **MAD**, from settings, display-only |
| **Q6** | Should the dashboard have a printable / exportable monthly summary? | **Not in v1.0** |
