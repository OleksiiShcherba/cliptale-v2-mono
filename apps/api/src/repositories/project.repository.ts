import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** Minimal project row returned after creation. */
export type CreateProjectResult = {
  projectId: string;
  createdAt: Date;
};

type ProjectRow = RowDataPacket & {
  project_id: string;
  created_at: Date;
};

/**
 * Inserts a new project row with the given UUID and returns the created record.
 * The caller is responsible for generating a unique `projectId`.
 */
export async function createProject(projectId: string): Promise<CreateProjectResult> {
  await pool.execute<ResultSetHeader>(
    'INSERT INTO projects (project_id) VALUES (?)',
    [projectId],
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
