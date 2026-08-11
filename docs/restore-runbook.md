# Restore runbook

How to get the store's books back from an encrypted backup. Written to be
followed on the worst day, by someone who has not read the rest of this
repository.

Backups live in the private repository
**`github.com/Davidian-Abdo/Aziz_Erp_Backup`**, under `dumps/`, one file per
week named `aziz-<timestamp>.sql.gpg`. They are produced by
`.github/workflows/backup.yml` and encrypted with AES256 under a single
passphrase.

**Without the passphrase there is no restore.** It is a GitHub secret
(`BACKUP_PASSPHRASE`) and it must also exist in the owner's password manager.
A passphrase stored only in GitHub is lost with the GitHub account.

---

## 0. Is the backup real?

Run this on any machine with Docker and this repository. It takes about a
minute and touches nothing:

```bash
./scripts/restore-rehearse.sh
```

It builds a database, backs it up, restores it, and asserts the restored copy
returns the same figures and the same privileges. It ends with either
`RESTORE REHEARSAL PASSED` or a named failure. Run it after any change to
`scripts/backup.sh`, and run it once a quarter regardless.

---

## 1. Decrypt

```bash
gpg --decrypt --output aziz.sql aziz-20260811T030000Z.sql.gpg
```

It will prompt for the passphrase. The result is plain SQL — the whole `public`
schema, structure and data. It is readable; if you want to know what is in the
backup before restoring it, open it.

---

## 2. Restore into a database

**Into a scratch database first, always.** Never restore directly over a
project that still has data in it — if the dump turns out to be the wrong week,
you have then lost both copies.

Into a fresh Supabase project:

```bash
psql "<session pooler connection string>" -f aziz.sql
```

A handful of `must be owner of schema public` and `schema public already
exists` errors are expected and harmless — `postgres` is not a superuser on
Supabase. What matters is step 3, not the output of this command.

---

## 3. ⚠ Re-point the allowlist — do not skip this

The backup contains the `public` schema only. Supabase's `auth` schema is
managed by the platform and is not in the dump, so **the restored
`app_user.user_id` points at a user account that exists only in the old
project.**

If you skip this step, you will log in successfully and every screen will be
empty. Not an error — empty. A working application over an empty allowlist
looks exactly like a shop that has never traded. This is
`plan_review.md` finding R2, and it is the single most likely way a restore
gets declared a failure when it actually worked.

Create the owner's account in the new project, then run in the SQL editor:

```sql
delete from app_user;
insert into app_user (user_id, label)
select id, 'Aziz' from auth.users;
```

---

## 4. Check the books are the books

Pick a month the owner remembers and compare it against what they expect:

```sql
select report_period('2026-01-01', '2026-01-31');
```

Then confirm the security came back — this returns `0` on a healthy database
and anything else means a stranger on the internet can call the write RPCs:

```sql
select count(*) from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and has_function_privilege('anon', p.oid, 'execute');
```

---

## 5. Point the app at it

Update `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (GitHub repository
*variables*, not secrets) to the new project and re-run the Deploy workflow.
Update `PROD_DB_URL` and the keepalive secrets to match, or the next backup
silently keeps dumping the old project.

---

## What is deliberately not backed up

| | Why |
|---|---|
| `auth` schema (logins) | Platform-managed, does not restore across projects. Step 3 is the compensation. |
| Storage buckets | The app uses none. |
| The passphrase | By design. It is the one thing that must not live beside the thing it protects. |
