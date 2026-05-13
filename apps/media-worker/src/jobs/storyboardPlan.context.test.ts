import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'mysql2/promise';
import type { PromptDoc } from '@ai-video-editor/project-schema';
import {
  resolveStoryboardPlanContext,
  StoryboardPlanContextValidationError,
  toPersistedStoryboardPlanMediaContext,
} from './storyboardPlan.context.js';
const DRAFT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';
const IMAGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUDIO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VIDEO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function makePromptDoc(blocks: PromptDoc['blocks']): PromptDoc {
  return {
    schemaVersion: 1,
    blocks,
    settings: {
      videoLengthSeconds: 30,
      aspectRatio: '16:9',
      styleKey: 'cinematic',
      modelPreference: null,
    },
  };
}
function fileRow(params: {
  fileId: string;
  userId?: string;
  kind: 'image' | 'audio' | 'video';
  status?: 'pending' | 'processing' | 'ready' | 'error';
  storageUri?: string;
  thumbnailUri?: string | null;
  draftFileId?: string | null;
  deletedAt?: Date | null;
  draftFileDeletedAt?: Date | null;
}) {
  return {
    file_id: params.fileId,
    user_id: params.userId ?? USER_ID,
    kind: params.kind,
    storage_uri: params.storageUri ?? `s3://media-bucket/uploads/${params.fileId}`,
    mime_type:
      params.kind === 'image' ? 'image/png' : params.kind === 'audio' ? 'audio/mpeg' : 'video/mp4',
    bytes: 12345,
    width: params.kind === 'audio' ? null : 1920,
    height: params.kind === 'audio' ? null : 1080,
    duration_ms: params.kind === 'image' ? null : 12000,
    display_name: `${params.kind}-asset`,
    status: params.status ?? 'ready',
    deleted_at: params.deletedAt ?? null,
    thumbnail_uri: params.thumbnailUri ?? null,
    draft_file_id: params.draftFileId === undefined ? params.fileId : params.draftFileId,
    draft_file_deleted_at: params.draftFileDeletedAt ?? null,
  };
}
function makePool(args: {
  promptDoc: PromptDoc;
  files?: ReturnType<typeof fileRow>[];
  transcripts?: { file_id: string; segments_json: unknown }[];
}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM generation_drafts')) {
      return [[{ id: DRAFT_ID, user_id: USER_ID, prompt_doc: JSON.stringify(args.promptDoc) }]];
    }
    if (sql.includes('FROM files f')) {
      return [args.files ?? []];
    }
    if (sql.includes('FROM caption_tracks')) {
      return [args.transcripts ?? []];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  return { query } as unknown as Pool;
}
describe('storyboardPlan.context', () => {
  const signReadUrl = vi.fn(async (storageUri: string) => `https://signed.example.com/${encodeURIComponent(storageUri)}`);
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('resolves ready image refs into metadata plus signed image vision input', async () => {
    const promptDoc = makePromptDoc([
      { type: 'text', value: 'Use this product photo.' },
      { type: 'media-ref', mediaType: 'image', fileId: IMAGE_ID, label: 'Product photo' },
    ]);
    const pool = makePool({
      promptDoc,
      files: [
        fileRow({
          fileId: IMAGE_ID,
          kind: 'image',
          storageUri: 's3://media-bucket/images/product.png',
          thumbnailUri: 's3://media-bucket/thumbs/product.jpg',
        }),
      ],
    });
    const context = await resolveStoryboardPlanContext(DRAFT_ID, USER_ID, { pool, signReadUrl });
    expect(context.text).toBe('Use this product photo.');
    expect(context.media[0]).toMatchObject({
      fileId: IMAGE_ID,
      mediaType: 'image',
      label: 'Product photo',
      status: 'ready',
      thumbnailAvailable: true,
      storageUri: 's3://media-bucket/images/product.png',
      contextStrategy: 'image-vision',
      transcript: null,
    });
    expect(context.openAiMediaInputs).toEqual([
      {
        fileId: IMAGE_ID,
        mediaType: 'image',
        label: 'Product photo',
        role: 'image',
        url: 'https://signed.example.com/s3%3A%2F%2Fmedia-bucket%2Fimages%2Fproduct.png',
        mimeType: 'image/png',
      },
    ]);
    expect(signReadUrl).toHaveBeenCalledWith('s3://media-bucket/images/product.png');
  });
  it('uses transcript-first audio context and never signs raw audio for normal planning', async () => {
    const promptDoc = makePromptDoc([
      { type: 'media-ref', mediaType: 'audio', fileId: AUDIO_ID, label: 'Voiceover' },
    ]);
    const pool = makePool({
      promptDoc,
      files: [fileRow({ fileId: AUDIO_ID, kind: 'audio', storageUri: 's3://media-bucket/audio/voice.mp3' })],
      transcripts: [
        {
          file_id: AUDIO_ID,
          segments_json: JSON.stringify([
            { start: 0, end: 1.5, text: 'The opening line.' },
            { start: 1.5, end: 3, text: 'The second line.' },
          ]),
        },
      ],
    });
    const context = await resolveStoryboardPlanContext(DRAFT_ID, USER_ID, { pool, signReadUrl });
    expect(context.media[0]).toMatchObject({
      fileId: AUDIO_ID,
      mediaType: 'audio',
      transcript: 'The opening line. The second line.',
      contextStrategy: 'audio-transcript-first',
    });
    expect(context.openAiMediaInputs).toEqual([]);
    expect(signReadUrl).not.toHaveBeenCalled();
  });
  it('uses video metadata plus signed thumbnail preview and never signs raw video for normal planning', async () => {
    const promptDoc = makePromptDoc([
      { type: 'media-ref', mediaType: 'video', fileId: VIDEO_ID, label: 'Demo clip' },
    ]);
    const pool = makePool({
      promptDoc,
      files: [
        fileRow({
          fileId: VIDEO_ID,
          kind: 'video',
          storageUri: 's3://media-bucket/videos/demo.mp4',
          thumbnailUri: 's3://media-bucket/thumbnails/demo.jpg',
        }),
      ],
      transcripts: [
        {
          file_id: VIDEO_ID,
          segments_json: [{ start: 0, end: 2, text: 'A person presents the demo.' }],
        },
      ],
    });
    const context = await resolveStoryboardPlanContext(DRAFT_ID, USER_ID, { pool, signReadUrl });
    expect(context.media[0]).toMatchObject({
      fileId: VIDEO_ID,
      mediaType: 'video',
      storageUri: 's3://media-bucket/videos/demo.mp4',
      thumbnailUri: 's3://media-bucket/thumbnails/demo.jpg',
      transcript: 'A person presents the demo.',
      contextStrategy: 'video-metadata-thumbnail-transcript',
    });
    expect(context.openAiMediaInputs).toEqual([
      {
        fileId: VIDEO_ID,
        mediaType: 'video',
        label: 'Demo clip',
        role: 'video-preview',
        url: 'https://signed.example.com/s3%3A%2F%2Fmedia-bucket%2Fthumbnails%2Fdemo.jpg',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(signReadUrl).toHaveBeenCalledTimes(1);
    expect(signReadUrl).not.toHaveBeenCalledWith('s3://media-bucket/videos/demo.mp4');
  });
  it('keeps pending and processing files as metadata-only context', async () => {
    const promptDoc = makePromptDoc([
      { type: 'media-ref', mediaType: 'image', fileId: IMAGE_ID, label: 'Pending image' },
      { type: 'media-ref', mediaType: 'video', fileId: VIDEO_ID, label: 'Processing video' },
    ]);
    const pool = makePool({
      promptDoc,
      files: [
        fileRow({ fileId: IMAGE_ID, kind: 'image', status: 'pending' }),
        fileRow({
          fileId: VIDEO_ID,
          kind: 'video',
          status: 'processing',
          thumbnailUri: 's3://media-bucket/thumbnails/processing.jpg',
        }),
      ],
    });
    const context = await resolveStoryboardPlanContext(DRAFT_ID, USER_ID, { pool, signReadUrl });
    expect(context.media.map((item) => item.status)).toEqual(['pending', 'processing']);
    expect(context.openAiMediaInputs).toEqual([]);
    expect(signReadUrl).not.toHaveBeenCalled();
  });
  it('records transcript null when transcript storage is absent', async () => {
    const promptDoc = makePromptDoc([
      { type: 'media-ref', mediaType: 'audio', fileId: AUDIO_ID, label: 'Voiceover' },
    ]);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM generation_drafts')) {
        return [[{ id: DRAFT_ID, user_id: USER_ID, prompt_doc: JSON.stringify(promptDoc) }]];
      }
      if (sql.includes('FROM files f')) {
        return [[fileRow({ fileId: AUDIO_ID, kind: 'audio' })]];
      }
      if (sql.includes('FROM caption_tracks')) {
        const error = new Error('Table caption_tracks does not exist') as Error & { code: string };
        error.code = 'ER_NO_SUCH_TABLE';
        throw error;
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const pool = { query } as unknown as Pool;
    const context = await resolveStoryboardPlanContext(DRAFT_ID, USER_ID, { pool, signReadUrl });
    expect(context.media[0]).toMatchObject({
      fileId: AUDIO_ID,
      mediaType: 'audio',
      transcript: null,
    });
  });
  it('filters out soft-deleted generation drafts before resolving context', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM generation_drafts')) {
        expect(sql).toContain('deleted_at IS NULL');
        return [[]];
      }
      throw new Error(`Unexpected SQL after missing draft: ${sql}`);
    });
    const pool = { query } as unknown as Pool;
    await expect(resolveStoryboardPlanContext(DRAFT_ID, USER_ID, { pool, signReadUrl })).rejects.toThrow(
      new StoryboardPlanContextValidationError(`Generation draft ${DRAFT_ID} was not found for storyboard planning`),
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('fails clearly for dangling media refs', async () => {
    const promptDoc = makePromptDoc([
      { type: 'media-ref', mediaType: 'image', fileId: IMAGE_ID, label: 'Missing image' },
    ]);
    const pool = makePool({ promptDoc, files: [] });
    await expect(resolveStoryboardPlanContext(DRAFT_ID, USER_ID, { pool, signReadUrl })).rejects.toThrow(
      new StoryboardPlanContextValidationError(
        `Media reference "Missing image" (${IMAGE_ID}) is not available for draft ${DRAFT_ID}`,
      ),
    );
  });
  it('fails clearly for unauthorized or unlinked media refs', async () => {
    const promptDoc = makePromptDoc([
      { type: 'media-ref', mediaType: 'image', fileId: IMAGE_ID, label: 'Other user image' },
    ]);
    const unauthorizedPool = makePool({
      promptDoc,
      files: [fileRow({ fileId: IMAGE_ID, kind: 'image', userId: OTHER_USER_ID })],
    });
    await expect(resolveStoryboardPlanContext(DRAFT_ID, USER_ID, {
      pool: unauthorizedPool,
      signReadUrl,
    })).rejects.toThrow('is not owned by the storyboard planning user');
    const unlinkedPool = makePool({
      promptDoc,
      files: [fileRow({ fileId: IMAGE_ID, kind: 'image', draftFileId: null })],
    });
    await expect(resolveStoryboardPlanContext(DRAFT_ID, USER_ID, {
      pool: unlinkedPool,
      signReadUrl,
    })).rejects.toThrow(`is not linked to draft ${DRAFT_ID}`);
  });
  it('fails clearly for deleted file media refs', async () => {
    const promptDoc = makePromptDoc([
      { type: 'media-ref', mediaType: 'image', fileId: IMAGE_ID, label: 'Deleted image' },
    ]);
    const pool = makePool({
      promptDoc,
      files: [fileRow({ fileId: IMAGE_ID, kind: 'image', deletedAt: new Date('2026-05-13T00:00:00.000Z') })],
    });
    await expect(resolveStoryboardPlanContext(DRAFT_ID, USER_ID, { pool, signReadUrl })).rejects.toThrow(
      `Media reference "Deleted image" (${IMAGE_ID}) points to a deleted file`,
    );
  });
  it('fails clearly when media ref type does not match file kind', async () => {
    const promptDoc = makePromptDoc([
      { type: 'media-ref', mediaType: 'image', fileId: VIDEO_ID, label: 'Wrong kind' },
    ]);
    const pool = makePool({
      promptDoc,
      files: [fileRow({ fileId: VIDEO_ID, kind: 'video' })],
    });
    await expect(resolveStoryboardPlanContext(DRAFT_ID, USER_ID, { pool, signReadUrl })).rejects.toThrow(
      `Media reference "Wrong kind" (${VIDEO_ID}) declares image but file kind is video`,
    );
  });
  it('returns a persistable media context without signed URLs', async () => {
    const promptDoc = makePromptDoc([
      { type: 'media-ref', mediaType: 'image', fileId: IMAGE_ID, label: 'Product photo' },
    ]);
    const pool = makePool({
      promptDoc,
      files: [fileRow({ fileId: IMAGE_ID, kind: 'image', storageUri: 's3://media-bucket/images/product.png' })],
    });
    const context = await resolveStoryboardPlanContext(DRAFT_ID, USER_ID, { pool, signReadUrl });
    const persistable = toPersistedStoryboardPlanMediaContext(context);
    expect(JSON.stringify(persistable)).not.toContain('https://signed.example.com');
    expect(JSON.stringify(persistable)).toContain('s3://media-bucket/images/product.png');
    expect(JSON.stringify(context.openAiMediaInputs)).toContain('https://signed.example.com');
  });
});
