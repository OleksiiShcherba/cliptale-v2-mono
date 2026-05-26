/**
 * Zod validation schemas for the storyboard controller.
 *
 * Extracted to keep storyboard.controller.ts under the §9.7 300-line cap.
 */

import { z } from 'zod';
import { storyboardMusicBlockSchema } from '@ai-video-editor/project-schema';

/** A single media attachment within a block (used in PUT body). */
const blockMediaItemSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
  mediaType: z.enum(['image', 'video', 'audio']),
  sortOrder: z.number().int().min(0),
});

/** A single storyboard block in the PUT body. */
export const blockInsertSchema = z.object({
  id: z.string().uuid(),
  draftId: z.string().uuid(),
  blockType: z.enum(['start', 'end', 'scene']),
  name: z.string().max(255).nullable(),
  prompt: z.string().nullable(),
  videoPrompt: z.string().nullable().optional().default(null),
  durationS: z.number().int().min(1).default(5),
  positionX: z.number(),
  positionY: z.number(),
  sortOrder: z.number().int().min(0),
  style: z.string().max(64).nullable(),
  mediaItems: z.array(blockMediaItemSchema).optional(),
});

/** A single storyboard edge in the PUT body. */
export const edgeInsertSchema = z.object({
  id: z.string().uuid(),
  draftId: z.string().uuid(),
  sourceBlockId: z.string().uuid(),
  targetBlockId: z.string().uuid(),
});

/** A storyboard background music block in the PUT body. */
export const musicBlockInsertSchema = storyboardMusicBlockSchema.pick({
  id: true,
  draftId: true,
  name: true,
  sourceMode: true,
  prompt: true,
  compositionPlan: true,
  existingFileId: true,
  startSceneBlockId: true,
  endSceneBlockId: true,
  positionX: true,
  positionY: true,
  sortOrder: true,
  volume: true,
  fadeInS: true,
  fadeOutS: true,
  loopMode: true,
});

/** PUT /storyboards/:draftId body schema. */
export const saveStoryboardBodySchema = z.object({
  blocks: z.array(blockInsertSchema),
  edges: z.array(edgeInsertSchema),
  musicBlocks: z.array(musicBlockInsertSchema).optional(),
});

/** POST /storyboards/:draftId/history body schema. */
export const pushHistoryBodySchema = z.object({
  snapshot: z.unknown(),
});
