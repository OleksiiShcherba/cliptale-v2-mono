import { OptimisticLockError, NotFoundError, UnprocessableEntityError } from '@/lib/errors.js';
import * as versionRepository from '@/repositories/version.repository.js';
import type { InsertVersionResult, ProjectVersionSummary } from '@/repositories/version.repository.js';

/** The only doc_schema_version value accepted by this service. */
const SUPPORTED_DOC_SCHEMA_VERSION = 1;

/** Parameters for persisting a new project version. */
export type SaveVersionParams = {
  projectId: string;
  docJson: unknown;
  docSchemaVersion: number;
  parentVersionId: number | null;
  patches: unknown;
  inversePatches: unknown;
  createdByUserId: string | null;
};

/**
 * Validates `doc_schema_version`, enforces the optimistic lock, and atomically
 * persists a new version snapshot with its Immer patch pair.
 *
 * - Throws `ValidationError` (422) when `doc_schema_version` is not supported.
 * - Throws `OptimisticLockError` (409) when `parentVersionId` does not match
 *   the project's current `latest_version_id`.
 * - When `parentVersionId` is null this is treated as the first save for the
 *   project; the optimistic lock check is skipped.
 *
 * Returns `{ versionId, createdAt }` on success.
 */
export async function saveVersion(
  params: SaveVersionParams,
): Promise<InsertVersionResult> {
  if (params.docSchemaVersion !== SUPPORTED_DOC_SCHEMA_VERSION) {
    throw new UnprocessableEntityError(
      `Unsupported doc_schema_version: ${params.docSchemaVersion}. ` +
        `Expected ${SUPPORTED_DOC_SCHEMA_VERSION}.`,
    );
  }

  const currentVersionId = await versionRepository.getLatestVersionId(params.projectId);

  // Optimistic lock check: skip only when this is the very first save (both
  // currentVersionId and parentVersionId must be null to skip).
  if (params.parentVersionId !== null || currentVersionId !== null) {
    if (currentVersionId !== params.parentVersionId) {
      throw new OptimisticLockError(
        `Version conflict: expected parent ${params.parentVersionId} but project is at ${currentVersionId}`,
      );
    }
  }

  const conn = await versionRepository.getConnection();
  try {
    await conn.beginTransaction();

    const result = await versionRepository.insertVersionTransaction(conn, {
      projectId: params.projectId,
      docJson: params.docJson,
      docSchemaVersion: params.docSchemaVersion,
      parentVersionId: params.parentVersionId,
      patches: params.patches,
      inversePatches: params.inversePatches,
      createdByUserId: params.createdByUserId,
    });

    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Returns the full version record (including doc_json) for a given version.
 * Throws `NotFoundError` when the version does not exist within the project.
 */
export async function getVersionDoc(
  projectId: string,
  versionId: number,
): Promise<unknown> {
  const version = await versionRepository.getVersionById(projectId, versionId);
  if (!version) {
    throw new NotFoundError(`Version ${versionId} not found for project "${projectId}"`);
  }
  return version.docJson;
}

/**
 * Returns the last 50 version summaries for a project, newest first.
 * Each entry includes versionId, createdAt, createdByUserId, and durationFrames.
 */
export async function listVersions(projectId: string): Promise<ProjectVersionSummary[]> {
  return versionRepository.listVersions(projectId);
}

/** Parameters for restoring a project to a prior version. */
export type RestoreVersionParams = {
  projectId: string;
  versionId: number;
  restoredByUserId: string | null;
};

/**
 * Restores a project to a prior version atomically:
 * - Updates `projects.latest_version_id` to the target version.
 * - Writes a `project.restore` audit log entry.
 * - Returns the full `doc_json` of the restored version.
 *
 * Throws `NotFoundError` (404) when the versionId does not belong to the project.
 */
export async function restoreVersion(params: RestoreVersionParams): Promise<unknown> {
  const version = await versionRepository.getVersionById(params.projectId, params.versionId);
  if (!version) {
    throw new NotFoundError(
      `Version ${params.versionId} not found for project "${params.projectId}"`,
    );
  }

  const conn = await versionRepository.getConnection();
  try {
    await conn.beginTransaction();
    await versionRepository.restoreVersionTransaction(conn, {
      projectId: params.projectId,
      versionId: params.versionId,
      restoredByUserId: params.restoredByUserId,
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return version.docJson;
}
