import { describe, expect, it } from 'vitest';

import {
  ELEVENLABS_COMPOSITION_PLAN_MAX_LYRICS_LINES,
  ELEVENLABS_COMPOSITION_PLAN_MAX_SECTIONS,
  ELEVENLABS_COMPOSITION_PLAN_MAX_STYLES,
  elevenLabsCompositionPlanSchema,
  storyboardMusicBlockSchema,
  storyboardMusicGenerationStatusSchema,
  storyboardMusicSourceModeSchema,
} from './storyboardMusic.schema.js';

const validCompositionPlan = {
  positive_global_styles: ['cinematic', 'warm piano'],
  negative_global_styles: ['vocals', 'lyrics', 'singing'],
  sections: [
    {
      section_name: 'Intro',
      positive_local_styles: ['soft pulse'],
      negative_local_styles: ['spoken word'],
      duration_ms: 3_000,
      lines: [],
    },
  ],
};

describe('elevenLabsCompositionPlanSchema', () => {
  it('accepts a valid instrumental composition plan', () => {
    expect(elevenLabsCompositionPlanSchema.safeParse(validCompositionPlan).success).toBe(true);
  });

  it('rejects malformed section limits before ElevenLabs calls', () => {
    expect(
      elevenLabsCompositionPlanSchema.safeParse({
        ...validCompositionPlan,
        sections: [{ ...validCompositionPlan.sections[0], section_name: '' }],
      }).success,
    ).toBe(false);

    expect(
      elevenLabsCompositionPlanSchema.safeParse({
        ...validCompositionPlan,
        sections: [{ ...validCompositionPlan.sections[0], section_name: 'x'.repeat(101) }],
      }).success,
    ).toBe(false);

    for (const duration_ms of [2_999, 120_001] as const) {
      expect(
        elevenLabsCompositionPlanSchema.safeParse({
          ...validCompositionPlan,
          sections: [{ ...validCompositionPlan.sections[0], duration_ms }],
        }).success,
      ).toBe(false);
    }
  });

  it('rejects impossible total durations and too many sections', () => {
    expect(
      elevenLabsCompositionPlanSchema.safeParse({
        ...validCompositionPlan,
        sections: Array.from({ length: ELEVENLABS_COMPOSITION_PLAN_MAX_SECTIONS + 1 }, (_, index) => ({
          ...validCompositionPlan.sections[0],
          section_name: `Section ${index + 1}`,
        })),
      }).success,
    ).toBe(false);

    expect(
      elevenLabsCompositionPlanSchema.safeParse({
        ...validCompositionPlan,
        sections: Array.from({ length: 6 }, (_, index) => ({
          ...validCompositionPlan.sections[0],
          section_name: `Section ${index + 1}`,
          duration_ms: 120_000,
        })),
      }).success,
    ).toBe(false);
  });

  it('caps local styles and lyrics lines', () => {
    expect(
      elevenLabsCompositionPlanSchema.safeParse({
        ...validCompositionPlan,
        sections: [
          {
            ...validCompositionPlan.sections[0],
            positive_local_styles: Array.from({ length: ELEVENLABS_COMPOSITION_PLAN_MAX_STYLES + 1 }, (_, index) => `style ${index}`),
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      elevenLabsCompositionPlanSchema.safeParse({
        ...validCompositionPlan,
        sections: [
          {
            ...validCompositionPlan.sections[0],
            lines: Array.from({ length: ELEVENLABS_COMPOSITION_PLAN_MAX_LYRICS_LINES + 1 }, (_, index) => `line ${index}`),
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      elevenLabsCompositionPlanSchema.safeParse({
        ...validCompositionPlan,
        sections: [
          {
            ...validCompositionPlan.sections[0],
            lines: ['x'.repeat(201)],
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('storyboard music schemas', () => {
  it('defines source modes and generation statuses', () => {
    expect(storyboardMusicSourceModeSchema.options).toEqual(['existing', 'generate_now', 'generate_on_step3']);
    expect(storyboardMusicGenerationStatusSchema.options).toEqual(['queued', 'running', 'ready', 'failed']);
  });

  it('accepts a fully hydrated storyboard music block', () => {
    const result = storyboardMusicBlockSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      draftId: '00000000-0000-4000-8000-000000000002',
      name: 'Main bed',
      sourceMode: 'generate_on_step3',
      prompt: 'Warm instrumental background music.',
      compositionPlan: validCompositionPlan,
      existingFileId: null,
      startSceneBlockId: '00000000-0000-4000-8000-000000000003',
      endSceneBlockId: '00000000-0000-4000-8000-000000000004',
      positionX: 120,
      positionY: 480,
      sortOrder: 0,
      volume: 0.7,
      fadeInS: 1,
      fadeOutS: 1,
      loopMode: 'trim',
      generationStatus: null,
      generationJobId: null,
      outputFileId: null,
      errorMessage: null,
      createdAt: '2026-05-26T10:00:00.000Z',
      updatedAt: '2026-05-26T10:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });
});
