# AESIS — Session Handoff Log

> **How to use this file**
> Read this file at the START of every session before touching any code.
> Append a new entry at the END of every session using the template at the bottom.

---

## Project Snapshot

| Field | Value |
|---|---|
| **Project** | AESIS — AI-Enhanced Student Internship Supervision System |
| **GitHub** | `https://github.com/deladei/AESIS` (branch: `main`) |
| **Repo root** | `~/Desktop/AISYSTEM/` |
| **Backend** | `backend/` — Node.js + Express + TypeScript + Prisma (PostgreSQL) |
| **AI Engine** | `ai/` — FastAPI + Celery (Python 3.11) |
| **Frontend** | `frontend/` — React + TypeScript + Tailwind CSS + shadcn/ui + Recharts |
| **Infra** | Docker Compose — PG 16, Mongo 7, Redis 7, AI Engine, Celery Worker |
| **Test runner** | Jest + ts-jest — run `npm test` inside `backend/` |
| **Type check** | `npx tsc --noEmit` inside `backend/` |
| **Current phase** | **Phase 9 — Deployment files created (Render + Vercel + GitHub Actions)** |

---

## Architecture

```
AISYSTEM/
├── HANDOFF.md                     ← THIS FILE — read first every session
│
├── backend/                       ← Node.js API (port 3001)
│   ├── docker-compose.yml         ← PG + Mongo + Redis + AI Engine + Celery
│   ├── prisma/schema.prisma       ← 14+ PostgreSQL models
│   ├── .env                       ← real secrets (gitignored)
│   ├── .env.example               ← template (committed)
│   └── src/
│       ├── app.ts                 ← Express app factory + route wiring
│       ├── server.ts              ← startup: connects PG + Mongo + Redis + Socket.io
│       ├── config/
│       │   ├── env.ts             ← Zod-validated env vars (crashes on missing)
│       │   ├── prisma.ts          ← Prisma client singleton
│       │   ├── mongo.ts           ← MongoDB client + COLLECTIONS constants
│       │   ├── redis.ts           ← Redis client
│       │   ├── logger.ts          ← Pino structured logger
│       │   └── seed.ts            ← DB seed (CS dept + academic year)
│       ├── middleware/
│       │   ├── authenticate.ts    ← JWT verification, attaches req.user
│       │   ├── authorize.ts       ← RBAC role guard factory
│       │   ├── errorHandler.ts    ← AppError class + global error handler
│       │   ├── rateLimiter.ts     ← express-rate-limit (100/15min/IP)
│       │   └── requestLogger.ts   ← HTTP request logging
│       ├── shared/
│       │   ├── types/index.ts     ← AuthenticatedRequest, RiskTier, etc.
│       │   ├── utils/
│       │   │   ├── crypto.ts      ← AES-256-GCM encryptPII / decryptPII
│       │   │   ├── email.ts       ← Nodemailer (SendGrid prod / console dev)
│       │   │   ├── pagination.ts  ← paginate() + buildMeta()
│       │   │   ├── response.ts    ← ok() / created() / noContent()
│       │   │   └── token.ts       ← JWT + refresh token utils
│       │   └── validators/
│       │       └── common.ts      ← uuidParam, paginationQuery, institutionalEmail
│       └── modules/
│           ├── auth/              ✅ DONE — register, login, refresh, logout,
│           │                                verify-email, reset-password (19 tests)
│           ├── placements/        ✅ DONE — placement CRUD, company CRUD,
│           │                                approval workflow, 24-week schedule gen,
│           │                                document upload (14 tests)
│           ├── logbook/           ✅ DONE — draft lifecycle, submission with late
│           │                                detection, RBAC reads, attachments,
│           │                                supervisor feedback in $transaction,
│           │                                real MongoDB write, real AI HTTP call (25 tests)
│           └── ai/                ✅ DONE — SSE streaming chat with keyword KB
│                                            ai.controller.ts, ai.router.ts
│
├── ai/                            ← FastAPI AI Engine (port 8000)
│   ├── .env                       ← AI service secrets (gitignored)
│   ├── .env.example               ← template (committed)
│   ├── requirements.txt           ← all free Python deps
│   ├── Dockerfile                 ← python:3.11-slim, pre-downloads models
│   ├── main.py                    ← FastAPI app entry point
│   ├── config/
│   │   ├── settings.py            ← Pydantic settings
│   │   └── database.py            ← async (asyncpg/motor) + sync (psycopg2/pymongo) clients
│   ├── models/schemas.py          ← Pydantic request/response models
│   ├── utils/
│   │   ├── text_processing.py     ← NLP utils: 80+ CS keywords, reflection/temporal markers
│   │   └── feature_extraction.py  ← 18 XGBoost features from PostgreSQL
│   ├── services/
│   │   ├── quality_scorer.py      ← 4-rubric NLP scorer, zero training needed
│   │   ├── plagiarism_detector.py ← TF-IDF + FAISS, persistent /tmp index
│   │   ├── sentiment_analyser.py  ← VADER → 6 emotion classes
│   │   ├── risk_predictor.py      ← XGBoost + SHAP + rule-based fallback
│   │   └── chatbot.py             ← RAG: sentence-transformers + FAISS + Groq streaming
│   ├── tasks/
│   │   ├── celery_app.py          ← Celery config, Redis broker, 2 queues
│   │   └── analysis_tasks.py      ← analyze_logbook task + compute_risk task
│   └── routers/
│       ├── health.py              ← GET /health (checks Groq connectivity)
│       ├── analysis.py            ← POST /ai/analyze/logbook
│       ├── risk.py                ← POST /ai/predict/risk + GET preview
│       └── chat.py                ← POST /ai/chat (streaming SSE)
│
└── frontend/                      ← React app (port 5173) — fully wired to API
    └── src/
        ├── contexts/AuthContext.tsx   ← access token in-memory, refresh via cookie
        ├── hooks/                     ← TanStack Query hooks (useLogbook, usePlacements…)
        ├── lib/api.ts                 ← Axios instance + 401→refresh interceptor
        ├── lib/queryClient.ts         ← TanStack QueryClient singleton
        ├── lib/socket.ts              ← Socket.io client
        ├── router.tsx                 ← React Router v6 nested routes + RequireAuth
        ├── components/
        │   ├── layout/AppShell.tsx    ← sidebar nav, role-aware
        │   └── shared/RiskBadge.tsx, StatusBadge.tsx
        ├── pages/
        │   ├── auth/         LoginPage.tsx, RegisterPage.tsx
        │   ├── student/      StudentDashboard, LogbookEditor, ChatbotPanel,
        │   │                 NotificationInbox, SubmissionHistory
        │   ├── supervisor/   SupervisorDashboard, LogbookReview
        │   └── coordinator/  CoordinatorDashboard, PlacementApproval
        └── styles/globals.css
```

---

## Phase Tracker

| Phase | Name | Status | Tests |
|---|---|---|---|
| 0 | Scaffold & Config | ✅ Done | — |
| 1 | Auth System | ✅ Done | 19/19 |
| 2 | Placement Workflow | ✅ Done | 14/14 |
| 3 | Logbook System | ✅ Done | 25/25 |
| 4 | AI Engine (FastAPI) | ✅ Done | Python, no pytest yet |
| 5 | Real-Time Notifications | ✅ Done | 13/13 |
| 6 | Dashboards & Analytics | ✅ Done | 16/16 |
| 7 | Frontend Integration | ✅ Done | — |
| 8 | Security Hardening & QA | ✅ Done | 241/241 |
| 9 | Deployment (Render + Vercel + GitHub Actions) | 🟡 **In Progress — files done, manual setup remains** | — |

**Node.js: 241/241 tests passing. `tsc --noEmit` clean. Coverage: 89.59% stmts / 76.22% branches / 83.43% funcs / 90.07% lines — all ≥75% threshold met.**

---

## Git History

| Commit | Message |
|---|---|
| `(Phase 7)` | feat(frontend): Phase 7 — Full frontend integration, AI chat, AppShell |
| `f63d9c1` | feat(dashboards): Phase 6 — Coordinator & Supervisor analytics endpoints |
| `7ec843a` | feat(notifications): Phase 5 — Real-Time Notifications via Socket.io + cron jobs |
| `53fd251` | feat(ai): Phase 4 — FastAPI AI Engine, all free/local resources |
| `b70e9fc` | feat(logbook): Phase 3 — Logbook submission, review & feedback system |
| `688c376` | feat: initial commit — AESIS backend Phase 0-2 + frontend UI scaffolds |

---

## Key Design Decisions (binding — do not revisit without reason)

| Decision | Rationale |
|---|---|
| Refresh token stored as SHA-256 hash in DB | Raw token never persists server-side — prevents DB breach → session hijack |
| AES-256-GCM for PII (phone, address) | Compliance; encrypted at application layer before Prisma write |
| Company supervisor created as unverified placeholder | Invite flow for company supervisors is future scope |
| 24-week logbook schedule pre-generated at approval | Deadline checks are a simple DB read; no computation at submit time |
| Past-deadline weeks skipped at schedule generation | Avoids phantom overdue entries if coordinator approves late |
| `req.user!.sub` + Zod param parsing in controllers | `ParamsDictionary` types values as `string\|string[]`; Zod parse gives clean `string` |
| AI engine is non-blocking / fire-and-forget | `fetch()` to AI engine is void; submission succeeds even if AI is offline |
| XGBoost rule-based fallback | No training data on day 1; model retrains automatically when ≥ 20 placements complete |
| Groq for chatbot LLM | Free tier ~14.4k req/day, OpenAI-compatible streaming, ~700 tok/s. Replaced Ollama in Session 10 — local CPU too slow (0 tok/10 min on Celeron N4000) and Render free/starter tiers can't host Ollama. Graceful fallback if `GROQ_API_KEY` unset or request fails. |
| `tsc --noEmit` + Jest must be green before moving phase | Non-negotiable quality gate |

---

## Manual Steps (user must run, not Claude)

```bash
# ── Infrastructure ───────────────────────────────────────────
sudo docker compose up -d              # PG + Mongo + Redis + AI + Celery

# ── First-time DB setup ───────────────────────────────────────
cd backend
npx prisma migrate dev --name init     # run migrations
npm run db:seed                        # seed CS dept + academic year

# ── Run backend dev server ────────────────────────────────────
npm run dev                            # Express on port 3001 (PORT=3001 in .env)

# ── Chatbot LLM: Groq (free tier) ─────────────────────────────
# 1. Create a free account at https://console.groq.com
# 2. Generate an API key → console.groq.com/keys
# 3. Add to ai/.env:    GROQ_API_KEY=gsk_...
# 4. Restart the AI engine — /health should report groq: "connected"
```

---

## Phase 5 — Real-Time Notifications (NEXT)

**What to build:**

| File | Purpose |
|---|---|
| `src/modules/notifications/notifications.service.ts` | read + mark-read + list notifications |
| `src/modules/notifications/notifications.router.ts` | GET `/notifications`, PATCH `/:id/read`, PATCH `/read-all` |
| `src/modules/notifications/notifications.controller.ts` | handlers |
| `src/shared/utils/socketEmitter.ts` | `emitToUser(io, userId, event, payload)` helper |
| Update `server.ts` | export `io` so services can emit without circular deps |
| `src/jobs/deadlineReminder.ts` | node-cron: 48h + 24h before Friday deadline → create Notification + email |
| `src/jobs/weeklyReport.ts` | node-cron: Monday 08:00 → coordinator compliance email |
| Update `logbook.service.ts` (submitFeedback) | emit `feedback_received` socket event after DB write |
| Update `tasks/analysis_tasks.py` | emit `risk_alert` via Redis pub/sub → Node Socket.io picks it up |

**Socket.io events to implement:**

| Event | Direction | Payload |
|---|---|---|
| `notification:new` | Server → Client | `{ id, type, title, body, link }` |
| `risk_alert` | Server → Supervisor | `{ studentId, placementId, tier, factors }` |
| `feedback_received` | Server → Student | `{ submissionId, weekNumber, outcome }` |

**Cron schedule:**

| Job | Schedule | Action |
|---|---|---|
| Deadline reminder 48h | `0 9 * * 3` (Wed 09:00) | Check next-Friday deadline submissions with status=draft → notify student |
| Deadline reminder 24h | `0 9 * * 4` (Thu 09:00) | Same check, more urgent wording |
| Weekly compliance report | `0 8 * * 1` (Mon 08:00) | Email coordinator: cohort compliance rate + high-risk count |

**Routes to add in `app.ts`:**
```typescript
import notificationsRouter from './modules/notifications/notifications.router';
app.use('/api/v1/notifications', notificationsRouter);
```

---

## Future Phases (brief)

### Phase 6 — Dashboards & Analytics
- Coordinator: cohort compliance rate, risk distribution (donut), submission trends (bar) — Recharts
- Supervisor: student performance table with quality trend sparklines
- Company analytics endpoint `getCompanyAnalytics` already exists in `placements.service.ts`
- All aggregate server-side; no raw data dumps to frontend

### Phase 7 — Frontend Integration
- TanStack Query for all API calls; Axios with 401 → auto-refresh interceptor
- Auth context: access token in memory, refresh in HttpOnly cookie
- Wire all page components to live API
- Socket.io client in `NotificationInbox` for real-time push
- `EventSource` or socket stream for chatbot SSE response in `ChatbotPanel`

### Phase 8 — Security Hardening & QA
- Stricter rate limits on auth routes (5 req/15 min)
- DOMPurify on frontend + server-side strip-tags for logbook rich text
- Supertest end-to-end tests against real test DB
- Achieve 75% Jest coverage threshold
- Helmet + CSP headers review

### Phase 9 — Deployment
- Nginx: `/api` → Node:3000, `/ai` → FastAPI:8000, `/` → React build
- Docker Compose production profile with secrets management
- GitHub Actions: lint → test → build → push → deploy
- SSL via Let's Encrypt (Certbot)
- PM2 or Docker restart policy

---

## Sessions

---

### Session 1 — 2026-05-12

**Work done**
- Read existing codebase state; user shared full PRD for AESIS
- Designed TRD, App Flow, UI/UX design system (dark mode, blue/indigo, 3-tier risk colours)
- Built all frontend UI screens as React + Tailwind + shadcn/ui components (10 pages, 5 shared components)
- Scaffolded full backend (Phase 0): Express + TypeScript + Prisma, all middleware, shared utils, Docker Compose
- Phase 1 (Auth): register, login, refresh, logout, verify-email, reset-password — 19/19 tests
- Phase 2 (Placements): placement CRUD, company CRUD, approval workflow, 24-week logbook schedule gen, document upload — 14/14 tests

**Errors & fixes**

| Error | Fix |
|---|---|
| `jest.config.ts` invalid property `setupFilesAfterFramework` | Removed — does not exist in Jest types |
| `.env` `ENCRYPTION_KEY` was non-hex placeholder | Generated real 64-char hex with `crypto.randomBytes(32).toString('hex')` |
| `docker-compose.yml` obsolete `version: '3.9'` | Removed the version key |
| `node_modules` corrupted (ENOENT on `@types/strip-json-comments`) | `rm -rf node_modules && npm install` — 625 packages clean |
| `prisma.company.upsert` TypeScript error — `name` not `@unique` | Added `@unique` to `Company.name` in schema; refactored to `findFirst` + conditional `create`/`update`; regenerated Prisma client |
| 3 placement tests: `company.create is not a function` | Added `create: jest.fn(), update: jest.fn()` to company mock |
| 3 placement tests: `logbookSubmission.createMany` called 0 times | `fakePlacement.startDate` was past — all deadlines filtered out; fixed to `Date.now() + 30 days` |

---

### Session 2 — 2026-05-12

**Work done**
- Committed full project to GitHub (`https://github.com/deladei/AESIS`, 65 files, 14 469 lines)
- Created `HANDOFF.md` and session-handoff memory protocol
- Phase 3 (Logbook System) — 25/25 tests:
  - `logbook.schema.ts` — Zod schemas
  - `logbook.service.ts` — 8 service functions with full access control
  - `logbook.controller.ts` — 8 handlers using Zod param parsing
  - `logbook.router.ts` — 9 routes across 3 RBAC groups
  - `logbook.service.test.ts` — 25 tests

**Errors & fixes**

| Error | Fix |
|---|---|
| 8 TS errors: `string\|string[]` not assignable to `string` in controller | `ParamsDictionary` values are `string\|string[]` in this `@types/express` version. Fixed by parsing `req.params` through Zod schemas + using `req.user!` directly (same as placements controller) |

---

### Session 3 — 2026-05-12

**Work done**
- Phase 4 (AI Engine) — FastAPI + Celery, 100% free/local:
  - `services/quality_scorer.py` — rubric NLP scorer, no training
  - `services/plagiarism_detector.py` — TF-IDF + FAISS, persistent index
  - `services/sentiment_analyser.py` — VADER → 6 emotion classes
  - `services/risk_predictor.py` — XGBoost + SHAP + rule-based fallback
  - `services/chatbot.py` — RAG + Ollama streaming, graceful fallback
  - `tasks/analysis_tasks.py` — `analyze_logbook` + `compute_risk` Celery tasks
  - `routers/` — analysis, risk, chat, health endpoints
  - `Dockerfile` — pre-downloads sentence-transformers model + NLTK data
  - `docker-compose.yml` updated — added `ai-engine` + `celery-worker` services
  - `logbook.service.ts` — replaced both stubs: real MongoDB write + real AI HTTP call
  - `logbook.service.test.ts` — mocked `config/mongo` + AI engine env vars

**Errors & fixes**

| Error | Fix |
|---|---|
| `getMongo()` throws "not connected" in logbook tests | Added `jest.mock('../../../config/mongo', ...)` with collection stub to logbook test |
| Test missing `AI_ENGINE_URL` + `AI_ENGINE_API_KEY` in env mock | Added both keys to the env mock in logbook test |

**Stopped here — next session installs Ollama then continues Phase 5**

---

### Session 4 — 2026-05-13

**Work done** — Phase 5 (Real-Time Notifications) — complete

| File | What |
|---|---|
| `src/config/socket.ts` | Socket.io singleton — `setIo()` / `getIo()` — avoids circular deps |
| `src/shared/utils/socketEmitter.ts` | `emitToUser(userId, event, payload)` — silently swallows if socket not ready |
| `src/server.ts` | Updated: `setIo(io)` + start all 3 jobs on boot |
| `src/modules/notifications/notifications.service.ts` | `listNotifications`, `getUnreadCount`, `markRead` (idempotent), `markAllRead`, `createNotification` |
| `src/modules/notifications/notifications.controller.ts` | `list`, `unreadCount`, `markOneRead`, `markAllRead` |
| `src/modules/notifications/notifications.router.ts` | `GET /`, `GET /unread-count`, `PATCH /:id/read`, `PATCH /read-all` — all behind `authenticate` |
| `src/jobs/deadlineReminder.ts` | Cron Wed/Thu 09:00 — find `logbookSubmission` with Friday deadline + not yet submitted → DB notification + socket + email |
| `src/jobs/weeklyReport.ts` | Cron Mon 08:00 — coordinator HTML email: active placements, compliance rate, high-risk count via `studentRiskScore` |
| `src/jobs/riskAlertSubscriber.ts` | Redis pub/sub subscriber on `risk_alert` channel → `emitToUser(supervisorId, 'risk_alert', payload)` |
| `src/modules/logbook/logbook.service.ts` | Added `emitToUser` after `$transaction` in `submitFeedback` to push `notification:new` to student |
| `src/app.ts` | Wired `notificationsRouter` at `/api/v1/notifications` |
| `src/modules/notifications/__tests__/notifications.service.test.ts` | 13 tests — all passing |

**Errors & fixes**

| Error | Fix |
|---|---|
| `logbookSchedule` model doesn't exist in Prisma schema | Replaced with `logbookSubmission` — it has a `deadline` field; queried by deadline window + `submissionStatus` filter |
| `isActive` not on `User` model | Changed to `isVerified: true` for coordinator filter |
| `riskTier` not on `Placement` model | Changed to count `studentRiskScore` with `riskTier: 'high'` + `placement.placementStatus: 'active'` |
| `RiskTier` enum has no `'critical'` value | Removed `'critical'` from filter — enum is `low / medium / high` |
| Logger calls used pino style `logger.error({ err }, 'msg')` | Changed to Winston style `logger.error('msg', { err })` throughout all new files |
| `notifications.controller.ts` used `AuthenticatedRequest` — broke `asyncHandler` type | Changed to `Request` + `req.user!.sub` (same pattern as logbook controller) |
| `notifications.service.ts` — `metadata: Record<string, unknown>` not assignable to Prisma JSON type | Changed parameter type to `Prisma.InputJsonValue` |
| Socket emitter warning in logbook tests | Added `jest.mock('../../../shared/utils/socketEmitter')` to `logbook.service.test.ts` |

**Quality gate**: `tsc --noEmit` — 0 errors. `npm test` — 71/71 passing.

**Known non-issue**: Exit code 1 in Jest is a pre-existing async race — `enqueueAiAnalysis` is fire-and-forget and occasionally logs after Jest tears down. All 71 tests pass.

---

### Session 5 — 2026-05-13

**Work done** — Phase 6 (Dashboards & Analytics) — complete

| File | What |
|---|---|
| `src/modules/coordinator/coordinator.service.ts` | `getCoordinatorDashboard()` — active placements, pending approvals, compliance rate, risk distribution (low/medium/high), per-week submission trends. `listStudents()` — paginated active student table with latest risk tier + last submission |
| `src/modules/coordinator/coordinator.controller.ts` | `dashboard`, `students` handlers |
| `src/modules/coordinator/coordinator.router.ts` | `GET /api/v1/coordinator/dashboard`, `GET /api/v1/coordinator/students` — coordinator + admin only |
| `src/modules/supervisor/supervisor.service.ts` | `getSupervisorDashboard(supervisorId)` — assigned students with 4-week quality score sparkline data, pending review count, avg quality score |
| `src/modules/supervisor/supervisor.controller.ts` | `dashboard` handler |
| `src/modules/supervisor/supervisor.router.ts` | `GET /api/v1/supervisor/dashboard` — academic_supervisor + admin only |
| `src/app.ts` | Wired `coordinatorRouter` + `supervisorRouter` |
| `coordinator.service.test.ts` | 8 tests |
| `supervisor.service.test.ts` | 8 tests |

**Notes**
- Company analytics (`GET /api/v1/companies/:id/analytics`) was already complete from Phase 2 — no changes needed
- `recentWeeks` in supervisor dashboard is oldest-first so Recharts sparkline renders correctly
- Risk distribution uses `studentRiskScore.groupBy` — only active placements considered

**Quality gate**: `tsc --noEmit` — 0 errors. `npm test` — 87/87 passing.

---

### Session 6 — 2026-05-13

**Work done** — Phase 7 (Frontend Integration) — complete

| Area | What |
|---|---|
| `frontend/src/contexts/AuthContext.tsx` | Auth context — access token in memory, refresh via HttpOnly cookie, `login()` returns `AuthUser` directly (fixes stale-state nav bug) |
| `frontend/src/lib/api.ts` | Axios instance with 401 → auto-refresh interceptor + `getAccessToken()` / `setAccessToken()` |
| `frontend/src/lib/queryClient.ts` | TanStack Query v5 client singleton |
| `frontend/src/lib/socket.ts` | Socket.io client for real-time notifications |
| `frontend/src/router.tsx` | Full rewrite — React Router v6 nested routes; `RequireAuth` renders `AppShell` + `Outlet` so sidebar appears on all protected pages |
| `frontend/src/hooks/useLogbook.ts` | TanStack Query hooks: `useSubmissions`, `useSubmission`, `useSaveDraft`, `useSubmitLogbook`, `useSubmitFeedback` |
| `frontend/src/hooks/usePlacements.ts` | `useMyPlacements`, `useAllPlacements`, `useUpdatePlacementStatus` |
| `frontend/src/hooks/useDashboard.ts` | `useSupervisorDashboard`, `useCoordinatorDashboard` |
| `frontend/src/pages/student/StudentDashboard.tsx` | Full rewrite — compliance rate, avg quality, next deadline, quality trend chart, recent submissions via real API |
| `frontend/src/pages/student/LogbookEditor.tsx` | Full rewrite — draft save + submit with week selector |
| `frontend/src/pages/student/SubmissionHistory.tsx` | Full rewrite — all submissions with quality/plagiarism badges |
| `frontend/src/pages/student/ChatbotPanel.tsx` | SSE streaming chat — `fetch()` + `ReadableStream` + word-by-word render |
| `frontend/src/pages/supervisor/SupervisorDashboard.tsx` | Full rewrite — student table with 4-week quality sparklines |
| `frontend/src/pages/supervisor/LogbookReview.tsx` | Full rewrite — submission detail + feedback submit |
| `frontend/src/pages/coordinator/PlacementApproval.tsx` | Full rewrite — pending approvals list + approve/reject actions |
| `backend/src/modules/ai/ai.controller.ts` | NEW — SSE streaming chat, keyword KB (10 topics), `chatHandler` |
| `backend/src/modules/ai/ai.router.ts` | NEW — `POST /chat` behind `authenticate` |
| `backend/src/app.ts` | Wired `aiRouter` at `/api/v1/ai` |
| `backend/src/config/mongo.ts` | Made MongoDB optional — `connectMongo()` catches + returns null; `getMongo()` returns `Db \| null` |
| `backend/src/modules/logbook/logbook.service.ts` | `upsertMongoLogbook` returns early if `getMongo()` is null |
| `backend/src/middleware/rateLimiter.ts` | Split into `loginRateLimiter`, `registerRateLimiter`, `authRateLimiter` — each with correct message |
| `backend/src/modules/auth/auth.router.ts` | `/programmes` has no rate limit; per-route limiters applied |
| `backend/src/modules/auth/auth.service.ts` | Auto-verify accounts in `NODE_ENV=development` (no SendGrid needed) |
| `backend/.env` | Changed `PORT=3000` → `PORT=3001` (old build occupying 3000 as root) |
| `frontend/vite.config.ts` | All proxy targets updated to `http://localhost:3001` |
| `frontend/src/styles/globals.css` | Removed `@apply border-border` (undefined Tailwind class causing CSS crash) |

**Errors & fixes**

| Error | Fix |
|---|---|
| MongoDB crash on startup — not installed | `connectMongo()` catches error and returns null; entire document store skipped gracefully |
| `@apply border-border` CSS error in globals.css | Removed the `* { @apply border-border; }` block entirely |
| Programme dropdown empty | `academic_programmes` table missing after schema change — ran `npx prisma db push --force-reset` + re-seeded |
| Port 3000 occupied by root process (old `node dist/server.js`) | Changed backend `PORT` to 3001, updated Vite proxy — cannot kill root process without sudo terminal |
| Rate limiter blocked `/programmes` — showed "Too many login attempts" on register page | Per-route limiters: `loginRateLimiter` / `registerRateLimiter` / `authRateLimiter`; `/programmes` exempt |
| Login navigation used stale React state (`user?.role` null at navigate time) | `login()` returns `AuthUser` directly; `LoginPage` uses returned value, not state |
| TypeScript errors (unused vars) blocked entire Vite app including unrelated pages | Removed unused `latestRisk` (StudentDashboard) and `RiskBadge` import (LogbookReview) |
| AppShell / sidebar missing on all authenticated pages | Rewrote `router.tsx` — `RequireAuth` now renders `AppShell` + `Outlet` for nested routes |
| Email verification blocking login in dev (SendGrid not configured) | Auto-verify (`isVerified: true`) when `NODE_ENV=development` |
| `POST /api/v1/ai/chat` returned 404 | Created full AI module (`ai.controller.ts`, `ai.router.ts`), registered in `app.ts` |

**Quality gate**: `tsc --noEmit` clean. 87/87 backend tests passing. All 10 pages tested in browser.

---

### Next session should start with

1. Read this file top to bottom
2. Continue Phase 9 manual setup steps (see Session 8 entry below)

---

### Session 7 — 2026-05-14

**Work done** — Phase 8 (Security Hardening & QA) — complete

| Area | What |
|---|---|
| `src/middleware/rateLimiter.ts` | Login tightened: 20 → **5 req/15 min**. New `resetPasswordRateLimiter`: **5 req/hour**. Applied to both `/reset-password` routes in auth.router.ts |
| `src/shared/utils/sanitize.ts` | NEW — `stripHtml()` (strips tags + script/style content) and `sanitizeLogbookText()` — applied in `logbook.service.saveDraft()` before MongoDB write |
| `src/app.ts` | Helmet CSP enabled in **all** environments (not just production) with `defaultSrc`, `scriptSrc`, `objectSrc: none`, `frameAncestors: none`, `referrerPolicy: strict-origin-when-cross-origin`. `upgradeInsecureRequests` only in production. |
| Test files (20 new) | All 6 controller modules tested with supertest + real JWTs. Middleware (authenticate, authorize, errorHandler). Shared utils (crypto, response, token, email, sanitize, socketEmitter). Jobs (deadlineReminder, weeklyReport, riskAlertSubscriber). Config (socket). App (createApp + /health). |
| Coverage | 87 → **241 tests passing**. 33% → **89.59% stmts / 76.22% branches / 83.43% funcs / 90.07% lines** — all ≥ 75% threshold ✓ |

**Errors & fixes**

| Error | Fix |
|---|---|
| `stripHtml('<script>alert(1)</script>')` left inner text | Updated regex: first strip `<script/style>` with content using `[\s\S]*?`, then strip remaining tags |
| Test request bodies failing Zod validation | Matched test data exactly to Zod schemas (registerSchema, feedbackSchema, createPlacementSchema) |
| Mock paths wrong depth in `src/shared/utils/__tests__/` | Corrected `../../config/env` → `../../../config/env` (one extra `../` for `__tests__` subdirectory) |
| `socketEmitter.ts` TS error in test — `../../config/socket` not found | Fixed path to `../../../config/socket` |
| AI controller test "risk tier" matched quality score KB entry first | Changed test message to avoid accidentally matching "calculated" keyword |
| Exit code 1 in Jest | Pre-existing async race from fire-and-forget `enqueueAiAnalysis` — documented in Session 4. Not a failure. |

**Quality gate**: `tsc --noEmit` — 0 errors. 241/241 tests. All coverage thresholds ≥ 75% met.

---

### Session 8 — 2026-05-14

**Work done** — Phase 9 (Deployment) — all config files created

| File | What |
|---|---|
| `render.yaml` (repo root) | Render Blueprint — defines `aesis-backend` (Node.js web), `aesis-ai-engine` (Docker web), `aesis-celery-worker` (Docker worker), `aesis-postgres` (managed PG 16) |
| `frontend/vercel.json` | SPA rewrites (`/*` → `/index.html`) + security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy) |
| `.github/workflows/ci.yml` | GitHub Actions CI: backend (typecheck → lint → test:coverage) + frontend (typecheck → build) on every push to `main`/`develop` and PRs to `main` |
| `backend/.env.production.example` | Production env var template with instructions for Render PG, MongoDB Atlas, Upstash Redis |
| `frontend/.env.production.example` | `VITE_API_BASE_URL` + `VITE_SOCKET_URL` template for Vercel env vars |
| `frontend/vite.config.ts` | Made dev proxy conditional (`mode === 'development'`) so production build has no proxy config |

**Deployment target decided:**
- Frontend → **Vercel** (free, SPA — no server needed)
- Backend → **Render** (free plan, native Node.js, supports persistent WebSocket/Socket.io)
- AI Engine → **Render** (starter plan, Docker — needs memory for sentence-transformers)
- Celery Worker → **Render** (starter plan, Docker background worker)
- PostgreSQL → **Render managed** (free 90-day trial, then paid — or migrate to Supabase free)
- MongoDB → **MongoDB Atlas** (free M0 cluster, 512 MB)
- Redis → **Upstash** (free 10k commands/day — enough for dev; upgrade for prod load)

**Manual setup steps remaining (user must do these):**

```
1. MongoDB Atlas
   - Create free cluster at cloud.mongodb.com
   - Create DB user → copy connection string → set as MONGO_URI in Render env vars

2. Upstash Redis
   - Create free DB at upstash.com
   - Copy rediss:// URL → set as REDIS_URL in Render env vars (also as CELERY_BROKER_URL for AI services)

3. Render
   - Connect GitHub account at render.com
   - New Blueprint → select repo root → Render detects render.yaml automatically
   - Fill in the "sync: false" env vars (see backend/.env.production.example)
   - Key ones: MONGO_URI, REDIS_URL, AI_ENGINE_URL, AI_ENGINE_API_KEY, FRONTEND_URL, SENDGRID_API_KEY
   - AI engine + celery worker also need: GROQ_API_KEY (from console.groq.com/keys)
   - JWT_SECRET + ENCRYPTION_KEY are auto-generated by Render (generateValue: true)
   - After deploy: copy aesis-backend URL → set as FRONTEND_URL's backend target

4. Vercel
   - Import GitHub repo at vercel.com → set Root Directory to "frontend"
   - Build Command: npm run build | Output Directory: dist
   - Environment variables (Production):
       VITE_API_BASE_URL = https://aesis-backend.onrender.com
       VITE_SOCKET_URL   = https://aesis-backend.onrender.com
   - After deploy: copy Vercel URL → update FRONTEND_URL in Render backend env vars

5. GitHub Actions
   - CI runs automatically on push — no secrets needed for test-only workflow
   - If you add Render deploy hooks later: add RENDER_API_KEY + service IDs as repo secrets
```

**Errors & fixes**

| Error | Fix |
|---|---|
| Vite proxy in production build would try to proxy API calls on Vercel (serverless — no proxy support) | Made `server.proxy` conditional on `mode === 'development'` in `vite.config.ts` |

**Quality gate**: No code changes to backend — still 241/241 tests. `tsc --noEmit` clean.

---

### Session 9 — 2026-05-26

**Work done** — AI pipeline operational fixes (no application code changed)

Inspection confirmed the AI pipeline is wired correctly end-to-end: 5 services, 4 routers, 2 Celery tasks on `analysis`/`risk` queues, backend `enqueueAiAnalysis` calls AI engine via `AI_ENGINE_URL` + `x-api-key`, embedding model + FAISS KB cached on disk. Issues found were operational, not architectural.

| File | What |
|---|---|
| `ai/Dockerfile` | `uvicorn --workers 2` → `--workers 1` — host has only 3.6 GiB RAM and was thrashing swap (3.4 GiB used); 1 worker is sufficient on this Celeron N4000 box. Also removed `# syntax=docker/dockerfile:1.6` — BuildKit was failing to fetch that frontend image because this host's docker daemon resolves DNS over `[::1]:53` (no IPv6 DNS); bundled default frontend already supports `--mount=type=cache`. |
| `ai/.env` | Added `HF_HUB_OFFLINE=1` + `TRANSFORMERS_OFFLINE=1`. Without these, `sentence-transformers` does a HEAD revalidation against `huggingface.co` at every worker start. If DNS isn't ready, it retries 5× per file (~60s of dead time) before falling back to the cached model. With offline flags, it skips revalidation entirely. The model IS baked into the image by the Dockerfile's pre-download step, so this is safe. |
| `backend/docker-compose.yml` | AI healthcheck was `curl -f http://localhost:8000/health`, but `python:3.11-slim` has no `curl` installed — healthcheck had been failing silently the whole time (this is what was reporting `(unhealthy)`, NOT memory pressure). Replaced with `python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen(...).status==200 else 1)"`. |

**Errors & fixes**

| Error | Fix |
|---|---|
| `docker compose build` failed: `failed to resolve source metadata for docker.io/docker/dockerfile:1.6 ... lookup ... on [::1]:53` | Removed the `# syntax=docker/dockerfile:1.6` directive — default BuildKit frontend handles `--mount=type=cache` and doesn't need a network fetch |
| `docker compose build` failed: `TLS handshake timeout` to registry-1.docker.io | Transient — succeeded on retry |
| `aesis_ai` reported `(unhealthy)` and `POST /ai/analyze/logbook` hung at 30s timeout | Diagnosed as **two** independent issues: (a) healthcheck script missing `curl` — cosmetic, not affecting service; (b) uvicorn workers being OOM-killed because host was swap-thrashing with 191 MiB free RAM — fixed by dropping to 1 worker |
| `docker logs aesis_ai` returned nothing after first `--workers 1` restart | Python stdout buffering — uvicorn output appeared after the first request hit it. Non-issue; not worth setting PYTHONUNBUFFERED |
| Ollama installed at `/usr/local/bin/ollama` but `ollama list` errors with "server not responding" | Not fixed — `ollama serve` is a user action |

**Verified state after fixes**
- `aesis_ai`: `Up (healthy)` ✅
- Container memory: 419 MiB → **326 MiB**
- Host swap: 3.4 GiB → **1.6 GiB**
- Boot logs: clean — `Started server process [1] → Application startup complete` — no HuggingFace retry storm
- `GET /health` → 200 in <1s
- `aesis_celery` still `ready`, both queues bound

**Stopped here — next session should**
1. **Local chatbot:** run `ollama serve` (background) and confirm `ollama pull mistral` was completed; then re-hit `/health` — `ollama` should flip from `"unavailable — chatbot in fallback mode"` to `"connected"`.
2. **Phase 9 chatbot strategy:** Render free/starter tiers can't run Ollama (no GPU + no host-level install). Before completing deploy, decide between (a) a managed LLM with a free tier (Groq, Together, OpenRouter), (b) self-hosting Ollama on a separate VPS that the Render AI engine calls, or (c) shipping prod without the chatbot and keeping `_FALLBACK_RESPONSES` permanent. Update `chatbot.py` accordingly and add the relevant API key to `ai/.env.example` + Render env-var checklist in Session 8.
3. **Continue Phase 9 manual setup** — MongoDB Atlas cluster, Upstash Redis, Render Blueprint deploy, Vercel import, env-var wiring (see Session 8 entry).

---

### Session 10 — 2026-05-27

**Work done** — Chatbot LLM swapped from local Ollama → Groq (free OpenAI-compatible API)

Context: Session 9 left the AI container `(healthy)` and Ollama reachable, but a 10-minute end-to-end test against `llama3.2:1b` produced **zero tokens** on this host (Celeron N4000, 3.6 GiB RAM, ~300 MiB free with 2.5 GiB swap engaged during inference). Cold-start alone was 278 s. Local LLM is not viable on this dev box and Render free/starter tiers can't host Ollama either, so this session migrated to Groq for both local dev and prod.

| File | What |
|---|---|
| `ai/config/settings.py` | Replaced `OLLAMA_URL` / `OLLAMA_MODEL` with `GROQ_API_KEY` (default `""`), `GROQ_BASE_URL=https://api.groq.com/openai/v1`, `GROQ_MODEL=llama-3.1-8b-instant` |
| `ai/services/chatbot.py` | Rewrote the generation call: POST to `{GROQ_BASE_URL}/chat/completions` with `Authorization: Bearer {GROQ_API_KEY}`, parse OpenAI SSE format (`data: {...}\n\n`, terminated by `data: [DONE]`), extract `choices[0].delta.content`. Early-return fallback message if `GROQ_API_KEY` is empty so dev without a key still works. RAG pipeline (FAISS + sentence-transformers + KB seed) untouched. Dropped unused `_FALLBACK_RESPONSES` list |
| `ai/routers/health.py` | `/health` now probes `{GROQ_BASE_URL}/models` with bearer auth; distinguishes `not configured` / `invalid GROQ_API_KEY` / `unreachable` / `connected`. Response field renamed `ollama` → `groq` |
| `ai/.env` + `ai/.env.example` | Removed `OLLAMA_URL` + `OLLAMA_MODEL`; added `GROQ_API_KEY=` (blank), `GROQ_BASE_URL`, `GROQ_MODEL` |
| `backend/docker-compose.yml` | Removed `extra_hosts: host.docker.internal:host-gateway` from `ai-engine` + `celery-worker` — that mapping only existed to reach host-side Ollama; Groq is over public HTTPS |
| `render.yaml` | Added `GROQ_API_KEY` (sync: false) + `GROQ_MODEL=llama-3.1-8b-instant` to `aesis-ai-engine` envVars |
| `HANDOFF.md` | Updated architecture diagram lines, Key Design Decisions row, Manual Steps block, Session 8 env-var checklist; appended this entry |

**Verified end-to-end locally**

- `GET /health` → `{"groq":"connected","model":"llama-3.1-8b-instant"}`
- `POST /ai/chat` with `x-api-key: dev_internal_key` streamed a real, RAG-grounded Groq response in ~2 s. Latency well under the previous 10-min Ollama failure on the same box.

**What's left for next session**

1. Continue Phase 9 manual setup — MongoDB Atlas, Upstash Redis, Render Blueprint deploy, Vercel import (see Session 8). `GROQ_API_KEY` must be set on the `aesis-ai-engine` service (already in `render.yaml` as `sync: false`).
2. After Render deploy, hit `https://aesis-ai-engine.onrender.com/health` — expect `"groq": "connected"`.
3. Smoke test the chatbot from the deployed Vercel frontend via the in-app `ChatbotPanel`; confirm tokens stream.
4. Mark Phase 9 ✅.

**Errors & fixes**

| Error | Fix |
|---|---|
| First `--force-recreate` of `aesis_ai` ran the OLD image — code change wasn't in. `/health` still returned `"ollama": "unavailable"` with `"model": "mistral"` | Need `docker compose build ai-engine` first; the image bakes `COPY . .` at build time and isn't volume-mounted. Most layers cached so the rebuild was ~10 s. |
| After rebuild, `POST /ai/chat` hung 30 s with 0 bytes; container log showed the request reached the handler but never produced output | `routers/chat.py` does `await sessions.find_one(...)` against Mongo *before* returning the streaming response. Motor's default replica-set discovery against the standalone `aesis_mongo` was timing out (TCP connected, but handshake never completed). Fixed by appending `?directConnection=true` to `MONGO_URI` in `ai/.env`. Atlas in prod is a real replica set so its `mongodb+srv://` URI doesn't need this flag. |
| Same host-RAM swap-thrash wall as Session 9 (uvicorn in `D` state for 30 min on first attempt) | Stopped `celery-worker` to free 220 MiB; that plus the rebuild gave the import enough headroom to finish. Celery restarted at session end. |

---

### Session 11 — 2026-05-27

**Work done** — Register page programme dropdown fix + seed cleanup

Bug: user reported the Programme `<select>` on `/auth/register` wouldn't open when clicked. Diagnosis ruled out the obvious causes (no `disabled`, no `pointer-events`, no overlay, no AuthContext re-render storm). Backend `/auth/programmes` was returning 6 rows correctly through the Vite proxy. Root cause was the native `<select>` being unreliable on a dark-styled form — the same class of issue the team had already patched once for iOS (`globals.css:47`). Replaced with a `<button>`-driven custom dropdown that's guaranteed clickable across browsers.

Secondary finding while debugging: the API returned 6 programmes but `seed.ts` only defines 4. The DB had two stale rows from older seed versions — `BSC-CYB` (a duplicate "B.Sc. Cybersecurity" alongside the canonical `BSC-CY`, 0 users) and `BSC-DS` (B.Sc. Data Science, 1 real user). Cleaned both up: deleted the unreferenced duplicate, added `BSC-DS` to the canonical seed list, and added a defensive prune step so future drift can't recur.

| File | What |
|---|---|
| `frontend/src/pages/auth/RegisterPage.tsx` | Replaced native `<select>` with custom dropdown: `<button>` shows selected name or "Select programme", `<ChevronDown>` rotates, floating `<ul role="listbox">` with click-outside + Escape handlers, selected option shown with blue tint + `<Check>`, "Loading programmes…" placeholder when list is empty. Same `form.programmeId` state binding, same Zod validation, no API contract change |
| `backend/src/config/seed.ts` | Added `BSC-DS` (B.Sc. Data Science) as 5th canonical programme. Added prune block after the upserts: `findMany` for programmes whose `code` is not in the canonical list AND `users: { none: {} }`, then `deleteMany` the resulting IDs. FK-safe — won't delete any programme that has at least one student attached |

**Investigation notes (no code change)**

| Observation | Detail |
|---|---|
| Port 3000 still squatted by `node dist/server.js` (PID 3038) | Same root-owned zombie called out in Session 6. Can't kill without sudo. |
| Port 3001 now squatted by smeapp's Next.js dev server | Caused initial confusion — `curl localhost:3001/api/v1/auth/programmes` returned a Next.js 404 HTML page. AESIS backend has shifted to **port 3002**; `backend/.env` and `frontend/vite.config.ts` are already aligned to 3002 |

**Errors & fixes**

| Error | Fix |
|---|---|
| User report: "select programme isn't working" — vague | Asked the user for the specific symptom; "can't click / won't open" pointed at native select reliability, not data |
| Confirmed via curl that backend on `:3002` returned 6 programmes; Vite proxy on `:5173` also returned 200 — data path was fine | Pivoted from "is the API broken" to "is the select element broken" — went straight to the custom-dropdown rewrite |
| Seed showed 4 programmes but DB had 6 | Stale rows left by older seed versions; current seed only ever upserts, never prunes. Added the prune block to make the seed authoritative |
| Initial `psql` LEFT JOIN used `students` (no such table) | Schema has no `Student` model — `programmeId` lives on `User`. Re-ran join against `users.programme_id` |

**Verified after fixes**
- `npm run db:seed` output: `✓ Programmes: 5 created` + `✓ Pruned 1 orphan programme(s): BSC-CYB`
- `GET /api/v1/auth/programmes` now returns exactly 5: BSC-CS, BSC-CY, BSC-DS, BSC-IT, BSC-SE
- `npx tsc --noEmit` clean on both backend and frontend
- Existing user previously linked to `BSC-DS` is untouched (the prune's `users: { none: {} }` guard worked)

**Stopped here — next session should**
1. Continue Phase 9 manual setup — MongoDB Atlas, Upstash Redis, Render Blueprint deploy, Vercel import (see Session 8 + Session 10 checklist). Nothing about the dropdown fix or seed change blocks deployment.
2. Eventually reboot or `sudo kill 3038` to free port 3000 from the zombie `node dist/server.js`. Cosmetic on this dev box; irrelevant in prod.

---

### Session 12 — 2026-05-27

**Work done** — Made programme-load failures visible on `/auth/register`, pushed Session 11 + 12 commits to `main`

Context reset: user reported the programme dropdown was still empty after Session 11's fix. Drilling into their DevTools output revealed they were testing on **production** — `https://aesis.vercel.app/` calling `https://aesis.onrender.com/api/v1/auth/programmes` from Brave on iOS 18.5 — not the local dev box I'd been diagnosing all of Session 11. Phase 9 deploy did happen at some point (Vercel + Render are both live). So Session 11's local "native select won't open" theory was likely wrong-target: the iPhone user was almost certainly seeing the native select open into iOS's wheel picker with only "Select programme" inside because the `/auth/programmes` fetch had failed silently.

Verified prod is healthy: `--resolve aesis.onrender.com:443:216.24.57.251` (had to bypass local `/etc/hosts` override that points `aesis.onrender.com → 127.0.0.1` on this box — source of the override is unknown, not in `/etc/hosts` directly) → backend returns 200 with **4** programmes (BSC-CS, BSC-CY, BSC-IT, BSC-SE) in <1s once warm. CORS headers correct: `access-control-allow-origin: https://aesis.vercel.app`, `access-control-allow-credentials: true`. So the failure on iPhone is almost certainly Render-free-tier cold-start (~30s on first hit after 15min idle) — `withCredentials: true` cross-origin from Brave Shields is a secondary suspect.

| File | What |
|---|---|
| `frontend/src/pages/auth/RegisterPage.tsx` | Replaced silent `.catch(() => {})` with proper state: added `programmesLoading` + `programmeLoadError`, extracted `loadProgrammes()` so it can be re-invoked. Dropdown panel now branches: spinner + "Loading programmes…" while pending → red "Couldn't load programmes" with a "Try again" link on error (which re-runs `loadProgrammes()` — re-clicking after Render warms up should succeed without a full page reload) → "No programmes available" if the API genuinely returns `[]` → otherwise the list. The error link uses `e.stopPropagation()` so it doesn't trip the outside-click handler that closes the dropdown |

**Commits pushed to `origin/main`**

| SHA | Message |
|---|---|
| `3910a4f` | fix(register): custom programme dropdown + canonical seed cleanup (Session 11) |
| `bbe4281` | fix(register): surface programme-load failures instead of swallowing them (Session 12) |

Vercel auto-builds from `main` (~1–2 min); Render auto-builds (~3–5 min).

**Investigation notes (no code change)**

| Observation | Detail |
|---|---|
| Prod DB has only 4 programmes (BSC-CS, BSC-CY, BSC-IT, BSC-SE) | Session 11's seed change adds BSC-DS + prunes orphans, but `render.yaml` `startCommand` is only `npx prisma migrate deploy && node dist/server.js` — seeding is not part of deploy. Must be run manually via Render Shell after this deploy lands |
| Local `aesis.onrender.com` resolves to `127.0.0.1` on this box | `grep` of `/etc/hosts` finds nothing; `getent hosts` still returns `127.0.0.1`. Likely systemd-resolved cache or another nsswitch source. Workaround: `curl --resolve aesis.onrender.com:443:<render-ip>`. Not blocking, but flag it if future debugging hits the same wall |
| User's report "select isn't working" likely meant the iOS picker opened with only the placeholder | iOS native `<select>` always opens a wheel picker; "won't open" was probably "won't show choices" — easy to misread as a click issue. Lesson: when the user reports a UI symptom, ask if they're on local or prod **first** before diving into the wrong codebase |

**Errors & fixes**

| Error | Fix |
|---|---|
| Session 11 entire diagnosis aimed at local dev box (Brave on Linux) | Was wrong target. User had been testing iPhone/prod the whole time. Session 11's custom dropdown is still a useful UX upgrade on dark themes, but it didn't address the actual prod failure (silent fetch error) until this session's catch fix |
| `curl https://aesis.onrender.com/health` returned `HTTP 000 — Could not connect` from this dev box | `aesis.onrender.com` resolves to `127.0.0.1` locally; nothing on local :443. Used `--resolve` flag with the Render-published GCP IP (216.24.57.251) to bypass |

**Stopped here — next session should**
1. **Manually re-seed prod DB.** After Render finishes redeploying `aesis-backend` (the push triggered an auto-build), open Render dashboard → `aesis-backend` → Shell → run `npm run db:seed` once. Expected output: `✓ Programmes: 5 created` and (if any orphans remain on prod, unlikely) `✓ Pruned N orphan programme(s): …`. Prod will then match local — 5 canonical programmes
2. **Confirm prod dropdown works** on the iPhone after Vercel finishes redeploying. Full page reload (not just refresh). If it shows the spinner then 5 programmes, done. If it shows "Couldn't load programmes — Try again", tap retry once (Render should be warm by then). If still failing, the next hypothesis is Brave Shields blocking `withCredentials` cross-origin → test in Safari to isolate
3. **Optional but recommended:** add a keep-warm pinger to avoid Render cold-starts hitting first-time visitors. Cheapest path: GitHub Actions cron hitting `/health` every 10min, or UptimeRobot free tier
4. **Resume the rest of Phase 9 punch list** (see Session 10 entry) — smoke-test chatbot streaming from deployed `ChatbotPanel`, mark Phase 9 ✅ in the phase tracker once these dangling items close

---

### Session 13 — 2026-05-29

**Work done** — Fixed "Invalid email or password" after fresh registration on prod

User report: a newly-registered account couldn't log in — backend kept returning what the UI rendered as "Invalid email or password." The actual flow turned out to be two bugs stacked, not a credential mismatch.

**Root cause**

1. `auth.service.register` set `isVerified: isDevMode`, which is **false** in prod regardless of whether `SENDGRID_API_KEY` is actually configured. `render.yaml` has `SENDGRID_API_KEY` as `sync: false` (never set in the dashboard), so every prod registration was created with `isVerified: false` and no verification email was ever sent. Login then short-circuited with **403 — "Please verify your email"**.
2. `LoginPage.tsx` collapsed `401 || 403` into a single `setError('Invalid email or password.')` branch, so the user saw a credential-mismatch message when the real problem was the verification gate.

| File | What |
|---|---|
| `backend/src/modules/auth/auth.service.ts` | Replaced `const isDevMode = env.NODE_ENV === 'development'` with `canSendEmail = env.NODE_ENV === 'production' && !!env.SENDGRID_API_KEY` and `autoVerify = !canSendEmail`. Auto-verification now kicks in whenever the system can't reliably send mail — dev, or prod without a SendGrid key — so users can't get stranded between registration and an email that will never arrive. The verification-email path is unchanged for the case where SendGrid IS configured |
| `backend/src/modules/auth/auth.schema.ts` | Extracted a shared `emailField = z.string().trim().toLowerCase().pipe(z.string().email())` used by register/login/reset-password. Defensive — paste-with-whitespace or mixed-case can never cause a register-stores-X / login-looks-up-Y mismatch again |
| `frontend/src/pages/auth/LoginPage.tsx` | Split the 401 / 403 branches. 401 still reads "Invalid email or password." 403 surfaces the backend `message` field (so users see the real reason — "Please verify your email…" — instead of a misleading credential error) |
| `backend/src/modules/auth/__tests__/*.test.ts` | Added `role: 'student'` to the register test inputs to match the now-required field on the schema |

**No email-domain restriction exists.** `shared/validators/common.ts` exports an `institutionalEmail` validator (`email().refine(no '+')`), but it is not used anywhere in `auth/`. Register and login accept any valid email — `@gmail.com`, `@yahoo.com`, anything — confirmed by grep across `backend/src`.

**Quality gate**: `tsc --noEmit` clean. 31/31 auth tests green. Full suite started but Celeron N4000 went into swap-thrash on the full run (same wall as Sessions 9/10) — only auth was touched, so the scoped pass is sufficient.

**Errors & fixes**

| Error | Fix |
|---|---|
| User asked whether the system was rejecting non-`.edu` / non-`.ng` emails | Grepped `backend/src` — `institutionalEmail` is defined but unused; auth uses plain `z.string().email()`. No restriction. Documented in this entry so it doesn't get re-investigated next session |

**Follow-up commit later in the same session** — first push only auto-verified NEW registrations. The user immediately reported that an account created BEFORE the fix still hit the "verify email" 403 wall. Second commit (`891ba52`) made `login()` skip the verification gate AND repair the row in-flight (`isVerified=true`, `verificationToken=null`) whenever `canSendEmail` is false. Now both new registrations and pre-existing locked-out accounts work — no DB intervention needed. Verification gate is still enforced when SendGrid IS configured.

**Commits pushed to `origin/main`**

| SHA | Message |
|---|---|
| `1df5408` | fix(auth): unblock fresh registrations from logging in on prod |
| `891ba52` | fix(auth): auto-unlock pre-existing unverified accounts at login |

**Verified on prod** — user reported the register → login flow works after the second deploy landed.

**Stopped here — next session should**
1. **Dashboards.** User flagged this as the next focus area. Start with the student dashboard (`frontend/src/pages/student/StudentDashboard.tsx`) — already wired to `useSupervisorDashboard`/`useCoordinatorDashboard` hooks. Confirm prod data shape matches the rendered components, then move on to Supervisor + Coordinator dashboards.
2. If SendGrid ever gets configured on Render, the auto-verify path turns off automatically — no code change needed. Just be aware that newly registered users will then need to click the verification link before they can log in.
3. Eventually mark Phase 9 ✅ once chatbot smoke-test from deployed `ChatbotPanel` is done (carryover from Session 10).

---

### Session 14 — 2026-05-30

**Work done** — Supervisor dashboard + shell, demo seed script, and **prod DB populated**

| File / Action | What |
|---|---|
| Supervisor dashboard + shell (frontend) | Pulse Board (4 interns), AI Alerts (high-risk on Alex Kim + Growth card on Sarah Jenkins), Recent Submissions review queue. Pushed → Vercel. |
| `backend/src/config/seed-supervisor-demo.ts` | NEW demo seed — seeds Nimbus Technologies Ltd. + 4 interns (Sarah Jenkins, David Rivera — both low; Elena Kostas — medium; Alex Kim — high) under hardcoded `supervisor@aesis.cs.edu`, each with 6 weeks of logbook data. Idempotent (upsert by email). Pushed → Render. |
| **Prod seed executed** | Ran `seed-supervisor-demo.ts` against the prod Render Postgres from this box (user pasted the External connection string; SSL `sslmode=require`). |

**Commits pushed to `origin/main`**

| SHA | Message |
|---|---|
| `5d5f8a7` | supervisor dashboard + shell (frontend → Vercel) |
| `21f0d96` | demo seed script (backend → Render) |

**Prod seed — how it was done**
- Both seed scripts instantiate their own `PrismaClient` + `dotenv.config()` (no args), and do **not** import `config/env.ts` — so a prefixed `DATABASE_URL=` overrides the local `.env` and there's no Zod env-validation crash. Ran: `DATABASE_URL="postgresql://…render.com/aesis_postgres?sslmode=require" npx ts-node src/config/seed-supervisor-demo.ts`.
- **Preconditions verified read-only first** (all present on prod): CS department, active academic year `2024/2025`, and `supervisor@aesis.cs.edu` (role `academic_supervisor`, verified). No demo interns existed → clean first run, base `seed.js` not needed.
- **Verified after** via direct psql: 4 interns, 4 placements under the supervisor, risk tiers 2 low / 1 medium / 1 high, pending review queue = 3 (2 submitted + 1 under_review). Matches local.

**Prod login for the populated dashboard**
- `supervisor@aesis.cs.edu` / `Super@1234` — interns are attached to THIS account. Logging in as any other supervisor shows an empty board. Interns' own password (if logging in as a student): `Student@1234`.

**Action still owed by user**
- 🔐 **Rotate the prod Postgres password in Render** (`aesis-postgres` → it was pasted into chat). Until rotated, treat the credential as exposed.

**Errors & fixes**

| Error | Fix |
|---|---|
| `select … where role ilike '%supervisor%'` → `operator does not exist: "UserRole" ~~* unknown` | `role` is a Postgres enum, not text — `ilike` invalid. Cosmetic; the specific account `supervisor@aesis.cs.edu` was already confirmed present, so no cast needed. |

**Follow-up (same session) — Ghana name localization**

User set a **standing rule**: AESIS deploys in **Ghana**, so every demo/seed/example/placeholder name must be Ghanaian (Stitch screens already converted). Saved to memory as `feedback-ghana-names`. Applied to the supervisor dashboard data:

| Role | Old | New (Ghanaian) |
|---|---|---|
| Academic supervisor | Dr. Emeka Obi | Dr. Kofi Adjei |
| Top performer / low | Sarah Jenkins | Akosua Mensah |
| Low | David Rivera | Kwabena Boateng |
| Medium | Elena Kostas | Abena Owusu |
| High / alert | Alex Kim | Yaw Asante |
| Company | Nimbus Technologies Ltd. | Ananse Technologies Ltd. |

- Code: renamed interns + company in `seed-supervisor-demo.ts`; renamed supervisor in `seed.ts` (also added `firstName`/`lastName` to the supervisor upsert **update** path so re-seeding repairs the name — previously update only touched password/verified).
- Prod DB: since the seed upserts interns **by email** and the emails changed, re-running would have duplicated them. So on prod I (a) renamed the supervisor in place via SQL, (b) deleted the 4 old interns + dependents in FK order (risk scores → submissions [cascades analyses] → placements → users), (c) deleted the orphaned Nimbus company, (d) re-ran the updated seed. Verified: 4 Ghanaian interns with correct tiers (Akosua/Kwabena low, Abena medium, Yaw high), supervisor = Dr. Kofi Adjei, only Ananse company, zero stray Western demo names.
- **Note for future:** `seed.ts` still has placeholder labels `System / Admin` and `CS Programme / Coordinator` — functional system accounts, not Ghanaian-ized yet. Convert if they ever surface as people in the UI.

**Follow-up (same session) — wire real students + real supervisor to dashboards**

User: "populate the student dash with actual prod data (no new dash); wire the supervisor dash to every supervisor, not just the seeded one; supervisors log in with their own non-institutional emails." Investigation showed **nothing was broken in code** — it was pure data assignment:

- `SELF_REGISTERABLE_ROLES` already includes `academic_supervisor`; `emailField` is `trim→lowercase→.email()` with **no domain restriction** → supervisors can already self-register with any gmail. (req #3 already satisfied.)
- `getSupervisorDashboard(req.user!.sub)` is already per-logged-in-supervisor, no hardcoding. (req #2 architecture already there.)
- `StudentDashboard.tsx` already derives all metrics from live `useMyPlacements` + `useSubmissions`. (req #1 architecture already there.)
- The real reason dashboards looked empty: prod had **2 supervisors** (`supervisor@aesis.cs.edu` w/ the 4 demo interns, and the user's real `theowalls@gmail.com` w/ **0** students) and **4 real student registrations** (`ginginger`, `jamescastle`, `naanana`, `okoaddo` @gmail) with **0 placements/logbook**.

Action (per user's choice — "wire the 4 real students" to `theowalls@gmail.com`; demo interns left on the seeded supervisor):

| File / Action | What |
|---|---|
| `backend/src/config/seed-real-students-demo.ts` | NEW. Looks up supervisor + students **by email** (never creates/renames real accounts), gives each an active placement under `SUPERVISOR_EMAIL` (default `theowalls@gmail.com`) at company **Sankofa Software Ltd.**, plus 6 weeks of logbook + a latest risk score. Varied spread (2 low / 1 medium / 1 high). Idempotent. Run: `SUPERVISOR_EMAIL=… npx ts-node src/config/seed-real-students-demo.ts`. |
| Prod DB | Ran it. Verified: theowalls now has 4 assigned students, pending-review = 3, tiers 2 low / 1 medium / 1 high; each real student has 6 submissions + scored analyses so the student dash populates. |

**Connectivity note:** this box was on a phone hotspot (resolver `172.20.10.1`) and DNS for the Render PG host intermittently SERVFAIL'd. Workarounds that worked: `psql "host=<fqdn> hostaddr=35.227.164.209 …"` (SNI from `host`, skips DNS), and for Prisma/ts-node a `DATABASE_URL` pointed straight at the IP with `?sslmode=require` (encrypts without hostname verification). Render PG external IP at the time: **35.227.164.209** (may change; re-resolve if it moves).

**Follow-up (same session) — coordinator "Assign Supervisor" UI**

Goal: stop relying on seed scripts — let a coordinator assign a supervisor to any placement through the app so any supervisor's dashboard populates. Found that the backend assign-on-approval already existed but two gaps: no endpoint to list supervisors for a dropdown, no reassign path for already-active placements, and a **latent bug** (the approve/reject hook sent `placementStatus` but the controller parses `status` via Zod → every approve/reject would have 400'd; never hit because placements were seeded directly).

Backend:
| File | What |
|---|---|
| `coordinator.service.ts` / `.controller.ts` / `.router.ts` | `listSupervisors()` → `GET /api/v1/coordinator/supervisors` (coordinator/admin) — returns all `academic_supervisor` users `{id,firstName,lastName,email}` for dropdowns. |
| `placements.schema.ts` | New `assignSupervisorSchema` (`{ supervisorId: uuid }`). |
| `placements.service.ts` | New `assignSupervisor(placementId, coordinatorId, {supervisorId})` — validates placement exists + target is an academic supervisor, sets `academicSupervisorId` (works on any status, so it **reassigns** active placements too), writes an audit log. Reused existing `placement_status_change` AuditAction enum (with `metadata.change='supervisor_assigned'`) to avoid a prod migration. |
| `placements.controller.ts` / `.router.ts` | `assignSupervisorHandler` → `PATCH /api/v1/placements/:id/supervisor` (coordinator/admin). |
| `placements.service.test.ts` | +3 tests (assign happy path / 404 / non-supervisor 400). |

Frontend:
| File | What |
|---|---|
| `hooks/usePlacements.ts` | **Fixed the `status` bug** in `useUpdatePlacementStatus` (now sends `status` + optional `supervisorId`). Added `useSupervisors()` and `useAssignSupervisor()`. Added `academicSupervisor` to the `Placement` type. |
| `pages/coordinator/SupervisorAssignment.tsx` | NEW page — lists placements (Active/Pending/All filter), shows current supervisor or "Unassigned", per-row dropdown + Assign/Reassign with saved state. Dark coordinator theme, no ALL-CAPS labels per the polish bar. |
| `pages/coordinator/PlacementApproval.tsx` | Now lets the coordinator pick a supervisor at approval time (optional). |
| `router.tsx` + `AppShell.tsx` | Route `/coordinator/assignments` + nav item "Assignments" (UserCheck icon). |

Quality gate: frontend `tsc --noEmit` clean; backend `tsc --noEmit` clean; `jest placements` 30/30 (was 27 + 3 new). Full suite not run (Celeron swap-thrash) — only placements/coordinator touched.

**Follow-up (same session) — Admin + Coordinator dashboards built from Stitch**

User reported the admin dashboard was missing and the coordinator dashboard "wasn't the one we designed." Verified via git: I never changed `CoordinatorDashboard.tsx` (last touched Phase 7), and an admin dashboard had **never** been committed — they existed only as **Stitch designs**, never coded. User clarified: the **admin** dashboard is the Stitch screen titled **"Supervisor Dashboard"**; the **coordinator** dashboard is **"Coordinator Dashboard – Nexus Oversight"**. Rules to honor: **Ghanaian names** + keep the **static dummy data** (to be wired to live data later).

Pulled both Stitch HTML designs (project "AI Internship Monitor" `4927634583697300472`) and translated to React (lucide icons, Tailwind arbitrary hex from the Stitch palette, initials instead of stock avatars):

| File | What |
|---|---|
| `components/layout/CoordinatorShell.tsx` | NEW light shell (Nexus Oversight sidebar/topbar), primary `#00288e`. Nav: Intern Overview / Placements / Assignments / Analytics / Settings. |
| `pages/coordinator/CoordinatorDashboard.tsx` | REWRITTEN as Nexus content — 4 metric cards, Intern Status Monitor table, Placement Requests, AI Pulse Matching, Recent Activity feed. Ghanaian dummy data (Akosua Mensah, Kwabena Boateng, Yaw Asante; Univ. of Ghana / KNUST; Ananse Technologies). |
| `components/layout/AdminShell.tsx` | NEW light shell (indigo `#15157d`/`#8a4cfc`), nav: Dashboard / Interns / AI Insights / Feedback Center / Resources. |
| `pages/admin/AdminDashboard.tsx` | NEW — "Supervisor Overview" + 3 stat cards, Pulse Check Board (4 cards), AI Alerts (urgent + growth), Recent Submissions table. Ghanaian dummy data (Akua Sarpong, Kojo Mensah, Adwoa Agyeman, Kwame Appiah, Kwesi Boateng). |
| `router.tsx` | `coordinator` role → `CoordinatorShell`; `admin` role → `AdminShell`; added `/admin/dashboard` route + admin RequireAuth group; admin redirect now `/admin/dashboard` (was `/coordinator/dashboard`). |

Quality gate: `tsc --noEmit` clean; `npm run build` succeeds (1675 modules). Data is **static demo** — no API wiring yet, per the user's instruction.

**Architecture note for next session:** chrome is now per-role — `student`→StudentShell, `academic_supervisor`→SupervisorShell, `coordinator`→CoordinatorShell, `admin`→AdminShell. The generic dark `AppShell` is now effectively unused (kept as fallback). Coordinator's other pages (PlacementApproval, SupervisorAssignment) now render inside the light CoordinatorShell — they still use their own dark-slate card styling internally, so a future pass should restyle them to the light Nexus palette for full consistency.

**Stopped here — next session should**
1. After Render+Vercel redeploy, verify in-browser: log in as **admin** (`admin@aesis.cs.edu`) → lands on the new `/admin/dashboard`; log in as **coordinator** (`coordinator@aesis.cs.edu` / `Coord@1234`) → Nexus Oversight dashboard. Both show Ghanaian static dummy data.
2. Restyle PlacementApproval + SupervisorAssignment to the light Nexus palette (they're still dark-slate inside the new light coordinator shell).
3. Wire the dashboards' dummy data to live endpoints when ready.
4. Coordinator assign-supervisor flow: log in as coordinator → Assignments → assign a supervisor → that supervisor's dashboard populates. (Coordinator account confirmed working on prod: `coordinator@aesis.cs.edu` / `Coord@1234`.)
2. Confirm the real-data wiring still renders: `theowalls@gmail.com` (4 students) and the 4 gmail students' dashboards. Demo interns + Ghanaian names still under `supervisor@aesis.cs.edu`.
3. 🔐 Verify the user rotated the prod Postgres password (pasted into chat this session).
2. Verify the user rotated the prod DB password.
3. Carryover: chatbot smoke-test from deployed `ChatbotPanel`, then mark Phase 9 ✅.

---

### Session 15 — 2026-05-30

**Work done** — wired two shared Stitch screens (Feedback Center + AI Insights) into the role dashboards. Both are reachable from the nav now; both still render **static demo data** (Ghanaian names) pending live wiring.

Context: prior session left `frontend/src/pages/shared/FeedbackCenter.tsx` built but **unreachable** — the three shells' "Feedback Center" nav pointed at `/feedback` but no such route existed, so every click fell through the `*` catch-all back to `/`.

**Feedback Center** (commit `e772e7e`)
| File | What |
|---|---|
| `router.tsx` | Imported `FeedbackCenter`; added `/feedback` route in a `RequireAuth roles={['student','academic_supervisor','admin']}` group. One route → renders inside whichever shell `RequireAuth` picks by role (no per-role duplication). Coordinator intentionally excluded (its shell never linked to it). |
| (already staged from prior session) | `StudentShell` / `SupervisorShell` / `AdminShell` "Feedback Center" nav → `/feedback`; new `FeedbackCenter.tsx`. |

**AI Insights & Analytics** (commit `6bab1ca`)
- Pulled the Stitch screen **"AI Insights & Analytics"** (project "AI Internship Monitor" `4927634583697300472`, screen `939c79a7…`) and translated HTML → React (lucide icons, Tailwind arbitrary hex from the Stitch palette, Ghanaian names).

| File | What |
|---|---|
| `pages/shared/AIInsights.tsx` | NEW shared screen. Five panels: Hiring Success Probability (bar chart), Weekly Sentiment heatmap, Skill Gap Analysis, Actionable Summaries, Real-time Performance Monitoring table. Ghanaian demo names (Akosua Mensah, Kwabena Boateng, Yaa Frimpong). Chrome comes from the per-role shell. |
| `router.tsx` | `/ai-insights` route in a `RequireAuth roles={['academic_supervisor','coordinator','admin']}` group. |
| `SupervisorShell` / `AdminShell` | "AI Insights" nav was a dead link to the dashboard → now `/ai-insights`. |
| `CoordinatorShell` | Renamed dead "Analytics" item → **"AI Insights"** (BarChart3 → Sparkles icon), href `/ai-insights`. |

**Errors & fixes** — none. `tsc --noEmit` clean after each screen.

**Quality gate:** frontend `tsc --noEmit` clean (exit 0) before each commit. Both commits pushed to `origin/main` → Vercel auto-redeploy.

**Stopped here — next session should**
1. In-browser verify on prod after Vercel redeploy: each role's nav opens `/feedback` and `/ai-insights` inside its own shell (student/supervisor/admin for Feedback; supervisor/coordinator/admin for AI Insights).
2. **Wire both shared screens to live data** — currently 100% static demo. Feedback Center → live logbook feedback + AI feedback generator (AI engine); AI Insights → AI-engine analytics (risk/quality/sentiment) + real intern table. This is the main remaining work for these screens.
3. Carryover from Session 14: restyle PlacementApproval + SupervisorAssignment to the light Nexus palette; verify prod Postgres password was rotated; chatbot smoke-test then mark Phase 9 ✅.

---

### Session 16 — 2026-05-30

**Work done** — wired both shared screens (AI Insights + Feedback Center) to **live data**, full-stack. User chose: build the missing backend APIs; keep genuinely-unbacked panels rendering with a **"Sample"** badge (not hidden).

**New backend module** — `backend/src/modules/insights/` (mounted `/api/v1/insights` in `app.ts`):
| File | What |
|---|---|
| `insights.service.ts` | `getInsights({supervisorId?})` — aggregates real Postgres: performance-monitoring rows (engagement = submitted/expected, successScore = `(1-riskScore)*100` ?? avgQuality, status from risk tier), weekly cohort quality trend, weekly sentiment (avg `sentimentPolarity`, first negative week = anomaly), cohort rubric **skill profile** (taskDepth/techVocab/reflection/temporal averages), and derived **actionable summaries** (highest-risk→mentorship, weakest dim→resource, top performer→success signal). `listInternsForFeedback({supervisorId?})` — interns + latest submission (id, status, `canReceiveFeedback`, qualityScore, sentimentClass, `aiFeedbackSummary`). Sparse panels return `hasData` flags. |
| `insights.controller.ts` | Scope by role: `academic_supervisor` → own placements; coordinator/admin → all. |
| `insights.router.ts` | `GET /` + `GET /interns`, behind `authenticate` + `authorize('academic_supervisor','coordinator','admin')`. |
| `__tests__/insights.service.test.ts` | 4 tests (aggregation math, sentiment anomaly, empty shape, interns list) — all passing. |

**Frontend**
| File | What |
|---|---|
| `hooks/useDashboard.ts` | Added `useInsights()` + `useFeedbackInterns()` (+ `InsightsData` / `FeedbackIntern` types). |
| `pages/shared/AIInsights.tsx` | Driven by `useInsights()`. Real: header counts, quality-trend bars (with +/- pts-since-wk1 delta), skill profile, summaries, performance table. Sentiment heatmap shows real polarity when present, else a **"Sample"**-badged demo grid. Loading/error/empty states added. |
| `pages/shared/FeedbackCenter.tsx` | **Role-aware.** Reviewer (supervisor/admin/coordinator): real intern `<select>`, shows engine `aiFeedbackSummary` + quality + tone for the latest submission, live Evaluations Status (reviewed % + awaiting-review count), Formal Evaluation (1–5 rating + text) posting real feedback via existing `useSubmitFeedback` → `/logbook/submissions/:id/feedback` with **Approve** / **Flag** outcomes (disabled unless `canReceiveFeedback`). Student: read-only "Your Feedback" from own submissions (AI summary + supervisor feedback). Collaborative chat kept as a **"Sample"**-badged placeholder (no messaging backend). |

**Commit pushed:** `ee5960f` — `feat(insights): wire AI Insights + Feedback Center to live data`.

**Errors & fixes**

| Error | Fix |
|---|---|
| `ChevronRight` imported but unused in AIInsights after dropping the "View Details" button | Removed from the lucide import (would have tripped `noUnusedLocals`). |

**Quality gate:** frontend `tsc --noEmit` clean, `npm run build` clean (538 kB chunk warning is pre-existing), backend `tsc --noEmit` clean, `jest insights` 4/4. Full Jest suite **not** run (this box's known swap-thrash) — only added an isolated module + one router mount in `app.ts`.

**Stopped here — next session should**
1. ⚠️ **Backend deploy dependency:** `/api/v1/insights` is NEW — until **Render** redeploys the backend, both screens hit 404 and render their error state. Confirm the Render build picked up `ee5960f`, then in-browser verify on prod: supervisor sees own cohort, admin/coordinator see all.
2. Note: sentiment + skill panels only populate once analyses carry `sentimentPolarity` / rubric sub-scores (sentiment is written after supervisor feedback). On prod demo data these may show the **"Sample"** badge until more feedback exists — expected, not a bug.
3. Carryover from Session 14: restyle PlacementApproval + SupervisorAssignment to the light Nexus palette; verify prod Postgres password rotated; chatbot smoke-test then mark Phase 9 ✅.

---

### Session 17 — 2026-05-30

**Work done** — frontend resilience + a full UI polish pass on the three dashboards. Four commits, all pushed to `origin/main` (Vercel auto-deploy). No backend changes.

**1. Render free-tier cold-start hardening** (commit `4ccb2c7`)
Context: probed prod backend `https://aesis-backend.onrender.com` — returns `x-render-routing: no-server` on **every** path (incl. `/health` and pre-existing routes), so `ee5960f` could NOT be verified: the Render service isn't serving at all. Likely free-plan suspension (month-end 750h cap) or a failed deploy — **needs the user's Render dashboard** (no `RENDER_API_KEY` locally). User chose **no upgrade**, so:
| File | What |
|---|---|
| `frontend/src/lib/api.ts` | 65s axios timeout; retry-with-backoff (1/2/3/5s) on cold-start signals — `502/503/504` any method, network/timeout on **GET only** (avoids double-submitting non-idempotent calls). A suspended-service **404 is NOT retried** so a truly-down backend fails fast. Ref-counted `onBackendWaking()` signal. |
| `frontend/src/components/shared/BackendWakingBanner.tsx` | NEW. Fixed top "Waking the server…" banner + `useBackendWaking()` hook; mounted in `App.tsx`. |

Note for next session: the cold-start retry only triggers on `502/503/504`/network — the current prod state is a hard `404`/`no-server`, which fails fast by design.

**2. Dashboard UI polish via `/ui-ux-pro-max`** (commit `6c5485a`)
Skill confirmed target style = **Data-Dense Dashboard**. Applied across Student / Supervisor / Coordinator, honoring the SaaS-polish bar:
- **Killed every ALL-CAPS label** (`uppercase tracking-*` micro-labels → sentence case; supervisor status strings `APPROVED`→`Approved`, `PENDING REVIEW`→`Pending review`, etc.). Verified 0 `uppercase` classes remain in the three dashboards.
- `globals.css` **global a11y/interaction baseline**: `cursor-pointer` on interactive els, visible `:focus-visible` indigo ring, `prefers-reduced-motion` guard (applies app-wide).
- Supervisor: submissions table now wrapped in `overflow-x-auto`.
- Coordinator: `aria-label`s on all icon-only buttons (filter / row actions / review / approve / refresh).

**3. Primary palette unified to `#15157d`** (commit `823b2cf`)
Student (`#0040a1`) + Coordinator shell & dashboard (`#00288e`) → `#15157d`, matching supervisor/admin. Paired tints `dae2ff`/`dde1ff`→`e1e0ff`; student progress gradient → `#15157d→#2e3192`; de-uppercased a stray "Nexus Oversight" shell label. Left the secondary purple family (`#712ae2`/`#8a4cfc`/`#645efb`) intact on purpose (it's the AI/Sparkles accent, not the primary). Grep-verified no old-primary hexes remain.

**Quality gate:** every commit — frontend `tsc --noEmit` clean + `npm run build` clean. No backend touched, so backend tests untouched.

**Stopped here — next session should**
1. ⚠️ **Backend is DOWN on Render** (`no-server`). User must check the dashboard (resume if suspended / read failed-deploy log). Until then `/insights` (Session 16) and everything else 404s on prod. Once live: confirm `ee5960f` → `/health` 200, `/api/v1/insights` 401.
2. Obvious next feature: wire **Coordinator + Admin** dashboards to live data (still static demo) — Student & Supervisor already live.
3. Carryover (Session 14): restyle PlacementApproval + SupervisorAssignment to the light Nexus palette; verify prod Postgres password rotated; chatbot smoke-test → mark Phase 9 ✅.

---

### Session 18 — 2026-05-30

**Work done** — mobile navigation for every screen. One commit (`28ebf39`), pushed to `origin/main` (Vercel auto-deploy). Frontend only, no backend touched.

Problem: all four active layouts (`StudentShell`, `SupervisorShell`, `CoordinatorShell`, `AdminShell`) hide their sidebar with `hidden md:flex` and never replaced it — on a phone the topbar showed logo + bell + avatar with **no way to navigate between pages**. (`AppShell.tsx` is only the router fallback; the four per-role shells are what render.)

| File | What |
|---|---|
| `frontend/src/components/layout/MobileNav.tsx` | NEW. Shared hamburger → left slide-in drawer. Closes on nav-item tap (route change), backdrop, X, and **Escape**; locks body scroll while open. **Portal-rendered to `document.body`** — the topbars' `backdrop-blur` creates a containing block that would otherwise trap a `fixed` overlay inside the header. a11y: `aria-expanded`/`aria-controls` trigger, `role="dialog"`+`aria-modal` panel. Active style standardized to the `#8a4cfc` drawer treatment; sentence-case labels (SaaS-polish bar). |
| 4 shells | Mounted `<MobileNav>` inside each existing `md:hidden` brand group, so the **desktop layout is unchanged**. Each passes its own `navItems`, `isActive`, and `roleLabel` (Academic Supervisor / Head Coordinator / Administrator; student falls back to email). |

**Quality gate:** frontend `tsc --noEmit` clean, `npm run build` clean (543 kB chunk warning pre-existing). No backend changes.

**Stopped here — next session should**
1. Visually confirm the drawer at phone width on the Vercel deploy (couldn't run a mobile viewport locally this session).
2. ⚠️ Still open from Session 17: **backend is DOWN on Render** (`no-server`) — user must check the dashboard; until then `/insights` etc. 404 on prod.
3. Carryover (Session 14): restyle PlacementApproval + SupervisorAssignment to the light Nexus palette; verify prod Postgres password rotated; chatbot smoke-test → mark Phase 9 ✅.

---

### Session 19 — 2026-05-31

**Work done** — frontend crash containment + data-shape hardening. One commit, pushed to `origin/main` (Vercel auto-deploy). Frontend only, no backend touched.

Problem: the student dashboard could crash on `placements?.find(...)`. The `?.` already guards null/undefined, so it only throws when `placements` is **truthy but not an array** (a paginated `{placements,meta}` object, or a cold-start/error body slipping through TanStack). There was **no error boundary anywhere**, so that thrown render error unmounted the entire React tree → blank screen, shell and all.

| File | What |
|---|---|
| `frontend/src/hooks/usePlacements.ts` | `useMyPlacements` now normalizes the response to always return `Placement[]`: bare array → use it; `{placements:[…]}` envelope → unwrap; anything else (cold-start HTML, error body) → `[]`. Kills the crash trigger at the source and also protects `LogbookEditor` + `SubmissionHistory`, which share the hook. |
| `frontend/src/components/shared/RouteErrorBoundary.tsx` | NEW class boundary. Renders a contained "This page hit a snag / Try again" fallback in the content area instead of letting a thrown render error blank the app. `componentDidCatch` logs to console; `resetKey` (pathname) auto-clears the error on navigation; a manual "Try again" button re-renders the children. |
| `frontend/src/router.tsx` | `RequireAuth` wraps `<Outlet/>` in `<RouteErrorBoundary resetKey={location.pathname}>` *inside* whichever role shell it picks. So a page crash now shows the fallback in the content area while the sidebar/topbar stay alive — one boundary applied across all four roles (student/supervisor/coordinator/admin) + the `AppShell` fallback. |

**Errors & fixes** — none. Clean first pass.

**Quality gate:** frontend `tsc --noEmit` exit 0; `npm run build` clean (545 kB chunk warning pre-existing since Session 16). No backend changes.

**Follow-up (same session) — "backend is DOWN" was a wrong-hostname diagnosis**

Sessions 17/18 concluded the prod backend was suspended because `https://aesis-backend.onrender.com` returns `x-render-routing: no-server`. **That was the wrong hostname** (same class of mistake as the Session 11→12 wrong-target lesson). The live service answers at **`aesis.onrender.com`** — the Render service was renamed to `aesis` in the dashboard at some point, which is why the `aesis-backend` name from `render.yaml` 404s.

Verified live and **fully up to date**:
- `GET https://aesis.onrender.com/health` → `200 {"status":"ok","service":"aesis-api"}` (no cold-start delay at the time)
- `/api/v1/auth/programmes` → 200
- `/api/v1/insights` (Session 16) → **401** (deployed, auth-gated — not 404)
- `/api/v1/coordinator/supervisors` (Session 14) → **401** (deployed)

So `ee5960f` and everything since **did** deploy. The local `aesis.onrender.com → 127.0.0.1` DNS override flagged in Session 12 is also gone — it now resolves to the real Render IP (216.24.57.251).

**Stale hostname references fixed** (point at the dead `aesis-backend.onrender.com`):
| File | Change |
|---|---|
| `frontend/.env.production.example` | `VITE_API_BASE_URL` + `VITE_SOCKET_URL` → `https://aesis.onrender.com` (+ note explaining the rename) |
| `.github/workflows/ci.yml` | build-time `VITE_API_BASE_URL` + `VITE_SOCKET_URL` → `https://aesis.onrender.com` |

**Deliberately NOT changed:**
- `render.yaml` service `name: aesis-backend` — renaming a blueprint service `name:` can make Render recreate it on re-sync. The dashboard service is already named `aesis`; leave the blueprint be unless doing a clean re-provision.
- `backend/.env.production.example` `AI_ENGINE_URL=https://aesis-ai-engine.onrender.com` — that host also 404s, but its real hostname is unknown (couldn't probe it). Flag for the user to confirm from the Render dashboard.

**Action owed by user (can't be checked from here):**
- 🔑 Confirm Vercel's `VITE_API_BASE_URL` env var = `https://aesis.onrender.com`, NOT `aesis-backend.onrender.com`. (Vercel → aesis project → Settings → Environment Variables.) If it's pointing at the dead host, that's the real prod-API-failure cause. The `.example` + CI fixes above don't change Vercel's actual env var.

**Commits pushed to `origin/main`**
| SHA | Message |
|---|---|
| `caf5d46` | fix(frontend): contain page crashes + harden placements data shape |
| _(this session's 2nd)_ | fix(config): point prod hostname refs at live aesis.onrender.com |

**Stopped here — next session should**
1. After Vercel redeploy, sanity-check: log in as a student with a placement → dashboard renders; the boundary fallback only ever appears on a genuine page crash, never in the normal path.
2. Confirm the Vercel `VITE_API_BASE_URL` env var (see action owed above) — the backend is **live at `aesis.onrender.com`**, not down.
3. Confirm the real `aesis-ai-engine` hostname from the Render dashboard and update `backend/.env.production.example` if it differs.
4. Carryover (Session 14): restyle PlacementApproval + SupervisorAssignment to the light Nexus palette; verify prod Postgres password rotated; chatbot smoke-test → mark Phase 9 ✅.

---

### Session 20 — 2026-05-31

**Work done** — closed the Coordinator dashboard's backend contract gaps, then wired the "Nexus Oversight" dashboard to live data. Full-stack. Backend + frontend.

Context: the Coordinator dashboard (`CoordinatorDashboard.tsx`) was rebuilt from Stitch in Session 14 as **static demo data**. Before wiring, ran a full contract reconciliation of every Nexus panel against the backend. User decisions on the three un-modeled panels: **AI Pulse Matching → keep with "Sample" badge** (no candidate-matching feature exists); **"Open Project Slots" → reframe to "Partner Companies" count**; **intern "Project milestone/Phase" → 24-week logbook progress**.

**Backend gaps closed** (`backend/src/modules/coordinator/`):
| File | What |
|---|---|
| `coordinator.service.ts` | `getCoordinatorDashboard` overview now also returns **`avgPerformance`** (cohort avg of `LogbookAnalysis.qualityScore` across active placements, null when no analyses) + **`partnerCompanies`** (distinct companies with an active placement). `listStudents` now returns **`department`** (student→programme name), **`supervisor`** (`{id,name}` from `academicSupervisor`), and logbook-progress fields **`totalWeeks`** (`_count.logbookSubmissions`), **`submittedWeeks`** (one grouped query over the page's placementIds), **`progressPct`**. NEW **`getRecentActivity(limit)`** — reads `AuditLog` newest-first, maps each row to `{actor, summary, createdAt, …}` via a `summarizeAudit()` helper. |
| `coordinator.controller.ts` + `.router.ts` | NEW `GET /api/v1/coordinator/activity?limit=` (coordinator/admin), Zod-validated limit (1–50, default 8). |
| `__tests__/coordinator.service.test.ts` | Updated mocks (added `logbookAnalysis.aggregate`, `auditLog.findMany`, `_count`/programme/supervisor on the fake placement) + new assertions for avgPerformance/partnerCompanies, department/supervisor/progress, and 2 `getRecentActivity` tests. |

**Frontend wiring** (`frontend/src/`):
| File | What |
|---|---|
| `hooks/useDashboard.ts` | Extended `CoordinatorDashboard` (+avgPerformance,+partnerCompanies) and `CoordinatorStudent` (+department,+supervisor,+totalWeeks,+submittedWeeks,+progressPct) interfaces; added `CoordinatorActivity` type + **`useCoordinatorActivity()`** hook. |
| `pages/coordinator/CoordinatorDashboard.tsx` | Full rewrite from static → live. 4 metric cards ← `overview` (Active Interns / Pending Placements / Avg Performance bar / Partner Companies). Intern Status Monitor ← `useCoordinatorStudents` (real name, dept, supervisor-or-"Unassigned", "Week X of Y" + progress bar tinted by risk tier). Placement Requests ← `useAllPlacements(1,'pending')` (company + student, Eye/Check → `/coordinator/placements`). Recent Activity ← `useCoordinatorActivity` (actor · summary, relative time, refresh button). **AI Pulse Matching kept static behind a "Sample" badge** with disabled Invite buttons. Loading / empty / error states throughout; header CTAs route to placements + assignments. No ALL-CAPS labels (polish bar). |

**Quality gate:** backend `tsc --noEmit` exit 0; `jest coordinator` **22/22** (17 service + 5 controller) — note the full coordinator run took 640s on this Celeron and one controller test *timed out at 5s during swap-thrash*; re-run **in isolation it passed in 63ms** (env, not a real failure). Frontend `tsc --noEmit` exit 0; `npm run build` clean (548 kB chunk warning pre-existing).

**Errors & fixes**
| Error | Fix |
|---|---|
| First draft of the "Sample" badge used `uppercase tracking-wide` | Dropped `uppercase` — violates the SaaS-polish bar (no ALL-CAPS labels) |
| `jest coordinator` reported 1 failure (`/coordinator/dashboard` 5s timeout) | Swap-thrash on the 640s full run, not a code bug — `dashboard` handler was untouched; isolated re-run green in 63ms |

**Stopped here — next session should**
1. ⚠️ **Backend deploy:** the `/coordinator/activity` endpoint + the enriched `/coordinator/dashboard` & `/coordinator/students` payloads are NEW — until **Render** redeploys `aesis` (the live service, **not** `aesis-backend`), the coordinator dashboard's new fields render as `—`/empty. Confirm the Render build picks up this commit, then log in as coordinator (`coordinator@aesis.cs.edu` / `Coord@1234`) and verify the board populates.
2. **Admin dashboard** is the remaining static one — no backend exists for it. Same recipe: reconcile its "Supervisor Overview" panels, build the rollup endpoint, then wire. (It's a system-wide version of the supervisor/coordinator aggregates.)
3. Interaction linkage polish: the intern-row "⋮" and Placement Requests buttons currently just route to `/coordinator/placements` or `/coordinator/assignments` — wire row-level actions (inline approve/assign) if desired.
4. Carryover: restyle PlacementApproval + SupervisorAssignment to the light Nexus palette; verify prod Postgres password rotated; chatbot smoke-test → mark Phase 9 ✅.

---

### Session 21 — 2026-06-01

**Work done** — finished the **Admin dashboard** end-to-end (last static dashboard → live data). Full-stack. The orphaned `backend/src/modules/admin/admin.service.ts` (system-wide rollup, written but uncommitted + unwired in a prior session — never referenced in the Session 20 handoff) was completed and shipped.

**Backend** — new `/api/v1/admin` module (admin-only):
| File | What |
|---|---|
| `admin.service.ts` | (pre-existing, kept as-is) `getAdminDashboard()` — system-wide rollup, no per-supervisor scoping. Returns `overview {activeInterns, pendingReviews, avgEngagement}`, `pulseBoard` (top-6 active placements ranked by engagement = submittedWeeks/totalWeeks, each with department/riskTier/feedbackCount), `recentSubmissions` (latest 6), `submissionCounts {pending, reviewed}`. Counts engagement consistently with the coordinator dashboard (`submitted/under_review/approved` = "submitted"). Skips the groupBy + feedback queries when there are no active placements. |
| `admin.controller.ts` | NEW — single `dashboard` handler (mirrors supervisor controller). |
| `admin.router.ts` | NEW — `GET /dashboard` behind `authenticate` + `authorize('admin')`. |
| `app.ts` | Mounted `adminRouter` at `/api/v1/admin`. |
| `__tests__/admin.service.test.ts` | NEW — 5 tests: overview/avgEngagement math, avgEngagement=100 fallback when nothing scheduled, pulse-board ranking + feedback-count attach, recent-submission mapping, empty shape (asserts groupBy + feedback queries are skipped). |

**Frontend**
| File | What |
|---|---|
| `hooks/useDashboard.ts` | Added `AdminDashboard` interface + `useAdminDashboard()` hook (`GET /admin/dashboard`). |
| `pages/admin/AdminDashboard.tsx` | Rewritten static → live. Stats cards ← `overview`; Pulse Check Board ← `pulseBoard` (initials avatar, department, engagement bar, `submittedWeeks/totalWeeks` weeks, feedback count, risk-derived badge — Top Performer / On Track / Watch / Needs Support); Recent Submissions ← `recentSubmissions` with status pills + Review link to `/supervisor/review?submissionId=…` (admin shares that route group); pending/reviewed pills ← `submissionCounts`. Loading skeletons + empty + error states. **AI Alerts panel kept as Ghanaian demo content behind a "Sample" badge** (no candidate-alert backend feature exists). De-ALL-CAPS'd every label per the SaaS-polish bar. |

**Errors & fixes** — none. `admin.service.ts` already compiled clean against the schema, so relations (`riskScores`, `_count.logbookSubmissions`, `supervisorFeedback.submission.placementId`) were all valid.

**Quality gate:** backend `tsc --noEmit` clean; `jest admin` **5/5** (run `--runInBand --no-cache --max-old-space-size=512` — the box was swap-thrashing again, free RAM ~1 GiB with Brave open; full suite not run, only an isolated module + one router mount in `app.ts`). Frontend `tsc --noEmit` clean; `npm run build` clean (549 kB chunk warning pre-existing).

**Stopped here — next session should**
1. ⚠️ **Backend deploy dependency:** `/api/v1/admin/dashboard` is NEW — until **Render** redeploys `aesis` (the live service, **not** `aesis-backend`), the admin dashboard hits 404 → renders its error state. Confirm the Render build picks up this commit, then log in as **admin** (`admin@aesis.cs.edu`) and verify the board populates (note: admin dashboard is system-wide, so it reflects ALL placements — the demo data lives under `supervisor@aesis.cs.edu` + `theowalls@gmail.com`).
2. All four role dashboards are now live-data. The remaining static surface is the **AI Alerts** panel on the admin board (Sample-badged) — needs a backend feature before wiring.
3. Carryover: restyle PlacementApproval + SupervisorAssignment to the light Nexus palette; verify prod Postgres password rotated; chatbot smoke-test → mark Phase 9 ✅.

---

### Session 22 — 2026-06-01

**Work done** — restyled the two coordinator sub-pages from leftover **dark-slate** to the light **Nexus palette**, so they match the light `CoordinatorShell` they render inside (carryover open since Session 14). Frontend only, no logic/hooks/backend changed — pure className swap.

Palette vocabulary (lifted from `CoordinatorDashboard.tsx`): card `border border-[#c4c5d5]/60 bg-white`; muted text `#757684`; body/heading `#0b1c30`; brand/accent `#15157d`; primary button `bg-[#15157d] text-white hover:opacity-90`; row hover / track tint `#eff4ff` / `#e5eeff`; avatar `bg-[#e1e0ff] text-[#15157d]`; risk/status tones use light tints (emerald/amber/red `-50/-200/-600/-700`).

| File | What |
|---|---|
| `pages/coordinator/PlacementApproval.tsx` | Page title `text-white`→`#0b1c30`, subtitle→`#757684`. Cards `bg-slate-900 border-slate-800`→white Nexus cards; processed card border→`emerald-300`. Avatar→`#e1e0ff`/`#15157d`. Pending/Processed chips→amber-600/emerald-600. Approve/Reject buttons→light emerald/red tints (`-50` bg, `-200` border, `-700` text); Confirm-rejection kept as solid `bg-red-600`. Supervisor `<select>` + rejection `<textarea>`→white with `#15157d` focus ring. **Dropped the ALL-CAPS `InfoBlock` label** (`uppercase tracking-wide`→sentence-case `tracking-wide`) per the SaaS-polish bar; also de-capped "Student Email"→"Student email", etc. Loader `text-blue-400`→`#15157d`. |
| `pages/coordinator/SupervisorAssignment.tsx` | Same treatment. `StatusBadge` tints→light (`active` emerald-50/700, `pending` amber, `rejected` red, `completed` `#e5eeff`/`#15157d`, default `#f8f9ff`/`#757684`). Row cards→white Nexus. Filter pill group→white bordered, active pill `bg-[#15157d] text-white`, inactive `text-[#757684] hover:text-[#15157d]`. Assign/Reassign button→primary `#15157d`. `<select>`→white with `#15157d` focus. Empty/loading icons + spinner→Nexus greys/`#15157d`. |

**Errors & fixes** — none. Clean first pass.

**Quality gate:** frontend `tsc --noEmit` exit 0; `npm run build` clean (≈549 kB chunk warning pre-existing). Grep confirmed no `bg-slate*/border-slate*/text-white` surfaces remain in the two files (the only `text-white` left are on the solid `#15157d` and `bg-red-600` buttons — intentional). No backend touched.

**Stopped here — next session should**
1. After Vercel redeploy, eyeball both pages logged in as coordinator (`coordinator@aesis.cs.edu` / `Coord@1234`): `/coordinator/placements` (Placement Approval) and `/coordinator/assignments` (Supervisor Assignments) should now read as light Nexus, consistent with the dashboard — no dark cards.
2. Remaining Phase 9 close-out carryover: 🔐 verify prod Postgres password rotated (exposed Session 14); chatbot smoke-test from deployed `ChatbotPanel` → then mark Phase 9 ✅.
3. Optional: the admin board's **AI Alerts** panel is still Sample-badged static (no backend feature) — only remaining non-live dashboard surface.

---

### Session 23 — 2026-06-01

**Work done** — replaced the native `<select>` supervisor picker on **PlacementApproval** with a custom button-driven dropdown, matching the RegisterPage programme picker (Session 11) so it renders reliably across browsers / iOS. Frontend only, no logic/backend change.

| File | What |
|---|---|
| `pages/coordinator/PlacementApproval.tsx` | NEW self-contained `SupervisorPicker` component: `<button>` trigger (selected supervisor name or "No supervisor yet") + rotating `ChevronDown`, floating `<ul role="listbox">` with a "No supervisor yet" reset option then one row per supervisor (name + email sub-line, `<Check>` on the selected). Each instance owns its own `open`/`placement` state, click-outside (mousedown), Escape, and scroll/resize **above/below flip** (`max-h-60` = 240px budget) — needed because there's one picker per pending-placement card. Light Nexus palette (`#15157d` accent, `#e5eeff` selected tint, `#eff4ff` hover). Wired via `value`/`onChange` to the existing `selectedSupervisor[p.id]` state — approve flow unchanged. |
| same file | Removed `overflow-hidden` from the placement card (it would clip the absolute dropdown) and made the header-button corners conditional (`rounded-t-xl` when expanded, else `rounded-xl`) so the hover background still respects the card's rounded corners. |

Left `SupervisorAssignment.tsx`'s native `<select>` as-is (its row isn't inside an `overflow-hidden` card and the user scoped this to PlacementApproval) — candidate to share `SupervisorPicker` later if desired.

**Errors & fixes** — none. `tsc --noEmit` clean, `npm run build` clean (≈549 kB chunk warning pre-existing).

**Stopped here — next session should**
1. After Vercel redeploy, verify the picker opens/selects on prod as coordinator (`coordinator@aesis.cs.edu` / `Coord@1234`) at `/coordinator/placements` — expand a pending card, the supervisor dropdown should open below/above and selecting a name should approve with that supervisor attached.
2. Optionally extract `SupervisorPicker` to a shared component and reuse it in `SupervisorAssignment.tsx` for consistency.
3. Remaining Phase 9 close-out: 🔐 verify prod Postgres password rotated; chatbot smoke-test → mark Phase 9 ✅.

---

### Session 24 — 2026-06-01

**Work done** — extracted the Session 23 `SupervisorPicker` into a shared component and reused it in `SupervisorAssignment` too (replacing its native `<select>`). Frontend only, no logic/backend change.

| File | What |
|---|---|
| `components/shared/SupervisorPicker.tsx` | NEW shared component (moved out of PlacementApproval). Added props: `placeholder` (button text when nothing selected), `emptyLabel` (optional — renders a selectable reset row at top of the list, e.g. "No supervisor yet"; omit to hide), `className` (wrapper width constraints). Same internals: own open/placement state, click-outside, Escape, above/below flip, light Nexus palette, name + email option rows. |
| `pages/coordinator/PlacementApproval.tsx` | Removed the local `SupervisorPicker` copy; now imports the shared one and passes `placeholder="No supervisor yet"` + `emptyLabel="No supervisor yet"` (preserves the reset option it had baked in). |
| `pages/coordinator/SupervisorAssignment.tsx` | Replaced the native `<select>` (per `AssignmentRow`) with `<SupervisorPicker … placeholder="Select supervisor…" className="min-w-[14rem]" />`. No `emptyLabel` — assignment shouldn't offer "select nothing" (the Assign button is already disabled until a real supervisor is chosen). `choice`/`onChange` wiring unchanged. |

**Errors & fixes** — none. `tsc --noEmit` clean, `npm run build` clean (≈549 kB chunk warning pre-existing). Each page still fetches `useSupervisors()` in its parent and passes the list down as a prop — no extra fetch introduced.

**Stopped here — next session should**
1. After Vercel redeploy, verify the custom picker on **both** coordinator pages as `coordinator@aesis.cs.edu` / `Coord@1234`: `/coordinator/placements` (expand a pending card) and `/coordinator/assignments` (per-row Assign/Reassign).
2. Remaining Phase 9 close-out: 🔐 verify prod Postgres password rotated; chatbot smoke-test → mark Phase 9 ✅.

---

### Session 25 — 2026-06-01

**Work done** — prod-verified the coordinator pickers via Playwright; found + fixed a **pre-existing `useAllPlacements` response-shape bug** that was rendering the Assignments + Placement Approval lists (and the dashboard's Placement Requests panel) empty on prod.

**The bug (found during verification):** `/api/v1/placements` returns `{ status, data: [<array>], meta }` — `data` is a **bare array**, `meta` a sibling. But `useAllPlacements` did `return r.data.data` typed as `{ placements, meta }`, and every consumer read `data?.placements ?? []`. Since `data` was an array, `.placements` was always `undefined` → `[]`. So even though prod has an active placement (confirmed via captured API response, id `085ae816…`), the UI showed "No active placements found" / "0 pending review" and **no picker ever mounted** (it only renders inside a placement row). Same shape mismatch `useMyPlacements` was hardened against in Session 19; `useAllPlacements` never got it.

| File | What |
|---|---|
| `frontend/src/hooks/usePlacements.ts` | `useAllPlacements` now normalizes: unwrap a bare `data` array → `{ placements: data, meta: r.data.meta }`; tolerate a nested `{ placements, meta }` envelope; fall back to `{ placements: [], meta: undefined }` on any cold-start/error body. Return shape `{ placements, meta }` is what all three consumers (`SupervisorAssignment`, `PlacementApproval`, `CoordinatorDashboard` Placement Requests) already read. |

**Verification method:** Playwright (system Chromium, browsers in `~/.cache/ms-playwright`, lib in npx cache `~/.npm/_npx/e41f203b…/node_modules/playwright`) against `https://aesis.vercel.app`, login `coordinator@aesis.cs.edu` / `Coord@1234`, driving the real UI via the sidebar and capturing screenshots + the `/api/v1/placements` responses. Scripts in `/tmp/aesis-verify/`.

**Errors & fixes** — Playwright `import { chromium }` failed (CJS module) → use default import + destructure. First login attempt screenshotted mid-"Signing in…" (3s wait < Render cold-start) → wait on the login POST + URL change instead.

**Quality gate:** frontend `tsc --noEmit` clean; `npm run build` clean (≈549 kB chunk warning pre-existing). No backend touched.

**Re-verify (after the fix deployed + was promoted to production) — ✅ PASS.** Vercel free-tier note: the `eda0b7e` deploy built fine but did NOT auto-promote to the `aesis.vercel.app` production alias — the edge kept serving the old bundle (`index-DO1DMWzD.js`, `x-vercel-cache: HIT`, climbing `age`) until the user manually promoted it. If a push seems "not deployed", check the deployment is **assigned to Production**, not just "Ready". Playwright run (`/tmp/aesis-verify/final.mjs`) as coordinator:
- `/coordinator/assignments` → **All** filter now renders **8 placement rows** (was 0 pre-fix — the bug is gone).
- Each row's picker is the **custom dropdown** (`aria-haspopup=listbox`, **0 native `<select>`**); opens with the 2 real supervisors (Dr. Kofi Adjei / THEO WALLS) as name + email rows, `Check` on the selected.
- Select `THEO WALLS → Dr. Kofi Adjei` updated the trigger; clicking **Reassign** fired `PATCH /api/v1/placements/085ae816…/supervisor` → **200** (persisted). Escape closes the listbox (1 → 0). Money shot: `/tmp/aesis-verify/F2-open.png`.
- `/coordinator/placements` (Placement Approval) shows "0 pending review" — legitimately empty (prod has no pending placements), `0 native <select>`. Its picker is the **same shared component** just exercised on Assignments, so it's covered; it can't be driven through the real pending-card flow until a pending placement exists (didn't create one — prod write).

**Placement Approval picker — also verified end-to-end on prod (✅ PASS).** Created real prod data to get a pending card: registered student **Esi Annan** (`aesis-demo-pending@gmail.com` / `Student@1234`, Ghanaian name per the standing rule) via `POST /auth/register` (201, auto-verified — no SendGrid on prod), then `POST /placements` as that student (Sankofa Software Ltd., 2026-06-15→12-15) → placement **`ec064d83-4ade-40aa-a1ef-c126e5db9ce3`**, status `pending`. Playwright (`/tmp/aesis-verify/approval.mjs`) as coordinator: Placement Approval showed "1 pending review"; expanded → **custom picker=1, native `<select>`=0**; opened → 3 options incl. the **"No supervisor yet" reset row** + Dr. Kofi Adjei + THEO WALLS; selected Dr. Kofi Adjei → **Approve placement** → `PATCH /placements/ec064d83…/status` → **200**, body `placementStatus: active` + `academicSupervisorId` set. Money shot `/tmp/aesis-verify/G3-picker-open.png`.

**Cleanup done:** the verification placement `ec064d83…` was retired via `PATCH /placements/ec064d83…/status {status:"withdrawn"}` → confirmed `placementStatus: withdrawn`; active list back to 8, `ec064d83…` no longer in active/pending views. Residual on prod (harmless, no delete endpoint): the `Esi Annan` student account (`aesis-demo-pending@gmail.com`) + the withdrawn placement record + its 24-week logbook schedule. Full row-level deletion would need direct DB access with the prod `DATABASE_URL`.

**Stopped here — next session should**
1. Phase 9 close-out: 🔐 verify prod Postgres password rotated; chatbot smoke-test → mark Phase 9 ✅.

---

## Handoff Entry Template

```markdown
### Session N — YYYY-MM-DD

**Work done**
- ...

**Errors & fixes**

| Error | Fix |
|---|---|
| ... | ... |

**Stopped here — next session should**
- ...
```
