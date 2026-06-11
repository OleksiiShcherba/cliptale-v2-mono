/**
 * API calls for the storyboard feature.
 *
 * HTTP calls go through `apiClient`. The one exception is endpoints requiring a
 * per-call `Idempotency-Key` header (extract / confirm / retry) — `apiClient`
 * cannot attach custom headers, so those use a raw fetch via
 * `postWithIdempotencyKey` (same auth + base-url idiom as generate-ai-flow).
 */

import type { StoryboardPlanJobResult } from '@ai-video-editor/project-schema';

import { toStoryboardMusicBlockSaveInputs } from '@/features/storyboard/utils/musicBlockSaveInput';
import { apiClient, getAuthToken } from '@/lib/api-client';
import { config } from '@/lib/config';

import type {
  StoryboardBlock,
  StoryboardState,
  StoryboardSavePayload,
  StoryboardMusicBlock,
  StoryboardMusicBlockUpdatePayload,
  StoryboardMusicResponse,
  StoryboardIllustrationStatusResponse,
  StoryboardProjectAssemblyMode,
  StoryboardProjectCreateResponse,
  StoryboardVideoStatusResponse,
  SceneTemplate,
  CreateSceneTemplatePayload,
  UpdateSceneTemplatePayload,
  ReferenceBlockApiResponse,
  ReferenceBlockListResponse,
  CreateReferenceBlockPayload,
  UpdateReferenceBlockPayload,
  RetryReferenceBlockResponse,
} from './types';

import type { CastExtractionJob, CastProposalEntry } from './components/CastConfirmModal';

export type {
  StoryboardState,
  StoryboardSavePayload,
  SceneTemplate,
  CreateSceneTemplatePayload,
  UpdateSceneTemplatePayload,
};

export type StartStoryboardPlanResponse = {
  jobId: string;
  status: 'queued' | 'running';
};

// ── Structured gate error (T10 / AC-02 / AC-03b / AC-04b) ─────────────────────

export interface GateErrorDetails {
  blocks?: Array<{ blockId: string; name: string }>;
  scenes?: Array<{ blockId: string; name: string | null }>;
}

/**
 * Thrown by startStoryboardIllustrations / startStoryboardBlockIllustration when
 * the server responds 422 with a structured gate-failure body.
 * Carries `code` and `details` so callers can render named blocks / scenes.
 */
export class GateError extends Error {
  code: string;
  details: GateErrorDetails;

  constructor(message: string, code: string, details: GateErrorDetails) {
    super(message);
    this.name = 'GateError';
    this.code = code;
    this.details = details;
  }
}

export type StoryboardPlanJobStatusResponse = StoryboardPlanJobResult;

/**
 * Fetches the current storyboard state (blocks + edges) for a generation draft.
 *
 * Maps to GET /storyboards/:draftId.
 * Used to hydrate the canvas on page load after initialize.
 */
export async function fetchStoryboard(draftId: string): Promise<StoryboardState> {
  const res = await apiClient.get(`/storyboards/${draftId}`);
  if (!res.ok) {
    throw new Error(`GET /storyboards/${draftId} failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardState>;
}

/**
 * Persists the full storyboard state to the server.
 *
 * Maps to PUT /storyboards/:draftId.
 * Called by the autosave hook after the 30s debounce expires.
 */
export async function saveStoryboard(
  draftId: string,
  state: StoryboardSavePayload,
): Promise<void> {
  const { musicBlocks, ...stateWithoutMusic } = state;
  const saveState: StoryboardSavePayload = musicBlocks === undefined
    ? state
    : {
        ...stateWithoutMusic,
        musicBlocks: toStoryboardMusicBlockSaveInputs(musicBlocks) ?? [],
      };
  const res = await apiClient.put(`/storyboards/${draftId}`, saveState);
  if (!res.ok) {
    throw new Error(`PUT /storyboards/${draftId} failed: ${res.status}`);
  }
}

/**
 * History-specific payload — extends the base storyboard state with an optional
 * JPEG thumbnail captured at push time.
 *
 * Intentionally separate from `StoryboardState` so that the primary save endpoint
 * (`PUT /storyboards/:draftId`) never receives thumbnail data.
 * The server stores this as JSON in the `snapshot` column (accepts `z.unknown()`).
 */
export type StoryboardHistoryPayload = {
  blocks: StoryboardSavePayload['blocks'];
  edges: StoryboardSavePayload['edges'];
  musicBlocks?: StoryboardMusicBlock[];
  /** JPEG data URL thumbnail of the canvas at push time, captured via html-to-image. */
  thumbnail?: string;
};

/** Shape of a single history snapshot sent to / received from the server. */
export type StoryboardHistorySnapshot = {
  snapshot: StoryboardHistoryPayload;
  /**
   * Server-declared preview kind of a checkpoint entry (HistoryEntry contract):
   * 'screenshot' = inline capture in snapshot.thumbnail; 'minimap' = SVG
   * fallback (AC-04). Absent on optimistic local rows created before a push.
   */
  previewKind?: HistoryPreviewKind;
  createdAt: string;
};

/** Preview kind stored with each checkpoint entry (CheckpointPush contract). */
export type HistoryPreviewKind = 'screenshot' | 'minimap';

/**
 * Pushes a checkpoint entry — snapshot (+ inline screenshot data-URL when
 * previewKind=screenshot) and previewKind in ONE request (ADR-0002 atomicity:
 * a checkpoint is never silently dropped, AC-04).
 *
 * Maps to POST /storyboards/:draftId/history (CheckpointPush).
 * Throws on a non-ok response — the caller owns the visible error state.
 */
export async function pushCheckpointSnapshot(
  draftId: string,
  payload: StoryboardHistoryPayload,
  previewKind: HistoryPreviewKind,
): Promise<void> {
  const res = await apiClient.post(`/storyboards/${draftId}/history`, {
    snapshot: payload,
    previewKind,
  });
  if (!res.ok) {
    throw new Error(`POST /storyboards/${draftId}/history failed: ${res.status}`);
  }
}

/**
 * Loads server-persisted history snapshots on mount.
 *
 * Maps to GET /storyboards/:draftId/history.
 * Returns snapshots in ascending chronological order (oldest first).
 */
export async function fetchHistorySnapshots(
  draftId: string,
): Promise<StoryboardHistorySnapshot[]> {
  const res = await apiClient.get(`/storyboards/${draftId}/history`);
  if (!res.ok) {
    throw new Error(`GET /storyboards/${draftId}/history failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardHistorySnapshot[]>;
}

/**
 * Starts an async storyboard planning job for a generation draft.
 *
 * Maps to POST /generation-drafts/:draftId/storyboard-plan.
 * Returns the persisted job ID immediately so callers can move the user to
 * Step 2 while realtime events report status changes.
 */
export async function startStoryboardPlan(
  draftId: string,
): Promise<StartStoryboardPlanResponse> {
  const res = await apiClient.post(`/generation-drafts/${draftId}/storyboard-plan`, {});
  if (!res.ok) {
    throw new Error(`POST /generation-drafts/${draftId}/storyboard-plan failed: ${res.status}`);
  }
  return res.json() as Promise<StartStoryboardPlanResponse>;
}

/**
 * Polls an existing storyboard planning job.
 *
 * Maps to GET /generation-drafts/:draftId/storyboard-plan/:jobId.
 */
export async function getStoryboardPlanStatus(
  draftId: string,
  jobId: string,
): Promise<StoryboardPlanJobStatusResponse> {
  const res = await apiClient.get(`/generation-drafts/${draftId}/storyboard-plan/${jobId}`);
  if (!res.ok) {
    throw new Error(
      `GET /generation-drafts/${draftId}/storyboard-plan/${jobId} failed: ${res.status}`,
    );
  }
  return res.json() as Promise<StoryboardPlanJobStatusResponse>;
}

/**
 * Applies the latest completed storyboard plan for a draft.
 *
 * Maps to POST /storyboards/:draftId/apply-latest-plan.
 * The server performs the authoritative replace + history snapshot write and
 * returns the hydrated storyboard canvas state.
 */
export async function applyLatestStoryboardPlan(draftId: string): Promise<StoryboardState> {
  const res = await apiClient.post(`/storyboards/${draftId}/apply-latest-plan`, {});
  if (!res.ok) {
    throw new Error(`POST /storyboards/${draftId}/apply-latest-plan failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardState>;
}

export async function fetchStoryboardIllustrations(
  draftId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  const res = await apiClient.get(`/storyboards/${draftId}/illustrations`);
  if (!res.ok) {
    throw new Error(`GET /storyboards/${draftId}/illustrations failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardIllustrationStatusResponse>;
}

export async function startStoryboardIllustrations(
  draftId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  const res = await apiClient.post(`/storyboards/${draftId}/illustrations`, {});
  if (!res.ok) {
    if (res.status === 422) {
      const body = await res.json().catch(() => null) as {
        error?: string;
        code?: string;
        details?: GateErrorDetails;
      } | null;
      if (body?.code && body.details) {
        throw new GateError(
          body.error ?? `POST /storyboards/${draftId}/illustrations failed: 422`,
          body.code,
          body.details,
        );
      }
      const message = body?.error ?? `POST /storyboards/${draftId}/illustrations failed: ${res.status}`;
      throw new Error(message);
    }
    throw new Error(`POST /storyboards/${draftId}/illustrations failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardIllustrationStatusResponse>;
}

export async function startStoryboardBlockIllustration(
  draftId: string,
  blockId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  const res = await apiClient.post(`/storyboards/${draftId}/blocks/${blockId}/illustration`, {});
  if (!res.ok) {
    if (res.status === 422) {
      const body = await res.json().catch(() => null) as {
        error?: string;
        code?: string;
        details?: GateErrorDetails;
      } | null;
      if (body?.code && body.details) {
        throw new GateError(
          body.error ?? `POST /storyboards/${draftId}/blocks/${blockId}/illustration failed: 422`,
          body.code,
          body.details,
        );
      }
    }
    throw new Error(
      `POST /storyboards/${draftId}/blocks/${blockId}/illustration failed: ${res.status}`,
    );
  }
  return res.json() as Promise<StoryboardIllustrationStatusResponse>;
}

export async function createProjectFromStoryboard(
  draftId: string,
  mode: StoryboardProjectAssemblyMode = 'images',
): Promise<StoryboardProjectCreateResponse> {
  const res = await apiClient.post(`/storyboards/${draftId}/project`, { mode });
  if (!res.ok) {
    throw new Error(`POST /storyboards/${draftId}/project failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardProjectCreateResponse>;
}

export async function startStoryboardVideos(
  draftId: string,
  payload: { modelId: string; generateAudio: boolean },
): Promise<StoryboardVideoStatusResponse> {
  const res = await apiClient.post(`/storyboards/${draftId}/videos`, payload);
  if (!res.ok) {
    throw new Error(`POST /storyboards/${draftId}/videos failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardVideoStatusResponse>;
}

export async function fetchStoryboardVideos(
  draftId: string,
): Promise<StoryboardVideoStatusResponse> {
  const res = await apiClient.get(`/storyboards/${draftId}/videos`);
  if (!res.ok) {
    throw new Error(`GET /storyboards/${draftId}/videos failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardVideoStatusResponse>;
}

export async function fetchStoryboardMusic(draftId: string): Promise<StoryboardMusicResponse> {
  const res = await apiClient.get(`/storyboards/${draftId}/music`);
  if (!res.ok) {
    throw new Error(`GET /storyboards/${draftId}/music failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardMusicResponse>;
}

export async function updateStoryboardMusicBlock(
  draftId: string,
  musicBlockId: string,
  payload: StoryboardMusicBlockUpdatePayload,
): Promise<StoryboardMusicBlock> {
  const res = await apiClient.patch(`/storyboards/${draftId}/music/${musicBlockId}`, payload);
  if (!res.ok) {
    throw new Error(`PATCH /storyboards/${draftId}/music/${musicBlockId} failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardMusicBlock>;
}

export async function generateStoryboardMusicBlock(
  draftId: string,
  musicBlockId: string,
): Promise<StoryboardMusicResponse> {
  const res = await apiClient.post(`/storyboards/${draftId}/music/${musicBlockId}/generate`, {});
  if (!res.ok) {
    throw new Error(
      `POST /storyboards/${draftId}/music/${musicBlockId}/generate failed: ${res.status}`,
    );
  }
  return res.json() as Promise<StoryboardMusicResponse>;
}

export async function generatePendingStoryboardMusic(
  draftId: string,
): Promise<StoryboardMusicResponse> {
  const res = await apiClient.post(`/storyboards/${draftId}/music/generate-pending`, {});
  if (!res.ok) {
    throw new Error(`POST /storyboards/${draftId}/music/generate-pending failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardMusicResponse>;
}

// ── Scene Template API functions ───────────────────────────────────────────────

/**
 * Retrieves all scene templates owned by the authenticated user.
 *
 * Maps to GET /scene-templates.
 * Accepts an optional search string to filter by name/prompt.
 */
export async function listSceneTemplates(search?: string): Promise<{ items: SceneTemplate[] }> {
  const path = search
    ? `/scene-templates?search=${encodeURIComponent(search)}`
    : '/scene-templates';
  const res = await apiClient.get(path);
  if (!res.ok) {
    throw new Error(`GET /scene-templates failed: ${res.status}`);
  }
  return res.json() as Promise<{ items: SceneTemplate[] }>;
}

/**
 * Creates a new scene template.
 *
 * Maps to POST /scene-templates.
 * Returns 201 with the full template on success.
 */
export async function createSceneTemplate(
  payload: CreateSceneTemplatePayload,
): Promise<SceneTemplate> {
  const res = await apiClient.post('/scene-templates', payload);
  if (!res.ok) {
    throw new Error(`POST /scene-templates failed: ${res.status}`);
  }
  return res.json() as Promise<SceneTemplate>;
}

/**
 * Retrieves a single scene template by ID.
 *
 * Maps to GET /scene-templates/:id.
 * Returns 404 if the template does not exist or is not owned by the user.
 */
export async function getSceneTemplate(id: string): Promise<SceneTemplate> {
  const res = await apiClient.get(`/scene-templates/${id}`);
  if (!res.ok) {
    throw new Error(`GET /scene-templates/${id} failed: ${res.status}`);
  }
  return res.json() as Promise<SceneTemplate>;
}

/**
 * Updates an existing scene template.
 *
 * Maps to PUT /scene-templates/:id.
 * Replaces media list atomically when `mediaItems` is provided.
 */
export async function updateSceneTemplate(
  id: string,
  payload: UpdateSceneTemplatePayload,
): Promise<SceneTemplate> {
  const res = await apiClient.put(`/scene-templates/${id}`, payload);
  if (!res.ok) {
    throw new Error(`PUT /scene-templates/${id} failed: ${res.status}`);
  }
  return res.json() as Promise<SceneTemplate>;
}

/**
 * Soft-deletes a scene template.
 *
 * Maps to DELETE /scene-templates/:id.
 * Sets `deleted_at` on the server; the template is excluded from list queries.
 */
export async function deleteSceneTemplate(id: string): Promise<void> {
  const res = await apiClient.delete(`/scene-templates/${id}`);
  if (!res.ok) {
    throw new Error(`DELETE /scene-templates/${id} failed: ${res.status}`);
  }
}

/**
 * Creates a new storyboard block from a scene template.
 *
 * Maps to POST /scene-templates/:id/add-to-storyboard.
 * Requires the user to own both the template and the draft.
 * Returns the newly created StoryboardBlock.
 */
export async function addTemplateToStoryboard(params: {
  templateId: string;
  draftId: string;
}): Promise<StoryboardBlock> {
  const res = await apiClient.post(
    `/scene-templates/${params.templateId}/add-to-storyboard`,
    { draftId: params.draftId },
  );
  if (!res.ok) {
    throw new Error(
      `POST /scene-templates/${params.templateId}/add-to-storyboard failed: ${res.status}`,
    );
  }
  return res.json() as Promise<StoryboardBlock>;
}

// ── Reference block API (storyboard-reference-flows T15) ──────────────────────

/**
 * Fetches all reference blocks for a draft (canvas load — full read, ≤ 50 blocks).
 *
 * Maps to GET /storyboards/:draftId/references/blocks.
 * Returns blocks in cast order (sortOrder). Stars + scene links are embedded so
 * the canvas renders from one read (NFR p95 ≤ 1500 ms, up to 50 blocks).
 */
export async function listReferenceBlocks(
  draftId: string,
): Promise<ReferenceBlockListResponse> {
  const res = await apiClient.get(`/storyboards/${draftId}/references/blocks`);
  if (!res.ok) {
    throw new Error(`GET /storyboards/${draftId}/references/blocks failed: ${res.status}`);
  }
  return res.json() as Promise<ReferenceBlockListResponse>;
}

/**
 * Manually creates a reference block with a new empty linked reference flow (AC-11 / US-07).
 *
 * Maps to POST /storyboards/:draftId/references/blocks.
 * Creates an empty linked flow and the 1:1 block↔flow link — starts no generation
 * and charges nothing (windowStatus stays null = manual block). The block participates
 * in the star gate like any auto-created block. Not capped by the cast size limit.
 */
export async function createReferenceBlock(
  draftId: string,
  payload: CreateReferenceBlockPayload,
): Promise<ReferenceBlockApiResponse> {
  const res = await apiClient.post(`/storyboards/${draftId}/references/blocks`, payload);
  if (!res.ok) {
    throw new Error(`POST /storyboards/${draftId}/references/blocks failed: ${res.status}`);
  }
  return res.json() as Promise<ReferenceBlockApiResponse>;
}

/**
 * Updates a reference block's canvas position (versionless commutative write).
 *
 * Maps to PATCH /storyboards/:draftId/references/blocks/:blockId.
 * Persists XY position — last-write-wins, never conflicts with versioned scene-link saves.
 */
export async function updateReferenceBlock(
  draftId: string,
  blockId: string,
  payload: UpdateReferenceBlockPayload,
): Promise<ReferenceBlockApiResponse> {
  const res = await apiClient.patch(
    `/storyboards/${draftId}/references/blocks/${blockId}`,
    payload,
  );
  if (!res.ok) {
    throw new Error(
      `PATCH /storyboards/${draftId}/references/blocks/${blockId} failed: ${res.status}`,
    );
  }
  return res.json() as Promise<ReferenceBlockApiResponse>;
}

/**
 * Deletes a reference block — the linked flow and its results survive (AC-14 / US-08).
 *
 * Maps to DELETE /storyboards/:draftId/references/blocks/:blockId.
 * Removes the block and its scene links; the flow and all its results remain intact in
 * the Generate AI list (draft badge removed). The block leaves the star gate.
 */
export async function deleteReferenceBlock(
  draftId: string,
  blockId: string,
): Promise<void> {
  const res = await apiClient.delete(
    `/storyboards/${draftId}/references/blocks/${blockId}`,
  );
  if (!res.ok) {
    throw new Error(
      `DELETE /storyboards/${draftId}/references/blocks/${blockId} failed: ${res.status}`,
    );
  }
}

/**
 * Retries the failed first generation of a reference block (AC-04 / US-08).
 *
 * Maps to POST /storyboards/:draftId/references/blocks/:blockId/retry.
 * Returns the block to windowStatus: pending — the rolling-window mechanism dispatches
 * it again (ADR-0003). Only the auto-started first generation is retried here; later
 * regenerations go through the flow's own Generate surface.
 *
 * REQUIRES an `Idempotency-Key` header (TTL 24h) — the controller rejects the
 * request with 400 without it. Sent via `postWithIdempotencyKey`.
 */
export async function retryReferenceBlockGeneration(
  draftId: string,
  blockId: string,
): Promise<RetryReferenceBlockResponse> {
  const res = await postWithIdempotencyKey(
    `/storyboards/${draftId}/references/blocks/${blockId}/retry`,
    {},
  );
  if (!res.ok) {
    throw new Error(
      `POST /storyboards/${draftId}/references/blocks/${blockId}/retry failed: ${res.status}`,
    );
  }
  return res.json() as Promise<RetryReferenceBlockResponse>;
}

// ── File info API (storyboard-reference-flows AC-06) ──────────────────────────

/**
 * Fetches a displayable URL for a file by its ID.
 *
 * Maps to GET /files/:fileId/stream → `{ url }` (short-lived presigned HTTPS URL)
 * — the same owner-scoped endpoint generate-ai-flow's getFileUrl uses. The bare
 * `/files/:id` route does NOT exist; hitting it always 404'd and silently broke
 * every reference-block preview on the storyboard.
 * Returns null on any failure so the canvas falls back gracefully.
 */
export async function fetchFileInfo(
  fileId: string,
): Promise<{ url: string } | null> {
  const res = await apiClient.get(`/files/${fileId}/stream`);
  if (!res.ok) return null;
  const data = (await res.json()) as { url?: string | null };
  return data.url ? { url: data.url } : null;
}

// ── Idempotency-Key POST helper ───────────────────────────────────────────────
//
// Several reference endpoints (extract / confirm / retry) REQUIRE an
// `Idempotency-Key` header — the controller rejects the request with 400 without
// it. `apiClient.post` cannot attach a custom header, so — like `generateBlock`
// in generate-ai-flow — these calls use a raw fetch with the same auth + base-url
// idiom and a fresh key per call.

/** A fresh idempotency key per call. crypto.randomUUID in jsdom + browsers; fallback for safety. */
function freshIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** POST with a fresh Idempotency-Key header + bearer auth, returning the raw Response. */
async function postWithIdempotencyKey(path: string, body: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Idempotency-Key': freshIdempotencyKey(),
  };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return fetch(`${config.apiBaseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
}

// ── Cast extraction API (storyboard-reference-flows T17) ──────────────────────

/**
 * Starts cast extraction for a draft (AC-01 / US-01).
 *
 * Maps to POST /storyboards/:draftId/references/extract.
 * Enqueues a cast extraction job; no paid generation starts yet.
 * Returns ExtractionAccepted { jobId, status }. The status is the idempotent
 * union queued|running|completed (ADR-0001): a fresh start is `queued`, while a
 * converged-on existing extraction returns its current status.
 *
 * REQUIRES an `Idempotency-Key` header (the controller rejects the request with
 * 400 without it) — sent via `postWithIdempotencyKey`.
 */
export async function startCastExtraction(
  draftId: string,
): Promise<{ jobId: string; status: 'queued' | 'running' | 'completed' }> {
  const res = await postWithIdempotencyKey(`/storyboards/${draftId}/references/extract`, {});
  if (!res.ok) {
    throw new Error(`POST /storyboards/${draftId}/references/extract failed: ${res.status}`);
  }
  return res.json() as Promise<{ jobId: string; status: 'queued' | 'running' | 'completed' }>;
}

/**
 * Polls the cast extraction job status (AC-01).
 *
 * Maps to GET /storyboards/:draftId/references/extraction.
 * Returns null when no extraction has been started for this draft.
 */
export async function getLatestCastExtraction(
  draftId: string,
): Promise<CastExtractionJob | null> {
  const res = await apiClient.get(`/storyboards/${draftId}/references/extraction`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `GET /storyboards/${draftId}/references/extraction failed: ${res.status}`,
    );
  }
  return res.json() as Promise<CastExtractionJob>;
}

/**
 * Confirms the proposed cast (collective cost confirmation — AC-03 / US-02).
 *
 * Maps to POST /storyboards/:draftId/references/confirm-cast.
 * Creates one reference block per entry (off-chain), each linked 1:1 to a new
 * reference flow pre-filled with the entry's images/description; auto-starts the
 * first generation in each flow in a rolling window.
 *
 * REQUIRES an `Idempotency-Key` header (the controller rejects the request with
 * 400 without it) — this is the spend path, so the header guards against a
 * double-charge on retry. Sent via `postWithIdempotencyKey`.
 */
export async function confirmCast(
  draftId: string,
  entries: CastProposalEntry[],
  acknowledgedAggregateCredits: number,
): Promise<ReferenceBlockListResponse> {
  const res = await postWithIdempotencyKey(`/storyboards/${draftId}/references/confirm`, {
    entries,
    acknowledgedAggregateCredits,
  });
  if (!res.ok) {
    throw new Error(
      `POST /storyboards/${draftId}/references/confirm failed: ${res.status}`,
    );
  }
  return res.json() as Promise<ReferenceBlockListResponse>;
}
