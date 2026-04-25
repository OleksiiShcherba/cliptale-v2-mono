/**
 * Capability-aware parser for fal.ai output payloads.
 *
 * fal.ai model outputs vary by category: image models return `{ images: [...] }`,
 * video models return `{ video: {...} }`. This module folds those shapes into a
 * single `ParsedFalOutput` record the worker can act on, and throws descriptive
 * errors when the expected URL field is missing so the job fails loudly.
 *
 * `AiCapability` is the full DB ENUM (mirrors migration 015). `FalCapability` is
 * the fal-only subset accepted by `parseFalOutput`. Callers that handle all
 * providers must branch on provider before calling `parseFalOutput`.
 */

/** fal.ai capabilities only — accepted by `parseFalOutput`. */
export type FalCapability =
  | 'text_to_image'
  | 'image_edit'
  | 'text_to_video'
  | 'image_to_video';

/** ElevenLabs audio capabilities — handled by the audio handler branch. */
export type AudioCapability =
  | 'text_to_speech'
  | 'voice_cloning'
  | 'speech_to_speech'
  | 'music_generation';

/**
 * Full capability union — mirrors the `capability` ENUM in migration 015 and the
 * API-side `AiCapability` in `aiGenerationJob.repository.ts`. Used for the job
 * payload type so the queue accepts both fal and ElevenLabs jobs.
 */
export type AiCapability = FalCapability | AudioCapability;

/** Normalized fal.ai output shape — both image and video capabilities resolve to this. */
export type ParsedFalOutput = {
  remoteUrl: string;
  extension: string;
  contentType: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

const KNOWN_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);
const KNOWN_VIDEO_EXTENSIONS = new Set(['mp4', 'webm']);

/**
 * Parses a fal.ai response payload into a normalized record. Branches on
 * `capability` (NEVER on `modelId`) so any model within a capability resolves
 * the same way. Only accepts fal capabilities — callers must guard against
 * audio capabilities before calling this function.
 */
export function parseFalOutput(
  capability: FalCapability,
  output: unknown,
): ParsedFalOutput {
  if (output === null || typeof output !== 'object') {
    throw new Error(
      `fal.ai output for capability ${capability} was not an object: ${truncate(output)}`,
    );
  }
  const o = output as Record<string, unknown>;

  if (capability === 'text_to_image' || capability === 'image_edit') {
    return parseImageOutput(capability, o);
  }

  if (capability === 'text_to_video' || capability === 'image_to_video') {
    return parseVideoOutput(capability, o);
  }

  throw new Error(`Unsupported capability: ${capability as string}`);
}

function parseImageOutput(
  capability: FalCapability,
  output: Record<string, unknown>,
): ParsedFalOutput {
  // Primary shape: `{ images: [{ url, width, height }] }` (nano-banana-2, etc.).
  // Fallback shape: `{ image: { url, width, height } }` (a few older endpoints).
  let image: Record<string, unknown> | null = null;
  if (
    Array.isArray(output.images) &&
    output.images.length > 0 &&
    typeof output.images[0] === 'object' &&
    output.images[0] !== null
  ) {
    image = output.images[0] as Record<string, unknown>;
  } else if (output.image && typeof output.image === 'object') {
    image = output.image as Record<string, unknown>;
  }

  if (!image || typeof image.url !== 'string' || image.url.length === 0) {
    throw new Error(
      `fal.ai output for capability ${capability} did not contain an image URL: ${truncate(output)}`,
    );
  }

  const extension = detectExtension(image.url, 'image');
  return {
    remoteUrl: image.url,
    extension,
    contentType: contentTypeFromExtension(extension, 'image'),
    width: typeof image.width === 'number' ? image.width : null,
    height: typeof image.height === 'number' ? image.height : null,
    durationSeconds: null,
  };
}

function parseVideoOutput(
  capability: FalCapability,
  output: Record<string, unknown>,
): ParsedFalOutput {
  // Primary shape: `{ video: { url, width?, height?, duration? } }` —
  // kling, pixverse, and every other fal video endpoint we target.
  const video = output.video;
  if (!video || typeof video !== 'object') {
    throw new Error(
      `fal.ai output for capability ${capability} did not contain a video URL: ${truncate(output)}`,
    );
  }
  const v = video as Record<string, unknown>;
  if (typeof v.url !== 'string' || v.url.length === 0) {
    throw new Error(
      `fal.ai output for capability ${capability} did not contain a video URL: ${truncate(output)}`,
    );
  }

  const extension = detectExtension(v.url, 'video');
  return {
    remoteUrl: v.url,
    extension,
    contentType: contentTypeFromExtension(extension, 'video'),
    width: typeof v.width === 'number' ? v.width : null,
    height: typeof v.height === 'number' ? v.height : null,
    durationSeconds: typeof v.duration === 'number' ? v.duration : null,
  };
}

/**
 * Extracts a known extension from the remote URL, falling back to `png` for
 * image capabilities and `mp4` for video capabilities when the URL has no
 * recognizable suffix.
 */
export function detectExtension(url: string, kind: 'image' | 'video'): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase() ?? '';
    if (kind === 'image' && KNOWN_IMAGE_EXTENSIONS.has(ext)) return ext;
    if (kind === 'video' && KNOWN_VIDEO_EXTENSIONS.has(ext)) return ext;
  } catch {
    // Malformed URL — fall through to the default.
  }
  return kind === 'image' ? 'png' : 'mp4';
}

/** Maps a known extension to its MIME type. Unknown values fall back to the default for the kind. */
export function contentTypeFromExtension(
  ext: string,
  kind: 'image' | 'video',
): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    default:
      return kind === 'image' ? 'image/png' : 'video/mp4';
  }
}

function truncate(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 200);
  } catch {
    return String(value).slice(0, 200);
  }
}
