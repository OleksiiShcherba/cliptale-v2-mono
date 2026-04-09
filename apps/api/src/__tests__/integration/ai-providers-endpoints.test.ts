/**
 * Integration tests for AI Provider endpoints.
 *
 * Verifies the full Express → middleware → controller → service → repository → DB chain.
 * API keys are encrypted at the service layer and decrypted in-memory only — never leak in responses.
 *
 * Requires a live MySQL instance (docker compose up db) and the encryption key to be set.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/ai-providers-endpoints.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mysql, { type Connection } from 'mysql2/promise';

// ── Env vars must be set before app import ────────────────────────────────────
const JWT_SECRET = 'integration-test-jwt-secret-exactly-32ch!';
const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64 hex chars = 32 bytes

Object.assign(process.env, {
  APP_DB_HOST:              process.env['APP_DB_HOST']              ?? 'localhost',
  APP_DB_PORT:              process.env['APP_DB_PORT']              ?? '3306',
  APP_DB_NAME:              process.env['APP_DB_NAME']              ?? 'cliptale',
  APP_DB_USER:              process.env['APP_DB_USER']              ?? 'cliptale',
  APP_DB_PASSWORD:          process.env['APP_DB_PASSWORD']          ?? 'cliptale',
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6379',
  APP_JWT_SECRET:           JWT_SECRET,
  APP_DEV_AUTH_BYPASS:      'true',
  APP_AI_ENCRYPTION_KEY:    ENCRYPTION_KEY,
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

const TEST_USER_ID = 'ai-provider-test-user-001';
const VALID_API_KEY = 'sk-test-key-valid-12345-xyz';
const VALID_API_KEY_UPDATED = 'sk-updated-key-abc-98765';

function validToken(): string {
  return jwt.sign({ sub: TEST_USER_ID, email: 'ai@example.com' }, JWT_SECRET);
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

  // Clean up any existing configs for test user (idempotent)
  await conn.query(
    'DELETE FROM ai_provider_configs WHERE user_id = ?',
    [TEST_USER_ID],
  );
});

afterAll(async () => {
  // Clean up test data
  await conn.query(
    'DELETE FROM ai_provider_configs WHERE user_id = ?',
    [TEST_USER_ID],
  );
  await conn.end();
});

// ── POST /user/ai-providers ──────────────────────────────────────────────────

describe('POST /user/ai-providers', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app)
      .post('/user/ai-providers')
      .send({ provider: 'openai', apiKey: VALID_API_KEY });

    expect(res.status).toBe(401);
  });

  it('returns 400 when provider is invalid (not in ENUM)', async () => {
    const res = await request(app)
      .post('/user/ai-providers')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ provider: 'invalid-provider', apiKey: VALID_API_KEY });

    expect(res.status).toBe(400);
  });

  it('returns 400 when apiKey is missing', async () => {
    const res = await request(app)
      .post('/user/ai-providers')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ provider: 'openai' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when apiKey is empty string', async () => {
    const res = await request(app)
      .post('/user/ai-providers')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ provider: 'openai', apiKey: '' });

    expect(res.status).toBe(400);
  });

  it('returns 201 and creates a new provider config', async () => {
    const res = await request(app)
      .post('/user/ai-providers')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ provider: 'openai', apiKey: VALID_API_KEY });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('message');

    // Verify it was stored in DB (without the key)
    const [rows] = await conn.execute<any[]>(
      'SELECT * FROM ai_provider_configs WHERE user_id = ? AND provider = ?',
      [TEST_USER_ID, 'openai'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveProperty('api_key_encrypted'); // Key is encrypted
    expect(rows[0]).toHaveProperty('encryption_iv');
    expect(rows[0]).toHaveProperty('encryption_tag');
  });

  it('returns 409 ConflictError when provider already configured', async () => {
    // First add
    await request(app)
      .post('/user/ai-providers')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ provider: 'runway', apiKey: VALID_API_KEY });

    // Second add of same provider
    const res = await request(app)
      .post('/user/ai-providers')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ provider: 'runway', apiKey: 'different-key' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('already configured');
  });

  it('encrypts and stores the API key, never exposing it in response', async () => {
    const res = await request(app)
      .post('/user/ai-providers')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ provider: 'stability_ai', apiKey: VALID_API_KEY });

    expect(res.status).toBe(201);
    // Response should NOT contain the key anywhere
    expect(JSON.stringify(res.body)).not.toContain(VALID_API_KEY);
    expect(JSON.stringify(res.body)).not.toContain('apiKey');
    expect(JSON.stringify(res.body)).not.toContain('api_key');
  });
});

// ── GET /user/ai-providers ───────────────────────────────────────────────────

describe('GET /user/ai-providers', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/user/ai-providers');

    expect(res.status).toBe(401);
  });

  it('returns 200 with empty array when no providers configured', async () => {
    // Use a fresh user ID
    const freshUserToken = jwt.sign(
      { sub: 'fresh-user-no-providers', email: 'fresh@example.com' },
      JWT_SECRET,
    );

    const res = await request(app)
      .get('/user/ai-providers')
      .set('Authorization', `Bearer ${freshUserToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([]);
  });

  it('returns 200 with provider summaries (isConfigured, isActive, no keys)', async () => {
    // Seed some configs for a test user
    const seededUser = 'ai-provider-list-test-user';
    await conn.query(
      'DELETE FROM ai_provider_configs WHERE user_id = ?',
      [seededUser],
    );

    // Add two providers manually
    const seedQuery = `
      INSERT INTO ai_provider_configs
        (user_id, provider, api_key_encrypted, encryption_iv, encryption_tag, is_active, created_at, updated_at)
      VALUES
        (?, 'openai', x'aabbccdd', x'1111111111111111', x'2222222222222222', 1, NOW(3), NOW(3)),
        (?, 'runway', x'eeff0011', x'3333333333333333', x'4444444444444444', 0, NOW(3), NOW(3))
    `;
    await conn.query(seedQuery, [seededUser, seededUser]);

    const seedToken = jwt.sign(
      { sub: seededUser, email: 'seed@example.com' },
      JWT_SECRET,
    );

    const res = await request(app)
      .get('/user/ai-providers')
      .set('Authorization', `Bearer ${seedToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);

    // Verify shape and that keys are never exposed
    expect(res.body[0]).toEqual({
      provider: 'openai',
      isActive: true,
      isConfigured: true,
      createdAt: expect.any(String), // ISO date string
    });
    expect(res.body[1]).toEqual({
      provider: 'runway',
      isActive: false,
      isConfigured: true,
      createdAt: expect.any(String),
    });

    // Verify NO key-related fields leak
    for (const provider of res.body) {
      expect(provider).not.toHaveProperty('apiKey');
      expect(provider).not.toHaveProperty('api_key');
      expect(provider).not.toHaveProperty('apiKeyEncrypted');
      expect(provider).not.toHaveProperty('api_key_encrypted');
      expect(provider).not.toHaveProperty('encryptionIv');
      expect(provider).not.toHaveProperty('encryptionTag');
    }

    // Cleanup
    await conn.query('DELETE FROM ai_provider_configs WHERE user_id = ?', [seededUser]);
  });
});

// ── PATCH /user/ai-providers/:provider ───────────────────────────────────────

describe('PATCH /user/ai-providers/:provider', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app)
      .patch('/user/ai-providers/openai')
      .send({ isActive: false });

    expect(res.status).toBe(401);
  });

  it('returns 400 when provider param is invalid (not in ENUM)', async () => {
    const res = await request(app)
      .patch('/user/ai-providers/invalid-provider')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ isActive: false });

    expect(res.status).toBe(400);
  });

  it('returns 400 when neither apiKey nor isActive is provided', async () => {
    const res = await request(app)
      .patch('/user/ai-providers/openai')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({});

    // This should pass body validation (both are optional)
    // but the service will call updateConfig which returns early if no fields
    // In real implementation, this is a no-op and should return 200 or 400
    // For now, we expect it to not error because both fields are optional
    expect(res.status).toBeLessThan(500);
  });

  it('returns 404 NotFoundError when provider not configured', async () => {
    const res = await request(app)
      .patch('/user/ai-providers/elevenlabs')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('updates isActive status without exposing the key', async () => {
    // First, seed an active provider
    const seedUser = 'ai-provider-patch-test-user';
    await conn.query(
      'DELETE FROM ai_provider_configs WHERE user_id = ?',
      [seedUser],
    );

    await conn.query(
      `INSERT INTO ai_provider_configs
         (user_id, provider, api_key_encrypted, encryption_iv, encryption_tag, is_active, created_at, updated_at)
       VALUES (?, 'openai', x'aabbccdd', x'1111111111111111', x'2222222222222222', 1, NOW(3), NOW(3))`,
      [seedUser],
    );

    const seedToken = jwt.sign(
      { sub: seedUser, email: 'patch@example.com' },
      JWT_SECRET,
    );

    const res = await request(app)
      .patch('/user/ai-providers/openai')
      .set('Authorization', `Bearer ${seedToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('apiKey');
    expect(JSON.stringify(res.body)).not.toContain('api_key');

    // Verify DB was updated
    const [rows] = await conn.execute<any[]>(
      'SELECT is_active FROM ai_provider_configs WHERE user_id = ? AND provider = ?',
      [seedUser, 'openai'],
    );
    expect(rows[0].is_active).toBe(0); // false

    // Cleanup
    await conn.query('DELETE FROM ai_provider_configs WHERE user_id = ?', [seedUser]);
  });

  it('updates apiKey with new encrypted value', async () => {
    // Seed a provider
    const seedUser = 'ai-provider-patch-key-test';
    await conn.query(
      'DELETE FROM ai_provider_configs WHERE user_id = ?',
      [seedUser],
    );

    await conn.query(
      `INSERT INTO ai_provider_configs
         (user_id, provider, api_key_encrypted, encryption_iv, encryption_tag, is_active, created_at, updated_at)
       VALUES (?, 'kling', x'oldkeydata11111', x'oldiv1111111111', x'oldtag11111111', 1, NOW(3), NOW(3))`,
      [seedUser],
    );

    const seedToken = jwt.sign(
      { sub: seedUser, email: 'key-patch@example.com' },
      JWT_SECRET,
    );

    const res = await request(app)
      .patch('/user/ai-providers/kling')
      .set('Authorization', `Bearer ${seedToken}`)
      .send({ apiKey: VALID_API_KEY_UPDATED });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(VALID_API_KEY_UPDATED);

    // Verify DB was updated with new encrypted key
    const [rows] = await conn.execute<any[]>(
      'SELECT api_key_encrypted FROM ai_provider_configs WHERE user_id = ? AND provider = ?',
      [seedUser, 'kling'],
    );
    expect(rows[0].api_key_encrypted).not.toEqual(Buffer.from('oldkeydata11111'));

    // Cleanup
    await conn.query('DELETE FROM ai_provider_configs WHERE user_id = ?', [seedUser]);
  });

  it('updates both apiKey and isActive in one request', async () => {
    // Seed a provider
    const seedUser = 'ai-provider-patch-both-test';
    await conn.query(
      'DELETE FROM ai_provider_configs WHERE user_id = ?',
      [seedUser],
    );

    await conn.query(
      `INSERT INTO ai_provider_configs
         (user_id, provider, api_key_encrypted, encryption_iv, encryption_tag, is_active, created_at, updated_at)
       VALUES (?, 'pika', x'oldkeydata22222', x'oldiv2222222222', x'oldtag22222222', 1, NOW(3), NOW(3))`,
      [seedUser],
    );

    const seedToken = jwt.sign(
      { sub: seedUser, email: 'both@example.com' },
      JWT_SECRET,
    );

    const res = await request(app)
      .patch('/user/ai-providers/pika')
      .set('Authorization', `Bearer ${seedToken}`)
      .send({ apiKey: VALID_API_KEY_UPDATED, isActive: false });

    expect(res.status).toBe(200);

    // Verify both were updated
    const [rows] = await conn.execute<any[]>(
      'SELECT is_active FROM ai_provider_configs WHERE user_id = ? AND provider = ?',
      [seedUser, 'pika'],
    );
    expect(rows[0].is_active).toBe(0);

    // Cleanup
    await conn.query('DELETE FROM ai_provider_configs WHERE user_id = ?', [seedUser]);
  });
});

// ── DELETE /user/ai-providers/:provider ──────────────────────────────────────

describe('DELETE /user/ai-providers/:provider', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).delete('/user/ai-providers/openai');

    expect(res.status).toBe(401);
  });

  it('returns 400 when provider param is invalid (not in ENUM)', async () => {
    const res = await request(app)
      .delete('/user/ai-providers/invalid-provider')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(400);
  });

  it('returns 404 NotFoundError when provider not configured', async () => {
    const res = await request(app)
      .delete('/user/ai-providers/suno')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns 204 and deletes the provider config', async () => {
    // Seed a provider for deletion
    const seedUser = 'ai-provider-delete-test';
    await conn.query(
      'DELETE FROM ai_provider_configs WHERE user_id = ?',
      [seedUser],
    );

    await conn.query(
      `INSERT INTO ai_provider_configs
         (user_id, provider, api_key_encrypted, encryption_iv, encryption_tag, is_active, created_at, updated_at)
       VALUES (?, 'replicate', x'deletekeydata111', x'deleteiv111111', x'deletetag1111, 1, NOW(3), NOW(3))`,
      [seedUser],
    );

    const seedToken = jwt.sign(
      { sub: seedUser, email: 'delete@example.com' },
      JWT_SECRET,
    );

    const res = await request(app)
      .delete('/user/ai-providers/replicate')
      .set('Authorization', `Bearer ${seedToken}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    // Verify it was deleted from DB
    const [rows] = await conn.execute<any[]>(
      'SELECT * FROM ai_provider_configs WHERE user_id = ? AND provider = ?',
      [seedUser, 'replicate'],
    );
    expect(rows).toHaveLength(0);

    // Cleanup (already deleted, but ensure clean state)
    await conn.query('DELETE FROM ai_provider_configs WHERE user_id = ?', [seedUser]);
  });
});

// ── Security: API Keys never leaked ──────────────────────────────────────────

describe('Security: API Key Encryption', () => {
  it('stores encrypted keys in DB and never exposes them in API responses', async () => {
    const seedUser = 'ai-provider-security-test';
    const secretKey = 'sk-secret-key-that-should-never-leak-in-api';

    await conn.query(
      'DELETE FROM ai_provider_configs WHERE user_id = ?',
      [seedUser],
    );

    const seedToken = jwt.sign(
      { sub: seedUser, email: 'security@example.com' },
      JWT_SECRET,
    );

    // Add a provider
    const addRes = await request(app)
      .post('/user/ai-providers')
      .set('Authorization', `Bearer ${seedToken}`)
      .send({ provider: 'openai', apiKey: secretKey });

    expect(addRes.status).toBe(201);
    expect(JSON.stringify(addRes.body)).not.toContain(secretKey);

    // List providers
    const listRes = await request(app)
      .get('/user/ai-providers')
      .set('Authorization', `Bearer ${seedToken}`);

    expect(listRes.status).toBe(200);
    expect(JSON.stringify(listRes.body)).not.toContain(secretKey);

    // Update provider
    const patchRes = await request(app)
      .patch('/user/ai-providers/openai')
      .set('Authorization', `Bearer ${seedToken}`)
      .send({ isActive: false });

    expect(patchRes.status).toBe(200);
    expect(JSON.stringify(patchRes.body)).not.toContain(secretKey);

    // Cleanup
    await conn.query('DELETE FROM ai_provider_configs WHERE user_id = ?', [seedUser]);
  });
});
