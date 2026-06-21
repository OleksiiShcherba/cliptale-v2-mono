/**
 * Tests for subtask 4: attached scene image included in resolveSceneInputs.
 *
 * Coverage:
 * - Scene with attached image + linked references: both file IDs reach buildImageInputs (images.edit called).
 * - Scene with attached image but NO linked references: attached image still reaches request (images.edit, not images.generate).
 * - Deduplication: an attached image that is also a selected reference appears only once.
 * - Scene with NO attached image and NO linked references: text-only path (images.generate) unchanged.
 * - Prompt unchanged: block.prompt + style is not altered by the attached image path.
 * - Backward-compat: when loadAttachedSceneMediaFileIds is absent on the repo, behavior unchanged.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { StoryboardOpenAIImageJobPayload } from '@ai-video-editor/project-schema';

vi.mock('@/lib/realtime.js', () => ({
  publishAiGenerationJobStatus: vi.fn().mockResolvedValue(undefined),
}));

import {
  processStoryboardOpenAIImageJob,
} from './storyboardOpenAIImage.job.js';
import { makeJob, makeDeps } from './storyboardOpenAIImage.job.fixtures.js';

// ── Local helpers ─────────────────────────────────────────────────────────────

/**
 * A findFilesByIds stub that resolves any requested fileId with a minimal
 * ReferenceFile row pointing at the single mock S3 object.
 */
function makeFindFilesByIds(fileIds: string[]) {
  return vi.fn().mockResolvedValue(
    fileIds.map((fileId) => ({
      fileId,
      storageUri: 's3://test-bucket/refs/source.png',
      mimeType: 'image/png',
      displayName: `${fileId}.png`,
    })),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveSceneInputs — attached scene image (subtask 4)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('includes attached image AND linked reference in images.edit call', async () => {
    const attachedFile = 'file-attached-scene';
    const referenceFile = 'file-reference-block';

    const findFilesByIds = makeFindFilesByIds([attachedFile, referenceFile]);
    const deps = makeDeps({ fileReadRepo: { findFilesByIds } });
    deps.findFilesByIds = findFilesByIds;

    deps.sceneReferenceSelectionRepo = {
      loadBlocksForDraft: vi.fn().mockResolvedValue([
        {
          id: 'ref-block-1',
          linkedSceneIds: ['scene-block-1'],
          outputs: [{ fileId: referenceFile, createdAt: new Date('2025-06-01T00:00:00Z') }],
          primaryStarFileId: undefined,
          windowStatus: 'done',
        },
      ]),
      loadAttachedSceneMediaFileIds: vi.fn().mockResolvedValue([attachedFile]),
    };

    await processStoryboardOpenAIImageJob(
      makeJob({ jobId: 'job-attached-1', blockId: 'scene-block-1', prompt: 'Render the infant hand in the sterile facility.' }),
      deps,
    );

    // Both file IDs must reach findFilesByIds
    const call = findFilesByIds.mock.calls[0]![0] as { fileIds: string[] };
    expect(call.fileIds).toContain(attachedFile);
    expect(call.fileIds).toContain(referenceFile);

    // images.edit must be used (not images.generate)
    expect(deps.imagesEdit).toHaveBeenCalled();
    expect(deps.imagesGenerate).not.toHaveBeenCalled();
  });

  it('attached image appears before reference images in the resolved file ID list', async () => {
    const attachedFile = 'file-attached-first';
    const referenceFile = 'file-ref-second';

    const findFilesByIds = makeFindFilesByIds([attachedFile, referenceFile]);
    const deps = makeDeps({ fileReadRepo: { findFilesByIds } });
    deps.findFilesByIds = findFilesByIds;

    deps.sceneReferenceSelectionRepo = {
      loadBlocksForDraft: vi.fn().mockResolvedValue([
        {
          id: 'ref-block-2',
          linkedSceneIds: ['scene-block-1'],
          outputs: [{ fileId: referenceFile, createdAt: new Date('2025-06-01T00:00:00Z') }],
          primaryStarFileId: undefined,
          windowStatus: 'done',
        },
      ]),
      loadAttachedSceneMediaFileIds: vi.fn().mockResolvedValue([attachedFile]),
    };

    await processStoryboardOpenAIImageJob(
      makeJob({ jobId: 'job-attached-1', blockId: 'scene-block-1', prompt: 'Render the infant hand in the sterile facility.' }),
      deps,
    );

    const call = findFilesByIds.mock.calls[0]![0] as { fileIds: string[] };
    const attachedIdx = call.fileIds.indexOf(attachedFile);
    const referenceIdx = call.fileIds.indexOf(referenceFile);
    expect(attachedIdx).toBeGreaterThanOrEqual(0);
    expect(referenceIdx).toBeGreaterThanOrEqual(0);
    expect(attachedIdx).toBeLessThan(referenceIdx);
  });

  it('attached image with NO linked references uses images.edit (not images.generate)', async () => {
    const attachedFile = 'file-attached-no-links';

    const findFilesByIds = makeFindFilesByIds([attachedFile]);
    const deps = makeDeps({ fileReadRepo: { findFilesByIds } });
    deps.findFilesByIds = findFilesByIds;

    // No blocks linked to this scene
    deps.sceneReferenceSelectionRepo = {
      loadBlocksForDraft: vi.fn().mockResolvedValue([]),
      loadAttachedSceneMediaFileIds: vi.fn().mockResolvedValue([attachedFile]),
    };

    await processStoryboardOpenAIImageJob(
      makeJob({ jobId: 'job-attached-1', blockId: 'scene-block-1', prompt: 'Render the infant hand in the sterile facility.' }),
      deps,
    );

    // The attached image is the only file ID — images.edit must still be used
    expect(deps.imagesEdit).toHaveBeenCalled();
    expect(deps.imagesGenerate).not.toHaveBeenCalled();

    const call = findFilesByIds.mock.calls[0]![0] as { fileIds: string[] };
    expect(call.fileIds).toContain(attachedFile);
  });

  it('deduplicates a file ID that is both attached and a selected reference', async () => {
    const sharedFile = 'file-in-both-attached-and-reference';

    const findFilesByIds = makeFindFilesByIds([sharedFile]);
    const deps = makeDeps({ fileReadRepo: { findFilesByIds } });
    deps.findFilesByIds = findFilesByIds;

    deps.sceneReferenceSelectionRepo = {
      loadBlocksForDraft: vi.fn().mockResolvedValue([
        {
          id: 'ref-block-3',
          linkedSceneIds: ['scene-block-1'],
          outputs: [{ fileId: sharedFile, createdAt: new Date('2025-06-01T00:00:00Z') }],
          primaryStarFileId: undefined,
          windowStatus: 'done',
        },
      ]),
      loadAttachedSceneMediaFileIds: vi.fn().mockResolvedValue([sharedFile]),
    };

    await processStoryboardOpenAIImageJob(
      makeJob({ jobId: 'job-attached-1', blockId: 'scene-block-1', prompt: 'Render the infant hand in the sterile facility.' }),
      deps,
    );

    // The shared file ID must appear exactly once in findFilesByIds
    const call = findFilesByIds.mock.calls[0]![0] as { fileIds: string[] };
    const occurrences = call.fileIds.filter((id) => id === sharedFile);
    expect(occurrences).toHaveLength(1);

    // images.edit called (file present)
    expect(deps.imagesEdit).toHaveBeenCalled();
    expect(deps.imagesGenerate).not.toHaveBeenCalled();
  });

  it('no attached image + no linked references → text-only (images.generate), behavior unchanged', async () => {
    const deps = makeDeps();

    deps.sceneReferenceSelectionRepo = {
      loadBlocksForDraft: vi.fn().mockResolvedValue([]),
      loadAttachedSceneMediaFileIds: vi.fn().mockResolvedValue([]),
    };

    await processStoryboardOpenAIImageJob(
      makeJob({ jobId: 'job-attached-1', blockId: 'scene-block-1', prompt: 'Render the infant hand in the sterile facility.' }),
      deps,
    );

    // No file IDs → findFilesByIds not called and images.generate used
    expect(deps.findFilesByIds).not.toHaveBeenCalled();
    expect(deps.imagesGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Render the infant hand in the sterile facility.',
      }),
    );
    expect(deps.imagesEdit).not.toHaveBeenCalled();
  });

  it('prompt (block.prompt + style) is not altered by the presence of an attached image', async () => {
    const attachedFile = 'file-prompt-unchanged';
    const originalPrompt = 'Render the infant hand in the sterile facility.';

    const findFilesByIds = makeFindFilesByIds([attachedFile]);
    const deps = makeDeps({ fileReadRepo: { findFilesByIds } });
    deps.findFilesByIds = findFilesByIds;

    deps.sceneReferenceSelectionRepo = {
      loadBlocksForDraft: vi.fn().mockResolvedValue([]),
      loadAttachedSceneMediaFileIds: vi.fn().mockResolvedValue([attachedFile]),
    };

    await processStoryboardOpenAIImageJob(
      makeJob({ jobId: 'job-attached-1', blockId: 'scene-block-1', prompt: originalPrompt }),
      deps,
    );

    expect(deps.imagesEdit).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: originalPrompt }),
    );
  });

  it('backward-compat: when loadAttachedSceneMediaFileIds is absent, behavior unchanged (falls back to reference-only path)', async () => {
    const referenceFile = 'file-ref-compat';

    const findFilesByIds = makeFindFilesByIds([referenceFile]);
    const deps = makeDeps({ fileReadRepo: { findFilesByIds } });
    deps.findFilesByIds = findFilesByIds;

    // Old-style repo: only loadBlocksForDraft, no loadAttachedSceneMediaFileIds
    deps.sceneReferenceSelectionRepo = {
      loadBlocksForDraft: vi.fn().mockResolvedValue([
        {
          id: 'ref-block-compat',
          linkedSceneIds: ['scene-block-1'],
          outputs: [{ fileId: referenceFile, createdAt: new Date('2025-06-01T00:00:00Z') }],
          primaryStarFileId: undefined,
          windowStatus: 'done',
        },
      ]),
      // Intentionally omitting loadAttachedSceneMediaFileIds to test backward-compat
    } as Parameters<typeof processStoryboardOpenAIImageJob>[1]['sceneReferenceSelectionRepo'];

    await processStoryboardOpenAIImageJob(
      makeJob({ jobId: 'job-attached-1', blockId: 'scene-block-1', prompt: 'Render the infant hand in the sterile facility.' }),
      deps,
    );

    // Reference file still reaches findFilesByIds
    const call = findFilesByIds.mock.calls[0]![0] as { fileIds: string[] };
    expect(call.fileIds).toContain(referenceFile);

    // images.edit called (reference present)
    expect(deps.imagesEdit).toHaveBeenCalled();
    expect(deps.imagesGenerate).not.toHaveBeenCalled();
  });
});
