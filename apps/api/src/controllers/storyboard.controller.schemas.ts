/**
 * Zod validation schemas for the storyboard controller.
 *
 * Extracted to keep storyboard.controller.ts under the §9.7 300-line cap.
 */

import { z } from 'zod';
import { storyboardMusicBlockSchema } from '@ai-video-editor/project-schema';

/**
 * A single media attachment within a block (used in PUT body).
 *
 * image/video/audio rows require a fileId. A motion_graphic row instead carries
 * a frozen snapshot (file_id is NULL, motion_graphic_snapshot_id holds the FK —
 * ADR-0009). The refine below enforces that exclusivity so an autosave round-trip
 * preserves an attached graphic instead of dropping or 400-ing it (AC-04/US-07).
 */
const blockMediaItemSchema = z
  .object({
    id: z.string().uuid(),
    fileId: z.string().uuid().nullable().optional(),
    mediaType: z.enum(['image', 'video', 'audio', 'motion_graphic']),
    sortOrder: z.number().int().min(0),
    /** Frozen snapshot id for motion_graphic rows (nested object accepted too). */
    motionGraphicSnapshotId: z.string().uuid().optional(),
    motionGraphic: z
      .object({ snapshotId: z.string().uuid() })
      .passthrough()
      .optional(),
  })
  .transform((m) => ({
    ...m,
    // Normalise the snapshot id from either the flat field or the nested object.
    motionGraphicSnapshotId:
      m.motionGraphicSnapshotId ?? m.motionGraphic?.snapshotId,
    fileId: m.fileId ?? null,
  }))
  .refine(
    (m) =>
      m.mediaType === 'motion_graphic'
        ? Boolean(m.motionGraphicSnapshotId)
        : Boolean(m.fileId),
    {
      message:
        'image/video/audio require fileId; motion_graphic requires a snapshot id',
    },
  );

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

/**
 * POST /storyboards/:draftId/history body schema (OpenAPI CheckpointPush).
 *
 * previewKind is REQUIRED (storyboard-autosave-checkpoints, AC-04): the client
 * declares whether the snapshot carries an inline layout screenshot data-URL
 * ('screenshot') or fell back to the SVG minimap after a capture failure /
 * 5 s timeout ('minimap'). The server stamps origin='checkpoint' itself
 * (ADR-0003) — origin is deliberately NOT a request field.
 */
export const pushHistoryBodySchema = z.object({
  snapshot: z.unknown().refine((v) => v !== undefined, {
    message: 'snapshot is required and must be a valid JSON value',
  }),
  previewKind: z.enum(['screenshot', 'minimap']),
});
