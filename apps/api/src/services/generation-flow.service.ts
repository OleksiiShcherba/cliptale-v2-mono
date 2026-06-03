/**
 * generation-flow.service — use-case layer for the Flow resource.
 *
 * Enforces:
 *   - Owner-scoping with existence hiding (AC-04, sad §8): a non-owner or absent
 *     flow are INDISTINGUISHABLE — both raise NotFoundError (404). Never leak
 *     existence via a 403.
 *   - Optimistic concurrency (ADR-0003, AC-10b): a stale-version canvas save
 *     raises OptimisticLockError (409). First save stays authoritative.
 *
 * Dependencies:
 *   - generation-flow.repository (T6): CRUD + version-aware canvas save.
 *   - aiGenerationJob.repository (T7): per-flow job-state reattach query.
 */
import { randomUUID } from 'node:crypto';

import type { FlowRecord } from '@/repositories/generation-flow.repository.js';
import * as flowRepo from '@/repositories/generation-flow.repository.js';
import type { AiGenerationJob } from '@/repositories/aiGenerationJob.repository.js';
import * as jobRepo from '@/repositories/aiGenerationJob.repository.js';
import * as flowFileRepo from '@/repositories/flow-file.repository.js';
import { NotFoundError, OptimisticLockError, ValidationError } from '@/lib/errors.js';
import { flowCanvasSchema } from '@ai-video-editor/project-schema';
import type { FlowCanvas } from '@ai-video-editor/project-schema';

// ── Return types ──────────────────────────────────────────────────────────────

/** Payload returned by openFlow — canvas + per-result-block job states. */
export type OpenFlowResult = {
  flow: FlowRecord;
  jobs: AiGenerationJob[];
};

// ── listFlows ─────────────────────────────────────────────────────────────────

/**
 * Lists all non-deleted flows owned by the calling user, newest-first.
 * AC-04: only this user's flows are returned.
 */
export async function listFlows(userId: string): Promise<FlowRecord[]> {
  return flowRepo.findFlowsByUserId(userId);
}

// ── createFlow ────────────────────────────────────────────────────────────────

/**
 * Creates a new empty flow for the calling user.
 *
 * @param userId  - The authenticated caller's ID.
 * @param title   - Display title (trimmed by caller; defaults handled in controller).
 * @returns The newly created FlowRecord (version = 1).
 */
export async function createFlow(userId: string, title: string): Promise<FlowRecord> {
  const flowId = randomUUID();
  const canvas: FlowCanvas = { blocks: [], edges: [] };

  return flowRepo.createFlow({ flowId, userId, title, canvas });
}

// ── openFlow ──────────────────────────────────────────────────────────────────

/**
 * Returns the flow's canvas + all per-block job states for reattach (AC-08b).
 *
 * AC-04 / sad §8 existence-hiding: findFlowById is already owner-scoped in the
 * repository (WHERE user_id = ? AND deleted_at IS NULL). A null result — whether
 * from a wrong owner or from a missing row — is mapped to NotFoundError. The
 * caller can never infer which case it is.
 *
 * @param flowId - The flow to open.
 * @param userId - The authenticated caller.
 * @returns { flow, jobs } where jobs is the full list of ai_generation_jobs for
 *          this flow (empty when no generation has run yet).
 */
export async function openFlow(flowId: string, userId: string): Promise<OpenFlowResult> {
  const flow = await flowRepo.findFlowById(flowId, userId);
  if (!flow) {
    throw new NotFoundError(`Flow "${flowId}" not found`);
  }

  const jobs = await jobRepo.getJobsByFlowId(flowId);

  return { flow, jobs };
}

// ── renameFlow ────────────────────────────────────────────────────────────────

/**
 * Renames a flow.
 *
 * AC-04: the repository UPDATE is owner-scoped (WHERE user_id = ?). A zero-row
 * update — non-owner, absent, or soft-deleted — raises NotFoundError (404).
 *
 * @returns The updated FlowRecord.
 */
export async function renameFlow(
  flowId: string,
  userId: string,
  title: string,
): Promise<FlowRecord> {
  const updated = await flowRepo.renameFlow(flowId, userId, title);
  if (!updated) {
    throw new NotFoundError(`Flow "${flowId}" not found`);
  }

  // Read back the updated row (repo renameFlow returns a boolean, not the row).
  const flow = await flowRepo.findFlowById(flowId, userId);
  if (!flow) {
    // Should not happen — we just updated it, but guard against races.
    throw new NotFoundError(`Flow "${flowId}" not found after rename`);
  }
  return flow;
}

// ── deleteFlow ────────────────────────────────────────────────────────────────

/**
 * Soft-deletes a flow (sets deleted_at).
 *
 * AC-04: the repository UPDATE is owner-scoped. A zero-row result means the flow
 * does not exist for this user — raises NotFoundError (no 403, no existence leak).
 *
 * AC-19: only the flow row and its flow_files pivot links are soft-deleted.
 * The library asset rows in `files` are NOT touched — assets outlive flows.
 *
 * Ordering: the owner-scoped flow soft-delete runs first (a zero-row result means
 * a non-owner/absent flow → 404, and we never touch the pivot in that case). Only
 * after the delete is confirmed do we drop the flow→asset linkage, so deleting a
 * flow leaves its result assets in the library but unlinked (AC-19).
 */
export async function deleteFlow(flowId: string, userId: string): Promise<void> {
  const deleted = await flowRepo.softDeleteFlow(flowId, userId);
  if (!deleted) {
    throw new NotFoundError(`Flow "${flowId}" not found`);
  }

  // AC-19: drop the flow→asset linkage. The `files` rows are untouched (RESTRICT FK).
  await flowFileRepo.softUnlinkAllFilesFromFlow(flowId);
}

// ── saveCanvas ────────────────────────────────────────────────────────────────

/**
 * Saves a new canvas document with an optimistic-version guard (ADR-0003, AC-10b).
 *
 * The repository UPDATE atomically increments `version` only when the DB row
 * still carries `version = parentVersion` AND `user_id = userId`.
 *
 * A zero-row result (stale client, wrong owner, or soft-deleted) raises
 * `OptimisticLockError` (409) — the controller maps this to 409 Conflict.
 * The first save stays authoritative; the caller must reload to continue.
 *
 * @param flowId        - The flow to update.
 * @param userId        - The authenticated caller.
 * @param canvas        - The full new canvas document.
 * @param parentVersion - The version the client last read.
 * @returns The updated FlowRecord (version incremented by 1).
 */
export async function saveCanvas(
  flowId: string,
  userId: string,
  canvas: FlowCanvas,
  parentVersion: number,
): Promise<FlowRecord> {
  // F6 / §6.1 server-authoritative validation: the canvas is NOT an opaque blob —
  // reject a structurally-invalid document at the write boundary so a malformed
  // graph can never reach the generation gate or be persisted (ADR-0002).
  const parsed = flowCanvasSchema.safeParse(canvas);
  if (!parsed.success) {
    throw new ValidationError(
      `Invalid canvas document: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
    );
  }

  const result = await flowRepo.saveFlowCanvas({ flowId, userId, canvas: parsed.data, parentVersion });

  if (!result.saved) {
    throw new OptimisticLockError(
      `Canvas save rejected: version mismatch for flow "${flowId}". ` +
        'Reload the flow to see the current state.',
    );
  }

  return result.flow!;
}
