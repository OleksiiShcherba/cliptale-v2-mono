import { randomUUID } from 'node:crypto';

import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/lib/errors.js';
import * as clipRepository from '@/repositories/clip.repository.js';
import * as fileLinksRepository from '@/repositories/fileLinks.repository.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import * as projectRepository from '@/repositories/project.repository.js';
import * as storyboardRepository from '@/repositories/storyboard.repository.js';
import type { StoryboardBlock } from '@/repositories/storyboard.repository.js';
import * as referenceRepository from '@/repositories/storyboardIllustrationReference.repository.js';
import * as illustrationRepository from '@/repositories/storyboardSceneIllustration.repository.js';
import type { StoryboardSceneIllustrationJob } from '@/repositories/storyboardSceneIllustration.repository.js';
import * as versionRepository from '@/repositories/version.repository.js';
import { buildStoryboardProjectDoc } from '@/services/storyboardProjectDoc.service.js';
import { orderStoryboardSceneBlocks } from '@/services/storyboardGraph.service.js';

export type CreateProjectFromStoryboardResult = {
  projectId: string;
  versionId: number;
};

function assertReadyForProjectAssembly(params: {
  sceneBlocks: StoryboardBlock[];
  reference: referenceRepository.StoryboardIllustrationReference | null;
  illustrationJobs: StoryboardSceneIllustrationJob[];
}): void {
  if (params.sceneBlocks.length === 0) {
    throw new UnprocessableEntityError('Storyboard has no scene blocks to assemble');
  }
  if (!params.reference || params.reference.status !== 'ready' || !params.reference.outputFileId) {
    throw new UnprocessableEntityError('Principal image is not ready yet');
  }
  if (params.reference.approvalStatus !== 'approved') {
    throw new UnprocessableEntityError('Principal image must be approved before creating a project');
  }

  const latestByBlock = new Map(params.illustrationJobs.map((job) => [job.blockId, job]));
  const missing = params.sceneBlocks.find((block) => {
    const job = latestByBlock.get(block.id);
    return !job || job.status !== 'ready' || !job.outputFileId;
  });
  if (missing) {
    throw new UnprocessableEntityError(`Scene ${missing.name ?? missing.id} is not ready yet`);
  }
}

export async function createProjectFromStoryboard(
  userId: string,
  draftId: string,
): Promise<CreateProjectFromStoryboardResult> {
  const conn = await versionRepository.getConnection();
  try {
    await conn.beginTransaction();

    const draft = await generationDraftRepository.lockDraftForProjectAssembly(conn, draftId);
    if (!draft) {
      throw new NotFoundError(`Generation draft ${draftId} not found`);
    }
    if (draft.userId !== userId) {
      throw new ForbiddenError(`You do not own generation draft ${draftId}`);
    }
    if (draft.createdProjectId && draft.createdProjectVersionId !== null) {
      await conn.commit();
      return {
        projectId: draft.createdProjectId,
        versionId: draft.createdProjectVersionId,
      };
    }

    const blocks = await storyboardRepository.findBlocksByDraftIdForUpdate(conn, draftId);
    const edges = await storyboardRepository.findEdgesByDraftIdForUpdate(conn, draftId);
    const reference = await referenceRepository.findActiveReferenceByDraftIdForUpdate(conn, draftId);
    const illustrationJobs = await illustrationRepository.findLatestIllustrationJobsByDraftIdForUpdate(
      conn,
      draftId,
    );
    const sceneBlocks = orderStoryboardSceneBlocks(blocks, edges);
    assertReadyForProjectAssembly({ sceneBlocks, reference, illustrationJobs });

    const projectId = randomUUID();
    const assembly = buildStoryboardProjectDoc({
      draft,
      blocks,
      edges,
      illustrationJobs,
      projectId,
    });

    await projectRepository.createProjectTransaction(conn, projectId, userId, assembly.title);
    for (const fileId of assembly.usedFileIds) {
      await fileLinksRepository.linkFileToProjectTransaction(conn, projectId, fileId);
    }
    await clipRepository.insertClipsTransaction(conn, assembly.clipInserts);
    const version = await versionRepository.insertVersionTransaction(conn, {
      projectId,
      docJson: assembly.projectDoc,
      docSchemaVersion: assembly.projectDoc.schemaVersion,
      parentVersionId: null,
      patches: [],
      inversePatches: [],
      createdByUserId: userId,
    });
    await generationDraftRepository.markDraftProjectAssemblyComplete(conn, {
      draftId,
      projectId,
      versionId: version.versionId,
    });

    await conn.commit();
    return { projectId, versionId: version.versionId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
