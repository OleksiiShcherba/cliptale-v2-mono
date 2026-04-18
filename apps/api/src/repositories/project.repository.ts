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
};

/**
 * Summary of a project returned by findProjectsByUserId.
 * thumbnailUrl is derived from the earliest visual clip in the project.
 */
export type ProjectSummary = {
  projectId: string;
  title: string;
  updatedAt: Date;
  thumbnailUrl: string | null;
};

type ProjectRow = RowDataPacket & {
  project_id: string;
  owner_user_id: string;
  created_at: Date;
  updated_at: Date;
  title: string;
};

type ProjectSummaryRow = RowDataPacket & {
  project_id: string;
  title: string;
  updated_at: Date;
  thumbnail_uri: string | null;
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
 * thumbnailUrl is always null in this iteration — the `files` table does not
 * store a separate `thumbnail_uri` column (the old `project_assets_current` did).
 * Thumbnail generation will be wired in a later migration when the ingest worker
 * begins writing derivative paths back to `files`.
 */
export async function findProjectsByUserId(userId: string): Promise<ProjectSummary[]> {
  const [rows] = await pool.execute<ProjectSummaryRow[]>(
    `SELECT
       p.project_id,
       p.title,
       p.updated_at,
       NULL AS thumbnail_uri
     FROM projects p
    WHERE p.owner_user_id = ?
    ORDER BY p.updated_at DESC`,
    [userId],
  );

  return rows.map((row) => ({
    projectId: row.project_id,
    title: row.title,
    updatedAt: row.updated_at,
    thumbnailUrl: row.thumbnail_uri ?? null,
  }));
}

/**
 * Returns a single project by its primary key, or null when no row matches.
 * Used for ownership checks by the file-links service.
 */
export async function findProjectById(projectId: string): Promise<ProjectRecord | null> {
  const [rows] = await pool.execute<ProjectRow[]>(
    'SELECT project_id, owner_user_id, title, created_at, updated_at FROM projects WHERE project_id = ?',
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
  };
}
