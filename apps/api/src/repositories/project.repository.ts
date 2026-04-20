import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** Minimal project row returned after creation. */
export type CreateProjectResult = {
  projectId: string;
  createdAt: Date;
};

/** Lightweight project record for ownership checks. */
export type ProjectRecord = {
  projectId: string;
  ownerUserId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/**
 * Summary of a project returned by findProjectsByUserId.
 * thumbnailUrl is derived from the earliest visual clip in the project.
 * thumbnailFileId is the file_id of the file whose thumbnail_uri is used;
 * the controller layer converts it to a proxy URL.
 */
export type ProjectSummary = {
  projectId: string;
  title: string;
  updatedAt: Date;
  /** Raw s3:// URI of the thumbnail, or null when none is available. */
  thumbnailUrl: string | null;
  /** file_id of the thumbnail source file — needed to build the proxy URL. */
  thumbnailFileId: string | null;
};

type ProjectRow = RowDataPacket & {
  project_id: string;
  owner_user_id: string;
  created_at: Date;
  updated_at: Date;
  title: string;
  deleted_at: Date | null;
};

type ProjectSummaryRow = RowDataPacket & {
  project_id: string;
  title: string;
  updated_at: Date;
  thumbnail_uri: string | null;
  thumbnail_file_id: string | null;
};

/**
 * Inserts a new project row with the given UUID, owner, and optional title.
 * Returns the created record.
 */
export async function createProject(
  projectId: string,
  ownerUserId: string,
  title?: string,
): Promise<CreateProjectResult> {
  const resolvedTitle = title ?? 'Untitled project';

  await pool.execute<ResultSetHeader>(
    'INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)',
    [projectId, ownerUserId, resolvedTitle],
  );

  const [rows] = await pool.execute<ProjectRow[]>(
    'SELECT project_id, created_at FROM projects WHERE project_id = ?',
    [projectId],
  );

  const row = rows[0];
  if (!row) {
    throw new Error(`Project row not found after insert: ${projectId}`);
  }

  return { projectId: row.project_id, createdAt: row.created_at };
}

/**
 * Returns all projects owned by the given user, sorted by updated_at DESC.
 *
 * thumbnailUrl and thumbnailFileId are derived via two correlated subqueries:
 *   1. Primary: the earliest visual clip (type IN ('video','image')) in the project,
 *      ordered by start_frame ASC; excludes soft-deleted files.
 *   2. Fallback: the first file linked to the project via project_files pivot,
 *      ordered by files.created_at ASC; excludes soft-deleted files.
 *
 * The controller layer converts thumbnailFileId into a proxy URL of the form
 * `${baseUrl}/assets/:fileId/thumbnail`. The raw s3:// URI is returned in
 * thumbnailUrl so callers can check whether a thumbnail actually exists before
 * building the proxy URL.
 */
export async function findProjectsByUserId(userId: string): Promise<ProjectSummary[]> {
  const [rows] = await pool.execute<ProjectSummaryRow[]>(
    `SELECT
       p.project_id,
       p.title,
       p.updated_at,
       COALESCE(
         (SELECT f.thumbnail_uri
          FROM project_clips_current c
          JOIN files f ON f.file_id = c.file_id AND f.deleted_at IS NULL
          WHERE c.project_id = p.project_id
            AND c.type IN ('video', 'image')
          ORDER BY c.start_frame ASC
          LIMIT 1),
         (SELECT f.thumbnail_uri
          FROM project_files pf
          JOIN files f ON f.file_id = pf.file_id AND f.deleted_at IS NULL
          WHERE pf.project_id = p.project_id
          ORDER BY f.created_at ASC
          LIMIT 1)
       ) AS thumbnail_uri,
       COALESCE(
         (SELECT f.file_id
          FROM project_clips_current c
          JOIN files f ON f.file_id = c.file_id AND f.deleted_at IS NULL
          WHERE c.project_id = p.project_id
            AND c.type IN ('video', 'image')
          ORDER BY c.start_frame ASC
          LIMIT 1),
         (SELECT f.file_id
          FROM project_files pf
          JOIN files f ON f.file_id = pf.file_id AND f.deleted_at IS NULL
          WHERE pf.project_id = p.project_id
          ORDER BY f.created_at ASC
          LIMIT 1)
       ) AS thumbnail_file_id
     FROM projects p
    WHERE p.owner_user_id = ? AND p.deleted_at IS NULL
    ORDER BY p.updated_at DESC`,
    [userId],
  );

  return rows.map((row) => ({
    projectId: row.project_id,
    title: row.title,
    updatedAt: row.updated_at,
    thumbnailUrl: row.thumbnail_uri ?? null,
    thumbnailFileId: row.thumbnail_file_id ?? null,
  }));
}

/**
 * Returns a single non-deleted project by its primary key, or null when no row
 * matches or the project has been soft-deleted. Used for ownership checks.
 * Use `findProjectByIdIncludingDeleted` for restore paths.
 */
export async function findProjectById(projectId: string): Promise<ProjectRecord | null> {
  const [rows] = await pool.execute<ProjectRow[]>(
    'SELECT project_id, owner_user_id, title, created_at, updated_at, deleted_at FROM projects WHERE project_id = ? AND deleted_at IS NULL',
    [projectId],
  );

  if (!rows.length) return null;
  const row = rows[0]!;
  return {
    projectId: row.project_id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: null,
  };
}

/**
 * Returns a project row regardless of soft-delete state.
 * Intended only for internal restore/admin paths — not re-exported from barrels.
 */
export async function findProjectByIdIncludingDeleted(
  projectId: string,
): Promise<ProjectRecord | null> {
  const [rows] = await pool.execute<ProjectRow[]>(
    'SELECT project_id, owner_user_id, title, created_at, updated_at, deleted_at FROM projects WHERE project_id = ?',
    [projectId],
  );

  if (!rows.length) return null;
  const row = rows[0]!;
  return {
    projectId: row.project_id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

/**
 * Soft-deletes a project by setting `deleted_at` to the current timestamp.
 * Returns true when a row was updated, false when `projectId` was not found.
 */
export async function softDeleteProject(projectId: string): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    'UPDATE projects SET deleted_at = NOW(3) WHERE project_id = ? AND deleted_at IS NULL',
    [projectId],
  );
  return result.affectedRows > 0;
}

/** Lightweight trash-list entry for a soft-deleted project. */
export type SoftDeletedProjectRow = {
  projectId: string;
  title: string;
  deletedAt: Date;
};

type SoftDeletedProjectDbRow = RowDataPacket & {
  project_id: string;
  title: string;
  deleted_at: Date;
};

/**
 * Parses a keyset cursor string produced by `listSoftDeletedByUser`.
 * Format: `<ISO8601-deleted-at>:<id>`
 * Returns null when the string is absent or malformed.
 */
function parseSoftDeleteCursor(cursor: string | undefined): { deletedAt: Date; id: string } | null {
  if (!cursor) return null;
  const colonIdx = cursor.indexOf(':');
  if (colonIdx === -1) return null;
  const ts = cursor.slice(0, colonIdx);
  const id = cursor.slice(colonIdx + 1);
  const date = new Date(ts);
  if (isNaN(date.getTime()) || !id) return null;
  return { deletedAt: date, id };
}

/**
 * Returns the user's soft-deleted projects, newest-deleted-first.
 * When `cursor` is provided, returns only items older than the cursor position.
 * `limit` is capped at 100.
 */
export async function listSoftDeletedByUser(
  userId: string,
  limit: number,
  cursor?: string,
): Promise<SoftDeletedProjectRow[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit))));
  const parsed = parseSoftDeleteCursor(cursor);

  let rows: SoftDeletedProjectDbRow[];

  if (parsed) {
    const [result] = await pool.execute<SoftDeletedProjectDbRow[]>(
      `SELECT project_id, title, deleted_at
       FROM projects
       WHERE owner_user_id = ? AND deleted_at IS NOT NULL
         AND (deleted_at < ? OR (deleted_at = ? AND project_id < ?))
       ORDER BY deleted_at DESC, project_id DESC
       LIMIT ${safeLimit}`,
      [userId, parsed.deletedAt, parsed.deletedAt, parsed.id],
    );
    rows = result;
  } else {
    const [result] = await pool.execute<SoftDeletedProjectDbRow[]>(
      `SELECT project_id, title, deleted_at
       FROM projects
       WHERE owner_user_id = ? AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC, project_id DESC
       LIMIT ${safeLimit}`,
      [userId],
    );
    rows = result;
  }

  return rows.map((row) => ({
    projectId: row.project_id,
    title: row.title,
    deletedAt: row.deleted_at,
  }));
}

/**
 * Restores a soft-deleted project by clearing `deleted_at`.
 * Returns true when a row was updated, false when `projectId` was not found or
 * was not soft-deleted.
 */
export async function restoreProject(projectId: string): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    'UPDATE projects SET deleted_at = NULL WHERE project_id = ? AND deleted_at IS NOT NULL',
    [projectId],
  );
  return result.affectedRows > 0;
}
