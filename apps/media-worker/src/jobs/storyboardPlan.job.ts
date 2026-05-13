import { UnrecoverableError, type Job } from 'bullmq';
import type { Pool } from 'mysql2/promise';
import { z } from 'zod';

import {
  STORYBOARD_PLAN_SCHEMA_VERSION,
  deriveStoryboardSceneCount,
  resolveStoryboardPlanStyleKey,
  resolveStoryboardPlanVideoLengthSeconds,
  storyboardPlanSchema,
  type StoryboardPlan,
  type StoryboardPlanJobPayload,
} from '@ai-video-editor/project-schema';

import {
  resolveStoryboardPlanContext,
  StoryboardPlanContextValidationError,
  toPersistedStoryboardPlanMediaContext,
} from './storyboardPlan.context.js';
import type {
  StoryboardPlanOpenAiMediaInput,
  StoryboardPlanResolvedContext,
} from './storyboardPlan.context.types.js';
import {
  createStoryboardPlanJobRepository,
  sanitizeStoryboardPlanJobError,
  type StoryboardPlanJobRepository,
} from './storyboardPlan.repository.js';

export const DEFAULT_STORYBOARD_PLAN_MODEL = 'gpt-4o-mini';
export const ALLOWED_STORYBOARD_PLAN_MODELS = [
  DEFAULT_STORYBOARD_PLAN_MODEL,
  'gpt-4o',
  'gpt-4.1-mini',
  'gpt-4.1',
] as const;

const MAX_STORYBOARD_PLAN_TOKENS = 8_000;

const storyboardPlanJobPayloadSchema = z.object({
  jobId: z.string().uuid(),
  draftId: z.string().uuid(),
  userId: z.string().trim().min(1).max(255),
}).strict();

type ChatCompletionResult = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

export type StoryboardPlanOpenAiClient = {
  chat: {
    completions: {
      create(params: unknown): Promise<ChatCompletionResult>;
    };
  };
};

export type StoryboardPlanJobDeps = {
  openai: StoryboardPlanOpenAiClient;
  pool: Pool;
  repository?: StoryboardPlanJobRepository;
  resolveContext?: (draftId: string, userId: string) => Promise<StoryboardPlanResolvedContext>;
  defaultModel?: string;
  allowedModels?: readonly string[];
};

export class StoryboardPlanOutputParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryboardPlanOutputParseError';
  }
}

export class StoryboardPlanSchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryboardPlanSchemaValidationError';
  }
}

export class StoryboardPlanJobPayloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryboardPlanJobPayloadValidationError';
  }
}

export const STORYBOARD_PLAN_SYSTEM_PROMPT = [
  'You are a storyboard planning worker for ClipTale.',
  'Return only valid JSON. Do not include markdown, code fences, comments, prose, or extra keys.',
  `The JSON must match schemaVersion ${STORYBOARD_PLAN_SCHEMA_VERSION} with keys: schemaVersion, videoLengthSeconds, sceneCount, scenes.`,
  'Every scene must include sceneNumber, prompt, visualPrompt, durationSeconds, referencedMedia, transitionNotes, and style.',
  'Use only referencedMedia items supplied in the prompt context; each item must include fileId, mediaType, and label.',
  'Scene numbers must be sequential starting at 1. Scene durations must sum to videoLengthSeconds.',
].join('\n');

function selectStoryboardPlanModel(
  modelPreference: unknown,
  defaultModel: string,
  allowedModels: readonly string[],
): string {
  return typeof modelPreference === 'string' && allowedModels.includes(modelPreference)
    ? modelPreference
    : defaultModel;
}

function extractCompletionText(completion: ChatCompletionResult): string {
  const content = completion.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('');
  }

  return '';
}

function parseStoryboardPlanJson(rawOutput: string): unknown {
  try {
    return JSON.parse(rawOutput);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Malformed JSON';
    throw new StoryboardPlanOutputParseError(`OpenAI returned malformed storyboard JSON: ${message}`);
  }
}

function validateStoryboardPlan(rawPlan: unknown): StoryboardPlan {
  const result = storyboardPlanSchema.safeParse(rawPlan);
  if (!result.success) {
    const details = result.error.issues
      .slice(0, 8)
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
    throw new StoryboardPlanSchemaValidationError(`OpenAI storyboard plan failed schema validation: ${details}`);
  }
  return result.data;
}

function buildMediaSummary(context: StoryboardPlanResolvedContext): unknown[] {
  return context.media.map((item) => ({
    fileId: item.fileId,
    mediaType: item.mediaType,
    label: item.label,
    displayName: item.displayName,
    mimeType: item.mimeType,
    width: item.width,
    height: item.height,
    durationMs: item.durationMs,
    status: item.status,
    thumbnailAvailable: item.thumbnailAvailable,
    transcript: item.transcript,
    contextStrategy: item.contextStrategy,
  }));
}

function buildUserPrompt(context: StoryboardPlanResolvedContext): string {
  const settings = context.promptDoc.settings;
  const videoLengthSeconds = resolveStoryboardPlanVideoLengthSeconds(settings?.videoLengthSeconds);
  const styleKey = resolveStoryboardPlanStyleKey(settings?.styleKey);
  const sceneCount = deriveStoryboardSceneCount(videoLengthSeconds);
  const targetDurationSeconds = videoLengthSeconds / sceneCount;

  return JSON.stringify({
    task: 'Create a structured storyboard plan for the user video prompt.',
    constraints: {
      schemaVersion: STORYBOARD_PLAN_SCHEMA_VERSION,
      videoLengthSeconds,
      sceneCount,
      targetDurationSeconds,
      style: styleKey,
      aspectRatio: settings?.aspectRatio ?? null,
      sceneDurationRule: 'The sum of all scene durationSeconds must equal videoLengthSeconds within 0.5 seconds.',
    },
    promptText: context.text,
    media: buildMediaSummary(context),
  });
}

function buildUserContent(context: StoryboardPlanResolvedContext): unknown[] {
  const content: unknown[] = [{ type: 'text', text: buildUserPrompt(context) }];

  for (const input of context.openAiMediaInputs) {
    content.push(toImageContentPart(input));
  }

  return content;
}

function toImageContentPart(input: StoryboardPlanOpenAiMediaInput): unknown {
  return {
    type: 'image_url',
    image_url: {
      url: input.url,
      detail: 'auto',
    },
  };
}

function isDeterministicFailure(error: unknown): boolean {
  return (
    error instanceof StoryboardPlanOutputParseError ||
    error instanceof StoryboardPlanSchemaValidationError ||
    error instanceof StoryboardPlanJobPayloadValidationError ||
    error instanceof StoryboardPlanContextValidationError
  );
}

function validateStoryboardPlanJobPayload(data: unknown): StoryboardPlanJobPayload {
  const result = storyboardPlanJobPayloadSchema.safeParse(data);
  if (!result.success) {
    throw new StoryboardPlanJobPayloadValidationError(
      'Malformed storyboard plan job payload: jobId and draftId must be valid UUID strings, and userId must be a non-empty string.',
    );
  }
  return result.data;
}

function extractValidStoryboardPlanJobId(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('jobId' in data)) {
    return null;
  }

  const result = z.string().uuid().safeParse(data.jobId);
  return result.success ? result.data : null;
}

function isFinalBullMqAttempt(job: Job<StoryboardPlanJobPayload>): boolean {
  const configuredAttempts = typeof job.opts?.attempts === 'number' && job.opts.attempts > 0
    ? job.opts.attempts
    : 1;
  const attemptsMade = typeof job.attemptsMade === 'number' && job.attemptsMade >= 0
    ? job.attemptsMade
    : 0;

  return attemptsMade + 1 >= configuredAttempts;
}

export async function processStoryboardPlanJob(
  job: Job<StoryboardPlanJobPayload>,
  deps: StoryboardPlanJobDeps,
): Promise<StoryboardPlan> {
  const repository = deps.repository ?? createStoryboardPlanJobRepository(deps.pool);
  let payload: StoryboardPlanJobPayload;
  try {
    payload = validateStoryboardPlanJobPayload(job.data);
  } catch (error) {
    const jobId = extractValidStoryboardPlanJobId(job.data);
    if (jobId) {
      await repository.markFailed(jobId, error);
    }
    throw new UnrecoverableError(sanitizeStoryboardPlanJobError(error));
  }

  const { jobId, draftId, userId } = payload;
  const resolveContext = deps.resolveContext ?? ((id, ownerId) => resolveStoryboardPlanContext(id, ownerId, { pool: deps.pool }));
  const defaultModel = deps.defaultModel ?? DEFAULT_STORYBOARD_PLAN_MODEL;
  const allowedModels = deps.allowedModels ?? ALLOWED_STORYBOARD_PLAN_MODELS;

  await repository.markRunning(jobId);

  try {
    const context = await resolveContext(draftId, userId);
    const model = selectStoryboardPlanModel(context.promptDoc.settings?.modelPreference, defaultModel, allowedModels);

    const completion = await deps.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: STORYBOARD_PLAN_SYSTEM_PROMPT },
        { role: 'user', content: buildUserContent(context) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: MAX_STORYBOARD_PLAN_TOKENS,
    });

    const rawOutput = extractCompletionText(completion);
    const plan = validateStoryboardPlan(parseStoryboardPlanJson(rawOutput));

    await repository.markCompleted({
      jobId,
      model,
      plan,
      mediaContext: toPersistedStoryboardPlanMediaContext(context),
    });

    return plan;
  } catch (error) {
    if (isDeterministicFailure(error)) {
      await repository.markFailed(jobId, error);
      throw new UnrecoverableError(sanitizeStoryboardPlanJobError(error));
    }
    if (isFinalBullMqAttempt(job)) {
      await repository.markFailed(jobId, error);
    }
    throw error;
  }
}
