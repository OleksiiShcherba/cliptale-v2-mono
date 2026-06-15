import { describe, expect, it } from 'vitest';

import {
  PIPELINE_PHASES,
  PHASE_STATUSES,
  PIPELINE_GUARD_CODES,
  pipelinePhaseSchema,
  phaseStatusSchema,
  PHASE_STATUS_TRANSITIONS,
  canTransition,
  isPhaseResolved,
  prerequisitesOf,
  checkPhaseOrder,
  checkScenesRequired,
  decideRunClaim,
  type PipelinePhaseStatuses,
} from './transition.js';

// A draft that has finished scene generation but nothing else.
const scenesDone: PipelinePhaseStatuses = {
  scene: 'completed',
  reference_data: 'idle',
  reference_image: 'idle',
  scene_image: 'idle',
};

// A fresh draft — nothing has run yet.
const fresh: PipelinePhaseStatuses = {
  scene: 'idle',
  reference_data: 'idle',
  reference_image: 'idle',
  scene_image: 'idle',
};

describe('pipeline phase lifecycle constants', () => {
  it('orders the four phases scene → reference_data → reference_image → scene_image', () => {
    expect(PIPELINE_PHASES).toEqual(['scene', 'reference_data', 'reference_image', 'scene_image']);
  });

  it('exposes the seven-state sub-state lifecycle', () => {
    expect([...PHASE_STATUSES].sort()).toEqual(
      ['awaiting_review', 'cancelled', 'completed', 'failed', 'idle', 'running', 'skipped'].sort(),
    );
  });

  it('validates phases and statuses via the exported zod schemas', () => {
    expect(pipelinePhaseSchema.safeParse('reference_image').success).toBe(true);
    expect(pipelinePhaseSchema.safeParse('nonsense').success).toBe(false);
    expect(phaseStatusSchema.safeParse('awaiting_review').success).toBe(true);
    expect(phaseStatusSchema.safeParse('paused').success).toBe(false);
  });
});

describe('transition table (canTransition)', () => {
  it('allows starting an idle phase', () => {
    expect(canTransition('idle', 'running')).toBe(true);
  });

  it('allows a running phase to reach every terminal/awaiting outcome', () => {
    for (const to of ['awaiting_review', 'completed', 'failed', 'cancelled'] as const) {
      expect(canTransition('running', to)).toBe(true);
    }
  });

  it('allows confirm (awaiting_review → running) and skip (awaiting_review → skipped)', () => {
    expect(canTransition('awaiting_review', 'running')).toBe(true);
    expect(canTransition('awaiting_review', 'skipped')).toBe(true);
  });

  it('allows re-trigger / retry from every resolved or interrupted state back to running', () => {
    for (const from of ['completed', 'cancelled', 'failed', 'skipped'] as const) {
      expect(canTransition(from, 'running')).toBe(true);
    }
  });

  it('rejects illegal transitions', () => {
    expect(canTransition('idle', 'completed')).toBe(false);
    expect(canTransition('idle', 'awaiting_review')).toBe(false);
    expect(canTransition('running', 'idle')).toBe(false);
    expect(canTransition('completed', 'awaiting_review')).toBe(false);
    expect(canTransition('skipped', 'completed')).toBe(false);
  });

  it('keeps the transition table and canTransition consistent', () => {
    for (const [from, tos] of Object.entries(PHASE_STATUS_TRANSITIONS)) {
      for (const status of PHASE_STATUSES) {
        expect(canTransition(from as never, status)).toBe(tos.includes(status));
      }
    }
  });
});

describe('skipped is distinct from idle (AC-07)', () => {
  it('treats skipped as resolved for a prerequisite check but idle as never-run', () => {
    expect(isPhaseResolved('skipped')).toBe(true);
    expect(isPhaseResolved('completed')).toBe(true);
    expect(isPhaseResolved('idle')).toBe(false);
    expect(isPhaseResolved('running')).toBe(false);
    expect(isPhaseResolved('failed')).toBe(false);
    expect(isPhaseResolved('cancelled')).toBe(false);
  });
});

describe('strict phase-order guard (AC-08)', () => {
  it('knows each phase prerequisites', () => {
    expect(prerequisitesOf('scene')).toEqual([]);
    expect(prerequisitesOf('reference_data')).toEqual(['scene']);
    expect(prerequisitesOf('reference_image')).toEqual(['scene', 'reference_data']);
    expect(prerequisitesOf('scene_image')).toEqual(['scene', 'reference_data', 'reference_image']);
  });

  it('blocks a later phase whose prerequisite has not resolved', () => {
    const result = checkPhaseOrder(scenesDone, 'reference_image');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(PIPELINE_GUARD_CODES.PHASE_OUT_OF_ORDER);
      expect(result.message).toMatch(/\w/);
    }
  });

  it('allows a phase once every prerequisite is completed', () => {
    const allResolved: PipelinePhaseStatuses = {
      scene: 'completed',
      reference_data: 'completed',
      reference_image: 'completed',
      scene_image: 'idle',
    };
    expect(checkPhaseOrder(allResolved, 'scene_image').ok).toBe(true);
  });

  it('treats a skipped prerequisite as satisfied (AC-07 distinction in action)', () => {
    const skippedRefs: PipelinePhaseStatuses = {
      scene: 'completed',
      reference_data: 'skipped',
      reference_image: 'skipped',
      scene_image: 'idle',
    };
    expect(checkPhaseOrder(skippedRefs, 'scene_image').ok).toBe(true);
  });

  it('never blocks the first phase on order grounds', () => {
    expect(checkPhaseOrder(fresh, 'scene').ok).toBe(true);
  });
});

describe('scenes-required guard (AC-15)', () => {
  it('blocks a downstream phase when no scenes exist, with the scenes_required code', () => {
    const result = checkScenesRequired('scene_image', false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(PIPELINE_GUARD_CODES.SCENES_REQUIRED);
      expect(result.message).toMatch(/scene/i);
    }
  });

  it('allows a downstream phase once scenes exist', () => {
    expect(checkScenesRequired('scene_image', true).ok).toBe(true);
  });

  it('never applies the scenes-required guard to the scene phase itself', () => {
    expect(checkScenesRequired('scene', false).ok).toBe(true);
  });
});

describe('single-active-run / version-CAS decision (AC-14)', () => {
  it('claims a run and bumps the version when none is in flight', () => {
    expect(decideRunClaim({ activeRunPhase: null, version: 1, target: 'reference_image' })).toEqual({
      kind: 'claim',
      phase: 'reference_image',
      nextVersion: 2,
    });
  });

  it('returns the existing run for a repeated trigger of the same phase (idempotent)', () => {
    expect(
      decideRunClaim({ activeRunPhase: 'reference_image', version: 3, target: 'reference_image' }),
    ).toEqual({ kind: 'return_existing', phase: 'reference_image' });
  });

  it('reports a conflict when a different phase already holds the active run', () => {
    expect(decideRunClaim({ activeRunPhase: 'scene', version: 5, target: 'reference_image' })).toEqual({
      kind: 'conflict',
      activePhase: 'scene',
    });
  });
});
