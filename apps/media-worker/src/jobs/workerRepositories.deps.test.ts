/**
 * F3 — the production storyboard-openai-image deps must include
 * sceneReferenceSelectionRepo. Without it, resolveSceneInputs short-circuits and
 * the reference boundary + scoped star gate + derived style description never run
 * on the real path (the integration test injected the repo manually, masking it).
 *
 * Run:
 *   cd apps/media-worker && npx vitest run src/jobs/workerRepositories.deps.test.ts
 */
import { describe, it, expect } from 'vitest';

import {
  buildStoryboardOpenAIImageJobDeps,
  sceneReferenceSelectionRepo,
} from './workerRepositories.js';

describe('F3 / buildStoryboardOpenAIImageJobDeps — production wiring', () => {
  it('includes the real sceneReferenceSelectionRepo', () => {
    const deps = buildStoryboardOpenAIImageJobDeps({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      openai: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      s3: {} as any,
      bucket: 'test-bucket',
    });

    expect(deps.sceneReferenceSelectionRepo).toBe(sceneReferenceSelectionRepo);
    expect(typeof deps.sceneReferenceSelectionRepo!.loadBlocksForDraft).toBe('function');
  });

  it('wires the scene repos and does NOT wire the retired principal-image repo (review F2, ADR-0004)', () => {
    const deps = buildStoryboardOpenAIImageJobDeps({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      openai: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      s3: {} as any,
      bucket: 'test-bucket',
    });

    expect(deps).not.toHaveProperty('storyboardReferenceRepo');
    expect(deps.storyboardSceneRepo).toBeDefined();
    expect(deps.filesRepo).toBeDefined();
    expect(deps.bucket).toBe('test-bucket');
  });
});
