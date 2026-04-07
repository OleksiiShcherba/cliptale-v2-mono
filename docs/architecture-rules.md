# AI Video Editor — Architecture & Code Standards
> Written for AI coding agents working alongside developers. Every rule is explicit and actionable. Vague guidance does not appear here.

---

## 1. Project Overview

This project is a browser-based AI video editor powered by Remotion. Users upload media assets, compose multi-track video projects in a timeline UI, apply AI-generated captions via Whisper transcription, and export final renders via a background pipeline. The product targets non-technical creators while maintaining developer-grade internals: all project state is a typed document, rendering is programmatic via Remotion, and every edit is versioned and revertible.

The codebase is a monorepo (`apps/` + `packages/`) managed with Turborepo. TypeScript is required everywhere — no plain JS files. AI coding agents must treat this document as the authoritative source of truth for where code belongs, how it is named, and what patterns are used.

---

## 2. Tech Stack Summary

| Technology | Role | Reason |
|---|---|---|
| **React 18** | Web editor UI (`apps/web-editor/`) | Component model; hooks for UI logic; `useSyncExternalStore` for granular subscriptions |
| **TypeScript (strict)** | All packages and apps | Shared types across browser, API, and render worker; catches schema drift at compile time |
| **Remotion** | Composition rendering (`packages/remotion-comps/`) | Programmatic video in React; same components used for browser preview and server-side render |
| **Node.js + Express** | API/BFF (`apps/api/`) | Auth, project CRUD, presigned URL issuance, job submission |
| **MySQL (InnoDB)** | Primary database | ACID transactions for version snapshot writes; JSON column type for document storage |
| **BullMQ + Redis** | Job queue | Async ingest, transcription, and render jobs with retry and backoff |
| **Object Storage (S3/R2)** | Asset and render output storage | Presigned URL upload/download; assets never route through API server |
| **Turborepo** | Monorepo task orchestration | Caching of build/lint/test tasks across packages |
| **Immer** | Immutable state patches | `produceWithPatches` for undo/redo history; patches persisted to DB alongside snapshots |
| **Zod** | Runtime schema validation | Validates project documents at API boundary; shared between frontend and backend |
| **BullMQ** | Background job queue | Media ingest, Whisper transcription, and Remotion SSR render jobs |
| **OpenAI Whisper** | AI transcription | Word-level timestamps for caption track generation |
| **Vitest** | Unit testing | Works natively with TypeScript and ESM; fast for monorepo setups |
| **Playwright** | E2E testing | Cross-browser; handles editor canvas and upload flows |
| **ESLint + Prettier** | Code quality | Enforced in CI; no manual formatting debates |

---

## 3. Folder Structure

### Monorepo Root

```
/
├── apps/
│   ├── web-editor/         # Browser-based timeline editor (React SPA)
│   ├── api/                # Node.js Express API / BFF
│   ├── render-worker/      # Remotion SSR render job handler
│   └── media-worker/       # FFprobe/FFmpeg ingest + waveform job handler
├── packages/
│   ├── project-schema/     # Zod schemas + TypeScript types for ProjectDoc
│   ├── editor-core/        # Timeline engine, selection, command model, Immer patch logic
│   ├── remotion-comps/     # All Remotion compositions — shared by Player and render worker
│   ├── api-contracts/      # OpenAPI spec + auto-generated TypeScript client
│   └── ui/                 # Shared React UI components (panels, controls, tokens)
├── docs/
│   └── ai/
│       ├── architecture-rules.md    # This document (symlinked or copied here)
│       ├── remotion-system-prompt.txt  # Official Remotion LLM system prompt
│       └── api-openapi.md           # How to update OpenAPI + regenerate client
├── turbo.json              # Turborepo pipeline config
├── package.json            # Root workspace manifest
└── .env.example            # Template for required environment variables (no secrets)
```

### `apps/web-editor/`

```
apps/web-editor/
├── src/
│   ├── features/
│   │   ├── asset-manager/
│   │   │   ├── components/         # AssetBrowserPanel, UploadDropzone, AssetCard
│   │   │   ├── hooks/              # useAssetUpload, useAssetPolling
│   │   │   ├── api.ts              # API calls scoped to asset management
│   │   │   └── types.ts            # Feature-local types (not in project-schema)
│   │   ├── timeline/
│   │   │   ├── components/         # TimelineRuler, TrackList, ClipBlock, PlayheadLine
│   │   │   ├── hooks/              # useClipDrag, useClipTrim, useSnapping
│   │   │   ├── api.ts              # Partial clip update calls
│   │   │   └── types.ts
│   │   ├── captions/
│   │   │   ├── components/         # CaptionEditorPanel, CaptionClip
│   │   │   ├── hooks/              # useCaptionEditor, useTranscriptionStatus
│   │   │   └── api.ts
│   │   ├── preview/
│   │   │   ├── components/         # PreviewPanel, PlaybackControls
│   │   │   └── hooks/              # usePlaybackControls, useRemotionPlayer
│   │   ├── version-history/
│   │   │   ├── components/         # VersionHistoryPanel, RestoreModal
│   │   │   └── api.ts
│   │   └── export/
│   │       ├── components/         # ExportModal, RenderProgressBar
│   │       └── api.ts
│   ├── store/
│   │   ├── project-store.ts        # useSyncExternalStore-based external store for ProjectDoc
│   │   ├── ephemeral-store.ts      # UI-only state: selectedClipIds, playheadFrame, zoom
│   │   └── history-store.ts        # Immer patch stack for local undo/redo
│   ├── lib/
│   │   ├── api-client.ts           # Configured fetch wrapper using api-contracts client
│   │   ├── config.ts               # Central env var access — ONLY file that reads import.meta.env
│   │   └── remotion-env.ts         # useRemotionEnvironment helper for dual-mode components
│   ├── shared/
│   │   ├── components/             # Re-exports from packages/ui + any editor-specific shared UI
│   │   ├── hooks/                  # Cross-feature React hooks (e.g. useWindowWidth)
│   │   └── utils/                  # formatTimecode, pxToFrame, frameToPx
│   ├── App.tsx                     # Root app shell: QueryClient provider + two-column layout
│   └── main.tsx                    # Entry point: ReactDOM.createRoot → mounts <App />
├── index.html
└── vite.config.ts
```

### `apps/api/`

```
apps/api/
├── src/
│   ├── routes/
│   │   ├── assets.routes.ts        # POST /assets/upload-url, POST /assets/:id/finalize
│   │   ├── projects.routes.ts      # CRUD for projects
│   │   ├── versions.routes.ts      # POST /versions, GET /versions, POST /versions/:id/restore
│   │   ├── captions.routes.ts      # POST /assets/:id/transcribe, GET /assets/:id/captions
│   │   └── renders.routes.ts       # POST /projects/:id/render, GET /renders/:id/progress
│   ├── controllers/
│   │   ├── assets.controller.ts    # Thin: parse request → call service → return response
│   │   ├── projects.controller.ts
│   │   ├── versions.controller.ts
│   │   └── renders.controller.ts
│   ├── services/
│   │   ├── asset.service.ts        # Business logic: presigned URL generation, finalization
│   │   ├── project.service.ts      # Business logic: create/update/delete project
│   │   ├── version.service.ts      # Business logic: snapshot write, optimistic lock, rollback
│   │   ├── caption.service.ts      # Business logic: enqueue transcription, return segments
│   │   └── render.service.ts       # Business logic: enqueue render job, poll progress
│   ├── repositories/
│   │   ├── asset.repository.ts     # All SQL touching project_assets_current
│   │   ├── project.repository.ts   # All SQL touching projects table
│   │   ├── version.repository.ts   # All SQL touching project_versions, project_version_patches
│   │   └── caption.repository.ts   # All SQL touching caption_tracks
│   ├── middleware/
│   │   ├── auth.middleware.ts      # JWT validation; attaches req.user
│   │   ├── acl.middleware.ts       # Project ownership and role checks
│   │   └── validate.middleware.ts  # Zod schema validation of req.body
│   ├── db/
│   │   ├── connection.ts           # mysql2 pool; the ONLY file that creates DB connections
│   │   └── migrations/             # Numbered SQL migration files (001_initial.sql, etc.)
│   ├── queues/
│   │   ├── bullmq.ts               # BullMQ Queue and Worker setup; connection config
│   │   └── jobs/
│   │       └── enqueue-ingest.ts   # Typed job enqueue helpers (not job handlers)
│   ├── lib/
│   │   ├── errors.ts               # Typed error classes (ValidationError, NotFoundError, …)
│   │   └── s3.ts                   # Singleton S3Client configured from config
│   ├── types/
│   │   └── express.d.ts            # Express Request augmentation (req.user)
│   └── config.ts                   # Central env var access — ONLY file that reads process.env
└── index.ts                        # Express app entry point
```

### `apps/render-worker/` and `apps/media-worker/`

```
apps/render-worker/
├── src/
│   ├── jobs/
│   │   └── render.job.ts           # BullMQ job handler: Remotion SSR → object storage upload
│   ├── lib/
│   │   └── remotion-renderer.ts    # Wrapper around @remotion/renderer renderMedia()
│   └── index.ts                    # Worker entry point; registers BullMQ worker
```

```
apps/media-worker/
├── src/
│   ├── jobs/
│   │   ├── ingest.job.ts           # FFprobe metadata + thumbnail + waveform generation
│   │   └── transcribe.job.ts       # Whisper API call + segment storage
│   ├── lib/
│   │   ├── s3.ts                   # Singleton S3Client configured from config
│   │   └── db.ts                   # mysql2 pool for updating project_assets_current
│   └── index.ts                    # Worker entry point; wires BullMQ worker + job handlers
```

### `packages/remotion-comps/`

```
packages/remotion-comps/
├── src/
│   ├── compositions/
│   │   └── VideoComposition.tsx    # Root composition; accepts ProjectDoc as inputProps
│   ├── layers/
│   │   ├── VideoLayer.tsx          # Dual-mode: <Video> in browser, <OffthreadVideo> in SSR
│   │   ├── AudioLayer.tsx
│   │   ├── ImageLayer.tsx
│   │   └── TextOverlayLayer.tsx    # Used for captions and text overlays
│   ├── hooks/
│   │   └── useRemotionEnvironment.ts  # Detects browser vs SSR render context
│   └── index.ts                    # Re-exports all public compositions and layers
├── .storybook/
└── package.json
```

### `packages/project-schema/`

```
packages/project-schema/
├── src/
│   ├── schemas/
│   │   ├── project-doc.schema.ts   # Zod schema for ProjectDoc root
│   │   ├── clip.schema.ts          # Zod schemas for VideoClip, AudioClip, TextOverlayClip
│   │   └── track.schema.ts
│   ├── types/
│   │   └── index.ts                # TypeScript types inferred from Zod schemas
│   └── index.ts
└── package.json
```

---

## 4. Architecture & Design Patterns

### Primary Pattern: Layered Architecture + Feature-Sliced Frontend

The system follows a strict layered architecture:

```
Browser (web-editor)
  └── features/[name]/components   ← Render only; receive data via props or hooks
  └── features/[name]/hooks        ← UI state orchestration; calls services or store
  └── store/                       ← External stores (project doc, ephemeral UI, history)
  └── lib/api-client.ts            ← HTTP calls; wraps generated api-contracts client

API (apps/api)
  └── routes/        ← HTTP routing only; no logic
  └── controllers/   ← Request parsing → service call → response formatting
  └── services/      ← All business logic lives here
  └── repositories/  ← All SQL lives here; services call repositories, never raw DB

Workers (render-worker, media-worker)
  └── jobs/          ← BullMQ job handlers; call services or external APIs directly

Shared packages
  └── project-schema   ← Single source of truth for ProjectDoc shape
  └── remotion-comps   ← Rendering layer; consumed by web-editor Player and render-worker
  └── api-contracts    ← OpenAPI-generated client; consumed by web-editor
```

### Dependency Rules (enforced, not optional)

- `components` MUST NOT import from `services/`, `repositories/`, or `db/`.
- `services` MUST NOT import from `routes/` or `controllers/`.
- `repositories` MUST NOT contain business logic — only SQL and mapping.
- `routes` MUST NOT contain business logic — call a controller method, nothing else.
- `remotion-comps` MUST NOT import from `web-editor`, `api`, or any `apps/` package.
- `project-schema` MUST NOT import from any `apps/` or other `packages/`.
- Any package importing `project-schema` types is allowed. Any package importing another app is forbidden.

### Remotion Dual-Mode Rendering

Remotion compositions in `packages/remotion-comps/` must work in two environments:

1. **Browser (Player)**: `<Video>` is used; media is streamed by the browser.
2. **SSR Render (render-worker)**: `<OffthreadVideo>` is used; frames are extracted by FFmpeg.

The `useRemotionEnvironment` hook in `packages/remotion-comps/src/hooks/useRemotionEnvironment.ts` detects the render context. `VideoLayer.tsx` calls this hook and switches primitives accordingly. Never use `<OffthreadVideo>` in browser context and never use `<Video>` in SSR context.

```
// CORRECT — VideoLayer.tsx
const { isRendering } = useRemotionEnvironment();
return isRendering
  ? <OffthreadVideo src={src} />
  : <Video src={src} />;

// WRONG — never hardcode one or the other in a shared composition
return <OffthreadVideo src={src} />;  // ← breaks browser Player
return <Video src={src} />;           // ← breaks render-worker SSR
```

---

## 5. Business Logic Placement

**Business logic is defined as:** domain rules, calculations, validation, data transformations, and workflow decisions (e.g. "does this asset's content type pass validation?", "what is the frame range of a trimmed clip?", "should a new version snapshot be created?").

### Where business logic MUST live

| Context | Location |
|---|---|
| API | `apps/api/src/services/*.service.ts` |
| Workers | `apps/render-worker/src/jobs/*.job.ts` or `apps/media-worker/src/jobs/*.job.ts` |
| Browser (non-UI) | `packages/editor-core/src/` — timeline math, snap calculations, Immer patch generation |

### Where business logic MUST NOT live

- NEVER in `routes/*.routes.ts` (routes only register handlers)
- NEVER in `controllers/*.controller.ts` (controllers only parse request and call service)
- NEVER in `repositories/*.repository.ts` (repositories only run SQL)
- NEVER in React components (`features/*/components/*.tsx`)
- NEVER in Remotion compositions (`packages/remotion-comps/`)

### Examples

```typescript
// CORRECT — version.service.ts
async function saveProjectVersion(projectId: string, doc: ProjectDoc, parentVersionId: number) {
  validateDocSchemaVersion(doc); // ← business rule: schema version must match
  const current = await versionRepository.getLatestVersionId(projectId);
  if (current !== parentVersionId) {
    throw new OptimisticLockError('Version conflict'); // ← business rule: optimistic lock
  }
  return versionRepository.insertVersionTransaction(projectId, doc, parentVersionId);
}

// WRONG — version.controller.ts
async function saveVersion(req, res) {
  const current = await db.query('SELECT latest_version_id FROM projects WHERE ...');
  if (current.rows[0].latest_version_id !== req.body.parentVersionId) { // ← logic in controller
    return res.status(409).json({ error: 'conflict' });
  }
}
```

---

## 6. UI Logic Placement

**UI logic is defined as:** display state, form field state, conditional rendering decisions, animation triggers, drag interaction state, modal open/close, selected clip IDs, current zoom level, and playhead position.

### Where UI logic MUST live

| Type | Location |
|---|---|
| Component-local display state | `useState` inside the component |
| Cross-component editor UI state (zoom, selection, playhead) | `store/ephemeral-store.ts` (external store via `useSyncExternalStore`) |
| Reusable UI interaction logic (drag, resize, polling) | `features/[name]/hooks/use*.ts` |
| Undo/redo patch stack | `store/history-store.ts` |

### Where UI logic MUST NOT live

- NEVER in services (e.g. do not track "isLoading" inside a service function)
- NEVER in Remotion compositions (compositions are pure render functions that accept props)
- NEVER in `packages/project-schema/` or `packages/editor-core/`

### Example — extracting to a hook vs keeping inline

Keep inline when: the logic is a single `useState` used only in that component and has no reuse candidate.

Extract to a hook when: the logic involves multiple state variables, side effects, or is used in more than one component.

```typescript
// CORRECT — simple, keep inline
function AssetCard({ asset }) {
  const [isHovered, setIsHovered] = useState(false);
  return <div onMouseEnter={() => setIsHovered(true)} ... />;
}

// CORRECT — extract because upload involves multiple states + side effects
function UploadDropzone() {
  const { uploadFile, progress, error, isUploading } = useAssetUpload();
  return <div onDrop={(e) => uploadFile(e.dataTransfer.files[0])} ... />;
}
// useAssetUpload lives in features/asset-manager/hooks/useAssetUpload.ts
```

---

## 7. State Management

### Three state categories

**1. Server state** (data fetched from API, remote truth)
- Tool: React Query (`@tanstack/react-query`)
- Examples: asset list, version history, render job status, caption segments
- Place query hooks in `features/[name]/hooks/use[Resource].ts`
- Never manually set server state in component — always invalidate queries after mutations

**2. Global editor state** (project document, selection, playhead, zoom)
- Tool: `useSyncExternalStore` with a hand-rolled external store
- `store/project-store.ts` — holds the authoritative `ProjectDoc` in memory; all Immer patches are applied here; changes trigger subscribers
- `store/ephemeral-store.ts` — holds `selectedClipIds: string[]`, `playheadFrame: number`, `zoom: number`; NOT persisted
- `store/history-store.ts` — holds `patches: Patch[][]` and `inversePatches: Patch[][]` for undo/redo

**3. Component-local UI state**
- Tool: `useState`, `useReducer` inside the component
- Examples: modal open/close, hover state, file picker selection

### Anti-patterns to avoid

- NEVER put `ProjectDoc` in React component state (`useState`) — it will cause full-tree re-renders on every edit.
- NEVER store server state in the ephemeral store — that creates two sources of truth.
- NEVER call `queryClient.setQueryData` to update server state after a mutation — call `queryClient.invalidateQueries` instead.
- NEVER update `playheadFrame` via React state during rAF playback loop — mutate the CSS custom property `--playhead-x` directly on the timeline DOM node; only commit frame to the store on pause.

---

## 8. API & Data Layer

### API call location

All HTTP calls from the frontend MUST be made through the generated API client in `packages/api-contracts/`. Import the typed client in `lib/api-client.ts` and configure base URL and auth headers there. Feature-level `api.ts` files call `lib/api-client.ts` — they never call `fetch` directly.

```
// CORRECT — features/asset-manager/api.ts
import { apiClient } from '@/lib/api-client';

export async function requestUploadUrl(payload: UploadUrlRequest) {
  return apiClient.assets.createUploadUrl(payload);
}

// WRONG — calling fetch directly in a feature
const res = await fetch('/api/assets/upload-url', { ... }); // ← bypass typed client
```

### API layer (Node.js)

- Routes: `apps/api/src/routes/*.routes.ts` — register Express router, apply middleware, call controller method.
- Controllers: `apps/api/src/controllers/*.controller.ts` — parse `req`, call one service method, return `res.json(...)`.
- Services: `apps/api/src/services/*.service.ts` — all logic; call repositories; call external APIs (Whisper, S3); enqueue jobs.
- Repositories: `apps/api/src/repositories/*.repository.ts` — all SQL via `mysql2`; return typed results; never throw HTTP errors.

### Error propagation

Services throw typed error classes (e.g. `NotFoundError`, `OptimisticLockError`, `ValidationError`). Controllers catch these and map to HTTP status codes. Repositories throw only on DB failure. API responses to clients never include stack traces or raw MySQL errors.

```typescript
// CORRECT — error flow
// repository.ts
async function getProject(id: string): Promise<Project> {
  const [rows] = await pool.query('SELECT ...', [id]);
  if (!rows.length) throw new NotFoundError(`Project ${id} not found`);
  return rows[0] as Project;
}

// controller.ts
async function getProjectHandler(req, res, next) {
  try {
    const project = await projectService.getProject(req.params.id);
    res.json(project);
  } catch (err) {
    next(err); // ← centralized error handler maps to HTTP status
  }
}
```

### Loading, error, and empty states

Every React Query hook must be accompanied by all three state renders in the component:

```typescript
const { data, isLoading, isError } = useAssets(projectId);
if (isLoading) return <AssetBrowserSkeleton />;
if (isError) return <ErrorState message="Could not load assets" />;
if (!data?.length) return <AssetBrowserEmpty />;
return <AssetList assets={data} />;
```

---

## 9. Coding Style & Naming Conventions

### File and folder naming

- Folders: `kebab-case` always (e.g. `asset-manager/`, `version-history/`)
- React component files: `PascalCase.tsx` (e.g. `AssetCard.tsx`, `TimelineRuler.tsx`)
- Hook files: `camelCase.ts` prefixed with `use` (e.g. `useClipDrag.ts`)
- Service files: `camelCase.service.ts` (e.g. `asset.service.ts`)
- Repository files: `camelCase.repository.ts`
- Controller files: `camelCase.controller.ts`
- Route files: `camelCase.routes.ts`
- Schema files: `camelCase.schema.ts`
- Utility files: `camelCase.ts` with no suffix (e.g. `formatTimecode.ts`)

### Component naming

Components are named as nouns or noun phrases describing what they render: `AssetCard`, `TimelineRuler`, `CaptionEditorPanel`. Never abbreviate to the point of ambiguity (`AEP` is forbidden; `CaptionEditorPanel` is required).

### Function naming

All functions use verb-first names:

- Getters: `getProjectById`, `getAssets`, `getLatestVersionId`
- Handlers: `handleClipDrop`, `handleUploadStart`, `handleRestoreVersion`
- Formatters: `formatTimecode`, `formatFileSize`, `formatRelativeDate`
- Boolean checks: `isAssetReady`, `hasEditPermission`, `canTrim`
- Enqueuers: `enqueueIngestJob`, `enqueueRenderJob`

### Variable naming

- Booleans: `isLoading`, `isRendering`, `hasError`, `canUndo`, `isMuted`
- Arrays: plural nouns — `clips`, `tracks`, `assets`, `segments`
- Constants: `UPPER_SNAKE_CASE` for module-level constants — `MAX_UPLOAD_SIZE_BYTES`, `DEFAULT_FPS`
- Event callbacks: prefix with `on` when passed as a prop — `onClipSelect`, `onUploadComplete`

### TypeScript types and interfaces

Use the `type` keyword, not `interface`, for all domain types. Do not use `I` prefix or `Type` suffix. Name types as plain nouns: `ProjectDoc`, `Clip`, `Track`, `Asset`, `CaptionSegment`.

Use `interface` only for React component prop shapes, suffixed with `Props`: `AssetCardProps`, `ClipBlockProps`.

```typescript
// CORRECT
type ProjectDoc = z.infer<typeof projectDocSchema>;
interface AssetCardProps { asset: Asset; onSelect: (id: string) => void; }

// WRONG
interface IProjectDoc { ... }
type AssetCardPropsType = { ... };
```

### Import ordering

```typescript
// 1. Node built-ins
import path from 'path';

// 2. External packages
import { useQuery } from '@tanstack/react-query';
import { produce } from 'immer';

// 3. Internal monorepo packages (workspace:*)
import type { ProjectDoc } from '@ai-video-editor/project-schema';

// 4. App-internal absolute imports
import { apiClient } from '@/lib/api-client';

// 5. Relative imports
import { ClipBlock } from './ClipBlock';
```

Always place a blank line between each group. Never mix groups on the same line.

### Absolute imports (`@/`) — mandatory for all apps

Every `apps/*` package **must** use the `@/` alias for intra-app imports. Relative imports that cross directory boundaries (e.g. `../../config.js`) are **forbidden**; only same-folder relative imports (e.g. `./ClipBlock`) are allowed.

```typescript
// CORRECT — absolute alias for anything outside the current folder
import { config } from '@/config.js';
import { assetRepository } from '@/repositories/asset.repository.js';

// WRONG — relative imports crossing directory boundaries
import { config } from '../../config.js';
import { assetRepository } from '../repositories/asset.repository.js';
```

**Required setup in every `apps/*` tsconfig.json:**
```json
{
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  }
}
```

**Required devDependency and build script** (TypeScript does not rewrite aliases in output — `tsc-alias` does):
```json
{
  "devDependencies": { "tsc-alias": "^1.8.0" },
  "scripts": { "build": "tsc && tsc-alias" }
}
```

`tsx` resolves `@/` natively during dev (`tsx watch src/index.ts`) — no extra config needed for the dev workflow. The `tsc-alias` step is only needed for the compiled `dist/` output used in production.

### File length

Files MUST NOT exceed 300 lines. When a file exceeds this, extract the next logical unit (a hook, a sub-component, a helper function) into a new file in the same folder.

#### Split test file naming convention

When a test file for `foo.ts` would exceed 300 lines, split it into multiple co-located files using a multi-part suffix that describes the test group:

- `foo.test.ts` — primary tests (initial state, core happy paths)
- `foo.seek.test.ts` — seek / navigation tests
- `foo.raf.test.ts` — animation-frame loop tests
- `foo.keyboard.test.ts` — keyboard listener tests

Shared fixture helpers (e.g. `makePlayerRef`, `makeProjectDoc`) MUST be extracted to a co-located `foo.fixtures.ts` file and imported in every split test file. Do NOT duplicate fixtures verbatim across test files.

### Comments

Write JSDoc on all exported functions and types. Write inline comments only to explain non-obvious decisions, not to describe what the code does.

```typescript
// CORRECT — explains WHY
// We mutate the CSS property directly to avoid re-rendering the full React tree at 60fps
rootRef.current.style.setProperty('--playhead-x', `${frame * pxPerFrame}px`);

// WRONG — describes WHAT (the code already says this)
// Set the playhead position
rootRef.current.style.setProperty('--playhead-x', `${frame * pxPerFrame}px`);
```

---

## 10. Testing Strategy

### Unit tests

- **Test:** service functions in `apps/api/src/services/`, middleware in `apps/api/src/middleware/`, utility functions in `packages/editor-core/`, Zod schemas in `packages/project-schema/`, custom hooks in `apps/web-editor/src/features/*/hooks/`.
- **Do NOT test:** Express route registration, React component rendering details, BullMQ worker wiring, repository SQL correctness (that is integration test territory).
- **Tool:** Vitest
- **File location:** Colocated. Test file lives next to the file under test with `.test.ts` or `.test.tsx` suffix (e.g. `version.service.test.ts` next to `version.service.ts`).

### Integration tests

- **Scope:** API endpoints end-to-end from HTTP request to DB response. Use a real MySQL test database seeded before each test suite.
- **Tool:** Vitest + `supertest`
- **Location:** `apps/api/src/__tests__/integration/`
- **Coverage target:** All endpoint happy paths + critical error paths (optimistic lock conflict, unauthorized access, invalid content type).

### E2E tests

- **Scope:** Critical user flows only: upload asset → view in asset browser; add captions to timeline; export project; restore a version.
- **Tool:** Playwright
- **Location:** `e2e/` at monorepo root
- **Run:** Only in CI on `main` branch merges; not on every PR (too slow).

### Test naming convention

```typescript
describe('version.service', () => {
  describe('saveProjectVersion', () => {
    it('throws OptimisticLockError when parentVersionId does not match current', async () => { ... });
    it('inserts a new version row and updates latest_version_id atomically', async () => { ... });
  });
});
```

### Running tests locally

#### Installing dependencies

The monorepo uses `workspace:*` in inter-package dependencies (pnpm protocol), but the declared `packageManager` is `npm`. Running `npm install` from the **root** will fail because npm does not understand `workspace:*`. Use this per-app approach instead:

```bash
# Install only one app's deps (resolves workspace:* conflict):
cd apps/api
npm install --workspaces=false

# Then run tests from that same directory:
./node_modules/.bin/vitest run                              # all unit tests in apps/api
./node_modules/.bin/vitest run src/services/               # service tests only
./node_modules/.bin/vitest run src/middleware/             # middleware tests only
./node_modules/.bin/vitest run src/services/asset.service.test.ts  # single file
```

The same pattern applies to `packages/project-schema` and other workspaces — each has its own `node_modules` after a local `npm install --workspaces=false`.

#### Integration tests (require running Docker services)

```bash
# Start DB + Redis:
docker compose up -d db redis

# Run integration tests (from apps/api after install):
./node_modules/.bin/vitest run src/__tests__/integration/
```

Integration tests talk to a real MySQL instance. If `APP_DB_PASSWORD` is non-default, pass it inline:
```bash
APP_DB_PASSWORD=cliptale ./node_modules/.bin/vitest run src/__tests__/integration/
```

#### Running tests for apps/media-worker and apps/render-worker

Same install pattern as `apps/api`:
```bash
cd apps/media-worker   # or apps/render-worker
npm install --workspaces=false
./node_modules/.bin/vitest run
```

`@ai-video-editor/project-schema` must be **built** before installing worker packages (the workers import types from its compiled output). If you get a missing module error, run `cd packages/project-schema && npm install --workspaces=false && ./node_modules/.bin/tsc` first.

#### vi.mock hoisting pitfall

`vi.mock(...)` factories are hoisted to the **top of the file** before any variable declarations. Variables declared outside the factory and referenced inside it will cause a `ReferenceError`. Use `vi.hoisted()` to declare shared mock objects that are needed by both the factory and the test body:

```typescript
// CORRECT — vi.hoisted ensures the object is available when the factory runs
const { mockStream } = vi.hoisted(() => ({
  mockStream: { on: vi.fn().mockReturnThis() },
}));

vi.mock('some-module', () => ({
  createStream: vi.fn().mockReturnValue(mockStream), // safe — mockStream is hoisted
}));

// WRONG — ReferenceError at runtime
const mockStream = { on: vi.fn() };           // declared after hoisted mock factory
vi.mock('some-module', () => ({
  createStream: vi.fn().mockReturnValue(mockStream), // ← TDZ: mockStream not yet init
}));
```

#### E2E tests (CI only)

Playwright E2E tests live in `e2e/` at the monorepo root and run only on `main` branch merges in CI. Do not run them locally unless explicitly debugging an E2E failure.

### Coverage expectations

| Layer | Target |
|---|---|
| `services/` | ≥ 85% line coverage |
| `repositories/` | Integration tests cover happy + error paths |
| `editor-core` (timeline math, snapping) | ≥ 90% |
| `remotion-comps` | Storybook stories cover all clip types; Vitest for prop validation |
| React components | No coverage target; test behavior via E2E, not implementation |

---

## 11. Security Patterns

### Authentication and authorization

- JWT validation occurs ONLY in `apps/api/src/middleware/auth.middleware.ts`. Attach `req.user` after validation.
- Project ACL checks (ownership, role) occur ONLY in `apps/api/src/middleware/acl.middleware.ts`. Apply this middleware per route, not inside services.
- NEVER check permissions inside a service or repository — the service receives a pre-authorized request.
- Worker jobs (`render-worker`, `media-worker`) are internal services; they MUST NOT be exposed via HTTP to the internet. They consume jobs from BullMQ only.

```typescript
// CORRECT — route applies both auth and acl middleware
router.post('/projects/:id/versions', authMiddleware, aclMiddleware('editor'), versionsController.save);

// WRONG — service re-checks auth
async function saveProjectVersion(userId, projectId, doc) {
  const project = await projectRepository.getProject(projectId);
  if (project.ownerUserId !== userId) throw new ForbiddenError(...); // ← ACL belongs in middleware
}
```

### Input validation

- Validate ALL incoming request bodies at the API boundary using Zod schemas in `apps/api/src/middleware/validate.middleware.ts`.
- The Zod schemas used for API validation MUST be imported from or aligned with `packages/project-schema/` where shapes overlap.
- NEVER trust client-supplied values for computed fields (e.g. do not use a client-supplied `fileSizeBytes` to skip a server-side HEAD check).

### Secrets handling

- ALL secrets (DB password, S3 keys, Whisper API key, Redis URL) are accessed ONLY through `apps/api/src/config.ts` or `apps/*/src/config.ts`.
- NEVER read `process.env.SOME_SECRET` directly in a service, repository, or route file.
- NEVER log a secret, token, or full connection string. Log only non-sensitive identifiers.
- NEVER return internal error messages or stack traces to API clients.

### Data sanitization

- Sanitize all user-supplied text (caption text, project name, asset filename) before writing to DB to prevent XSS if content is later rendered in HTML.
- Use the `DOMPurify` library (browser) and `sanitize-html` (server) for HTML-context sanitization.
- Filenames received from clients: strip path separators and limit to alphanumeric, dash, underscore, and dot before writing to storage.

### HTTP security

- Set the following headers on all API responses via the `helmet` middleware applied in `apps/api/index.ts`:
  - `Strict-Transport-Security`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Content-Security-Policy` (restrict script/media sources)
- Apply rate limiting at the Express app level using `express-rate-limit`. The `PATCH /projects/:id/clips/:clipId` endpoint has its own stricter limit (60 req/s per project).
- CORS: Allow only the web-editor origin. Configure `cors()` middleware with an explicit `origin` allowlist — never use `origin: '*'` in production.

### Presigned URL security

- Presigned upload URLs expire in 15 minutes. Never issue a URL with an expiry greater than 1 hour.
- After a presigned upload URL is used, verify the object exists in storage (HEAD request) before transitioning asset status to `processing`. Never trust the client's claim that upload succeeded.

---

## 12. Environment Configuration

### Environment files

| File | Committed? | Purpose |
|---|---|---|
| `.env.example` | YES | Template with all required variable names, no values |
| `.env` | NO | Local development overrides |
| `.env.production` | NO | Production values; injected by CI/CD platform |

### Variable naming conventions

- Frontend variables exposed to the browser: prefix `VITE_PUBLIC_` (e.g. `VITE_PUBLIC_API_BASE_URL`)
- Backend variables: prefix `APP_` (e.g. `APP_DB_HOST`, `APP_REDIS_URL`, `APP_S3_BUCKET`)
- Secret values: suffix `_SECRET` or `_KEY` (e.g. `APP_JWT_SECRET`, `APP_WHISPER_API_KEY`)

### Central config modules

All environment access is centralized. No other file in the codebase reads `process.env` or `import.meta.env`.

**API config:** `apps/api/src/config.ts`
**Web editor config:** `apps/web-editor/src/lib/config.ts`
**Render worker config:** `apps/render-worker/src/config.ts`
**Media worker config:** `apps/media-worker/src/config.ts`

### Startup validation

Each app's config module MUST validate all required env vars on boot using `zod` and call `process.exit(1)` with a descriptive error message if any are missing:

```typescript
// apps/api/src/config.ts
import { z } from 'zod';

const envSchema = z.object({
  APP_DB_HOST: z.string().min(1),
  APP_DB_PASSWORD: z.string().min(1),
  APP_JWT_SECRET: z.string().min(32),
  APP_REDIS_URL: z.string().url(),
  APP_S3_BUCKET: z.string().min(1),
  APP_WHISPER_API_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Missing required environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
```

---

## 13. CI/CD Conventions

### Pipeline stages (in order)

| Stage | Tool | Triggers failure on |
|---|---|---|
| 1. Lint | ESLint (`turbo run lint`) | Any ESLint error |
| 2. Type check | TypeScript (`turbo run type-check`) | Any type error |
| 3. Unit tests | Vitest (`turbo run test`) | Any failing test |
| 4. Build | Vite / tsc (`turbo run build`) | Build compilation failure |
| 5. Integration tests | Vitest + supertest (runs against test DB) | Any failing integration test |
| 6. E2E tests | Playwright (on `main` only) | Any failing critical flow |
| 7. Deploy | Platform-specific (Docker push + deploy) | Previous stage failure |

### Branch strategy

| Branch | Purpose | Auto-deploys to |
|---|---|---|
| `main` | Production-ready code | Production (after manual approval gate) |
| `develop` | Integration branch for features | Staging (automatically) |
| `feature/*` | Individual feature work | No auto-deploy; preview environment optional |
| `hotfix/*` | Production bug fixes | Production via accelerated pipeline |

### PR requirements before merge

- All CI stages (lint, type-check, unit tests, build) must be green.
- At least one code review approval required.
- No unresolved review comments.
- PR title must follow Conventional Commits format (e.g. `feat(timeline): add clip drag interaction`).
- PRs touching `packages/project-schema/` require a migration file in `apps/api/src/db/migrations/`.

### Secrets in CI

Secrets are injected as environment variables by the CI platform (GitHub Actions Secrets / equivalent). They MUST NOT appear in:
- Logs (mask with `::add-mask::` or equivalent)
- Source code
- `docker build` args (use runtime env injection instead)

### Deployment process

1. PR merges to `develop` → CI runs → staging auto-deploys.
2. Release PR from `develop` to `main` → manual approval → production deploy.
3. Rollback procedure: redeploy the previous Docker image tag for the affected service. Database rollbacks require running the `down` migration script manually — coordinate with tech lead.

### OpenAPI client regeneration

After any change to `packages/api-contracts/openapi.yaml`, run `turbo run generate:client` to regenerate the TypeScript client. Commit both the spec and the generated client together. CI will fail if they are out of sync (checked via `git diff --exit-code packages/api-contracts/src/generated/`).

---

## 14. Team Conventions & Workflow Notes

### PR size

Keep PRs under 400 lines of diff. If a feature requires more, split it: schema/DB changes first, then backend service, then frontend. Never combine a refactor with a feature in the same PR.

### Commit message format

Use Conventional Commits:

```
feat(captions): add inline caption editor panel
fix(timeline): correct clip snap threshold at high zoom levels
chore(deps): upgrade remotion to 4.x
db(migrations): add caption_tracks table
```

Scopes match the affected area: `timeline`, `captions`, `asset-manager`, `preview`, `export`, `version-history`, `api`, `render-worker`, `project-schema`, `remotion-comps`.

### Code review focus areas

When reviewing code in this codebase, prioritize checking:

1. Business logic is in `services/`, not `controllers/` or `routes/`.
2. All `process.env` and `import.meta.env` reads are in `config.ts` — not scattered.
3. `remotion-comps` components use `useRemotionEnvironment` to switch `<Video>` vs `<OffthreadVideo>`.
4. Immer patches are generated on every project document mutation and pushed to `history-store`.
5. Auth and ACL middleware are applied to all non-public routes.
6. No React Query server state is duplicated in `ephemeral-store`.
7. Migration files accompany any DB schema change.

### AI agent rules (critical)

AI agents working on this codebase MUST follow these rules without exception:

- Before creating a new file, verify its correct location using the folder structure in Section 3.
- Before adding a new npm dependency, check if the needed functionality already exists in a workspace package.
- All Remotion version packages (`remotion`, `@remotion/player`, `@remotion/renderer`, `@remotion/cli`) MUST remain at the same version number. Upgrading one requires upgrading all simultaneously.
- The `ProjectDoc` type is the single source of truth. If a change to the data model is needed, update `packages/project-schema/` first, then propagate to all consumers. Never define a local type that duplicates a field already in `ProjectDoc`.
- Agents MUST NOT write raw SQL in services. All SQL goes in repositories.
- Agents MUST NOT add `any` types in TypeScript. Use `unknown` and narrow, or add a proper type to the appropriate schema package.
- When adding a new BullMQ job type, add both the enqueue helper in `apps/api/src/queues/jobs/` and the handler in the appropriate worker's `src/jobs/` directory in the same PR.

### Remotion LLM system prompt

The official Remotion system prompt for LLM usage is stored at `docs/ai/remotion-system-prompt.txt`. AI agents generating Remotion composition code MUST load and apply this prompt before generating any `packages/remotion-comps/` code.

---

## 15. Local Development Environment

This section documents everything needed to run the full project stack on a local machine. The entire stack — infrastructure, API, workers, and web editor — runs inside Docker Compose. No application code needs to run on the host to use the product. An AI agent adding a new service MUST add it to `docker-compose.yml` and document it in this section.

### Prerequisites

| Tool | Minimum version | Purpose |
|---|---|---|
| Docker Desktop | 4.x | Run all containers |
| Docker Compose | v2 (bundled with Docker Desktop) | Orchestrate the full stack |
| Node.js | 20 LTS | Run unit tests and local scripts only (not needed to start the stack) |

### Services (Docker Compose)

All five services are defined in `docker-compose.yml` at the monorepo root.

| Service | Build | Local port | Purpose |
|---|---|---|---|
| `db` | `mysql:8.0` | `3306` | Primary database; auto-applies migrations from `apps/api/src/db/migrations/` on first boot |
| `redis` | `redis:7-alpine` | `6379` | BullMQ queue backend |
| `api` | `apps/api/Dockerfile` | `3001` | Express API — presigned URL issuance, finalization, job enqueue |
| `web-editor` | `apps/web-editor/Dockerfile` | `5173` | Vite dev server serving the React editor |
| `media-worker` | `apps/media-worker/Dockerfile` | — | BullMQ worker — FFprobe ingest, thumbnail, waveform |

### Startup — single command

**Step 1 — Configure S3 credentials**

Copy `.env.example` to `.env` and fill in your S3/R2 credentials. The `.env` file MUST NOT be committed.

```bash
cp .env.example .env
# Edit .env — set APP_S3_ACCESS_KEY_ID, APP_S3_SECRET_ACCESS_KEY, APP_S3_BUCKET, APP_S3_ENDPOINT
```

All other values have working defaults in `.env.example` for local development.

**Step 2 — Start the full stack**

```bash
docker compose up --build
```

Docker Compose builds all three app images, starts `db` and `redis` first, then `api` and `media-worker` (waiting for Redis healthy), then `web-editor`. The database migration runs automatically on first boot.

**Step 3 — Open the editor**

| Service | URL |
|---|---|
| Web editor (Vite) | http://localhost:5173 |
| API (Express) | http://localhost:3001 |
| DB (MySQL) | `localhost:3306` (user: `cliptale`, pass: `cliptale`, db: `cliptale`) |
| Redis | `localhost:6379` |

### `.env` reference

```bash
# ── Database ──────────────────────────────────────────────────────────────
APP_DB_HOST=localhost
APP_DB_PORT=3306
APP_DB_NAME=cliptale
APP_DB_USER=cliptale
APP_DB_PASSWORD=cliptale

# ── Redis / BullMQ ────────────────────────────────────────────────────────
APP_REDIS_URL=redis://localhost:6379

# ── Object Storage (S3 / Cloudflare R2) ──────────────────────────────────
APP_S3_ACCESS_KEY_ID=            # required
APP_S3_SECRET_ACCESS_KEY=        # required
APP_S3_BUCKET=cliptale-assets    # required
APP_S3_ENDPOINT=                 # leave blank for AWS; set for R2: https://<account>.r2.cloudflarestorage.com
APP_S3_REGION=us-east-1

# ── Auth ──────────────────────────────────────────────────────────────────
APP_JWT_SECRET=local-dev-jwt-secret-change-in-production-minimum-32-chars
APP_JWT_EXPIRES_IN=7d

# ── API server ────────────────────────────────────────────────────────────
APP_PORT=3001
APP_CORS_ORIGIN=http://localhost:5173

# ── Web editor ────────────────────────────────────────────────────────────
VITE_PUBLIC_API_BASE_URL=http://localhost:3001
```

### Database migrations

Migrations live in `apps/api/src/db/migrations/` as numbered SQL files (e.g. `001_project_assets_current.sql`). They are mounted into the MySQL container and executed automatically on the **first boot** (when the `db_data` volume is empty).

- Migration files use `CREATE TABLE IF NOT EXISTS` — safe to re-run.
- To apply a new migration to an existing volume: `docker compose restart db` does NOT re-run init scripts. Instead, exec into the container or wipe the volume (see below).
- To add a migration: create the next numbered file in `apps/api/src/db/migrations/` and document it here.

### Stopping and resetting

```bash
# Stop all containers (preserves data volumes)
docker compose down

# Stop and wipe all data — triggers migration re-run on next `docker compose up`
docker compose down -v

# Rebuild a single service after code changes (e.g. API)
docker compose up --build api

# Tail logs for a specific service
docker compose logs -f api
```

### Running tests locally (host machine)

Tests run on the host against the Docker infrastructure (db + redis must be up).

```bash
# API unit + integration tests
cd apps/api && npm install && npm test

# Media worker unit tests (no Docker needed)
cd apps/media-worker && npm install && npm test

# Web editor unit tests (no Docker needed)
cd apps/web-editor && npm install && npm test
```

### Common issues and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `api` exits immediately on startup | DB not ready yet | Add a small startup delay or retry; `docker compose up` again — db healthcheck is `service_started`, not `healthy` |
| `ECONNREFUSED 127.0.0.1:3306` in tests | DB container not running | Run `docker compose up -d db redis` before running tests |
| S3 upload returns `InvalidAccessKeyId` | Missing `.env` values | Ensure `APP_S3_ACCESS_KEY_ID` and `APP_S3_SECRET_ACCESS_KEY` are set in `.env` |
| Presigned URL works but browser PUT fails | CORS on S3/R2 bucket | Configure the bucket's CORS policy to allow PUT from `http://localhost:5173` |
| Port `5173` already in use | Another process on the port | `lsof -ti:5173 \| xargs kill` |
| Port `3001` already in use | Another API process running | `lsof -ti:3001 \| xargs kill` |
| `web-editor` container starts but page is blank | Vite still bundling | Wait ~10 s and refresh; check `docker compose logs web-editor` |

---

*This document is the authoritative reference for all code placement, naming, and architecture decisions. When a pattern is ambiguous, refer to the examples in Section 5 (Business Logic) and Section 6 (UI Logic) first. When still in doubt, open a discussion rather than inventing a new pattern.*
