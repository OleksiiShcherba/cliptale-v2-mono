import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError, type Job } from 'bullmq';
import type { Pool } from 'mysql2/promise';

import type {
  PromptDoc,
  StoryboardPlan,
  StoryboardPlanJobPayload,
} from '@ai-video-editor/project-schema';

import {
  resolveStoryboardPlanContext,
  StoryboardPlanContextValidationError,
} from './storyboardPlan.context.js';
import type { StoryboardPlanResolvedContext } from './storyboardPlan.context.types.js';
import {
  DEFAULT_STORYBOARD_PLAN_MODEL,
  STORYBOARD_PLAN_SYSTEM_PROMPT,
  processStoryboardPlanJob,
  type StoryboardPlanOpenAiClient,
} from './storyboardPlan.job.js';
import type { StoryboardPlanJobRepository } from './storyboardPlan.repository.js';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const DEV_USER_ID = 'dev-user-001';
const IMAGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VIDEO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AUDIO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function makeJob(
  data: unknown = {
    jobId: JOB_ID,
    draftId: DRAFT_ID,
    userId: USER_ID,
  },
  overrides: Partial<Job<StoryboardPlanJobPayload>> = {},
): Job<StoryboardPlanJobPayload> {
  return {
    data,
    ...overrides,
  } as unknown as Job<StoryboardPlanJobPayload>;
}

function makePromptDoc(modelPreference: string | null = 'gpt-4o'): PromptDoc {
  return {
    schemaVersion: 1,
    blocks: [
      { type: 'text', value: 'Create a launch video for a new camera.' },
      { type: 'media-ref', mediaType: 'image', fileId: IMAGE_ID, label: 'Product photo' },
      { type: 'media-ref', mediaType: 'video', fileId: VIDEO_ID, label: 'Demo clip' },
    ],
    settings: {
      videoLengthSeconds: 30,
      aspectRatio: '16:9',
      styleKey: 'product',
      modelPreference,
    },
  };
}

function makeContext(modelPreference: string | null = 'gpt-4o'): StoryboardPlanResolvedContext {
  return {
    promptDoc: makePromptDoc(modelPreference),
    text: 'Create a launch video for a new camera.',
    media: [
      {
        fileId: IMAGE_ID,
        mediaType: 'image',
        label: 'Product photo',
        mimeType: 'image/png',
        displayName: 'camera.png',
        width: 1200,
        height: 800,
        durationMs: null,
        bytes: 1234,
        status: 'ready',
        thumbnailAvailable: false,
        storageUri: 's3://bucket/images/camera.png',
        thumbnailUri: null,
        transcript: null,
        contextStrategy: 'image-vision',
      },
      {
        fileId: VIDEO_ID,
        mediaType: 'video',
        label: 'Demo clip',
        mimeType: 'video/mp4',
        displayName: 'demo.mp4',
        width: 1920,
        height: 1080,
        durationMs: 9000,
        bytes: 9876,
        status: 'ready',
        thumbnailAvailable: true,
        storageUri: 's3://bucket/videos/demo.mp4',
        thumbnailUri: 's3://bucket/thumbnails/demo.jpg',
        transcript: 'The presenter rotates the camera and points at the lens.',
        contextStrategy: 'video-metadata-thumbnail-transcript',
      },
    ],
    openAiMediaInputs: [
      {
        fileId: IMAGE_ID,
        mediaType: 'image',
        label: 'Product photo',
        role: 'image',
        url: 'https://signed.example.com/camera.png',
        mimeType: 'image/png',
      },
      {
        fileId: VIDEO_ID,
        mediaType: 'video',
        label: 'Demo clip',
        role: 'video-preview',
        url: 'https://signed.example.com/demo-thumb.jpg',
        mimeType: 'image/jpeg',
      },
    ],
  };
}

function makeValidPlan(): StoryboardPlan {
  return {
    schemaVersion: 1,
    videoLengthSeconds: 30,
    sceneCount: 5,
    scenes: Array.from({ length: 5 }, (_, index) => ({
      sceneNumber: index + 1,
      prompt: `Scene ${index + 1} narration beat`,
      visualPrompt: `Product-focused visual beat ${index + 1}`,
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationSeconds: 6,
      referencedMedia: index === 0
        ? [{ fileId: IMAGE_ID, mediaType: 'image', label: 'Product photo' }]
        : [],
      transitionNotes: index === 4 ? 'End cleanly.' : 'Cut on motion.',
      style: 'product',
    })),
  };
}

function makeCustomLengthPlan(): StoryboardPlan {
  return {
    schemaVersion: 1,
    videoLengthSeconds: 45,
    sceneCount: 8,
    scenes: Array.from({ length: 8 }, (_, index) => ({
      sceneNumber: index + 1,
      prompt: `Custom length scene ${index + 1}`,
      visualPrompt: `Custom length visual beat ${index + 1}`,
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationSeconds: 5.625,
      referencedMedia: index === 0
        ? [
            { fileId: IMAGE_ID, mediaType: 'image', label: 'Product photo' },
            { fileId: VIDEO_ID, mediaType: 'video', label: 'Demo clip' },
            { fileId: AUDIO_ID, mediaType: 'audio', label: 'Voiceover' },
          ]
        : [],
      transitionNotes: 'Cut cleanly.',
      style: 'product',
    })),
  };
}

function makeOpenAiMock(content: string): StoryboardPlanOpenAiClient {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  };
}

function makeRepository(events: string[] = []): StoryboardPlanJobRepository {
  return {
    markRunning: vi.fn(async () => {
      events.push('running');
    }),
    markCompleted: vi.fn(async () => {
      events.push('completed');
    }),
    markFailed: vi.fn(async () => {
      events.push('failed');
    }),
  };
}

const pool = {} as Pool;

describe('processStoryboardPlanJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks running, calls OpenAI with text and image URLs, validates output, and persists completion', async () => {
    const events: string[] = [];
    const context = makeContext('gpt-4o');
    const repository = makeRepository(events);
    const openai = makeOpenAiMock(JSON.stringify(makeValidPlan()));
    const resolveContext = vi.fn(async () => {
      events.push('context');
      return context;
    });

    const result = await processStoryboardPlanJob(makeJob(), {
      openai,
      pool,
      repository,
      resolveContext,
    });

    expect(result).toEqual(makeValidPlan());
    expect(events).toEqual(['running', 'context', 'completed']);
    expect(resolveContext).toHaveBeenCalledWith(DRAFT_ID, USER_ID);

    const createSpy = openai.chat.completions.create as ReturnType<typeof vi.fn>;
    expect(createSpy).toHaveBeenCalledOnce();
    const callArg = createSpy.mock.calls[0]![0] as {
      model: string;
      messages: Array<{ role: string; content: unknown }>;
      response_format: unknown;
    };
    expect(callArg.model).toBe('gpt-4o');
    expect(callArg.response_format).toEqual({ type: 'json_object' });
    expect(callArg.messages[0]).toEqual({ role: 'system', content: STORYBOARD_PLAN_SYSTEM_PROMPT });
    expect(STORYBOARD_PLAN_SYSTEM_PROMPT).toContain('videoPrompt');
    expect(STORYBOARD_PLAN_SYSTEM_PROMPT).toContain('main subject motion');
    expect(STORYBOARD_PLAN_SYSTEM_PROMPT).toContain('camera movement');
    expect(STORYBOARD_PLAN_SYSTEM_PROMPT).toContain('foreground/background depth cues');
    expect(STORYBOARD_PLAN_SYSTEM_PROMPT).toContain('cinematic timing');
    expect(STORYBOARD_PLAN_SYSTEM_PROMPT).toContain('previous scene and into the next scene');
    expect(STORYBOARD_PLAN_SYSTEM_PROMPT).toContain('without provider-specific jargon');

    const userContent = callArg.messages[1]!.content as Array<unknown>;
    expect(userContent).toHaveLength(3);
    expect(userContent[0]).toMatchObject({ type: 'text' });
    expect(userContent[1]).toMatchObject({
      type: 'image_url',
      image_url: { url: 'https://signed.example.com/camera.png' },
    });
    expect(userContent[2]).toMatchObject({
      type: 'image_url',
      image_url: { url: 'https://signed.example.com/demo-thumb.jpg' },
    });

    expect(repository.markCompleted).toHaveBeenCalledWith({
      jobId: JOB_ID,
      model: 'gpt-4o',
      plan: makeValidPlan(),
      mediaContext: {
        text: context.text,
        media: context.media,
      },
    });
  });

  it('resolves draft media rows, calls mocked OpenAI, and persists a custom-length plan without storyboard blocks', async () => {
    const promptDoc: PromptDoc = {
      schemaVersion: 1,
      blocks: [
        { type: 'text', value: 'Create a product launch video with supplied media.' },
        { type: 'media-ref', mediaType: 'image', fileId: IMAGE_ID, label: 'Product photo' },
        { type: 'media-ref', mediaType: 'video', fileId: VIDEO_ID, label: 'Demo clip' },
        { type: 'media-ref', mediaType: 'audio', fileId: AUDIO_ID, label: 'Voiceover' },
      ],
      settings: {
        videoLengthSeconds: 45,
        aspectRatio: '9:16',
        styleKey: 'product',
        modelPreference: 'gpt-4o',
      },
    };
    const persistedJob = {
      status: 'queued',
      model: null as string | null,
      plan_json: null as string | null,
      media_context_json: null as string | null,
      error_message: null as string | null,
      completed_at: null as Date | null,
      failed_at: null as Date | null,
    };
    const queries: string[] = [];
    const poolWithRows = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push(sql);
        if (sql.includes('FROM generation_drafts')) {
          expect(params).toEqual([DRAFT_ID, USER_ID]);
          return [[{ id: DRAFT_ID, user_id: USER_ID, prompt_doc: JSON.stringify(promptDoc) }]];
        }
        if (sql.includes('FROM files f')) {
          expect(params).toEqual([DRAFT_ID, IMAGE_ID, VIDEO_ID, AUDIO_ID]);
          return [[
            {
              file_id: IMAGE_ID,
              user_id: USER_ID,
              kind: 'image',
              storage_uri: 's3://media-bucket/images/product.png',
              mime_type: 'image/png',
              bytes: 12345,
              width: 1200,
              height: 800,
              duration_ms: null,
              display_name: 'product.png',
              status: 'ready',
              deleted_at: null,
              thumbnail_uri: null,
              draft_file_id: IMAGE_ID,
              draft_file_deleted_at: null,
            },
            {
              file_id: VIDEO_ID,
              user_id: USER_ID,
              kind: 'video',
              storage_uri: 's3://media-bucket/videos/demo.mp4',
              mime_type: 'video/mp4',
              bytes: 98765,
              width: 1920,
              height: 1080,
              duration_ms: 12000,
              display_name: 'demo.mp4',
              status: 'ready',
              deleted_at: null,
              thumbnail_uri: 's3://media-bucket/thumbnails/demo.jpg',
              draft_file_id: VIDEO_ID,
              draft_file_deleted_at: null,
            },
            {
              file_id: AUDIO_ID,
              user_id: USER_ID,
              kind: 'audio',
              storage_uri: 's3://media-bucket/audio/voiceover.mp3',
              mime_type: 'audio/mpeg',
              bytes: 45678,
              width: null,
              height: null,
              duration_ms: 10000,
              display_name: 'voiceover.mp3',
              status: 'ready',
              deleted_at: null,
              thumbnail_uri: null,
              draft_file_id: AUDIO_ID,
              draft_file_deleted_at: null,
            },
          ]];
        }
        if (sql.includes('FROM caption_tracks')) {
          expect(params).toEqual([IMAGE_ID, VIDEO_ID, AUDIO_ID]);
          return [[
            {
              file_id: VIDEO_ID,
              segments_json: JSON.stringify([{ start: 0, end: 2, text: 'The demo clip opens on the product.' }]),
            },
            {
              file_id: AUDIO_ID,
              segments_json: JSON.stringify([{ start: 0, end: 2, text: 'Meet the faster way to launch.' }]),
            },
          ]];
        }
        if (sql.includes("SET status = 'running'")) {
          expect(params).toEqual([JOB_ID]);
          persistedJob.status = 'running';
          persistedJob.error_message = null;
          persistedJob.failed_at = null;
          return [{ affectedRows: 1 }];
        }
        if (sql.includes("SET status = 'completed'")) {
          expect(params?.[3]).toBe(JOB_ID);
          persistedJob.status = 'completed';
          persistedJob.model = params?.[0] as string;
          persistedJob.plan_json = params?.[1] as string;
          persistedJob.media_context_json = params?.[2] as string;
          persistedJob.error_message = null;
          persistedJob.completed_at = new Date();
          persistedJob.failed_at = null;
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    } as unknown as Pool;
    const signReadUrl = vi.fn(async (storageUri: string) => `https://signed.example.test/${encodeURIComponent(storageUri)}`);
    const customPlan = makeCustomLengthPlan();
    const openai = makeOpenAiMock(JSON.stringify(customPlan));

    const result = await processStoryboardPlanJob(makeJob(), {
      openai,
      pool: poolWithRows,
      resolveContext: (draftId, userId) =>
        resolveStoryboardPlanContext(draftId, userId, { pool: poolWithRows, signReadUrl }),
    });

    expect(result).toEqual(customPlan);
    expect(persistedJob.status).toBe('completed');
    expect(persistedJob.model).toBe('gpt-4o');
    expect(JSON.parse(persistedJob.plan_json ?? 'null')).toEqual(customPlan);
    expect(JSON.parse(persistedJob.media_context_json ?? 'null')).toMatchObject({
      text: 'Create a product launch video with supplied media.',
      media: [
        { fileId: IMAGE_ID, mediaType: 'image', contextStrategy: 'image-vision' },
        {
          fileId: VIDEO_ID,
          mediaType: 'video',
          transcript: 'The demo clip opens on the product.',
          contextStrategy: 'video-metadata-thumbnail-transcript',
        },
        {
          fileId: AUDIO_ID,
          mediaType: 'audio',
          transcript: 'Meet the faster way to launch.',
          contextStrategy: 'audio-transcript-first',
        },
      ],
    });
    expect(persistedJob.media_context_json).not.toContain('https://signed.example.test');
    expect(signReadUrl).toHaveBeenCalledWith('s3://media-bucket/images/product.png');
    expect(signReadUrl).toHaveBeenCalledWith('s3://media-bucket/thumbnails/demo.jpg');
    expect(signReadUrl).not.toHaveBeenCalledWith('s3://media-bucket/videos/demo.mp4');
    expect(signReadUrl).not.toHaveBeenCalledWith('s3://media-bucket/audio/voiceover.mp3');

    const createSpy = openai.chat.completions.create as ReturnType<typeof vi.fn>;
    const userContent = createSpy.mock.calls[0]![0].messages[1].content as Array<{ text?: string }>;
    const userPrompt = JSON.parse(userContent[0]!.text ?? '{}') as {
      constraints: { videoLengthSeconds: number; sceneCount: number; aspectRatio: string };
      media: Array<{ fileId: string; transcript: string | null; contextStrategy: string }>;
    };
    expect(userPrompt.constraints).toMatchObject({
      videoLengthSeconds: 45,
      sceneCount: 8,
      aspectRatio: '9:16',
    });
    expect(userPrompt.media).toEqual(expect.arrayContaining([
      expect.objectContaining({ fileId: VIDEO_ID, transcript: 'The demo clip opens on the product.' }),
      expect.objectContaining({ fileId: AUDIO_ID, transcript: 'Meet the faster way to launch.' }),
    ]));
    expect(queries.join('\n')).not.toContain('storyboard_blocks');
  });

  it('falls back to the default model when modelPreference is not allowlisted', async () => {
    const repository = makeRepository();
    const openai = makeOpenAiMock(JSON.stringify(makeValidPlan()));

    await processStoryboardPlanJob(makeJob(), {
      openai,
      pool,
      repository,
      resolveContext: vi.fn(async () => makeContext('not-an-allowed-model')),
      allowedModels: [DEFAULT_STORYBOARD_PLAN_MODEL],
      defaultModel: DEFAULT_STORYBOARD_PLAN_MODEL,
    });

    const createSpy = openai.chat.completions.create as ReturnType<typeof vi.fn>;
    expect(createSpy.mock.calls[0]![0]).toMatchObject({
      model: DEFAULT_STORYBOARD_PLAN_MODEL,
    });
    expect(repository.markCompleted).toHaveBeenCalledWith(expect.objectContaining({
      model: DEFAULT_STORYBOARD_PLAN_MODEL,
    }));
  });

  it('accepts valid BullMQ payloads and uses validated identifiers for lifecycle calls', async () => {
    const repository = makeRepository();
    const openai = makeOpenAiMock(JSON.stringify(makeValidPlan()));
    const resolveContext = vi.fn(async () => makeContext());

    await processStoryboardPlanJob(makeJob(), {
      openai,
      pool,
      repository,
      resolveContext,
    });

    expect(repository.markRunning).toHaveBeenCalledWith(JOB_ID);
    expect(resolveContext).toHaveBeenCalledWith(DRAFT_ID, USER_ID);
    expect(repository.markCompleted).toHaveBeenCalledWith(expect.objectContaining({
      jobId: JOB_ID,
    }));
  });

  it('marks failed and throws UnrecoverableError for malformed JSON without a retryable OpenAI error', async () => {
    const repository = makeRepository();
    const openai = makeOpenAiMock('not json');

    await expect(processStoryboardPlanJob(makeJob(), {
      openai,
      pool,
      repository,
      resolveContext: vi.fn(async () => makeContext()),
    })).rejects.toBeInstanceOf(UnrecoverableError);

    expect(repository.markFailed).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({ name: 'StoryboardPlanOutputParseError' }),
    );
    expect(repository.markCompleted).not.toHaveBeenCalled();
  });

  it('marks failed and throws UnrecoverableError for schema-invalid plans', async () => {
    const invalidPlan = {
      ...makeValidPlan(),
      sceneCount: 4,
    };
    const repository = makeRepository();
    const openai = makeOpenAiMock(JSON.stringify(invalidPlan));

    await expect(processStoryboardPlanJob(makeJob(), {
      openai,
      pool,
      repository,
      resolveContext: vi.fn(async () => makeContext()),
    })).rejects.toBeInstanceOf(UnrecoverableError);

    expect(repository.markFailed).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({ name: 'StoryboardPlanSchemaValidationError' }),
    );
    expect(repository.markCompleted).not.toHaveBeenCalled();
  });

  it('marks failed and does not call OpenAI when media context resolution fails validation', async () => {
    const repository = makeRepository();
    const openai = makeOpenAiMock(JSON.stringify(makeValidPlan()));
    const contextError = new StoryboardPlanContextValidationError('Media reference is not linked to draft');

    await expect(processStoryboardPlanJob(makeJob(), {
      openai,
      pool,
      repository,
      resolveContext: vi.fn(async () => {
        throw contextError;
      }),
    })).rejects.toBeInstanceOf(UnrecoverableError);

    expect(openai.chat.completions.create).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith(JOB_ID, contextError);
  });

  it('does not mark failed for non-final transient OpenAI failures so BullMQ can retry', async () => {
    const repository = makeRepository();
    const transientError = new Error('OpenAI 503 Service Unavailable');
    const openai: StoryboardPlanOpenAiClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(transientError),
        },
      },
    };

    await expect(processStoryboardPlanJob(makeJob(undefined, {
      attemptsMade: 1,
      opts: { attempts: 3 },
    }), {
      openai,
      pool,
      repository,
      resolveContext: vi.fn(async () => makeContext()),
    })).rejects.toBe(transientError);

    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(repository.markCompleted).not.toHaveBeenCalled();
  });

  it('marks failed for final-attempt transient OpenAI failures', async () => {
    const repository = makeRepository();
    const transientError = new Error('OpenAI 503 Service Unavailable');
    const openai: StoryboardPlanOpenAiClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(transientError),
        },
      },
    };

    await expect(processStoryboardPlanJob(makeJob(undefined, {
      attemptsMade: 2,
      opts: { attempts: 3 },
    }), {
      openai,
      pool,
      repository,
      resolveContext: vi.fn(async () => makeContext()),
    })).rejects.toBe(transientError);

    expect(repository.markFailed).toHaveBeenCalledWith(JOB_ID, transientError);
    expect(repository.markCompleted).not.toHaveBeenCalled();
  });

  it('marks valid job IDs failed for malformed BullMQ payloads without running the job', async () => {
    const repository = makeRepository();
    const openai = makeOpenAiMock(JSON.stringify(makeValidPlan()));
    const resolveContext = vi.fn(async () => makeContext());

    await expect(processStoryboardPlanJob(makeJob({
      jobId: JOB_ID,
      draftId: null,
      userId: USER_ID,
    }), {
      openai,
      pool,
      repository,
      resolveContext,
    })).rejects.toBeInstanceOf(UnrecoverableError);

    expect(repository.markRunning).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({
        name: 'StoryboardPlanJobPayloadValidationError',
        message: 'Malformed storyboard plan job payload: jobId and draftId must be valid UUID strings, and userId must be a non-empty string.',
      }),
    );
    expect(resolveContext).not.toHaveBeenCalled();
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it('does not update the database when malformed BullMQ payloads lack a valid jobId', async () => {
    const repository = makeRepository();
    const openai = makeOpenAiMock(JSON.stringify(makeValidPlan()));

    await expect(processStoryboardPlanJob(makeJob({
      draftId: DRAFT_ID,
      userId: USER_ID,
    }), {
      openai,
      pool,
      repository,
      resolveContext: vi.fn(async () => makeContext()),
    })).rejects.toBeInstanceOf(UnrecoverableError);

    expect(repository.markRunning).not.toHaveBeenCalled();
    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(repository.markCompleted).not.toHaveBeenCalled();
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it('accepts the seeded dev auth user id used by local Docker auth bypass', async () => {
    const repository = makeRepository();
    const openai = makeOpenAiMock(JSON.stringify(makeValidPlan()));
    const resolveContext = vi.fn(async () => makeContext());

    await processStoryboardPlanJob(makeJob({
      jobId: JOB_ID,
      draftId: DRAFT_ID,
      userId: DEV_USER_ID,
    }), {
      openai,
      pool,
      repository,
      resolveContext,
    });

    expect(resolveContext).toHaveBeenCalledWith(DRAFT_ID, DEV_USER_ID);
    expect(repository.markRunning).toHaveBeenCalledWith(JOB_ID);
    expect(repository.markCompleted).toHaveBeenCalledWith(expect.objectContaining({
      jobId: JOB_ID,
    }));
  });
});
