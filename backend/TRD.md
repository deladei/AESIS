# Technical Requirements Document (TRD)
## AESIS — AI-Enhanced Student Internship Supervision System
### CS Department Pilot — AY 2024/2025

**Version:** 1.0  
**Status:** Active — Engineering Reference  
**Derived from:** PRD v1.0

---

## 1. System Architecture

### 1.1 Architecture Pattern
AESIS uses a **polyglot microservices** architecture split across two primary runtime services:

| Service | Runtime | Responsibility |
|---|---|---|
| **API Service** | Node.js + Express | Auth, logbook, placements, notifications, coordinator, user management |
| **AI Engine** | Python + FastAPI | NLP analysis, risk prediction, plagiarism, sentiment, chatbot |

These two services are loosely coupled: the API Service calls the AI Engine via internal HTTP. The AI Engine never initiates calls to the API Service directly — it writes results to the shared PostgreSQL database and the API Service reads them.

### 1.2 Communication Patterns

| Pattern | Used For |
|---|---|
| HTTP REST | Client ↔ API Service; API Service → AI Engine (trigger analysis) |
| WebSocket (Socket.io) | Server → Client real-time push (risk alerts, notifications) |
| Message Queue (Celery + Redis) | AI Engine internal async task dispatch |
| Redis pub/sub | Socket.io multi-instance coordination |
| Shared DB | AI Engine writes results; API Service reads them |

### 1.3 Deployment Topology

```
Client (React SPA, HTTPS)
    │
    ▼
Nginx (port 443)
    ├── /api/v1/*     → API Service (port 3000)
    ├── /ai/*         → AI Engine   (port 8000)
    ├── /socket.io/*  → API Service (WebSocket upgrade)
    └── /*            → Serve React static build

API Service (Node.js)
    ├── PostgreSQL:5432   (primary relational store)
    ├── MongoDB:27017     (logbook full text, chat sessions)
    ├── Redis:6379        (sessions, cache, pub/sub, Celery broker)
    └── S3 / Cloudinary   (file uploads)

AI Engine (FastAPI)
    ├── PostgreSQL:5432   (read/write AI results)
    ├── Redis:6379        (Celery broker + result backend)
    └── FAISS index       (in-memory, persisted to disk)

Celery Workers (Python)
    └── Consume from Redis queue; same DB access as AI Engine
```

---

## 2. API Service — Technical Specification

### 2.1 Runtime & Framework

| Concern | Decision | Rationale |
|---|---|---|
| Runtime | Node.js 20 LTS | Event-driven I/O ideal for WebSocket + high-concurrency notification workload |
| Framework | Express.js 4.x | Mature, minimal, well-understood; avoids magic routing |
| Language | TypeScript 5.x | Type safety at compile time; Prisma client fully typed |
| ORM | Prisma 5.x (pgclient) | Type-safe queries; migration tooling; eliminates raw SQL injection risk |
| Validation | Zod 3.x | Schema-first validation at API boundary; coerces and narrows types |
| Auth | JWT (jsonwebtoken) + bcrypt | Stateless access token; refresh via HttpOnly cookie |
| Real-Time | Socket.io 4.x | WebSocket with Redis adapter for horizontal scaling |
| Email | Nodemailer + SendGrid | Transactional email for alerts, reminders, approvals |
| File Upload | Multer → S3/Cloudinary SDK | Streaming upload; no temp file accumulation |
| Scheduling | node-cron | Weekly reminder cron; lightweight for CS pilot scale |
| Logging | Winston + (Loki shipper) | Structured JSON logs; queryable in Grafana |
| Error Tracking | Sentry Node SDK | Automatic exception capture and alerting |

### 2.2 Middleware Stack (applied globally)

```
Request
  │
  ├── helmet()                      HTTPS headers, CSP, HSTS
  ├── cors({ origin: FRONTEND_URL }) Strict origin whitelist
  ├── express-rate-limit             100 req / 15 min / IP
  ├── express.json({ limit: '2mb' }) Body parsing with size cap
  ├── morgan / winston logger        Access log per request
  │
  ├── authenticate                   JWT verification → req.user
  ├── authorize(...roles)            RBAC role gate
  │
  ├── Route Handler
  │     └── Zod.parse(req.body)      Schema validation at handler entry
  │
  └── globalErrorHandler             Catches thrown errors, maps to HTTP status
```

### 2.3 Module Structure

```
src/
├── config/
│   ├── env.ts           # Zod-validated env vars (DATABASE_URL, JWT_SECRET, etc.)
│   ├── prisma.ts        # Prisma client singleton
│   ├── mongo.ts         # MongoDB native driver client
│   └── redis.ts         # ioredis client
│
├── middleware/
│   ├── authenticate.ts  # JWT verification
│   ├── authorize.ts     # RBAC role check
│   ├── rateLimiter.ts   # express-rate-limit config
│   └── errorHandler.ts  # Global error handler
│
├── modules/
│   ├── auth/            register, login, refresh, logout, reset-password
│   ├── users/           profile CRUD
│   ├── placements/      placement lifecycle, document upload
│   ├── logbook/         submission, review, feedback, attachments
│   ├── ai/              internal HTTP client to FastAPI; webhook receiver
│   ├── notifications/   list, mark-read, Socket.io emit
│   ├── supervisor/      student list, review queue
│   ├── coordinator/     dashboard, reports, company analytics
│   └── admin/           seed, user management
│
├── shared/
│   ├── types/           shared TypeScript interfaces
│   ├── utils/           date helpers, pagination, crypto (AES-256-GCM)
│   └── validators/      reusable Zod schemas
│
└── app.ts               Express app factory (no listen — testable)
    server.ts            HTTP server + Socket.io attach + listen
```

### 2.4 Environment Variables (required)

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/aisystem_db
MONGO_URI=mongodb://localhost:27017/aesis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=<256-bit random>
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
BCRYPT_ROUNDS=12

# Encryption (PII at rest)
ENCRYPTION_KEY=<256-bit hex>

# AI Engine
AI_ENGINE_URL=http://localhost:8000

# Email
SENDGRID_API_KEY=...
EMAIL_FROM=noreply@aesis.cs.edu

# Storage
AWS_BUCKET=aesis-uploads
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Sentry
SENTRY_DSN=...

# Frontend
FRONTEND_URL=https://aesis.cs.edu
```

---

## 3. AI Engine — Technical Specification

### 3.1 Runtime & Framework

| Concern | Decision |
|---|---|
| Framework | FastAPI (async) |
| Language | Python 3.11+ |
| Task Queue | Celery 5.x |
| Message Broker | Redis (shared with API Service) |
| NLP | spaCy 3.x (en_core_web_sm/md) |
| Quality Scoring | `sentence-transformers` (BERT-base) |
| CS Relevance | scikit-learn TF-IDF + LogisticRegression |
| Plagiarism | FAISS + custom Jaccard implementation |
| Risk Model | XGBoost 2.x |
| Explainability | SHAP |
| Sentiment (fast) | VADER (nltk) |
| Sentiment (deep) | `cardiffnlp/twitter-roberta-base-emotion` |
| Chatbot LLM | GPT-4o-mini (OpenAI SDK) / Mistral-7B (Ollama) |
| Chatbot Embeddings | `all-MiniLM-L6-v2` (sentence-transformers) |
| Vector Store | FAISS (IndexFlatIP) |

### 3.2 AI Engine Module Structure

```
ai-engine/
├── app/
│   ├── api/
│   │   ├── analyze.py       POST /ai/analyze/logbook
│   │   ├── risk.py          POST /ai/predict/risk, GET /ai/risk/:studentId
│   │   ├── sentiment.py     POST /ai/analyze/sentiment
│   │   └── chat.py          POST /ai/chat (SSE streaming)
│   ├── core/
│   │   ├── config.py        pydantic BaseSettings env vars
│   │   ├── celery_app.py    Celery instance + Redis broker
│   │   └── db.py            SQLAlchemy async session (read/write PG)
│   ├── models/
│   │   └── schemas.py       Pydantic request/response models
│   ├── services/
│   │   ├── nlp/
│   │   │   ├── preprocessor.py   spaCy pipeline
│   │   │   ├── quality_scorer.py BERT quality scoring
│   │   │   └── relevance.py      TF-IDF CS relevance classifier
│   │   ├── plagiarism/
│   │   │   ├── faiss_index.py    FAISS index management
│   │   │   └── detector.py       Jaccard + cosine similarity
│   │   ├── risk/
│   │   │   ├── feature_builder.py   18-feature vector assembly
│   │   │   ├── xgboost_model.py     XGBoost inference
│   │   │   └── shap_explainer.py    SHAP computation
│   │   ├── sentiment/
│   │   │   ├── vader_analyser.py
│   │   │   └── roberta_analyser.py
│   │   └── chatbot/
│   │       ├── knowledge_base.py    KB ingestion + FAISS index
│   │       ├── retriever.py         Top-5 chunk retrieval
│   │       └── llm_client.py        GPT-4o-mini / Ollama client
│   └── main.py              FastAPI app factory
├── tasks/
│   └── ai_tasks.py          Celery task definitions
├── models/                  Persisted ML model artefacts (joblib/xgb)
│   ├── xgboost_risk.xgb
│   ├── tfidf_vectorizer.joblib
│   └── relevance_classifier.joblib
└── Dockerfile
```

### 3.3 XGBoost Risk Model — 18 Input Features

| # | Feature | Source |
|---|---|---|
| 1 | `submission_frequency` | Submissions submitted / expected submissions |
| 2 | `avg_quality_score` | Rolling mean quality score (all weeks) |
| 3 | `quality_score_trend` | Slope of quality score over last 4 weeks |
| 4 | `late_submission_count` | Total late submissions |
| 5 | `consecutive_missed` | Max consecutive weeks missed |
| 6 | `supervisor_response_latency` | Avg days supervisor takes to give feedback |
| 7 | `supervisor_sentiment_score` | Avg VADER polarity of all feedback |
| 8 | `supervisor_sentiment_trend` | Slope of sentiment over last 4 feedbacks |
| 9 | `plagiarism_flag_count` | Number of flagged plagiarism submissions |
| 10 | `relevance_flag_count` | Number of CS-irrelevance flags |
| 11 | `authenticity_flag_count` | Number of authenticity flags |
| 12 | `days_since_last_login` | Inactivity signal |
| 13 | `attendance_compliance_ratio` | From weekly structured field |
| 14 | `placement_match_score` | Company–student CS relevance (from company profile) |
| 15 | `academic_cgpa` | Student academic record |
| 16 | `year_of_study` | Academic year level |
| 17 | `weeks_into_placement` | Time elapsed in internship |
| 18 | `feedback_received_ratio` | Feedbacks received / submissions |

---

## 4. Data Layer — Technical Specification

### 4.1 PostgreSQL

| Concern | Decision |
|---|---|
| Version | PostgreSQL 16 |
| Access (Node.js) | Prisma Client (connection pool, default 10 connections) |
| Access (Python) | SQLAlchemy 2.x async + asyncpg |
| Migrations | Prisma Migrate (Node.js owned); Alembic optional for Python-side reads |
| Row-Level Security | Enabled on `users`, `placements`, `logbook_submissions` — CS cohort isolation |
| Sensitive fields | `phone`, `address` encrypted with AES-256-GCM at application layer before write |
| Backups | `pg_dump` → S3, daily, 30-day retention |

### 4.2 MongoDB

| Concern | Decision |
|---|---|
| Version | MongoDB 7.x |
| Access | Native Node.js driver (`mongodb` package) |
| Collections | `logbook_entries` (full text), `chat_sessions` (message history) |
| Schema | Flexible; validated at application layer |

**`logbook_entries` document shape:**
```json
{
  "_id": "ObjectId",
  "submission_id": "UUID",   // FK ref to PostgreSQL
  "student_id": "UUID",
  "week_number": 4,
  "technologies_used": ["Django", "PostgreSQL", "Docker"],
  "tasks_completed": "...",
  "challenges": "...",
  "reflection": "...",
  "raw_text": "...",          // full concatenated entry for NLP
  "created_at": "ISODate",
  "updated_at": "ISODate"
}
```

**`chat_sessions` document shape:**
```json
{
  "_id": "ObjectId",
  "session_id": "UUID",
  "user_id": "UUID",
  "messages": [
    { "role": "user", "content": "...", "timestamp": "ISODate" },
    { "role": "assistant", "content": "...", "timestamp": "ISODate" }
  ],
  "created_at": "ISODate",
  "updated_at": "ISODate"
}
```

### 4.3 Redis

| Key Pattern | Purpose | TTL |
|---|---|---|
| `session:{userId}` | Active session presence | 15 min |
| `tfidf_cache:{submissionId}` | Cached TF-IDF vector | 24h |
| `risk:{studentId}` | Latest risk score cache | 7 days |
| `socketroom:{userId}` | Socket.io room mapping | Session |
| Celery broker keys | Task queue messages | Auto-managed |

---

## 5. Security — Technical Specification

### 5.1 Authentication & Token Handling

| Mechanism | Specification |
|---|---|
| JWT access token | HS256, 15-min expiry, payload: `{ sub: userId, role, iat, exp }` |
| JWT secret | 256-bit cryptographically random; stored in env; never hardcoded |
| Refresh token | UUID v4, hashed (SHA-256) before DB storage; raw value in HttpOnly cookie |
| Cookie attributes | `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth/refresh` |
| Token rotation | New refresh token issued on every `/auth/refresh` call; old one revoked |
| Logout | Refresh token record soft-deleted (`revoked_at` set); not just cookie cleared |

### 5.2 Input Validation Contract

Every route handler MUST begin with:
```typescript
const body = MySchema.parse(req.body); // throws ZodError → 400
```
No `req.body` access before Zod parse. `ZodError` caught by global error handler → 400 with field-level errors.

### 5.3 RBAC Enforcement Layers

| Layer | Mechanism |
|---|---|
| Route level | `authorize('student')` middleware — rejects wrong role before handler runs |
| Resource level | Handler checks `req.user.id === resource.student_id` before returning data |
| DB level | PostgreSQL RLS policies enforce CS cohort isolation as last defence |

### 5.4 PII Encryption

Fields `phone` and `address` are encrypted before write using AES-256-GCM:
```typescript
// crypto utility — Node.js built-in crypto module
encrypt(plaintext: string): { iv, authTag, ciphertext }
decrypt({ iv, authTag, ciphertext }): string
```
The full JSON `{ iv, authTag, ciphertext }` is stored as a string column. `ENCRYPTION_KEY` is the 32-byte hex key from env.

---

## 6. Real-Time Architecture

### 6.1 Socket.io Setup

```
API Service server.ts:
  const io = new Server(httpServer, {
    cors: { origin: FRONTEND_URL },
    adapter: createAdapter(redisClient)  // @socket.io/redis-adapter
  });

Connection lifecycle:
  1. Client connects with { auth: { token: accessToken } }
  2. Server validates JWT in handshake middleware
  3. Server joins socket to room `user:${userId}`
  4. On risk tier transition: io.to(`user:${supervisorId}`).emit('risk_alert', payload)
```

### 6.2 Event Catalogue

| Event Name | Direction | Payload |
|---|---|---|
| `risk_alert` | Server → Supervisor/Coordinator | `{ studentId, name, riskScore, tier, topFactors }` |
| `feedback_received` | Server → Student | `{ submissionId, weekNumber, supervisorName }` |
| `analysis_complete` | Server → Student | `{ submissionId, qualityScore, flags }` |
| `notification` | Server → Any | `{ id, type, title, body, link }` |

---

## 7. Performance Requirements — Implementation Constraints

| Requirement | Implementation Approach |
|---|---|
| API p95 < 200ms | Prisma query optimisation; indexed FK columns; Redis caching for hot reads |
| AI inference < 3s | FastAPI async handlers; model loaded once at startup (not per-request) |
| Logbook analysis < 60s | Celery async processing; worker pool size ≥ 4 |
| 500 concurrent users | Socket.io Redis adapter; Node.js cluster mode or PM2; DB connection pool |
| Uptime ≥ 99.5% | Docker health checks; Nginx upstream retries; DB connection retry logic |

### 7.1 Required PostgreSQL Indexes

```sql
-- High-frequency query paths
CREATE INDEX idx_logbook_submissions_student ON logbook_submissions(student_id);
CREATE INDEX idx_logbook_submissions_placement ON logbook_submissions(placement_id);
CREATE INDEX idx_logbook_submissions_status ON logbook_submissions(submission_status);
CREATE INDEX idx_student_risk_scores_student ON student_risk_scores(student_id);
CREATE INDEX idx_student_risk_scores_tier ON student_risk_scores(risk_tier);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read);
CREATE INDEX idx_placements_supervisor ON placements(academic_supervisor_id);
CREATE INDEX idx_placements_status ON placements(placement_status);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
```

---

## 8. Testing Strategy

### 8.1 Backend (Node.js) — Target ≥ 75% coverage

| Layer | Tool | Scope |
|---|---|---|
| Unit | Jest + ts-jest | Service functions, utility helpers, validators |
| Integration | Jest + Supertest + test DB | Full request → DB round-trip per endpoint |
| Auth | Supertest | Token flows, RBAC rejection, refresh rotation |
| AI mock | Jest mock | Mock FastAPI responses during logbook integration tests |

### 8.2 AI Engine (Python)

| Layer | Tool | Scope |
|---|---|---|
| Unit | pytest | Individual scorer, classifier, SHAP functions |
| Integration | pytest + httpx | FastAPI endpoint round-trips with real model inference |
| Model | pytest | Pearson r, ROC-AUC, F1 against held-out test set |

### 8.3 End-to-End

| Tool | Scope |
|---|---|
| Playwright | Core user flows: register → login → submit logbook → receive feedback |

---

## 9. Observability

| Concern | Tool | What is Monitored |
|---|---|---|
| Metrics | Prometheus + Grafana | API latency, AI queue depth, error rate, active WebSocket connections, DB pool usage |
| Error Tracking | Sentry | Unhandled exceptions (Node.js + Python), release tracking |
| Structured Logs | Winston + Loki | Per-request logs, AI task logs, risk score computation logs |
| Alerts | Grafana Alerting | Error rate > 1%, AI queue depth > 100, p95 latency > 500ms |

---

## 10. Decisions & Rationale Log

| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| ORM | Prisma | TypeORM, Sequelize | Prisma's type safety and migration tooling superior for team velocity |
| Validation | Zod | Joi, class-validator | Zod integrates natively with TypeScript inference; no decorator magic |
| Auth storage | Memory (JS) + HttpOnly cookie | localStorage | localStorage XSS vulnerable; HttpOnly cookie prevents JS access |
| AI framework | FastAPI | Django REST, Flask | FastAPI async + auto-OpenAPI docs; Celery integration clean |
| Vector DB | FAISS | Pinecone, Weaviate | FAISS is local, zero cost, no vendor dependency; sufficient for CS pilot scale |
| LLM provider | GPT-4o-mini + Ollama fallback | GPT-4o only | Rate limit resilience; local fallback avoids API cost spike |
| Real-time | Socket.io | SSE only | SSE is unidirectional; Socket.io supports bidirectional for future features |
| Queue | Celery + Redis | Bull (Node.js) | AI engine is Python; Celery is the natural choice; avoids cross-language queue bridge |
