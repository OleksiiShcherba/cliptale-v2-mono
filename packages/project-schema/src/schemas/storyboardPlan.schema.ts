import { z } from 'zod';

import { draftStyleKeySchema, draftVideoLengthSecondsSchema } from './promptDoc.schema.js';
import type { DraftStyleKey, DraftVideoLengthSeconds } from './promptDoc.schema.js';
import {
  elevenLabsCompositionPlanSchema,
  storyboardMusicSourceModeSchema,
} from './storyboardMusic.schema.js';

export const STORYBOARD_PLAN_SCHEMA_VERSION = 2;
export const STORYBOARD_PLAN_LEGACY_SCHEMA_VERSION = 1;
export const STORYBOARD_PLAN_TARGET_SCENE_DURATION_SECONDS = 6;
export const STORYBOARD_PLAN_MIN_SCENE_COUNT = 1;
export const STORYBOARD_PLAN_MAX_SCENE_COUNT = 40;
export const STORYBOARD_PLAN_DURATION_TOLERANCE_SECONDS = 0.5;
export const STORYBOARD_PLAN_DEFAULT_VIDEO_LENGTH_SECONDS: DraftVideoLengthSeconds = 30;
export const STORYBOARD_PLAN_DEFAULT_STYLE_KEY: DraftStyleKey = 'cinematic';

const nonEmptyStringSchema = z.string().refine((value) => value.trim().length > 0, {
  message: 'Required string cannot be empty',
});

export const storyboardPlanReferencedMediaSchema = z
  .object({
    fileId: z.string().uuid(),
    mediaType: z.enum(['video', 'image', 'audio']),
    label: nonEmptyStringSchema,
  })
  .strict();

export const storyboardPlanSceneSchema = z
  .object({
    sceneNumber: z.number().int().positive(),
    prompt: nonEmptyStringSchema,
    visualPrompt: nonEmptyStringSchema,
    videoPrompt: nonEmptyStringSchema,
    durationSeconds: z.number().finite().positive(),
    referencedMedia: z.array(storyboardPlanReferencedMediaSchema),
    transitionNotes: z.string(),
    style: draftStyleKeySchema,
  })
  .strict();

export const storyboardPlanJobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);

export const storyboardPlanMusicSegmentSchema = z
  .object({
    name: z.string().max(255).refine((value) => value.trim().length > 0, {
      message: 'Required string cannot be empty',
    }),
    prompt: nonEmptyStringSchema,
    compositionPlan: elevenLabsCompositionPlanSchema,
    startSceneNumber: z.number().int().positive(),
    endSceneNumber: z.number().int().positive(),
    sourceMode: storyboardMusicSourceModeSchema.default('generate_on_step3'),
  })
  .strict();

function getCompositionPlanDurationMs(plan: z.infer<typeof elevenLabsCompositionPlanSchema>): number {
  return plan.sections.reduce((sum, section) => sum + section.duration_ms, 0);
}

const storyboardPlanBaseSchema = z
  .object({
    schemaVersion: z.literal(STORYBOARD_PLAN_SCHEMA_VERSION),
    videoLengthSeconds: draftVideoLengthSecondsSchema,
    sceneCount: z.number().int().min(STORYBOARD_PLAN_MIN_SCENE_COUNT).max(STORYBOARD_PLAN_MAX_SCENE_COUNT),
    scenes: z.array(storyboardPlanSceneSchema).min(STORYBOARD_PLAN_MIN_SCENE_COUNT).max(STORYBOARD_PLAN_MAX_SCENE_COUNT),
    musicSegments: z.array(storyboardPlanMusicSegmentSchema).default([]),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const expectedSceneCount = deriveStoryboardSceneCount(plan.videoLengthSeconds);
    if (plan.sceneCount !== expectedSceneCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sceneCount'],
        message: `sceneCount must be derived from videoLengthSeconds; expected ${expectedSceneCount}`,
      });
    }

    if (plan.sceneCount !== plan.scenes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sceneCount'],
        message: 'sceneCount must match scenes.length',
      });
    }

    for (const [index, scene] of plan.scenes.entries()) {
      const expectedSceneNumber = index + 1;
      if (scene.sceneNumber !== expectedSceneNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', index, 'sceneNumber'],
          message: `sceneNumber must be sequential starting at 1; expected ${expectedSceneNumber}`,
        });
      }
    }

    for (const [index, musicSegment] of plan.musicSegments.entries()) {
      if (musicSegment.startSceneNumber > musicSegment.endSceneNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['musicSegments', index, 'startSceneNumber'],
          message: 'startSceneNumber must be less than or equal to endSceneNumber',
        });
      }

      if (musicSegment.endSceneNumber > plan.sceneCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['musicSegments', index, 'endSceneNumber'],
          message: 'endSceneNumber must reference an existing scene',
        });
      }

      const coveredDurationMs = plan.scenes
        .slice(musicSegment.startSceneNumber - 1, musicSegment.endSceneNumber)
        .reduce((sum, scene) => sum + scene.durationSeconds * 1_000, 0);
      const compositionDurationMs = getCompositionPlanDurationMs(musicSegment.compositionPlan);
      if (
        Number.isFinite(coveredDurationMs) &&
        Math.abs(compositionDurationMs - coveredDurationMs) > STORYBOARD_PLAN_DURATION_TOLERANCE_SECONDS * 1_000
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['musicSegments', index, 'compositionPlan', 'sections'],
          message: 'composition plan duration must match the covered scene range',
        });
      }
    }

    const totalDurationSeconds = plan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
    if (Math.abs(totalDurationSeconds - plan.videoLengthSeconds) > STORYBOARD_PLAN_DURATION_TOLERANCE_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scenes'],
        message: `scene durations must sum to videoLengthSeconds within ${STORYBOARD_PLAN_DURATION_TOLERANCE_SECONDS} seconds`,
      });
    }
  });

const storyboardPlanLegacySchema = z
  .object({
    schemaVersion: z.literal(STORYBOARD_PLAN_LEGACY_SCHEMA_VERSION),
    videoLengthSeconds: draftVideoLengthSecondsSchema,
    sceneCount: z.number().int().min(STORYBOARD_PLAN_MIN_SCENE_COUNT).max(STORYBOARD_PLAN_MAX_SCENE_COUNT),
    scenes: z.array(storyboardPlanSceneSchema).min(STORYBOARD_PLAN_MIN_SCENE_COUNT).max(STORYBOARD_PLAN_MAX_SCENE_COUNT),
  })
  .strict()
  .transform((plan) => ({
    ...plan,
    schemaVersion: STORYBOARD_PLAN_SCHEMA_VERSION,
    musicSegments: [],
  }));

export const storyboardPlanSchema = z.union([storyboardPlanBaseSchema, storyboardPlanLegacySchema]).pipe(storyboardPlanBaseSchema);

const storyboardPlanQueuedJobResultSchema = z
  .object({
    jobId: z.string(),
    status: z.enum(['queued', 'running']),
    plan: z.null().optional(),
    errorMessage: z.null().optional(),
  })
  .strict();

const storyboardPlanCompletedJobResultSchema = z
  .object({
    jobId: z.string(),
    status: z.literal('completed'),
    plan: storyboardPlanSchema,
    errorMessage: z.null().optional(),
  })
  .strict();

const storyboardPlanFailedJobResultSchema = z
  .object({
    jobId: z.string(),
    status: z.literal('failed'),
    plan: z.null().optional(),
    errorMessage: nonEmptyStringSchema,
  })
  .strict();

export const storyboardPlanJobResultSchema = z.discriminatedUnion('status', [
  storyboardPlanQueuedJobResultSchema,
  storyboardPlanCompletedJobResultSchema,
  storyboardPlanFailedJobResultSchema,
]);

export function deriveStoryboardSceneCount(videoLengthSeconds: number): number {
  const parsedVideoLengthSeconds = draftVideoLengthSecondsSchema.parse(videoLengthSeconds);
  return Math.min(
    STORYBOARD_PLAN_MAX_SCENE_COUNT,
    Math.max(
      STORYBOARD_PLAN_MIN_SCENE_COUNT,
      Math.ceil(parsedVideoLengthSeconds / STORYBOARD_PLAN_TARGET_SCENE_DURATION_SECONDS),
    ),
  );
}

export function resolveStoryboardPlanVideoLengthSeconds(videoLengthSeconds: unknown): DraftVideoLengthSeconds {
  const result = draftVideoLengthSecondsSchema.safeParse(videoLengthSeconds);
  return result.success ? result.data : STORYBOARD_PLAN_DEFAULT_VIDEO_LENGTH_SECONDS;
}

export function resolveStoryboardPlanStyleKey(styleKey: unknown): DraftStyleKey {
  const result = draftStyleKeySchema.safeParse(styleKey);
  return result.success ? result.data : STORYBOARD_PLAN_DEFAULT_STYLE_KEY;
}

export type StoryboardPlanReferencedMedia = z.infer<typeof storyboardPlanReferencedMediaSchema>;
export type StoryboardPlanScene = z.infer<typeof storyboardPlanSceneSchema>;
export type StoryboardPlanMusicSegment = z.infer<typeof storyboardPlanMusicSegmentSchema>;
export type StoryboardPlan = z.infer<typeof storyboardPlanSchema>;
export type StoryboardPlanJobStatus = z.infer<typeof storyboardPlanJobStatusSchema>;
export type StoryboardPlanJobResult = z.infer<typeof storyboardPlanJobResultSchema>;
