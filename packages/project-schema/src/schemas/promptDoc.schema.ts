import { z } from 'zod';

/**
 * A plain text run inside a prompt document.
 */
const textBlockSchema = z.object({
  type: z.literal('text'),
  value: z.string(),
});

/**
 * A non-editable media reference chip inside a prompt document.
 * References an uploaded asset by UUID so the generation backend can
 * resolve the actual media file.
 */
const mediaRefBlockSchema = z.object({
  type: z.literal('media-ref'),
  mediaType: z.enum(['video', 'image', 'audio']),
  fileId: z.string().uuid(),
  label: z.string(),
});

/**
 * A single block inside a PromptDoc — either a text run or a media-ref chip.
 * Uses discriminatedUnion on `type` so unknown block types are rejected with
 * a clear Zod error.
 */
export const promptBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  mediaRefBlockSchema,
]);

export const draftVideoLengthSecondsSchema = z.number().int().min(1).max(600);

export const draftAspectRatioSchema = z.enum(['16:9', '9:16', '1:1']);

export const draftStyleKeySchema = z.enum(['cinematic', 'documentary', 'social', 'product', 'minimal']);

export const draftSettingsSchema = z.object({
  videoLengthSeconds: draftVideoLengthSecondsSchema,
  aspectRatio: draftAspectRatioSchema,
  styleKey: draftStyleKeySchema,
  modelPreference: z.string().nullable().optional(),
});

/**
 * The full prompt document produced by the PromptEditor component.
 * Mirrors the block-document shape used by `projectDocSchema`.
 */
export const promptDocSchema = z.object({
  schemaVersion: z.literal(1),
  blocks: z.array(promptBlockSchema),
  settings: draftSettingsSchema.optional(),
});

export type PromptBlock = z.infer<typeof promptBlockSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type MediaRefBlock = z.infer<typeof mediaRefBlockSchema>;
export type DraftVideoLengthSeconds = z.infer<typeof draftVideoLengthSecondsSchema>;
export type DraftAspectRatio = z.infer<typeof draftAspectRatioSchema>;
export type DraftStyleKey = z.infer<typeof draftStyleKeySchema>;
export type DraftSettings = z.infer<typeof draftSettingsSchema>;
export type PromptDoc = z.infer<typeof promptDocSchema>;
