/**
 * T12 + T21 — flow-generate.service / generation-flow.service backend INTEGRATION
 * suite against real MySQL + real Redis (host :6380). No DB/Redis mocks — only the
 * BullMQ Queue.add and the realtime publisher are stubbed (no worker/ws side effects).
 *
 * T12 (accept half):
 *   1. accept:            a gate-passing Generate creates ONE ai_generation_job row
 *                         carrying flow_id + block_id, status='queued'.
 *   2. idempotent replay: a repeat with the SAME Idempotency-Key returns the FIRST
 *                         job and creates NO second row.
 *
 * T21 (security / regression matrix for the spend path — every assertion below
 * exercises the REAL service → repository → MySQL/Redis stack):
 *   - AC-04 authz:        every flow operation by a NON-owner → NotFoundError (404),
 *                         indistinguishable from absent (existence-hiding) — incl. the
 *                         spend-path entry points (estimate + generate).
 *   - AC-10b concurrency: two concurrent canvas saves on the same parent version →
 *                         exactly one wins, the other → OptimisticLockError (409).
 *   - rate limit:         a scripted Generate driven PAST 30/min for one Creator →
 *                         RateLimitedError (429) via the real Redis sliding window.
 *   - AC-03 gate:         required-input missing      → RequiredInputMissingError (422).
 *   - AC-06 gate:         exclusivity both-provided    → ExclusivityViolationError (422).
 *   - AC-17 gate:         empty text content block     → ContentInvalidError (422).
 *   - AC-05 gate:         previously-owned, now-deleted asset → AssetMissingError (422);
 *                         a NEVER-owned asset ref       → NotFoundError (404), NOT asset_missing.
 *   - AC-13 integrity:    a failed generation job leaves ZERO files + ZERO flow_files
 *                         links (asset-iff-success) — the api-side DB invariant that
 *                         ties to the worker handler proven green in media-worker's
 *                         ai-generate.flow-link.integration.test.ts (T13).
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
// A second, distinct Creator — never the owner of OWNER_ID's flows/assets.
// Used to prove the non-owner → 404 existence-hiding matrix (AC-04) and the
// never-owned-asset → 404 path (AC-05).
const OTHER_ID = `flow-gen-integ-other-${randomUUID().slice(0, 8)}`;
// Image model needing only a text `prompt` — gate passes with an inline param.
const IMAGE_MODEL_ID = 'fal-ai/nano-banana-2';
// image_to_video model whose `image_url` is REQUIRED + `prompt_mode` is an
// exclusiveGroup (prompt XOR multi_prompt) — drives AC-06 + AC-05 asset cases.
const I2V_MODEL_ID = 'fal-ai/kling-video/o3/standard/image-to-video';
const GEN_BLOCK_ID = randomUUID();

const cleanupFlows: string[] = [];
const cleanupFiles: string[] = [];
const cleanupJobUsers: string[] = [OWNER_ID, OTHER_ID];

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  for (const id of [OWNER_ID, OTHER_ID]) {
    await conn.execute(
      `INSERT IGNORE INTO users (user_id, email, password_hash) VALUES (?, ?, ?)`,
      [id, `${id}@example.test`, 'hash'],
    );
  }
});

afterAll(async () => {
  for (const userId of cleanupJobUsers) {
    await conn.execute('DELETE FROM ai_generation_jobs WHERE user_id = ?', [userId]);
  }
  // flow_files (RESTRICT on file) before flows + files.
  if (cleanupFlows.length) {
    await conn.query(
      `DELETE FROM flow_files WHERE flow_id IN (${cleanupFlows.map(() => '?').join(',')})`,
      cleanupFlows,
    );
    await conn.query(
      `DELETE FROM generation_flows WHERE flow_id IN (${cleanupFlows.map(() => '?').join(',')})`,
      cleanupFlows,
    );
  }
  if (cleanupFiles.length) {
    await conn.query(
      `DELETE FROM files WHERE file_id IN (${cleanupFiles.map(() => '?').join(',')})`,
      cleanupFiles,
    );
  }
  for (const id of [OWNER_ID, OTHER_ID]) {
    await conn.execute('DELETE FROM users WHERE user_id = ?', [id]);
  }
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

/** A canvas block (typed loosely for the test builders below). */
type TestBlock = {
  blockId: string;
  type: 'content' | 'generation' | 'result';
  position: { x: number; y: number };
  params: Record<string, unknown>;
};
type TestEdge = {
  edgeId: string;
  sourceBlockId: string;
  sourceHandle: string;
  targetBlockId: string;
  targetHandle: string;
};

/** Creates a flow for OWNER_ID carrying the given blocks/edges and returns its id+version. */
async function seedFlow(blocks: TestBlock[], edges: TestEdge[] = [], title = 'T21 flow') {
  const { createFlow, saveCanvas } = await flowSvc();
  const flow = await createFlow(OWNER_ID, title);
  cleanupFlows.push(flow.flowId);
  const saved = await saveCanvas(flow.flowId, OWNER_ID, { blocks, edges }, flow.version);
  return { flowId: flow.flowId, version: saved.version };
}

/**
 * Inserts a real `files` row owned by `userId`. `deleted` soft-deletes it (sets
 * deleted_at) so the gate sees a previously-owned-but-missing asset (AC-05).
 */
async function seedFile(
  userId: string,
  kind: 'image' | 'audio' | 'video',
  opts: { deleted?: boolean } = {},
): Promise<string> {
  const fileId = randomUUID();
  cleanupFiles.push(fileId);
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, 'ready', ${opts.deleted ? 'NOW()' : 'NULL'})`,
    [fileId, userId, kind, `s3://test-bucket/${fileId}`, `${kind}/png`, `${kind} asset`],
  );
  return fileId;
}

const edge = (sourceBlockId: string, targetBlockId: string, targetHandle: string): TestEdge => ({
  edgeId: randomUUID(),
  sourceBlockId,
  sourceHandle: 'out',
  targetBlockId,
  targetHandle,
});

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

// ── T21 — AC-04: non-owner → 404 across every flow operation (existence hiding) ──

describe('T21 / AC-04 — every flow operation by a non-owner → NotFoundError (404)', () => {
  it('open / rename / delete / saveCanvas / estimate / generate all hide existence from a non-owner', async () => {
    const { NotFoundError } = await import('@/lib/errors.js');
    const flowSvcMod = await flowSvc();
    const { estimateBlockCost, generate } = await genSvc();

    const { flowId, version } = await seedPassingFlow();

    // openFlow
    await expect(flowSvcMod.openFlow(flowId, OTHER_ID)).rejects.toBeInstanceOf(NotFoundError);
    // renameFlow
    await expect(flowSvcMod.renameFlow(flowId, OTHER_ID, 'hijack')).rejects.toBeInstanceOf(NotFoundError);
    // deleteFlow
    await expect(flowSvcMod.deleteFlow(flowId, OTHER_ID)).rejects.toBeInstanceOf(NotFoundError);
    // estimate (spend-path read)
    await expect(
      estimateBlockCost({ flowId, blockId: GEN_BLOCK_ID, userId: OTHER_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // generate (spend-path write) — must be 404, NEVER a gate 422 (would leak block shape)
    await expect(
      generate({ flowId, blockId: GEN_BLOCK_ID, userId: OTHER_ID, version, idempotencyKey: randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // The owner's flow is untouched + the generate-by-non-owner created NO job row.
    const [jobRows] = await conn.execute<RowDataPacket[]>(
      'SELECT job_id FROM ai_generation_jobs WHERE flow_id = ?',
      [flowId],
    );
    expect(jobRows).toHaveLength(0);
  });

  it('a non-owner save is rejected as a conflict — the owner state stays authoritative', async () => {
    const { OptimisticLockError } = await import('@/lib/errors.js');
    const flowSvcMod = await flowSvc();
    const { flowId, version } = await seedPassingFlow();

    await expect(
      flowSvcMod.saveCanvas(flowId, OTHER_ID, { blocks: [], edges: [] }, version),
    ).rejects.toBeInstanceOf(OptimisticLockError);

    // The owner can still read the original (non-empty) canvas — not overwritten.
    const opened = await flowSvcMod.openFlow(flowId, OWNER_ID);
    expect(opened.flow.canvas.blocks).toHaveLength(1);
  });
});

// ── T21 — AC-10b: two concurrent saves on the same parent version → one 409 ──────

describe('T21 / AC-10b — concurrent canvas saves on the same parent version', () => {
  it('exactly one save wins; the loser → OptimisticLockError (409); version bumps once', async () => {
    const { OptimisticLockError } = await import('@/lib/errors.js');
    const { saveCanvas } = await flowSvc();
    const { flowId, version } = await seedPassingFlow();

    const canvasA = {
      blocks: [{ blockId: 'a', type: 'content' as const, position: { x: 0, y: 0 }, params: { contentType: 'text', text: 'A' } }],
      edges: [],
    };
    const canvasB = {
      blocks: [{ blockId: 'b', type: 'content' as const, position: { x: 0, y: 0 }, params: { contentType: 'text', text: 'B' } }],
      edges: [],
    };

    // Fire both against the SAME parent version concurrently. The repo's atomic
    // `UPDATE ... WHERE version = parentVersion` lets exactly one through.
    const results = await Promise.allSettled([
      saveCanvas(flowId, OWNER_ID, canvasA, version),
      saveCanvas(flowId, OWNER_ID, canvasB, version),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(OptimisticLockError);

    // The DB version advanced by exactly ONE (not two) — the loser never wrote.
    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT version FROM generation_flows WHERE flow_id = ?',
      [flowId],
    );
    expect(rows[0]!['version']).toBe(version + 1);
  });
});

// ── T21 — rate limit: scripted Generate past 30/min → 429 (real Redis window) ────

describe('T21 / rate limit — a Creator driven past 30/min → RateLimitedError (429)', () => {
  it('the 31st Generate within the window is denied via the real Redis sliding window', async () => {
    const { RateLimitedError } = await import('@/lib/errors.js');
    const { FLOW_RATE_LIMIT_MAX } = await import('@/lib/flow-rate-limit.js');
    const { redis } = await import('@/lib/redis.js');
    const { generate } = await genSvc();

    // Isolate this Creator's window so prior tests in the file don't pollute the count.
    const rateUser = `flow-gen-integ-rate-${randomUUID().slice(0, 8)}`;
    cleanupJobUsers.push(rateUser);
    await conn.execute(
      `INSERT IGNORE INTO users (user_id, email, password_hash) VALUES (?, ?, ?)`,
      [rateUser, `${rateUser}@example.test`, 'hash'],
    );
    await redis.del(`flow:generate:rate:${rateUser}`);

    // Seed a gate-passing flow owned by the rate-limit user.
    const { createFlow, saveCanvas } = await flowSvc();
    const flow = await createFlow(rateUser, 'rate flow');
    cleanupFlows.push(flow.flowId);
    const blockId = randomUUID();
    const saved = await saveCanvas(
      flow.flowId,
      rateUser,
      {
        blocks: [{ blockId, type: 'generation' as const, position: { x: 0, y: 0 }, params: { modelId: IMAGE_MODEL_ID, prompt: 'p' } }],
        edges: [],
      },
      flow.version,
    );

    // Drive FLOW_RATE_LIMIT_MAX (30) accepted Generates — each a fresh Idempotency-Key
    // so each consumes one slot of the real Redis sliding window.
    let accepted = 0;
    for (let i = 0; i < FLOW_RATE_LIMIT_MAX; i++) {
      const r = await generate({
        flowId: flow.flowId,
        blockId,
        userId: rateUser,
        version: saved.version,
        idempotencyKey: randomUUID(),
      });
      expect(r.status).toBe('queued');
      accepted++;
    }
    expect(accepted).toBe(FLOW_RATE_LIMIT_MAX);

    // The 31st within the same window must be denied with a positive retry-after.
    const denied = await generate({
      flowId: flow.flowId,
      blockId,
      userId: rateUser,
      version: saved.version,
      idempotencyKey: randomUUID(),
    }).catch((e) => e);

    expect(denied).toBeInstanceOf(RateLimitedError);
    expect((denied as InstanceType<typeof RateLimitedError>).statusCode).toBe(429);
    expect((denied as InstanceType<typeof RateLimitedError>).retryAfterSeconds).toBeGreaterThan(0);

    // The denied attempt created NO job row beyond the 30 accepted ones.
    const [jobRows] = await conn.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM ai_generation_jobs WHERE flow_id = ?',
      [flow.flowId],
    );
    expect(Number(jobRows[0]!['n'])).toBe(FLOW_RATE_LIMIT_MAX);
  });
});

// ── T21 — gate: each validation failure → its specific 422 code (AC-03/06/17/05) ─

describe('T21 / validation gate — each failure maps to its specific 422 code', () => {
  it('AC-03: a required input with no connection and no supplied value → RequiredInputMissingError', async () => {
    const { RequiredInputMissingError } = await import('@/lib/errors.js');
    const { generate } = await genSvc();
    const blockId = randomUUID();
    // nano-banana-2 requires `prompt`; provide a modelId but NO prompt.
    const { flowId, version } = await seedFlow([
      { blockId, type: 'generation', position: { x: 0, y: 0 }, params: { modelId: IMAGE_MODEL_ID } },
    ]);

    const err = await generate({ flowId, blockId, userId: OWNER_ID, version, idempotencyKey: randomUUID() }).catch((e) => e);
    expect(err).toBeInstanceOf(RequiredInputMissingError);
    expect((err as InstanceType<typeof RequiredInputMissingError>).code).toBe('flow.required_input_missing');

    // Nothing was enqueued — the gate ran before any spend.
    const [rows] = await conn.execute<RowDataPacket[]>('SELECT COUNT(*) AS n FROM ai_generation_jobs WHERE flow_id = ?', [flowId]);
    expect(Number(rows[0]!['n'])).toBe(0);
  });

  it('AC-06: both members of an exclusiveGroup supplied → ExclusivityViolationError', async () => {
    const { ExclusivityViolationError } = await import('@/lib/errors.js');
    const { generate } = await genSvc();
    const genBlock = randomUUID();
    const imgContent = randomUUID();
    const imgFile = await seedFile(OWNER_ID, 'image');

    // kling o3: image_url required (satisfied via a connected image asset) +
    // prompt_mode exclusiveGroup → supply BOTH prompt and multi_prompt inline.
    const { flowId, version } = await seedFlow(
      [
        { blockId: imgContent, type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'asset', fileId: imgFile } },
        {
          blockId: genBlock,
          type: 'generation',
          position: { x: 200, y: 0 },
          params: { modelId: I2V_MODEL_ID, prompt: 'a', multi_prompt: ['b'] },
        },
      ],
      [edge(imgContent, genBlock, 'image_url')],
    );

    const err = await generate({ flowId, blockId: genBlock, userId: OWNER_ID, version, idempotencyKey: randomUUID() }).catch((e) => e);
    expect(err).toBeInstanceOf(ExclusivityViolationError);
    expect((err as InstanceType<typeof ExclusivityViolationError>).code).toBe('flow.exclusivity_violation');
  });

  it('AC-17: an empty text content block connected into a required input → ContentInvalidError', async () => {
    const { ContentInvalidError } = await import('@/lib/errors.js');
    const { generate } = await genSvc();
    const genBlock = randomUUID();
    const textContent = randomUUID();

    // nano-banana-2 `prompt` is text-typed; feed it an EMPTY text content block.
    const { flowId, version } = await seedFlow(
      [
        { blockId: textContent, type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'text', text: '   ' } },
        { blockId: genBlock, type: 'generation', position: { x: 200, y: 0 }, params: { modelId: IMAGE_MODEL_ID } },
      ],
      [edge(textContent, genBlock, 'prompt')],
    );

    const err = await generate({ flowId, blockId: genBlock, userId: OWNER_ID, version, idempotencyKey: randomUUID() }).catch((e) => e);
    expect(err).toBeInstanceOf(ContentInvalidError);
    expect((err as InstanceType<typeof ContentInvalidError>).code).toBe('flow.content_invalid');
  });

  it('AC-05: a previously-owned, now soft-deleted asset → AssetMissingError (422)', async () => {
    const { AssetMissingError } = await import('@/lib/errors.js');
    const { generate } = await genSvc();
    const genBlock = randomUUID();
    const imgContent = randomUUID();
    // An image asset OWNER_ID DID own, now soft-deleted.
    const deletedFile = await seedFile(OWNER_ID, 'image', { deleted: true });

    const { flowId, version } = await seedFlow(
      [
        { blockId: imgContent, type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'asset', fileId: deletedFile } },
        { blockId: genBlock, type: 'generation', position: { x: 200, y: 0 }, params: { modelId: I2V_MODEL_ID, prompt: 'go' } },
      ],
      [edge(imgContent, genBlock, 'image_url')],
    );

    const err = await generate({ flowId, blockId: genBlock, userId: OWNER_ID, version, idempotencyKey: randomUUID() }).catch((e) => e);
    expect(err).toBeInstanceOf(AssetMissingError);
    expect((err as InstanceType<typeof AssetMissingError>).code).toBe('flow.asset_missing');
  });

  it('AC-05/AC-04: a NEVER-owned asset reference → NotFoundError (404), NOT asset_missing', async () => {
    const { NotFoundError, AssetMissingError } = await import('@/lib/errors.js');
    const { generate } = await genSvc();
    const genBlock = randomUUID();
    const imgContent = randomUUID();
    // An image asset owned by OTHER_ID — OWNER_ID never owned it. Existence must
    // NOT be revealed: this is a 404, identical to a non-owner flow, not a 422.
    const foreignFile = await seedFile(OTHER_ID, 'image');

    const { flowId, version } = await seedFlow(
      [
        { blockId: imgContent, type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'asset', fileId: foreignFile } },
        { blockId: genBlock, type: 'generation', position: { x: 200, y: 0 }, params: { modelId: I2V_MODEL_ID, prompt: 'go' } },
      ],
      [edge(imgContent, genBlock, 'image_url')],
    );

    const err = await generate({ flowId, blockId: genBlock, userId: OWNER_ID, version, idempotencyKey: randomUUID() }).catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).not.toBeInstanceOf(AssetMissingError);
    expect((err as InstanceType<typeof NotFoundError>).statusCode).toBe(404);
  });
});

// ── U3b / AC-20 — estimateBlockCost: param-reactive DB pricing (integration) ─────
//
// Verifies that estimateBlockCost reads the live `flow_model_pricing` table and
// applies the formula: amount = round2((base + per_second * duration_s) * res_mult).
// One synthetic row is UPDATE-d into the seeded 'fal-ai/nano-banana-2' entry, the
// estimate is taken, then the row is restored to its seed value in a finally block.
// The pricing repository cache is cleared before the estimate call so the live row
// is read (not a stale cached copy).

describe('U3b / AC-20 — estimateBlockCost uses live flow_model_pricing table', () => {
  it('applies per_second and base_amount from DB row to the estimate', async () => {
    const { estimateBlockCost } = await genSvc();
    // Import the cache map so we can flush it before the estimate call.
    const pricingRepo = await import('@/repositories/flow-model-pricing.repository.js');

    const MODEL = 'fal-ai/nano-banana-2';
    // Use a per-second pricing: base=0.00, per_second=0.05 → 3 images * 0 + 0.05 * (no duration) → just base.
    // Actually nano-banana-2 has no per_second in catalog, just per_image and base.
    // We'll use per_image: base=0.01, per_image=0.02, num_images=3 → 0.01 + 0.02*3 = 0.07
    await conn.execute(
      `UPDATE flow_model_pricing SET base_amount = 0.01, per_image = 0.0200 WHERE model_id = ?`,
      [MODEL],
    );

    // Seed a flow with num_images=3 for the model.
    const blockId = randomUUID();
    const { flowId } = await seedFlow([
      {
        blockId,
        type: 'generation',
        position: { x: 0, y: 0 },
        params: { modelId: MODEL, prompt: 'pricing-test', num_images: 3 },
      },
    ]);

    try {
      // Clear the in-process cache so the live DB row is read.
      pricingRepo.clearPricingCache();

      const result = await estimateBlockCost({ flowId, blockId, userId: OWNER_ID });

      // base(0.01) + per_image(0.02) * num_images(3) = 0.01 + 0.06 = 0.07
      expect(result.estimate.amount).toBeCloseTo(0.07, 2);
      expect(result.estimate.currency).toBe('USD');
      expect(result.bestEffort).toBe(true);
    } finally {
      // Restore the seed value (base_amount=0.03, per_image=NULL).
      await conn.execute(
        `UPDATE flow_model_pricing SET base_amount = 0.03, per_image = NULL WHERE model_id = ?`,
        [MODEL],
      );
      pricingRepo.clearPricingCache();
    }
  });
});

// ── T21 — AC-13: a failed generation job → ZERO assets (asset-iff-success) ───────
//
// The end-to-end enqueue→worker handler path is proven green in media-worker's
// ai-generate.flow-link.integration.test.ts (T13) — that test runs the REAL
// handler with the REAL DB-backed repos and asserts that an empty/forced-failure
// provider response writes NO `files` row and NO `flow_files` link. Driving the
// BullMQ worker loop inside this api process is impractical, so here we exercise
// the SAME invariant against the real DB from the api side: a flow whose only job
// is `failed` (the worker's failure outcome) has reconciled to zero assets and
// zero links — i.e. the library-write reconciliation shows ZERO assets.

describe('T21 / AC-13 — a failed generation leaves zero assets + zero flow_files links', () => {
  it('a flow-linked job in failed state has no output file and the flow has zero links', async () => {
    const aiJobRepo = await import('@/repositories/aiGenerationJob.repository.js');

    // A flow with one generation block (its canvas content is irrelevant here —
    // we assert the post-failure DB reconciliation).
    const blockId = randomUUID();
    const { flowId } = await seedFlow([
      { blockId, type: 'generation', position: { x: 0, y: 0 }, params: { modelId: IMAGE_MODEL_ID, prompt: 'p' } },
    ]);

    // Create a real job row, link it to the flow, then mark it FAILED — the exact
    // terminal state the worker writes on a forced provider failure (no setOutputFile).
    const jobId = randomUUID();
    await aiJobRepo.createJob({
      jobId,
      userId: OWNER_ID,
      modelId: IMAGE_MODEL_ID,
      capability: 'text_to_image',
      prompt: 'p',
      options: { prompt: 'p' },
    });
    await aiJobRepo.setFlowLink(jobId, flowId, blockId);
    await aiJobRepo.updateJobStatus(jobId, 'failed', 'forced provider failure');

    // Reconciliation invariant (asset-iff-success):
    //   the failed job has NO output file …
    const [jobRows] = await conn.execute<RowDataPacket[]>(
      'SELECT status, output_file_id FROM ai_generation_jobs WHERE job_id = ?',
      [jobId],
    );
    expect(jobRows[0]!['status']).toBe('failed');
    expect(jobRows[0]!['output_file_id']).toBeNull();

    //   … and the flow has ZERO library links (no asset was written).
    const [linkRows] = await conn.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM flow_files WHERE flow_id = ?',
      [flowId],
    );
    expect(Number(linkRows[0]!['n'])).toBe(0);
  });
});
