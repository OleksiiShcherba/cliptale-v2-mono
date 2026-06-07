/**
 * Confirm-cast service: T6 — storyboard-reference-flows.
 *
 * ACs: AC-03 (confirm creates K blocks + K flows + K pending rows, enqueues
 *      min(N, K) jobs), AC-13 (non-owner denied without revealing contents).
 *
 * Design:
 *   - Owner check via generation_drafts.user_id (NotFoundError hides existence).
 *   - Single DB transaction: K blocks + K flows + scene-link rows; atomicity
 *     means a FK violation rolls back everything.
 *   - After commit: enqueue min(concurrencyLimit, K) ai-generate jobs.
 *   - No billing call — payment per-run is the worker's responsibility (ADR-0004).
 */

import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import { NotFoundError } from '@/lib/errors.js';
import { aiGenerateQueue } from '@/queues/bullmq.js';
import { DEFAULT_CONCURRENCY_LIMIT } from '@/services/settings.service.js';
import * as settingsRepository from '@/repositories/settings.repository.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** One entry in the adjusted cast provided by the Creator at confirm time. */
export type CastEntry = {
  castType: 'character' | 'environment';
  name: string;
  description?: string;
  imageFileIds?: string[];
  sceneBlockIds?: string[];
};

/** Input for confirmCast. */
export type ConfirmCastParams = {
  draftId: string;
  userId: string;
  entries: CastEntry[];
  /**
   * Aggregate credits the Creator acknowledged at confirm time.
   * Stored for audit; not charged here (ADR-0004 — charge per-run in worker).
   */
  acknowledgedAggregateCredits: number;
};

/** Per-block result returned by confirmCast. */
export type ConfirmedBlock = {
  blockId: string;
  flowId: string;
  sortOrder: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type DraftRow = RowDataPacket & { user_id: string };

/** Verify the draft exists and is owned by userId; throws NotFoundError otherwise. */
async function assertDraftOwner(
  conn: PoolConnection,
  draftId: string,
  userId: string,
): Promise<void> {
  const [rows] = await conn.execute<DraftRow[]>(
    `SELECT user_id FROM generation_drafts WHERE id = ? LIMIT 1`,
    [draftId],
  );
  if (!rows.length || rows[0]!.user_id !== userId) {
    throw new NotFoundError(`Draft not found`);
  }
}

/** Read concurrencyLimit from user_settings (default 4 when absent). */
async function getConcurrencyLimit(userId: string): Promise<number> {
  const record = await settingsRepository.getByUserId(userId);
  if (!record) return DEFAULT_CONCURRENCY_LIMIT;
  const blob = record.settings;
  if (typeof blob === 'object' && blob !== null) {
    const v = (blob as Record<string, unknown>)['concurrencyLimit'];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 12) {
      return v;
    }
  }
  return DEFAULT_CONCURRENCY_LIMIT;
}

// ── confirmCast ───────────────────────────────────────────────────────────────

/**
 * Transactionally creates K reference blocks, K generation flows, K
 * pending window rows and the requested scene links, then enqueues
 * min(concurrencyLimit, K) ai-generate jobs.
 *
 * Throws NotFoundError when the draft does not exist or belongs to another user.
 */
export async function confirmCast(params: ConfirmCastParams): Promise<ConfirmedBlock[]> {
  const { draftId, userId, entries } = params;

  const concurrencyLimit = await getConcurrencyLimit(userId);

  const conn = await pool.getConnection();
  const confirmed: ConfirmedBlock[] = [];

  try {
    await conn.beginTransaction();

    // Owner guard — existence-hiding (AC-13).
    await assertDraftOwner(conn, draftId, userId);

    // Insert K flows + K blocks inside the transaction.
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const blockId = randomUUID();
      const flowId = randomUUID();

      // 1. Create the generation_flow row.
      await conn.execute(
        `INSERT INTO generation_flows (flow_id, user_id, title, canvas)
         VALUES (?, ?, ?, ?)`,
        [
          flowId,
          userId,
          entry.name,
          JSON.stringify({ blocks: [], edges: [] }),
        ],
      );

      // 2. Create the reference block linked to the flow, window_status='pending'.
      await conn.execute(
        `INSERT INTO storyboard_reference_blocks
           (id, draft_id, flow_id, cast_type, name, description, sort_order, window_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          blockId,
          draftId,
          flowId,
          entry.castType,
          entry.name,
          entry.description ?? null,
          i,
        ],
      );

      // 3. Insert scene links (FK → storyboard_blocks; bad id causes rollback).
      for (const sceneBlockId of entry.sceneBlockIds ?? []) {
        await conn.execute(
          `INSERT INTO storyboard_reference_scene_links
             (reference_block_id, scene_block_id)
           VALUES (?, ?)`,
          [blockId, sceneBlockId],
        );
      }

      confirmed.push({ blockId, flowId, sortOrder: i });
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Enqueue min(N, K) jobs AFTER the transaction has committed.
  const toDispatch = Math.min(concurrencyLimit, confirmed.length);
  for (let i = 0; i < toDispatch; i++) {
    const block = confirmed[i]!;
    await aiGenerateQueue.add('ai-generate', {
      jobId: randomUUID(),
      userId,
      referenceBlockId: block.blockId,
      flowId: block.flowId,
      draftId,
    });
  }

  return confirmed;
}
