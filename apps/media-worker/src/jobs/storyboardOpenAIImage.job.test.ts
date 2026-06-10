import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from 'bullmq';
import type { Pool } from 'mysql2/promise';
import type { S3Client } from '@aws-sdk/client-s3';
import type OpenAI from 'openai';
import type { StoryboardOpenAIImageJobPayload } from '@ai-video-editor/project-schema';

vi.mock('@/lib/realtime.js', () => ({
  publishAiGenerationJobStatus: vi.fn().mockResolvedValue(undefined),
}));

import {
  processStoryboardOpenAIImageJob,
  type StoryboardOpenAIImageJobDeps,
} from './storyboardOpenAIImage.job.js';

const PNG_BODY = Buffer.from([1, 2, 3, 4]);
const B64_IMAGE = Buffer.from([9, 8, 7, 6]).toString('base64');

function makeJob(overrides: Partial<StoryboardOpenAIImageJobPayload> = {}): Job<StoryboardOpenAIImageJobPayload> {
  return {
    data: {
      jobId: 'job-1',
      userId: 'user-1',
      draftId: 'draft-1',
      kind: 'scene',
      prompt: 'Create the canonical visual style.',
      referenceFileIds: [],
      ...overrides,
    },
    attemptsMade: 0,
    opts: { attempts: 1 },
  } as Job<StoryboardOpenAIImageJobPayload>;
}

function makeDeps(): StoryboardOpenAIImageJobDeps & {
  execute: ReturnType<typeof vi.fn>;
  s3Send: ReturnType<typeof vi.fn>;
  imagesGenerate: ReturnType<typeof vi.fn>;
  imagesEdit: ReturnType<typeof vi.fn>;
  filesCreate: ReturnType<typeof vi.fn>;
  filesMarkReady: ReturnType<typeof vi.fn>;
  setOutputFile: ReturnType<typeof vi.fn>;
  markFailed: ReturnType<typeof vi.fn>;
  findFilesByIds: ReturnType<typeof vi.fn>;
  sceneAttachOutputToBlock: ReturnType<typeof vi.fn>;
  sceneMarkFailed: ReturnType<typeof vi.fn>;
} {
  const execute = vi.fn().mockResolvedValue([]);
  const s3Send = vi.fn().mockImplementation(async (command: { input?: { Key?: string } }) => {
    if (command.input?.Key === 'refs/source.png') {
      return {
        Body: {
          transformToByteArray: async () => PNG_BODY,
        },
      };
    }
    return {};
  });
  const imagesGenerate = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });
  const imagesEdit = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });
  const filesCreate = vi.fn().mockImplementation(async (params: { fileId: string }) => params.fileId);
  const filesMarkReady = vi.fn().mockResolvedValue(undefined);
  const setOutputFile = vi.fn().mockResolvedValue(undefined);
  const markFailed = vi.fn().mockResolvedValue(undefined);
  const findFilesByIds = vi.fn().mockResolvedValue([
    {
      fileId: 'file-ref-1',
      storageUri: 's3://test-bucket/refs/source.png',
      mimeType: 'image/png',
      displayName: 'source.png',
    },
  ]);
  const sceneAttachOutputToBlock = vi.fn().mockResolvedValue(undefined);
  const sceneMarkFailed = vi.fn().mockResolvedValue(undefined);

  return {
    openai: { images: { generate: imagesGenerate, edit: imagesEdit } } as unknown as OpenAI,
    s3: { send: s3Send } as unknown as S3Client,
    pool: { execute } as unknown as Pool,
    bucket: 'test-bucket',
    filesRepo: { createFile: filesCreate, markReady: filesMarkReady },
    fileReadRepo: { findFilesByIds },
    aiGenerationJobRepo: { setOutputFile, markFailed },
    storyboardSceneRepo: {
      attachOutputToBlock: sceneAttachOutputToBlock,
      markFailed: sceneMarkFailed,
    },
    execute,
    s3Send,
    imagesGenerate,
    imagesEdit,
    filesCreate,
    filesMarkReady,
    setOutputFile,
    markFailed,
    findFilesByIds,
    sceneAttachOutputToBlock,
    sceneMarkFailed,
  };
}

describe('processStoryboardOpenAIImageJob', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('uses OpenAI image generation for text-only scene jobs and stores output', async () => {
    const deps = makeDeps();

    await processStoryboardOpenAIImageJob(makeJob(), deps);

    expect(deps.imagesGenerate).toHaveBeenCalledWith({
      model: 'gpt-image-2',
      prompt: 'Create the canonical visual style.',
      n: 1,
      size: 'auto',
      quality: 'auto',
      output_format: 'png',
    });
    expect(deps.imagesEdit).not.toHaveBeenCalled();
    expect(deps.filesCreate).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      kind: 'image',
      mimeType: 'image/png',
      bytes: 4,
      storageUri: expect.stringMatching(/^s3:\/\/test-bucket\/storyboard-openai-images\/user-1\//),
    }));
    const fileId = (deps.filesCreate.mock.calls[0]![0] as { fileId: string }).fileId;
    expect(deps.setOutputFile).toHaveBeenCalledWith('job-1', fileId);
    expect(deps.filesMarkReady).toHaveBeenCalledWith(fileId);
    expect(deps.sceneAttachOutputToBlock).toHaveBeenCalledWith({
      id: expect.stringMatching(/^[0-9a-f-]+$/),
      aiJobId: 'job-1',
      outputFileId: fileId,
    });
  });

  it('uses OpenAI image edit for referenced images and previous scene continuity', async () => {
    const deps = makeDeps();

    await processStoryboardOpenAIImageJob(
      makeJob({
        kind: 'scene',
        blockId: 'block-1',
        prompt: 'Create scene 2.',
        referenceFileIds: ['file-ref-1'],
        previousSceneFileId: 'file-ref-1',
        size: '1024x1024',
      }),
      deps,
    );

    expect(deps.findFilesByIds).toHaveBeenCalledWith({
      userId: 'user-1',
      fileIds: ['file-ref-1'],
    });
    expect(deps.imagesEdit).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-image-2',
      prompt: 'Create scene 2.',
      n: 1,
      size: '1024x1024',
      quality: 'auto',
    }));
    expect(deps.imagesGenerate).not.toHaveBeenCalled();
    const fileId = (deps.filesCreate.mock.calls[0]![0] as { fileId: string }).fileId;
    expect(deps.sceneAttachOutputToBlock).toHaveBeenCalledWith({
      id: expect.stringMatching(/^[0-9a-f-]+$/),
      aiJobId: 'job-1',
      outputFileId: fileId,
    });
  });

  it('downloads URL outputs when OpenAI returns a temporary URL', async () => {
    const deps = makeDeps();
    deps.imagesGenerate.mockResolvedValueOnce({ data: [{ url: 'https://openai.example/image.png' }] });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([5, 5, 5]).buffer,
    }) as unknown as typeof globalThis.fetch;

    await processStoryboardOpenAIImageJob(makeJob(), deps);

    expect(globalThis.fetch).toHaveBeenCalledWith('https://openai.example/image.png');
    expect(deps.filesCreate).toHaveBeenCalledWith(expect.objectContaining({ bytes: 3 }));
  });

  it('marks the job and scene mapping failed with a sanitized error', async () => {
    const deps = makeDeps();
    deps.imagesGenerate.mockRejectedValueOnce(
      new Error('OpenAI failed sk_live_abcdefghijkl at https://signed.example.com/out.png\nstack line'),
    );

    await expect(processStoryboardOpenAIImageJob(makeJob(), deps)).rejects.toThrow('OpenAI failed');

    expect(deps.markFailed).toHaveBeenCalledWith(
      'job-1',
      'OpenAI failed [redacted] at [redacted-url]',
    );
    expect(deps.sceneMarkFailed).toHaveBeenCalledWith(
      'job-1',
      'OpenAI failed [redacted] at [redacted-url]',
    );
  });

  it('marks scene mappings failed on final scene job failure', async () => {
    const deps = makeDeps();
    deps.imagesEdit.mockRejectedValueOnce(new Error('OpenAI scene failed'));

    await expect(
      processStoryboardOpenAIImageJob(
        makeJob({ kind: 'scene', blockId: 'block-1', referenceFileIds: ['file-ref-1'] }),
        deps,
      ),
    ).rejects.toThrow('OpenAI scene failed');

    expect(deps.sceneMarkFailed).toHaveBeenCalledWith('job-1', 'OpenAI scene failed');
  });

  it('does not mark failed on non-final retryable attempts', async () => {
    const deps = makeDeps();
    deps.imagesGenerate.mockRejectedValueOnce(new Error('OpenAI 503 Service Unavailable'));

    await expect(
      processStoryboardOpenAIImageJob(
        {
          ...makeJob(),
          attemptsMade: 1,
          opts: { attempts: 3 },
        } as Job<StoryboardOpenAIImageJobPayload>,
        deps,
      ),
    ).rejects.toThrow('OpenAI 503 Service Unavailable');

    expect(deps.markFailed).not.toHaveBeenCalled();
    expect(deps.sceneMarkFailed).not.toHaveBeenCalled();
  });

  it('fails before calling OpenAI when a reference file is unavailable', async () => {
    const deps = makeDeps();
    deps.findFilesByIds.mockResolvedValueOnce([]);

    await expect(
      processStoryboardOpenAIImageJob(
        makeJob({ referenceFileIds: ['missing-file'] }),
        deps,
      ),
    ).rejects.toThrow('Reference image file is unavailable');

    expect(deps.imagesEdit).not.toHaveBeenCalled();
    expect(deps.imagesGenerate).not.toHaveBeenCalled();
    expect(deps.filesCreate).not.toHaveBeenCalled();
    expect(deps.setOutputFile).not.toHaveBeenCalled();
    expect(deps.sceneAttachOutputToBlock).not.toHaveBeenCalled();
    expect(deps.markFailed).toHaveBeenCalledWith(
      'job-1',
      'Reference image file is unavailable: missing-file',
    );
    expect(deps.sceneMarkFailed).toHaveBeenCalledWith(
      'job-1',
      'Reference image file is unavailable: missing-file',
    );
  });

  it('fails before calling OpenAI when S3 returns an unreadable reference body', async () => {
    const deps = makeDeps();
    deps.s3Send.mockResolvedValueOnce({});

    await expect(
      processStoryboardOpenAIImageJob(
        makeJob({ referenceFileIds: ['file-ref-1'] }),
        deps,
      ),
    ).rejects.toThrow('has no readable body');

    expect(deps.imagesEdit).not.toHaveBeenCalled();
    expect(deps.filesCreate).not.toHaveBeenCalled();
    expect(deps.setOutputFile).not.toHaveBeenCalled();
    expect(deps.sceneAttachOutputToBlock).not.toHaveBeenCalled();
  });

  it('fails without creating files when OpenAI returns no image data', async () => {
    const deps = makeDeps();
    deps.imagesGenerate.mockResolvedValueOnce({ data: [{}] });

    await expect(processStoryboardOpenAIImageJob(makeJob(), deps)).rejects.toThrow(
      'OpenAI Images response did not include image data',
    );

    expect(deps.filesCreate).not.toHaveBeenCalled();
    expect(deps.setOutputFile).not.toHaveBeenCalled();
    expect(deps.sceneAttachOutputToBlock).not.toHaveBeenCalled();
    expect(deps.markFailed).toHaveBeenCalledWith(
      'job-1',
      'OpenAI Images response did not include image data',
    );
  });

  it('fails without creating files when OpenAI URL output cannot be downloaded', async () => {
    const deps = makeDeps();
    deps.imagesGenerate.mockResolvedValueOnce({ data: [{ url: 'https://openai.example/broken.png' }] });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as unknown as typeof globalThis.fetch;

    await expect(processStoryboardOpenAIImageJob(makeJob(), deps)).rejects.toThrow(
      'Failed to download OpenAI image output',
    );

    expect(deps.filesCreate).not.toHaveBeenCalled();
    expect(deps.setOutputFile).not.toHaveBeenCalled();
    expect(deps.sceneAttachOutputToBlock).not.toHaveBeenCalled();
    expect(deps.markFailed).toHaveBeenCalledWith(
      'job-1',
      'Failed to download OpenAI image output: HTTP 503',
    );
  });

  // ── T8 — Drop the principal-image read from the scene job inputs ──────────────

  describe('T8 / resolveSceneInputs — reference boundary via sceneReferenceSelectionRepo', () => {
    /**
     * AC-04 (US-04): a scene job for a draft with zero reference blocks proceeds with
     * prompt + no reference images (images.generate, not images.edit).
     */
    it('AC-04: zero reference blocks — proceeds with prompt only, calls images.generate', async () => {
      const deps = makeDeps();
      // Wire the repo so resolveSceneInputs is active
      const loadBlocksForDraft = vi.fn().mockResolvedValue([]);
      deps.sceneReferenceSelectionRepo = { loadBlocksForDraft };

      await processStoryboardOpenAIImageJob(
        makeJob({
          kind: 'scene',
          blockId: 'scene-1',
          prompt: 'A wide shot of an empty meadow.',
          referenceFileIds: [],
        }),
        deps,
      );

      // Repo was consulted
      expect(loadBlocksForDraft).toHaveBeenCalledWith('draft-1');
      // No reference images → text-to-image path
      expect(deps.imagesGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'A wide shot of an empty meadow.' }),
      );
      expect(deps.imagesEdit).not.toHaveBeenCalled();
      // findFilesByIds not called (no file IDs to resolve)
      expect(deps.findFilesByIds).not.toHaveBeenCalled();
    });

    /**
     * AC-05 (US-05) / Reference-boundary invariant: only the selected outputs of
     * blocks LINKED to scene-S feed scene-S.  An unlinked block's output must be
     * absent from the resolved file IDs passed to findFilesByIds / images.edit.
     */
    it('AC-05: only linked-block outputs feed the scene — unlinked block output absent', async () => {
      const deps = makeDeps();

      const LINKED_FILE = 'file-linked-block';
      const UNLINKED_FILE = 'file-unlinked-block';

      // Block-A is linked to scene-S; block-B is NOT linked to scene-S
      const loadBlocksForDraft = vi.fn().mockResolvedValue([
        {
          id: 'block-A',
          linkedSceneIds: ['scene-S'],
          outputs: [{ fileId: LINKED_FILE, createdAt: new Date('2025-01-02T00:00:00Z') }],
          primaryStarFileId: undefined,
        },
        {
          id: 'block-B',
          linkedSceneIds: ['scene-other'],
          outputs: [{ fileId: UNLINKED_FILE, createdAt: new Date('2025-01-01T00:00:00Z') }],
          primaryStarFileId: undefined,
        },
      ]);
      deps.sceneReferenceSelectionRepo = { loadBlocksForDraft };

      // Make findFilesByIds return the linked file so images.edit can proceed
      deps.findFilesByIds.mockResolvedValue([
        {
          fileId: LINKED_FILE,
          storageUri: 's3://test-bucket/refs/source.png',
          mimeType: 'image/png',
          displayName: 'linked.png',
        },
      ]);

      await processStoryboardOpenAIImageJob(
        makeJob({
          kind: 'scene',
          blockId: 'scene-S',
          prompt: 'Scene with hero only.',
          referenceFileIds: [UNLINKED_FILE], // payload carries the old/wrong value — must be ignored
        }),
        deps,
      );

      // Only the linked block's output must reach findFilesByIds
      expect(deps.findFilesByIds).toHaveBeenCalledWith(
        expect.objectContaining({ fileIds: expect.not.arrayContaining([UNLINKED_FILE]) }),
      );
      expect(deps.findFilesByIds).toHaveBeenCalledWith(
        expect.objectContaining({ fileIds: expect.arrayContaining([LINKED_FILE]) }),
      );
      // images.edit called (reference file present)
      expect(deps.imagesEdit).toHaveBeenCalled();
      expect(deps.imagesGenerate).not.toHaveBeenCalled();
    });

    /**
     * AC-08 (US-07): the legacy principal-image record is ignored on read at
     * runtime.  Even when a legacy principal fileId appears in the job payload's
     * referenceFileIds (the T5 stopgap) and a fake sceneReferenceSelectionRepo
     * returns linked-block outputs, the resolved inputs must contain only the
     * linked-block selected output — never the legacy principal fileId.
     */
    it('AC-08: legacy principal fileId in payload.referenceFileIds is ignored when sceneReferenceSelectionRepo is wired', async () => {
      const deps = makeDeps();

      const LEGACY_PRINCIPAL_FILE = 'file-legacy-principal';
      const LINKED_BLOCK_FILE = 'file-linked-block-output';

      const loadBlocksForDraft = vi.fn().mockResolvedValue([
        {
          id: 'ref-block-1',
          linkedSceneIds: ['scene-1'],
          outputs: [{ fileId: LINKED_BLOCK_FILE, createdAt: new Date('2025-06-01T00:00:00Z') }],
          primaryStarFileId: undefined,
        },
      ]);
      deps.sceneReferenceSelectionRepo = { loadBlocksForDraft };

      deps.findFilesByIds.mockResolvedValue([
        {
          fileId: LINKED_BLOCK_FILE,
          storageUri: 's3://test-bucket/refs/source.png',
          mimeType: 'image/png',
          displayName: 'linked.png',
        },
      ]);

      await processStoryboardOpenAIImageJob(
        makeJob({
          kind: 'scene',
          blockId: 'scene-1',
          prompt: 'Scene with character.',
          // Simulate the T5 stopgap: legacy principal fileId was enqueued on the payload
          referenceFileIds: [LEGACY_PRINCIPAL_FILE],
        }),
        deps,
      );

      // The legacy principal must NOT appear in resolved inputs
      expect(deps.findFilesByIds).not.toHaveBeenCalledWith(
        expect.objectContaining({ fileIds: expect.arrayContaining([LEGACY_PRINCIPAL_FILE]) }),
      );
      // The linked-block output must appear instead
      expect(deps.findFilesByIds).toHaveBeenCalledWith(
        expect.objectContaining({ fileIds: expect.arrayContaining([LINKED_BLOCK_FILE]) }),
      );
    });
  });
});
