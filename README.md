# Examify — Multi-tenant CBT Platform

A Computer-Based Testing (CBT) SaaS platform for Nigerian secondary schools.

## Architecture

```
examify/
├── apps/
│   ├── api/          # Fastify + TypeScript backend
│   │   └── src/
│   │       ├── config/       # Environment validation
│   │       ├── db/           # PostgreSQL client, migrations, seed
│   │       ├── middleware/   # Tenant resolution, auth, role guards
│   │       └── routes/       # auth, exams, questions, users
│   └── web/          # Next.js frontend (scaffold next)
└── packages/
    └── shared/       # Shared types between API and web
```

## Multi-tenancy strategy

- **One shared database** — all schools in the same PostgreSQL instance
- **school_id on every row** — all tenant-scoped tables carry this column
- **Tenant resolution from subdomain** — `greensprings.examify.ng` → `school_id = ...`
- **JWT cross-check** — token's `schoolId` must match the request's subdomain tenant
- **PostgreSQL Row Level Security** — database-level safety net; queries without tenant context are rejected

## Quick start

### 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `src/db/001_initial_schema.sql`
3. Copy your connection string from **Settings → Database → Connection string**

### 2. Configure environment

```bash
cd apps/api
cp .env.example .env
# Fill in DATABASE_URL, JWT_SECRET, and other values
```

Generate a strong JWT secret:
```bash
openssl rand -hex 64
```

### 3. Install dependencies and seed

```bash
npm install           # from repo root
npm run seed --workspace=apps/api
```

### 4. Start the API

```bash
npm run dev:api
# → API running on http://localhost:3001
```

### 5. Test with curl (development)

In development, simulate a school tenant with the `X-School-Subdomain` header:

```bash
# Login as school admin
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-School-Subdomain: greensprings" \
  -d '{"email":"admin@greensprings.examify.ng","password":"Admin@1234"}'

# Login as student
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-School-Subdomain: greensprings" \
  -d '{"email":"amara.obi@greensprings.examify.ng","password":"Student@1234"}'
```

## API reference

### Auth
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/api/auth/login` | All | Login, returns JWT |
| GET | `/api/auth/me` | All | Current user profile |
| POST | `/api/auth/change-password` | All | Change password |

### Users (school_admin only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List users (filter by role, class) |
| POST | `/api/users` | Create single user |
| POST | `/api/users/bulk` | Import students in bulk |
| PATCH | `/api/users/:id/status` | Activate / deactivate user |

### Questions (teacher, school_admin)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/questions` | List questions (filter by subject, class) |
| POST | `/api/questions` | Create question |
| POST | `/api/questions/bulk` | Bulk import questions |
| DELETE | `/api/questions/:id` | Soft-delete question |

### Exams
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/exams` | teacher, admin | List all exams |
| POST | `/api/exams` | teacher, admin | Create exam |
| GET | `/api/exams/available` | student | Exams available to this student |
| POST | `/api/exams/:id/start` | student | Start exam session |
| GET | `/api/exams/:id/session` | student | Get questions for active session |
| PATCH | `/api/sessions/:id/answers` | student | Save answers (call every 30s) |
| POST | `/api/sessions/:id/submit` | student | Submit exam |
| GET | `/api/exams/:id/results` | teacher, admin | View all student results |

## Deployment checklist (before going live)

- [ ] Run SQL migration on Supabase production project
- [ ] Set `NODE_ENV=production` and strong `JWT_SECRET`
- [ ] Configure wildcard DNS: `*.examify.ng → your server IP`
- [ ] Set up HTTPS (Supabase handles DB SSL; use Nginx/Caddy for API)
- [ ] Configure Paystack webhook for subscription management
- [ ] Set up Resend/SendGrid for result notification emails
- [ ] Test offline exam flow on a low-bandwidth connection
- [ ] Test with 2 tenant schools locally before onboarding school #1

## Adding a new school

```sql
-- 1. Insert the school record
INSERT INTO schools (name, subdomain, subscription_tier, max_students)
VALUES ('Lagos Model School', 'lagosmodel', 'starter', 200);

-- 2. Create the school admin user (or use the POST /api/users endpoint)
```

Then point `lagosmodel.examify.ng` at your server — the tenant resolves automatically.
