import { randomUUID } from 'node:crypto';

import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/lib/errors.js';
import * as clipRepository from '@/repositories/clip.repository.js';
import * as fileLinksRepository from '@/repositories/fileLinks.repository.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import * as projectRepository from '@/repositories/project.repository.js';
import * as storyboardRepository from '@/repositories/storyboard.repository.js';
import type { StoryboardBlock } from '@/repositories/storyboard.repository.js';
import * as referenceRepository from '@/repositories/storyboardIllustrationReference.repository.js';
import * as musicRepository from '@/repositories/storyboardMusic.repository.js';
import type { StoryboardMusicBlock } from '@/repositories/storyboardMusic.repository.js';
import * as illustrationRepository from '@/repositories/storyboardSceneIllustration.repository.js';
import type { StoryboardSceneIllustrationJob } from '@/repositories/storyboardSceneIllustration.repository.js';
import * as videoRepository from '@/repositories/storyboardSceneVideo.repository.js';
import type { StoryboardSceneVideoJob } from '@/repositories/storyboardSceneVideo.repository.js';
import * as versionRepository from '@/repositories/version.repository.js';
import { buildStoryboardProjectDoc } from '@/services/storyboardProjectDoc.service.js';
import { orderStoryboardSceneBlocks } from '@/services/storyboardGraph.service.js';

export type CreateProjectFromStoryboardResult = {
  projectId: string;
  versionId: number;
};

export type StoryboardProjectAssemblyMode = 'images' | 'videos';

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

function assertReadyForVideoProjectAssembly(params: {
  sceneBlocks: StoryboardBlock[];
  videoJobs: StoryboardSceneVideoJob[];
}): void {
  if (params.sceneBlocks.length === 0) {
    throw new UnprocessableEntityError('Storyboard has no scene blocks to assemble');
  }

  const latestByBlock = new Map(params.videoJobs.map((job) => [job.blockId, job]));
  const missing = params.sceneBlocks.find((block) => {
    const job = latestByBlock.get(block.id);
    return !job || job.status !== 'ready' || !job.outputFileId;
  });
  if (missing) {
    throw new UnprocessableEntityError(`Scene ${missing.name ?? missing.id} is missing a ready generated video`);
  }
}

function assertReadyForMusicProjectAssembly(params: {
  sceneBlocks: StoryboardBlock[];
  musicBlocks: StoryboardMusicBlock[];
}): void {
  const sceneOrder = params.sceneBlocks.map((block) => block.id);
  for (const musicBlock of params.musicBlocks) {
    const startIndex = sceneOrder.indexOf(musicBlock.startSceneBlockId);
    const endIndex = sceneOrder.indexOf(musicBlock.endSceneBlockId);
    if (startIndex < 0 || endIndex < 0) {
      throw new UnprocessableEntityError(
        `Music block ${musicBlock.name || musicBlock.id} references a scene that is no longer in the storyboard`,
      );
    }
    if (startIndex > endIndex) {
      throw new UnprocessableEntityError(
        `Music block ${musicBlock.name || musicBlock.id} has an invalid scene range`,
      );
    }
    if (musicBlock.sourceMode === 'existing') {
      if (!musicBlock.existingFileId) {
        throw new UnprocessableEntityError(`Music block ${musicBlock.name || musicBlock.id} is missing an audio file`);
      }
      continue;
    }
    if (musicBlock.generationStatus !== 'ready' || !musicBlock.outputFileId) {
      throw new UnprocessableEntityError(`Music block ${musicBlock.name || musicBlock.id} is not ready yet`);
    }
  }
}

export async function createProjectFromStoryboard(
  userId: string,
  draftId: string,
  mode: StoryboardProjectAssemblyMode = 'images',
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
    const musicBlocks = await musicRepository.findMusicBlocksByDraftIdForUpdate(conn, draftId);
    const reference = await referenceRepository.findActiveReferenceByDraftIdForUpdate(conn, draftId);
    const illustrationJobs = await illustrationRepository.findLatestIllustrationJobsByDraftIdForUpdate(
      conn,
      draftId,
    );
    const videoJobs = mode === 'videos'
      ? await videoRepository.findLatestVideoJobsByDraftIdForUpdate(conn, draftId)
      : [];
    const sceneBlocks = orderStoryboardSceneBlocks(blocks, edges);
    if (mode === 'videos') {
      assertReadyForVideoProjectAssembly({ sceneBlocks, videoJobs });
    } else {
      assertReadyForProjectAssembly({ sceneBlocks, reference, illustrationJobs });
    }
    assertReadyForMusicProjectAssembly({ sceneBlocks, musicBlocks });

    const projectId = randomUUID();
    const assembly = buildStoryboardProjectDoc({
      draft,
      blocks,
      edges,
      mode,
      illustrationJobs,
      videoJobs,
      musicBlocks,
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
