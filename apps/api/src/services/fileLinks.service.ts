/**
 * Business logic for linking `files` rows to projects and generation drafts
 * via the `project_files` and `draft_files` pivot tables.
 *
 * Ownership rules enforced here:
 *   - The project must be owned by the caller.
 *   - The file must be owned by the caller.
 *   - The draft must be owned by the caller.
 *
 * Double-link is idempotent: the repository uses INSERT IGNORE, so linking
 * the same file twice returns a success result without a duplicate-key error.
 *
 * Response serialization (FileRow → AssetApiResponse) lives in
 * `fileLinks.response.service.ts` to keep this file under 300 lines.
 */
import type { FileRow } from '@/repositories/file.repository.js';
import * as fileRepository from '@/repositories/file.repository.js';
import * as fileLinksRepository from '@/repositories/fileLinks.repository.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import * as projectRepository from '@/repositories/project.repository.js';
import { ForbiddenError, NotFoundError } from '@/lib/errors.js';

// ── Link operations ────────────────────────────────────────────────────────────

/** Result of a link operation — tells callers whether the link was newly created. */
export type LinkResult = {
  /** True when the pivot row was freshly inserted; false when it already existed. */
  created: boolean;
};

/**
 * Links a file to a project, enforcing that both the project and the file
 * are owned by `userId`.
 *
 * Throws:
 *   - NotFoundError (404) when the project does not exist.
 *   - ForbiddenError (403) when the project belongs to a different user.
 *   - NotFoundError (404) when the file does not exist.
 *   - ForbiddenError (403) when the file belongs to a different user.
 *
 * Double-link is idempotent — linking the same (project, file) pair twice
 * does not throw a duplicate error.
 */
export async function linkFileToProject(
  userId: string,
  projectId: string,
  fileId: string,
): Promise<LinkResult> {
  await assertProjectOwnership(userId, projectId);
  await assertFileOwnership(userId, fileId);

  const created = await fileLinksRepository.linkFileToProject(projectId, fileId);
  return { created };
}

/**
 * Links a file to a generation draft, enforcing that both the draft and the
 * file are owned by `userId`.
 *
 * Throws:
 *   - NotFoundError (404) when the draft does not exist.
 *   - ForbiddenError (403) when the draft belongs to a different user.
 *   - NotFoundError (404) when the file does not exist.
 *   - ForbiddenError (403) when the file belongs to a different user.
 *
 * Double-link is idempotent.
 */
export async function linkFileToDraft(
  userId: string,
  draftId: string,
  fileId: string,
): Promise<LinkResult> {
  await assertDraftOwnership(userId, draftId);
  await assertFileOwnership(userId, fileId);

  const created = await fileLinksRepository.linkFileToDraft(draftId, fileId);
  return { created };
}

// ── Read operations ───────────────────────────────────────────────────────────

/**
 * Returns all files linked to a project via the `project_files` pivot table.
 * No ownership check — the caller (controller) is already authenticated; the
 * route requires `authMiddleware`. The returned files are not filtered by status,
 * preserving the same behavior as the previous `project_assets_current` read.
 */
export async function getFilesForProject(projectId: string): Promise<FileRow[]> {
  return fileLinksRepository.findFilesByProjectId(projectId);
}

/**
 * Returns all files linked to a generation draft via the `draft_files` pivot table.
 * No ownership check — caller must authenticate before reaching the controller.
 */
export async function getFilesForDraft(draftId: string): Promise<FileRow[]> {
  return fileLinksRepository.findFilesByDraftId(draftId);
}

/**
 * Returns ALL non-deleted files owned by `userId`, regardless of project/draft linkage.
 * Used for the `scope=all` path on both `GET /projects/:id/assets` and
 * `GET /generation-drafts/:id/assets`.
 */
export async function getFilesForUser(userId: string): Promise<FileRow[]> {
  return fileRepository.findAllForUser(userId);
}

// ── Ownership helpers (private) ───────────────────────────────────────────────

/**
 * Fetches the project and verifies ownership.
 * - Row missing → NotFoundError (404)
 * - Row owned by another user → ForbiddenError (403)
 */
async function assertProjectOwnership(userId: string, projectId: string): Promise<void> {
  const project = await projectRepository.findProjectById(projectId);
  if (!project) {
    throw new NotFoundError(`Project ${projectId} not found`);
  }
  if (project.ownerUserId !== userId) {
    throw new ForbiddenError(`You do not own project ${projectId}`);
  }
}

/**
 * Fetches the generation draft and verifies ownership.
 * - Row missing → NotFoundError (404)
 * - Row owned by another user → ForbiddenError (403)
 */
async function assertDraftOwnership(userId: string, draftId: string): Promise<void> {
  const draft = await generationDraftRepository.findDraftById(draftId);
  if (!draft) {
    throw new NotFoundError(`Generation draft ${draftId} not found`);
  }
  if (draft.userId !== userId) {
    throw new ForbiddenError(`You do not own generation draft ${draftId}`);
  }
}

/**
 * Fetches the file and verifies ownership.
 * - Row missing → NotFoundError (404)
 * - Row owned by another user → ForbiddenError (403)
 */
async function assertFileOwnership(userId: string, fileId: string): Promise<void> {
  const file = await fileRepository.findById(fileId);
  if (!file) {
    throw new NotFoundError(`File ${fileId} not found`);
  }
  if (file.userId !== userId) {
    throw new ForbiddenError(`You do not own file ${fileId}`);
  }
}
