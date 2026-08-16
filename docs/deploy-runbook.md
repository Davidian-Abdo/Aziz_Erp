# Deployment runbook

**Who this is for:** the owner, going from "the code is finished" to "the shop is
using it". Written 2026-08-16, when every phase of the plan was built and the
only things left were the ones no agent can do — creating accounts, holding
passwords, and clicking *Deploy*.

Its companion is `docs/restore-runbook.md`, which is what you read on the worst
day. This one is what you read on the first day. Both are written to be followed
in order, by someone who is not enjoying it.

> **The one-line summary.** Nothing here is difficult. But four of these steps
> fail *silently* — the app loads, every screen is empty, and nothing anywhere
> says why. Those four are marked ⚠. Do not skim them.

Work through the sections in order. Each ends with **Check** — a way to know the
step worked that does not rely on the next step failing.

---

## 0. Where things stand before you start

| | |
|---|---|
| `aziz-dev` | Exists. All 14 migrations applied. Arabic UI, Arabic categories, `ar-MA`. Carries test data and is safe to break |
| `aziz-prod` | **Does not exist yet.** Everything below builds it |
| Cloudflare Pages | Not created. Project name in `deploy.yml` is `aziz-erp` |
| GitHub workflows | Four, all written, **none has ever run**: Deploy, Migrate, Keepalive, Backup |
| Backup repository | `Aziz_Erp_Backup` exists (private). No dump has been published to it |

The four workflows live in `.github/workflows/`. Each one's header names the
secrets it needs; this document is the same information in the order you will
actually need it.

---

## 1. Create the production Supabase project

Create a project named **`aziz-prod`**, in the region closest to Morocco
(`eu-west-3` / Paris, or `eu-central-1` / Frankfurt).

Write down, in your password manager, before you leave the page:

- the **project ref** — the `<ref>` in `https://<ref>.supabase.co`
- the **database password** you set at creation
- the **anon key** (Settings → API)

> The database password is shown once. Supabase can reset it later, but a reset
> invalidates the connection string in every secret below, so it is cheaper to
> keep it now.

**Check:** `https://<ref>.supabase.co/auth/v1/settings` loads in a browser when
you add `?apikey=<anon key>`, and returns JSON.

---

## 2. ⚠ Disable public signup — on **both** projects

Authentication → Providers → Email → turn **"Enable sign-ups"** off. Do it on
`aziz-prod` **and** on `aziz-dev`.

This is the sixth consecutive handoff entry carrying this item for `aziz-dev`.
It matters because plan §2.5 requires **two independent defences** and only one
is in place: the `app_user` allowlist. The allowlist means a stranger who
registers sees an empty application — but they hold a real account on your
project, and every later mistake in a policy has a logged-in attacker behind it
instead of nobody.

**Check** — from any machine, no credentials needed:

```bash
curl -s -H "apikey: <anon key>" https://<ref>.supabase.co/auth/v1/settings \
  | grep -o '"disable_signup":[a-z]*'
```

It must print `"disable_signup":true`. On `aziz-dev` today it prints `false`.

---

## 3. Create the owner's user

Authentication → Users → Add user, on `aziz-prod`. Use a real address you can
receive mail at, and a password from your manager rather than one you invent at
the keyboard.

This account is also what the Keepalive workflow logs in as (§8).

**Check:** the user appears in the Users list with a confirmed email.

---

## 4. Apply the migrations

The Migrate workflow does this with the Supabase CLI, which also records each
file in the project's migration ledger — so a later `db push` knows what is
already applied. Pasting SQL into the editor does **not** do that.

Add these GitHub secrets (Settings → Secrets and variables → **Actions** →
Secrets):

| Secret | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | A personal access token from supabase.com/dashboard/account/tokens |
| `PROD_PROJECT_ID` | The project ref from §1 |
| `PROD_DB_PASSWORD` | The database password from §1 |

Then run **Actions → Migrate → Run workflow**.

**Check:** the run is green and its log lists migrations `0001` through `0014`.
If it lists fewer, stop — the app will fail in ways that look like data problems.

---

## 5. ⚠ Bootstrap the allowlist

**This is the step that fails silently.** Every RLS policy in the schema gates on
a row in `app_user`, and nothing creates that row. Skip this and the owner logs
in successfully, reaches a working application, and every single screen is empty.
There is no error message, because nothing has gone wrong from the database's
point of view: it is answering "you may see nothing" correctly.

It is also the failure mode a **restore** produces (see `restore-runbook.md` §3),
so you will meet it twice.

SQL editor on `aziz-prod`, once:

```sql
insert into app_user (user_id, label)
select id, 'Aziz' from auth.users;
```

**Check:**

```sql
select count(*) from app_user;   -- must be 1, not 0
```

---

## 6. Confirm the store's settings

The seed sets `timezone = 'Africa/Casablanca'`, `currency_code = 'MAD'`,
`locale = 'ar-MA'`. The timezone is not cosmetic: every date in this system comes
from the store's day, not from UTC or from the phone, and the shop is UTC+1 —
`toISOString()` would write yesterday for an hour every night.

```sql
select store_name, timezone, currency_code, locale from app_settings where id = 1;
```

Change `store_name` here if you want a different name in the header.

**Check:** `select store_today();` returns the date it actually is in the shop.

---

## 7. Cloudflare Pages, and the deploy

1. Create a Cloudflare account (or use yours) and note the **Account ID** from
   the right sidebar of the dashboard.
2. My Profile → API Tokens → Create Token, with the **Cloudflare Pages : Edit**
   permission. Copy the token once.
3. Nothing needs to be created in the Pages UI — `wrangler pages deploy` creates
   the project named `aziz-erp` on its first run.

⚠ **The deploy workflow reads its two Supabase values from repository
VARIABLES, and the keepalive workflow reads the same two values from repository
SECRETS.** Same names, two different stores, two different screens. Set only one
and the other workflow gets an empty string — the build then produces a bundle
pointing at `undefined`, which fails at runtime as a network error, not as a
configuration error. Set both.

**Settings → Secrets and variables → Actions → _Variables_ tab:**

| Variable | Value |
|---|---|
| `PROD_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `PROD_SUPABASE_ANON_KEY` | The anon key |

**…→ _Secrets_ tab:**

| Secret | Value |
|---|---|
| `CF_API_TOKEN` | The Pages:Edit token |
| `CF_ACCOUNT_ID` | The Cloudflare account ID |

The anon key belongs in a public bundle by design — it carries no privileges of
its own and RLS is what protects the data. The **service role key must never
appear** in any variable, secret, or workflow here.

Deploy runs on every push to `main`. Push anything, or re-run the last one from
the Actions tab.

**Check:** the Pages URL loads the login screen in Arabic, right-to-left, and
signing in with the §3 account reaches a dashboard rather than an empty one. If
it is empty, you skipped §5.

---

## 8. Keepalive

A free Supabase project **pauses after 7 idle days**, and a paused project is a
shop that cannot record today's delivery. The workflow logs in every 3 days and
calls `store_today()`.

**Settings → Secrets and variables → Actions → Secrets:**

| Secret | Value |
|---|---|
| `PROD_SUPABASE_URL` | `https://<ref>.supabase.co` — yes, again, as a *secret* this time |
| `PROD_SUPABASE_ANON_KEY` | The anon key — likewise |
| `KEEPALIVE_EMAIL` | The §3 account's email |
| `KEEPALIVE_PASSWORD` | That account's password |

**Check:** Actions → Keepalive → Run workflow. Green, and the log shows a date.

---

## 9. Backups

Two secrets, and one of them has a rule attached.

| Secret | Value |
|---|---|
| `PROD_DB_URL` | ⚠ The **Session pooler** connection string (§9.1) |
| `BACKUP_PASSPHRASE` | A long random passphrase — ⚠ **also put it in your password manager** (§9.2) |
| `BACKUP_DEPLOY_KEY` | Private half of an SSH deploy key with **write** access to `Aziz_Erp_Backup` |

### 9.1 ⚠ The pooler string, not the direct host

Supabase's direct host `db.<ref>.supabase.co` resolves to **IPv6 only**, and
GitHub's runners have no IPv6 route. The failure is a connection timeout that
reads exactly like a wrong password and will be debugged as one for an hour.

Copy the **Session pooler** string from Settings → Database → Connection string.
The *transaction* pooler will not do — `pg_dump` needs the full protocol.

### 9.2 ⚠ A passphrase held only in GitHub is not held

If the passphrase exists only as a GitHub secret, then losing access to the
GitHub account loses every backup at the same moment — and GitHub will not show
it back to you. Put it in the password manager first, then into GitHub.

### 9.3 The deploy key

```bash
ssh-keygen -t ed25519 -C "aziz-erp backup" -f aziz_backup_key -N ""
```

Public half → `Aziz_Erp_Backup` → Settings → Deploy keys → Add, **with write
access ticked**. Private half → `BACKUP_DEPLOY_KEY`. Then delete both files from
your disk.

**Check:** Actions → Backup → Run workflow. Green, **and** a file has appeared in
`Aziz_Erp_Backup/dumps/`. The workflow decrypts what it just encrypted before
publishing, so a green run also means the passphrase in GitHub is the one that
opens the file.

---

## 10. ⚠ Check the books by hand, once

The last item of the plan's definition of done, and the only one that cannot be
automated: pick a month you remember, open the dashboard for it, and check the
figures against what you know happened.

What you are checking is not arithmetic — pgTAP checks arithmetic, 296 times.
You are checking that the **model matches your shop**: that the markup per
category is roughly what you actually charge, and that the categories match your
actual shelves. Every revenue and profit figure in this application is an
estimate derived from those two things, and it is marked `≈` on screen for that
reason.

If a category's estimate is far from what you would have said, the markup is
wrong, not the software. Settings → markup rates.

---

## 11. Two things never to do

- **Never point the Playwright tests at `aziz-prod`.** They write purchases and
  counts. A test purchase in your real ledger is not a test artefact — in this
  model a spurious purchase inflates outflow, and outflow is reported as
  **profit**. `aziz-dev` is their target. (`e2e/README.md`)
- **Never run the pgTAP suite against a project that has traded.** Every fixture
  asserts absolute figures and most begin by clearing the categories, which the
  purchase foreign key refuses once purchases exist. Nothing is destroyed — each
  fixture rolls itself back — but it will report failures over arithmetic that is
  perfectly correct, and a suite that goes red for the wrong reason is a suite
  people stop reading. Run it locally, or against a restored copy
  (`scripts/restore-rehearse.sh`).

---

## Done means

From plan §1.3. Tick these and v1.0 has shipped:

- [ ] Every migration applied to `aziz-prod` (§4)
- [ ] pgTAP passes with zero failures — locally or on a restored copy (§11)
- [ ] All six routes work on a phone-sized screen against production (§7)
- [ ] The owner can log in; nobody else can register (§2) or read anything (§5)
- [ ] `report_period` for a month you recognise agrees with what you know (§10)
- [ ] Deploy, Keepalive and Backup have each run green at least once (§7, §8, §9)
- [ ] A backup has been restored into a scratch database once — done
      2026-08-11, `restore-rehearse.sh`, and repeatable
- [ ] `current_state.md` records who validated what, on which database
