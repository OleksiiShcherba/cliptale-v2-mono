import { describe, it, expect } from 'vitest';

import { projectPipelineState } from './projection.js';

describe('projectPipelineState (pure)', () => {
  it('projects a row to the contract PipelineState wire shape (snake_case, nested phases, version)', () => {
    const updatedAt = new Date('2026-06-15T10:00:00.000Z');
    const state = projectPipelineState({
      draftId: 'draft-1',
      activePhase: 'reference_data',
      activeRunPhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'running',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
      payloadJson: { hello: 'world' },
      version: 7,
      costEstimate: '1.2345',
      errorMessage: null,
      updatedAt,
    });

    expect(state).toEqual({
      draft_id: 'draft-1',
      active_phase: 'reference_data',
      active_run_phase: 'reference_data',
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'running' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
      payload: { hello: 'world' },
      version: 7,
      cost_estimate: '1.2345',
      error_message: null,
      updated_at: '2026-06-15T10:00:00.000Z',
    });
  });

  it('always carries a numeric version (version-monotonic convergence, AC-05/ADR-0004)', () => {
    const a = projectPipelineState({
      draftId: 'd',
      activePhase: 'scene',
      activeRunPhase: 'scene',
      sceneStatus: 'running',
      referenceDataStatus: 'idle',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
      payloadJson: null,
      version: 1,
      costEstimate: null,
      errorMessage: null,
      updatedAt: '2026-06-15T10:00:00.000Z',
    });
    const b = projectPipelineState({
      draftId: 'd',
      activePhase: 'scene',
      activeRunPhase: 'scene',
      sceneStatus: 'completed',
      referenceDataStatus: 'idle',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
      payloadJson: null,
      version: 2,
      costEstimate: null,
      errorMessage: null,
      updatedAt: '2026-06-15T10:00:01.000Z',
    });
    expect(a.version).toBe(1);
    expect(b.version).toBe(2);
    expect((b.version as number) > (a.version as number)).toBe(true);
  });

  it('normalizes nullish payload/cost/error and string/Date updated_at', () => {
    const state = projectPipelineState({
      draftId: 'd',
      activePhase: 'scene',
      activeRunPhase: null,
      sceneStatus: 'idle',
      referenceDataStatus: 'idle',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
      payloadJson: undefined,
      version: 0,
      costEstimate: undefined,
      errorMessage: undefined,
      updatedAt: null,
    });
    expect(state.payload).toBeNull();
    expect(state.cost_estimate).toBeNull();
    expect(state.error_message).toBeNull();
    expect(state.updated_at).toBeNull();
    expect(state.active_run_phase).toBeNull();
  });
});
