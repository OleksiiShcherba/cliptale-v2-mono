/**
 * Shared test fixtures for `file.service.test.ts`.
 *
 * All helpers create rows directly via the DB connection so tests are
 * independent of the service's `createUploadUrl` happy path.
 */
import type { Connection } from 'mysql2/promise';

// ── Seed helpers ──────────────────────────────────────────────────────────────

/** Default test user ID used across file service tests. */
export const FILE_TEST_USER_ID = 'file-svc-test-user-001';

/** A second user ID used to verify ownership isolation. */
export const OTHER_USER_ID = 'file-svc-other-user-002';

/** Tracks file IDs inserted during tests so they can be cleaned up in afterAll. */
export const insertedFileIds: string[] = [];

/**
 * Inserts a minimal `files` row with the given status.
 * Returns the `file_id` that was inserted.
 */
export async function seedFile(
  conn: Connection,
  overrides: {
    fileId?: string;
    userId?: string;
    kind?: string;
    storageUri?: string;
    mimeType?: string;
    status?: string;
    durationMs?: number;
    bytes?: number;
    displayName?: string;
  } = {},
): Promise<string> {
  const fileId = overrides.fileId ?? `file-seed-${Math.random().toString(36).slice(2, 10)}`;
  const userId = overrides.userId ?? FILE_TEST_USER_ID;
  const kind = overrides.kind ?? 'video';
  const storageUri = overrides.storageUri ?? `s3://test-bucket/users/${userId}/files/${fileId}/test.mp4`;
  const mimeType = overrides.mimeType ?? 'video/mp4';
  const status = overrides.status ?? 'ready';
  const displayName = overrides.displayName ?? 'test.mp4';

  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, status, duration_ms, bytes, display_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [fileId, userId, kind, storageUri, mimeType, status,
     overrides.durationMs ?? null, overrides.bytes ?? null, displayName],
  );

  insertedFileIds.push(fileId);
  return fileId;
}

/**
 * Inserts a row into the `users` table if it does not exist.
 * Required because `files.user_id` has a FK → `users.user_id`.
 */
export async function ensureUser(conn: Connection, userId: string): Promise<void> {
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW())`,
    [userId, `${userId}@test.local`, `Test ${userId}`],
  );
}

/** Deletes all rows inserted during the test run to leave the DB clean. */
export async function cleanupFiles(conn: Connection, fileIds: string[]): Promise<void> {
  if (!fileIds.length) return;
  const placeholders = fileIds.map(() => '?').join(',');
  await conn.query(
    `DELETE FROM files WHERE file_id IN (${placeholders})`,
    fileIds,
  );
}
