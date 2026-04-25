/**
 * Trash service — aggregates soft-deleted items owned by a user.
 *
 * Powers GET /trash?type=file|project|draft&limit=<n>&cursor=<cursor>.
 * Each entry in the result conforms to the TrashItem shape consumed by the FE.
 *
 * Cursor format: `<ISO8601-deleted-at>:<id>`  (keyset pagination on deleted_at + id)
 */
import * as fileRepository from '@/repositories/file.repository.trash.js';
import * as projectRepository from '@/repositories/project.repository.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.trash.js';
import { ValidationError } from '@/lib/errors.js';

/** The type discriminant accepted by GET /trash. */
export type TrashItemType = 'file' | 'project' | 'draft';

/** Single item returned by listTrash. */
export type TrashItem = {
  id: string;
  type: TrashItemType;
  /** Human-readable label — display name, project title, or draft text preview. */
  name: string;
  deletedAt: Date;
};

/** Response shape for GET /trash. */
export type TrashListResult = {
  items: TrashItem[];
  /** Keyset cursor for the next page — `<ISO8601-deleted-at>:<id>` of the last returned item. */
  nextCursor?: string;
};

const MAX_LIMIT = 50;

/**
 * Builds a keyset cursor string from an item's deletedAt + id.
 * Format: `<ISO8601-deleted-at>:<id>`
 */
function buildCursor(deletedAt: Date, id: string): string {
  return `${deletedAt.toISOString()}:${id}`;
}

/**
 * Returns soft-deleted items owned by `userId`, filtered by `type`.
 * Requests one extra row to detect whether a next page exists (for cursor).
 * When `cursor` is provided, skips items at or before the cursor position.
 *
 * @throws ValidationError when `type` is not one of 'file' | 'project' | 'draft'.
 */
export async function listTrash(
  userId: string,
  type: string,
  limit: number,
  cursor?: string,
): Promise<TrashListResult> {
  const resolvedLimit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(Number(limit))));
  // Fetch one extra to determine whether there is a next page.
  const fetchLimit = resolvedLimit + 1;

  let rawItems: TrashItem[];

  if (type === 'file') {
    const rows = await fileRepository.listSoftDeletedByUser(userId, fetchLimit, cursor);
    rawItems = rows.map((r) => ({
      id: r.fileId,
      type: 'file' as const,
      name: r.displayName ?? r.fileId,
      deletedAt: r.deletedAt,
    }));
  } else if (type === 'project') {
    const rows = await projectRepository.listSoftDeletedByUser(userId, fetchLimit, cursor);
    rawItems = rows.map((r) => ({
      id: r.projectId,
      type: 'project' as const,
      name: r.title,
      deletedAt: r.deletedAt,
    }));
  } else if (type === 'draft') {
    const rows = await generationDraftRepository.listSoftDeletedByUser(userId, fetchLimit, cursor);
    rawItems = rows.map((r) => ({
      id: r.id,
      type: 'draft' as const,
      name: r.textPreview,
      deletedAt: r.deletedAt,
    }));
  } else {
    throw new ValidationError(
      `Invalid type "${type}". Must be one of: file, project, draft`,
    );
  }

  const hasNextPage = rawItems.length > resolvedLimit;
  const items = hasNextPage ? rawItems.slice(0, resolvedLimit) : rawItems;

  const result: TrashListResult = { items };
  if (hasNextPage && items.length > 0) {
    const last = items[items.length - 1]!;
    result.nextCursor = buildCursor(last.deletedAt, last.id);
  }

  return result;
}
