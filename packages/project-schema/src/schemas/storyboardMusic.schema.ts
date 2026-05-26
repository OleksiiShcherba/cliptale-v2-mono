import { z } from 'zod';

export const ELEVENLABS_COMPOSITION_PLAN_MIN_SECTION_DURATION_MS = 3_000;
export const ELEVENLABS_COMPOSITION_PLAN_MAX_SECTION_DURATION_MS = 120_000;
export const ELEVENLABS_COMPOSITION_PLAN_MIN_TOTAL_DURATION_MS = 3_000;
export const ELEVENLABS_COMPOSITION_PLAN_MAX_TOTAL_DURATION_MS = 600_000;
export const ELEVENLABS_COMPOSITION_PLAN_MAX_SECTIONS = 30;
export const ELEVENLABS_COMPOSITION_PLAN_MAX_STYLES = 50;
export const ELEVENLABS_COMPOSITION_PLAN_MAX_LYRICS_LINES = 30;
export const ELEVENLABS_COMPOSITION_PLAN_MAX_LYRICS_LINE_LENGTH = 200;

const nonEmptyStringSchema = z.string().refine((value) => value.trim().length > 0, {
  message: 'Required string cannot be empty',
});

const maxNonEmptyStringSchema = (max: number) =>
  z.string().max(max).refine((value) => value.trim().length > 0, {
    message: 'Required string cannot be empty',
  });

const styleSchema = maxNonEmptyStringSchema(100);

export const elevenLabsCompositionPlanSectionSchema = z
  .object({
    section_name: maxNonEmptyStringSchema(100),
    positive_local_styles: z.array(styleSchema).max(ELEVENLABS_COMPOSITION_PLAN_MAX_STYLES).default([]),
    negative_local_styles: z.array(styleSchema).max(ELEVENLABS_COMPOSITION_PLAN_MAX_STYLES).default([]),
    duration_ms: z
      .number()
      .int()
      .min(ELEVENLABS_COMPOSITION_PLAN_MIN_SECTION_DURATION_MS)
      .max(ELEVENLABS_COMPOSITION_PLAN_MAX_SECTION_DURATION_MS),
    lines: z
      .array(z.string().max(ELEVENLABS_COMPOSITION_PLAN_MAX_LYRICS_LINE_LENGTH))
      .max(ELEVENLABS_COMPOSITION_PLAN_MAX_LYRICS_LINES)
      .default([]),
  })
  .strict();

export const elevenLabsCompositionPlanSchema = z
  .object({
    positive_global_styles: z.array(styleSchema).max(ELEVENLABS_COMPOSITION_PLAN_MAX_STYLES).default([]),
    negative_global_styles: z.array(styleSchema).max(ELEVENLABS_COMPOSITION_PLAN_MAX_STYLES).default([]),
    sections: z
      .array(elevenLabsCompositionPlanSectionSchema)
      .min(1)
      .max(ELEVENLABS_COMPOSITION_PLAN_MAX_SECTIONS),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const totalDurationMs = plan.sections.reduce((sum, section) => sum + section.duration_ms, 0);

    if (
      totalDurationMs < ELEVENLABS_COMPOSITION_PLAN_MIN_TOTAL_DURATION_MS ||
      totalDurationMs > ELEVENLABS_COMPOSITION_PLAN_MAX_TOTAL_DURATION_MS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sections'],
        message:
          `composition plan total duration must be between ` +
          `${ELEVENLABS_COMPOSITION_PLAN_MIN_TOTAL_DURATION_MS} and ` +
          `${ELEVENLABS_COMPOSITION_PLAN_MAX_TOTAL_DURATION_MS} ms`,
      });
    }
  });

export const storyboardMusicSourceModeSchema = z.enum(['existing', 'generate_now', 'generate_on_step3']);

export const storyboardMusicGenerationStatusSchema = z.enum(['queued', 'running', 'ready', 'failed']);

export const storyboardMusicBlockSchema = z
  .object({
    id: z.string().uuid(),
    draftId: z.string().uuid(),
    name: maxNonEmptyStringSchema(255),
    sourceMode: storyboardMusicSourceModeSchema,
    prompt: z.string().nullable(),
    compositionPlan: elevenLabsCompositionPlanSchema.nullable(),
    existingFileId: z.string().uuid().nullable(),
    startSceneBlockId: z.string().uuid(),
    endSceneBlockId: z.string().uuid(),
    positionX: z.number().finite(),
    positionY: z.number().finite(),
    sortOrder: z.number().int().min(0),
    volume: z.number().min(0).max(1),
    fadeInS: z.number().min(0),
    fadeOutS: z.number().min(0),
    loopMode: z.enum(['loop', 'trim']),
    generationStatus: storyboardMusicGenerationStatusSchema.nullable(),
    generationJobId: z.string().uuid().nullable(),
    outputFileId: z.string().uuid().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type ElevenLabsCompositionPlanSection = z.infer<typeof elevenLabsCompositionPlanSectionSchema>;
export type ElevenLabsCompositionPlan = z.infer<typeof elevenLabsCompositionPlanSchema>;
export type StoryboardMusicSourceMode = z.infer<typeof storyboardMusicSourceModeSchema>;
export type StoryboardMusicGenerationStatus = z.infer<typeof storyboardMusicGenerationStatusSchema>;
export type StoryboardMusicBlock = z.infer<typeof storyboardMusicBlockSchema>;
