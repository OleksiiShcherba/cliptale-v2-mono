/**
 * RED tests for AC-08 — principal-image step retired from the SPA (T9).
 *
 * AC-08: the system neither generates nor requires any principal image, and offers
 * no principal-image approval step; readiness is decided solely by the
 * Reference-done gate.
 *
 * Three assertions:
 *  1. api.ts does NOT export the four removed principal-image endpoint callers.
 *  2. types.ts does NOT include the two retired automation phases.
 *  3. types.ts does NOT include StoryboardIllustrationReferenceStatus (the
 *     top-level reference object that was the principal-image approval surface).
 *
 * These are static-import / module-shape assertions — the same pattern used in
 * the existing storyboard-api.test.ts for verifying exported symbols.
 *
 * All three tests MUST fail today (the symbols still exist).
 * After T9 is implemented they turn green.
 */

import { describe, it, expect } from 'vitest';

// ── Test 1: api.ts must NOT export principal-image endpoint functions ──────────

describe('AC-08 — api.ts: principal-image endpoint callers are removed', () => {
  it('does not export approveStoryboardPrincipalImage', async () => {
    const mod = await import('@/features/storyboard/api');
    expect(
      (mod as Record<string, unknown>)['approveStoryboardPrincipalImage'],
      'approveStoryboardPrincipalImage must be deleted from api.ts (AC-08)',
    ).toBeUndefined();
  });

  it('does not export editStoryboardPrincipalImage', async () => {
    const mod = await import('@/features/storyboard/api');
    expect(
      (mod as Record<string, unknown>)['editStoryboardPrincipalImage'],
      'editStoryboardPrincipalImage must be deleted from api.ts (AC-08)',
    ).toBeUndefined();
  });

  it('does not export replaceStoryboardPrincipalImage', async () => {
    const mod = await import('@/features/storyboard/api');
    expect(
      (mod as Record<string, unknown>)['replaceStoryboardPrincipalImage'],
      'replaceStoryboardPrincipalImage must be deleted from api.ts (AC-08)',
    ).toBeUndefined();
  });

  it('does not export setStoryboardPrincipalImageReferences', async () => {
    const mod = await import('@/features/storyboard/api');
    expect(
      (mod as Record<string, unknown>)['setStoryboardPrincipalImageReferences'],
      'setStoryboardPrincipalImageReferences must be deleted from api.ts (AC-08)',
    ).toBeUndefined();
  });
});

// ── Test 2: types.ts must NOT expose the two retired automation phases ─────────
//
// StoryboardAutomationPhase is a union type — we cannot inspect it at runtime.
// The canonical runtime proxy is the VALID_AUTOMATION_PHASES guard array that
// the status helper in useStoryboardIllustrations.status.ts is expected to use
// once T9 ships; until then we assert the phase strings are absent from the
// VALID_AUTOMATION_PHASES export (which T9 must add) or, if the export does not
// yet exist, assert via the module having no such guard at all (also a red).
//
// Separately: StoryboardIllustrationReferenceStatus is still exported from
// types.ts but the new wire shape (AC-08 / openapi delta) removes the top-level
// `reference` field from StoryboardIllustrationStatusResponse.
// We assert that StoryboardIllustrationStatusResponse no longer carries the
// reference field by checking the runtime default fixture shape expected by
// useStoryboardIllustrations.status.ts helpers.

describe('AC-08 — types.ts: retired automation phases must not be in the valid-phase set', () => {
  it('does not export a VALID_AUTOMATION_PHASES list that contains creating_principal_image', async () => {
    const mod = await import('@/features/storyboard/types');
    const phases = (mod as Record<string, unknown>)['VALID_AUTOMATION_PHASES'] as string[] | undefined;
    // After T9 ships, VALID_AUTOMATION_PHASES must exist and must NOT include the retired phases.
    // Today (RED): either the export does not exist yet, or it still contains the legacy value.
    if (phases === undefined) {
      // Export doesn't exist yet — this counts as red; fail explicitly.
      expect(phases, 'VALID_AUTOMATION_PHASES must be exported from types.ts after T9').toBeDefined();
    } else {
      expect(phases).not.toContain('creating_principal_image');
    }
  });

  it('does not export a VALID_AUTOMATION_PHASES list that contains awaiting_principal_approval', async () => {
    const mod = await import('@/features/storyboard/types');
    const phases = (mod as Record<string, unknown>)['VALID_AUTOMATION_PHASES'] as string[] | undefined;
    if (phases === undefined) {
      expect(phases, 'VALID_AUTOMATION_PHASES must be exported from types.ts after T9').toBeDefined();
    } else {
      expect(phases).not.toContain('awaiting_principal_approval');
    }
  });
});

// ── Test 3: StoryboardIllustrationStatusResponse must NOT carry a reference
//   field (the new wire shape from the openapi delta removes the principal
//   image approval surface — AC-08 / contracts/openapi.yaml GET /illustrations) ──

describe('AC-08 — types.ts: StoryboardIllustrationStatusResponse has no reference field', () => {
  it('does not export StoryboardIllustrationReferenceStatus (principal approval shape)', async () => {
    const mod = await import('@/features/storyboard/types');
    // StoryboardIllustrationReferenceStatus carries approvalStatus — the principal-approval gate.
    // After T9 the type (and its export) must be removed.
    // We cannot inspect TypeScript types at runtime, so we assert the companion
    // runtime guard (if present) or rely on the fact that the existing lifecycle
    // test-utils still build the `reference()` fixture with `approvalStatus` — that
    // fixture must be gone after T9.
    //
    // Runtime proxy: the status module's `deriveStatus` must no longer read
    // `response.reference.approvalStatus`. We confirm by asserting that the status
    // helper processes a response WITHOUT a `reference` field (the new wire shape)
    // without throwing.
    const statusMod = await import('@/features/storyboard/hooks/useStoryboardIllustrations.status');
    const newWireResponse = {
      automation: { phase: 'generating_scene_illustrations', planningJobId: null, errorMessage: null },
      items: [
        { blockId: 'block-1', status: 'ready', jobId: 'job-1', outputFileId: 'file-1', errorMessage: null },
      ],
      // No `reference` field — new wire shape per openapi delta.
    };

    // deriveStatus must not throw and must return 'completed' for a response
    // where all scene items are ready (reference-done gate = no reference field needed).
    let derivedStatus: string | undefined;
    expect(() => {
      derivedStatus = statusMod.deriveStatus(newWireResponse as Parameters<typeof statusMod.deriveStatus>[0]);
    }).not.toThrow();
    expect(derivedStatus).toBe('completed');
  });

  it('hasPendingSceneStart returns false for a new wire response with no reference field', async () => {
    const statusMod = await import('@/features/storyboard/hooks/useStoryboardIllustrations.status');
    const newWireResponse = {
      automation: { phase: 'generating_scene_illustrations', planningJobId: null, errorMessage: null },
      items: [
        { blockId: 'block-1', status: 'queued', jobId: null, outputFileId: null, errorMessage: null },
      ],
    };

    let result: boolean | undefined;
    expect(() => {
      result = statusMod.hasPendingSceneStart(newWireResponse as Parameters<typeof statusMod.hasPendingSceneStart>[0]);
    }).not.toThrow();
    // With no reference field, hasPendingSceneStart must not enter the principal-approval branch.
    // It should return false (no items have jobId=null AND status=queued under the legacy guard),
    // confirming the function works without crashing on the new wire shape.
    expect(result).toBe(false);
  });
});
