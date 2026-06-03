/**
 * T9 — flow-generate.service unit tests (cost-estimate function only).
 *
 * Tests cover:
 *  - estimateBlockCost resolves model from saved canvas and returns a best-effort Money estimate
 *  - bestEffort is always true
 *  - result is non-mutating (canvas unchanged after call)
 *  - unknown model still returns a best-effort estimate (AC-11 / openapi)
 *  - no provider (external) call is made (spy asserts no HTTP)
 *  - block not found in canvas throws / propagates an error
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FlowCanvas } from '@ai-video-editor/project-schema';

// We mock the repository so no DB calls are made.
vi.mock('@/repositories/generation-flow.repository.js', () => ({
  findFlowById: vi.fn(),
}));

// The validation gate (T11) checks referenced-asset presence/ownership against
// the files repo. Mock the two reads it uses.
vi.mock('@/repositories/file.repository.js', () => ({
  findByIdForUser: vi.fn(),
  findByIdIncludingDeleted: vi.fn(),
}));

// T12 — enqueue collaborators. Mocked so unit tests exercise the orchestration
// (gate → rate-limit → job create → enqueue → idempotency) without DB/Redis/BullMQ.
vi.mock('@/repositories/aiGenerationJob.repository.js', () => ({
  createJob: vi.fn(),
  setFlowLink: vi.fn(),
  updateJobStatus: vi.fn(),
}));
vi.mock('@/queues/jobs/enqueue-ai-generate.js', () => ({
  enqueueAiGenerateJob: vi.fn(),
}));
vi.mock('@/lib/flow-rate-limit.js', () => ({
  checkFlowRateLimit: vi.fn(),
}));
vi.mock('@/lib/realtimePublisher.js', () => ({
  publishAiJobUpdatedById: vi.fn(),
}));
// T12 idempotency store — a small submit-side Redis dedupe (F-3 hardening).
vi.mock('@/lib/redis.js', () => ({
  redis: { set: vi.fn(), get: vi.fn(), del: vi.fn().mockResolvedValue(1) },
}));

// We also want to assert no external HTTP calls ever happen.
// Mock fetch globally — if estimateBlockCost calls fetch it will fail the spy.
const fetchSpy = vi.spyOn(globalThis, 'fetch');

import { findFlowById } from '@/repositories/generation-flow.repository.js';
import { findByIdForUser, findByIdIncludingDeleted } from '@/repositories/file.repository.js';
import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import { enqueueAiGenerateJob } from '@/queues/jobs/enqueue-ai-generate.js';
import { checkFlowRateLimit } from '@/lib/flow-rate-limit.js';
import { redis } from '@/lib/redis.js';
import {
  estimateBlockCost,
  validateGenerateGate,
  generate,
} from './flow-generate.service.js';
import {
  NotFoundError,
  RequiredInputMissingError,
  ExclusivityViolationError,
  AssetMissingError,
  ContentInvalidError,
  RateLimitedError,
  OptimisticLockError,
} from '@/lib/errors.js';

const FLOW_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BLOCK_ID = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_MODEL_ID = 'unknown-vendor/nonexistent-model-xyz';
const KNOWN_MODEL_ID = 'fal-ai/ltx-2-19b/image-to-video';

function makeCanvas(modelId: string): FlowCanvas {
  return {
    blocks: [
      {
        blockId: BLOCK_ID,
        type: 'generation',
        position: { x: 0, y: 0 },
        params: { modelId },
      },
    ],
    edges: [],
  };
}

function makeFlowRecord(canvas: FlowCanvas) {
  return {
    flowId: FLOW_ID,
    userId: USER_ID,
    title: 'Test flow',
    canvas,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy.mockReset();
});

describe('estimateBlockCost — known model', () => {
  it('returns a CostEstimate with bestEffort: true for a known model', async () => {
    const canvas = makeCanvas(KNOWN_MODEL_ID);
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    const result = await estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID });

    expect(result.bestEffort).toBe(true);
    expect(result.flowId).toBe(FLOW_ID);
    expect(result.blockId).toBe(BLOCK_ID);
    expect(result.modelId).toBe(KNOWN_MODEL_ID);
    expect(result.estimate.currency).toBe('USD');
    expect(typeof result.estimate.amount).toBe('number');
    expect(result.estimate.amount).toBeGreaterThanOrEqual(0);
  });

  it('does not mutate the canvas after estimating', async () => {
    const canvas = makeCanvas(KNOWN_MODEL_ID);
    const originalJson = JSON.stringify(canvas);
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    await estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID });

    expect(JSON.stringify(canvas)).toBe(originalJson);
  });

  it('makes no external provider call (fetch not called)', async () => {
    const canvas = makeCanvas(KNOWN_MODEL_ID);
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    await estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('estimateBlockCost — unknown model', () => {
  it('still returns a best-effort estimate for an unknown model (AC-11 / openapi)', async () => {
    const canvas = makeCanvas(UNKNOWN_MODEL_ID);
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    const result = await estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID });

    expect(result.bestEffort).toBe(true);
    expect(result.modelId).toBe(UNKNOWN_MODEL_ID);
    expect(result.estimate.currency).toBe('USD');
    expect(typeof result.estimate.amount).toBe('number');
    expect(result.estimate.amount).toBeGreaterThanOrEqual(0);
  });

  it('makes no external provider call for unknown model either', async () => {
    const canvas = makeCanvas(UNKNOWN_MODEL_ID);
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    await estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('estimateBlockCost — flow not found', () => {
  it('throws NotFoundError when the flow does not exist or is not owned', async () => {
    vi.mocked(findFlowById).mockResolvedValue(null);

    await expect(
      estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID }),
    ).rejects.toThrow();
  });
});

describe('estimateBlockCost — block not a generation block', () => {
  it('throws when the blockId is not found in canvas blocks', async () => {
    const canvas: FlowCanvas = {
      blocks: [
        {
          blockId: 'different-block-id',
          type: 'generation',
          position: { x: 0, y: 0 },
          params: { modelId: KNOWN_MODEL_ID },
        },
      ],
      edges: [],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    await expect(
      estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID }),
    ).rejects.toThrow();
  });

  it('throws when the block exists but is not a generation block', async () => {
    const canvas: FlowCanvas = {
      blocks: [
        {
          blockId: BLOCK_ID,
          type: 'content',
          position: { x: 0, y: 0 },
          params: {},
        },
      ],
      edges: [],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    await expect(
      estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID }),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// T11 — server-authoritative Generate validation gate
// ──────────────────────────────────────────────────────────────────────────────

const TEXT_BLOCK_ID = '33333333-3333-4333-8333-333333333333';
const IMAGE_BLOCK_ID = '44444444-4444-4444-8444-444444444444';
const FILE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// fal-ai/ltx-2-19b/image-to-video requires: prompt (text), image_url (image).
const LTX_MODEL_ID = 'fal-ai/ltx-2-19b/image-to-video';
// kling/o3 requires image_url (image) + exactly one of prompt | multi_prompt (group 'prompt_mode').
const KLING_MODEL_ID = 'fal-ai/kling-video/o3/standard/image-to-video';

function genBlock(modelId: string, params: Record<string, unknown> = {}) {
  return {
    blockId: BLOCK_ID,
    type: 'generation' as const,
    position: { x: 0, y: 0 },
    params: { modelId, ...params },
  };
}

function textContentBlock(blockId: string, text: unknown) {
  return {
    blockId,
    type: 'content' as const,
    position: { x: 0, y: 0 },
    params: { contentType: 'text', text },
  };
}

function assetContentBlock(blockId: string, fileId: string) {
  return {
    blockId,
    type: 'content' as const,
    position: { x: 0, y: 0 },
    params: { contentType: 'asset', fileId },
  };
}

function edge(sourceBlockId: string, targetHandle: string) {
  return {
    edgeId: `${sourceBlockId}->${targetHandle}`,
    sourceBlockId,
    sourceHandle: 'out',
    targetBlockId: BLOCK_ID,
    targetHandle,
  };
}

function ownedReadyFile(kind: 'image' | 'audio' | 'video' = 'image') {
  return {
    fileId: FILE_ID,
    userId: USER_ID,
    kind,
    storageUri: 's3://bucket/x',
    mimeType: kind === 'image' ? 'image/png' : kind === 'audio' ? 'audio/mpeg' : 'video/mp4',
    bytes: 1234,
    width: 10,
    height: 10,
    durationMs: null,
    displayName: 'x',
    status: 'ready' as const,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null as Date | null,
    thumbnailUri: null,
  };
}

describe('validateGenerateGate — owner check (AC-04)', () => {
  it('throws NotFoundError when the flow is absent or not owned', async () => {
    vi.mocked(findFlowById).mockResolvedValue(null);

    await expect(
      validateGenerateGate({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('validateGenerateGate — required-input resolution (AC-03)', () => {
  it('throws RequiredInputMissingError when a required input has no connection or supplied value', async () => {
    // LTX requires prompt + image_url; supply neither.
    const canvas: FlowCanvas = { blocks: [genBlock(LTX_MODEL_ID)], edges: [] };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    const err = await validateGenerateGate({
      flowId: FLOW_ID,
      blockId: BLOCK_ID,
      userId: USER_ID,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(RequiredInputMissingError);
    expect(err.code).toBe('flow.required_input_missing');
    // It must name the first unmet required input.
    expect(err.details).toMatchObject({ blockId: BLOCK_ID });
    expect(['prompt', 'image_url']).toContain(err.details.input);
  });

  it('passes when every required input is satisfied by a connection', async () => {
    const canvas: FlowCanvas = {
      blocks: [
        genBlock(LTX_MODEL_ID),
        textContentBlock(TEXT_BLOCK_ID, 'a prompt'),
        assetContentBlock(IMAGE_BLOCK_ID, FILE_ID),
      ],
      edges: [edge(TEXT_BLOCK_ID, 'prompt'), edge(IMAGE_BLOCK_ID, 'image_url')],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    vi.mocked(findByIdForUser).mockResolvedValue(ownedReadyFile('image'));

    await expect(
      validateGenerateGate({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID }),
    ).resolves.toBeDefined();
  });

  it('passes when a required input is satisfied by a directly-supplied param', async () => {
    // LTX with prompt supplied directly + image_url connected.
    const canvas: FlowCanvas = {
      blocks: [
        genBlock(LTX_MODEL_ID, { prompt: 'inline prompt' }),
        assetContentBlock(IMAGE_BLOCK_ID, FILE_ID),
      ],
      edges: [edge(IMAGE_BLOCK_ID, 'image_url')],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    vi.mocked(findByIdForUser).mockResolvedValue(ownedReadyFile('image'));

    await expect(
      validateGenerateGate({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID }),
    ).resolves.toBeDefined();
  });
});

describe('validateGenerateGate — exactly-one-of exclusivity (AC-06)', () => {
  it('throws ExclusivityViolationError when NEITHER alternative is provided', async () => {
    // kling: image_url connected, but neither prompt nor multi_prompt.
    const canvas: FlowCanvas = {
      blocks: [genBlock(KLING_MODEL_ID), assetContentBlock(IMAGE_BLOCK_ID, FILE_ID)],
      edges: [edge(IMAGE_BLOCK_ID, 'image_url')],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    vi.mocked(findByIdForUser).mockResolvedValue(ownedReadyFile('image'));

    const err = await validateGenerateGate({
      flowId: FLOW_ID,
      blockId: BLOCK_ID,
      userId: USER_ID,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(ExclusivityViolationError);
    expect(err.code).toBe('flow.exclusivity_violation');
    expect(err.details.exclusiveGroup).toBe('prompt_mode');
  });

  it('throws ExclusivityViolationError when BOTH alternatives are provided', async () => {
    // kling: image_url connected + prompt connected + multi_prompt supplied.
    const canvas: FlowCanvas = {
      blocks: [
        genBlock(KLING_MODEL_ID, { multi_prompt: ['shot 1', 'shot 2'] }),
        assetContentBlock(IMAGE_BLOCK_ID, FILE_ID),
        textContentBlock(TEXT_BLOCK_ID, 'single prompt'),
      ],
      edges: [edge(IMAGE_BLOCK_ID, 'image_url'), edge(TEXT_BLOCK_ID, 'prompt')],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    vi.mocked(findByIdForUser).mockResolvedValue(ownedReadyFile('image'));

    const err = await validateGenerateGate({
      flowId: FLOW_ID,
      blockId: BLOCK_ID,
      userId: USER_ID,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(ExclusivityViolationError);
    expect(err.details.provided).toEqual(expect.arrayContaining(['prompt', 'multi_prompt']));
  });

  it('passes when exactly one alternative is provided (supplied multi_prompt)', async () => {
    const canvas: FlowCanvas = {
      blocks: [
        genBlock(KLING_MODEL_ID, { multi_prompt: ['shot 1', 'shot 2'] }),
        assetContentBlock(IMAGE_BLOCK_ID, FILE_ID),
      ],
      edges: [edge(IMAGE_BLOCK_ID, 'image_url')],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    vi.mocked(findByIdForUser).mockResolvedValue(ownedReadyFile('image'));

    await expect(
      validateGenerateGate({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID }),
    ).resolves.toBeDefined();
  });
});

describe('validateGenerateGate — content non-empty / valid (AC-17)', () => {
  it('throws ContentInvalidError when a connected text content block is empty', async () => {
    const canvas: FlowCanvas = {
      blocks: [
        genBlock(LTX_MODEL_ID),
        textContentBlock(TEXT_BLOCK_ID, '   '), // whitespace only
        assetContentBlock(IMAGE_BLOCK_ID, FILE_ID),
      ],
      edges: [edge(TEXT_BLOCK_ID, 'prompt'), edge(IMAGE_BLOCK_ID, 'image_url')],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    vi.mocked(findByIdForUser).mockResolvedValue(ownedReadyFile('image'));

    const err = await validateGenerateGate({
      flowId: FLOW_ID,
      blockId: BLOCK_ID,
      userId: USER_ID,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(ContentInvalidError);
    expect(err.code).toBe('flow.content_invalid');
    expect(err.details).toMatchObject({ blockId: TEXT_BLOCK_ID, reason: 'empty' });
  });

  it('throws ContentInvalidError when a referenced asset modality does not match the input handle', async () => {
    // image_url handle fed by an AUDIO asset → invalid content.
    const canvas: FlowCanvas = {
      blocks: [
        genBlock(LTX_MODEL_ID, { prompt: 'inline' }),
        assetContentBlock(IMAGE_BLOCK_ID, FILE_ID),
      ],
      edges: [edge(IMAGE_BLOCK_ID, 'image_url')],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    vi.mocked(findByIdForUser).mockResolvedValue(ownedReadyFile('audio')); // wrong kind

    const err = await validateGenerateGate({
      flowId: FLOW_ID,
      blockId: BLOCK_ID,
      userId: USER_ID,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(ContentInvalidError);
    expect(err.details.blockId).toBe(IMAGE_BLOCK_ID);
  });
});

describe('validateGenerateGate — referenced-asset presence (AC-05 vs AC-04)', () => {
  it('throws AssetMissingError (422) when a PREVIOUSLY-OWNED asset is now soft-deleted', async () => {
    const canvas: FlowCanvas = {
      blocks: [
        genBlock(LTX_MODEL_ID, { prompt: 'inline' }),
        assetContentBlock(IMAGE_BLOCK_ID, FILE_ID),
      ],
      edges: [edge(IMAGE_BLOCK_ID, 'image_url')],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    // Active lookup misses (soft-deleted)…
    vi.mocked(findByIdForUser).mockResolvedValue(null);
    // …but the row still exists and is OWNED by this user → previously owned, now missing.
    vi.mocked(findByIdIncludingDeleted).mockResolvedValue({
      ...ownedReadyFile('image'),
      deletedAt: new Date(),
    });

    const err = await validateGenerateGate({
      flowId: FLOW_ID,
      blockId: BLOCK_ID,
      userId: USER_ID,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(AssetMissingError);
    expect(err.code).toBe('flow.asset_missing');
    expect(err.details).toMatchObject({ blockId: IMAGE_BLOCK_ID });
  });

  it('throws NotFoundError (404) when the asset was NEVER owned (no row at all)', async () => {
    const canvas: FlowCanvas = {
      blocks: [
        genBlock(LTX_MODEL_ID, { prompt: 'inline' }),
        assetContentBlock(IMAGE_BLOCK_ID, FILE_ID),
      ],
      edges: [edge(IMAGE_BLOCK_ID, 'image_url')],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    vi.mocked(findByIdForUser).mockResolvedValue(null);
    vi.mocked(findByIdIncludingDeleted).mockResolvedValue(null); // never existed

    await expect(
      validateGenerateGate({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError (404) when the asset exists but is owned by ANOTHER user (never-owned by caller)', async () => {
    const canvas: FlowCanvas = {
      blocks: [
        genBlock(LTX_MODEL_ID, { prompt: 'inline' }),
        assetContentBlock(IMAGE_BLOCK_ID, FILE_ID),
      ],
      edges: [edge(IMAGE_BLOCK_ID, 'image_url')],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    vi.mocked(findByIdForUser).mockResolvedValue(null);
    // Row exists but belongs to someone else → existence hiding, 404 (NOT asset_missing).
    vi.mocked(findByIdIncludingDeleted).mockResolvedValue({
      ...ownedReadyFile('image'),
      userId: OTHER_USER_ID,
    });

    await expect(
      validateGenerateGate({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// T12 — Generate enqueue: job create + enqueue + idempotency (AC-01/12/13)
// ──────────────────────────────────────────────────────────────────────────────

const IDEM_KEY = 'idem-11111111-1111-4111-8111-111111111111';

// Audio model — ElevenLabs TTS: required field `text` (modality text). (AC-12)
const TTS_MODEL_ID = 'elevenlabs/text-to-speech';
// Video model — image-to-video (LTX, reused above): prompt + image_url. (AC-13)
const VIDEO_MODEL_ID = LTX_MODEL_ID;
// Image model — text-to-image: required field `prompt`. (AC-01)
const IMAGE_MODEL_ID = 'fal-ai/nano-banana-2';

/**
 * A fully gate-passing canvas: the generation block inline-supplies every
 * required text field (`prompt` and `text` cover both fal + elevenlabs models)
 * and, when the model needs it, an image asset is connected to image_url.
 */
function passingCanvas(modelId: string, opts: { image?: boolean } = {}): FlowCanvas {
  const blocks = [
    genBlock(modelId, { prompt: 'a valid inline prompt', text: 'a valid inline prompt' }),
  ];
  const edges = [] as ReturnType<typeof edge>[];
  if (opts.image) {
    blocks.push(assetContentBlock(IMAGE_BLOCK_ID, FILE_ID));
    edges.push(edge(IMAGE_BLOCK_ID, 'image_url'));
  }
  return { blocks, edges };
}

function allowRateLimit() {
  vi.mocked(checkFlowRateLimit).mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
}

describe('generate — happy path (AC-01)', () => {
  it('creates one job (flow_id, block_id) and enqueues the ai-generate job exactly once', async () => {
    const canvas = passingCanvas(IMAGE_MODEL_ID);
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    vi.mocked(findByIdForUser).mockResolvedValue(ownedReadyFile('image'));
    allowRateLimit();
    // NX claim succeeds (first time): redis.set returns 'OK'.
    vi.mocked(redis.set).mockResolvedValue('OK');
    vi.mocked(redis.get).mockResolvedValue(null);

    const result = await generate({
      flowId: FLOW_ID,
      blockId: BLOCK_ID,
      userId: USER_ID,
      version: 1,
      idempotencyKey: IDEM_KEY,
    });

    expect(result.blockId).toBe(BLOCK_ID);
    expect(result.status).toBe('queued');
    expect(typeof result.jobId).toBe('string');

    expect(aiGenerationJobRepository.createJob).toHaveBeenCalledTimes(1);
    const createArg = vi.mocked(aiGenerationJobRepository.createJob).mock.calls[0]![0];
    expect(createArg.jobId).toBe(result.jobId);
    expect(createArg.userId).toBe(USER_ID);
    expect(createArg.modelId).toBe(IMAGE_MODEL_ID);

    // flow_id + block_id are written back on the job row.
    expect(aiGenerationJobRepository.setFlowLink).toHaveBeenCalledWith(
      result.jobId,
      FLOW_ID,
      BLOCK_ID,
    );

    // Enqueued exactly once with the same jobId.
    expect(enqueueAiGenerateJob).toHaveBeenCalledTimes(1);
    const enqArg = vi.mocked(enqueueAiGenerateJob).mock.calls[0]![0];
    expect(enqArg.jobId).toBe(result.jobId);
  });
});

describe('generate — gate failure short-circuits before any spend (AC-01)', () => {
  it('does not create a job, enqueue, or consume the rate limit when the gate fails', async () => {
    // LTX requires prompt + image_url; supply neither → RequiredInputMissingError.
    const canvas: FlowCanvas = { blocks: [genBlock(LTX_MODEL_ID)], edges: [] };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    allowRateLimit();
    vi.mocked(redis.set).mockResolvedValue('OK');

    await expect(
      generate({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID, version: 1, idempotencyKey: IDEM_KEY }),
    ).rejects.toBeInstanceOf(RequiredInputMissingError);

    expect(aiGenerationJobRepository.createJob).not.toHaveBeenCalled();
    expect(enqueueAiGenerateJob).not.toHaveBeenCalled();
    expect(checkFlowRateLimit).not.toHaveBeenCalled();
  });
});

describe('generate — rate-limit denial (no spend)', () => {
  it('throws RateLimitedError and creates no job / no enqueue when over the cap', async () => {
    const canvas = passingCanvas(IMAGE_MODEL_ID);
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    vi.mocked(findByIdForUser).mockResolvedValue(ownedReadyFile('image'));
    vi.mocked(redis.set).mockResolvedValue('OK');
    vi.mocked(checkFlowRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });

    const err = await generate({
      flowId: FLOW_ID,
      blockId: BLOCK_ID,
      userId: USER_ID,
      version: 1,
      idempotencyKey: IDEM_KEY,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(RateLimitedError);
    expect(err.retryAfterSeconds).toBe(42);
    expect(aiGenerationJobRepository.createJob).not.toHaveBeenCalled();
    expect(enqueueAiGenerateJob).not.toHaveBeenCalled();
  });
});

describe('generate — stale version (AC-10b semantics, 409)', () => {
  it('throws OptimisticLockError and does not spend when the version is stale', async () => {
    const canvas = passingCanvas(IMAGE_MODEL_ID);
    // Stored flow is at version 5; the client generated against version 4.
    vi.mocked(findFlowById).mockResolvedValue({ ...makeFlowRecord(canvas), version: 5 });
    allowRateLimit();
    vi.mocked(redis.set).mockResolvedValue('OK');

    await expect(
      generate({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID, version: 4, idempotencyKey: IDEM_KEY }),
    ).rejects.toBeInstanceOf(OptimisticLockError);

    expect(aiGenerationJobRepository.createJob).not.toHaveBeenCalled();
    expect(enqueueAiGenerateJob).not.toHaveBeenCalled();
  });
});

describe('generate — idempotency on a repeated Idempotency-Key (AC-01)', () => {
  it('returns the FIRST job and does NOT create a second job or enqueue twice', async () => {
    const canvas = passingCanvas(IMAGE_MODEL_ID);
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    vi.mocked(findByIdForUser).mockResolvedValue(ownedReadyFile('image'));
    allowRateLimit();

    // First call claims the NX key.
    vi.mocked(redis.set).mockResolvedValueOnce('OK');
    vi.mocked(redis.get).mockResolvedValue(null);
    const first = await generate({
      flowId: FLOW_ID,
      blockId: BLOCK_ID,
      userId: USER_ID,
      version: 1,
      idempotencyKey: IDEM_KEY,
    });

    // Second call with the SAME key: NX claim fails, stored result is returned.
    vi.mocked(redis.set).mockResolvedValueOnce(null);
    vi.mocked(redis.get).mockResolvedValue(
      JSON.stringify({ jobId: first.jobId, blockId: first.blockId, status: 'queued' }),
    );
    const second = await generate({
      flowId: FLOW_ID,
      blockId: BLOCK_ID,
      userId: USER_ID,
      version: 1,
      idempotencyKey: IDEM_KEY,
    });

    expect(second.jobId).toBe(first.jobId);
    // Still only ONE create + ONE enqueue across both calls.
    expect(aiGenerationJobRepository.createJob).toHaveBeenCalledTimes(1);
    expect(enqueueAiGenerateJob).toHaveBeenCalledTimes(1);
  });
});

describe('generate — all three modalities route through the ONE path', () => {
  it.each([
    ['image', IMAGE_MODEL_ID, false],
    ['audio', TTS_MODEL_ID, false],
    ['video', VIDEO_MODEL_ID, true],
  ] as const)('%s generation creates a job + enqueues once via the same path', async (_label, modelId, needsImage) => {
    const canvas = passingCanvas(modelId, { image: needsImage });
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));
    vi.mocked(findByIdForUser).mockResolvedValue(ownedReadyFile('image'));
    allowRateLimit();
    vi.mocked(redis.set).mockResolvedValue('OK');
    vi.mocked(redis.get).mockResolvedValue(null);

    const result = await generate({
      flowId: FLOW_ID,
      blockId: BLOCK_ID,
      userId: USER_ID,
      version: 1,
      idempotencyKey: `${IDEM_KEY}-${modelId}`,
    });

    expect(result.status).toBe('queued');
    expect(aiGenerationJobRepository.createJob).toHaveBeenCalledTimes(1);
    expect(enqueueAiGenerateJob).toHaveBeenCalledTimes(1);
    const enqArg = vi.mocked(enqueueAiGenerateJob).mock.calls[0]![0];
    expect(enqArg.modelId).toBe(modelId);
  });
});
