import type { StoryboardPlan } from '@ai-video-editor/project-schema';

export const PROMPT_SNAPSHOT = {
  schemaVersion: 1,
  blocks: [{ type: 'text', value: 'Make a product launch storyboard.' }],
};

export const PROMPT_DOC = {
  schemaVersion: 1,
  blocks: [{ type: 'text', value: 'Create a clean launch video storyboard.' }],
  settings: {
    videoLengthSeconds: 30,
    aspectRatio: '16:9',
    styleKey: 'cinematic',
    modelPreference: 'gpt-storyboard-test',
  },
};

export const EMPTY_PROMPT_DOC = {
  schemaVersion: 1,
  blocks: [{ type: 'text', value: '   ' }],
};

export const MEDIA_CONTEXT = {
  files: [
    {
      fileId: '00000000-0000-4000-8000-000000000001',
      mediaType: 'image',
      storageUri: 's3://bucket/stable-key.jpg',
      hasThumbnail: true,
    },
  ],
};

export const VALID_PLAN: StoryboardPlan = {
  schemaVersion: 2,
  videoLengthSeconds: 30,
  sceneCount: 5,
  scenes: Array.from({ length: 5 }, (_, index) => ({
    sceneNumber: index + 1,
    prompt: `Scene ${index + 1} prompt`,
    visualPrompt: `Scene ${index + 1} visual prompt`,
    videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
    durationSeconds: 6,
    referencedMedia: [],
    transitionNotes: index === 4 ? 'Fade out.' : '',
    style: 'cinematic',
  })),
  musicSegments: [],
};

export const LEGACY_VALID_PLAN: Omit<StoryboardPlan, 'musicSegments' | 'schemaVersion'> & {
  schemaVersion: 1;
} = {
  videoLengthSeconds: VALID_PLAN.videoLengthSeconds,
  sceneCount: VALID_PLAN.sceneCount,
  scenes: VALID_PLAN.scenes,
  schemaVersion: 1,
};

export const STORYBOARD_PLAN_JOB_NOW = new Date('2026-05-13T10:00:00.000Z');

export function makeStoryboardPlanJobRow(overrides: Record<string, unknown> = {}) {
  return {
    job_id: '00000000-0000-4000-8000-000000000010',
    draft_id: '00000000-0000-4000-8000-000000000020',
    user_id: '00000000-0000-4000-8000-000000000030',
    status: 'completed',
    model: 'gpt-4.1',
    prompt_snapshot_json: PROMPT_SNAPSHOT,
    media_context_json: MEDIA_CONTEXT,
    plan_json: VALID_PLAN,
    error_message: null,
    created_at: STORYBOARD_PLAN_JOB_NOW,
    updated_at: STORYBOARD_PLAN_JOB_NOW,
    completed_at: STORYBOARD_PLAN_JOB_NOW,
    failed_at: null,
    ...overrides,
  };
}
