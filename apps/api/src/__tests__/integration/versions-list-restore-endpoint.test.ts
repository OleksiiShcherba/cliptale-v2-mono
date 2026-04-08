/**
 * Integration tests for:
 *   GET  /projects/:id/versions
 *   POST /projects/:id/versions/:versionId/restore
 *
 * Verifies the full Express → middleware → service → repository → DB chain.
 * Requires a live MySQL instance: docker compose up -d db
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/versions-list-restore-endpoint.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mysql, { type Connection } from 'mysql2/promise';

// ── Set env vars before app is imported ──────────────────────────────────────
const JWT_SECRET = 'integration-test-jwt-secret-exactly-32ch!';

Object.assign(process.env, {
  APP_DB_HOST:              process.env['APP_DB_HOST']              ?? 'localhost',
  APP_DB_PORT:              process.env['APP_DB_PORT']              ?? '3306',
  APP_DB_NAME:              process.env['APP_DB_NAME']              ?? 'cliptale',
  APP_DB_USER:              process.env['APP_DB_USER']              ?? 'cliptale',
  APP_DB_PASSWORD:          process.env['APP_DB_PASSWORD']          ?? 'cliptale',
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6379',
  APP_S3_BUCKET:            process.env['APP_S3_BUCKET']            ?? 'test-bucket',
  APP_S3_REGION:            process.env['APP_S3_REGION']            ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID:     process.env['APP_S3_ACCESS_KEY_ID']     ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET:           JWT_SECRET,
  APP_DEV_AUTH_BYPASS:      'true',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

/** Project IDs created during tests — cleaned up in afterAll. */
const insertedProjectIds: string[] = [];

function validToken(): string {
  return jwt.sign({ sub: 'user-test-001', email: 'qa@example.com' }, JWT_SECRET);
}

const validDoc = {
  schemaVersion: 1,
  id: '00000000-0000-0000-0000-000000000001',
  title: 'Test Project',
  fps: 30,
  durationFrames: 300,
  width: 1920,
  height: 1080,
  tracks: [],
  clips: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const firstSaveBody = {
  docJson: validDoc,
  docSchemaVersion: 1,
  parentVersionId: null,
  patches: [],
  inversePatches: [],
};

/** Creates a project with one saved version and returns its versionId. */
async function createProjectWithVersion(projectId: string): Promise<number> {
  insertedProjectIds.push(projectId);
  const res = await request(app)
    .post(`/projects/${projectId}/versions`)
    .set('Authorization', `Bearer ${validToken()}`)
    .send(firstSaveBody);

  expect(res.status).toBe(201);
  return (res.body as { versionId: number }).versionId;
}

async function cleanupProjects(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await conn.query(
    `DELETE FROM project_audit_log WHERE project_id IN (${placeholders})`,
    ids,
  );
  await conn.query(
    `DELETE pv FROM project_version_patches pv
     INNER JOIN project_versions pver ON pv.version_id = pver.version_id
     WHERE pver.project_id IN (${placeholders})`,
    ids,
  );
  await conn.query(
    `DELETE FROM project_versions WHERE project_id IN (${placeholders})`,
    ids,
  );
  await conn.query(
    `DELETE FROM projects WHERE project_id IN (${placeholders})`,
    ids,
  );
}

beforeAll(async () => {
  const mod = await import('../../index.js');
  app = mod.default;

  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });
});

afterAll(async () => {
  await cleanupProjects(insertedProjectIds);
  await conn.end();
});

// ── GET /projects/:id/versions ───────────────────────────────────────────────

describe('GET /projects/:id/versions', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/projects/proj-anon/versions');
    expect(res.status).toBe(401);
  });

  it('returns 401 when the JWT is invalid', async () => {
    const res = await request(app)
      .get('/projects/proj-anon/versions')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('returns 200 with an empty array for a project with no versions', async () => {
    const res = await request(app)
      .get('/projects/proj-no-versions-ever/versions')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 with version summaries for a project that has versions', async () => {
    const projectId = `proj-list-${Date.now()}`;
    const versionId = await createProjectWithVersion(projectId);

    const res = await request(app)
      .get(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);

    const entry = (res.body as Array<Record<string, unknown>>)[0]!;
    expect(entry['versionId']).toBe(versionId);
    expect(typeof entry['createdAt']).toBe('string');
    expect(new Date(entry['createdAt'] as string).getTime()).toBeGreaterThan(0);
    expect(entry['createdByUserId']).toBe('user-test-001');
    expect(entry['durationFrames']).toBe(300);
  });

  it('returns versions newest-first when multiple versions exist', async () => {
    const projectId = `proj-list-order-${Date.now()}`;
    const firstId = await createProjectWithVersion(projectId);

    const secondRes = await request(app)
      .post(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...firstSaveBody, parentVersionId: firstId });

    expect(secondRes.status).toBe(201);
    const secondId = (secondRes.body as { versionId: number }).versionId;

    const listRes = await request(app)
      .get(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(listRes.status).toBe(200);
    const versions = listRes.body as Array<{ versionId: number }>;
    expect(versions).toHaveLength(2);
    expect(versions[0]!.versionId).toBe(secondId);
    expect(versions[1]!.versionId).toBe(firstId);
  });

  it('does not include doc_json in the response entries', async () => {
    const projectId = `proj-list-no-doc-${Date.now()}`;
    await createProjectWithVersion(projectId);

    const res = await request(app)
      .get(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    const entry = (res.body as Array<Record<string, unknown>>)[0]!;
    expect(entry).not.toHaveProperty('docJson');
    expect(entry).not.toHaveProperty('doc_json');
  });
});

// ── POST /projects/:id/versions/:versionId/restore ────────────────────────────

describe('POST /projects/:id/versions/:versionId/restore', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).post('/projects/proj-anon/versions/1/restore');
    expect(res.status).toBe(401);
  });

  it('returns 401 when the JWT is invalid', async () => {
    const res = await request(app)
      .post('/projects/proj-anon/versions/1/restore')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('returns 400 when versionId is not a valid integer', async () => {
    const res = await request(app)
      .post('/projects/proj-abc/versions/not-a-number/restore')
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(400);
  });

  it('returns 404 when the versionId does not exist for the project', async () => {
    const res = await request(app)
      .post('/projects/proj-abc/versions/99999999/restore')
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when versionId belongs to a different project', async () => {
    const projectA = `proj-restore-a-${Date.now()}`;
    const versionA = await createProjectWithVersion(projectA);

    const projectB = `proj-restore-b-${Date.now()}`;
    insertedProjectIds.push(projectB);

    const res = await request(app)
      .post(`/projects/${projectB}/versions/${versionA}/restore`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns 200 with the full docJson on a successful restore', async () => {
    const projectId = `proj-restore-ok-${Date.now()}`;
    const versionId = await createProjectWithVersion(projectId);

    const res = await request(app)
      .post(`/projects/${projectId}/versions/${versionId}/restore`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('docJson');
    const docJson = (res.body as { docJson: Record<string, unknown> }).docJson;
    expect(docJson['title']).toBe('Test Project');
    expect(docJson['durationFrames']).toBe(300);
  });

  it('updates latest_version_id in the projects table to the restored version', async () => {
    const projectId = `proj-restore-ptr-${Date.now()}`;
    const firstId = await createProjectWithVersion(projectId);

    const secondRes = await request(app)
      .post(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...firstSaveBody, parentVersionId: firstId });
    expect(secondRes.status).toBe(201);

    // Now restore back to first version.
    const restoreRes = await request(app)
      .post(`/projects/${projectId}/versions/${firstId}/restore`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(restoreRes.status).toBe(200);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT latest_version_id FROM projects WHERE project_id = ?',
      [projectId],
    );
    expect(rows[0]!['latest_version_id']).toBe(firstId);
  });

  it('writes a project.restore audit log entry to the DB', async () => {
    const projectId = `proj-restore-audit-${Date.now()}`;
    const versionId = await createProjectWithVersion(projectId);

    const restoreRes = await request(app)
      .post(`/projects/${projectId}/versions/${versionId}/restore`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(restoreRes.status).toBe(200);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT * FROM project_audit_log
       WHERE project_id = ? AND event_type = 'project.restore'`,
      [projectId],
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!['version_id']).toBe(versionId);
  });
});
