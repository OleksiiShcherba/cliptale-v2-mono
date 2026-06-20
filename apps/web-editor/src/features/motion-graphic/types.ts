/**
 * Wire types for the motion-graphic feature.
 *
 * These mirror the schemas in `docs/features/ai-motion-graphic/contracts/openapi.yaml`
 * exactly (field names + optionality), using the repo's camelCase wire convention.
 * Keep them in sync with the contract — they are the single source of truth the
 * `api.ts` request/response wrappers are typed against.
 */

// ── Error envelope (Error) ───────────────────────────────────────────────────

/**
 * Unified error envelope: the repo's free-text `error` (always present) plus an
 * additive optional machine-readable `code` + `details`.
 */
export type MotionGraphicError = {
  error: string;
  code?: string | null;
  details?: Record<string, unknown>;
};

// ── Motion Graphic resource ──────────────────────────────────────────────────

/** motion_graphics.status — only `ready` is attachable (AC-08). */
export type MotionGraphicStatus = 'generating' | 'ready' | 'failed';

/** A single append-only chat turn (← motion_graphic_chat_turns). */
export type ChatTurnRole = 'user' | 'assistant';

/** The result a refine/generate verdict recorded on an assistant turn. */
export type MotionGraphicOutcome = 'ready' | 'failed';

/** MotionGraphicSummary — list-page projection (title + duration + status). */
export type MotionGraphicSummary = {
  id: string;
  title: string;
  durationSeconds: number;
  status: MotionGraphicStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/** ChatTurn — one append-only chat turn; assistant turns are re-runnable (AC-12). */
export type ChatTurn = {
  id: string;
  role: ChatTurnRole;
  seq: number;
  content: string;
  generatedCode: string | null;
  outcome: MotionGraphicOutcome | null;
  errorMessage: string | null;
  createdAt: string;
};

/** MotionGraphic — full read: summary fields + code/geometry + chat history. */
export type MotionGraphic = {
  id: string;
  title: string;
  code: string | null;
  propsSchema: Record<string, unknown> | null;
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
  runtimeVersion: string;
  status: MotionGraphicStatus;
  version: number;
  chatTurns: ChatTurn[];
  createdAt: string;
  updatedAt: string;
};

// ── Pagination wrapper (MotionGraphicSummaryPage) ────────────────────────────

export type MotionGraphicSummaryPage = {
  items: MotionGraphicSummary[];
  nextCursor: string | null;
};

// ── Request bodies ───────────────────────────────────────────────────────────

/** Money — an acknowledged cost estimate re-validated server-side (AC-11). */
export type Money = {
  currency: string;
  amount: number;
};

/** MotionGraphicCreate — persist the first exchange of a new graphic (Flow 1). */
export type MotionGraphicCreate = {
  prompt: string;
  durationSeconds: number;
  outcome: MotionGraphicOutcome;
  code?: string | null;
  errorMessage?: string | null;
  fps?: number;
  width?: number;
  height?: number;
};

/** MotionGraphicRename — metadata-only title update. */
export type MotionGraphicRename = {
  title: string;
};

/** GenerateRequest — open the generation stream for a new graphic (non-persisting). */
export type GenerateRequest = {
  prompt: string;
  durationSeconds: number;
  acknowledgedCost?: Money;
};

/** RefineRequest — open the refinement stream for an existing graphic (non-persisting). */
export type RefineRequest = {
  instruction: string;
  acknowledgedCost?: Money;
};

/** TurnCreate — persist a refinement exchange (the browser's verdict, Flow 3). */
export type TurnCreate = {
  instruction: string;
  outcome: MotionGraphicOutcome;
  code?: string | null;
  errorMessage?: string | null;
};

/** AttachMotionGraphicRequest — freeze + attach a ready graphic to a block. */
export type AttachMotionGraphicRequest = {
  motionGraphicId: string;
  sortOrder?: number;
};

// ── Storyboard attach result ─────────────────────────────────────────────────

/** MotionGraphicSnapshot — immutable frozen code + duration at attach time (ADR-0009). */
export type MotionGraphicSnapshot = {
  id: string;
  code: string;
  propsSchema: Record<string, unknown> | null;
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
  runtimeVersion: string;
  sourceVersion: number | null;
  createdAt: string;
};

/** BlockMediaMotionGraphic — a storyboard_block_media row of kind `motion_graphic`. */
export type BlockMediaMotionGraphic = {
  id: string;
  blockId: string;
  mediaType: 'motion_graphic';
  sortOrder: number;
  snapshot: MotionGraphicSnapshot;
};

// ── SSE frame protocol (ADR-0003) ────────────────────────────────────────────

/** `event: token` — a code chunk appended in order to reconstruct the component. */
export type SseTokenFrame = {
  type: 'token';
  data: string;
};

/** `event: done` — stream complete; the client now validates + persists. */
export type SseDoneFrame = {
  type: 'done';
  finishReason: string;
};

/** `event: error` — a mid-stream LLM/transport failure (rare). */
export type SseErrorFrame = {
  type: 'error';
  message: string;
};

/** Any frame emitted by the generate/refine SSE streams. */
export type SseFrame = SseTokenFrame | SseDoneFrame | SseErrorFrame;
