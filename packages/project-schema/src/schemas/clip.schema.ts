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

export const clipSchema = z.discriminatedUnion('type', [
  videoClipSchema,
  audioClipSchema,
  textOverlayClipSchema,
]);
