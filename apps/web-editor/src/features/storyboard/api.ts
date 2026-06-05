/**
 * API calls for the storyboard feature.
 *
 * All HTTP calls go through `apiClient` — never call `fetch` directly.
 */

import type { StoryboardPlanJobResult } from '@ai-video-editor/project-schema';

import { toStoryboardMusicBlockSaveInputs } from '@/features/storyboard/utils/musicBlockSaveInput';
import { apiClient } from '@/lib/api-client';

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
} from './types';

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
    throw new Error(
      `POST /storyboards/${draftId}/blocks/${blockId}/illustration failed: ${res.status}`,
    );
  }
  return res.json() as Promise<StoryboardIllustrationStatusResponse>;
}

export async function approveStoryboardPrincipalImage(
  draftId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  const res = await apiClient.post(`/storyboards/${draftId}/illustrations/principal-image/approve`, {});
  if (!res.ok) {
    throw new Error(`POST /storyboards/${draftId}/illustrations/principal-image/approve failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardIllustrationStatusResponse>;
}

export async function editStoryboardPrincipalImage(
  draftId: string,
  payload: { prompt: string; extraReferenceFileIds?: string[] },
): Promise<StoryboardIllustrationStatusResponse> {
  const res = await apiClient.post(`/storyboards/${draftId}/illustrations/principal-image/edit`, payload);
  if (!res.ok) {
    throw new Error(`POST /storyboards/${draftId}/illustrations/principal-image/edit failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardIllustrationStatusResponse>;
}

export async function replaceStoryboardPrincipalImage(
  draftId: string,
  fileId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  const res = await apiClient.post(`/storyboards/${draftId}/illustrations/principal-image/replace`, { fileId });
  if (!res.ok) {
    throw new Error(`POST /storyboards/${draftId}/illustrations/principal-image/replace failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardIllustrationStatusResponse>;
}

export async function setStoryboardPrincipalImageReferences(
  draftId: string,
  fileIds: string[],
): Promise<StoryboardIllustrationStatusResponse> {
  const res = await apiClient.put(`/storyboards/${draftId}/illustrations/principal-image/references`, { fileIds });
  if (!res.ok) {
    throw new Error(`PUT /storyboards/${draftId}/illustrations/principal-image/references failed: ${res.status}`);
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
