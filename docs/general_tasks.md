  Epics 8–12 — Phase 2 Breakdown                                                                                                                                                                                   
                                                                                                                                                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                   
  ---
  EPIC 8 — Authentication & Authorization                                                                                                                                                                          
                                         
  ▎ Required before any multi-user features, billing, or API rate limiting.
                                                                                                                                                                                                                   
  Pages / Surfaces:
  - Login page — email/password + OAuth (Google, GitHub)                                                                                                                                                           
  - Registration page — email/password + OAuth                                                                                                                                                                     
  - Forgot password / reset flow              
  - Email verification page                                                                                                                                                                                        
  - User profile/settings page (basic)                                                                                                                                                                             
  - All existing pages — auth guard wrapper
                                                                                                                                                                                                                   
  ---             
  [DB] Users Table + Auth Schema Migration                                                                                                                                                                         
                                                                                                                                                                                                                   
  Description: Create users, sessions, password_resets, and email_verifications tables. Users table stores email, hashed password, OAuth provider IDs, email verification status, and profile info.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - users table: user_id (CHAR(26) ULID), email (UNIQUE), password_hash, display_name, avatar_url, google_id, github_id, email_verified_at, created_at, updated_at                                                 
  - sessions table: session_id, user_id, token_hash, expires_at, created_at                                                                                                                                        
  - password_resets table: id, user_id, token_hash, expires_at, used_at    
  - email_verifications table: id, user_id, token_hash, expires_at, verified_at                                                                                                                                    
  - Indexes on email, google_id, github_id, token_hash                                                                                                                                                             
  - Migration is reversible                                                                                                                                                                                        
                                                                                                                                                                                                                   
  Dependencies: None
  Effort: S                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---
  [BE] Email/Password Registration Endpoint                                                                                                                                                                        
                                           
  Description: Build POST /auth/register that creates a user with bcrypt-hashed password, generates an email verification token, and sends a verification email via a transactional email service
  (Resend/SendGrid/SES). Returns a session token.                                                                                                                                                                  
  
  Acceptance Criteria:                                                                                                                                                                                             
  - Accepts { email, password, displayName }
  - Validates email format, password minimum 8 chars                                                                                                                                                               
  - Returns 409 if email already registered         
  - Hashes password with bcrypt (cost factor 12)                                                                                                                                                                   
  - Creates user + session in one transaction                                                                                                                                                                      
  - Sends verification email with time-limited token (24h expiry)
  - Returns { userId, sessionToken, expiresAt }                                                                                                                                                                    
                                                                                                                                                                                                                   
  Dependencies: Users DB schema                                                                                                                                                                                    
  Effort: M ⚠️  Requires email service integration (Resend/SES)                                                                                                                                                     
                                                                                                                                                                                                                   
  ---
  [BE] Email/Password Login Endpoint                                                                                                                                                                               
                                    
  Description: Build POST /auth/login that verifies credentials, creates a session, and returns a session token. Rate-limited to 5 attempts per email per 15 minutes.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - Accepts { email, password }                                                                                                                                                                                    
  - Returns 401 on invalid credentials (same message for wrong email or password)                                                                                                                                  
  - Creates session with configurable TTL (default 30 days)                      
  - Rate-limited: 5 failures per email per 15 min → 429                                                                                                                                                            
  - Returns { userId, sessionToken, expiresAt }        
                                                                                                                                                                                                                   
  Dependencies: Users DB schema
  Effort: S                                                                                                                                                                                                        
                  
  ---                                                                                                                                                                                                              
  [BE] OAuth Login/Register (Google + GitHub)
                                             
  Description: Build GET /auth/google/callback and GET /auth/github/callback OAuth2 code exchange endpoints. On first login, create user automatically. On subsequent login, find existing user by provider ID. Use
   Passport.js or manual OAuth2 code exchange.                                                                                                                                                                     
  
  Acceptance Criteria:                                                                                                                                                                                             
  - GET /auth/google redirects to Google OAuth consent screen
  - GET /auth/google/callback exchanges code for profile, creates/finds user, creates session
  - Same flow for GitHub (GET /auth/github, GET /auth/github/callback)                       
  - If email from OAuth matches existing email/password user, links accounts                                                                                                                                       
  - OAuth users have email_verified_at set immediately (provider already verified)                                                                                                                                 
  - Returns session token via redirect to frontend with token in URL fragment                                                                                                                                      
                                                                                                                                                                                                                   
  Dependencies: Users DB schema                                                                                                                                                                                    
  Effort: M ⚠️  Requires Google Cloud Console + GitHub OAuth App setup                                                                                                                                              
                                                                                                                                                                                                                   
  ---             
  [BE] Password Reset + Email Verification Endpoints                                                                                                                                                               
                                                                                                                                                                                                                   
  Description: Build POST /auth/forgot-password, POST /auth/reset-password, and POST /auth/verify-email. Each uses a time-limited, single-use token.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - POST /auth/forgot-password accepts { email }, always returns 200 (no email enumeration)                                                                                                                        
  - Sends reset email with 1-hour token                                                                                                                                                                            
  - POST /auth/reset-password accepts { token, newPassword }, validates token, updates password hash
  - POST /auth/verify-email accepts { token }, sets email_verified_at                                                                                                                                              
  - All tokens are single-use (marked as used after consumption)                                                                                                                                                   
  - Expired/used tokens return 400                              
                                                                                                                                                                                                                   
  Dependencies: Registration endpoint                                                                                                                                                                              
  Effort: S                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [BE] Replace Dev Auth Bypass with Real Auth Middleware
                                                                                                                                                                                                                   
  Description: The current auth.middleware.ts has a NODE_ENV=development bypass that injects DEV_USER. Replace this with real session token validation. Read Authorization: Bearer <token> header, look up session,
   attach req.user. Keep the dev bypass behind a DEV_AUTH_BYPASS=true env var for local development.                                                                                                               
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Reads Authorization: Bearer <token> from request headers
  - Looks up session by token_hash, validates not expired   
  - Attaches req.user = { userId, email, displayName } to request
  - Returns 401 if no token, invalid token, or expired session                                                                                                                                                     
  - DEV_AUTH_BYPASS=true env var keeps the old dev-user behavior for local dev                                                                                                                                     
  - All existing endpoints protected by auth middleware work with real tokens                                                                                                                                      
  - acl.middleware.ts updated to check real req.user.userId against project ownership                                                                                                                              
                  
  Dependencies: Login endpoint                                                                                                                                                                                     
  Effort: M ⚠️  Must update all existing integration tests to use real or mock tokens
                                                                                                                                                                                                                   
  ---             
  [FE] Login Page                                                                                                                                                                                                  
                  
  Description: Build a /login route with email/password form + "Sign in with Google" / "Sign in with GitHub" buttons. On success, store session token in localStorage and redirect to editor.
                                                                                                                                                                                                                   
  Acceptance Criteria:                                                                                                                                                                                             
  - Email + password inputs with validation (email format, password required)                                                                                                                                      
  - "Sign in" button calls POST /auth/login, shows loading state                                                                                                                                                   
  - Error message on 401/429                                    
  - Google + GitHub OAuth buttons redirect to /auth/google and /auth/github                                                                                                                                        
  - "Forgot password?" link navigates to reset page                                                                                                                                                                
  - "Don't have an account? Sign up" link to register page                                                                                                                                                         
  - On success: stores token, redirects to /editor                                                                                                                                                                 
  - Dark theme, matches design system             
                                                                                                                                                                                                                   
  Dependencies: Login + OAuth endpoints                                                                                                                                                                            
  Effort: M                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [FE] Registration Page
                        
  Description: Build a /register route with email/password/display name form + OAuth buttons. Shows "Check your email" message after registration.
                                                                                                                                                                                                                   
  Acceptance Criteria:                                                                                                                                                                                             
  - Display name, email, password, confirm password inputs                                                                                                                                                         
  - Client-side validation: email format, password min 8 chars, passwords match                                                                                                                                    
  - "Create account" calls POST /auth/register                                 
  - Shows 409 error inline ("Email already registered")                                                                                                                                                            
  - Google + GitHub OAuth buttons                      
  - On success: stores token, shows "Verify your email" banner, redirects to editor                                                                                                                                
  - Dark theme, matches design system
                                                                                                                                                                                                                   
  Dependencies: Registration + OAuth endpoints
  Effort: M                                                                                                                                                                                                        
                  
  ---
  [FE] Forgot Password + Reset Password Pages
                                             
  Description: Build /forgot-password (email input → "Check your email") and /reset-password?token=xxx (new password input → "Password updated, sign in").
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - /forgot-password: email input + submit → always shows success (no email enumeration)                                                                                                                           
  - /reset-password: new password + confirm → calls POST /auth/reset-password                                                                                                                                      
  - Handles expired/invalid token with clear error                           
  - Links back to login page                                                                                                                                                                                       
                                                                                                                                                                                                                   
  Dependencies: Password reset endpoints                                                                                                                                                                           
  Effort: S                                                                                                                                                                                                        
                  
  ---
  [FE] Auth Guard + Token Management
                                                                                                                                                                                                                   
  Description: Create an AuthProvider context that wraps the app. Reads session token from localStorage, validates it, and redirects unauthenticated users to /login. Adds Authorization header to all API requests
   via the configured fetch wrapper in lib/api-client.ts.                                                                                                                                                          
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - AuthProvider wraps the app in main.tsx
  - Unauthenticated routes: /login, /register, /forgot-password, /reset-password
  - All other routes redirect to /login if no valid token                       
  - api-client.ts automatically attaches Authorization: Bearer <token> to all requests                                                                                                                             
  - On 401 response from any API call, clears token and redirects to /login                                                                                                                                        
  - Logout button in TopBar clears session and redirects                                                                                                                                                           
                                                                                                                                                                                                                   
  Dependencies: Login page, auth middleware BE                                                                                                                                                                     
  Effort: M                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  Summary — Epic 8
                                                                                                                                                                                                                   
  ┌─────────────────────────────────────┬──────┬────────┬─────────────────────────┐
  │               Ticket                │ Area │ Effort │       Depends On        │                                                                                                                                
  ├─────────────────────────────────────┼──────┼────────┼─────────────────────────┤                                                                                                                                
  │ Users + auth DB schema              │ DB   │ S      │ None                    │
  ├─────────────────────────────────────┼──────┼────────┼─────────────────────────┤                                                                                                                                
  │ Email/password registration         │ BE   │ M      │ DB schema               │
  ├─────────────────────────────────────┼──────┼────────┼─────────────────────────┤                                                                                                                                
  │ Email/password login                │ BE   │ S      │ DB schema               │
  ├─────────────────────────────────────┼──────┼────────┼─────────────────────────┤                                                                                                                                
  │ OAuth (Google + GitHub)             │ BE   │ M      │ DB schema               │
  ├─────────────────────────────────────┼──────┼────────┼─────────────────────────┤
  │ Password reset + email verification │ BE   │ S      │ Registration            │
  ├─────────────────────────────────────┼──────┼────────┼─────────────────────────┤
  │ Replace dev auth bypass             │ BE   │ M      │ Login                   │
  ├─────────────────────────────────────┼──────┼────────┼─────────────────────────┤                                                                                                                                
  │ Login page                          │ FE   │ M      │ Login + OAuth BE        │
  ├─────────────────────────────────────┼──────┼────────┼─────────────────────────┤                                                                                                                                
  │ Registration page                   │ FE   │ M      │ Registration + OAuth BE │
  ├─────────────────────────────────────┼──────┼────────┼─────────────────────────┤
  │ Forgot/reset password pages         │ FE   │ S      │ Password reset BE       │
  ├─────────────────────────────────────┼──────┼────────┼─────────────────────────┤                                                                                                                                
  │ Auth guard + token management       │ FE   │ M      │ Login page              │
  └─────────────────────────────────────┴──────┴────────┴─────────────────────────┘                                                                                                                                
                  
  Build order: DB → registration + login + OAuth (parallel) → replace auth bypass → FE pages (parallel). The auth guard is the final ticket — nothing works until it's wired.                                      
   
  ---                                                                                                                                                                                                              
  EPIC 9 — Unified AI Generation Layer (fal.ai)  ⚠️ REWORK OF ALREADY-IMPLEMENTED EPIC

  ▎ STATUS: The original Epic 9 ("External AI Platform Integration Layer") was fully implemented but the
  ▎ approach was rejected. This epic REWORKS the existing implementation. The next planner/executor
  ▎ skill MUST understand this is NOT a greenfield epic — code already exists and must be DELETED,
  ▎ MODIFIED, or REPLACED in place. Each ticket below is explicitly tagged [REWORK], [DELETE],
  ▎ [REPLACE], or [NEW] to make the change boundary unambiguous.
  ▎
  ▎ WHY WE ARE REWORKING:
  ▎ The original implementation forced clients to bring their own API keys for 8 different providers
  ▎ (OpenAI, Runway, Stability AI, ElevenLabs, Kling, Pika, Suno, Replicate) and to understand which
  ▎ provider does what. We want a true out-of-the-box product where the client never sees a
  ▎ "provider" concept and never manages keys. We will use **fal.ai** as the single integration hub
  ▎ (one server-side key, owned by us) and expose only the supported MODELS to the user. The fal.ai
  ▎ MCP server is available locally and MUST be used during planning to fetch each model's exact
  ▎ schema (endpoint, input fields, defaults, allowed values, output shape).
  ▎
  ▎ NEW PRODUCT GOALS:
  ▎ 1. Hide AI provider selection from the user entirely. The word "provider" disappears from the UX.
  ▎ 2. Use fal.ai as the unified backend for ALL listed models. Single server-side `APP_FAL_KEY`.
  ▎ 3. Expose every configuration option fal.ai documents for each supported model, dynamically.
  ▎ 4. Reuse the existing job-tracking, asset-creation, and BullMQ plumbing — only the provider/key
  ▎    layer and the per-provider adapters get torn out.
  ▎
  ▎ SUPPORTED MODELS (use fal.ai MCP `get_model_schema` for each before writing FE forms):
  ▎ • Image-to-video: `ltx-2-19b/image-to-video`, `kling-video/o3/standard/image-to-video`,
  ▎   `pixverse/v6/image-to-video`, `wan/v2.2-a14b/image-to-video`
  ▎ • Text-to-video: `kling-video/v2.5-turbo/pro/text-to-video`
  ▎ • Image edit / blend: `nano-banana-2/edit`, `gpt-image-1.5/edit`
  ▎ • Text-to-image: `nano-banana-2`, `gpt-image-1.5`
  ▎
  ▎ EXISTING CODE INVENTORY (everything in this list is already merged on master):
  ▎ • DB migrations: `apps/api/src/db/migrations/009_ai_provider_configs.sql`,
  ▎   `010_ai_generation_jobs.sql`, `012_add_result_url_to_ai_jobs.sql`
  ▎ • API: `apps/api/src/services/aiProvider.service.ts`, `aiGeneration.service.ts`;
  ▎   `apps/api/src/repositories/aiProvider.repository.ts`, `aiGenerationJob.repository.ts`;
  ▎   `apps/api/src/controllers/aiProviders.controller.ts`, `aiGeneration.controller.ts`;
  ▎   `apps/api/src/routes/aiProviders.routes.ts`, `aiGeneration.routes.ts`;
  ▎   `apps/api/src/lib/encryption.ts`; `apps/api/src/queues/jobs/enqueue-ai-generate.ts`
  ▎ • Worker: `apps/media-worker/src/jobs/ai-generate.job.ts`;
  ▎   `apps/media-worker/src/providers/{openai,stability,replicate}-image.adapter.ts`,
  ▎   `{runway,kling,pika}-video.adapter.ts`, `{elevenlabs,suno}-audio.adapter.ts`,
  ▎   `apps/media-worker/src/providers/types.ts`
  ▎ • Frontend: `apps/web-editor/src/features/ai-providers/**` (entire feature),
  ▎   `apps/web-editor/src/features/ai-generation/**` (entire feature, retain shell)
  ▎ • Env: `APP_AI_ENCRYPTION_KEY` in `.env.example`
  ▎
  ▎ WHAT SURVIVES, WHAT DIES:
  ▎ • SURVIVES (modify in place): `ai_generation_jobs` table (add columns), `aiGeneration.service.ts`
  ▎   (rewrite resolver), `aiGeneration.controller.ts` + routes, `enqueue-ai-generate.ts`,
  ▎   `ai-generate.job.ts` (route to single fal adapter), the asset-creation flow on success,
  ▎   the ai-generation FE feature shell (panel mounting + tab plumbing).
  ▎ • DIES (delete completely): `ai_provider_configs` table, `aiProvider.service.ts`,
  ▎   `aiProvider.repository.ts`, `aiProviders.controller.ts`, `aiProviders.routes.ts`,
  ▎   `lib/encryption.ts`, all 8 per-provider adapter files + their tests, `providers/types.ts`,
  ▎   `features/ai-providers/**`, `APP_AI_ENCRYPTION_KEY` env var.

  Pages / Surfaces (after rework):
  - AI Generation panel in editor sidebar — model picker grouped by capability (Image, Image→Video,
    Text→Video, Image Edit/Blend), with a dynamic options form per model. NO provider settings page.
   
  ---                                                                                                                                                                                                              
  [DB] [REWORK] Replace ai_provider_configs and Reshape ai_generation_jobs for fal.ai

  Description: Remove the now-obsolete provider-config table and reshape the job table so it stores
  the fal.ai model identifier and a freeform JSON options blob instead of a fixed provider/type ENUM.
  This is a destructive migration on a still-pre-launch dev DB — drop old data, do not try to
  preserve rows.

  EXISTING FILES TO MODIFY/DELETE:
  - DELETE behavior of: `apps/api/src/db/migrations/009_ai_provider_configs.sql` (write a new DOWN
    migration `013_drop_ai_provider_configs.sql`)
  - REPLACE schema from: `010_ai_generation_jobs.sql` and `012_add_result_url_to_ai_jobs.sql` via a
    new migration `014_ai_jobs_fal_reshape.sql`
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - New migration `013_drop_ai_provider_configs.sql`: `DROP TABLE IF EXISTS ai_provider_configs;`
  - New migration `014_ai_jobs_fal_reshape.sql` modifies `ai_generation_jobs`:
    • DROP COLUMN `provider` (the ENUM)
    • ADD COLUMN `model_id VARCHAR(128) NOT NULL` — e.g. `fal-ai/ltx-2-19b/image-to-video`
    • ADD COLUMN `capability ENUM('text_to_image','image_edit','text_to_video','image_to_video')
      NOT NULL` — used for grouping/filtering, derived at submit time
    • Keep the existing `options JSON NULL` column — it will now hold the full per-model fal.ai
      input payload verbatim (first_frame_image_url, last_frame_image_url, audio_enabled,
      reference_images, etc.)
    • Keep `prompt`, `status`, `progress`, `result_url`, `result_asset_id`, `error_message` as-is
    • Remove the `text` value from the existing `type` ENUM if it still exists, or drop the `type`
      column entirely in favor of `capability`
  - Migration drops the obsolete ENUM constraints cleanly (recreate the table inside a transaction
    if MySQL refuses an ALTER on the ENUM)
  - Down section in each new migration documented as a comment
  - All existing dev rows in `ai_generation_jobs` may be deleted (`TRUNCATE`) — pre-launch dev only
  - Seed migration `011_seed_dev_user.sql` does NOT need to seed any provider configs — confirm it
    doesn't, and remove the rows if it does

  Dependencies: None (runs against existing schema)
  Effort: S

  ---
  [BE] [DELETE] Tear Out Per-Provider Key Storage Layer

  Description: Delete the entire user-provided-API-key infrastructure now that fal.ai is the only
  integration. This is a pure deletion ticket — no replacement code goes here. After this ticket the
  product no longer has any concept of "AI provider configs". The single fal.ai key lives in env.

  EXISTING FILES TO DELETE:
  - `apps/api/src/services/aiProvider.service.ts` (+ `.test.ts`)
  - `apps/api/src/repositories/aiProvider.repository.ts`
  - `apps/api/src/controllers/aiProviders.controller.ts`
  - `apps/api/src/routes/aiProviders.routes.ts`
  - `apps/api/src/lib/encryption.ts` (+ `.test.ts`) — no longer needed; nothing else uses it
  - `apps/api/src/__tests__/integration/ai-providers-endpoints.test.ts`

  EXISTING FILES TO MODIFY:
  - `apps/api/src/index.ts` — remove `aiProvidersRouter` import + `app.use(aiProvidersRouter)`
  - `apps/api/src/config.ts` — remove `APP_AI_ENCRYPTION_KEY` from the Zod schema and exported
    config object
  - `.env.example` — delete the `APP_AI_ENCRYPTION_KEY` block (the entire "AI Encryption" section)
  - `docker-compose.yml` — remove `APP_AI_ENCRYPTION_KEY` from any service env blocks
  - Remove any imports of the deleted modules from anywhere in `apps/api/src/`

  Acceptance Criteria:
  - All listed files no longer exist on disk
  - `grep -r "ai_provider_configs\|aiProvider\|AI_ENCRYPTION_KEY" apps/api/src` returns nothing
  - `grep -r "encryption" apps/api/src/lib` returns nothing
  - `pnpm --filter @cliptale/api typecheck` passes
  - `pnpm --filter @cliptale/api test` passes (with the now-deleted tests gone, not stubbed)
  - `/user/ai-providers` endpoints return 404 (route gone)

  Dependencies: DB rework ticket above
  Effort: S
                                                                                                                                                                                                                   
  ---
  [INFRA] [NEW] Add APP_FAL_KEY Config + fal.ai HTTP Client Wrapper

  Description: Introduce a single server-side fal.ai API key (`APP_FAL_KEY`) and a thin HTTP client
  wrapper that the worker will use to submit jobs and poll for results. The client lives in the
  media-worker since that's where all generation work happens. No public-facing surface — this is
  pure plumbing.

  EXISTING FILES TO MODIFY:
  - `.env.example` — add `APP_FAL_KEY=` under a new "fal.ai" section
  - `docker-compose.yml` — pass `APP_FAL_KEY` to the `media-worker` and `api` services
  - `apps/media-worker/src/config.ts` — add `APP_FAL_KEY` to the Zod schema (required string)
  - `apps/api/src/config.ts` — add `APP_FAL_KEY` (required) — the API needs it to know fal is
    configured for `/ai/models` endpoint health checks; do NOT expose it to the client

  NEW FILES:
  - `apps/media-worker/src/lib/fal-client.ts` — minimal wrapper around fal.ai's REST API:
    `submitFalJob({ modelId, input }) -> { request_id }`,
    `getFalJobStatus(requestId, modelId) -> { status, output? }`,
    `pollFalJob(requestId, modelId, { timeoutMs, intervalMs }) -> output`.
    Use `node:fetch`. No SDK dependency. Read key from injected config, never from process.env
    directly.
  - `apps/media-worker/src/lib/fal-client.test.ts` — unit tests with mocked fetch covering
    submit, polling success, polling timeout, and error response handling

  Acceptance Criteria:
  - `APP_FAL_KEY` resolved through `apps/media-worker/src/config.ts` only — no other file reads
    `process.env.APP_FAL_KEY`
  - Wrapper sends `Authorization: Key <APP_FAL_KEY>` header on every request
  - Polling has a configurable timeout (default 10 min) and interval (default 3 s)
  - On non-2xx fal.ai responses, throws an error containing the fal request_id and the upstream
    error body
  - Unit tests cover happy path, timeout, and upstream error
  - No fal.ai SDK added to package.json — use raw fetch

  Dependencies: None
  Effort: S

  ---
  [BE] [NEW] fal.ai Model Catalog Module

  Description: Define the catalog of supported fal.ai models in code so the API can advertise them
  to the frontend and validate `model_id` on submit. The catalog also includes the JSON-schema-style
  description of each model's input fields, which the FE uses to render the dynamic options form.
  ⚠️ The schemas MUST be sourced from fal.ai itself via the fal.ai MCP server (`get_model_schema`)
  during planning — do NOT invent fields. The agent implementing this ticket should call the
  `mcp__fal-ai__get_model_schema` tool for every model below and copy the input shape verbatim.

  NEW FILES:
  - `packages/api-contracts/src/fal-models.ts` — exports `FAL_MODELS`, a typed const array. Each
    entry: `{ id, capability, label, description, inputSchema }`. `id` is the literal fal model
    slug (e.g. `fal-ai/ltx-2-19b/image-to-video`). `capability` is one of
    `text_to_image | image_edit | text_to_video | image_to_video`. `inputSchema` is a small
    JSON-schema-ish object: `{ fields: [{ name, type, label, required, default?, enum?, min?,
    max?, description? }] }`. Field types: `string | text | number | boolean | enum | image_url |
    image_url_list`.
  - `packages/api-contracts/src/fal-models.test.ts` — asserts every model has a non-empty schema,
    every required field has a label, every enum field lists allowed values

  MODELS TO REGISTER (use fal.ai MCP for exact schemas — these are the user-confirmed list):
  - Image-to-video:
    `fal-ai/ltx-2-19b/image-to-video`,
    `fal-ai/kling-video/o3/standard/image-to-video`,
    `fal-ai/pixverse/v6/image-to-video`,
    `fal-ai/wan/v2.2-a14b/image-to-video`
    (must expose every fal-supported control: first/last frame image, audio enabled, duration,
    seed, etc.)
  - Text-to-video: `fal-ai/kling-video/v2.5-turbo/pro/text-to-video`
  - Image edit / blend: `fal-ai/nano-banana-2/edit`, `fal-ai/gpt-image-1.5/edit`
    (must support multi-image inputs / blending, all fal controls)
  - Text-to-image: `fal-ai/nano-banana-2`, `fal-ai/gpt-image-1.5`

  Acceptance Criteria:
  - The package exports `FAL_MODELS` and a type `FalModel`
  - Every listed model is present with its real input schema (verified against fal.ai MCP)
  - Tests pass; types compile; no runtime use of the catalog requires network access
  - The schema for `image_url` / `image_url_list` fields makes it clear the FE will pass HTTPS URLs
    (we will upload to our own S3 first then pass the public URL)

  Dependencies: None (but planner MUST query fal.ai MCP before writing this ticket's schemas)
  Effort: M ⚠️ The size depends on how many fields each model exposes; do NOT shortcut by
  hardcoding only "prompt"

  ---
  [BE] [REWORK] Reshape aiGeneration Service + Controller for Model-Based Submission

  Description: Rewrite the existing generation service so it no longer resolves a per-user
  provider. Instead, it accepts a `modelId` from the catalog plus an `options` blob, validates the
  options against the model's schema, and enqueues a fal-only job. Also rewrites the controller's
  Zod request schema and adds a new endpoint to list available models.

  EXISTING FILES TO MODIFY:
  - `apps/api/src/services/aiGeneration.service.ts` — DELETE `TYPE_PROVIDER_MAP`, DELETE
    `resolveProvider`, DELETE the `provider` parameter, DELETE the `aiProviderService.getDecryptedKey`
    call. New shape: `submitGeneration(userId, projectId, { modelId, prompt?, options })`. Look up
    the model in `FAL_MODELS`, infer `capability` from it, validate `options` against the model's
    inputSchema (reject unknown keys, enforce required fields), then enqueue.
  - `apps/api/src/services/aiGeneration.service.test.ts` — rewrite tests for the new shape; remove
    all provider-resolution test cases
  - `apps/api/src/controllers/aiGeneration.controller.ts` — rewrite `submitGenerationSchema` Zod
    schema: `{ modelId: z.string(), prompt: z.string().optional(), options: z.record(z.unknown())
    .default({}) }`. Add a new handler `listModels` returning the catalog (id, capability, label,
    description, inputSchema) — no key information.
  - `apps/api/src/routes/aiGeneration.routes.ts` — add `GET /ai/models` route returning the catalog
    (auth-required). Keep existing `POST /projects/:id/ai/generate` and `GET /ai/jobs/:jobId`.
  - `apps/api/src/repositories/aiGenerationJob.repository.ts` — update `createJob` to take
    `modelId` + `capability` instead of `provider` + `type`; update SELECT shapes accordingly.
    Remove `AiGenerationType` export.
  - `apps/api/src/queues/jobs/enqueue-ai-generate.ts` — payload shape changes to
    `{ jobId, userId, projectId, modelId, capability, prompt?, options }`. Remove `apiKey` and
    `provider` fields.
  - `apps/api/src/__tests__/integration/ai-providers-endpoints.test.ts` — DELETE (provider
    endpoints are gone). If there's an integration test for `ai-generation`, update it to test the
    new shape; otherwise add a small one covering submit + list-models.

  Acceptance Criteria:
  - `POST /projects/:id/ai/generate` body: `{ modelId, prompt?, options }`
  - 400 when `modelId` is not in the catalog
  - 400 when `options` contains unknown keys or violates inputSchema (missing required, wrong type,
    enum mismatch)
  - 202 with `{ jobId, status: 'queued' }` on success — same response shape as before
  - `GET /ai/models` returns the catalog grouped by capability
  - `GET /ai/jobs/:jobId` response shape unchanged (still returns status, progress, result_url)
  - Service no longer imports anything from `aiProvider.*` (those files are deleted by the previous
    ticket)
  - All `aiGeneration.service.test.ts` tests pass under the new shape
  - Typecheck + lint clean for the api package

  Dependencies: DB rework, fal-models catalog, key teardown ticket
  Effort: M

  ---
  [BE] [NEW] Asset Upload Helper for fal.ai Image Inputs

  Description: Several supported models take image URLs as input (first frame, last frame, blend
  references). The user supplies these from the editor's existing asset browser, where assets are
  already uploaded to our S3 bucket. We need a small helper that resolves an internal `assetId`
  to a public/presigned HTTPS URL that fal.ai can fetch from. No new upload UI — reuse existing
  asset upload flow.

  NEW/MODIFIED FILES:
  - `apps/api/src/services/aiGeneration.service.ts` — before enqueueing, walk the `options` object
    looking for any field whose schema type is `image_url` or `image_url_list`. If the value is an
    internal asset ID (UUID matching a row in `project_assets_current`), replace it with a
    short-lived presigned GET URL (e.g. 1 hour TTL). If the value already looks like an https URL,
    pass it through.
  - Reuse existing s3 client / presigner helper from `apps/api/src/lib/s3.ts` — do NOT create a
    new one
  - Add a unit test in `aiGeneration.service.test.ts` covering: asset ID → presigned URL,
    https URL → passthrough, image_url_list of mixed values, asset not owned by user → 403

  Acceptance Criteria:
  - Asset ownership is enforced — a user cannot reference another user's asset
  - Generated presigned URL uses GET, expires in ≤ 1 hour
  - Walks the options tree using the inputSchema field types — does NOT rely on field name
    matching
  - Image URL fields with non-existent asset IDs return 404 with a clear message
  - Tests cover all three input shapes

  Dependencies: aiGeneration service rework, fal-models catalog
  Effort: S

  ---
  [BE] [REPLACE] Single fal.ai Worker Adapter — Delete All 8 Provider Adapters

  Description: Replace the per-provider adapter zoo with a single fal.ai job handler. The handler
  receives the modelId, calls the fal client wrapper, polls for completion, downloads the result
  artifact to our S3, creates an asset row, and updates the job. Capability determines how to
  interpret the fal output (image vs video) and what content-type/extension to write.

  EXISTING FILES TO DELETE:
  - `apps/media-worker/src/providers/openai-image.adapter.ts` (+ test)
  - `apps/media-worker/src/providers/stability-image.adapter.ts` (+ test)
  - `apps/media-worker/src/providers/replicate-image.adapter.ts` (+ test)
  - `apps/media-worker/src/providers/runway-video.adapter.ts` (+ test)
  - `apps/media-worker/src/providers/kling-video.adapter.ts` (+ test)
  - `apps/media-worker/src/providers/pika-video.adapter.ts` (+ test)
  - `apps/media-worker/src/providers/elevenlabs-audio.adapter.ts` (+ test)
  - `apps/media-worker/src/providers/suno-audio.adapter.ts` (+ test)
  - `apps/media-worker/src/providers/types.ts` (its types are obsolete)

  EXISTING FILES TO MODIFY:
  - `apps/media-worker/src/jobs/ai-generate.job.ts` — DELETE `runAdapter`, `loadImageAdapter`,
    `loadVideoAdapter`, `loadAudioAdapter`. New flow:
      1. Pull `{ modelId, capability, prompt, options }` from job.data
      2. Build the fal input by merging `{ prompt }` (if model accepts it) into `options`
      3. `submitFalJob` → `pollFalJob` (use the new client wrapper)
      4. Read the result URL from fal output (per-capability shape: image url for image/edit
         models, video url for video models)
      5. Download the artifact to our S3 under `ai-generations/<projectId>/<uuid>.<ext>`
      6. Insert into `project_assets_current` (existing logic)
      7. Update `ai_generation_jobs` (status, progress, result_url, result_asset_id)
    Pass `falClient` and `falKey` via the `deps` object — don't read env in the handler.
  - `apps/media-worker/src/jobs/ai-generate.job.test.ts` — rewrite for the new flow with a mocked
    fal client
  - `apps/media-worker/src/index.ts` — wire the fal client into the job deps; remove any old
    provider env wiring

  Acceptance Criteria:
  - `apps/media-worker/src/providers/` directory no longer exists (or is empty)
  - The handler routes purely on `capability`, never on a provider name
  - Image/edit results saved as `image/png` or `image/jpeg` based on URL extension; video saved as
    `video/mp4`
  - Progress is updated at least at submit-success and at completion
  - Failures from fal.ai (timeout, upstream error) result in job status `failed` with the upstream
    message in `error_message`
  - Existing asset-row creation logic in `processAiGenerateJob` is preserved unchanged
  - All `ai-generate.job.test.ts` tests pass

  Dependencies: fal client wrapper, aiGeneration service rework
  Effort: M

  ---
  [FE] [DELETE] Remove ai-providers Feature Entirely

  Description: The "AI Providers" settings UI has no place in the new model. Tear it out.

  EXISTING FILES TO DELETE:
  - Entire directory `apps/web-editor/src/features/ai-providers/` — `api.ts`, `api.test.ts`,
    `types.ts`, `types.test.ts`, `hooks/`, `components/AiProvidersModal.tsx`,
    `components/ProviderCard.tsx`, `components/aiProvidersModalStyles.ts`

  EXISTING FILES TO MODIFY:
  - Anywhere `AiProvidersModal` is mounted (likely `App.tsx` or `TopBar.tsx`) — remove the import
    and the modal trigger button/menu item
  - Remove any references to "AI Providers" from settings menus, top bar, sidebars
  - Update any FE tests that reference the deleted modal

  Acceptance Criteria:
  - `grep -r "ai-providers\|AiProvidersModal\|AiProvider" apps/web-editor/src` returns nothing
    (case-insensitive on the modal names)
  - Web-editor typecheck + tests pass
  - No "AI Providers" entry visible in the running app's settings menu

  Dependencies: None (purely deletion)
  Effort: XS

  ---
  [FE] [REWORK] Rebuild AI Generation Panel Around Models, Not Types

  Description: Replace the existing Image/Video/Audio type selector with a model-first picker
  driven by `GET /ai/models`. The user picks a capability tab (Text→Image, Image Edit, Text→Video,
  Image→Video), sees the cards of available models in that capability, picks one, and is shown a
  dynamic form rendered from that model's `inputSchema`. Submitting calls the existing
  `POST /projects/:id/ai/generate` with `{ modelId, prompt, options }`. Result polling and asset
  insertion already work — only the panel UX changes.

  EXISTING FILES TO MODIFY (the ai-generation feature shell stays — its insides are rewritten):
  - `apps/web-editor/src/features/ai-generation/api.ts` — replace `submitGeneration` body shape to
    `{ modelId, prompt, options }`. Add `listModels()` calling `GET /ai/models`.
  - `apps/web-editor/src/features/ai-generation/api.test.ts` — update for new shape
  - `apps/web-editor/src/features/ai-generation/types.ts` — replace the old `GenerationType` /
    provider types with `FalModel`, `FalCapability`, `FalFieldSchema`, `GenerationOptions`. Mirror
    the contract from `packages/api-contracts/src/fal-models.ts`.
  - `apps/web-editor/src/features/ai-generation/components/GenerationTypeSelector.tsx` →
    RENAME conceptually to `CapabilityTabs.tsx`. Tabs: "Text → Image", "Edit / Blend Image",
    "Text → Video", "Image → Video".
  - `apps/web-editor/src/features/ai-generation/components/GenerationOptionsForm.tsx` → REWRITE as
    a generic schema-driven form. Renders one input per `inputSchema.fields[i]` based on `type`:
      • `string` → single-line text input
      • `text` → textarea (also used for `prompt` if the field is named "prompt")
      • `number` → numeric input with min/max
      • `boolean` → toggle/switch
      • `enum` → select dropdown
      • `image_url` → asset picker (opens existing asset browser, returns the asset id —
        the BE will resolve it to a presigned URL)
      • `image_url_list` → multi-asset picker (for blend models)
    Show field labels and descriptions from the schema. Mark required fields. Pre-fill defaults.
  - `apps/web-editor/src/features/ai-generation/components/AiGenerationPanel.tsx` — orchestrate:
    fetch models on mount, render capability tabs, render model cards inside the active tab,
    render the dynamic form for the selected model, submit and show progress. Reuse existing
    `GenerationProgress.tsx` (it already polls `/ai/jobs/:jobId`).
  - `apps/web-editor/src/features/ai-generation/components/AiGenerationPanel.test.tsx` and the
    other component tests — rewrite around the new flow
  - `apps/web-editor/src/features/ai-generation/components/aiGenerationPanelStyles.ts` — update
    selectors/styles for the new layout if needed
  - `apps/web-editor/src/features/ai-generation/components/LeftSidebarTabs.tsx` — keep the AI tab
    in place; only label/icon updates if needed
  - REMOVE the "no provider configured → link to settings" empty state — there is no such error
    anymore. fal.ai is always available (or the whole feature is hidden via a feature flag if
    `APP_FAL_KEY` is missing — handled at app boot via a `/ai/models` 503).

  NEW FILES:
  - `apps/web-editor/src/features/ai-generation/components/ModelCard.tsx` — small card showing
    model label + description; click to select
  - `apps/web-editor/src/features/ai-generation/components/SchemaFieldInput.tsx` — the renderer
    for one schema field (see types above). One file, branching by type.
  - `apps/web-editor/src/features/ai-generation/components/AssetPickerField.tsx` — wraps the
    existing asset browser to let the user pick one (or many) image assets and returns the
    asset ID. Reuse `features/asset-manager` components — do not duplicate.
  - Tests for each new component

  Acceptance Criteria:
  - Capability tabs match the four supported capabilities (no "Audio" anywhere — audio is dropped
    from this rework, the user did not list audio models)
  - Model cards inside each tab match the catalog returned by `/ai/models`
  - Selecting a model renders a form with EVERY field from `inputSchema` — required fields are
    marked, defaults are pre-filled, descriptions visible on hover/help-text
  - Image fields open the asset browser; selecting an asset stores its asset ID in form state
  - Submit posts `{ modelId, prompt?, options }` and transitions to the progress view
  - On completion the result asset appears in the asset browser (existing behavior)
  - On failure the error message from the BE is shown with a Retry button
  - Dark theme, matches existing editor design system (use `docs/design-guide.md` tokens)
  - Web-editor tests pass; no references to "provider" in the feature directory

  Dependencies: aiGeneration service rework, fal-models catalog, asset upload helper
  Effort: L ⚠️ The dynamic form is the meat of this ticket. Plan field types up front; do not
  add hardcoded model-specific UI branches.

  ---
  [INT] [NEW] End-to-End Smoke Test — One Model Per Capability

  Description: Add a smoke test that exercises the full flow against fal.ai's real API for one
  representative model per capability, gated behind an env flag so CI doesn't burn quota. Catches
  schema drift between our catalog and fal.ai's real input shape.

  NEW FILES:
  - `apps/api/src/__tests__/smoke/fal-generation.smoke.test.ts` — vitest, skipped unless
    `APP_FAL_SMOKE=1` is set. For each of: `nano-banana-2` (text→image),
    `nano-banana-2/edit` (edit), `kling-video/v2.5-turbo/pro/text-to-video` (text→video),
    `pixverse/v6/image-to-video` (image→video) — submit a tiny request, poll for completion,
    assert the result URL is a valid https URL pointing at a fal CDN

  Acceptance Criteria:
  - File exists, tests are clearly skipped without the env flag (no accidental quota burn)
  - When run with `APP_FAL_SMOKE=1` and a real `APP_FAL_KEY`, all four pass against the live API
  - README note added in the smoke directory explaining how to run

  Dependencies: All other rework tickets
  Effort: S ⚠️ Marked optional for first ship — but strongly recommended to prove the catalog
  schemas match fal.ai before users hit them

  ---             
  Summary — Epic 9 (Rework)
                                                                                                                                                                                                                   
  ┌──────────────────────────────────────────────────┬───────┬────────┬──────────────────────────────┐
  │                     Ticket                       │ Area  │ Effort │          Depends On          │
  ├──────────────────────────────────────────────────┼───────┼────────┼──────────────────────────────┤
  │ [REWORK] DB: drop ai_provider_configs, reshape   │ DB    │ S      │ None                         │
  │          ai_generation_jobs                      │       │        │                              │
  ├──────────────────────────────────────────────────┼───────┼────────┼──────────────────────────────┤
  │ [DELETE] Tear out per-provider key storage       │ BE    │ S      │ DB rework                    │
  ├──────────────────────────────────────────────────┼───────┼────────┼──────────────────────────────┤
  │ [NEW] APP_FAL_KEY config + fal-client wrapper    │ INFRA │ S      │ None                         │
  ├──────────────────────────────────────────────────┼───────┼────────┼──────────────────────────────┤
  │ [NEW] fal.ai model catalog (api-contracts)       │ BE    │ M      │ fal.ai MCP for schemas       │
  ├──────────────────────────────────────────────────┼───────┼────────┼──────────────────────────────┤
  │ [REWORK] aiGeneration service + controller       │ BE    │ M      │ DB rework, catalog, key      │
  │          (model-based submission)                │       │        │ teardown                     │
  ├──────────────────────────────────────────────────┼───────┼────────┼──────────────────────────────┤
  │ [NEW] Asset → presigned URL helper for fal       │ BE    │ S      │ aiGeneration rework, catalog │
  │       image inputs                               │       │        │                              │
  ├──────────────────────────────────────────────────┼───────┼────────┼──────────────────────────────┤
  │ [REPLACE] Single fal.ai worker adapter; delete   │ BE    │ M      │ fal-client, aiGen rework     │
  │           all 8 per-provider adapters            │       │        │                              │
  ├──────────────────────────────────────────────────┼───────┼────────┼──────────────────────────────┤
  │ [DELETE] Remove ai-providers FE feature          │ FE    │ XS     │ None                         │
  ├──────────────────────────────────────────────────┼───────┼────────┼──────────────────────────────┤
  │ [REWORK] AI generation panel — model picker +    │ FE    │ L      │ aiGen rework, catalog,       │
  │          dynamic options form                    │       │        │ asset helper                 │
  ├──────────────────────────────────────────────────┼───────┼────────┼──────────────────────────────┤
  │ [NEW] Smoke test: one model per capability       │ INT   │ S      │ All other tickets            │
  └──────────────────────────────────────────────────┴───────┴────────┴──────────────────────────────┘

  📋 Backlog (recommended sequence):
   1. DB rework
   2. Tear out per-provider key storage  ─┐  parallelizable with #3 and #4
   3. APP_FAL_KEY + fal-client wrapper    │
   4. fal.ai model catalog                ─┘
   5. aiGeneration service + controller rework  (depends on 1, 2, 4)
   6. Asset → presigned URL helper               (depends on 5)
   7. Single fal.ai worker adapter               (depends on 3, 5)
   8. Remove ai-providers FE feature             (parallelizable with 1–7)
   9. AI generation panel rework                 (depends on 5, 6 — can mock /ai/models earlier)
  10. Smoke test                                 (last)

  🔵 Backend First (unblocks frontend):
  - DB rework, fal.ai model catalog, aiGeneration service rework. Once `/ai/models` returns the
    catalog, the FE rework can start in parallel with the worker adapter.

  🟢 Can Be Parallelised:
  - Tickets [DELETE] Tear out per-provider key storage and [DELETE] Remove ai-providers FE feature
    can run anytime — they only delete code.
  - fal-client wrapper and fal-models catalog can be built simultaneously.
  - FE panel rework can start against a mocked `/ai/models` response as soon as the catalog
    structure is agreed.

  Build order rationale: Start with the destructive cleanup (DB + key teardown) so the codebase
  has only one source of truth before new code lands. Build the catalog next — it's the contract
  shared by BE, worker, and FE. The aiGeneration service rework is the critical path for both the
  worker adapter and the FE panel; once it's done, those two can land in parallel. Smoke test
  comes last and gates the rollout. Largest risk is the dynamic schema-driven form on the FE —
  plan field types ahead of time and resist hardcoding model-specific branches. Second-largest
  risk is fal.ai schema drift between what the MCP reports today and what the live API accepts at
  ship time — the smoke test exists to catch this.

  ⚠️ Note for the next planner / executor skill:
  This is a REWORK epic. Every ticket above is tagged [REWORK] / [DELETE] / [REPLACE] / [NEW].
  Before writing code for any ticket, the executor MUST:
  1. Read the "EXISTING FILES TO MODIFY/DELETE" list in the ticket and grep the codebase to
     confirm those files still exist and still match the assumptions.
  2. Use the fal.ai MCP server (`mcp__fal-ai__get_model_schema`, `mcp__fal-ai__search_models`,
     `mcp__fal-ai__get_pricing`) to verify model schemas before writing the catalog or the FE form.
  3. NEVER reintroduce the words "provider", "API key", "encryption", or "BYOK" into the AI
     generation surface — those concepts are intentionally gone.
  4. Audio generation is INTENTIONALLY out of scope for this rework. The user did not list any
     audio models. Do not add audio back in "for completeness".
                                                                                                                                                                                                                   
  ---             
  EPIC 10 — Text-to-Video Pipeline
                                  
  ▎ End-to-end: user types a prompt → system generates a complete video with audio, captions, and transitions.
                                                                                                                                                                                                                   
  Pages / Surfaces:
  - Text-to-Video wizard modal — multi-step prompt → configure → generate                                                                                                                                          
  - Generation progress page — shows each step completing                                                                                                                                                          
   
  ---                                                                                                                                                                                                              
  [BE] Text-to-Video Orchestrator Service
                                                                                                                                                                                                                   
  Description: Build a high-level orchestrator in apps/api/src/services/text-to-video.service.ts that takes a text prompt and generates a full video project. Steps: (1) Use OpenAI/Claude to generate a
  script/storyboard (scene descriptions, narration text, caption text), (2) Generate video clips per scene via video provider, (3) Generate narration audio via TTS, (4) Generate background music, (5) Assemble   
  all assets into a ProjectDoc with tracks, clips, and captions. Each step is a BullMQ job in a chain.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - POST /projects/:id/text-to-video accepts { prompt, duration, format, style }
  - Step 1: LLM generates structured storyboard JSON { scenes: [{ description, narration, duration }] }
  - Step 2: Video generation jobs enqueued per scene (parallel)                                        
  - Step 3: TTS job generates narration audio per scene                                                                                                                                                            
  - Step 4: Background music generation job (single track, full duration)                                                                                                                                          
  - Step 5: Assembly job creates ProjectDoc with all assets placed on timeline                                                                                                                                     
  - Returns { jobId } — status endpoint shows current step + overall progress                                                                                                                                      
  - Timeout: 15 minutes total; individual steps timeout at 5 minutes                                                                                                                                               
                                                                                                                                                                                                                   
  Dependencies: AI generation adapters (Epic 9), Whisper captions (Epic 3)                                                                                                                                         
  Effort: L ⚠️  Multi-step orchestration with failure recovery is complex; consider Temporal for durable workflows                                                                                                  
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [BE] LLM Script/Storyboard Generator                                                                                                                                                                             
                                                                                                                                                                                                                   
  Description: Build a service that takes a user's text prompt and generates a structured storyboard using an LLM (OpenAI GPT-4 or Claude). The storyboard defines scenes with visual descriptions, narration text,
   suggested duration, and transition hints.                                                                                                                                                                       
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Calls LLM with a system prompt that produces structured JSON output
  - Output schema: { title, scenes: [{ sceneNumber, visualDescription, narrationText, durationSeconds, transitionHint }], totalDurationSeconds }                                                                   
  - Validates LLM output against Zod schema (retry once on parse failure)                                                                       
  - Respects user-specified total duration (distributes across scenes)                                                                                                                                             
  - Supports style hints: "cinematic", "corporate", "social media", "educational"                                                                                                                                  
                                                                                                                                                                                                                   
  Dependencies: None (uses OpenAI/Anthropic API directly)                                                                                                                                                          
  Effort: M                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [BE] Auto-Caption Generation for Text-to-Video                                                                                                                                                                   
                                                
  Description: After narration audio is generated, automatically run Whisper transcription to produce word-level captions. Place captions on a dedicated overlay track in the assembled ProjectDoc.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - Whisper transcription runs automatically on generated narration audio                                                                                                                                          
  - Captions added as text-overlay clips on a dedicated "Captions" track                                                                                                                                           
  - Caption timing matches narration audio (word-level alignment)       
  - Caption style defaults: white text, black outline, bottom-center position                                                                                                                                      
                                                                                                                                                                                                                   
  Dependencies: Whisper transcription (Epic 3), TTS audio generation                                                                                                                                               
  Effort: S                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [FE] Text-to-Video Wizard Modal
                                                                                                                                                                                                                   
  Description: Build a multi-step wizard modal triggered from the editor's "AI" menu or a prominent "Create Video from Text" button. Steps: (1) Enter prompt + style, (2) Configure duration/format/resolution, (3)
   Review generated storyboard (editable), (4) Generate → progress view.                                                                                                                                           
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Step 1: Multiline prompt input + style dropdown (cinematic/corporate/social/educational)
  - Step 2: Duration slider (15s–5min), format dropdown (16:9, 9:16, 1:1), resolution from project settings                                                                                                        
  - Step 3: Shows LLM-generated storyboard — each scene card shows description + narration + duration; user can edit text or reorder scenes
  - Step 4: "Generate Video" button → progress view showing each step with status icons                                                                                                                            
  - Progress updates in real-time (polls job status every 3s)                                                                                                                                                      
  - On completion: project loads the assembled video in the editor, user can edit further                                                                                                                          
  - Cancel button available at any step; cancels in-progress generation jobs                                                                                                                                       
  - Error handling per step with "Retry" option                                                                                                                                                                    
                                                                                                                                                                                                                   
  Dependencies: Text-to-video orchestrator BE                                                                                                                                                                      
  Effort: L                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  Summary — Epic 10
                   
  ┌────────────────────────────┬──────┬────────┬────────────────────────────────────────────┐
  │           Ticket           │ Area │ Effort │                 Depends On                 │                                                                                                                      
  ├────────────────────────────┼──────┼────────┼────────────────────────────────────────────┤
  │ LLM storyboard generator   │ BE   │ M      │ None                                       │                                                                                                                      
  ├────────────────────────────┼──────┼────────┼────────────────────────────────────────────┤
  │ Text-to-video orchestrator │ BE   │ L      │ AI adapters (Epic 9), storyboard generator │
  ├────────────────────────────┼──────┼────────┼────────────────────────────────────────────┤                                                                                                                      
  │ Auto-caption for TTV       │ BE   │ S      │ Orchestrator, Whisper (Epic 3)             │
  ├────────────────────────────┼──────┼────────┼────────────────────────────────────────────┤                                                                                                                      
  │ Text-to-video wizard modal │ FE   │ L      │ Orchestrator BE                            │
  └────────────────────────────┴──────┴────────┴────────────────────────────────────────────┘                                                                                                                      
                  
  Build order: Storyboard generator first (can be tested independently). Orchestrator is the critical path — needs all AI adapters from Epic 9. FE wizard can start with mocked responses while orchestrator is    
  being built.    
                                                                                                                                                                                                                   
  ---             
  EPIC 11 — Social Media Publishing
                                                                                                                                                                                                                   
  ▎ Direct publish to YouTube, TikTok, and Instagram from the export flow.
                                                                                                                                                                                                                   
  Pages / Surfaces:
  - Social accounts settings page — connect/disconnect accounts                                                                                                                                                    
  - Publish modal — metadata form + platform selection (extends Export modal)
  - Publish history/status page                                              
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [DB] Social Accounts + Publish Jobs Schema                                                                                                                                                                       
                                                                                                                                                                                                                   
  Description: Create social_accounts (OAuth tokens per platform per user) and publish_jobs (track publish attempts) tables.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - social_accounts: account_id, user_id, platform (ENUM: youtube, tiktok, instagram), platform_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, display_name, avatar_url, created_at   
  - publish_jobs: job_id, user_id, render_job_id, platform, status (ENUM: queued, uploading, processing, published, failed), platform_post_id, platform_url, metadata_json, error_message, created_at, updated_at  
  - UNIQUE on (user_id, platform, platform_user_id)                                                                                                                                                              
  - Migration reversible                                                                                                                                                                                           
                  
  Dependencies: Users table (Epic 8)                                                                                                                                                                               
  Effort: S       
                                                                                                                                                                                                                   
  ---             
  [BE] YouTube OAuth + Upload Integration
                                                                                                                                                                                                                   
  Description: Build YouTube Data API v3 integration: OAuth2 connect flow, video upload, metadata (title, description, tags, category, visibility, thumbnail). Uses resumable upload for large files.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - GET /auth/youtube → Google OAuth with YouTube scope                                                                                                                                                            
  - GET /auth/youtube/callback → stores tokens in social_accounts                                                                                                                                                  
  - POST /publish/youtube accepts { renderJobId, title, description, tags[], categoryId, visibility, thumbnailAssetId? }
  - Validates render job is complete, downloads from S3                                                                                                                                                            
  - Uses YouTube resumable upload protocol for videos >5MB                                                                                                                                                         
  - Sets title (max 100 chars), description (max 5000 chars), tags, category                                                                                                                                       
  - Uploads custom thumbnail if provided                                                                                                                                                                           
  - Returns { publishJobId } — polls via GET /publish/:jobId                                                                                                                                                       
  - Handles quota errors (10,000 units/day) with clear error message                                                                                                                                               
  - Token refresh when access token expires                                                                                                                                                                        
                                                                                                                                                                                                                   
  Dependencies: Social accounts DB, render pipeline (Epic 5)                                                                                                                                                       
  Effort: L ⚠️  YouTube API quota limits are strict; resumable upload adds complexity                                                                                                                               
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [BE] TikTok Content Posting API Integration                                                                                                                                                                      
                                             
  Description: Build TikTok Content Posting API integration. TikTok uses a different flow: init upload → upload chunks → create post with metadata.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - GET /auth/tiktok → TikTok OAuth                                                                                                                                                                                
  - GET /auth/tiktok/callback → stores tokens                                                                                                                                                                      
  - POST /publish/tiktok accepts { renderJobId, caption, allowComments, allowDuet, allowStitch, visibility }
  - Uploads video via TikTok's chunk-based upload API                                                                                                                                                              
  - Sets caption (max 2200 chars), privacy settings                                                                                                                                                                
  - Handles TikTok's async publishing (video goes through review)                                                                                                                                                  
  - Returns { publishJobId } with status tracking                                                                                                                                                                  
  - Token refresh with TikTok's refresh flow                                                                                                                                                                       
                                                                                                                                                                                                                   
  Dependencies: Social accounts DB, render pipeline                                                                                                                                                                
  Effort: L ⚠️  TikTok API review process can take up to 5 days; different SDK patterns                                                                                                                             
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [BE] Instagram Graph API Integration                                                                                                                                                                             
                                      
  Description: Build Instagram Graph API integration for Reels and feed posts. Instagram requires a Facebook Page linked to an Instagram Professional account.
                                                                                                                                                                                                                   
  Acceptance Criteria:                                                                                                                                                                                             
  - GET /auth/instagram → Facebook OAuth with Instagram scope                                                                                                                                                      
  - GET /auth/instagram/callback → stores tokens                                                                                                                                                                   
  - POST /publish/instagram accepts { renderJobId, caption, mediaType: 'reel'|'feed', coverTimestamp? }
  - For Reels: uses container-based creation flow (create container → upload → publish)                
  - Caption max 2200 chars, hashtags counted as part of caption                                                                                                                                                    
  - Handles Instagram's async processing (container status polling)                                                                                                                                                
  - Returns { publishJobId } with status tracking                                                                                                                                                                  
  - Validates aspect ratio requirements per media type                                                                                                                                                             
                                                                                                                                                                                                                   
  Dependencies: Social accounts DB, render pipeline                                                                                                                                                                
  Effort: L ⚠️  Instagram API requires Facebook Business account; complex container-based upload
                                                                                                                                                                                                                   
  ---             
  [FE] Social Accounts Settings Page                                                                                                                                                                               
                                    
  Description: Build /settings/social-accounts page showing connected platforms. Each platform card shows: icon, name, connected account info, connect/disconnect buttons.
                                                                                                                                                                                                                   
  Acceptance Criteria:                                                                                                                                                                                             
  - Cards for YouTube, TikTok, Instagram                                                                                                                                                                           
  - "Connect" button initiates OAuth flow                                                                                                                                                                          
  - Connected accounts show display name + avatar
  - "Disconnect" button with confirmation dialog 
  - Status indicators: connected (green), disconnected (gray), token expired (yellow warning)                                                                                                                      
  - Dark theme, consistent with design system                                                
                                                                                                                                                                                                                   
  Dependencies: OAuth endpoints for all platforms
  Effort: M                                                                                                                                                                                                        
                  
  ---                                                                                                                                                                                                              
  [FE] Publish Modal (extends Export)
                                     
  Description: After a render completes, add a "Publish" button alongside "Download". Opens a publish modal where users select target platforms, fill in per-platform metadata, and submit. Each platform has a
  metadata form section.                                                                                                                                                                                           
  
  **Acceptance                                                                                                                                                                                                     
                  
● Now I have a complete picture. Let me write the epic breakdown.                                                                                                                                                  
                  
  ---                                                                                                                                                                                                              
  Epic Breakdown: Epics 7–12 (Phase 2+)
                                                                                                                                                                                                                   
  Based on my review of:
  - docs/general_idea.md — product vision, competitor analysis, feature prioritization                                                                                                                             
  - docs/general_tasks.md — Epics 1–7 (all complete)                                                                                                                                                               
  - docs/development_logs.md — 1312+ tests passing, all Phase 1 features integrated                                                                                                                                
  - docs/architecture-rules.md — React 18 + Remotion + Node/Express + MySQL + BullMQ + Turborepo monorepo                                                                                                          
  - docs/active_task.md — 2 minor polish items remaining                                                                                                                                                           
                                                                                                                                                                                                                   
  Current State Summary                                                                                                                                                                                            
                                                                                                                                                                                                                   
  Completed: Asset upload pipeline, Remotion preview, AI captions/Whisper, version history/rollback, background render pipeline, full timeline editor (drag/trim/split/reorder/resize/context menus), inspector    
  panels, export modal + renders queue, project settings (FPS/resolution), add-to-timeline dropdown, asset replace/delete, multiple caption tracks.                                                                
                                                                                                                                                                                                                   
  What's missing for a production product: Auth/registration, AI generation APIs, text-to-video, social publishing, animations/transitions.                                                                        
  
  ---                                                                                                                                                                                                              
  Pages / Surfaces (New Epics)
                                                                                                                                                                                                                   
  - Landing / Marketing page — public homepage, pricing, sign-up CTA
  - Registration / Login page — email + OAuth sign-in                                                                                                                                                              
  - Dashboard / Projects page — list user's projects, create new                                                                                                                                                   
  - AI Generation panel (sidebar in editor) — text-to-image, text-to-video prompts                                                                                                                                 
  - Text-to-Video wizard (modal or dedicated page) — prompt → full video pipeline                                                                                                                                  
  - Publish modal (in editor) — platform selection, metadata, scheduling                                                                                                                                           
  - Animation/Transitions inspector (right sidebar) — apply effects to clips                                                                                                                                       
  - User settings page — API keys, connected accounts, billing                                                                                                                                                     
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  EPIC 7 — Authentication & User Management                                                                                                                                                                        
                                           
  ---
  [DB] Users and Sessions Table Migrations                                                                                                                                                                         
                                                                                                                                                                                                                   
  Description: Create users table (id, email, password_hash, display_name, avatar_url, oauth_provider, oauth_id, created_at, updated_at) and sessions table (session_id, user_id, token_hash, expires_at,          
  created_at). Support both email/password and OAuth login. The existing owner_user_id CHAR(26) in projects table already references user IDs — this migration formalizes the users table those IDs point to.      
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - users table with ULID primary key, unique constraint on email, unique constraint on (oauth_provider, oauth_id)
  - sessions table with token-based lookup index                                                                                                                                                                   
  - Password hash column nullable (OAuth users may not have a password)
  - Migration is reversible (up/down)                                                                                                                                                                              
  - Foreign key from projects.owner_user_id → users.user_id
                                                                                                                                                                                                                   
  Dependencies: None                                                                                                                                                                                               
  Effort: S                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [BE] Email/Password Registration Endpoint
                                                                                                                                                                                                                   
  Description: Build POST /auth/register that accepts { email, password, displayName }, validates inputs (email format, password min 8 chars), hashes the password with bcrypt (cost factor 12), creates a users
  row, creates a session, and returns { userId, token, expiresAt }. Rate-limited to 5 registrations per IP per hour.                                                                                               
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Validates email format, password minimum length (8), display name (1–100 chars)
  - Returns 409 if email already registered                                                                                                                                                                        
  - Hashes password with bcrypt, cost factor 12
  - Creates session with 30-day expiry                                                                                                                                                                             
  - Returns Set-Cookie with httpOnly secure session token + JSON body
  - Rate-limited: 5 per IP per hour (returns 429)                                                                                                                                                                  
  - Writes auth.register to audit log                                                                                                                                                                              
                                     
  Dependencies: Users + Sessions DB migration                                                                                                                                                                      
  Effort: M                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [BE] Login Endpoint (Email/Password)
                                      
  Description: Build POST /auth/login that accepts { email, password }, verifies credentials via bcrypt compare, creates a new session, returns token. Returns generic "Invalid credentials" on both wrong email
  and wrong password (no user enumeration).                                                                                                                                                                        
  
  Acceptance Criteria:                                                                                                                                                                                             
  - Returns 401 with generic message on invalid email or password
  - Creates new session row on success                                                                                                                                                                             
  - Returns Set-Cookie + JSON { userId, token, expiresAt }
  - Rate-limited: 10 attempts per email per 15 minutes (brute force protection)                                                                                                                                    
  - Writes auth.login to audit log                                                                                                                                                                                 
                                                                                                                                                                                                                   
  Dependencies: Registration endpoint (users must exist)                                                                                                                                                           
  Effort: S                                                                                                                                                                                                        
                  
  ---                                                                                                                                                                                                              
  [BE] OAuth Login (Google + GitHub)
                                                                                                                                                                                                                   
  Description: Implement OAuth 2.0 authorization code flow for Google and GitHub. GET /auth/:provider redirects to the provider. GET /auth/:provider/callback exchanges the code for user info, creates or links
  the user, creates a session, and redirects to the editor. Uses passport or manual OAuth implementation.                                                                                                          
                  
  ⚠️  Requires OAuth app registration with Google and GitHub. Client ID/secret stored in environment variables.                                                                                                     
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - GET /auth/google and GET /auth/github redirect to provider with correct scopes
  - Callback exchanges code for access token, fetches user profile (email, name, avatar)                                                                                                                           
  - If email already exists with password auth, links OAuth provider to existing account
  - If new user, creates account with oauth_provider + oauth_id                                                                                                                                                    
  - Creates session and redirects to /?token=... or sets cookie                                                                                                                                                    
  - CSRF protection via state parameter                                                                                                                                                                            
  - Returns 400 on callback errors (denied, invalid code)                                                                                                                                                          
                                                                                                                                                                                                                   
  Dependencies: Users + Sessions DB migration                                                                                                                                                                      
  Effort: M                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [BE] Session Middleware + Logout
                                  
  Description: Replace the existing DEV_USER auth bypass with real session validation. Read the session token from the Authorization: Bearer header or session cookie. Validate against the sessions table.
  Populate req.user with the full user record. Build POST /auth/logout to invalidate the current session.                                                                                                          
  
  Acceptance Criteria:                                                                                                                                                                                             
  - Middleware reads token from Authorization: Bearer header or cookie
  - Invalid/expired token returns 401                                                                                                                                                                              
  - req.user populated with { userId, email, displayName }
  - DEV_USER bypass still works when NODE_ENV=development (backwards compatible)                                                                                                                                   
  - POST /auth/logout deletes session row, clears cookie                                                                                                                                                           
  - All existing API routes continue to work with the new middleware                                                                                                                                               
                                                                                                                                                                                                                   
  Dependencies: Login endpoints                                                                                                                                                                                    
  Effort: S       
                                                                                                                                                                                                                   
  ---             
  [FE] Registration + Login Pages
                                                                                                                                                                                                                   
  Description: Build /register and /login routes in the web editor app (or a separate landing app). Registration form: email, password, display name, "Sign up with Google/GitHub" buttons. Login form: email,
  password, OAuth buttons. After successful auth, redirect to dashboard or editor. Show validation errors inline.                                                                                                  
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Registration form validates email, password (8+ chars), display name before submit
  - Login form shows generic error on invalid credentials                                                                                                                                                          
  - OAuth buttons redirect to /auth/google and /auth/github
  - Success redirects to /dashboard (or editor if coming from a shared link)                                                                                                                                       
  - "Already have an account?" / "Don't have an account?" toggle links                                                                                                                                             
  - Forms are responsive (mobile-friendly)                                                                                                                                                                         
  - Loading state on submit button during API call                                                                                                                                                                 
                                                                                                                                                                                                                   
  Dependencies: All auth BE endpoints                                                                                                                                                                              
  Effort: M       
                                                                                                                                                                                                                   
  ---             
  [FE] Dashboard / Projects List Page
                                                                                                                                                                                                                   
  Description: Build a /dashboard page showing the user's projects as cards. Each card shows: project name (editable), thumbnail (first frame from latest render or a placeholder), last modified date,
  resolution/fps badge. "Create New Project" button opens the editor with a fresh project. Clicking an existing project opens it in the editor.                                                                    
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Lists all projects for the authenticated user
  - Project cards show thumbnail, name, last modified, resolution                                                                                                                                                  
  - "New Project" button navigates to /editor?new=true           
  - Click on project card navigates to /editor?projectId=<id>                                                                                                                                                      
  - Delete project: confirmation dialog → DELETE /projects/:id                                                                                                                                                     
  - Duplicate project: creates a copy                         
  - Empty state for new users: "Create your first project"                                                                                                                                                         
  - Responsive grid layout (1 col mobile, 2 col tablet, 3-4 col desktop)
                                                                                                                                                                                                                   
  Dependencies: Auth (user must be logged in), GET /projects and DELETE /projects/:id endpoints                                                                                                                    
  Effort: M                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [BE] Projects List + Delete Endpoints
                                                                                                                                                                                                                   
  Description: Build GET /projects (lists all projects for the authenticated user, paginated) and DELETE /projects/:id (soft-delete). The existing POST /projects already creates projects but has no list
  endpoint.                                                                                                                                                                                                        
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - GET /projects returns [{ projectId, name, updatedAt, latestVersionId, thumbnailUrl }] newest-first
  - Paginated: ?page=1&limit=20                                                                                                                                                                                    
  - Only returns projects owned by req.user.userId
  - DELETE /projects/:id sets deleted_at timestamp (soft delete)                                                                                                                                                   
  - Returns 404 if project not found or not owned by user       
                                                                                                                                                                                                                   
  Dependencies: Session middleware                                                                                                                                                                                 
  Effort: S                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  Summary — Epic 7
                  
  ┌──────────────────────────────────┬──────┬────────┬───────────────────────────┐
  │              Ticket              │ Area │ Effort │        Depends On         │                                                                                                                                 
  ├──────────────────────────────────┼──────┼────────┼───────────────────────────┤
  │ Users + Sessions DB migration    │ DB   │ S      │ None                      │                                                                                                                                 
  ├──────────────────────────────────┼──────┼────────┼───────────────────────────┤
  │ Email/Password registration      │ BE   │ M      │ DB migration              │                                                                                                                                 
  ├──────────────────────────────────┼──────┼────────┼───────────────────────────┤
  │ Email/Password login             │ BE   │ S      │ Registration              │                                                                                                                                 
  ├──────────────────────────────────┼──────┼────────┼───────────────────────────┤
  │ OAuth login (Google + GitHub)    │ BE   │ M      │ DB migration              │
  ├──────────────────────────────────┼──────┼────────┼───────────────────────────┤                                                                                                                                 
  │ Session middleware + logout      │ BE   │ S      │ Login                     │
  ├──────────────────────────────────┼──────┼────────┼───────────────────────────┤                                                                                                                                 
  │ Projects list + delete endpoints │ BE   │ S      │ Session middleware        │
  ├──────────────────────────────────┼──────┼────────┼───────────────────────────┤
  │ Registration + Login pages       │ FE   │ M      │ All auth BE               │
  ├──────────────────────────────────┼──────┼────────┼───────────────────────────┤                                                                                                                                 
  │ Dashboard / Projects list page   │ FE   │ M      │ Projects endpoints + auth │
  └──────────────────────────────────┴──────┴────────┴───────────────────────────┘                                                                                                                                 
                  
  Build order: DB migration first, then registration + login + OAuth in parallel. Session middleware unblocks all FE work. FE pages can stub with local token until BE is ready. Dashboard is last since it        
  requires both auth and project listing.
                                                                                                                                                                                                                   
  ---             
  EPIC 8 — AI Generation Platform Integrations

  ---
  [DB] AI Generation Jobs Table Migration
                                         
  Description: Create ai_generation_jobs table to track all AI generation requests (image, video, audio). Fields: job_id, project_id, user_id, provider (ENUM: replicate, runway, stability, elevenlabs, openai),
  generation_type (ENUM: image, video, audio, music), prompt, params_json, status (queued/processing/complete/failed), output_asset_id, cost_credits, provider_job_id, error_message, created_at, updated_at.      
  
  Acceptance Criteria:                                                                                                                                                                                             
  - Index on (user_id, status) and (project_id, created_at)
  - output_asset_id nullable FK to project_assets_current                                                                                                                                                          
  - Migration is reversible                              
                                                                                                                                                                                                                   
  Dependencies: None                                                                                                                                                                                               
  Effort: XS                                                                                                                                                                                                       
                                                                                                                                                                                                                   
  ---             
  [BE] AI Provider Abstraction Layer
                                    
  Description: Create apps/api/src/services/ai-providers/ with a GenerationProvider interface and implementations for: Replicate (Flux for images, Kling for video), Stability AI (Stable Diffusion for images),
  OpenAI (DALL-E for images, GPT for scripts), ElevenLabs (voice synthesis, SFX). Each provider handles: submitting a job, polling for completion, downloading the output to object storage, and creating an asset 
  row.
                                                                                                                                                                                                                   
  ⚠️  Each provider has different polling patterns (webhooks vs polling), rate limits, and pricing. Abstract the differences behind a unified interface.                                                            
  
  Acceptance Criteria:                                                                                                                                                                                             
  - GenerationProvider interface: submit(params), checkStatus(jobId), downloadOutput(jobId)
  - Replicate implementation: uses Replicate API for Flux (image) and Kling (video) models                                                                                                                         
  - Stability AI implementation: uses Stability REST API for image generation             
  - OpenAI implementation: uses DALL-E 3 API for images, Chat API for script generation                                                                                                                            
  - ElevenLabs implementation: uses Text-to-Speech and Sound Effects APIs              
  - Provider selection based on generation_type + user preference                                                                                                                                                  
  - API keys stored in environment variables, never in DB                                                                                                                                                          
  - Each provider has retry logic (3x with backoff)                                                                                                                                                                
                                                                                                                                                                                                                   
  Dependencies: AI Generation Jobs DB migration                                                                                                                                                                    
  Effort: L ⚠️  Multiple external API integrations; each has its own SDK/auth pattern                                                                                                                               
                                                                                                                                                                                                                   
  ---             
  [BE] AI Generation Endpoints                                                                                                                                                                                     
                              
  Description: Build POST /projects/:id/generate (submit generation request), GET /generation-jobs/:jobId (poll status), GET /projects/:id/generation-jobs (list jobs). The submit endpoint enqueues a BullMQ job
  that calls the appropriate provider. On completion, the output is saved to object storage and an asset is created in the project.                                                                                
  
  Acceptance Criteria:                                                                                                                                                                                             
  - POST /generate accepts { type, provider, prompt, params } — returns { jobId } with 202
  - Worker processes the job: calls provider → polls → downloads → saves to S3 → creates asset                                                                                                                     
  - GET /generation-jobs/:jobId returns { status, progressPct, outputAssetId?, error? }       
  - GET /projects/:id/generation-jobs lists all jobs for the project, newest-first                                                                                                                                 
  - Rate-limited: 10 generation requests per user per hour (configurable)                                                                                                                                          
  - Cost tracked in cost_credits field (for future billing)                                                                                                                                                        
                                                                                                                                                                                                                   
  Dependencies: AI Provider Abstraction Layer                                                                                                                                                                      
  Effort: M       
                                                                                                                                                                                                                   
  ---             
  [FE] AI Generation Panel (Editor Sidebar)
                                                                                                                                                                                                                   
  Description: Add an "AI Generate" tab/panel to the editor's left sidebar (alongside the Asset Browser). Shows generation options: Image, Video, Audio, Music. Each option opens a prompt input with
  provider-specific parameters (style, duration, aspect ratio). Submitted jobs show progress inline. Completed outputs appear as assets in the Asset Browser automatically.                                        
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Panel accessible via a tab/button in the left sidebar
  - Four generation categories: Image, Video, Audio, Music                                                                                                                                                         
  - Prompt text area with character limit (500 chars)     
  - Provider selector (when multiple providers available for a type)                                                                                                                                               
  - Parameter controls vary by type (e.g., video: duration slider 3-10s; image: aspect ratio)                                                                                                                      
  - Active jobs shown with progress bar and status                                                                                                                                                                 
  - Completed assets auto-appear in Asset Browser (via polling or refetch)                                                                                                                                         
  - Error states with retry button                                                                                                                                                                                 
  - Job history section showing past generations                                                                                                                                                                   
                                                                                                                                                                                                                   
  Dependencies: AI Generation endpoints
  Effort: M                                                                                                                                                                                                        
                  
  ---
  Summary — Epic 8
                  
  ┌─────────────────────────────────┬──────┬────────┬──────────────────────┐
  │             Ticket              │ Area │ Effort │      Depends On      │                                                                                                                                       
  ├─────────────────────────────────┼──────┼────────┼──────────────────────┤
  │ AI Generation Jobs DB migration │ DB   │ XS     │ None                 │                                                                                                                                       
  ├─────────────────────────────────┼──────┼────────┼──────────────────────┤
  │ AI Provider Abstraction Layer   │ BE   │ L      │ DB migration         │
  ├─────────────────────────────────┼──────┼────────┼──────────────────────┤
  │ AI Generation Endpoints         │ BE   │ M      │ Provider layer       │
  ├─────────────────────────────────┼──────┼────────┼──────────────────────┤                                                                                                                                       
  │ AI Generation Panel (FE)        │ FE   │ M      │ Generation endpoints │
  └─────────────────────────────────┴──────┴────────┴──────────────────────┘                                                                                                                                       
                  
  Build order: DB first, then provider layer (this is the biggest risk — spike Replicate + OpenAI first as they have the best APIs). Endpoints once the provider interface is stable. FE panel can develop against 
  mocked endpoints.
                                                                                                                                                                                                                   
  ---             
  EPIC 9 — Text-to-Video Pipeline

  ---
  [BE] Script Generation Endpoint
                                                                                                                                                                                                                   
  Description: Build POST /projects/:id/generate-script that takes a text prompt and desired video length, calls OpenAI GPT-4 to generate a structured video script (scenes, voiceover text, visual descriptions,
  caption text). Returns the script as JSON matching a VideoScript Zod schema.                                                                                                                                     
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Accepts { prompt, durationSeconds, style, language }
  - Calls OpenAI Chat API with a system prompt that returns structured JSON                                                                                                                                        
  - Returns { scenes: [{ sceneNumber, durationSeconds, voiceoverText, visualDescription, captionText }] }
  - Total scene durations sum to ±10% of durationSeconds                                                                                                                                                           
  - Validates response against VideoScript Zod schema                                                                                                                                                              
  - Retries on malformed JSON (up to 2x)                                                                                                                                                                           
                                                                                                                                                                                                                   
  Dependencies: OpenAI provider from Epic 8                                                                                                                                                                        
  Effort: M                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [BE] Text-to-Video Orchestrator Worker
                                                                                                                                                                                                                   
  Description: Build a BullMQ job handler that orchestrates the full text-to-video pipeline: (1) generate script → (2) generate voiceover audio per scene (ElevenLabs) → (3) generate visuals per scene
  (Replicate/Stability) → (4) assemble into a project document with tracks (video track, audio track, caption track) → (5) trigger a render job. This is the most complex worker in the system — it coordinates    
  multiple sub-jobs and handles partial failures.
                                                                                                                                                                                                                   
  ⚠️  This is a long-running job (potentially minutes). Must support progress reporting and cancellation.                                                                                                           
  
  Acceptance Criteria:                                                                                                                                                                                             
  - Accepts { projectId, prompt, durationSeconds, style, voiceId, outputFormat }
  - Step 1: Generates script via GPT-4                                                                                                                                                                             
  - Step 2: For each scene, enqueues voiceover generation (ElevenLabs) — parallel
  - Step 3: For each scene, enqueues visual generation (image or video) — parallel with step 2                                                                                                                     
  - Step 4: Assembles assets into a ProjectDoc with properly sequenced clips                                                                                                                                       
  - Step 5: Saves project version and enqueues render job                                                                                                                                                          
  - Reports progress: 10% script, 10-60% assets, 60-90% assembly, 90-100% render                                                                                                                                   
  - Handles partial failure: if one scene's visual fails, substitutes a placeholder                                                                                                                                
  - Cancellable via DELETE /generation-jobs/:jobId                                                                                                                                                                 
                                                                                                                                                                                                                   
  Dependencies: Script generation endpoint, AI providers (Replicate, ElevenLabs)                                                                                                                                   
  Effort: L ⚠️  Multi-step orchestration with external API dependencies                                                                                                                                             
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [FE] Text-to-Video Wizard Modal
                                                                                                                                                                                                                   
  Description: Build a multi-step modal: (1) Prompt input — describe the video, select length (15s/30s/60s/custom), format (16:9/9:16/1:1), (2) Style selection — cinematic, cartoon, documentary, social media,
  (3) Voice selection — pick from ElevenLabs voices or "no voiceover", (4) Review — shows the generated script with scene breakdown, (5) Generate — progress view with per-scene status. On completion, opens the  
  project in the editor with all tracks populated.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - Step 1: Prompt textarea, duration picker, format selector
  - Step 2: Style cards with preview thumbnails                                                                                                                                                                    
  - Step 3: Voice selector with audio preview samples
  - Step 4: Script review — editable scene text before committing                                                                                                                                                  
  - Step 5: Progress view with per-scene progress bars                                                                                                                                                             
  - Back/Next navigation between steps                                                                                                                                                                             
  - "Generate Video" button on step 4 submits the job                                                                                                                                                              
  - On completion: redirects to editor with the project loaded                                                                                                                                                     
  - Cancel button at any stage; cancels the BullMQ job if in progress                                                                                                                                              
  - Accessible from Dashboard ("Create with AI") and Editor ("AI" menu)                                                                                                                                            
                                                                                                                                                                                                                   
  Dependencies: Text-to-Video Orchestrator, Script generation endpoint                                                                                                                                             
  Effort: M                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  Summary — Epic 9

  ┌───────────────────────────────────┬──────┬────────┬────────────────────────────────────┐
  │              Ticket               │ Area │ Effort │             Depends On             │
  ├───────────────────────────────────┼──────┼────────┼────────────────────────────────────┤
  │ Script generation endpoint        │ BE   │ M      │ OpenAI provider (Epic 8)           │
  ├───────────────────────────────────┼──────┼────────┼────────────────────────────────────┤
  │ Text-to-Video orchestrator worker │ BE   │ L      │ Script endpoint + all AI providers │                                                                                                                       
  ├───────────────────────────────────┼──────┼────────┼────────────────────────────────────┤                                                                                                                       
  │ Text-to-Video wizard modal        │ FE   │ M      │ Orchestrator endpoint              │                                                                                                                       
  └───────────────────────────────────┴──────┴────────┴────────────────────────────────────┘                                                                                                                       
                  
  Build order: Script endpoint first (can be tested standalone). Orchestrator is the critical path — needs all providers working. FE wizard can develop steps 1-4 against mocked data while orchestrator is built. 
  
  ---                                                                                                                                                                                                              
  EPIC 10 — Social Media Publishing
                                                                                                                                                                                                                   
  ---
  [DB] Connected Accounts + Publish Jobs Tables                                                                                                                                                                    
                                               
  Description: Create connected_accounts table (user_id, platform, access_token_encrypted, refresh_token_encrypted, platform_user_id, platform_username, scopes, expires_at, created_at) and publish_jobs table
  (job_id, render_job_id, platform, status, platform_post_id, metadata_json, error_message, scheduled_at, published_at, created_at).                                                                               
  
  Acceptance Criteria:                                                                                                                                                                                             
  - connected_accounts: unique constraint on (user_id, platform)
  - Tokens encrypted at rest (AES-256-GCM with app-level encryption key)                                                                                                                                           
  - publish_jobs: FK to render_jobs                                     
  - platform ENUM: youtube, tiktok, instagram                                                                                                                                                                      
  - Migration is reversible                                                                                                                                                                                        
                                                                                                                                                                                                                   
  Dependencies: None                                                                                                                                                                                               
  Effort: S ⚠️  Token encryption requires careful key management                                                                                                                                                    
  
  ---                                                                                                                                                                                                              
  [BE] OAuth Connection Endpoints (YouTube, TikTok, Instagram)
                                                                                                                                                                                                                   
  Description: Build GET /accounts/connect/:platform (redirects to platform OAuth), GET /accounts/connect/:platform/callback (stores tokens), GET /accounts (lists connected accounts), DELETE /accounts/:platform
  (disconnects). Each platform has its own OAuth scopes: YouTube (upload, manage videos), TikTok (video.upload, video.publish), Instagram (content_publish).                                                       
                  
  ⚠️  TikTok and Instagram require app review/approval for publishing scopes. YouTube is the most straightforward to implement first.                                                                               
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - YouTube: requests youtube.upload + youtube.force-ssl scopes
  - TikTok: requests video.upload + video.publish scopes                                                                                                                                                           
  - Instagram: requests instagram_content_publish scope via Facebook Graph API
  - Callback stores encrypted tokens in connected_accounts                                                                                                                                                         
  - Token refresh handled automatically (refresh tokens before expiry)                                                                                                                                             
  - GET /accounts returns [{ platform, username, connectedAt, isExpired }]
  - DELETE /accounts/:platform revokes access token at provider and deletes row                                                                                                                                    
                                                                                                                                                                                                                   
  Dependencies: Connected Accounts DB migration                                                                                                                                                                    
  Effort: L ⚠️  Three different OAuth implementations; TikTok/Instagram API review process                                                                                                                          
                                                                                                                                                                                                                   
  ---             
  [BE] Publish Endpoint + Worker                                                                                                                                                                                   
                                
  Description: Build POST /renders/:jobId/publish that accepts { platform, title, description, tags, visibility, scheduledAt? }, validates the render is complete, checks the user has a connected account, and
  enqueues a publish-video BullMQ job. The worker downloads the rendered video from S3, uploads it to the target platform via API, and updates the publish job with the post URL.                                  
  
  Acceptance Criteria:                                                                                                                                                                                             
  - Validates render job is complete and output exists
  - Validates user has connected the target platform                                                                                                                                                               
  - For YouTube: uses YouTube Data API v3 videos.insert with snippet (title, description, tags, categoryId) and status (privacy)
  - For TikTok: uses TikTok Content Posting API (chunk upload + publish)                                                                                                                                           
  - For Instagram: uses Facebook Graph API (upload container + publish)                                                                                                                                            
  - Returns { publishJobId } with 202                                                                                                                                                                              
  - Worker updates publish_jobs.status and platform_post_id on success                                                                                                                                             
  - Supports scheduled publishing (scheduledAt stored; worker defers until time)                                                                                                                                   
  - Character limits enforced per platform (YouTube title 100, description 5000; TikTok description 2200)                                                                                                          
                                                                                                                                                                                                                   
  Dependencies: OAuth connection endpoints, render pipeline (Epic 5)                                                                                                                                               
  Effort: L ⚠️  Platform-specific upload protocols differ significantly                                                                                                                                             
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [FE] Publish Modal                                                                                                                                                                                               
                    
  Description: After a render completes, add a "Publish" button alongside "Download". Opens a modal showing connected platforms with status. For each platform: metadata form (title, description, tags/hashtags,
  visibility/privacy, category, thumbnail). Schedule option. "Publish Now" or "Schedule" buttons.                                                                                                                  
  
  Acceptance Criteria:                                                                                                                                                                                             
  - Shows connected platforms with green checkmark; disconnected with "Connect" button
  - "Connect" button opens OAuth flow in popup window                                                                                                                                                              
  - Metadata form per platform with character count and limit warnings
  - Auto-populate title/description from project name (editable)                                                                                                                                                   
  - Tags input with comma-separated entry                                                                                                                                                                          
  - Visibility: Public / Unlisted / Private (YouTube); Public / Friends (TikTok)                                                                                                                                   
  - Schedule date/time picker (optional)                                                                                                                                                                           
  - "Publish Now" shows confirmation before submitting                                                                                                                                                             
  - Publishing progress with status per platform                                                                                                                                                                   
  - On success: shows direct link to published post                                                                                                                                                                
  - Multi-platform: can select and publish to multiple platforms simultaneously
                                                                                                                                                                                                                   
  Dependencies: Publish endpoint, OAuth connection endpoints                                                                                                                                                       
  Effort: L                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [FE] Connected Accounts Settings Page
                                       
  Description: Build a /settings/accounts page showing all connected social accounts. Each account shows: platform icon, username, connection date, token status (active/expired). "Connect" button for unconnected
   platforms. "Disconnect" button with confirmation. This page is also accessible from the Publish modal.                                                                                                          
  
  Acceptance Criteria:                                                                                                                                                                                             
  - Lists YouTube, TikTok, Instagram with connection status
  - Connected: shows username, connected date, "Disconnect" button                                                                                                                                                 
  - Disconnected: shows "Connect" button opening OAuth flow       
  - Expired token: shows warning with "Reconnect" button                                                                                                                                                           
  - Confirmation dialog before disconnecting                                                                                                                                                                       
  
  Dependencies: OAuth endpoints                                                                                                                                                                                    
  Effort: S       
                                                                                                                                                                                                                   
  ---             
  Summary — Epic 10

  ┌──────────────────────────────────────────┬──────┬────────┬───────────────────────────────────┐
  │                  Ticket                  │ Area │ Effort │            Depends On             │
  ├──────────────────────────────────────────┼──────┼────────┼───────────────────────────────────┤
  │ Connected Accounts + Publish Jobs DB     │ DB   │ S      │ None                              │
  ├──────────────────────────────────────────┼──────┼────────┼───────────────────────────────────┤
  │ OAuth Connection Endpoints (3 platforms) │ BE   │ L      │ DB migration                      │                                                                                                                 
  ├──────────────────────────────────────────┼──────┼────────┼───────────────────────────────────┤
  │ Publish endpoint + worker                │ BE   │ L      │ OAuth endpoints + render pipeline │                                                                                                                 
  ├──────────────────────────────────────────┼──────┼────────┼───────────────────────────────────┤                                                                                                                 
  │ Publish modal                            │ FE   │ L      │ Publish endpoint                  │
  ├──────────────────────────────────────────┼──────┼────────┼───────────────────────────────────┤                                                                                                                 
  │ Connected Accounts settings page         │ FE   │ S      │ OAuth endpoints                   │
  └──────────────────────────────────────────┴──────┴────────┴───────────────────────────────────┘                                                                                                                 
  
  Build order: Start with YouTube only (simplest API, no app review). DB + OAuth first. Publish worker in parallel with FE. TikTok and Instagram added incrementally. Recommend splitting this into Phase 1        
  (YouTube only) and Phase 2 (TikTok + Instagram) to reduce risk.
                                                                                                                                                                                                                   
  ---             
  EPIC 11 — Animations & Animated Transitions

  ---
  [Schema] Animation and Transition Types in project-schema
                                                                                                                                                                                                                   
  Description: Extend packages/project-schema/ with animation types. Add clipAnimationSchema (entry/exit animations per clip: fade, slide, zoom, bounce, etc.) and transitionSchema (between adjacent clips on same
   track: crossfade, wipe, dissolve, slide). Each has type, durationFrames, easing, and type-specific parameters.                                                                                                  
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - ClipAnimation type: { type: 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom-in' | 'zoom-out' | 'bounce', durationFrames: number, easing: 'linear' | 'ease-in' | 'ease-out' | 
  'ease-in-out' | 'spring' }                                                                                                                                                                                       
  - Transition type: { type: 'crossfade' | 'wipe-left' | 'wipe-right' | 'dissolve' | 'slide-push', durationFrames: number, easing: string }
  - VideoClip, ImageClip, AudioClip schemas extended with optional entryAnimation?, exitAnimation?                                                                                                                 
  - Track schema extended with optional transitions?: Transition[] (each has afterClipId)                                                                                                                          
  - Zod schemas + TypeScript types exported                                                                                                                                                                        
  - Existing tests pass; new tests cover animation/transition variants                                                                                                                                             
                                                                                                                                                                                                                   
  Dependencies: None                                                                                                                                                                                               
  Effort: S                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [FE/Remotion] Implement Clip Animations in Remotion Compositions
                                                                                                                                                                                                                   
  Description: Update packages/remotion-comps/ layer components (VideoLayer, ImageLayer, TextOverlayLayer) to apply entry/exit animations using Remotion's interpolate() and spring(). Each animation type maps to
  CSS transform/opacity interpolations. Animations apply within the clip's frame range (entry at start, exit at end).                                                                                              
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Fade: interpolates opacity 0→1 (entry) and 1→0 (exit) over durationFrames
  - Slide variants: interpolate translateX/translateY from off-screen to position                                                                                                                                  
  - Zoom: interpolate scale from 0→1 (in) or 1→0 (out)                           
  - Bounce: uses Remotion spring() for natural bounce easing                                                                                                                                                       
  - Easing options map to Remotion's Easing module          
  - Animations stack correctly (entry + exit on same clip)                                                                                                                                                         
  - No animation when entryAnimation/exitAnimation is undefined (backwards compatible)                                                                                                                             
  - Storybook stories demonstrate each animation type                                                                                                                                                              
                                                                                                                                                                                                                   
  Dependencies: Animation schema types                                                                                                                                                                             
  Effort: M                                                                                                                                                                                                        
                  
  ---                                                                                                                                                                                                              
  [FE/Remotion] Implement Transitions Between Clips
                                                   
  Description: Implement track-level transitions in VideoComposition. When two adjacent clips on the same track have a transition, overlap them by transition.durationFrames and apply the visual effect.
  Crossfade: blend opacity of outgoing and incoming clip. Wipe: use a clip-path or mask animation. Dissolve: similar to crossfade with noise texture.                                                              
  
  ⚠️  Transitions require clips to overlap by the transition duration. The composition must handle the overlap zone specially — rendering both clips simultaneously with the transition effect applied.             
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Crossfade: outgoing clip fades out while incoming fades in over overlap duration
  - Wipe: clip-path animation reveals incoming clip from the specified direction                                                                                                                                   
  - Dissolve: noise-based crossfade effect                                      
  - Slide-push: outgoing slides out while incoming slides in                                                                                                                                                       
  - Clips automatically overlap by transition.durationFrames in the composition                                                                                                                                    
  - Transitions render correctly in both Player preview and SSR render                                                                                                                                             
  - No transition when transitions array is empty or undefined                                                                                                                                                     
  - Audio crossfade: volume ramp down/up for audio tracks                                                                                                                                                          
                                                                                                                                                                                                                   
  Dependencies: Animation schema types, Remotion composition updates                                                                                                                                               
  Effort: L ⚠️  Overlapping clip rendering in Remotion requires careful Sequence nesting                                                                                                                            
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [FE] Animation Inspector Panel                                                                                                                                                                                   
                                
  Description: When a clip is selected, add an "Animations" section to the right-sidebar inspector. Shows entry animation dropdown (none, fade, slide-left, etc.), exit animation dropdown, duration slider for
  each, easing selector. Changes update the project document via Immer (live preview in Player).                                                                                                                   
  
  Acceptance Criteria:                                                                                                                                                                                             
  - Entry animation: dropdown with all animation types + "None"
  - Exit animation: same dropdown                                                                                                                                                                                  
  - Duration slider: 0.1s – 2.0s (converted to frames using project FPS)
  - Easing selector: linear, ease-in, ease-out, ease-in-out, spring                                                                                                                                                
  - Changes reflected immediately in the Remotion Player preview                                                                                                                                                   
  - Changes produce Immer patches (undoable)                                                                                                                                                                       
  - Panel section collapsed by default; expands on click                                                                                                                                                           
                                                                                                                                                                                                                   
  Dependencies: Remotion animation implementation
  Effort: S                                                                                                                                                                                                        
                  
  ---                                                                                                                                                                                                              
  [FE] Transition Picker on Timeline
                                    
  Description: Between two adjacent clips on the same track, show a small "+" icon on hover. Clicking opens a transition picker dropdown. Selecting a transition adds it to the track's transitions array. The
  timeline visually indicates transitions with a diamond/overlap marker between clips. Double-clicking the marker opens duration/easing controls.                                                                  
  
  Acceptance Criteria:                                                                                                                                                                                             
  - "+" icon appears on hover between adjacent clips on same track
  - Transition picker shows: None, Crossfade, Wipe Left, Wipe Right, Dissolve, Slide Push                                                                                                                          
  - Selected transition shown as a diamond icon between clips on timeline                
  - Clips visually overlap by transition duration on the timeline                                                                                                                                                  
  - Double-click transition marker opens duration/easing popover                                                                                                                                                   
  - Removing transition restores clip positions (undo via Immer)                                                                                                                                                   
  - Works for video, image, and audio tracks                                                                                                                                                                       
                                                                                                                                                                                                                   
  Dependencies: Remotion transition implementation                                                                                                                                                                 
  Effort: M                                                                                                                                                                                                        
                  
  ---
  [BE] Auto-Animation Generation Endpoint
                                                                                                                                                                                                                   
  Description: Build POST /projects/:id/auto-animate that analyzes the project's clips and automatically suggests/applies animations and transitions. Uses GPT-4 to analyze clip types, durations, and content (via
   thumbnail descriptions) and returns recommended animations for each clip and transitions between adjacent clips. The endpoint can either return suggestions (dry-run) or apply them directly.                   
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Accepts { mode: 'suggest' | 'apply', style: 'energetic' | 'calm' | 'professional' | 'cinematic' }
  - suggest mode: returns { clips: [{ clipId, entryAnimation, exitAnimation }], transitions: [{ afterClipId, transition }] } without modifying project                                                             
  - apply mode: updates the project document with suggestions and creates a new version                                                               
  - GPT-4 prompt includes clip count, types, durations, and style preference                                                                                                                                       
  - Animations match the requested style (e.g., "energetic" = bounces + fast slides; "calm" = slow fades)                                                                                                          
  - Rate-limited: 5 requests per project per hour                                                                                                                                                                  
                                                                                                                                                                                                                   
  Dependencies: Animation schema, OpenAI provider (Epic 8)                                                                                                                                                         
  Effort: M                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  Summary — Epic 11

  ┌────────────────────────────────────┬─────────────┬────────┬──────────────────────────┐
  │               Ticket               │    Area     │ Effort │        Depends On        │
  ├────────────────────────────────────┼─────────────┼────────┼──────────────────────────┤
  │ Animation + Transition schemas     │ Schema      │ S      │ None                     │
  ├────────────────────────────────────┼─────────────┼────────┼──────────────────────────┤
  │ Clip animations in Remotion        │ FE/Remotion │ M      │ Schema                   │                                                                                                                         
  ├────────────────────────────────────┼─────────────┼────────┼──────────────────────────┤                                                                                                                         
  │ Transitions between clips          │ FE/Remotion │ L      │ Schema + animations      │                                                                                                                         
  ├────────────────────────────────────┼─────────────┼────────┼──────────────────────────┤                                                                                                                         
  │ Animation inspector panel          │ FE          │ S      │ Remotion animations      │
  ├────────────────────────────────────┼─────────────┼────────┼──────────────────────────┤                                                                                                                         
  │ Transition picker on timeline      │ FE          │ M      │ Remotion transitions     │
  ├────────────────────────────────────┼─────────────┼────────┼──────────────────────────┤                                                                                                                         
  │ Auto-animation generation endpoint │ BE          │ M      │ Schema + OpenAI provider │
  └────────────────────────────────────┴─────────────┴────────┴──────────────────────────┘

  Build order: Schema first (unblocks everything). Remotion clip animations next (simpler than transitions). Transitions are the hardest — spike the overlap rendering pattern early. FE panels can develop with   
  mock data. Auto-animate endpoint is independent and can be built once the schema is stable.
                                                                                                                                                                                                                   
  ---             
  EPIC 12 — Polish, Performance & Production Readiness

  ---
  [INFRA] Production Deployment Configuration
                                                                                                                                                                                                                   
  Description: Set up production deployment: Docker images for API, web-editor (static build + nginx), render-worker, media-worker. CI/CD pipeline (GitHub Actions) for build, test, lint, and deploy. Environment
  variable management. Health check endpoints. Logging with structured JSON output.                                                                                                                                
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Multi-stage Dockerfiles for all 4 apps (build + slim runtime)
  - docker-compose.prod.yml with production defaults                                                                                                                                                               
  - GitHub Actions workflow: lint → test → build → push images
  - GET /health endpoint on API returning { status, version, uptime }                                                                                                                                              
  - Structured JSON logging (not console.log) in all apps                                                                                                                                                          
  - Graceful shutdown handlers for all workers                                                                                                                                                                     
                                                                                                                                                                                                                   
  Dependencies: None                                                                                                                                                                                               
  Effort: M                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [BE] Rate Limiting, CORS, and Security Hardening
                                                  
  Description: Replace the existing placeholder CORS and rate-limit configs with production-ready settings. Add Helmet CSP headers, CORS whitelist per environment, per-route rate limits, request body size
  limits, and SQL injection prevention audit.                                                                                                                                                                      
  
  Acceptance Criteria:                                                                                                                                                                                             
  - CORS whitelist from environment variable (no * in production)
  - Helmet CSP configured for Remotion Player requirements (blob:, data:)                                                                                                                                          
  - Per-route rate limits: auth endpoints (stricter), generation endpoints (moderate), CRUD (relaxed)
  - Request body limit: 10MB for JSON, rejection for larger                                                                                                                                                        
  - All SQL queries use parameterized queries (audit existing code)                                                                                                                                                
  - HTTPS-only cookies in production                                                                                                                                                                               
                                                                                                                                                                                                                   
  Dependencies: Auth (Epic 7)                                                                                                                                                                                      
  Effort: S                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [FE] Error Boundaries + Offline Indicator
                                                                                                                                                                                                                   
  Description: Add React error boundaries around each major panel (Asset Browser, Timeline, Preview, Inspector) so a crash in one panel doesn't take down the entire editor. Add a network status indicator in the
  TopBar that warns when the user goes offline and queues saves for when they reconnect.                                                                                                                           
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Error boundary per panel with "Something went wrong" fallback + retry button
  - Errors logged to console with component stack                                                                                                                                                                  
  - Network offline: TopBar shows "Offline — changes saved locally" banner
  - Auto-save pauses when offline; resumes and flushes on reconnect                                                                                                                                                
  - "Reconnected" toast when network returns                                                                                                                                                                       
                                                                                                                                                                                                                   
  Dependencies: None                                                                                                                                                                                               
  Effort: S                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---
  [FE] Keyboard Shortcuts Summary + Help Modal                                                                                                                                                                     
                                              
  Description: Build a keyboard shortcuts help modal (triggered by ? key or Help menu). Lists all available shortcuts grouped by category: Playback, Timeline, Clips, General. This documents existing shortcuts
  and new ones added across epics.                                                                                                                                                                                 
  
  Acceptance Criteria:                                                                                                                                                                                             
  - ? key opens the modal (when not in a text input)
  - Categories: Playback (Space, Left/Right, Home), Timeline (Ctrl+Z, Ctrl+Shift+Z, Delete), General (Ctrl+S save, Ctrl+E export)                                                                                  
  - Styled consistently with existing modals (dark theme, SURFACE_ELEVATED)                                                      
  - Dismissible via Escape or backdrop click                                                                                                                                                                       
                                                                                                                                                                                                                   
  Dependencies: None                                                                                                                                                                                               
  Effort: XS                                                                                                                                                                                                       
                  
  ---
  Summary — Epic 12
                                                                                                                                                                                                                   
  ┌──────────────────────────────────────┬───────┬────────┬───────────────┐
  │                Ticket                │ Area  │ Effort │  Depends On   │                                                                                                                                        
  ├──────────────────────────────────────┼───────┼────────┼───────────────┤
  │ Production deployment config         │ INFRA │ M      │ None          │
  ├──────────────────────────────────────┼───────┼────────┼───────────────┤
  │ Security hardening                   │ BE    │ S      │ Auth (Epic 7) │
  ├──────────────────────────────────────┼───────┼────────┼───────────────┤                                                                                                                                        
  │ Error boundaries + offline indicator │ FE    │ S      │ None          │
  ├──────────────────────────────────────┼───────┼────────┼───────────────┤                                                                                                                                        
  │ Keyboard shortcuts help modal        │ FE    │ XS     │ None          │
  └──────────────────────────────────────┴───────┴────────┴───────────────┘

  ---                                                                                                                                                                                                              
  Overall Summary Table
                                                                                                                                                                                                                   
  ┌──────┬────────────────────────────┬─────────┬────────────────┬─────────────────────────────┐
  │ Epic │           Title            │ Tickets │  Total Effort  │          Key Risk           │                                                                                                                   
  ├──────┼────────────────────────────┼─────────┼────────────────┼─────────────────────────────┤
  │ 7    │ Auth & User Management     │ 8       │ ~M×4, S×4      │ OAuth provider setup        │                                                                                                                   
  ├──────┼────────────────────────────┼─────────┼────────────────┼─────────────────────────────┤
  │ 8    │ AI Generation Integrations │ 4       │ L×1, M×1, XS×1 │ Multiple external APIs      │                                                                                                                   
  ├──────┼────────────────────────────┼─────────┼────────────────┼─────────────────────────────┤                                                                                                                   
  │ 9    │ Text-to-Video Pipeline     │ 3       │ L×1, M×2       │ Multi-step orchestration    │                                                                                                                   
  ├──────┼────────────────────────────┼─────────┼────────────────┼─────────────────────────────┤                                                                                                                   
  │ 10   │ Social Publishing          │ 5       │ L×3, S×2       │ Platform API review process │
  ├──────┼────────────────────────────┼─────────┼────────────────┼─────────────────────────────┤                                                                                                                   
  │ 11   │ Animations & Transitions   │ 6       │ L×1, M×3, S×2  │ Remotion overlap rendering  │
  ├──────┼────────────────────────────┼─────────┼────────────────┼─────────────────────────────┤                                                                                                                   
  │ 12   │ Polish & Production        │ 4       │ M×1, S×2, XS×1 │ Deployment infra            │
  └──────┴────────────────────────────┴─────────┴────────────────┴─────────────────────────────┘                                                                                                                   
                  
  Recommended Build Order                                                                                                                                                                                          
                  
  Phase 2A (Weeks 1–3):
    [Epic 7]  Auth & User Management — unblocks everything                                                                                                                                                         
    [Epic 12] Production deployment (parallel, INFRA-only)                                                                                                                                                         
                                                                                                                                                                                                                   
  Phase 2B (Weeks 3–6):                                                                                                                                                                                            
    [Epic 8]  AI Generation Integrations — spike Replicate + OpenAI first                                                                                                                                          
    [Epic 11] Animations & Transitions — schema + Remotion work (parallel with Epic 8 BE)                                                                                                                          
                                                                                                                                                                                                                   
  Phase 2C (Weeks 6–9):                                                                                                                                                                                            
    [Epic 9]  Text-to-Video Pipeline — requires Epic 8 providers                                                                                                                                                   
    [Epic 10] Social Publishing Phase 1 — YouTube only (parallel with Epic 9)                                                                                                                                      
   
  Phase 2D (Weeks 9–12):                                                                                                                                                                                           
    [Epic 10] Social Publishing Phase 2 — TikTok + Instagram
    [Epic 12] Security hardening, error boundaries, polish                                                                                                                                                         
                                                                                                                                                                                                                   
  Rationale: Auth is the #1 blocker — nothing goes to production without it. AI integrations (Epic 8) and animations (Epic 11) can be parallelized because they don't depend on each other. Text-to-Video (Epic 9) 
  is the flagship differentiator but requires providers to be stable first. Social publishing is the hardest epic due to platform review processes — start YouTube early but expect TikTok/Instagram to take       
  longer.