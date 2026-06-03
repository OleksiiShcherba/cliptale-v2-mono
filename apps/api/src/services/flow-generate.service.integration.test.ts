/**
 * T12 — flow-generate.service.generate integration tests against real MySQL + Redis.
 *
 * Exercises the spend-path accept half end-to-end with no repository/redis mocks
 * (the BullMQ queue + realtime publisher are mocked — no worker/ws side effects):
 *   1. accept:            a gate-passing Generate creates ONE ai_generation_job row
 *                         carrying flow_id + block_id, status='queued'.
 *   2. idempotent replay: a repeat with the SAME Idempotency-Key returns the FIRST
 *                         job and creates NO second row.
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/flow-generate.service.integration.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';

// ── Env setup (must precede any app-module import) ────────────────────────────
Object.assign(process.env, {
  APP_DB_HOST:              process.env['APP_DB_HOST']              ?? 'localhost',
  APP_DB_PORT:              process.env['APP_DB_PORT']              ?? '3306',
  APP_DB_NAME:              process.env['APP_DB_NAME']              ?? 'cliptale',
  APP_DB_USER:              process.env['APP_DB_USER']              ?? 'cliptale',
  APP_DB_PASSWORD:          process.env['APP_DB_PASSWORD']          ?? 'cliptale',
  // Real Redis for the idempotency dedupe + the sliding-window rate limit.
  // House rule: host Redis is on :6380 (container 6379).
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6380',
  APP_S3_BUCKET:            process.env['APP_S3_BUCKET']            ?? 'test-bucket',
  APP_S3_REGION:            process.env['APP_S3_REGION']            ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID:     process.env['APP_S3_ACCESS_KEY_ID']     ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET:           'flow-gen-integ-test-secret-32chars!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ── Mocks ─────────────────────────────────────────────────────────────────────
// BullMQ enqueue must not hit a real worker; mock the queue add. Redis itself
// stays REAL (idempotency + rate limit) — we only stub the BullMQ Queue object.
vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockResolvedValue({ id: 'mock-job' }),
      on: vi.fn(),
    })),
    Worker: actual.Worker,
  };
});
// The realtime publisher opens its own Redis pub/sub; stub it (no ws side effects).
vi.mock('@/lib/realtimePublisher.js', () => ({
  publishAiJobUpdatedById: vi.fn().mockResolvedValue(undefined),
}));

// ─────────────────────────────────────────────────────────────────────────────

let conn: Connection;

const OWNER_ID = `flow-gen-integ-owner-${randomUUID().slice(0, 8)}`;
// Image model needing only a text `prompt` — gate passes with an inline param.
const IMAGE_MODEL_ID = 'fal-ai/nano-banana-2';
const GEN_BLOCK_ID = randomUUID();

const cleanupFlows: string[] = [];
const cleanupJobUsers: string[] = [OWNER_ID];

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, password_hash) VALUES (?, ?, ?)`,
    [OWNER_ID, `${OWNER_ID}@example.test`, 'hash'],
  );
});

afterAll(async () => {
  for (const userId of cleanupJobUsers) {
    await conn.execute('DELETE FROM ai_generation_jobs WHERE user_id = ?', [userId]);
  }
  if (cleanupFlows.length) {
    await conn.query(
      `DELETE FROM generation_flows WHERE flow_id IN (${cleanupFlows.map(() => '?').join(',')})`,
      cleanupFlows,
    );
  }
  await conn.execute('DELETE FROM users WHERE user_id = ?', [OWNER_ID]);
  await conn.end();
});

/** Lazy-import the services after env + mocks are configured. */
async function flowSvc() {
  return import('@/services/generation-flow.service.js');
}
async function genSvc() {
  return import('@/services/flow-generate.service.js');
}

/** Creates a flow whose canvas has a single gate-passing image-generation block. */
async function seedPassingFlow() {
  const { createFlow, saveCanvas } = await flowSvc();
  const flow = await createFlow(OWNER_ID, 'Generate integ flow');
  cleanupFlows.push(flow.flowId);

  const canvas = {
    blocks: [
      {
        blockId: GEN_BLOCK_ID,
        type: 'generation' as const,
        position: { x: 0, y: 0 },
        params: { modelId: IMAGE_MODEL_ID, prompt: 'a sunny meadow at golden hour' },
      },
    ],
    edges: [],
  };
  const saved = await saveCanvas(flow.flowId, OWNER_ID, canvas, flow.version);
  return { flowId: flow.flowId, version: saved.version };
}

describe('flow-generate.service.generate / integration (real MySQL + Redis)', () => {
  it('accept: a gate-passing Generate creates one queued job row carrying flow_id + block_id', async () => {
    const { generate } = await genSvc();
    const { flowId, version } = await seedPassingFlow();

    const result = await generate({
      flowId,
      blockId: GEN_BLOCK_ID,
      userId: OWNER_ID,
      version,
      idempotencyKey: randomUUID(),
    });

    expect(result.blockId).toBe(GEN_BLOCK_ID);
    expect(result.status).toBe('queued');

    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT job_id, user_id, flow_id, block_id, model_id, status FROM ai_generation_jobs WHERE job_id = ?',
      [result.jobId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['user_id']).toBe(OWNER_ID);
    expect(rows[0]!['flow_id']).toBe(flowId);
    expect(rows[0]!['block_id']).toBe(GEN_BLOCK_ID);
    expect(rows[0]!['model_id']).toBe(IMAGE_MODEL_ID);
    expect(rows[0]!['status']).toBe('queued');
  });

  it('idempotent replay: a repeat with the SAME Idempotency-Key returns the first job, no second row', async () => {
    const { generate } = await genSvc();
    const { flowId, version } = await seedPassingFlow();

    const idempotencyKey = randomUUID();
    const first = await generate({
      flowId,
      blockId: GEN_BLOCK_ID,
      userId: OWNER_ID,
      version,
      idempotencyKey,
    });
    const second = await generate({
      flowId,
      blockId: GEN_BLOCK_ID,
      userId: OWNER_ID,
      version,
      idempotencyKey,
    });

    expect(second.jobId).toBe(first.jobId);

    // Exactly ONE job row exists for this flow — the replay created nothing new.
    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT job_id FROM ai_generation_jobs WHERE flow_id = ?',
      [flowId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['job_id']).toBe(first.jobId);
  });
});
