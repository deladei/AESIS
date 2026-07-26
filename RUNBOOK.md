# AESIS — Production Runbook

> Operational recovery procedures. `HANDOFF.md` is the session log (what changed and why);
> this file is what to *do* when prod misbehaves. Keep it short and executable.

## Alarms

| Signal | Meaning |
|---|---|
| `.github/workflows/keepalive.yml` run **fails** (GitHub emails you) | `https://aesis.onrender.com/health/db` did not return 200 after 5 tries over ~5 min. Either the process is down/boot-looping, or Postgres is unreachable. Start with "Prod won't boot" below. |
| Render deploy marked failed | Build or `startCommand` failed. Read the boot log before anything else. |

The keep-alive cron runs every 10 min, so an outage surfaces within ~10 minutes. It exists because
the S87 outage (below) went unnoticed for **four days**.

**It pings `/health/db`, not `/health`, and that distinction is the whole alarm.** `/health` is
static; it returned 200 throughout *both* the S87 and S88 outages while every DB-backed route
returned 500. A green `/health` proves only that Node is running.

---

## Symptom: login hangs / "server is starting" forever

`/health` is a **static** route with no DB access; `/health/db` does one `SELECT 1`
(`backend/src/app.ts`). Probe both — the pair localises the fault in one step:

| `/health` | `/health/db` | Meaning |
|---|---|---|
| 200 (after ~30 s) | 200 | Normal Render free cold start. Harmless; keep-alive prevents it. |
| 200 | **503** | Process is up, **database is unreachable**. Skip the boot-loop section — go to "Database" and check the provider console (quota, paused project, rotated password). |
| times out, **zero bytes**, repeatedly | — | Process is not running at all; service is boot-looping. Next section. |

A quick equivalent when you want to exercise a real query path: `POST /api/v1/auth/login` with an
address that does not exist. It is a pure `findUnique` with no writes — **401** means the DB is
wired, **500** means it is not.

## Symptom: prod won't boot (boot loop)

`startCommand` is `npx prisma migrate deploy && node dist/server.js`. The `&&` is deliberate — a
schema mismatch must never serve traffic — but it means **any migration error takes the whole API
down**, including read-only routes.

### Cause seen in production (S87, 2026-07-25 — 4-day outage)

A previous deploy left a **failed migration row** in `_prisma_migrations`
(`finished_at IS NULL`, `rolled_back_at IS NULL`). Prisma then refuses every subsequent deploy with
**P3009** — "migrate found failed migrations in the target database" — so every boot exits non-zero,
forever. CI cannot catch this: CI always migrates a *clean* database and never sees prod's state.

### Diagnose

```bash
psql "$PROD_DATABASE_URL" -c "select migration_name, finished_at is not null as done,
  rolled_back_at is not null as rolled_back, applied_steps_count
  from _prisma_migrations order by started_at;"
```

Any row with `done = f` and `rolled_back = f` is the blocker. Read why it failed:

```bash
psql "$PROD_DATABASE_URL" -tAc "select logs from _prisma_migrations where migration_name='<name>';"
```

### Recover

1. **Check how far it got.** `applied_steps_count = 0` means nothing was applied — the clean case.
   If it is > 0, inspect the migration SQL and confirm by hand which objects exist before continuing;
   a partially-applied migration needs the applied part reverted or the SQL made idempotent first.
2. **Confirm the migration file itself is fixed.** Re-running an unfixed file just fails again. (In
   S87 the file had been missing its `CREATE TYPE "RecordOrigin"`; the committed version has it.)
3. **Mark it rolled back, then redeploy the chain:**

```bash
cd backend
export DATABASE_URL='<prod url>'
npx prisma migrate resolve --rolled-back <migration_name>
npx prisma migrate deploy
```

4. **Verify** — this must return 0:

```bash
psql "$DATABASE_URL" -tAc "select count(*) from _prisma_migrations
  where finished_at is null and rolled_back_at is null;"
```

5. Restart the Render service (Manual Deploy) and confirm `/health` → 200.

**Always take a dump first** (see below). It costs seconds and makes every step reversible.

---

## Database

Prod Postgres is external to Render — `DATABASE_URL` is set in the Render dashboard (`sync: false`
in `render.yaml`), never as a Render-managed resource.

- **Live:** Supabase (`aws-1-us-west-2.pooler.supabase.com:5432`), PostgreSQL 17.6 — cut over
  2026-07-26 (S88). Free plan does **not** meter compute; a project only pauses after ~7 days of
  zero activity, which the keep-alive ping alone prevents.
- **Decommissioned:** Neon (`ep-autumn-waterfall-a6nt7o2h...`), PostgreSQL 18. Its free plan meters
  **compute-hours per account**; the budget ran out and it now refuses every connection with
  `ERROR: Your account or project has exceeded the compute time quota`. **Do not re-point anything
  at it** — treat it as gone, like `aesis-postgres-2` before it.

`DATABASE_URL` **must** be the session-mode pooler string (port **5432**), and nothing may precede
`postgresql://` in the value — a mangled paste from the Supabase console (`database=postgres` ran
into the URL) produced a P1012 boot loop during the S88 cutover. Not port 6543 — transaction mode
cannot run `prisma migrate deploy`. Not `db.<ref>.supabase.co` — IPv6-only, unreachable from Render.

### Cause seen in production (S88, 2026-07-26 — provider quota death)

Every DB-backed route 500s, `/health` still 200s, and `psql` against the provider returns
`ERROR: Your account or project has exceeded the compute time quota`. The database is refusing
connections outright; nothing in the repo can fix it. Options are: wait for the plan's monthly
reset, upgrade the plan, or **cut over to the standby**.

The trap: a dead provider cannot be dumped. "Re-dump immediately before flipping" (below) becomes
impossible, and the newest available copy is whatever was dumped last. Keep the standby fresh, and
take a dump of the *target* before it becomes the system of record so the cutover itself is
reversible.

### Dump / restore

```bash
pg_dump --format=custom --no-owner --no-acl --schema=public -f prod.dump "$SOURCE_URL"

# Filter the benign `CREATE SCHEMA public` so --exit-on-error still catches real failures.
pg_restore -l prod.dump | grep -v ' SCHEMA - public' > toc.list
pg_restore --no-owner --no-acl --exit-on-error -L toc.list -d "$TARGET_URL" prod.dump
```

The dump carries `_prisma_migrations`, so the next `migrate deploy` on the target is a no-op — do
**not** re-baseline. It also carries any *failed* migration row, so fix that before or after the
restore, or the boot loop moves with the data.

Verify parity (expect identical output from both sides):

```bash
psql "$URL" -tAc "select relname||' '||(xpath('/row/cnt/text()',
  query_to_xml(format('select count(*) as cnt from public.%I', relname), false, true, '')))[1]::text::int
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' order by relname;"
```

A cutover loses every write made after the dump, so re-dump immediately before flipping the env var.

---

## Secrets

Secrets live only in the Render/Vercel dashboards. **Never paste one into a chat, terminal history,
or commit** — anything pasted must be treated as burned and rotated.

Rotation order (each has a Render var; restart after):
`DATABASE_URL` (DB provider console) → `MONGO_URI` (Atlas) → `AI_ENGINE_API_KEY` (must match the AI
service's `AI_API_KEY`) → `GROQ_API_KEY` → `SENDGRID_API_KEY`.
