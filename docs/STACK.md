# AESIS — every tool in the system, and what it actually does

One repo, three deployed services. This lists what is *in use*, where, and why —
verified against `package.json`, `requirements.txt`, `render.yaml` and the source,
not from memory. Where something is declared but unused, it says so; a dependency
list nobody trusts is worse than none.

```
frontend/  React SPA          → Vercel    aesis.vercel.app
backend/   Node API + Prisma  → Render    aesis.onrender.com          (system of record)
ai/        FastAPI service    → Render    aesis-ai-engine.onrender.com (advisory only)
```

The backend is the only service that talks to the AI engine, and the only one that
writes the database through Prisma. The frontend never calls the AI engine directly.

---

## Languages and runtimes

| | Where | Notes |
|---|---|---|
| **TypeScript 5.7** | `backend/` | Compiled to `dist/` by `tsc`; `npm run typecheck` must be clean |
| **TypeScript 5.4** | `frontend/` | Type-checked separately; Vite strips types, it does not check them |
| **Python 3.11** | `ai/` | `python:3.11-slim` base image |
| **Node 22.x** | backend runtime | Pinned in `backend/package.json` `engines` |
| **SQL** | `backend/prisma/migrations/` | Hand-written migration SQL; Prisma applies it |

---

## Backend — `backend/`

### Framework and HTTP

| Tool | Where | What it does |
|---|---|---|
| **Express 4** | `src/app.ts`, `src/modules/*/*.router.ts` | The API. Every route lives under `/api/v1/<resource>` |
| **helmet** | `src/app.ts` | Security response headers |
| **cors** | `src/app.ts` | Restricts browser origins to the deployed frontend |
| **cookie-parser** | `src/app.ts` | Reads the refresh-token cookie (HttpOnly) |
| **morgan** | `src/middleware/requestLogger.ts` | HTTP access log, piped into winston |
| **winston** | `src/config/logger.ts` | Structured application logging |

### Data

| Tool | Where | What it does |
|---|---|---|
| **Prisma 5 + @prisma/client** | `prisma/schema.prisma`, every `*.service.ts` | ORM and the single schema definition. Models are camelCase, columns snake_case via `@map` |
| **PostgreSQL** | prod: Render dashboard `DATABASE_URL` | The system of record — users, placements, entries, events, everything |
| **Prisma Migrate** | `prisma/migrations/` | `migrate deploy` runs in the Render start command, before the server boots |
| **MongoDB (`mongodb` driver)** | `src/config/mongo.ts` | **Legacy** logbook entry text store. Optional — the code degrades gracefully when absent |
| **Redis (`ioredis`)** | `src/config/redis.ts` | Backend rate-limiter store only. External Upstash instance |

> `Decimal` columns serialize to a JSON **string**. Coerce before arithmetic —
> this is what caused the dashboard average bug (`src/shared/utils/quality.ts`).

### Auth and security

| Tool | Where | What it does |
|---|---|---|
| **jsonwebtoken** | `src/middleware/authenticate.ts`, `src/server.ts` | Signs/verifies the access token; the socket handshake verifies it too. Claim shape `{ sub, role }` |
| **bcryptjs** | `src/modules/auth/auth.service.ts` | Password hashing (12 rounds) |
| **express-rate-limit** + **rate-limit-redis** | `src/middleware/rateLimiter.ts` | Per-IP and per-route limits, shared across instances via Redis |
| **node:crypto** (stdlib) | auth + PII paths | SHA-256 for stored refresh tokens and attestation tokens; AES-256-GCM for phone/address at rest |

Authorization is **app-layer, not RLS**. Two layers: `authorize(...roles)` on the
route, and `entries.policy.ts → assertPlacementAccess(actor, placement, mode)` as
the single per-resource decision point. Controllers never re-implement role rules.

### Validation

| Tool | Where | What it does |
|---|---|---|
| **Zod** | `src/modules/*/*.schema.ts`, `src/shared/validation/` | Validates every request body and route param, **and** every AI response before it reaches the DB |

`src/shared/validation/` is mirrored into `frontend/src/shared/validation/` so both
sides enforce the same rules. The copies are guarded by a drift test — Vercel's
build root is `frontend/`, so a build that reaches above it passes locally and
fails in production.

### Files, mail, realtime, scheduling

| Tool | Where | What it does |
|---|---|---|
| **multer** (memoryStorage) | `entries/attachments.controller.ts`, `placements.router.ts`, `messages.router.ts` | Parses uploads into a buffer — nothing touches local disk |
| **cloudinary** | `src/config/cloudinary.ts` | The live object store: entry attachments, placement documents, avatars, chat attachments. Unset config returns 503 rather than silently dropping the file |
| **nodemailer** | `src/shared/utils/email.ts` | SMTP send. In production it authenticates to **SendGrid** (`smtp.sendgrid.net:465`); in dev it logs the mail instead of sending |
| **socket.io** | `src/config/socket.ts`, `src/server.ts` | Live notifications and chat. Handshake is JWT-authenticated |
| **node-cron** | `src/jobs/` | Four scheduled jobs, all `Africa/Accra`: `weeklyReport` (Mon 08:00), `deadlineReminder` (daily 09:00), `weekAutoSubmit` (daily 20:00), `enrichmentRevive` (every 6h) |
| **uuid** | throughout | Identifier generation |

### Tooling

**Jest + ts-jest** (`npm test` — on this box always `npx jest --runInBand`),
**supertest** for HTTP-level tests, **ESLint 9** + **@typescript-eslint**,
**Prettier**, **ts-node-dev** for the dev server.

**Declared but unused:** `clsx` (zero references in `backend/src`), and the `AWS_*`
env vars in `render.yaml`, which predate the Cloudinary switch — there is no
`aws-sdk` in the tree.

---

## AI engine — `ai/`

A separate FastAPI process. **Advisory only** — it never writes the database, never
transitions an entry, and must never imply a grade. Every value it returns is
re-validated by Zod on the backend before storage.

| Tool | Where | What it does |
|---|---|---|
| **FastAPI 0.111** | `main.py`, `routers/` | The service. Routers: `health`, `chat`, `enrich`, `assist`, `knowledge` |
| **uvicorn** | container entrypoint | ASGI server |
| **pydantic-settings** | `config/settings.py` | Typed env config with defaults |
| **httpx** | every Groq caller | Async HTTP to Groq |
| **asyncpg** | `config/database.py` | Direct async Postgres access — **not** Prisma. Reads `POSTGRES_DSN` |
| **motor / pymongo** | `config/database.py`, `routers/chat.py` | Chat history store. `pymongo` is pinned explicitly: motor 3.4 crashes at boot against pymongo ≥ 4.17 |
| **sentence-transformers** (`all-MiniLM-L6-v2`) | `services/chatbot.py` | The one embedding model, shared. Baked into the image at build so a cold start does not download it |
| **torch (CPU build)** | transitive | Pinned to `+cpu` ahead of sentence-transformers, or pip pulls 3–5 GB of CUDA wheels |
| **numpy** | `services/knowledge.py`, `entry_plagiarism.py` | Vector maths. Corpus retrieval is a plain dot product over normalised vectors — exact at handbook scale, and no index to persist |
| **faiss-cpu** | `services/entry_plagiarism.py` | Similarity index — **plagiarism only**. The corpus retrieval dropped it |
| **scikit-learn** | `services/entry_plagiarism.py` | TF-IDF stage of the plagiarism check |
| **nltk** | `utils/text_processing.py` | Tokenising and stopwords; corpora baked into the image |

### External API

**Groq** — `openai/gpt-oss-120b` (set by `GROQ_MODEL`), OpenAI-compatible, at `api.groq.com/openai/v1`. Groq retires model ids; the predecessor was decommissioned and every call 404'd for weeks without surfacing, so the engine's `/health` now reports whether the configured id still exists.
The only external LLM in the system. There is **no OpenAI and no Gemini anywhere**.
Called from five places:

| Caller | Purpose |
|---|---|
| `services/chatbot.py` | The student assistant, answering from retrieved passages |
| `services/competency.py` | Classifies what an activity demonstrates, against a closed nine-key taxonomy |
| `services/entry_assist.py` | Helps a student write a day entry |
| `services/feedback_draft.py` | Drafts supervisor feedback (ten alternatives) |
| `routers/health.py` | Reachability probe for the status dot |

Every one of them fails open: no key, no network, or a malformed reply degrades
that feature rather than failing the request.

### The knowledge corpus

`ai/knowledge/*.md` → chunked on `##` headings → embedded → stored in the
`knowledge_passage` Postgres table. A heading is both the chunk and the citation.
Ingested on boot, idempotent by `(source, ordinal)` + content hash, so an unchanged
document embeds and writes nothing. Retrieval below `MIN_SIMILARITY = 0.25` returns
nothing at all, and the assistant then says it does not know rather than
improvising. `GET /health` reports the live corpus size so "grounded in the
regulations" is checkable rather than asserted.

**pytest** is the test runner (`cd ai && python3 -m pytest`) and runs without torch
installed — the semantic stage is stubbed in `conftest.py`.

---

## Frontend — `frontend/`

| Tool | Where | What it does |
|---|---|---|
| **React 18** | `src/` | UI |
| **Vite 5** + **@vitejs/plugin-react** | `vite.config.ts` | Dev server (5173) and production build |
| **React Router 6** | `src/router.tsx` | Routing and per-role route guards |
| **TanStack Query v5** | `src/lib/queryClient.ts`, `src/hooks/` | All server state — fetching, caching, invalidation. No Redux, no Zustand |
| **axios** | `src/lib/api.ts` | The single HTTP client. Attaches the access token and handles refresh-on-401 |
| **socket.io-client** | `src/lib/socket.ts` | Live notifications and chat |
| **Tailwind CSS 3** + **postcss** + **autoprefixer** | `tailwind.config.js` | Styling. Colours are CSS custom properties so light/dark swap without duplicated classes; `alpha()` maps a token to `color-mix()` |
| **shadcn/ui pattern** | `src/components/ui/` | Components are vendored into the repo, not installed |
| **clsx** + **tailwind-merge** | `src/lib/utils.ts` | Conditional classes with conflict resolution |
| **lucide-react** | throughout | Icon set |
| **Recharts** | `src/components/ui/Charts.tsx` | Every chart routes through this one wrapper |
| **SheetJS (`xlsx`)** | `src/lib/tabular.ts` | Roster parsing — `.xlsx/.xlsm/.xls/.ods`. **Dynamically imported**, so it stays out of the main bundle. Installed from the SheetJS CDN tarball, not npm |
| **Zod** | `src/shared/validation/` | The mirrored backend rules, enforced client-side too |

---

## Infrastructure

| | Service | Set where |
|---|---|---|
| Frontend host | **Vercel** | Root Directory is `frontend/` |
| Backend + AI host | **Render** | `render.yaml` blueprint |
| Postgres | external managed | `DATABASE_URL` (backend) and `POSTGRES_DSN` (AI) — **two separate dashboard variables, nothing ties them together**. They must point at the same database |
| MongoDB | Atlas | `MONGO_URI` |
| Redis | Upstash | `REDIS_URL`, backend only. Deliberately not a Render-managed instance — a blueprint sync would overwrite the live URL |
| Object storage | Cloudinary | `CLOUDINARY_*` |
| Email | SendGrid over SMTP | `SENDGRID_API_KEY` |
| LLM | Groq | `GROQ_API_KEY` |
| CI | **GitHub Actions** | `.github/workflows/ci.yml` — backend Jest, AI pytest, frontend build |
| Keepalive | GitHub Actions | `.github/workflows/keepalive.yml` — pings backend and AI so the free tier does not cold-sleep |
| Errors | Sentry | `SENTRY_DSN` |

Deploy is `git push origin main`: Render rebuilds the backend and the AI image,
Vercel rebuilds the frontend. This box has no Render or Vercel CLI, so anything
needing prod credentials — env vars, DB scripts — is manual in the dashboards.

## Local tooling

Screenshot and diagnostic sweeps run on **Playwright** (`playwright-core` plus a
cached Chromium), driving all 33 routes across four roles. It is a scratchpad
harness, not a repo dependency, and it is what caught the conditional-hook crash.
