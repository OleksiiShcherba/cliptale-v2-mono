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

/**
 * The full prompt document produced by the PromptEditor component.
 * Mirrors the block-document shape used by `projectDocSchema`.
 */
export const promptDocSchema = z.object({
  schemaVersion: z.literal(1),
  blocks: z.array(promptBlockSchema),
});

export type PromptBlock = z.infer<typeof promptBlockSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type MediaRefBlock = z.infer<typeof mediaRefBlockSchema>;
export type PromptDoc = z.infer<typeof promptDocSchema>;
