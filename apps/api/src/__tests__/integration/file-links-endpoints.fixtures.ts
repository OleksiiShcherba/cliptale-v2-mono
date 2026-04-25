/**
 * Shared fixtures for the file-links endpoint integration tests.
 *
 * Exports DB seed helpers and shared state used by both test files:
 *   - file-links-endpoints.project.test.ts  (project-side)
 *   - file-links-endpoints.draft.test.ts    (draft-side)
 */
import { createHash, randomUUID } from 'node:crypto';
import type { Connection } from 'mysql2/promise';

export function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SeedResult = {
  userAId: string;
  userBId: string;
  tokenA: string;
  tokenB: string;
  sessionAId: string;
  sessionBId: string;
  projectA: string;
  projectB: string;
  draftA: string;
  fileA: string;
  fileB: string;
};

/**
 * Seeds two users, sessions, projects, a draft, and two files into the DB.
 * Returns IDs and tokens for use in tests.
 */
export async function seedFixtures(conn: Connection): Promise<SeedResult> {
  const userAId = `fla-${randomUUID().slice(0, 8)}`;
  const userBId = `flb-${randomUUID().slice(0, 8)}`;
  const tokenA = `tok-fla-${randomUUID()}`;
  const tokenB = `tok-flb-${randomUUID()}`;
  const sessionAId = randomUUID();
  const sessionBId = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();
  const draftA = randomUUID();
  const fileA = randomUUID();
  const fileB = randomUUID();

  // Users
  for (const [uid, email] of [
    [userAId, `${userAId}@test.com`],
    [userBId, `${userBId}@test.com`],
  ]) {
    await conn.execute(
      `INSERT INTO users (user_id, email, display_name, email_verified)
       VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE user_id = user_id`,
      [uid, email, uid],
    );
  }

  // Sessions
  const expiresAt = new Date(Date.now() + 3_600_000);
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [sessionAId, userAId, sha256(tokenA), expiresAt],
  );
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [sessionBId, userBId, sha256(tokenB), expiresAt],
  );

  // Projects
  await conn.execute(
    'INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)',
    [projectA, userAId, 'FL Test Project A'],
  );
  await conn.execute(
    'INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)',
    [projectB, userBId, 'FL Test Project B'],
  );

  // Draft
  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
    [draftA, userAId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
  );

  // Files
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [fileA, userAId, 'video', 's3://test-bucket/file-a.mp4', 'video/mp4', 'file-a.mp4'],
  );
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [fileB, userBId, 'image', 's3://test-bucket/file-b.png', 'image/png', 'file-b.png'],
  );

  return {
    userAId, userBId, tokenA, tokenB, sessionAId, sessionBId,
    projectA, projectB, draftA, fileA, fileB,
  };
}

/** Tears down all rows seeded by seedFixtures in FK-safe order. */
export async function teardownFixtures(conn: Connection, seed: SeedResult): Promise<void> {
  const fileIds = [seed.fileA, seed.fileB];
  const ph = fileIds.map(() => '?').join(',');

  await conn.query(`DELETE FROM project_files WHERE file_id IN (${ph})`, fileIds);
  await conn.query(`DELETE FROM draft_files WHERE file_id IN (${ph})`, fileIds);
  await conn.execute('DELETE FROM generation_drafts WHERE id = ?', [seed.draftA]);
  await conn.query(`DELETE FROM files WHERE file_id IN (${ph})`, fileIds);
  await conn.query(
    `DELETE FROM projects WHERE project_id IN (?, ?)`,
    [seed.projectA, seed.projectB],
  );
  await conn.query(
    `DELETE FROM sessions WHERE session_id IN (?, ?)`,
    [seed.sessionAId, seed.sessionBId],
  );
  await conn.query(
    `DELETE FROM users WHERE user_id IN (?, ?)`,
    [seed.userAId, seed.userBId],
  );
}
