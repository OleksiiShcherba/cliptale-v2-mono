/**
 * T16 — generate-ai-flow feature types.
 *
 * Wire types mirror the contracts/openapi.yaml shapes (camelCase, per repo convention).
 * FlowBlock / FlowEdge / FlowCanvas are re-exported from packages/project-schema so
 * there is a single source of truth for the canvas document shape.
 */

// Re-export canvas types from the shared schema package (T4).
export type { FlowBlock, FlowEdge, FlowCanvas, FlowBlockType } from '@ai-video-editor/project-schema';

// ── Flow resource (← generation_flows) ──────────────────────────────────────

/**
 * Summary shape returned by GET /generation-flows and PATCH /generation-flows/:id.
 * No canvas — list-page safe.
 */
export type FlowSummary = {
  flowId: string;
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Full flow shape returned by GET /generation-flows/:id and POST /generation-flows.
 */
export type Flow = {
  flowId: string;
  title: string;
  version: number;
  /** The canvas document (project-schema FlowCanvas). */
  canvas: import('@ai-video-editor/project-schema').FlowCanvas;
  /** Per-block last-known job states (for reattach on reopen). */
  jobs: JobState[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Cursor-paginated list of flow summaries.
 * Mirrors GET /generation-flows response: { items, nextCursor }.
 */
export type FlowSummaryPage = {
  items: FlowSummary[];
  nextCursor: string | null;
};

/**
 * Canvas-save request body (PUT /generation-flows/:id/canvas).
 */
export type CanvasSave = {
  version: number;
  canvas: import('@ai-video-editor/project-schema').FlowCanvas;
};

/**
 * Canvas-save response (new version + updatedAt).
 */
export type CanvasSaveResult = {
  flowId: string;
  version: number;
  updatedAt: string;
};

// ── Job state (← ai_generation_jobs, embedded in Flow for reattach) ──────────

export type JobStatusEnum = 'queued' | 'running' | 'done' | 'failed';

export type JobState = {
  jobId: string;
  blockId: string;
  status: JobStatusEnum;
  progress: number;
  outputFileId: string | null;
  resultUrl: string | null;
  errorMessage: string | null;
};

// ── Error envelope (repo pattern: { error } + additive { code, details }) ────

export type ApiError = {
  error: string;
  code?: string | null;
  details?: Record<string, unknown>;
};
