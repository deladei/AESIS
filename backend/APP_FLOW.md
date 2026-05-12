# AESIS — Application Flow
## User Journey Maps by Role

---

## 1. System Entry Points

```
Browser (HTTPS)
    │
    ▼
Nginx (TLS termination)
    ├── /api/v1/*  ──► Node.js + Express
    ├── /ai/*      ──► FastAPI AI Engine
    └── /*         ──► React SPA (static)
```

---

## 2. Authentication Flow (All Roles)

```
┌─────────────────────────────────────────────────────────────┐
│ REGISTRATION                                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User submits register form                                 │
│       │                                                     │
│       ▼                                                     │
│  POST /auth/register                                        │
│  ├── Zod validate body                                      │
│  ├── Check email uniqueness                                 │
│  ├── bcrypt hash password (cost 12)                         │
│  ├── Create user (is_verified = false)                      │
│  ├── Generate verification token                            │
│  └── Send verification email                               │
│       │                                                     │
│       ▼                                                     │
│  User clicks email link                                     │
│  GET /auth/verify-email?token=xxx                           │
│  └── Set is_verified = true, clear token                    │
│       │                                                     │
│       ▼                                                     │
│  Redirect → Login page                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ LOGIN                                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  POST /auth/login                                           │
│  ├── Zod validate                                           │
│  ├── Lookup user by email                                   │
│  ├── bcrypt.compare(password, hash)                         │
│  ├── Issue JWT access token (15-min, in response body)      │
│  ├── Issue refresh token (7-day, HttpOnly Secure cookie)    │
│  ├── Update last_login_at                                   │
│  └── Return { accessToken, user: { id, role, name } }      │
│       │                                                     │
│       ▼                                                     │
│  React stores accessToken in memory (NOT localStorage)      │
│  React Router redirects by role:                            │
│  ├── student       → /dashboard/student                     │
│  ├── supervisor    → /dashboard/supervisor                  │
│  ├── coordinator   → /dashboard/coordinator                 │
│  └── admin         → /admin                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ TOKEN REFRESH (Silent, automatic)                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Axios interceptor catches 401 response                     │
│  POST /auth/refresh  (sends HttpOnly cookie automatically)  │
│  ├── Validate refresh token (DB lookup, not revoked)        │
│  ├── Issue new JWT access token                             │
│  └── Retry original request with new token                  │
│                                                             │
│  If refresh token expired → force logout → /login           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Student Flow

```
┌─────────────────────────────────────────────────────────────┐
│ ONBOARDING (first login after registration)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Complete profile                                           │
│  ├── CS programme, level, expected placement start          │
│  └── Profile saved                                         │
│       │                                                     │
│       ▼                                                     │
│  Submit Placement Request                                   │
│  ├── Fill: company name, address, company supervisor        │
│  │         contact, expected start/end dates                │
│  ├── Upload placement letter (S3)                           │
│  └── POST /placements                                       │
│       │                                                     │
│       ▼                                                     │
│  Status: PENDING (waiting coordinator approval)             │
│  Dashboard shows placement pending banner                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ WEEKLY LOGBOOK CYCLE                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Monday 08:00 ──► Automated reminder notification           │
│                                                             │
│  Student opens Logbook Editor                               │
│  Fields:                                                    │
│  ├── Week number (auto-determined)                          │
│  ├── Technologies used (CS-specific)                        │
│  ├── Tasks completed                                        │
│  ├── Technical challenges faced                             │
│  ├── Reflection on learning                                 │
│  └── File attachments (optional)                            │
│                                                             │
│  Student clicks "Submit"                                    │
│  POST /logbook/submit                                       │
│  ├── Validate week (no duplicate)                           │
│  ├── Store full text → MongoDB                              │
│  ├── Store metadata → PostgreSQL (is_late auto-flagged)     │
│  └── Queue AI analysis task (Celery)                        │
│       │                                                     │
│       ├── AI Status: PENDING → PROCESSING → COMPLETED       │
│       │                                                     │
│       ▼                                                     │
│  Student sees AI Feedback Preview (P1):                     │
│  ├── Quality score (0–100) with rubric breakdown            │
│  ├── CS relevance indicator                                 │
│  ├── Plagiarism flag (if triggered)                         │
│  └── AI feedback summary text                               │
│                                                             │
│  Submission Status Tracker:                                 │
│  Pending AI Analysis → AI Done → Under Review → Approved   │
│                                                             │
│  Supervisor reviews and submits feedback (≤3 business days) │
│       │                                                     │
│       ▼                                                     │
│  Student receives notification: "New feedback from [name]"  │
│  Student reads feedback on logbook detail page              │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ STUDENT DASHBOARD                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ├── Current risk tier badge (Low / Medium / High)          │
│  ├── Quality score trend (line chart — last 8 weeks)        │
│  ├── Submission compliance rate (% on-time)                 │
│  ├── Recent feedback cards                                  │
│  ├── Upcoming deadline countdown                            │
│  └── Notification bell (unread count)                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Academic Supervisor Flow

```
┌─────────────────────────────────────────────────────────────┐
│ SUPERVISOR DASHBOARD                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Assigned students table:                                   │
│  ├── Risk tier badge per student (Low/Medium/High)          │
│  ├── Submission status this week                            │
│  ├── Latest quality score                                   │
│  └── "Review" action button                                 │
│                                                             │
│  Risk Alert Banner: lists any students in High tier         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ LOGBOOK REVIEW INTERFACE                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Two-panel layout:                                          │
│  ┌─────────────────┬───────────────────────────────┐        │
│  │ Student Entry   │ AI Analysis Panel             │        │
│  │ (full logbook   │ ├── Quality score: 78/100     │        │
│  │  text, week,    │ ├── Rubric breakdown           │        │
│  │  attachments)   │ ├── CS relevance: 0.91         │        │
│  │                 │ ├── Plagiarism: ⚠ 0.41 (HIGH) │        │
│  │                 │ ├── SHAP explanation           │        │
│  │                 │ └── AI feedback summary        │        │
│  └─────────────────┴───────────────────────────────┘        │
│                                                             │
│  Supervisor actions:                                        │
│  ├── Write feedback (with AI-drafted suggestion pre-filled) │
│  ├── Mark as Approved / Flagged                             │
│  └── Escalate to Coordinator (one-click, if High Risk)      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ RISK ALERT FLOW (Real-Time)                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Weekly AI engine run → student risk_score > 0.6            │
│  AND previous_tier != high                                  │
│       │                                                     │
│       ▼                                                     │
│  FastAPI → POST /internal/notify-risk                       │
│  Node.js:                                                   │
│  ├── Create Notification record (supervisor + coordinator)  │
│  ├── Socket.io emit to supervisor room                      │
│  └── Send email alert                                       │
│       │                                                     │
│       ▼                                                     │
│  Supervisor sees real-time toast: "⚠ [Student] is High Risk"│
│  Supervisor opens risk detail:                              │
│  ├── SHAP top-3 factors displayed                           │
│  └── Action choices:                                        │
│       ├── "Schedule check-in" → VisitSchedule created       │
│       ├── "Escalate to Coordinator" → RiskEscalation record │
│       └── "Dismiss" → requires written reason (audit logged)│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Programme Coordinator Flow

```
┌─────────────────────────────────────────────────────────────┐
│ COHORT HEALTH DASHBOARD                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Top metrics row:                                           │
│  ├── Total active students                                  │
│  ├── Submission compliance rate (this week)                 │
│  ├── High-risk count (with badge)                           │
│  └── Pending placements awaiting approval                   │
│                                                             │
│  Risk distribution donut chart (Low / Medium / High)        │
│  Submission compliance trend (bar chart — last 8 weeks)     │
│  Recent risk alerts feed                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PLACEMENT APPROVAL WORKFLOW                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Coordinator reviews pending placements:                    │
│  ├── Student details, company, dates, uploaded letter       │
│  ├── APPROVE → placement_status = active                    │
│  │   ├── Assign academic supervisor                         │
│  │   ├── Auto-generate 24-week logbook schedule             │
│  │   └── Notify student + supervisors                       │
│  └── REJECT → requires rejection_reason                     │
│       └── Notify student with reason                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ COMPANY ANALYTICS                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Table: companies ranked by avg student quality score       │
│  ├── Current year vs. prior year comparison                 │
│  ├── Number of CS students hosted                           │
│  ├── Average risk tier distribution                         │
│  └── Trend chart per company                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ REPORT GENERATION                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Coordinator clicks "Generate Mid-Term Report"              │
│  GET /api/v1/reports/mid-term/:cohortId                     │
│  ├── Aggregate: risk distribution, compliance, flagged cases │
│  ├── Render PDF (Puppeteer/pdfkit)                          │
│  └── Stream PDF download to browser                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. AI Processing Flow

```
Logbook Submission
      │
      ▼
Node.js → POST /ai/analyze/logbook (FastAPI)
      │
      ▼
Celery task queued (Redis broker)
      │
      ▼
Worker picks up task:
  1. spaCy preprocessing
      ├── Tokenise, lemmatise, remove stopwords
      └── NER: extract technology names, dates, organisations
  2. BERT quality scoring
      ├── Task Depth    → 0–30
      ├── Tech Vocab    → 0–25
      ├── Reflection    → 0–25
      └── Temporal Cons → 0–20
  3. TF-IDF + logistic regression → CS relevance score
  4. FAISS plagiarism check
      ├── Jaccard similarity vs. cohort index
      └── Flag if > 0.35
  5. Write results → logbook_analyses (PostgreSQL)
  6. Update logbook_submissions.ai_analysis_status = completed
      │
      ▼
XGBoost risk engine (weekly Celery beat task):
  ├── Pull 18 features per active student from PostgreSQL
  ├── Run inference → risk_score, risk_tier
  ├── Compute SHAP values
  ├── Write → student_risk_scores
  └── If tier transition to HIGH:
        └── POST /internal/notify-risk → Node.js
              ├── Socket.io push (supervisor + coordinator)
              └── Email alert
```

---

## 7. Chatbot (AESIS Assistant) Flow

```
Student types question in chatbot panel
      │
      ▼
POST /ai/chat  { session_id, message }
      │
      ▼
FastAPI RAG pipeline:
  1. Embed user query → all-MiniLM-L6-v2
  2. FAISS top-5 chunk retrieval from CS knowledge base
  3. Construct prompt: [system] + [retrieved chunks] + [query]
  4. GPT-4o-mini (or Mistral-7B Ollama fallback) → stream response
  5. Save message to MongoDB chat session
      │
      ▼
Server-Sent Events stream → React chatbot panel
(typing indicator → streamed tokens → done)
```

---

## 8. Notification Delivery Map

| Event | In-App | Socket.io Push | Email |
|---|---|---|---|
| Risk tier → High | ✓ (supervisor + coord) | ✓ | ✓ |
| New supervisor feedback | ✓ (student) | ✓ | ✓ (P1) |
| Submission reminder (Mon 08:00) | ✓ | — | ✓ |
| Placement approved | ✓ (student) | ✓ | ✓ |
| Placement rejected | ✓ (student) | ✓ | ✓ |
| Escalation received | ✓ (coordinator) | ✓ | ✓ |
| Plagiarism flagged | ✓ (supervisor) | ✓ | — |
