# Weekly Logbook Entry Pipeline

CS-department internship logbook: how a student records a week, how it's reviewed,
and how it's enriched by AI. PostgreSQL only — no second datastore, no message broker.

Code lives in two modules:

- `modules/entries/` — the weekly entry (write path, state machine, event log,
  authorization, AI enrichment worker).
- `modules/finalization/` — placement finalization + company magic-link attestation.

## Three separated paths (different reliability guarantees)

1. **Write path** (`entries.service.ts`) — synchronous, must never fail. No AI
   call, no company-supervisor dependency. On submit it validates, writes the
   entry + activities + reflection + the `entry_event`, and enqueues enrichment
   via a **transactional outbox** row — all in one DB transaction.
2. **AI enrichment** (`enrichment.worker.ts` + `enrichment.client.ts`) — fail-open.
   A polling worker drains the `enrichment_queue` table (no broker), calls the
   FastAPI engine, and writes an advisory `ai_assessment`. If the engine is
   down/slow or returns off-contract JSON, it retries with backoff then gives up
   (`abandoned`) — the entry stays fully reviewable with no assessment. It NEVER
   writes `logbook_entry.status` or any grade.
3. **Human workflow** (`entries.service.ts`) — the academic supervisor
   acknowledges (terminal, locks the week) or returns-with-comment. Company
   supervisor is never a hard gate.

## State machine (server-enforced; invalid transitions → 409)

```
draft -> submitted -> acknowledged   (acknowledged is TERMINAL and locks the week)
submitted -> returned -> draft       (reopen increments version)
```

Every transition writes one `entry_event` row in the same transaction. The
`entry_event` table is **append-only at the DB layer** (a trigger rejects
UPDATE/DELETE), so history cannot be rewritten by an app bug. Acknowledged weeks
are immutable; corrections require a new version.

## Placement finalization

```
placement: active -> assessment_pending -> finalized
```

`finalize` requires all weeks acknowledged (or explicitly **waived** by the
academic supervisor with a recorded reason, stored in `placement_assessment.waivers`)
**and** a `placement_assessment` row. The cross-week AI summary runs once here,
over the acknowledged corpus, and is fail-open (advisory).

---

## Configuration flags

The two flags below depend on the university's attachment regulations, which are
**unconfirmed**. They default to the assumptions documented here. Defined and
validated in [`src/config/env.ts`](../../config/env.ts); set them as environment
variables (e.g. in `backend/.env` or the Render dashboard).

### 1. `COMPANY_ATTESTATION_REQUIRED_FOR_FINALIZATION` — default `false`

- **`false` (default):** company attestation is optional. Weekly entries and
  placement finalization both proceed without it.
- **`true`:** finalization blocks until a **confirmed** `company_attestation`
  exists. Weekly entries STILL flow without it — this gates finalization only.
- **Flip it:** set `COMPANY_ATTESTATION_REQUIRED_FOR_FINALIZATION=true`. Enforced
  in `finalization.service.ts → finalizePlacement`.

### 2. `WEEKLY_BINDING_GRADES` — default `false`

- **`false` (default):** acknowledgment model. The supervisor acknowledges a week
  with no mark.
- **`true`:** a numeric `score` (0–100) is **required** to acknowledge a week and
  is recorded on the `entry_event`.
- **Flip it:** set `WEEKLY_BINDING_GRADES=true`. Enforced in
  `entries.service.ts → applySupervisorTransition`; the score is accepted by the
  acknowledge endpoint's schema.

### Additional knobs

| Variable | Default | Effect |
|---|---|---|
| `BACKFILL_CUTOFF_DAYS` | unset (OFF) | If set to N, reject weekly submissions more than N days after the week's `period_end`. |
| `ATTESTATION_TOKEN_TTL_HOURS` | `168` (7 days) | Lifetime of a company attestation magic link. |

---

## Endpoints

| Method | Path | Who | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/entries` | student | create/update a draft (idempotent by placement+week) |
| `POST` | `/api/v1/entries/:id/submit` | student | submit (idempotent; enqueues enrichment) |
| `POST` | `/api/v1/entries/:id/acknowledge` | academic supervisor | acknowledge (locks week) |
| `POST` | `/api/v1/entries/:id/return` | academic supervisor | return-with-comment |
| `GET` | `/api/v1/entries` / `/:id` | role-scoped | list / read (DB-scoped to the actor) |
| `POST` | `/api/v1/placements/:id/assessment` | academic supervisor | record binding grade |
| `POST` | `/api/v1/placements/:id/finalize` | academic supervisor | finalize placement |
| `POST` | `/api/v1/placements/:id/attestation/invite` | supervisor / coordinator | issue a magic link |
| `GET` | `/api/v1/attest/:token` | **public** | attestation form context |
| `POST` | `/api/v1/attest/:token` | **public** | submit attestation (single-use) |

## Tests

- `entry.stateMachine.test.ts`, `entry.dates.test.ts`, `enrichment.client.test.ts`,
  `finalization/attestation.token.test.ts` — pure unit (no DB).
- `entries.integration.test.ts` — real Postgres (`aesis_logbook_test`); covers the
  write path, locking/idempotency, append-only trigger, cross-student isolation,
  the enrichment worker (fail-open/retry/give-up), finalization, and attestation.
  All DB-touching tests share this one file so they don't race each other's
  `TRUNCATE`. The suite **skips itself** if the test DB is unreachable.
