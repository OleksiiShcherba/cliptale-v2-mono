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

/** Cursor parameters for keyset pagination on `(pf.created_at, pf.file_id)`. */
export type ProjectFilesCursor = {
  createdAt: Date;
  fileId: string;
};

/** Parameters for the paginated project-files query. */
export type FindFilesByProjectIdPaginatedParams = {
  projectId: string;
  limit: number;
  cursor?: ProjectFilesCursor;
};

/**
 * Returns a page of files linked to a project with the pivot `created_at`
 * included for cursor encoding. Keyset-paginated on `(pf.created_at, pf.file_id)`.
 * Both `project_files.deleted_at` and `files.deleted_at` are filtered to `IS NULL`.
 *
 * LIMIT is interpolated (not bound) because mysql2 does not reliably bind it.
 */
export type FileRowWithPfCreatedAt = FileRow & { pfCreatedAt: Date };

/** Extended row type for paginated project-file reads that includes the pivot timestamp. */
type FileDbRowWithPfCreatedAt = FileDbRow & { pf_created_at: Date };

function mapRowToFileRowWithPfCreatedAt(row: FileDbRowWithPfCreatedAt): FileRowWithPfCreatedAt {
  return {
    ...mapRowToFileRow(row),
    pfCreatedAt: row.pf_created_at,
  };
}

export async function findFilesByProjectIdPaginatedWithCursor(
  params: FindFilesByProjectIdPaginatedParams,
): Promise<FileRowWithPfCreatedAt[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(params.limit))));
  const clauses: string[] = [
    'pf.project_id = ?',
    'pf.deleted_at IS NULL',
    'f.deleted_at IS NULL',
  ];
  const values: unknown[] = [params.projectId];

  if (params.cursor) {
    clauses.push('(pf.created_at, pf.file_id) > (?, ?)');
    values.push(params.cursor.createdAt, params.cursor.fileId);
  }

  const sql =
    `SELECT f.*, pf.created_at AS pf_created_at
       FROM project_files pf
       JOIN files f ON f.file_id = pf.file_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY pf.created_at ASC, pf.file_id ASC
      LIMIT ${safeLimit}`;

  const [rows] = await pool.query<FileDbRowWithPfCreatedAt[]>(sql, values);
  return rows.map(mapRowToFileRowWithPfCreatedAt);
}

/** Row type for totals aggregation over a project's linked files. */
export type ProjectFilesTotalsRow = {
  count: number;
  bytesUsed: number;
};

/**
 * Aggregates the count and total bytes of all non-deleted files linked to a project.
 * Used to populate the `totals` envelope field.
 */
export async function getProjectFilesTotals(projectId: string): Promise<ProjectFilesTotalsRow> {
  type TotalsDbRow = RowDataPacket & { count: number; bytes_used: string | number | null };
  const [rows] = await pool.execute<TotalsDbRow[]>(
    `SELECT COUNT(*) AS count, SUM(f.bytes) AS bytes_used
       FROM project_files pf
       JOIN files f ON f.file_id = pf.file_id
      WHERE pf.project_id = ? AND pf.deleted_at IS NULL AND f.deleted_at IS NULL`,
    [projectId],
  );
  const row = rows[0];
  return {
    count: row ? Number(row.count) : 0,
    bytesUsed: row?.bytes_used == null ? 0 : Number(row.bytes_used),
  };
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
