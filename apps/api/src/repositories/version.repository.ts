import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** Full version record as returned by list queries. */
export type ProjectVersion = {
  versionId: number;
  projectId: string;
  docJson: unknown;
  docSchemaVersion: number;
  createdByUserId: string | null;
  createdAt: Date;
  parentVersionId: number | null;
};

/**
 * Lightweight version summary for list endpoints (excludes doc_json but includes
 * durationFrames extracted from doc_json for display purposes).
 */
export type ProjectVersionSummary = {
  versionId: number;
  projectId: string;
  docSchemaVersion: number;
  createdByUserId: string | null;
  createdAt: Date;
  parentVersionId: number | null;
  durationFrames: number | null;
};

type ProjectVersionRow = RowDataPacket & {
  version_id: number;
  project_id: string;
  doc_json: unknown;
  doc_schema_version: number;
  created_by_user_id: string | null;
  created_at: Date;
  parent_version_id: number | null;
};

type ProjectVersionSummaryRow = RowDataPacket & {
  version_id: number;
  project_id: string;
  doc_schema_version: number;
  created_by_user_id: string | null;
  created_at: Date;
  parent_version_id: number | null;
  duration_frames: number | null;
};

function mapRowToVersion(row: ProjectVersionRow): ProjectVersion {
  return {
    versionId: row.version_id,
    projectId: row.project_id,
    docJson: row.doc_json,
    docSchemaVersion: row.doc_schema_version,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    parentVersionId: row.parent_version_id,
  };
}

function mapRowToVersionSummary(row: ProjectVersionSummaryRow): ProjectVersionSummary {
  return {
    versionId: row.version_id,
    projectId: row.project_id,
    docSchemaVersion: row.doc_schema_version,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    parentVersionId: row.parent_version_id,
    durationFrames: row.duration_frames ?? null,
  };
}

/** Parameters for inserting a new version atomically. */
export type InsertVersionParams = {
  projectId: string;
  docJson: unknown;
  docSchemaVersion: number;
  parentVersionId: number | null;
  patches: unknown;
  inversePatches: unknown;
  createdByUserId: string | null;
};

/** Result of a successful version insert. */
export type InsertVersionResult = {
  versionId: number;
  createdAt: Date;
};

/**
 * Atomically inserts a new version record, its patch pair, updates
 * `projects.latest_version_id`, and appends a `project.save` audit log entry.
 *
 * The caller must supply a connection (not a pool) so that the service layer
 * can manage the transaction boundary. Accepts a connection from the pool.
 */
export async function insertVersionTransaction(
  conn: PoolConnection,
  params: InsertVersionParams,
): Promise<InsertVersionResult> {
  // Insert the version snapshot.
  const [versionResult] = await conn.execute<ResultSetHeader>(
    `INSERT INTO project_versions
       (project_id, doc_json, doc_schema_version, created_by_user_id, parent_version_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      params.projectId,
      JSON.stringify(params.docJson),
      params.docSchemaVersion,
      params.createdByUserId,
      params.parentVersionId,
    ],
  );

  const versionId = versionResult.insertId;

  // Insert the Immer patch pair.
  await conn.execute(
    `INSERT INTO project_version_patches (version_id, patches_json, inverse_patches_json)
     VALUES (?, ?, ?)`,
    [versionId, JSON.stringify(params.patches), JSON.stringify(params.inversePatches)],
  );

  // Update the project's latest_version_id pointer (upsert — row may not exist yet).
  await conn.execute(
    `INSERT INTO projects (project_id, latest_version_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE latest_version_id = VALUES(latest_version_id)`,
    [params.projectId, versionId],
  );

  // Write the audit log entry.
  await conn.execute(
    `INSERT INTO project_audit_log (project_id, event_type, version_id, user_id)
     VALUES (?, 'project.save', ?, ?)`,
    [params.projectId, versionId, params.createdByUserId],
  );

  // Retrieve the server-generated created_at timestamp.
  const [rows] = await conn.execute<ProjectVersionRow[]>(
    'SELECT version_id, created_at FROM project_versions WHERE version_id = ?',
    [versionId],
  );

  const row = rows[0];
  if (!row) {
    throw new Error(`Failed to retrieve inserted version ${versionId}`);
  }

  return { versionId, createdAt: row.created_at };
}

/**
 * Returns the current `latest_version_id` for a project, or null if the
 * project row does not exist yet (first save scenario).
 */
export async function getLatestVersionId(projectId: string): Promise<number | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT latest_version_id FROM projects WHERE project_id = ?',
    [projectId],
  );
  if (!rows.length) return null;
  const value = rows[0]!['latest_version_id'];
  return value === null || value === undefined ? null : (value as number);
}

/** Returns a single version record with its full doc_json, or null if not found. */
export async function getVersionById(
  projectId: string,
  versionId: number,
): Promise<ProjectVersion | null> {
  const [rows] = await pool.execute<ProjectVersionRow[]>(
    'SELECT * FROM project_versions WHERE version_id = ? AND project_id = ?',
    [versionId, projectId],
  );
  return rows.length ? mapRowToVersion(rows[0]!) : null;
}

/**
 * Returns the last 50 versions for a project (newest first).
 * Excludes the full doc_json but extracts `durationFrames` for display.
 */
export async function listVersions(projectId: string): Promise<ProjectVersionSummary[]> {
  const [rows] = await pool.execute<ProjectVersionSummaryRow[]>(
    `SELECT version_id, project_id, doc_schema_version, created_by_user_id,
            created_at, parent_version_id,
            JSON_EXTRACT(doc_json, '$.durationFrames') AS duration_frames
     FROM project_versions
     WHERE project_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [projectId],
  );
  return rows.map(mapRowToVersionSummary);
}

/**
 * Atomically restores a project to a prior version by:
 * 1. Updating `projects.latest_version_id` to the target version.
 * 2. Writing a `project.restore` audit log entry.
 *
 * The caller must supply a connection so the service layer manages the transaction.
 * Does NOT verify that `versionId` belongs to the project — callers must do that check first.
 */
export async function restoreVersionTransaction(
  conn: PoolConnection,
  params: { projectId: string; versionId: number; restoredByUserId: string | null },
): Promise<void> {
  await conn.execute(
    `INSERT INTO projects (project_id, latest_version_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE latest_version_id = VALUES(latest_version_id)`,
    [params.projectId, params.versionId],
  );

  await conn.execute(
    `INSERT INTO project_audit_log (project_id, event_type, version_id, user_id)
     VALUES (?, 'project.restore', ?, ?)`,
    [params.projectId, params.versionId, params.restoredByUserId],
  );
}

/** Acquires a connection from the pool for use within a transaction. */
export async function getConnection(): Promise<PoolConnection> {
  return pool.getConnection();
}
