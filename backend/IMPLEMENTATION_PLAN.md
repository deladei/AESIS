# AESIS — Implementation Plan
## CS Department Pilot — AY 2024/2025

---

## Phase 0 — Foundation (Week 1)

**Goal:** Working backend skeleton with DB connections, auth, and CI in place.

### 0.1 Project Scaffold
- [ ] Rename `backend ` directory to `backend` (fix trailing space)
- [ ] Initialise `package.json` (Node.js + TypeScript)
- [ ] Install core deps: `express`, `prisma`, `@prisma/client`, `zod`, `jsonwebtoken`, `bcrypt`, `dotenv`, `cors`, `helmet`, `express-rate-limit`
- [ ] Install dev deps: `typescript`, `ts-node-dev`, `@types/*`, `jest`, `supertest`, `eslint`, `prettier`
- [ ] Set up `tsconfig.json`, `eslint.config.js`, `.env.example`
- [ ] Folder structure:
  ```
  backend/
  ├── prisma/
  │   └── schema.prisma
  ├── src/
  │   ├── config/          # env, db clients, redis
  │   ├── middleware/       # auth, rbac, rate-limit, error handler
  │   ├── modules/
  │   │   ├── auth/
  │   │   ├── users/
  │   │   ├── placements/
  │   │   ├── logbook/
  │   │   ├── ai/
  │   │   ├── notifications/
  │   │   ├── coordinator/
  │   │   └── supervisor/
  │   ├── shared/           # types, utils, validators
  │   └── app.ts
  ├── prisma.config.ts
  └── docker-compose.yml
  ```

### 0.2 Infrastructure
- [ ] `docker-compose.yml` — PostgreSQL, MongoDB, Redis containers
- [ ] Prisma migration: `npx prisma migrate dev --name init`
- [ ] MongoDB client setup (native driver — Mongoose optional)
- [ ] Redis client setup (`ioredis`)
- [ ] Environment config module with Zod validation

### 0.3 CI Setup
- [ ] GitHub repo + `.github/workflows/ci.yml`
- [ ] Pipeline: lint → type-check → unit tests → Docker build

---

## Phase 1 — Auth & User Management (Week 1–2)

**Goal:** All roles can register, verify email, login, and receive role-appropriate access.

### 1.1 Auth Module
- [ ] `POST /api/v1/auth/register` — bcrypt hash, email verification token, send verification email
- [ ] `GET /api/v1/auth/verify-email?token=` — verify and activate account
- [ ] `POST /api/v1/auth/login` — return JWT (15-min) + set HttpOnly refresh cookie (7-day)
- [ ] `POST /api/v1/auth/refresh` — exchange refresh cookie for new access token
- [ ] `POST /api/v1/auth/logout` — revoke refresh token (DB)
- [ ] `POST /api/v1/auth/reset-password` — initiate reset flow (email link)
- [ ] `PATCH /api/v1/auth/reset-password/confirm` — set new password

### 1.2 RBAC Middleware
- [ ] `authenticate` middleware — verify JWT, attach `req.user`
- [ ] `authorize(...roles)` middleware — role gate on all protected routes
- [ ] Resource-level guards: students only access own data, supervisors only assigned students

### 1.3 Admin Seeding
- [ ] Seed script: CS department, academic programme, academic year, coordinator account, admin account

---

## Phase 2 — Placement Workflow (Week 2–3)

**Goal:** Students can apply for placements; coordinator approves/rejects; supervisors are assigned.

### 2.1 Placement Module
- [ ] `POST /api/v1/placements` — student submits placement request
- [ ] `GET /api/v1/placements/:id` — fetch placement detail
- [ ] `PATCH /api/v1/placements/:id/status` — coordinator approves/rejects (audit logged)
- [ ] On approval: create logbook submission schedule (weeks 1–24 with deadlines auto-generated)
- [ ] Notify student, academic supervisor, company supervisor on approval

### 2.2 Company Module
- [ ] `POST /api/v1/companies` — create company record
- [ ] `GET /api/v1/companies` — list companies (coordinator only)
- [ ] `GET /api/v1/companies/:id/analytics` — performance metrics (coordinator)

### 2.3 Document Upload
- [ ] `POST /api/v1/placements/:id/documents` — upload placement/acceptance letter (S3/Cloudinary)
- [ ] `GET /api/v1/placements/:id/documents` — list documents

---

## Phase 3 — Logbook System (Week 3–4)

**Goal:** Students submit weekly logbooks; full submission lifecycle works.

### 3.1 Logbook Module
- [ ] `POST /api/v1/logbook/submit` — create submission; store full text in MongoDB, metadata in PostgreSQL; queue AI analysis Celery task (via HTTP call to FastAPI)
- [ ] `GET /api/v1/logbook/:submissionId` — fetch single entry (metadata from PG + text from Mongo)
- [ ] `GET /api/v1/students/:id/logbook` — all submissions for student
- [ ] `GET /api/v1/logbook/:submissionId/analysis` — AI analysis result
- [ ] Deadline enforcement: `is_late` flag auto-set at submission time
- [ ] Duplicate guard: block second submission for same week, warn before override (FR-LOG-06)
- [ ] File attachment upload: S3/Cloudinary, link to `logbook_attachments`

### 3.2 Supervisor Review
- [ ] `PATCH /api/v1/logbook/:submissionId/review` — mark as reviewed
- [ ] `POST /api/v1/logbook/:submissionId/feedback` — submit feedback; trigger async sentiment analysis
- [ ] Notify student of new feedback (in-app + email)

---

## Phase 4 — AI Engine (FastAPI) (Week 4–6)

**Goal:** Full AI pipeline live — quality scoring, plagiarism, risk, sentiment, chatbot.

### 4.1 FastAPI Scaffold
- [ ] Python project: `pyproject.toml` / `requirements.txt`, FastAPI app, Celery worker, Redis broker
- [ ] Folder structure:
  ```
  ai-engine/
  ├── app/
  │   ├── api/             # route handlers
  │   ├── core/            # config, celery, redis
  │   ├── models/          # Pydantic schemas
  │   ├── services/
  │   │   ├── nlp/         # spaCy, BERT quality scorer
  │   │   ├── plagiarism/  # FAISS index, Jaccard
  │   │   ├── risk/        # XGBoost, SHAP
  │   │   ├── sentiment/   # VADER + RoBERTa
  │   │   └── chatbot/     # RAG pipeline
  │   └── main.py
  └── Dockerfile
  ```

### 4.2 NLP Logbook Analyser
- [ ] spaCy preprocessing pipeline (tokenise, NER, stopword removal)
- [ ] BERT quality scorer: 4-component rubric → weighted quality_score 0–100
- [ ] TF-IDF + logistic regression CS relevance classifier
- [ ] Output: `quality_score`, `relevance_score`, `authenticity_flag`, `ai_feedback_summary`
- [ ] Target: Pearson r > 0.80 vs. human scores

### 4.3 Plagiarism Detector
- [ ] FAISS index of all CS cohort logbook embeddings
- [ ] Shingling + Jaccard similarity (exact/near-exact matches)
- [ ] Cosine similarity over TF-IDF vectors (cross-year)
- [ ] Flag threshold: Jaccard > 0.35
- [ ] Target: Precision > 0.90, Recall > 0.85

### 4.4 Risk Prediction Engine
- [ ] XGBoost classifier on 18 behavioural features
- [ ] SHAP value computation per inference
- [ ] Weekly scheduled Celery task: compute risk for all active students
- [ ] Tier transition detection → trigger Socket.io alert via Node.js internal API
- [ ] Target: ROC-AUC > 0.85, F1 > 0.78

### 4.5 Sentiment Analyser
- [ ] VADER (real-time, on feedback submission)
- [ ] RoBERTa 6-class emotion classifier (async Celery task)
- [ ] Update `sentiment_polarity` and `sentiment_class` on `logbook_analyses`
- [ ] Target: Macro-F1 > 0.82

### 4.6 AI Chatbot (AESIS Assistant)
- [ ] Knowledge base ingestion: chunk CS internship docs into 512-token segments
- [ ] Embed with `all-MiniLM-L6-v2`, index in FAISS
- [ ] RAG pipeline: embed query → retrieve top-5 chunks → GPT-4o-mini / Mistral-7B completion
- [ ] Streaming response via Server-Sent Events

---

## Phase 5 — Real-Time Notifications (Week 6–7)

**Goal:** Risk alerts, feedback notifications, and submission reminders delivered in real time.

### 5.1 Socket.io Server
- [ ] Socket.io integrated into Node.js app
- [ ] Redis pub/sub adapter for multi-instance support
- [ ] Authenticated WebSocket connections (JWT handshake)
- [ ] Room strategy: one room per user ID

### 5.2 Notification Module
- [ ] `GET /api/v1/students/:id/notifications` — paginated list
- [ ] `PATCH /api/v1/notifications/:id/read` — mark read
- [ ] Internal event bus: risk tier change → create Notification record + emit Socket.io event
- [ ] Email dispatch: Nodemailer + SendGrid for placement approval, new feedback, high-risk alerts

### 5.3 Scheduled Reminders
- [ ] Cron job (node-cron or Celery beat): Monday 08:00 — send submission reminder to all active students with pending week

---

## Phase 6 — Dashboards & Analytics (Week 7–8)

**Goal:** All role-specific dashboards populated with real data.

### 6.1 Student Dashboard
- [ ] `GET /api/v1/students/:id/dashboard` — quality score trend, submission compliance, current risk tier, recent feedback

### 6.2 Supervisor Dashboard
- [ ] `GET /api/v1/supervisor/:id/students` — assigned students with risk tier badge, submission status
- [ ] Batch review queue: filter by risk tier / date

### 6.3 Coordinator Dashboard
- [ ] `GET /api/v1/coordinator/dashboard` — cohort risk distribution, submission compliance, active alert count
- [ ] `GET /api/v1/coordinator/risk-alerts` — filterable high-risk list
- [ ] `GET /api/v1/coordinator/companies` — average scores per company across cohorts

### 6.4 Reports
- [ ] `GET /api/v1/reports/mid-term/:cohortId` — PDF generation (pdfkit or Puppeteer): risk distribution, compliance, flagged cases
- [ ] CSV export: anonymised cohort data

---

## Phase 7 — Frontend (Week 8–11)

**Goal:** Full React UI for all roles, connected to live API.

### 7.1 Scaffold
- [ ] `create-react-app` or Vite + React + TypeScript
- [ ] Tailwind CSS, React Router v6, React Query, Zustand
- [ ] Axios API client with JWT interceptor (auto-refresh on 401)
- [ ] Socket.io client with reconnection logic

### 7.2 Auth Pages
- [ ] Register, Login, Email Verification, Forgot/Reset Password

### 7.3 Student Views
- [ ] Dashboard (quality trend chart, compliance rate, risk badge)
- [ ] Logbook editor (rich text, CS-specific fields, file upload, AI preview panel)
- [ ] Submission history with status tracker
- [ ] Notification inbox
- [ ] Document centre
- [ ] Chatbot panel (streaming)

### 7.4 Supervisor Views
- [ ] Student list with risk tier indicators
- [ ] Logbook review interface (entry + AI analysis side-by-side)
- [ ] Feedback submission form (AI-drafted suggestion)
- [ ] Risk alert feed
- [ ] Visit scheduling

### 7.5 Coordinator Views
- [ ] Cohort health dashboard (Chart.js/Recharts)
- [ ] Risk alert feed with escalation actions
- [ ] Placement approval workflow
- [ ] Company analytics
- [ ] Report generation UI

---

## Phase 8 — Security Hardening & QA (Week 11–12)

- [ ] Zod validation audit across all endpoints
- [ ] RBAC penetration check (role boundary tests)
- [ ] Rate limiting tuned (100 req/15min/IP)
- [ ] TLS config via Nginx
- [ ] AES-256-GCM encryption for PII fields (phone, address)
- [ ] PostgreSQL Row-Level Security policies
- [ ] OWASP top-10 review
- [ ] Unit test coverage to ≥ 75% (backend)
- [ ] Integration test suite (auth flow, logbook submission → AI analysis → notification)
- [ ] Load test: 500 concurrent users

---

## Phase 9 — Deployment (Week 12–13)

- [ ] Docker Compose for all services (Node.js, FastAPI, PostgreSQL, MongoDB, Redis, Nginx)
- [ ] Nginx config: TLS termination, route `/api/v1/*` → Node.js, `/ai/*` → FastAPI
- [ ] GitHub Actions CI/CD pipeline: lint → test → Docker build → push → rolling deploy
- [ ] Prometheus + Grafana dashboards
- [ ] Sentry error tracking (Node.js + Python)
- [ ] Winston + Loki structured logging
- [ ] Automated PostgreSQL → S3 daily backup

---

## Dependency Map

```
Phase 0 (Foundation)
  └── Phase 1 (Auth)
        └── Phase 2 (Placements)
              └── Phase 3 (Logbook)
                    ├── Phase 4 (AI Engine)     ← can start parallel with Phase 3
                    └── Phase 5 (Notifications) ← depends on Phase 3 + 4
                          └── Phase 6 (Dashboards)
                                └── Phase 7 (Frontend)
                                      └── Phase 8 (QA)
                                            └── Phase 9 (Deploy)
```

Phase 4 (AI Engine) can be developed in parallel with Phases 3–5. The Node.js backend calls FastAPI via internal HTTP — mock the AI responses during Phase 3 development, swap in real endpoints in Phase 5.

---

## Tech Debt / Deferred
- OAuth 2.0 institutional Google login (FR-AUTH-05, P1) — after Phase 1
- Smart Supervisor Matcher (P2) — after Phase 4
- Anomaly Detection module (P1) — after Phase 4
- Admin threshold config panel — out of scope v1
