/**
 * Integration tests for POST /projects/:id/versions
 *
 * Verifies the full Express → middleware → service → repository → DB chain.
 * Requires a live MySQL instance: docker compose up -d db
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/versions-persist-endpoint.test.ts
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
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

/** Project IDs created during tests — cleaned up in afterAll. */
const insertedProjectIds: string[] = [];

function validToken(): string {
  return jwt.sign({ sub: 'user-test-001', email: 'qa@example.com' }, JWT_SECRET);
}

const validDoc = { title: 'Test Project', tracks: [] };

const validBody = {
  docJson: validDoc,
  docSchemaVersion: 1,
  parentVersionId: null,
  patches: [],
  inversePatches: [],
};

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
  if (insertedProjectIds.length) {
    // Delete from child tables first to respect FK ordering (audit log, patches, versions, projects).
    const placeholders = insertedProjectIds.map(() => '?').join(',');
    await conn.query(
      `DELETE FROM project_audit_log WHERE project_id IN (${placeholders})`,
      insertedProjectIds,
    );
    await conn.query(
      `DELETE pv FROM project_version_patches pv
       INNER JOIN project_versions pver ON pv.version_id = pver.version_id
       WHERE pver.project_id IN (${placeholders})`,
      insertedProjectIds,
    );
    await conn.query(
      `DELETE FROM project_versions WHERE project_id IN (${placeholders})`,
      insertedProjectIds,
    );
    await conn.query(
      `DELETE FROM projects WHERE project_id IN (${placeholders})`,
      insertedProjectIds,
    );
  }
  await conn.end();
});

// ── POST /projects/:id/versions ───────────────────────────────────────────────

describe('POST /projects/:id/versions', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app)
      .post('/projects/proj-anon/versions')
      .send(validBody);

    expect(res.status).toBe(401);
  });

  it('returns 401 when the JWT is invalid', async () => {
    const res = await request(app)
      .post('/projects/proj-anon/versions')
      .set('Authorization', 'Bearer not-a-real-token')
      .send(validBody);

    expect(res.status).toBe(401);
  });

  it('returns 400 when request body is missing required fields', async () => {
    const res = await request(app)
      .post('/projects/proj-001/versions')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ docSchemaVersion: 1 }); // missing docJson, parentVersionId

    expect(res.status).toBe(400);
  });

  it('returns 422 when doc_schema_version is unsupported', async () => {
    const res = await request(app)
      .post('/projects/proj-schema-bad/versions')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...validBody, docSchemaVersion: 99 });

    expect(res.status).toBe(422);
  });

  it('returns 201 with versionId and createdAt on first save (parentVersionId null)', async () => {
    const projectId = `proj-first-save-${Date.now()}`;
    insertedProjectIds.push(projectId);

    const res = await request(app)
      .post(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      versionId: expect.any(Number),
      createdAt: expect.any(String),
    });
    expect(new Date(res.body.createdAt as string).getTime()).toBeGreaterThan(0);
  });

  it('writes version and patch rows to the DB on success', async () => {
    const projectId = `proj-db-check-${Date.now()}`;
    insertedProjectIds.push(projectId);

    const res = await request(app)
      .post(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({
        ...validBody,
        patches: [{ op: 'add', path: '/title', value: 'Test Project' }],
        inversePatches: [{ op: 'remove', path: '/title' }],
      });

    expect(res.status).toBe(201);
    const { versionId } = res.body as { versionId: number };

    const [versionRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM project_versions WHERE version_id = ?',
      [versionId],
    );
    expect(versionRows).toHaveLength(1);
    expect(versionRows[0]!['project_id']).toBe(projectId);

    const [patchRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM project_version_patches WHERE version_id = ?',
      [versionId],
    );
    expect(patchRows).toHaveLength(1);

    const [projectRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT latest_version_id FROM projects WHERE project_id = ?',
      [projectId],
    );
    expect(projectRows).toHaveLength(1);
    expect(projectRows[0]!['latest_version_id']).toBe(versionId);

    const [auditRows] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT * FROM project_audit_log WHERE project_id = ? AND event_type = 'project.save'",
      [projectId],
    );
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 201 for a second save with the correct parentVersionId', async () => {
    const projectId = `proj-second-save-${Date.now()}`;
    insertedProjectIds.push(projectId);

    // First save.
    const first = await request(app)
      .post(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send(validBody);

    expect(first.status).toBe(201);
    const firstVersionId = (first.body as { versionId: number }).versionId;

    // Second save with correct parentVersionId.
    const second = await request(app)
      .post(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...validBody, parentVersionId: firstVersionId });

    expect(second.status).toBe(201);
    expect((second.body as { versionId: number }).versionId).toBeGreaterThan(firstVersionId);
  });

  it('returns 409 when parentVersionId is stale', async () => {
    const projectId = `proj-conflict-${Date.now()}`;
    insertedProjectIds.push(projectId);

    // First save — establishes latest_version_id.
    const first = await request(app)
      .post(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send(validBody);

    expect(first.status).toBe(201);

    // Second save with a wrong (stale) parentVersionId.
    const conflict = await request(app)
      .post(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...validBody, parentVersionId: 99999 });

    expect(conflict.status).toBe(409);
  });

  it('returns 409 when parentVersionId is null but a version already exists', async () => {
    const projectId = `proj-null-conflict-${Date.now()}`;
    insertedProjectIds.push(projectId);

    // First save.
    const first = await request(app)
      .post(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send(validBody);

    expect(first.status).toBe(201);

    // Second save with null parentVersionId — should conflict.
    const conflict = await request(app)
      .post(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...validBody, parentVersionId: null });

    expect(conflict.status).toBe(409);
  });

  it('stores patches as valid JSON in the DB', async () => {
    const projectId = `proj-patches-json-${Date.now()}`;
    insertedProjectIds.push(projectId);

    const patches = [{ op: 'replace', path: '/title', value: 'Updated' }];
    const inversePatches = [{ op: 'replace', path: '/title', value: 'Original' }];

    const res = await request(app)
      .post(`/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...validBody, patches, inversePatches });

    expect(res.status).toBe(201);
    const { versionId } = res.body as { versionId: number };

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT patches_json, inverse_patches_json FROM project_version_patches WHERE version_id = ?',
      [versionId],
    );

    expect(rows).toHaveLength(1);
    const stored = rows[0]!;

    // MySQL JSON columns may be returned pre-parsed by the driver or as a string.
    const parsedPatches =
      typeof stored['patches_json'] === 'string'
        ? JSON.parse(stored['patches_json'] as string)
        : stored['patches_json'];
    const parsedInversePatches =
      typeof stored['inverse_patches_json'] === 'string'
        ? JSON.parse(stored['inverse_patches_json'] as string)
        : stored['inverse_patches_json'];

    expect(parsedPatches).toEqual(patches);
    expect(parsedInversePatches).toEqual(inversePatches);
  });
});
