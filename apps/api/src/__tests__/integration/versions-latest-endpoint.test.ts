/**
 * Integration tests for GET /projects/:id/versions/latest
 *
 * Verifies the full Express → middleware → service → repository → DB chain.
 * Requires a live MySQL instance: docker compose up -d db
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/versions-latest-endpoint.test.ts
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

const baseDoc = {
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
  docJson: baseDoc,
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

// ── GET /projects/:id/versions/latest ─────────────────────────────────────────

describe('GET /projects/:id/versions/latest', () => {
  it('returns 404 for a project with no versions', async () => {
    const res = await request(app)
      .get('/projects/proj-no-versions-latest/versions/latest')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns 200 with { versionId, docJson, createdAt } for a project with one version', async () => {
    const projectId = `proj-latest-one-${Date.now()}`;
    const expectedVersionId = await createProjectWithVersion(projectId);

    const res = await request(app)
      .get(`/projects/${projectId}/versions/latest`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);

    const body = res.body as { versionId: number; docJson: unknown; createdAt: string };
    expect(body.versionId).toBe(expectedVersionId);
    expect(typeof body.createdAt).toBe('string');
    expect(new Date(body.createdAt).getTime()).toBeGreaterThan(0);
    expect(body.docJson).toBeTruthy();
    expect(typeof body.docJson).toBe('object');
  });

  it('returns the newest versionId when the project has multiple versions', async () => {
    const projectId = `proj-latest-multi-${Date.now()}`;
    const firstVersionId = await createProjectWithVersion(projectId);

    // Save a second version on top of the first.
    const secondRes = await request(app)
      .post(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({
        ...firstSaveBody,
        parentVersionId: firstVersionId,
        docJson: { ...baseDoc, title: 'Updated Title' },
      });
    expect(secondRes.status).toBe(201);
    const secondVersionId = (secondRes.body as { versionId: number }).versionId;

    const latestRes = await request(app)
      .get(`/projects/${projectId}/versions/latest`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(latestRes.status).toBe(200);
    const body = latestRes.body as { versionId: number; docJson: Record<string, unknown> };
    // The latest endpoint must return the second (newest) version.
    expect(body.versionId).toBe(secondVersionId);
    expect(body.versionId).not.toBe(firstVersionId);
    // And its docJson must reflect the updated payload.
    expect((body.docJson as Record<string, unknown>)['title']).toBe('Updated Title');
  });

  it('returns the full docJson payload (not a summary)', async () => {
    const projectId = `proj-latest-doc-${Date.now()}`;
    await createProjectWithVersion(projectId);

    const res = await request(app)
      .get(`/projects/${projectId}/versions/latest`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    const body = res.body as { docJson: Record<string, unknown> };
    // Unlike list-versions summaries, the docJson field must be present and
    // contain the full document (at least its title field).
    expect(body.docJson).toMatchObject({ title: 'Test Project' });
  });
});
