/**
 * Service for the AI Motion Graphic feature — the authorization + ready-state-invariant
 * boundary the controllers call. Derives from spec §5 (AC-01/02/03/06/07/12/13/14) +
 * sad §6 flows 1/3/5/6 + §8.
 *
 * Two load-bearing rules, both enforced HERE (never in the repository):
 *
 *  1. Ownership / existence hiding (AC-07). Every read AND write is filtered by the acting
 *     userId. A graphic that exists but is owned by someone else is answered EXACTLY like a
 *     truly-absent one — a `NotFoundError` (404), never a `ForbiddenError` (403). A non-owner
 *     must not be able to distinguish "yours-but-hidden" from "does not exist". The ownership
 *     check runs BEFORE any mutation, so a non-owner write touches nothing.
 *
 *  2. Ready-state invariant (AC-06 / AC-14). MVP1 executes graphic code only in the browser, so
 *     the server is NOT authoritative for "does the code run / is it deterministic" — that verdict
 *     (`outcome`) arrives from the browser and the service trusts + records it (ADR-0001/0004).
 *       - outcome 'ready'  → set/update code, bump version, status 'ready'.
 *       - outcome 'failed' → record the failed assistant turn (with errorMessage) and KEEP the
 *         last working code/version/status. A failed refine NEVER overwrites a working graphic.
 *
 * The repository owns SQL only — no auth, no NotFoundError, no ready-state gating there (T5).
 */
import { randomUUID } from 'node:crypto';

import * as motionGraphicRepository from '@/repositories/motionGraphic.repository.js';
import type {
  MotionGraphicRecord,
  MotionGraphicWithChat,
  ChatTurnOutcome,
  ListMotionGraphicsResult,
} from '@/repositories/motionGraphic.repository.js';
import { NotFoundError } from '@/lib/errors.js';

// ── Public input types ────────────────────────────────────────────────────────

export type ListParams = {
  limit: number;
  cursor?: string | null;
};

/** Flow 1 persist — the browser's verdict for a freshly generated graphic. */
export type CreateFromVerdictInput = {
  /** The Creator's description — becomes the opening `user` chat turn. */
  prompt: string;
  /** The fixed animation length the Creator set (→ motion_graphics.duration_seconds). */
  durationSeconds: number;
  /** Browser verdict: ran in preview AND deterministic (`ready`) vs not (`failed`). */
  outcome: ChatTurnOutcome;
  /** The generated component code — required when outcome=ready, null/absent when failed. */
  code?: string | null;
  /** Plain-language failure text recorded on the assistant turn when outcome=failed. */
  errorMessage?: string | null;
  /** Optional caller-supplied title; auto-generated (sized to duration) when absent. */
  title?: string | null;
  /** Optional runtime geometry overrides — defaulted by the DB columns when absent. */
  fps?: number;
  width?: number;
  height?: number;
};

/** Flow 3 persist — the browser's verdict for a refinement exchange. */
export type AppendTurnInput = {
  /** The follow-up instruction — becomes the next `user` chat turn. */
  instruction: string;
  /** Browser verdict: `ready` updates code + version; `failed` keeps last working (AC-14). */
  outcome: ChatTurnOutcome;
  /** The refined component code — required when outcome=ready, null/absent when failed. */
  code?: string | null;
  /** Plain-language failure text recorded on the failed assistant turn. */
  errorMessage?: string | null;
};

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Resolves a graphic + chat and enforces ownership with EXISTENCE HIDING (AC-07).
 *
 * A missing row and a row owned by another Creator both raise the SAME `NotFoundError`,
 * so a non-owner cannot tell a hidden graphic apart from an absent one. Returns the
 * owner's graphic-with-chat for callers that need its current state (e.g. the ready-state
 * invariant read in `appendTurn`, the copy source in `duplicate`).
 */
async function loadOwned(userId: string, id: string): Promise<MotionGraphicWithChat> {
  const found = await motionGraphicRepository.findMotionGraphicWithChat(id);
  if (!found || found.graphic.userId !== userId) {
    // Uniform answer — never reveal that the graphic exists for another owner (AC-07).
    throw new NotFoundError(`Motion graphic ${id} not found`);
  }
  return found;
}

/**
 * Auto-generates a title sized to the chosen duration when the Creator supplies none
 * (AC-01: "auto-generated title ... and the chosen fixed duration"). The Creator may
 * rename it later via `rename`.
 */
function autoTitle(durationSeconds: number): string {
  return `Motion graphic (${durationSeconds}s)`;
}

// ── list (AC-13) ────────────────────────────────────────────────────────────────

/**
 * Lists the acting Creator's non-deleted graphics newest-first (owner-scoped, AC-13).
 * The empty case returns `{ items: [], nextCursor: null }`.
 */
export async function list(
  userId: string,
  params: ListParams,
): Promise<ListMotionGraphicsResult> {
  return motionGraphicRepository.listMotionGraphicsByOwner({
    userId,
    limit: params.limit,
    cursor: params.cursor ?? null,
  });
}

// ── getWithChat (AC-02 + AC-07) ──────────────────────────────────────────────────

/**
 * Reads one owned graphic together with its chat in seq order (AC-02).
 * Non-owner / absent → NotFoundError (AC-07 existence hiding).
 */
export async function getWithChat(
  userId: string,
  id: string,
): Promise<MotionGraphicWithChat> {
  return loadOwned(userId, id);
}

// ── createFromVerdict (Flow 1 — AC-01 ready / AC-06 failed) ──────────────────────

/**
 * Persists the first exchange of a freshly generated graphic from the browser verdict.
 *
 *  - ready  → insert with the new `code`, status `ready`, an auto-title sized to duration
 *             (unless the Creator supplied one); record the opening user turn + a ready
 *             assistant turn carrying the generated code (re-runnable, AC-12-ready).
 *  - failed → insert with NULL `code`, status `failed` (AC-06); record the opening user turn
 *             + a failed assistant turn carrying the errorMessage. No code is stored.
 */
export async function createFromVerdict(
  userId: string,
  input: CreateFromVerdictInput,
): Promise<MotionGraphicWithChat> {
  const isReady = input.outcome === 'ready';
  const id = randomUUID();
  const title = input.title ?? autoTitle(input.durationSeconds);

  await motionGraphicRepository.insertMotionGraphic({
    id,
    userId,
    title,
    durationSeconds: input.durationSeconds,
    code: isReady ? (input.code ?? null) : null,
    status: isReady ? 'ready' : 'failed',
    fps: input.fps,
    width: input.width,
    height: input.height,
  });

  // The opening `user` turn = the Creator's prompt.
  await motionGraphicRepository.appendChatTurn({
    motionGraphicId: id,
    role: 'user',
    content: input.prompt,
  });

  // The `assistant` turn records the verdict (re-runnable code on ready, error on failed).
  await motionGraphicRepository.appendChatTurn({
    motionGraphicId: id,
    role: 'assistant',
    content: isReady ? 'Generated the motion graphic.' : 'The generation did not produce a working graphic.',
    generatedCode: isReady ? (input.code ?? null) : null,
    outcome: input.outcome,
    errorMessage: isReady ? null : (input.errorMessage ?? null),
  });

  return loadOwned(userId, id);
}

// ── rename (AC-01 + AC-07) ───────────────────────────────────────────────────────

/**
 * Renames an owned graphic. Non-owner / absent → NotFoundError; the repo write is never
 * reached for a non-owner (ownership is checked first, AC-07).
 */
export async function rename(
  userId: string,
  id: string,
  title: string,
): Promise<MotionGraphicWithChat> {
  await loadOwned(userId, id);
  await motionGraphicRepository.renameMotionGraphic(id, title);
  return loadOwned(userId, id);
}

// ── appendTurn (Flow 3 — AC-03 ready / AC-14 failed-keeps-last-working / AC-07) ───

/**
 * Persists a refinement exchange from the browser verdict on an owned graphic.
 *
 *  - ready  → update current `code` + bump `version` + status `ready`; append the user
 *             instruction turn and a ready assistant turn with the new code (AC-03).
 *  - failed → append the user instruction turn and a failed assistant turn with the
 *             errorMessage, and KEEP the last working code/version/status untouched —
 *             a failed refine never overwrites the working graphic (AC-14).
 *
 * Non-owner / absent → NotFoundError, and no turn is written (AC-07).
 */
export async function appendTurn(
  userId: string,
  id: string,
  input: AppendTurnInput,
): Promise<MotionGraphicWithChat> {
  // Ownership FIRST — a non-owner write must touch nothing (AC-07).
  await loadOwned(userId, id);

  const isReady = input.outcome === 'ready';

  // On a successful refine, update the working code + bump the version (AC-03).
  // On a failed refine we deliberately SKIP this — the last working version stands (AC-14).
  if (isReady) {
    await motionGraphicRepository.updateMotionGraphicCode({
      id,
      code: input.code ?? '',
    });
  }

  // The `user` turn = the refinement instruction.
  await motionGraphicRepository.appendChatTurn({
    motionGraphicId: id,
    role: 'user',
    content: input.instruction,
  });

  // The `assistant` turn records the verdict — the failed attempt is still persisted (AC-14).
  await motionGraphicRepository.appendChatTurn({
    motionGraphicId: id,
    role: 'assistant',
    content: isReady ? 'Updated the motion graphic.' : 'The refinement did not produce a working graphic.',
    generatedCode: isReady ? (input.code ?? null) : null,
    outcome: input.outcome,
    errorMessage: isReady ? null : (input.errorMessage ?? null),
  });

  return loadOwned(userId, id);
}

// ── duplicate (Flow 6 — AC-12 + AC-07) ───────────────────────────────────────────

/**
 * Creates an independent same-owner copy of an owned graphic, seeded with its current
 * code + its chat as LIVE re-runnable turns (each assistant turn keeps its generated_code,
 * AC-12) — not a frozen transcript. The copy can be refined further without affecting the
 * original. Non-owner / absent source → NotFoundError, and nothing is copied (AC-07).
 */
export async function duplicate(
  userId: string,
  id: string,
): Promise<MotionGraphicWithChat> {
  const { graphic: source } = await loadOwned(userId, id);

  const newId = randomUUID();
  await motionGraphicRepository.insertMotionGraphic({
    id: newId,
    userId,
    title: `${source.title} (copy)`,
    durationSeconds: source.durationSeconds,
    code: source.code,
    propsSchema: source.propsSchema,
    fps: source.fps,
    width: source.width,
    height: source.height,
    runtimeVersion: source.runtimeVersion,
    status: source.status,
  });

  // Seed the copy's chat with the source's turns as live, re-runnable exchanges (AC-12).
  await motionGraphicRepository.copyChatTurns({ sourceId: id, targetId: newId });

  return loadOwned(userId, newId);
}

export type { MotionGraphicRecord };
