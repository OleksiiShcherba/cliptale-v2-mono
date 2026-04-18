---
name: repo-navigator
description: >
  Investigates the current repository, detects the technology stack and language(s) in use,
  and produces a maximally compact project roadmap saved to ./docs-claude/ that
  contains all main logic paths, folder structure, domain directions, and key entry points —
  so other agents can navigate the project without reading every file.
  Generates a top-level roadmap (./docs-claude/roadmap.md) plus individual deep-dive roadmaps
  for the largest/most complex domains (./docs-claude/<domain>/roadmap.md).
  For large repositories the skill breaks the work into logical blocks and processes them
  one block at a time, using a divider strategy it selects itself.
  Use this skill whenever the user says things like "map the repo", "create a project roadmap",
  "analyze the codebase structure", "document the project", "help an agent understand this project",
  "what's the structure of this project", "create a navigation map", "document codebase for agents",
  or any time an agent needs a high-level orientation map of a repository before starting work.
  Always trigger when the user uploads or mentions a repository and asks for structure, overview,
  or documentation — even if they don't say "roadmap" or "skill" explicitly.
---

# Repo Navigator Skill

Produces a compact, agent-readable **Project Roadmap** in `./docs-claude/` by investigating
the repository structure, detecting the stack, identifying domains, and mapping main logic flows.

Output structure:
```
./docs-claude/
  roadmap.md              ← Top-level: stack, structure, all domains (brief)
  <big-domain>/
    roadmap.md            ← Deep-dive for each large/complex domain
```

---

## Phase 0 — User Interview

**Before touching the filesystem**, ask the user these questions in a single message.
This context shapes what the roadmap emphasises and how deeply to go.

> Before I start mapping the repo, a few quick questions:
>
> 1. **Purpose** — What will agents use this roadmap for?
>    (e.g. "implement new features", "debug issues", "add a microservice", "general onboarding")
>    Leave blank for general navigation.
>
> 2. **Focus areas** — Any specific domains or layers you want mapped in extra detail?
>    (e.g. "the payment flow", "the frontend components", "the auth system")
>    Or: "all equal".
>
> 3. **Known complexity** — Any parts you know are especially large, messy, or critical
>    that I should pay extra attention to?
>
> 4. **Exclusions** — Anything to skip or mark out-of-scope?
>    (e.g. "ignore the legacy/ folder", "skip e2e tests")

Wait for the user's answers. If they say "just go" or skip, proceed with defaults
(general navigation purpose, all areas equal, no known complexity flags, no exclusions).

Store answers as context for the rest of the skill:
- `PURPOSE` → shapes the Agent Navigation Guide
- `FOCUS_AREAS` → these domains are promoted to big-domain status (get own roadmap.md)
- `KNOWN_COMPLEXITY` → flagged prominently in top-level roadmap with ⚠️
- `EXCLUSIONS` → added to all `find` ignore patterns below

---

## Phase 1 — Size Assessment & Strategy Selection

Count files (applying `EXCLUSIONS`):

```bash
find . -type f \
  ! -path '*/.git/*' \
  ! -path '*/node_modules/*' \
  ! -path '*/.venv/*' \
  ! -path '*/vendor/*' \
  ! -path '*/__pycache__/*' \
  ! -path '*/dist/*' \
  ! -path '*/build/*' \
  ! -path '*/docs-claude/*' \
  # + EXCLUSIONS paths
  | wc -l
```

| File count | Strategy |
|---|---|
| < 200 | **FULL** — scan everything in one pass |
| 200 – 1 000 | **DOMAIN** — split by top-level domain folders |
| 1 000 – 5 000 | **LAYER** — split by architectural layer |
| > 5 000 | **PACKAGE** — split by sub-packages / micro-services |

Announce to the user before proceeding:
> "This repo has ~N files. Using **STRATEGY** — processing in X block(s)."

---

## Phase 2 — Stack & Language Detection

```bash
# Manifest files
ls -1 . 2>/dev/null | grep -E \
  'package\.json|Cargo\.toml|go\.mod|pyproject\.toml|requirements\.txt|Gemfile|pom\.xml|build\.gradle|composer\.json|mix\.exs|\.sln|\.csproj'

# Language distribution by extension
find . -type f ! -path '*/.git/*' ! -path '*/node_modules/*' ! -path '*/.venv/*' \
  | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -20

# Framework signals in manifests
grep -rl 'express\|fastapi\|django\|rails\|laravel\|phoenix\|spring\|nestjs\|nuxt\|next\|astro\|remix' \
  --include='*.json' --include='*.toml' --include='*.lock' -l 2>/dev/null | head -5
```

Synthesise into Stack Summary:
```
STACK:     TypeScript / Node.js
FRAMEWORK: NestJS (API) + React (frontend)
RUNTIME:   Node 20
INFRA:     Docker, GitHub Actions
TEST:      Jest, Playwright
```

---

## Phase 3 — Structural Scan & Domain Identification

### 3a. Directory tree (2 levels)

```bash
find . -maxdepth 2 -type d \
  ! -path '*/.git*' ! -path '*/node_modules*' ! -path '*/.venv*' \
  ! -path '*/vendor*' ! -path '*/__pycache__*' ! -path '*/dist*' \
  ! -path '*/build*' ! -path '*/.next*' ! -path '*/coverage*' \
  ! -path '*/docs-claude*' \
  | sort
```

### 3b. Entry points (detect by stack)

| Stack | Patterns |
|---|---|
| Node/TS | `src/main.ts`, `src/index.ts`, `server.ts`, `app.ts` |
| Python | `main.py`, `app.py`, `manage.py`, `__main__.py` |
| Go | `main.go`, `cmd/*/main.go` |
| Ruby | `config/application.rb`, `bin/rails` |
| Java/Kotlin | `*Application.java`, `*Application.kt` |
| Rust | `src/main.rs`, `src/lib.rs` |
| PHP | `artisan`, `public/index.php` |
| .NET | `Program.cs`, `Startup.cs` |

### 3c. Domain grouping

```bash
find . -maxdepth 3 \( -name '*.module.ts' -o -name 'router*.go' \
  -o -name '*Controller*' -o -name '*Service*' -o -name '*Repository*' \) \
  ! -path '*/node_modules/*' 2>/dev/null | head -40
```

Common domain patterns:
- `auth/` `users/` → **Identity**
- `orders/` `cart/` `checkout/` → **Commerce**
- `api/` `routes/` `controllers/` → **HTTP layer**
- `db/` `migrations/` `models/` `entities/` → **Data layer**
- `workers/` `jobs/` `queues/` → **Background processing**
- `ui/` `components/` `pages/` `views/` → **Frontend**
- `infra/` `terraform/` `k8s/` `.github/` → **Infrastructure**
- `lib/` `utils/` `shared/` `common/` → **Shared utilities**

### 3d. Classify domains: big vs small

A domain is **big** (gets its own `docs-claude/<domain>/roadmap.md`) if ANY:
- Contains > 15 source files
- Has ≥ 3 sub-directories
- Listed in `FOCUS_AREAS` by the user
- Listed in `KNOWN_COMPLEXITY` by the user

All other domains are **small** — summarised inline in the top-level roadmap.

---

## Phase 4 — Top-Level Roadmap

Create `./docs-claude/roadmap.md`. Max 300 lines — this is the index, not the detail.

```markdown
# Project Roadmap
> Auto-generated by repo-navigator — agent navigation index
> Strategy: <STRATEGY> | Generated: <YYYY-MM-DD>
> Purpose: <PURPOSE>

---

## Stack
| Dimension | Value |
|---|---|
| Languages | TypeScript, SQL |
| Runtime | Node 20 |
| Framework | NestJS 10 (API) + React 18 (frontend) |
| Database | PostgreSQL via TypeORM |
| Queue | BullMQ + Redis |
| Test | Jest, Playwright |
| Infra | Docker, GitHub Actions |

---

## Repository Structure

\`\`\`
src/
  auth/           ← [BIG] Identity domain — JWT, guards, sessions
  users/          ← [BIG] User CRUD, roles, preferences
  orders/         ← [BIG] Order lifecycle, state machine
  payments/       ← Stripe integration, webhooks
  notifications/  ← Email/push via queue workers
  shared/         ← DTOs, decorators, utils
  config/         ← Env validation
  main.ts         ← Bootstrap, global pipes/filters
frontend/
  src/
    pages/        ← [BIG] Route-level components
    components/   ← Shared UI components
    hooks/        ← Custom React hooks
    api/          ← Typed API client
infra/
  docker/
  .github/        ← CI/CD workflows
\`\`\`

---

## Domains Index

| Domain | Path | Files | Roadmap |
|---|---|---|---|
| Auth | src/auth/ | 14 | [→ docs-claude/auth/roadmap.md](auth/roadmap.md) |
| Users | src/users/ | 18 | [→ docs-claude/users/roadmap.md](users/roadmap.md) |
| Orders | src/orders/ | 26 | [→ docs-claude/orders/roadmap.md](orders/roadmap.md) |
| Frontend | frontend/src/ | 45 | [→ docs-claude/frontend/roadmap.md](frontend/roadmap.md) |
| Payments | src/payments/ | 9 | (inline ↓) |
| Notifications | src/notifications/ | 6 | (inline ↓) |
| Shared | src/shared/ | 8 | (inline ↓) |

---

## Small Domains (inline)

### Payments
- **Path:** `src/payments/`
- **Key files:** `stripe.service.ts`, `webhook.controller.ts`, `payment.entity.ts`
- **Flow:** Stripe webhook → WebhookController → PaymentsService → OrdersService.updateStatus()
- **External:** Stripe SDK

### Notifications
- **Path:** `src/notifications/`
- **Key files:** `notifications.processor.ts`, `email.service.ts`
- **Flow:** BullMQ job → NotificationsProcessor → EmailService → SendGrid
- **External:** SendGrid, Firebase (push)

### Shared / Utils
- **Path:** `src/shared/`
- **Key dirs:** `dto/`, `pipes/`, `filters/`, `decorators/`
- **Purpose:** GlobalExceptionFilter, validation pipes, cross-domain DTOs

---

## Main Data Models

| Model | File | Key Fields |
|---|---|---|
| User | src/users/entities/user.entity.ts | id, email, role, passwordHash |
| Order | src/orders/entities/order.entity.ts | id, userId, status, items[], totalCents |
| Payment | src/payments/entities/payment.entity.ts | id, orderId, stripeId, status |

---

## Cross-Cutting Concerns

| Concern | Location | Notes |
|---|---|---|
| Auth guard | src/auth/guards/ | Global — whitelist with @Public() |
| Validation | src/shared/pipes/ | class-validator DTOs |
| Error handling | src/shared/filters/ | GlobalExceptionFilter |
| Config | src/config/ | Joi schema, ConfigModule.forRoot() |
| Logging | src/shared/logger/ | Pino structured JSON |

---

## Entry Points & Commands

| Purpose | Command / File |
|---|---|
| Dev server | `npm run start:dev` → src/main.ts |
| Migrations | `npm run migration:run` |
| Tests | `npm test` / `npm run test:e2e` |
| Build | `npm run build` → dist/ |
| Docker | `docker compose up` |

---

## Agent Navigation Guide

<!-- Shaped by PURPOSE -->
To work on a domain: open its deep-dive roadmap linked in the Domains Index above.
To add a new domain: copy `src/users/` as template, register in `src/app.module.ts`.
To change DB schema: `npm run migration:generate`, edit the generated file.
To add an API route: controller → domain module → DTO in `shared/dto/`.
To add a background job: see `src/notifications/notifications.processor.ts`.

---
⚠️ Flagged complexity: <KNOWN_COMPLEXITY if any — else remove this line>
```

---

## Phase 5 — Domain Deep-Dive Roadmaps

For each **big domain**, create `./docs-claude/<domain>/roadmap.md`.

First, scan the domain more deeply:

```bash
# All source files (no tests, no generated)
find ./<domain-path> -type f \
  ! -name '*.test.*' ! -name '*.spec.*' ! -name '*.d.ts' \
  ! -name '*.snap' ! -name '*.lock' | sort

# Sub-directories
find ./<domain-path> -type d | sort
```

Spot-read (do NOT fully read all files — pick these):
1. The module/router registration file
2. The primary service or handler (most central business logic)
3. The main entity/model/schema file

Domain roadmap template:

```markdown
# <Domain> — Domain Roadmap
> Part of: [← Project Roadmap](../roadmap.md)
> Generated: <YYYY-MM-DD>

---

## Responsibility
<One sentence: what this domain owns end-to-end>

---

## Structure

\`\`\`
<domain-path>/
  controllers/    ← HTTP handlers
  services/       ← Business logic
  entities/       ← DB models
  dto/            ← Input/output shapes
  guards/         ← Domain-specific auth
  <other dirs>    ← purpose
\`\`\`

---

## Key Files

| File | Role |
|---|---|
| auth.module.ts | Wires providers, imports JwtModule |
| auth.service.ts | login(), register(), refresh() |
| jwt.strategy.ts | Passport JWT validation |
| guards/jwt.guard.ts | Applied on protected routes |

---

## Main Flows

### <Flow name>
\`\`\`
POST /auth/login
  → AuthController.login(dto)
  → AuthService.validateUser(email, password)
  → bcrypt.compare() → User
  → JwtService.sign(payload)
  → { access_token, refresh_token }
\`\`\`

---

## Data Models

| Model | File | Key Fields |
|---|---|---|
| User | entities/user.entity.ts | id, email, passwordHash, role |

---

## External Dependencies

| Package | Purpose |
|---|---|
| @nestjs/jwt | JWT sign/verify |
| bcrypt | Password hashing |

---

## Cross-Domain Links

- **Uses:** `UsersService` (src/users/) — load user records
- **Used by:** all protected routes via JwtGuard
- **Emits:** none

---

## Agent Instructions

To add a new strategy (e.g. OAuth): add strategy file, register in `auth.module.ts`.
To change token expiry: update `JwtModule.register()` in `auth.module.ts`.
To mark a route public: apply `@Public()` decorator (`decorators/public.decorator.ts`).
```

---

## Phase 6 — Multi-Pass Handling (large repos)

For **DOMAIN / LAYER / PACKAGE** strategies spanning multiple turns:

1. After Phase 1, write a Processing Status table at the top of `./docs-claude/roadmap.md`:

```markdown
## Processing Status
> Strategy: DOMAIN | 6 blocks total

| Block | Covers | Status |
|---|---|---|
| 1 | auth, users | ✅ complete |
| 2 | orders, payments | ⏳ in progress |
| 3 | notifications, scheduler | ☐ pending |
| 4 | frontend | ☐ pending |
| 5 | infra / CI | ☐ pending |
| 6 | shared / config / utils | ☐ pending |
```

2. Complete one block per turn, then pause:
> "Block 1 done (auth, users). Shall I continue with Block 2 (orders, payments)?"

3. Mark `✅` as each block completes. Roadmap is complete when all are `✅`.

### Block divider rules

| Strategy | Divider | Example |
|---|---|---|
| DOMAIN | Feature folders ≥ 3 files | `auth/`, `orders/`, `ui/` |
| LAYER | Architectural layer | `api`, `services`, `data`, `frontend` |
| PACKAGE | `packages/*/`, `apps/*/`, `services/*/` | each sub-package |

---

## Output Rules

- **Root output dir:** `./docs-claude/` — create silently if absent
- **Top-level roadmap:** `./docs-claude/roadmap.md` — max 300 lines
- **Domain roadmaps:** `./docs-claude/<domain>/roadmap.md` — max 150 lines each
- **Format:** Markdown, tables, annotated code fences — no prose paragraphs
- **No source code pasted** — paths and function signatures only
- **Back-links:** every domain roadmap links to `../roadmap.md`
- **Relative paths** from repo root (top-level) or domain root (domain roadmaps)
- **Honour EXCLUSIONS** in all find commands

---

## Important Rules

- **Always run Phase 0 (interview) first** — never skip, even if the user seems impatient.
- **Never read entire files** — scan structure, spot-read only entry points and one representative file per domain.
- **Never paste source code** — paths and call signatures only.
- **Decide strategy autonomously** — file count → strategy, no user input needed.
- **Big domain threshold** — > 15 files OR ≥ 3 sub-dirs OR user-flagged → own roadmap.md.
- **One block per turn** in multi-pass mode, then pause for confirmation.
- **Save all files before reporting** to the user.
