import { UnrecoverableError, type Job } from 'bullmq';
import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';

import {
  STORYBOARD_PLAN_SCHEMA_VERSION,
  type StoryboardPlanJobPayload,
} from '@ai-video-editor/project-schema';

vi.mock('@/lib/realtime.js', () => ({
  publishStoryboardPlanStatus: vi.fn().mockResolvedValue(undefined),
}));

import {
  processStoryboardPlanJob,
  type StoryboardPlanOpenAiClient,
} from './storyboardPlan.job.js';
import type { StoryboardPlanResolvedContext } from './storyboardPlan.context.types.js';
import type { StoryboardPlanJobRepository } from './storyboardPlan.repository.js';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const pool = {} as Pool;

function makeJob(): Job<StoryboardPlanJobPayload> {
  return {
    data: {
      jobId: JOB_ID,
      draftId: DRAFT_ID,
      userId: USER_ID,
    },
  } as unknown as Job<StoryboardPlanJobPayload>;
}

function makeRepository(): StoryboardPlanJobRepository {
  return {
    markRunning: vi.fn(async () => {}),
    markCompleted: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
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

function makeContext(): StoryboardPlanResolvedContext {
  return {
    promptDoc: {
      schemaVersion: 1,
      blocks: [{ type: 'text', value: 'Create a launch video for a new camera.' }],
      settings: {
        videoLengthSeconds: 30,
        aspectRatio: '16:9',
        styleKey: 'product',
        modelPreference: 'gpt-4o',
      },
    },
    text: 'Create a launch video for a new camera.',
    media: [],
    openAiMediaInputs: [],
  };
}

function makeScene(sceneNumber: number): Record<string, unknown> {
  return {
    scene_number: sceneNumber,
    prompt: `Scene ${sceneNumber} narration beat`,
    visual_prompt: `Product-focused visual beat ${sceneNumber}`,
    video_prompt: 'Animate the scene with natural subject motion and a smooth camera move.',
    duration_seconds: 6,
    referenced_media: [],
    transition_notes: sceneNumber === 5 ? 'End cleanly.' : 'Cut on motion.',
    style: 'product',
  };
}

describe('processStoryboardPlanJob output normalization', () => {
  it('normalizes common OpenAI storyboard plan key variants before validation', async () => {
    const repository = makeRepository();
    const rawPlan = {
      storyboard_plan: {
        schema_version: STORYBOARD_PLAN_SCHEMA_VERSION,
        video_length_seconds: 30,
        scene_count: 5,
        scenes: Array.from({ length: 5 }, (_, index) => makeScene(index + 1)),
        music_segments: [
          {
            name: 'Main background music',
            prompt: 'Warm instrumental cue with gentle product-launch momentum.',
            composition_plan: {
              positiveGlobalStyles: ['cinematic', 'instrumental', 'warm pulse'],
              negativeGlobalStyles: ['vocals', 'lyrics', 'singing'],
              sections: [
                {
                  sectionName: 'Full story cue',
                  positiveLocalStyles: ['steady lift'],
                  negativeLocalStyles: ['spoken word'],
                  durationMs: 30_000,
                },
              ],
            },
            start_scene_number: 1,
            end_scene_number: 5,
          },
        ],
      },
    };

    const result = await processStoryboardPlanJob(makeJob(), {
      openai: makeOpenAiMock(JSON.stringify(rawPlan)),
      pool,
      repository,
      resolveContext: vi.fn(async () => makeContext()),
    });

    expect(result.musicSegments[0]).toMatchObject({
      sourceMode: 'generate_on_step3',
      startSceneNumber: 1,
      endSceneNumber: 5,
    });
    expect(result.musicSegments[0]!.compositionPlan.sections[0]).toMatchObject({
      section_name: 'Full story cue',
      duration_ms: 30_000,
      lines: [],
    });
    expect(repository.markCompleted).toHaveBeenCalledWith(expect.objectContaining({ plan: result }));
  });

  it('derives a safe instrumental composition section when planner omits sections', async () => {
    const repository = makeRepository();
    const rawPlan = {
      schema_version: STORYBOARD_PLAN_SCHEMA_VERSION,
      video_length_seconds: 30,
      scene_count: 5,
      scenes: Array.from({ length: 5 }, (_, index) => makeScene(index + 1)),
      music_segments: [
        {
          name: 'Opening ambience',
          prompt: 'A calm instrumental cue with soft synth movement.',
          compositionPlan: {
            positiveGlobalStyles: ['ambient', 'instrumental'],
            negativeGlobalStyles: ['vocals', 'lyrics'],
          },
          start_scene_number: 1,
          end_scene_number: 5,
        },
      ],
    };

    const result = await processStoryboardPlanJob(makeJob(), {
      openai: makeOpenAiMock(JSON.stringify(rawPlan)),
      pool,
      repository,
      resolveContext: vi.fn(async () => makeContext()),
    });

    expect(result.musicSegments[0]!.compositionPlan.sections).toEqual([
      {
        section_name: 'Opening ambience',
        positive_local_styles: ['instrumental'],
        negative_local_styles: ['vocals', 'lyrics', 'singing'],
        duration_ms: 30_000,
        lines: [],
      },
    ]);
  });

  it('normalizes loose composition section labels and duration aliases', async () => {
    const repository = makeRepository();
    const rawPlan = {
      schema_version: STORYBOARD_PLAN_SCHEMA_VERSION,
      video_length_seconds: 30,
      scene_count: 5,
      scenes: Array.from({ length: 5 }, (_, index) => makeScene(index + 1)),
      music_segments: [
        {
          name: 'Three-part launch cue',
          prompt: 'Instrumental cue that builds across the product story.',
          compositionPlan: {
            positiveGlobalStyles: ['cinematic', 'instrumental'],
            negativeGlobalStyles: ['vocals', 'lyrics'],
            sections: [
              { title: 'Opening pulse', duration: 10 },
              { label: 'Feature lift', duration: 10 },
              { duration: 10 },
            ],
          },
          startSceneNumber: 1,
          endSceneNumber: 5,
        },
      ],
    };

    const result = await processStoryboardPlanJob(makeJob(), {
      openai: makeOpenAiMock(JSON.stringify(rawPlan)),
      pool,
      repository,
      resolveContext: vi.fn(async () => makeContext()),
    });

    expect(result.musicSegments[0]!.compositionPlan.sections).toEqual([
      {
        section_name: 'Opening pulse',
        positive_local_styles: [],
        negative_local_styles: [],
        duration_ms: 10_000,
        lines: [],
      },
      {
        section_name: 'Feature lift',
        positive_local_styles: [],
        negative_local_styles: [],
        duration_ms: 10_000,
        lines: [],
      },
      {
        section_name: 'Three-part launch cue 3',
        positive_local_styles: [],
        negative_local_styles: [],
        duration_ms: 10_000,
        lines: [],
      },
    ]);
    expect(repository.markCompleted).toHaveBeenCalledWith(expect.objectContaining({ plan: result }));
  });

  it('reconciles small scene and composition duration drift before validation', async () => {
    const repository = makeRepository();
    const rawPlan = {
      schema_version: STORYBOARD_PLAN_SCHEMA_VERSION,
      video_length_seconds: 30,
      scene_count: 5,
      // Each scene drifts +0.2s → sum 31s, 1.0s over videoLengthSeconds (> 0.5s tolerance).
      scenes: Array.from({ length: 5 }, (_, index) => ({
        ...makeScene(index + 1),
        duration_seconds: 6.2,
      })),
      music_segments: [
        {
          name: 'Opening cue',
          prompt: 'Instrumental cue building across the first beats.',
          // Covered scene range (1-3) is 18s; sections sum to 16s (2s short).
          compositionPlan: {
            positiveGlobalStyles: ['instrumental'],
            negativeGlobalStyles: ['vocals'],
            sections: [
              { section_name: 'Intro', duration_ms: 8_000 },
              { section_name: 'Build', duration_ms: 8_000 },
            ],
          },
          start_scene_number: 1,
          end_scene_number: 3,
        },
        {
          name: 'Closing cue',
          prompt: 'Calm instrumental resolution for the final beats.',
          // Covered scene range (4-5) is 12s; single section sums to 5s.
          compositionPlan: {
            positiveGlobalStyles: ['instrumental'],
            negativeGlobalStyles: ['vocals'],
            sections: [{ section_name: 'Resolve', duration_ms: 5_000 }],
          },
          start_scene_number: 4,
          end_scene_number: 5,
        },
      ],
    };

    const result = await processStoryboardPlanJob(makeJob(), {
      openai: makeOpenAiMock(JSON.stringify(rawPlan)),
      pool,
      repository,
      resolveContext: vi.fn(async () => makeContext()),
    });

    // Scene durations reconciled to sum exactly to videoLengthSeconds.
    const totalSceneSeconds = result.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
    expect(totalSceneSeconds).toBeCloseTo(30, 6);
    expect(result.scenes.every((scene) => scene.durationSeconds === 6)).toBe(true);

    // Composition sections reconciled to the covered scene range, preserving proportions.
    const firstSections = result.musicSegments[0]!.compositionPlan.sections;
    expect(firstSections.reduce((sum, section) => sum + section.duration_ms, 0)).toBe(18_000);
    expect(firstSections.map((section) => section.duration_ms)).toEqual([9_000, 9_000]);

    const secondSections = result.musicSegments[1]!.compositionPlan.sections;
    expect(secondSections.reduce((sum, section) => sum + section.duration_ms, 0)).toBe(12_000);

    expect(repository.markCompleted).toHaveBeenCalledWith(expect.objectContaining({ plan: result }));
  });

  it('reports nested schema errors instead of a generic root union error', async () => {
    const repository = makeRepository();
    const invalidPlan = {
      schemaVersion: STORYBOARD_PLAN_SCHEMA_VERSION,
      videoLengthSeconds: 30,
      sceneCount: 5,
      scenes: Array.from({ length: 5 }, (_, index) => ({
        ...makeScene(index + 1),
        sceneNumber: index + 1,
        visualPrompt: `Product-focused visual beat ${index + 1}`,
        videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
        durationSeconds: 6,
        referencedMedia: [],
        transitionNotes: 'Cut on motion.',
      })),
      musicSegments: [
        {
          name: 'Bad cue',
          prompt: 'Instrumental cue',
          compositionPlan: {
            sections: [{ section_name: '', duration_ms: 30_000 }],
          },
          startSceneNumber: 1,
          endSceneNumber: 5,
        },
      ],
    };

    await expect(processStoryboardPlanJob(makeJob(), {
      openai: makeOpenAiMock(JSON.stringify(invalidPlan)),
      pool,
      repository,
      resolveContext: vi.fn(async () => makeContext()),
    })).rejects.toBeInstanceOf(UnrecoverableError);

    const failedError = vi.mocked(repository.markFailed).mock.calls[0]?.[1] as Error | undefined;
    expect(failedError?.message).toContain('musicSegments.0.compositionPlan.sections.0.section_name');
    expect(failedError?.message).not.toContain('root: Invalid input');
    expect(failedError?.message).not.toContain('Invalid literal value, expected 1');
    expect(failedError?.message).not.toContain("Unrecognized key(s) in object: 'musicSegments'");
  });
});
