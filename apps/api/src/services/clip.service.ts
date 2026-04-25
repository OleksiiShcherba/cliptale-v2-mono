import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors.js';
import * as clipRepository from '@/repositories/clip.repository.js';
import type { ClipRow, ClipPatch, ClipInsert } from '@/repositories/clip.repository.js';

/** Parameters for a partial clip update. */
export type PatchClipParams = {
  projectId: string;
  clipId: string;
  requestingUserId: string | null;
  /** Owning user ID of the project; used to verify access before patching. */
  projectOwnerId: string | null;
  patch: ClipPatch;
};

/** Result returned to the controller on success. */
export type PatchClipResult = ClipRow;

/** Parameters for creating a new clip row. */
export type CreateClipParams = ClipInsert;

/**
 * Inserts a new clip into project_clips_current.
 * Called after split/duplicate operations that produce new clip IDs.
 *
 * When `fileId` is provided, validates that the file is linked to the project
 * via `project_files` before inserting. Throws `ValidationError` (400) when
 * the file is not linked to the project.
 */
export async function createClip(params: CreateClipParams): Promise<void> {
  if (params.fileId != null) {
    const linked = await clipRepository.isFileLinkedToProject(params.projectId, params.fileId);
    if (!linked) {
      throw new ValidationError(
        `File "${params.fileId}" is not linked to project "${params.projectId}"`,
      );
    }
  }
  await clipRepository.insertClip(params);
}

/**
 * Applies a partial update to a clip's mutable timeline fields.
 *
 * - Throws `NotFoundError` (404) when `clipId` does not exist in `project_clips_current`.
 * - Throws `ForbiddenError` (403) when `requestingUserId` does not match `projectOwnerId`
 *   AND `NODE_ENV` is not `development` (auth bypass for local dev).
 * - Does NOT create a `project_versions` snapshot — intended for high-frequency drag/trim.
 */
export async function patchClip(params: PatchClipParams): Promise<PatchClipResult> {
  const existing = await clipRepository.getClipByIdAndProject(params.clipId, params.projectId);
  if (!existing) {
    throw new NotFoundError(`Clip "${params.clipId}" not found in project "${params.projectId}"`);
  }

  // ACL: the acl.middleware enforces project ownership at the route level.
  // This service-layer check is a defence-in-depth guard for explicit ownership
  // mismatches when ownership data is available.
  if (
    process.env.NODE_ENV !== 'development' &&
    params.projectOwnerId !== null &&
    params.requestingUserId !== null &&
    params.requestingUserId !== params.projectOwnerId
  ) {
    throw new ForbiddenError('You do not have permission to edit this project');
  }

  return clipRepository.patchClip(params.clipId, params.projectId, params.patch);
}
