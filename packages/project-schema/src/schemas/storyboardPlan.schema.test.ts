import { describe, it, expect } from 'vitest';

import type { StoryboardPlan } from './storyboardPlan.schema.js';
import {
  STORYBOARD_PLAN_DEFAULT_STYLE_KEY,
  STORYBOARD_PLAN_DEFAULT_VIDEO_LENGTH_SECONDS,
  STORYBOARD_PLAN_DURATION_TOLERANCE_SECONDS,
  deriveStoryboardSceneCount,
  resolveStoryboardPlanStyleKey,
  resolveStoryboardPlanVideoLengthSeconds,
  storyboardPlanJobResultSchema,
  storyboardPlanSchema,
} from './storyboardPlan.schema.js';

const validReferencedMedia = {
  fileId: '00000000-0000-0000-0000-000000000001',
  mediaType: 'image',
  label: 'Product photo',
} as const;

const validPlan: StoryboardPlan = {
  schemaVersion: 1,
  videoLengthSeconds: 12,
  sceneCount: 2,
  scenes: [
    {
      sceneNumber: 1,
      prompt: 'Open on the product in use.',
      visualPrompt: 'Close shot with natural light.',
      videoPrompt: 'Slow push-in as the product catches morning light.',
      durationSeconds: 6,
      referencedMedia: [validReferencedMedia],
      transitionNotes: 'Cut in from black.',
      style: 'cinematic',
    },
    {
      sceneNumber: 2,
      prompt: 'Show the result and closing message.',
      visualPrompt: 'Wide shot with calm motion.',
      videoPrompt: 'Gentle camera drift toward the final outcome and brand moment.',
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: '',
      style: 'cinematic',
    },
  ],
};

describe('storyboardPlanSchema', () => {
  it('accepts a valid storyboard plan', () => {
    const result = storyboardPlanSchema.safeParse(validPlan);

    expect(result.success).toBe(true);
  });

  it('rejects duplicate scene numbers because scenes must be sequential', () => {
    const result = storyboardPlanSchema.safeParse({
      ...validPlan,
      scenes: [
        validPlan.scenes[0],
        {
          ...validPlan.scenes[1],
          sceneNumber: 1,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.success === false && JSON.stringify(result.error.issues)).toContain('sequential');
  });

  it('rejects non-sequential scene numbers', () => {
    const result = storyboardPlanSchema.safeParse({
      ...validPlan,
      scenes: [
        validPlan.scenes[0],
        {
          ...validPlan.scenes[1],
          sceneNumber: 3,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.success === false && JSON.stringify(result.error.issues)).toContain('expected 2');
  });

  it('rejects empty prompt, visualPrompt, and videoPrompt values', () => {
    expect(
      storyboardPlanSchema.safeParse({
        ...validPlan,
        scenes: [
          {
            ...validPlan.scenes[0],
            prompt: '   ',
          },
          validPlan.scenes[1],
        ],
      }).success,
    ).toBe(false);

    expect(
      storyboardPlanSchema.safeParse({
        ...validPlan,
        scenes: [
          validPlan.scenes[0],
          {
            ...validPlan.scenes[1],
            visualPrompt: '',
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      storyboardPlanSchema.safeParse({
        ...validPlan,
        scenes: [
          {
            ...validPlan.scenes[0],
            videoPrompt: '   ',
          },
          validPlan.scenes[1],
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects invalid non-positive durations', () => {
    for (const durationSeconds of [0, -1] as const) {
      const result = storyboardPlanSchema.safeParse({
        ...validPlan,
        scenes: [
          {
            ...validPlan.scenes[0],
            durationSeconds,
          },
          validPlan.scenes[1],
        ],
      });

      expect(result.success, `durationSeconds=${durationSeconds}`).toBe(false);
    }
  });

  it('requires scene durations to match videoLengthSeconds within the documented tolerance', () => {
    expect(
      storyboardPlanSchema.safeParse({
        ...validPlan,
        scenes: [
          {
            ...validPlan.scenes[0],
            durationSeconds: 6 + STORYBOARD_PLAN_DURATION_TOLERANCE_SECONDS,
          },
          validPlan.scenes[1],
        ],
      }).success,
    ).toBe(true);

    expect(
      storyboardPlanSchema.safeParse({
        ...validPlan,
        scenes: [
          {
            ...validPlan.scenes[0],
            durationSeconds: 6 + STORYBOARD_PLAN_DURATION_TOLERANCE_SECONDS + 0.01,
          },
          validPlan.scenes[1],
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects sceneCount values that do not match the number of scenes', () => {
    const result = storyboardPlanSchema.safeParse({
      ...validPlan,
      sceneCount: 3,
    });

    expect(result.success).toBe(false);
    expect(result.success === false && JSON.stringify(result.error.issues)).toContain('scenes.length');
  });

  it('rejects scene counts that are not derived from videoLengthSeconds', () => {
    const result = storyboardPlanSchema.safeParse({
      ...validPlan,
      videoLengthSeconds: 18,
      scenes: [
        {
          ...validPlan.scenes[0],
          durationSeconds: 9,
        },
        {
          ...validPlan.scenes[1],
          durationSeconds: 9,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.success === false && JSON.stringify(result.error.issues)).toContain('expected 3');
  });

  it('keeps referencedMedia stable and rejects signed URL fields', () => {
    const result = storyboardPlanSchema.safeParse({
      ...validPlan,
      scenes: [
        {
          ...validPlan.scenes[0],
          referencedMedia: [
            {
              ...validReferencedMedia,
              signedUrl: 'https://example.com/temporary-url',
            },
          ],
        },
        validPlan.scenes[1],
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe('deriveStoryboardSceneCount', () => {
  it('derives a deterministic scene count for 1-600 second drafts', () => {
    expect(deriveStoryboardSceneCount(1)).toBe(1);
    expect(deriveStoryboardSceneCount(6)).toBe(1);
    expect(deriveStoryboardSceneCount(7)).toBe(2);
    expect(deriveStoryboardSceneCount(30)).toBe(5);
    expect(deriveStoryboardSceneCount(600)).toBe(40);
  });

  it('rejects invalid video lengths instead of silently defaulting', () => {
    expect(() => deriveStoryboardSceneCount(0)).toThrow();
    expect(() => deriveStoryboardSceneCount(601)).toThrow();
    expect(() => deriveStoryboardSceneCount(12.5)).toThrow();
  });
});

describe('storyboard plan service defaults', () => {
  it('exposes safe defaults for legacy drafts without mutating PromptDoc', () => {
    expect(resolveStoryboardPlanVideoLengthSeconds(undefined)).toBe(STORYBOARD_PLAN_DEFAULT_VIDEO_LENGTH_SECONDS);
    expect(resolveStoryboardPlanVideoLengthSeconds(45)).toBe(45);
    expect(resolveStoryboardPlanStyleKey(undefined)).toBe(STORYBOARD_PLAN_DEFAULT_STYLE_KEY);
    expect(resolveStoryboardPlanStyleKey('product')).toBe('product');
  });
});

describe('storyboardPlanJobResultSchema', () => {
  it('accepts queued and completed persisted job results', () => {
    expect(
      storyboardPlanJobResultSchema.safeParse({
        jobId: 'job-001',
        status: 'queued',
        plan: null,
        errorMessage: null,
      }).success,
    ).toBe(true);

    expect(
      storyboardPlanJobResultSchema.safeParse({
        jobId: 'job-002',
        status: 'completed',
        plan: validPlan,
      }).success,
    ).toBe(true);
  });

  it('rejects non-null error messages for queued and running job results', () => {
    for (const status of ['queued', 'running'] as const) {
      expect(
        storyboardPlanJobResultSchema.safeParse({
          jobId: `job-${status}`,
          status,
          plan: null,
          errorMessage: 'This message is only valid on failed jobs.',
        }).success,
        `status=${status}`,
      ).toBe(false);
    }
  });

  it('requires completed jobs to include a valid plan and failed jobs to include an error message', () => {
    expect(
      storyboardPlanJobResultSchema.safeParse({
        jobId: 'job-003',
        status: 'completed',
      }).success,
    ).toBe(false);

    expect(
      storyboardPlanJobResultSchema.safeParse({
        jobId: 'job-004',
        status: 'failed',
        errorMessage: 'Invalid plan.',
      }).success,
    ).toBe(true);

    expect(
      storyboardPlanJobResultSchema.safeParse({
        jobId: 'job-005',
        status: 'failed',
        errorMessage: ' ',
      }).success,
    ).toBe(false);
  });
});
