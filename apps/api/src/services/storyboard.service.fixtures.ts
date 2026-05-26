import type { StoryboardPlan } from '@ai-video-editor/project-schema';

/**
 * Shared test fixtures for storyboard.service tests.
 *
 * Import these in storyboard.service.test.ts and
 * storyboard.service.status.test.ts to keep fixtures DRY.
 */

export const USER_A = 'user-aaa';
export const USER_B = 'user-bbb';
export const DRAFT_ID = 'draft-111';

export const STORYBOARD_PLAN: StoryboardPlan = {
  schemaVersion: 2,
  videoLengthSeconds: 12,
  sceneCount: 2,
  scenes: [
    {
      sceneNumber: 1,
      prompt: 'Introduce the problem.',
      visualPrompt: 'Wide shot of a cluttered desk.',
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationSeconds: 5.4,
      referencedMedia: [
        {
          fileId: '00000000-0000-4000-8000-000000000001',
          mediaType: 'image',
          label: 'desk.png',
        },
        {
          fileId: '00000000-0000-4000-8000-000000000002',
          mediaType: 'video',
          label: 'workflow.mp4',
        },
      ],
      transitionNotes: '',
      style: 'cinematic',
    },
    {
      sceneNumber: 2,
      prompt: 'Show the resolved state.',
      visualPrompt: 'Clean product hero frame.',
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationSeconds: 6.6,
      referencedMedia: [],
      transitionNotes: '',
      style: 'minimal',
    },
  ],
  musicSegments: [],
};

export const MUSIC_COMPOSITION_PLAN = {
  positive_global_styles: ['cinematic', 'instrumental', 'warm pulse'],
  negative_global_styles: ['vocals', 'lyrics', 'singing'],
  sections: [
    {
      section_name: 'Main cue',
      positive_local_styles: ['gentle momentum'],
      negative_local_styles: ['spoken word'],
      duration_ms: 12_000,
      lines: [],
    },
  ],
};

/**
 * Builds a generation draft fixture for storyboard service tests.
 */
export function makeDraft(
  userId: string,
  status: 'draft' | 'step2' | 'step3' | 'completed' = 'draft',
) {
  return {
    id: DRAFT_ID,
    userId,
    promptDoc: {},
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

/**
 * Builds a completed storyboard plan job fixture.
 */
export function makeCompletedPlanJob(plan: StoryboardPlan | null = STORYBOARD_PLAN) {
  return {
    jobId: 'job-1',
    draftId: DRAFT_ID,
    userId: USER_A,
    status: 'completed' as const,
    model: null,
    promptSnapshot: {},
    mediaContext: null,
    plan,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: new Date(),
    failedAt: null,
  };
}
