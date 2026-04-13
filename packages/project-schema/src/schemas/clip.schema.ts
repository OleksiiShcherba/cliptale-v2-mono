import { z } from 'zod';

export const videoClipSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('video'),
  assetId: z.string().uuid(),
  trackId: z.string().uuid(),
  startFrame: z.number().int().nonnegative(),
  durationFrames: z.number().int().positive(),
  trimInFrame: z.number().int().nonnegative().default(0),
  trimOutFrame: z.number().int().nonnegative().optional(),
  opacity: z.number().min(0).max(1).default(1),
  volume: z.number().min(0).max(1).default(1),
});

export const audioClipSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('audio'),
  assetId: z.string().uuid(),
  trackId: z.string().uuid(),
  startFrame: z.number().int().nonnegative(),
  durationFrames: z.number().int().positive(),
  trimInFrame: z.number().int().nonnegative().default(0),
  trimOutFrame: z.number().int().nonnegative().optional(),
  volume: z.number().min(0).max(1).default(1),
});

export const textOverlayClipSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('text-overlay'),
  trackId: z.string().uuid(),
  startFrame: z.number().int().nonnegative(),
  durationFrames: z.number().int().positive(),
  text: z.string(),
  fontSize: z.number().positive().default(24),
  color: z.string().default('#FFFFFF'),
  position: z.enum(['top', 'center', 'bottom']).default('bottom'),
});

/** A static image clip referencing an uploaded image asset. No trim or volume fields — images are not trimmed or silent. */
export const imageClipSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('image'),
  assetId: z.string().uuid(),
  trackId: z.string().uuid(),
  startFrame: z.number().int().nonnegative(),
  durationFrames: z.number().int().positive(),
  opacity: z.number().min(0).max(1).default(1),
});

/**
 * Caption clip — a group of spoken words with per-word timing, rendered by
 * `CaptionLayer` inside a `<Sequence from={startFrame}>`.
 *
 * **Word frame semantic:** `word.startFrame` and `word.endFrame` are
 * **absolute** frames in the composition timeline (as produced by
 * `useAddCaptionsToTimeline` from Whisper `start`/`end` seconds × fps), not
 * clip-local offsets. `CaptionLayer` reconstructs the absolute frame via its
 * `clipStartFrame` prop so `<Sequence>`-local `useCurrentFrame()` values can
 * be compared correctly. Any producer/consumer touching `word.startFrame`
 * must preserve this absolute-frame contract.
 */
export const captionClipSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('caption'),
  trackId: z.string().uuid(),
  startFrame: z.number().int().nonnegative(),
  durationFrames: z.number().int().positive(),
  words: z.array(z.object({
    word: z.string(),
    /** Absolute composition frame at which this word becomes active. See captionClipSchema JSDoc. */
    startFrame: z.number().int().nonnegative(),
    /** Absolute composition frame at which this word ends. See captionClipSchema JSDoc. */
    endFrame: z.number().int().nonnegative(),
  })),
  activeColor: z.string().default('#FFFFFF'),
  inactiveColor: z.string().default('rgba(255,255,255,0.35)'),
  fontSize: z.number().positive().default(24),
  position: z.enum(['top', 'center', 'bottom']).default('bottom'),
});

export const clipSchema = z.discriminatedUnion('type', [
  videoClipSchema,
  audioClipSchema,
  textOverlayClipSchema,
  imageClipSchema,
  captionClipSchema,
]);
