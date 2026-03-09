# BoardOS — Backend Architecture

## Project Structure

```
boardos/
├── prisma/
│   └── schema.prisma              # Full DB schema
├── docker-compose.yml             # Local dev stack
├── backend/
│   └── src/
│       ├── app.module.ts          # Root module
│       ├── prisma/                # PrismaService (shared)
│       ├── auth/                  # JWT auth, register, login
│       ├── company/               # Company workspace + invite directors
│       ├── meeting/               # CRUD + workflow state machine
│       ├── resolution/            # Resolution CRUD
│       ├── voting/                # Cast votes + auto-finalize majority
│       ├── minutes/               # Generate + sign + lock minutes
│       ├── document/              # PDF via Puppeteer + S3 upload
│       ├── archive/               # Immutable document vault
│       ├── audit/                 # Append-only audit log
│       └── notification/          # BullMQ queue + email delivery
└── frontend/
    └── src/
        ├── app/                   # Next.js app router pages
        ├── components/            # Shared UI components
        └── lib/                   # API client, auth helpers
```

---

## API Endpoints

### Auth
| Method | Route             | Description         |
|--------|-------------------|---------------------|
| POST   | /auth/register    | Register new user   |
| POST   | /auth/login       | Login, returns JWT  |

### Companies
| Method | Route                              | Description              |
|--------|------------------------------------|--------------------------|
| GET    | /companies                         | List user's companies    |
| POST   | /companies                         | Create company workspace |
| GET    | /companies/:id                     | Get company details      |
| POST   | /companies/:id/invite              | Invite director by email |
| GET    | /companies/:id/members             | List all directors       |
| GET    | /companies/:id/audit               | Company audit trail      |

### Meetings
| Method | Route                                        | Description                  |
|--------|----------------------------------------------|------------------------------|
| GET    | /companies/:cid/meetings                     | List meetings                |
| POST   | /companies/:cid/meetings                     | Create meeting               |
| GET    | /companies/:cid/meetings/:id                 | Meeting detail + agenda      |
| PATCH  | /companies/:cid/meetings/:id                 | Update meeting               |
| POST   | /companies/:cid/meetings/:id/agenda          | Add agenda item              |
| PATCH  | /companies/:cid/meetings/:id/status/:status  | Drive workflow state machine |

### Resolutions
| Method | Route                                  | Description            |
|--------|----------------------------------------|------------------------|
| GET    | /companies/:cid/resolutions            | List resolutions       |
| POST   | /companies/:cid/resolutions            | Create resolution      |
| PATCH  | /companies/:cid/resolutions/:id        | Update resolution      |
| PATCH  | /companies/:cid/resolutions/:id/status | Propose / open voting  |

### Voting
| Method | Route                                           | Description              |
|--------|-------------------------------------------------|--------------------------|
| GET    | /companies/:cid/resolutions/:rid/votes          | Get tally + vote list    |
| POST   | /companies/:cid/resolutions/:rid/votes          | Cast vote                |

### Minutes
| Method | Route                                     | Description              |
|--------|-------------------------------------------|--------------------------|
| GET    | /companies/:cid/meetings/:mid/minutes     | Get minutes              |
| POST   | /companies/:cid/meetings/:mid/minutes     | Generate minutes         |
| POST   | /companies/:cid/meetings/:mid/minutes/sign| Chairman signs minutes   |

### Documents
| Method | Route                                         | Description              |
|--------|-----------------------------------------------|--------------------------|
| GET    | /companies/:cid/documents                     | List all documents       |
| POST   | /companies/:cid/meetings/:mid/minutes/export  | Generate minutes PDF     |
| POST   | /companies/:cid/resolutions/:rid/certify      | Generate certified copy  |

---

## Meeting Workflow State Machine

```
DRAFT → SCHEDULED → IN_PROGRESS → VOTING → MINUTES_DRAFT → SIGNED → LOCKED
```

- `DRAFT` — Created, not yet finalized
- `SCHEDULED` — Directors notified
- `IN_PROGRESS` — Meeting is live
- `VOTING` — Resolutions open for director votes
- `MINUTES_DRAFT` — Minutes generated, editable
- `SIGNED` — Chairman signed, content frozen (SHA-256 hash stored)
- `LOCKED` — Archived, immutable

---

## Key Design Decisions

**Multi-tenancy**: Every governance table carries `company_id`. All queries are scoped by company — no data leaks across tenants.

**Immutability**: Once minutes are signed, a SHA-256 hash of the content is stored. Any tamper attempt is detectable. The `LOCKED` state prevents further changes at application level.

**Vote auto-finalization**: When all directors have voted, the system automatically marks a resolution `APPROVED` or `REJECTED` based on simple majority. No manual step needed.

**Async notifications**: All emails go through a BullMQ queue backed by Redis. This means voting confirmations and meeting invites never slow down API responses.

**Audit log**: Every state transition, vote, signature, and document generation is logged with user + timestamp + IP. Logs are append-only (no update/delete methods exposed).

---

## Dev Setup

```bash
# 1. Start infra
docker-compose up -d postgres redis

# 2. Run migrations
cd backend && npx prisma migrate dev

# 3. Start backend
npm run start:dev

# 4. Start frontend
cd ../frontend && npm run dev
```

---

## MVP Checklist

### Backend
- [x] Prisma schema — multi-tenant, 14 tables + enums
- [x] `main.ts` — bootstrap, validation pipe, CORS, Swagger
- [x] `PrismaService` + `PrismaModule` — global, lifecycle-aware
- [x] Auth — JWT, bcrypt rounds=12, register + login, DTOs
- [x] Company — CRUD, CompanyGuard, ROLE_RANK enforcement
- [x] Invite flow — 64-char token, 7d TTL, upsert, atomic accept
- [x] Meeting — CRUD + ALLOWED_TRANSITIONS state machine
- [x] Resolution — state machine, bulk open voting
- [x] Voting — upsert, tally, auto-finalize simple majority
- [x] Minutes — HTML generation, SHA-256 chairman signature
- [x] Document — Puppeteer PDF, S3 AES256, certified copies
- [x] Archive — lock, certify, SHA-256 integrity verify
- [x] Audit — global @Injectable, append-only (no update/delete)
- [x] Notification — BullMQ queue, retry ×3 exponential backoff
- [x] Docker Compose — postgres + redis + backend + frontend
- [x] Unit tests — 37 tests across 3 suites
- [x] E2E tests — full lifecycle (register → lock) + security checks

### Frontend
- [x] `api.ts` — typed client, 40+ functions, all endpoints covered
- [x] `auth.ts` — localStorage session helpers
- [x] `useAuth` hook — `useAuth()` + `useRequireAuth()` redirect guard
- [x] `CompanyContext` — active company shared across dashboard subtree
- [x] Login page — form, 401 handling, redirect-if-logged-in
- [x] Register page — live 4-level password strength bar
- [x] Dashboard layout — sidebar, company switcher, user card
- [x] Dashboard page — stat cards, upcoming meetings, action-required panel
- [x] Company workspace — Overview · Members · Invites · Audit Log tabs
- [x] Archive page — filter, expand, PDF export, certified copy
- [x] Meeting workspace — agenda rail, resolutions, inline voting, minutes
- [x] Invite acceptance page — 5-stage state machine
- [x] Partner dashboard — CA/CS multi-company control panel
- [x] `next.config.js` — /api proxy rewrite, security headers, standalone
- [x] Frontend Dockerfile — 3-stage build, non-root user
- [x] `tailwind.config.ts` — design token extensions
- [x] `.env.example` — all required variables documented

### Remaining (post-MVP)
- [ ] Stripe billing — subscription gating per company
- [ ] Branded email templates — invite + vote reminder HTML
- [ ] ROC form pre-fill — MCA21 API integration
- [ ] Mobile-responsive layout pass
- [ ] WCAG 2.1 AA accessibility audit
# BoardOS — deployed via Cloud Build
