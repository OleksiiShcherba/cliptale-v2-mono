/**
 * Repository for the `flow_files` pivot table (ADR-0007).
 *
 * Links a generation flow to the result assets it produced.
 * Mirrors the `draft_files` pivot pattern (migrations 022 + 029):
 *   - FK to generation_flows is CASCADE (drop link when flow is hard-deleted/purged)
 *   - FK to files is RESTRICT (asset outlives the flow — AC-19)
 *   - App-level soft delete: flow delete soft-deletes links via deleted_at; the
 *     FK pair is the hard-delete safety net.
 */
import { pool } from '@/db/connection.js';

/**
 * Links a file to a flow.
 *
 * Idempotent: uses INSERT IGNORE so a duplicate (flow_id, file_id) pair is
 * silently skipped — no error, no duplicate row.
 */
export async function linkFileToFlow(flowId: string, fileId: string): Promise<void> {
  await pool.execute(
    `INSERT IGNORE INTO flow_files (flow_id, file_id) VALUES (?, ?)`,
    [flowId, fileId],
  );
}

/**
 * Soft-unlinks a file from a flow by setting `deleted_at` on the pivot row.
 *
 * The file row in `files` is NOT touched — asset outlives the flow (AC-19).
 * Silent no-op when the link does not exist.
 */
export async function softUnlinkFileFromFlow(flowId: string, fileId: string): Promise<void> {
  await pool.execute(
    `UPDATE flow_files
        SET deleted_at = CURRENT_TIMESTAMP(3)
      WHERE flow_id = ? AND file_id = ? AND deleted_at IS NULL`,
    [flowId, fileId],
  );
}

/**
 * Returns the file IDs of all active (non-soft-deleted) links for a given flow.
 *
 * Used internally (e.g., worker completion, T13) to check which assets are
 * already linked before inserting again.
 */
export async function getLinkedFileIds(flowId: string): Promise<string[]> {
  const [rows] = await pool.execute<Array<{ file_id: string } & import('mysql2/promise').RowDataPacket>>(
    `SELECT file_id FROM flow_files WHERE flow_id = ? AND deleted_at IS NULL`,
    [flowId],
  );
  return rows.map((r) => r.file_id);
}
