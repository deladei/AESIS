# CLAUDE.md — AESIS

> Repo-root context for Claude Code. Read every session.
> **Also read `HANDOFF.md` first** — it is the running session log and the source of truth for current state.

## Project
AESIS (AI-Enhanced Student Internship Supervision System). CS-department pilot for tracking and supervising student internships: students submit weekly logbook entries, supervisors review/score them, faculty oversee, and the placement closes with a final assessment + company attestation. An AI enrichment path scores and tags entries (advisory only).

Three top-level services in one repo (deployed separately):
- `backend/` — Node API + Prisma (the system of record).
- `ai/` — standalone FastAPI service (enrichment, analysis, chatbot).
- `frontend/` — React SPA.

## Stack
- Frontend: **React 18 + TypeScript + Vite**, Tailwind CSS + shadcn/ui, TanStack Query v5, React Router v6, Recharts, Socket.io client. Dev port 5173. Deployed to **Vercel**.
- Backend API: **Node.js + Express + TypeScript**, Prisma ORM. Dev port 3001 (has drifted to 3002 — check `backend/.env`). Deployed to **Render** (`aesis-backend`).
- AI enrichment service: **standalone FastAPI (Python 3.11)** — NOT the same process as the API. Deployed to Render (`aesis-ai-engine` web + `aesis-celery-worker`). Two paths:
  - **New (active) pipeline** — synchronous `POST /ai/enrich/entry`: a **local deterministic keyword classifier** (`aesis-entry-relevance/v1`), classify→summarize. No LLM, no training data, no cost. Advisory; never implies a grade.
  - **Legacy pipeline** — Celery async (`analyze_logbook`, `compute_risk`) over a Redis broker: rule-based NLP quality scorer + TF-IDF/FAISS plagiarism + VADER sentiment + XGBoost risk (rule-based fallback).
  - Chatbot uses **Groq** (`llama-3.1-8b-instant`, OpenAI-compatible). **There is no Gemini/OpenAI anywhere** — do not assume an external LLM scores anything.
- Database: **PostgreSQL** (primary, via Prisma) + **MongoDB** (legacy logbook entry text/doc store — optional, code degrades gracefully if absent) + **Redis** (Celery broker + risk-alert pub/sub). **No RLS** — authorization is enforced in the app layer (see Roles).
- Auth: **custom JWT** (`jsonwebtoken`). Access token in memory; refresh token as HttpOnly cookie, persisted **SHA-256-hashed** in DB. PII (phone/address) encrypted AES-256-GCM at the app layer.
- Storage (file uploads): **multer `memoryStorage`** on the legacy logbook attachments route; currently writes a **placeholder URL** — real S3/Cloudinary is an open TODO (`logbook.controller.ts`). Do not assume object storage exists yet.
- Package managers / runtimes: **Node 22.x** (`backend/package.json` engines), **Python 3.11** (`ai/Dockerfile`). npm in `backend/` and `frontend/`; pip in `ai/`.

## Roles
Enforced app-layer (no RLS). Role lives as a **`UserRole` enum column on the `User` table** and is mirrored into the JWT **`role` claim** (`{ sub: userId, role }`).
- `student` — submits weekly logbook entries + self-data; sees own placement only.
- `academic_supervisor` — faculty oversight for assigned interns; **acknowledges/returns** entries; **never authors entry content**; signs final evaluation.
- `company_supervisor` — read-only on their assigned placements; not a weekly-workflow actor; provides the final company attestation (magic-link).
- `coordinator` — **read-only** cross-cohort oversight + configuration; never transitions/writes entries.
- `admin` — break-glass, always allowed (audited by the caller).

Enforcement (two layers, both already exist — reuse them):
1. Route-level RBAC: `authenticate` middleware (`backend/src/middleware/authenticate.ts`) verifies the Bearer token and attaches `req.user`; `authorize(...roles)` (`middleware/authorize.ts`) guards by role.
2. Per-resource decision point for the entries pipeline: **`backend/src/modules/entries/entries.policy.ts` → `assertPlacementAccess(actor, placement, mode)`** — the single place ownership (studentId / academicSupervisorId / companySupervisorId) + access mode (read/write/transition) is decided. Controllers never re-implement role rules.

## Logbook state machine
**Single source of truth: `backend/src/modules/entries/entry.stateMachine.ts`** (new pipeline — this is the active one). Pure, unit-tested `resolveTransition(current, action, role)`.

States: `draft → submitted → acknowledged` (acknowledged is **TERMINAL**, locks the week). `submitted → returned → draft` (reopen).

| Action | From → To | Who | Notes |
|---|---|---|---|
| `submit` | draft → submitted | `student` | |
| `acknowledge` | submitted → acknowledged | `academic_supervisor` | terminal, locks week |
| `return` | submitted → returned | `academic_supervisor` | |
| `reopen` | returned → draft | `student` | **bumps version** |

`admin` is break-glass on any transition. Role guard runs **before** the from-state guard (403 before 409) so an unauthorized actor can't probe state. Edit-ability: `isEditable` = `draft | returned` only. Append-only `entry_event` log + DB trigger record every transition; `EnrichmentStatus` (pending→processing→succeeded|failed|abandoned) tracks the fail-open enrichment worker independently and never touches `entry.status`.

Finalization track (separate, `modules/finalization/`): `FinalizationStatus` = `active → assessment_pending → finalized`, gated on all weeks acknowledged/waived + assessment + optional company attestation.

> Legacy pipeline (`modules/logbook/`, `SubmissionStatus` = draft/submitted/under_review/approved/flagged) still exists and is wired, but the weekly workflow has moved to `entries`. Don't extend the legacy one without a reason.

## Data model
**Read the real schema before any work: `backend/prisma/schema.prisma`.** Migrations: `backend/prisma/migrations/`. Columns are snake_case in DB (`@map`) but camelCase in Prisma models. Do not assume table/column names — read them. **Prisma `Decimal` serializes to a JSON *string*** — always coerce/validate numerically before arithmetic or rendering (this caused the dashboard avg bug; see `shared/utils/quality.ts`).

## Conventions
- Folder structure: `backend/src/modules/<feature>/` each with `*.service.ts`, `*.controller.ts`, `*.router.ts`, `*.schema.ts` (Zod), and `__tests__/`. Shared code in `backend/src/shared/{utils,types,validators}`, infra in `backend/src/config/`, middleware in `backend/src/middleware/`. `ai/` is `routers/ services/ tasks/ utils/ models/ config/`. `frontend/src/` is `pages/ components/ hooks/ contexts/ lib/`.
- Naming: files `feature.layer.ts` (`entries.service.ts`); REST endpoints under `/api/v1/<resource>`; DB columns snake_case, Prisma models/fields camelCase; Zod schemas validate every request body + route param.
- Migration tool: **Prisma Migrate** — `cd backend && npx prisma migrate dev --name <x>` (dev); prod runs `npx prisma migrate deploy` in the Render startCommand. **Additive only unless approved** (see hard rules).
- Test framework + command: **Jest + ts-jest** — `cd backend && npm test`. **On this box always `npx jest --runInBand`** — it's a weak Celeron/3.6 GB host and parallel workers flake the DB-integration suites on their 5 s connect hook (not real failures). New-pipeline suites: `npx jest src/modules/entries src/modules/finalization --runInBand`. FastAPI: **pytest** — `cd ai && python3 -m pytest` (runs without torch/sentence-transformers; semantic stage stubbed in conftest). CI runs it in the `ai` job.
- Lint/format: `cd backend && npm run lint` (ESLint) / `npm run format` (Prettier). `npm run typecheck` (`tsc --noEmit`) must be clean. Frontend: `npx tsc --noEmit` + `npx vite build`.

## Hard rules (non-negotiable)
- **Validate every AI-originated value before it touches the DB or UI.** Quality scores clamped to 0–100; out-of-range logged + rejected, never persisted (`ai/tasks/analysis_tasks.py`, `ai/services/quality_scorer.py::clamp_quality_score`, `backend/src/shared/utils/quality.ts`). AI-suggested tags require human confirmation before they count. Enrichment is advisory and must never imply a grade or pass/fail.
- **No metric may render an impossible state.** Aggregates that can't be computed show `—`, not 0 or a raw value. Means exclude null/out-of-range from both numerator and denominator. Derived counts (e.g. internship weeks) come from real config/dates, never from row counts that can contradict what's shown.
- **Audit + final-assessment records are immutable** once written/signed off (append-only `entry_event`; attestation tokens stored hash-only, single-use).
- **Ask before any destructive migration.** Never drop/alter columns with data without explicit approval. Migrations so far are CREATE-only.
- **Feature-scoped PRs/commits.** Each feature reviewable independently.
- **Reuse, don't rebuild:** the entries state machine (`entry.stateMachine.ts`), the multi-role authorization (`authorize` + `entries.policy.ts`), and the FastAPI enrichment path already exist. Extend them. Introduce no new libraries without asking.

## How to work here
1. Read `HANDOFF.md`, then `backend/prisma/schema.prisma` and `entry.stateMachine.ts`, before touching anything.
2. Propose a short migration + endpoint + authorization plan and **wait for approval**.
3. Implement only the approved batch. Match existing patterns; no new libraries without asking.
4. Write tests for every change (Jest, `--runInBand`). `tsc --noEmit` clean. Keep each feature in its own commit.
5. **Shipping:** AESIS deploys to prod from `main` — `git push origin main` auto-builds Render (backend + AI) and Vercel (frontend). Commit/push only when asked. Append a `HANDOFF.md` session entry at the end of each session.

## Deploy targets
- Frontend → **Vercel** (`aesis.vercel.app`). Backend + AI → **Render** (`aesis.onrender.com` / `aesis-ai-engine`). Postgres → Render managed (`aesis-postgres-2`); Mongo → Atlas; Redis → Upstash.
- This box has **no Render/Vercel CLI or keys** and `.env` points at localhost — prod DB scripts (seed, `db:backfill-quality`) and Vercel promotions are **manual** via the respective dashboards.
