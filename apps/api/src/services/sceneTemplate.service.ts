import { randomUUID } from 'node:crypto';

import * as sceneTemplateRepository from '@/repositories/sceneTemplate.repository.js';
import type { SceneTemplate, SceneTemplateUpsert } from '@/repositories/sceneTemplate.repository.js';
import * as storyboardRepository from '@/repositories/storyboard.repository.js';
import type { StoryboardBlock } from '@/repositories/storyboard.repository.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import { NotFoundError, ValidationError, ForbiddenError } from '@/lib/errors.js';

export type { SceneTemplate } from '@/repositories/sceneTemplate.repository.js';

/** Maximum number of media items per scene template (enforced at service layer). */
const MAX_MEDIA_ITEMS = 6;

/**
 * Default position offset applied to successive "add-to-storyboard" calls so
 * blocks do not stack directly on top of each other on the canvas.
 */
const ADD_TO_STORYBOARD_OFFSET = { x: 400, y: 100 };

/** Default canvas Y position for new scene blocks added from a template. */
const DEFAULT_BLOCK_Y = 300;

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Resolves a template and verifies it is owned by the requesting user.
 *
 * - Template missing or soft-deleted → NotFoundError (404)
 * - Template belongs to another user → NotFoundError (404, not 403 — avoids
 *   leaking the existence of other users' templates)
 */
async function assertTemplateOwner(
  templateId: string,
  userId: string,
): Promise<SceneTemplate> {
  const template = await sceneTemplateRepository.findTemplateById(templateId);
  if (!template || template.userId !== userId) {
    throw new NotFoundError(`Scene template ${templateId} not found`);
  }
  return template;
}

/**
 * Resolves a generation draft and verifies it is owned by the requesting user.
 *
 * - Draft missing → NotFoundError (404)
 * - Draft belongs to another user → ForbiddenError (403)
 */
async function assertDraftOwner(draftId: string, userId: string): Promise<void> {
  const draft = await generationDraftRepository.findDraftById(draftId);
  if (!draft) {
    throw new NotFoundError(`Storyboard draft ${draftId} not found`);
  }
  if (draft.userId !== userId) {
    throw new ForbiddenError(`You do not own storyboard draft ${draftId}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns all active scene templates for the authenticated user.
 */
export async function listTemplates(userId: string): Promise<SceneTemplate[]> {
  return sceneTemplateRepository.findTemplatesByUserId(userId);
}

/**
 * Returns a single scene template by id.
 * Throws 404 if the template does not exist or is not owned by the user.
 */
export async function getTemplate(userId: string, templateId: string): Promise<SceneTemplate> {
  return assertTemplateOwner(templateId, userId);
}

/**
 * Creates a new scene template.
 * Validates the media list does not exceed MAX_MEDIA_ITEMS.
 * Returns the newly created template.
 */
export async function createTemplate(
  userId: string,
  data: SceneTemplateUpsert,
): Promise<SceneTemplate> {
  if (data.mediaItems.length > MAX_MEDIA_ITEMS) {
    throw new ValidationError(
      `A scene template may have at most ${MAX_MEDIA_ITEMS} media items`,
    );
  }

  const conn = await sceneTemplateRepository.getConnection();
  let newId: string;
  try {
    await conn.beginTransaction();
    newId = await sceneTemplateRepository.insertTemplate(conn, userId, data);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const created = await sceneTemplateRepository.findTemplateById(newId);
  if (!created) {
    throw new Error(`Failed to load newly created template ${newId}`);
  }
  return created;
}

/**
 * Updates a scene template's fields and replaces its media list atomically.
 * Throws 404 if the template does not exist or is not owned by the user.
 * Throws 400 if the media list exceeds MAX_MEDIA_ITEMS.
 * Returns the updated template.
 */
export async function updateTemplate(
  userId: string,
  templateId: string,
  data: SceneTemplateUpsert,
): Promise<SceneTemplate> {
  await assertTemplateOwner(templateId, userId);

  if (data.mediaItems.length > MAX_MEDIA_ITEMS) {
    throw new ValidationError(
      `A scene template may have at most ${MAX_MEDIA_ITEMS} media items`,
    );
  }

  const conn = await sceneTemplateRepository.getConnection();
  try {
    await conn.beginTransaction();
    await sceneTemplateRepository.updateTemplate(conn, templateId, data);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const updated = await sceneTemplateRepository.findTemplateById(templateId);
  if (!updated) {
    throw new Error(`Failed to reload template ${templateId} after update`);
  }
  return updated;
}

/**
 * Soft-deletes a scene template (sets deleted_at = NOW()).
 * Throws 404 if the template does not exist or is not owned by the user.
 */
export async function deleteTemplate(userId: string, templateId: string): Promise<void> {
  const deleted = await sceneTemplateRepository.softDeleteTemplate(templateId, userId);
  if (!deleted) {
    throw new NotFoundError(`Scene template ${templateId} not found`);
  }
}

/**
 * Creates a new storyboard block from a scene template and appends it to the
 * given draft's storyboard. Also inserts corresponding storyboard_block_media
 * rows for each template media item.
 *
 * Ownership checks:
 *   - Template must be owned by userId (404 if not).
 *   - Draft must be owned by userId (404/403 if not).
 *
 * The new block is positioned at a default canvas location with a small offset
 * to prevent visual overlap when the same template is added multiple times.
 * The caller may override positionX / positionY via the optional params.
 *
 * Returns the newly created StoryboardBlock (fully hydrated).
 */
export async function addTemplateToStoryboard(
  userId: string,
  templateId: string,
  draftId: string,
  positionX?: number,
  positionY?: number,
): Promise<StoryboardBlock> {
  const [template] = await Promise.all([
    assertTemplateOwner(templateId, userId),
    assertDraftOwner(draftId, userId),
  ]);

  // Compute a canvas position. If the caller does not supply coordinates we use
  // a default that avoids stacking directly over any sentinel blocks.
  const blockX = positionX ?? ADD_TO_STORYBOARD_OFFSET.x;
  const blockY = positionY ?? DEFAULT_BLOCK_Y + ADD_TO_STORYBOARD_OFFSET.y;

  const blockId = randomUUID();

  const conn = await storyboardRepository.getConnection();
  try {
    await conn.beginTransaction();

    // Insert the new storyboard block (block_type = 'scene').
    await conn.execute(
      `INSERT INTO storyboard_blocks
         (id, draft_id, block_type, name, prompt, duration_s,
          position_x, position_y, sort_order, style)
       VALUES (?, ?, 'scene', ?, ?, ?, ?, ?, 0, ?)`,
      [
        blockId,
        draftId,
        template.name,
        template.prompt,
        template.durationS,
        blockX,
        blockY,
        template.style,
      ],
    );

    // Mirror template media to storyboard_block_media.
    for (const m of template.mediaItems) {
      await conn.execute(
        `INSERT INTO storyboard_block_media
           (id, block_id, file_id, media_type, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), blockId, m.fileId, m.mediaType, m.sortOrder],
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Re-load the block via the storyboard repository to return the canonical shape.
  const blocks = await storyboardRepository.findBlocksByDraftId(draftId);
  const newBlock = blocks.find((b) => b.id === blockId);
  if (!newBlock) {
    throw new Error(`Failed to reload block ${blockId} after add-to-storyboard`);
  }
  return newBlock;
}
