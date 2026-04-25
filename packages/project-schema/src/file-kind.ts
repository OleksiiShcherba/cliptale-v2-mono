/** Broad media kind stored in the `files.kind` column. */
export type FileKind = 'video' | 'audio' | 'image' | 'document' | 'other';

/**
 * Derives the coarse `kind` from a MIME type.
 *
 * This is the single source of truth shared by `apps/api` and `apps/media-worker`.
 * Both apps depend on `@ai-video-editor/project-schema` via `workspace:*`.
 */
export function mimeToKind(mime: string | null | undefined): FileKind {
  if (!mime) return 'other';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('text/') || mime === 'application/x-subrip') return 'document';
  return 'other';
}
