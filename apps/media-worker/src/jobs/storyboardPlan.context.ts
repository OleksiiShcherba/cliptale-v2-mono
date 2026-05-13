import type { Pool, RowDataPacket } from 'mysql2/promise';

import {
  promptDocSchema,
  type CaptionSegment,
  type MediaRefBlock,
  type PromptDoc,
} from '@ai-video-editor/project-schema';

import type {
  FileStatus,
  MediaContextKind,
  StoryboardPlanMediaContextItem,
  StoryboardPlanOpenAiMediaInput,
  StoryboardPlanResolvedContext,
} from './storyboardPlan.context.types.js';

type StoryboardPlanContextDeps = {
  pool?: Pool;
  signReadUrl?: (storageUri: string) => Promise<string>;
};

type DraftRow = RowDataPacket & {
  id: string;
  user_id: string;
  prompt_doc: unknown;
};

type FileRow = RowDataPacket & {
  file_id: string;
  user_id: string;
  kind: MediaContextKind | 'document' | 'other';
  storage_uri: string;
  mime_type: string | null;
  bytes: string | number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  display_name: string | null;
  status: FileStatus;
  deleted_at: Date | null;
  thumbnail_uri: string | null;
  draft_file_id: string | null;
  draft_file_deleted_at: Date | null;
};

type CaptionTrackRow = RowDataPacket & {
  file_id: string;
  segments_json: string | CaptionSegment[];
};

type MysqlError = Error & {
  code?: string;
};

export class StoryboardPlanContextValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryboardPlanContextValidationError';
  }
}

function parseJsonColumn<T>(value: unknown): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}

function promptText(promptDoc: PromptDoc): string {
  return promptDoc.blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.value.trim())
    .filter(Boolean)
    .join('\n\n');
}

function getMediaRefs(promptDoc: PromptDoc): MediaRefBlock[] {
  return promptDoc.blocks.filter((block): block is MediaRefBlock => block.type === 'media-ref');
}

function truncateTranscript(segments: CaptionSegment[], maxChars = 2_000): string | null {
  const text = segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(' ');
  if (!text) return null;
  return text.length > maxChars ? `${text.slice(0, maxChars - 1).trimEnd()}...` : text;
}

function rowBytes(value: string | number | null): number | null {
  return value == null ? null : Number(value);
}

function isMissingTranscriptSchemaError(error: unknown): boolean {
  const mysqlError = error as MysqlError;
  return mysqlError.code === 'ER_NO_SUCH_TABLE' || mysqlError.code === 'ER_BAD_FIELD_ERROR';
}

function mapFileRow(row: FileRow, mediaRef: MediaRefBlock, transcript: string | null): StoryboardPlanMediaContextItem {
  const common = {
    fileId: row.file_id,
    mediaType: mediaRef.mediaType,
    label: mediaRef.label,
    mimeType: row.mime_type,
    displayName: row.display_name,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    bytes: rowBytes(row.bytes),
    status: row.status,
    thumbnailAvailable: row.thumbnail_uri !== null,
    storageUri: row.storage_uri,
    thumbnailUri: row.thumbnail_uri,
    transcript,
  };

  if (mediaRef.mediaType === 'image') {
    return { ...common, mediaType: 'image', contextStrategy: 'image-vision' };
  }
  if (mediaRef.mediaType === 'audio') {
    return { ...common, mediaType: 'audio', contextStrategy: 'audio-transcript-first' };
  }
  return { ...common, mediaType: 'video', contextStrategy: 'video-metadata-thumbnail-transcript' };
}

function assertUsableMediaRef(row: FileRow | undefined, mediaRef: MediaRefBlock, draftId: string, userId: string): FileRow {
  if (!row) {
    throw new StoryboardPlanContextValidationError(
      `Media reference "${mediaRef.label}" (${mediaRef.fileId}) is not available for draft ${draftId}`,
    );
  }
  if (row.user_id !== userId) {
    throw new StoryboardPlanContextValidationError(
      `Media reference "${mediaRef.label}" (${mediaRef.fileId}) is not owned by the storyboard planning user`,
    );
  }
  if (row.deleted_at !== null) {
    throw new StoryboardPlanContextValidationError(
      `Media reference "${mediaRef.label}" (${mediaRef.fileId}) points to a deleted file`,
    );
  }
  if (row.draft_file_id === null || row.draft_file_deleted_at !== null) {
    throw new StoryboardPlanContextValidationError(
      `Media reference "${mediaRef.label}" (${mediaRef.fileId}) is not linked to draft ${draftId}`,
    );
  }
  if (row.kind !== mediaRef.mediaType) {
    throw new StoryboardPlanContextValidationError(
      `Media reference "${mediaRef.label}" (${mediaRef.fileId}) declares ${mediaRef.mediaType} but file kind is ${row.kind}`,
    );
  }
  return row;
}

async function fetchDraft(db: Pool, draftId: string, userId: string): Promise<PromptDoc> {
  const [rows] = await db.query<DraftRow[]>(
    'SELECT id, user_id, prompt_doc FROM generation_drafts WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
    [draftId, userId],
  );
  const row = rows[0];
  if (!row) {
    throw new StoryboardPlanContextValidationError(`Generation draft ${draftId} was not found for storyboard planning`);
  }

  const parsed = promptDocSchema.safeParse(parseJsonColumn(row.prompt_doc));
  if (!parsed.success) {
    throw new StoryboardPlanContextValidationError(`Invalid PromptDoc for draft ${draftId}: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function fetchReferencedFiles(db: Pool, draftId: string, fileIds: string[]): Promise<Map<string, FileRow>> {
  if (fileIds.length === 0) return new Map();

  const placeholders = fileIds.map(() => '?').join(', ');
  const [rows] = await db.query<FileRow[]>(
    `SELECT f.file_id, f.user_id, f.kind, f.storage_uri, f.mime_type, f.bytes,
            f.width, f.height, f.duration_ms, f.display_name, f.status,
            f.deleted_at, f.thumbnail_uri,
            df.file_id AS draft_file_id, df.deleted_at AS draft_file_deleted_at
       FROM files f
       LEFT JOIN draft_files df
         ON df.file_id = f.file_id AND df.draft_id = ?
      WHERE f.file_id IN (${placeholders})`,
    [draftId, ...fileIds],
  );

  return new Map(rows.map((row) => [row.file_id, row]));
}

async function fetchTranscripts(db: Pool, fileIds: string[]): Promise<Map<string, string | null>> {
  if (fileIds.length === 0) return new Map();

  const placeholders = fileIds.map(() => '?').join(', ');
  let rows: CaptionTrackRow[];
  try {
    [rows] = await db.query<CaptionTrackRow[]>(
      `SELECT file_id, segments_json
         FROM caption_tracks
        WHERE file_id IN (${placeholders})
        ORDER BY created_at DESC`,
      fileIds,
    );
  } catch (error: unknown) {
    if (isMissingTranscriptSchemaError(error)) {
      return new Map();
    }
    throw error;
  }

  const transcripts = new Map<string, string | null>();
  for (const row of rows) {
    if (transcripts.has(row.file_id)) continue;
    const segments = parseJsonColumn<CaptionSegment[]>(row.segments_json);
    transcripts.set(row.file_id, truncateTranscript(segments));
  }
  return transcripts;
}

async function buildOpenAiMediaInputs(
  media: StoryboardPlanMediaContextItem[],
  signReadUrl: (storageUri: string) => Promise<string>,
): Promise<StoryboardPlanOpenAiMediaInput[]> {
  const inputs: StoryboardPlanOpenAiMediaInput[] = [];

  for (const item of media) {
    // Pending/processing files are metadata-only; vision URLs require ready rows.
    if (item.status !== 'ready') continue;

    if (item.mediaType === 'image') {
      inputs.push({
        fileId: item.fileId,
        mediaType: item.mediaType,
        label: item.label,
        role: 'image',
        url: await signReadUrl(item.storageUri),
        mimeType: item.mimeType,
      });
      continue;
    }

    if (item.mediaType === 'audio') continue;

    // Video uses thumbnail/keyframe previews; raw video is avoided.
    if (item.thumbnailUri) {
      inputs.push({
        fileId: item.fileId,
        mediaType: item.mediaType,
        label: item.label,
        role: 'video-preview',
        url: await signReadUrl(item.thumbnailUri),
        mimeType: 'image/jpeg',
      });
    }
  }

  return inputs;
}

/** Resolves PromptDoc media refs into compact storyboard planning context. */
export async function resolveStoryboardPlanContext(
  draftId: string,
  userId: string,
  deps: StoryboardPlanContextDeps = {},
): Promise<StoryboardPlanResolvedContext> {
  const db = deps.pool ?? (await import('@/lib/db.js')).pool;
  const signReadUrl = deps.signReadUrl ?? (await import('@/lib/s3.js')).getSignedReadUrl;

  const promptDoc = await fetchDraft(db, draftId, userId);
  const mediaRefs = getMediaRefs(promptDoc);
  const fileIds = [...new Set(mediaRefs.map((ref) => ref.fileId))];

  const [fileRows, transcripts] = await Promise.all([
    fetchReferencedFiles(db, draftId, fileIds),
    fetchTranscripts(db, fileIds),
  ]);

  const media = mediaRefs.map((mediaRef) => {
    const fileRow = assertUsableMediaRef(fileRows.get(mediaRef.fileId), mediaRef, draftId, userId);
    return mapFileRow(fileRow, mediaRef, transcripts.get(mediaRef.fileId) ?? null);
  });

  return {
    promptDoc,
    text: promptText(promptDoc),
    media,
    openAiMediaInputs: await buildOpenAiMediaInputs(media, signReadUrl),
  };
}

export function toPersistedStoryboardPlanMediaContext(
  context: StoryboardPlanResolvedContext,
): Pick<StoryboardPlanResolvedContext, 'text' | 'media'> {
  return {
    text: context.text,
    media: context.media,
  };
}
