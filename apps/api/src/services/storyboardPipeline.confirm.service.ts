/**
 * storyboardPipeline.confirm.service.ts — T6 (confirm cast — references below
 * music, idempotent run claim)
 *
 * Implements `confirmCast` (SAD §6 Flow 6; spec §5 AC-03, AC-09, AC-14):
 *
 *   1. assertDraftOwner — evaluated FIRST (AC-13, SAD §8 cross-cutting). Non-owner
 *      → NotFoundError (deny-and-hide), before any prerequisite/estimate/write.
 *   2. Idempotency gate (AC-14): a confirm that finds the reference_image run
 *      already in flight, OR reference blocks already created for the draft,
 *      returns the EXISTING pipeline state WITHOUT creating blocks or enqueueing.
 *      The claim winner is the single creator (the active_run_phase CAS in
 *      claimRun — active_run_phase IS NULL — is the idempotency primitive, ADR-0007).
 *   3. Re-validate the cost estimate server-side (T5; never trust the client; §6.1).
 *      Done BEFORE the claim so a tampered estimate mutates nothing.
 *   4. Create every reference block at sort_order > MAX(music.sort_order) — i.e.
 *      below all music blocks (AC-09, a creation-time snapshot; the pipeline does
 *      not own music and never re-orders later, spec §3).
 *   5. Claim the reference_image run via the active_run_phase CAS + version bump
 *      (ADR-0007), then enqueue reference-image generation the SAME way the shipped
 *      reference flow does (ai_generation_jobs row + first_job_id + queue.add).
 *
 * Reuse (no logic duplicated):
 *   - decideRunClaim / PipelinePhase           — @ai-video-editor/project-schema (T2)
 *   - getPipelineByDraftId / claimRun          — storyboardPipeline.repository (T3)
 *   - computeReferenceImageEstimate / revalidateEstimate — cost.service (T5)
 *   - findLatestCastExtractionJobForDraft / listReferenceBlocksByDraftId — reference.repository
 *   - REFERENCE_DEFAULT_* + the enqueue shape  — storyboardReference.confirm.service (shipped)
 */

import { randomUUID } from 'node:crypto';

import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import { NotFoundError } from '@/lib/errors.js';
import { aiGenerateQueue } from '@/queues/bullmq.js';
import { decideRunClaim } from '@ai-video-editor/project-schema';
import {
  getPipelineByDraftId,
  claimRun,
  type StoryboardPipelineRow,
} from '@/repositories/storyboardPipeline.repository.js';
import {
  computeReferenceImageEstimate,
  revalidateEstimate,
} from '@/services/storyboardPipeline.cost.service.js';
import { findLatestCastExtractionJobForDraft } from '@/repositories/storyboardReference.repository.js';
import {
  REFERENCE_DEFAULT_MODEL_ID,
  REFERENCE_DEFAULT_CAPABILITY,
  REFERENCE_DEFAULT_PROVIDER,
} from '@/services/storyboardReference.confirm.service.js';

// ── Types ───────────────────────────────────────────────────────────────────────

export type ConfirmCastParams = {
  draftId: string;
  userId: string;
  /** The cost estimate the Creator was shown; re-validated server-side (§6.1). */
  clientEstimate: string | null | undefined;
};

/** confirmCast returns the resulting pipeline state projection (the run + phase). */
export type ConfirmCastResult = StoryboardPipelineRow;

/** One cast entry parsed out of the completed cast-extraction proposal_json. */
type ProposalCastEntry = {
  castType: 'character' | 'environment';
  name: string;
  description: string | null;
  /** Scene-block UUIDs this reference covers (from the proposal; may be empty). */
  sceneBlockIds: string[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type DraftOwnerRow = RowDataPacket & { user_id: string };

/**
 * Verify the draft exists and is owned by userId; otherwise NotFoundError
 * (deny-and-hide, AC-13 — evaluated before any other check).
 */
async function assertDraftOwner(draftId: string, userId: string): Promise<void> {
  const [rows] = await pool.execute<DraftOwnerRow[]>(
    `SELECT user_id FROM generation_drafts WHERE id = ? LIMIT 1`,
    [draftId],
  );
  if (!rows.length || rows[0]!.user_id !== userId) {
    throw new NotFoundError(`Draft not found`);
  }
}

/** Parse the cast entries from the latest completed cast-extraction proposal. */
function parseProposalEntries(proposalJson: unknown): ProposalCastEntry[] {
  if (proposalJson === null || typeof proposalJson !== 'object') return [];
  const cast = (proposalJson as { cast?: unknown }).cast;
  if (!Array.isArray(cast)) return [];
  const entries: ProposalCastEntry[] = [];
  for (const raw of cast) {
    if (raw === null || typeof raw !== 'object') continue;
    const r = raw as { type?: unknown; name?: unknown; description?: unknown; scene_block_ids?: unknown };
    const castType = r.type === 'environment' ? 'environment' : 'character';
    const name = typeof r.name === 'string' && r.name.trim() ? r.name : 'Untitled';
    const description =
      typeof r.description === 'string' && r.description.trim() ? r.description : null;
    const sceneBlockIds = Array.isArray(r.scene_block_ids)
      ? (r.scene_block_ids as unknown[]).filter((id): id is string => typeof id === 'string')
      : [];
    entries.push({ castType, name, description, sceneBlockIds });
  }
  return entries;
}

/** Count existing reference blocks for a draft (defensive idempotency guard). */
async function countReferenceBlocks(draftId: string): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM storyboard_reference_blocks WHERE draft_id = ?`,
    [draftId],
  );
  return Number((rows[0] as { cnt: number }).cnt);
}

/** MAX(music.sort_order) for a draft, or -1 when the draft has no music (AC-09). */
async function maxMusicSortOrder(draftId: string): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(MAX(sort_order), -1) AS max_sort
       FROM storyboard_music_blocks
      WHERE draft_id = ?`,
    [draftId],
  );
  return Number((rows[0] as { max_sort: number }).max_sort);
}

function buildReferencePrompt(entry: ProposalCastEntry): string {
  return entry.description?.trim() || entry.name;
}

function buildReferenceOptions(entry: ProposalCastEntry): Record<string, unknown> {
  return {
    prompt: buildReferencePrompt(entry),
    image_size: 'square_hd',
    num_images: 1,
    output_format: 'png',
    sync_mode: false,
  };
}

/**
 * Builds the base-flow canvas for a pipeline-confirmed reference.
 *
 * Seeds the full visible chain — (optional) text-content → generation → result —
 * so opening the flow shows the auto-generated output instead of an empty canvas.
 * Mirrors storyboardReference.confirm.service.buildReferenceCanvas, but without
 * imageFileIds (pipeline proposals carry only description/name).
 */
function buildReferenceCanvas(entry: ProposalCastEntry): {
  canvas: { blocks: unknown[]; edges: unknown[] };
  genBlockId: string;
} {
  const blocks: unknown[] = [];
  const edges: unknown[] = [];

  if (entry.description?.trim()) {
    const contentId = randomUUID();
    blocks.push({
      blockId: contentId,
      type: 'content',
      position: { x: 0, y: 0 },
      params: { contentType: 'text', text: entry.description.trim(), modality: 'text' },
    });
    const genBlockId = randomUUID();
    blocks.push({
      blockId: genBlockId,
      type: 'generation',
      position: { x: 340, y: 0 },
      params: { modelId: REFERENCE_DEFAULT_MODEL_ID },
    });
    edges.push({
      edgeId: randomUUID(),
      sourceBlockId: contentId,
      sourceHandle: 'out',
      targetBlockId: genBlockId,
      targetHandle: 'prompt',
    });
    const resultBlockId = randomUUID();
    blocks.push({
      blockId: resultBlockId,
      type: 'result',
      position: { x: 680, y: 0 },
      params: { sourceBlockId: genBlockId },
    });
    edges.push({
      edgeId: randomUUID(),
      sourceBlockId: genBlockId,
      sourceHandle: 'out',
      targetBlockId: resultBlockId,
      targetHandle: 'in',
    });
    return { canvas: { blocks, edges }, genBlockId };
  }

  // No description — just generation → result.
  const genBlockId = randomUUID();
  blocks.push({
    blockId: genBlockId,
    type: 'generation',
    position: { x: 340, y: 0 },
    params: { modelId: REFERENCE_DEFAULT_MODEL_ID },
  });
  const resultBlockId = randomUUID();
  blocks.push({
    blockId: resultBlockId,
    type: 'result',
    position: { x: 680, y: 0 },
    params: { sourceBlockId: genBlockId },
  });
  edges.push({
    edgeId: randomUUID(),
    sourceBlockId: genBlockId,
    sourceHandle: 'out',
    targetBlockId: resultBlockId,
    targetHandle: 'in',
  });
  return { canvas: { blocks, edges }, genBlockId };
}

// ── confirmCast ───────────────────────────────────────────────────────────────

/**
 * Confirm the cast: re-validate the estimate, create the reference blocks below
 * all music blocks, claim the reference_image run, and enqueue reference-image
 * generation. Idempotent: a repeat confirm returns the existing run with zero
 * duplicate blocks and no re-enqueue (AC-14).
 */
export async function confirmCast(params: ConfirmCastParams): Promise<ConfirmCastResult> {
  const { draftId, userId, clientEstimate } = params;

  // 1. Authorization — must be first (AC-13).
  await assertDraftOwner(draftId, userId);

  // 2. Load the pipeline state.
  let row = await getPipelineByDraftId(draftId);
  if (row === null) {
    // No pipeline row → nothing was ever planned; there is nothing to confirm.
    throw new NotFoundError(`Draft not found`);
  }

  // 3. Idempotency gate (AC-14): if a run is already in flight (or a different
  //    phase holds it), return the existing state without creating blocks.
  const decision = decideRunClaim({
    activeRunPhase: row.activeRunPhase,
    version: row.version,
    target: 'reference_image',
  });
  if (decision.kind !== 'claim') {
    // return_existing (same run already in flight) or conflict (another phase
    // holds the run) — converge to the existing backend state; no re-spend.
    return row;
  }

  // 3b. Defensive idempotency: if reference blocks already exist for the draft
  //     (a prior confirm completed and released the marker), never recreate them.
  if ((await countReferenceBlocks(draftId)) > 0) {
    return row;
  }

  // 4. Read the cast proposal (the source of the reference set).
  const job = await findLatestCastExtractionJobForDraft({ draftId, userId });
  const entries = job ? parseProposalEntries(job.proposalJson) : [];

  // 5. Re-validate the estimate server-side BEFORE any write (§6.1; never trust
  //    the client). A mismatch throws and mutates nothing.
  //    Contract (openapi confirm): the body is OPTIONAL — omitting cost_estimate
  //    means "confirm the proposal exactly as shown". In that case the server
  //    estimate IS the shown estimate (G3 persists the same value at proposal
  //    time), so there is nothing to reject: accept as-shown. A SUPPLIED estimate
  //    is still re-validated and a mismatch (tampered/stale) throws.
  const serverEstimate = await computeReferenceImageEstimate({
    referenceCount: entries.length,
  });
  if (clientEstimate != null) {
    revalidateEstimate({ serverEstimate, clientEstimate });
  }

  // 6. Claim the reference_image run via the active_run_phase CAS (ADR-0007).
  //    This is the single idempotency primitive — only the winner proceeds.
  const claimed = await claimRun({
    draftId,
    phase: 'reference_image',
    currentVersion: row.version,
    // Confirming the cast concludes the reference_data review: resolve it to
    // 'completed' in the SAME atomic CAS as the reference_image claim. Otherwise
    // reference_data stays 'awaiting_review' and the scene_image order-guard
    // (prerequisitesOf → isPhaseResolved) rejects the offer-accept (AC-03/AC-04).
    alsoComplete: 'reference_data',
  });
  if (claimed === 0) {
    // Lost the race to a concurrent confirm (double-confirm / second tab, AC-14).
    // The winner creates the blocks + enqueues; we just return the current state.
    const fresh = await getPipelineByDraftId(draftId);
    return fresh!;
  }

  // 7. Create every reference block below all music blocks (AC-09, snapshot).
  //    sort_order starts just past MAX(music.sort_order); blocks created 'pending'.
  //    Each block gets a linked generation_flow with a pre-seeded base canvas
  //    (content→generation→result) so the Creator can open the flow and review
  //    the auto-generated reference image (MAIN ADJUSTMENT).
  //    Immediately after each block, insert its storyboard_reference_scene_links
  //    rows from the proposal entry's scene_block_ids (AC-10 prep for T12).
  //    Only scene blocks that exist for this draft are linked (bad ids are skipped
  //    to prevent FK violations from stale proposal data — the FK would rollback).
  const baseSort = (await maxMusicSortOrder(draftId)) + 1;
  type CreatedBlock = { blockId: string; flowId: string; genBlockId: string; entry: ProposalCastEntry };
  const created: CreatedBlock[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const blockId = randomUUID();
    const flowId = randomUUID();

    // Create the generation_flow row with a pre-seeded base canvas.
    const { canvas, genBlockId } = buildReferenceCanvas(entry);
    await pool.execute(
      `INSERT INTO generation_flows (flow_id, user_id, title, canvas)
       VALUES (?, ?, ?, ?)`,
      [flowId, userId, entry.name, JSON.stringify(canvas)],
    );

    await pool.execute(
      `INSERT INTO storyboard_reference_blocks
         (id, draft_id, flow_id, cast_type, name, description, sort_order, window_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [blockId, draftId, flowId, entry.castType, entry.name, entry.description, baseSort + i],
    );
    // Insert reference → scene links (AC-10; matches shipped insert shape from
    // storyboardReference.confirm.service / migration 054).
    for (const sceneBlockId of entry.sceneBlockIds) {
      await pool.execute(
        `INSERT IGNORE INTO storyboard_reference_scene_links
           (reference_block_id, scene_block_id)
         VALUES (?, ?)`,
        [blockId, sceneBlockId],
      );
    }
    created.push({ blockId, flowId, genBlockId, entry });
  }

  // 8. Enqueue reference-image generation the SAME way the shipped reference flow
  //    does: ai_generation_jobs row + first_job_id claim + queue.add. The worker's
  //    rolling window (<=4) governs concurrency downstream.
  //    block_id binds the run to the flow canvas' generation block so the flow's
  //    result block resolves this run's output as its preview (MAIN ADJUSTMENT).
  for (const { blockId, flowId, genBlockId, entry } of created) {
    const jobId = randomUUID();
    const prompt = buildReferencePrompt(entry);
    const options = buildReferenceOptions(entry);

    await pool.execute(
      `INSERT INTO ai_generation_jobs
         (job_id, user_id, model_id, capability, prompt, options, flow_id, block_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [jobId, userId, REFERENCE_DEFAULT_MODEL_ID, REFERENCE_DEFAULT_CAPABILITY, prompt, JSON.stringify(options), flowId, genBlockId],
    );
    // Claim the block to 'running' alongside first_job_id (mirrors the shipped
    // storyboardReference.confirm.service). The block was inserted 'pending';
    // claiming it here is REQUIRED so the worker's rolling-window completion hook
    // (onReferenceBlockJobComplete, guarded WHERE window_status='running') matches
    // and advances the block to terminal. Without the claim the block stays
    // 'pending' forever, reference_image never reaches all-terminal, and the
    // reaper eventually fails the whole phase (AC-03).
    await pool.execute(
      `UPDATE storyboard_reference_blocks SET first_job_id = ?, window_status = 'running' WHERE id = ?`,
      [jobId, blockId],
    );
    await aiGenerateQueue.add('ai-generate', {
      jobId,
      userId,
      modelId: REFERENCE_DEFAULT_MODEL_ID,
      capability: REFERENCE_DEFAULT_CAPABILITY,
      provider: REFERENCE_DEFAULT_PROVIDER,
      prompt,
      options,
    });
  }

  // 9. Return the post-claim state (reference_image running).
  const finalRow = await getPipelineByDraftId(draftId);
  return finalRow!;
}
