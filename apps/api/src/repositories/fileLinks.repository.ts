/**
 * Repository for `project_files` and `draft_files` pivot tables.
 *
 * Responsibility: all SQL that links `files` rows to their containers
 * (projects and generation drafts). Only this module may touch these tables.
 *
 * Idempotency: `INSERT IGNORE` prevents duplicate-key errors when the same
 * (project_id, file_id) or (draft_id, file_id) pair is inserted twice.
 * The INSERT is a no-op on a duplicate PK; the service treats this as success.
 */
import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import type { FileRow } from '@/repositories/file.repository.js';

// ── Internal row type shared by both pivot read queries ─────────────────────

type FileDbRow = RowDataPacket & {
  file_id: string;
  user_id: string;
  kind: FileRow['kind'];
  storage_uri: string;
  mime_type: string | null;
  bytes: string | number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  display_name: string | null;
  status: FileRow['status'];
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

function mapRowToFileRow(row: FileDbRow): FileRow {
  return {
    fileId: row.file_id,
    userId: row.user_id,
    kind: row.kind,
    storageUri: row.storage_uri,
    mimeType: row.mime_type,
    bytes: row.bytes == null ? null : Number(row.bytes),
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    displayName: row.display_name,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

// ── project_files ─────────────────────────────────────────────────────────────

/**
 * Links a file to a project by inserting into `project_files`.
 * Uses INSERT IGNORE so a duplicate link is a silent no-op.
 * Returns true when a new row was inserted, false when it already existed.
 */
export async function linkFileToProject(projectId: string, fileId: string): Promise<boolean> {
  const [result] = await pool.execute<import('mysql2/promise').ResultSetHeader>(
    'INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)',
    [projectId, fileId],
  );
  return result.affectedRows > 0;
}

/**
 * Returns all files linked to a project via `project_files`, joining to `files`
 * for the full file metadata. Ordered by `project_files.created_at ASC` to
 * preserve insertion order (mirrors the previous `project_assets_current` ordering).
 */
export async function findFilesByProjectId(projectId: string): Promise<FileRow[]> {
  const [rows] = await pool.execute<FileDbRow[]>(
    `SELECT f.*
       FROM project_files pf
       JOIN files f ON f.file_id = pf.file_id
      WHERE pf.project_id = ? AND pf.deleted_at IS NULL AND f.deleted_at IS NULL
      ORDER BY pf.created_at ASC`,
    [projectId],
  );
  return rows.map(mapRowToFileRow);
}

// ── draft_files ────────────────────────────────────────────────────────────────

/**
 * Links a file to a generation draft by inserting into `draft_files`.
 * Uses INSERT IGNORE so a duplicate link is a silent no-op.
 * Returns true when a new row was inserted, false when it already existed.
 */
export async function linkFileToDraft(draftId: string, fileId: string): Promise<boolean> {
  const [result] = await pool.execute<import('mysql2/promise').ResultSetHeader>(
    'INSERT IGNORE INTO draft_files (draft_id, file_id) VALUES (?, ?)',
    [draftId, fileId],
  );
  return result.affectedRows > 0;
}

/**
 * Returns all files linked to a generation draft via `draft_files`, joining to `files`
 * for the full file metadata. Ordered by `draft_files.created_at ASC`.
 */
export async function findFilesByDraftId(draftId: string): Promise<FileRow[]> {
  const [rows] = await pool.execute<FileDbRow[]>(
    `SELECT f.*
       FROM draft_files df
       JOIN files f ON f.file_id = df.file_id
      WHERE df.draft_id = ? AND df.deleted_at IS NULL AND f.deleted_at IS NULL
      ORDER BY df.created_at ASC`,
    [draftId],
  );
  return rows.map(mapRowToFileRow);
}
