import {
  type Clip,
  type Track,
} from '@ai-video-editor/project-schema';

import { UnprocessableEntityError } from '@/lib/errors.js';
import type { ClipInsert } from '@/repositories/clip.repository.js';
import type { StoryboardMusicBlock } from '@/repositories/storyboardMusic.repository.js';

function resolveMusicFileId(block: StoryboardMusicBlock): string {
  if (block.sourceMode === 'existing') {
    if (!block.existingFileId) {
      throw new UnprocessableEntityError(`Music block ${block.name || block.id} is missing an audio file`);
    }
    return block.existingFileId;
  }
  if (block.generationStatus !== 'ready' || !block.outputFileId) {
    throw new UnprocessableEntityError(`Music block ${block.name || block.id} is not ready yet`);
  }
  return block.outputFileId;
}

function getMusicClipRange(params: {
  musicBlock: StoryboardMusicBlock;
  sceneFrameRanges: Map<string, { startFrame: number; durationFrames: number }>;
  sceneOrder: string[];
}): { startFrame: number; durationFrames: number } {
  const { musicBlock, sceneFrameRanges, sceneOrder } = params;
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

  const startRange = sceneFrameRanges.get(musicBlock.startSceneBlockId);
  const endRange = sceneFrameRanges.get(musicBlock.endSceneBlockId);
  if (!startRange || !endRange) {
    throw new UnprocessableEntityError(
      `Music block ${musicBlock.name || musicBlock.id} references a scene with no timeline range`,
    );
  }

  const endFrame = endRange.startFrame + endRange.durationFrames;
  return {
    startFrame: startRange.startFrame,
    durationFrames: endFrame - startRange.startFrame,
  };
}

export function appendStoryboardMusicClips(params: {
  musicBlocks: StoryboardMusicBlock[];
  sceneFrameRanges: Map<string, { startFrame: number; durationFrames: number }>;
  sceneOrder: string[];
  projectId: string;
  tracks: Track[];
  clips: Clip[];
  clipInserts: ClipInsert[];
  usedFileIds: string[];
  createId: () => string;
}): void {
  if (params.musicBlocks.length === 0) return;

  const audioTrackId = params.createId();
  params.tracks.push({
    id: audioTrackId,
    type: 'audio',
    name: 'Storyboard music',
    muted: false,
    locked: false,
  });

  for (const musicBlock of params.musicBlocks) {
    const fileId = resolveMusicFileId(musicBlock);
    const range = getMusicClipRange({
      musicBlock,
      sceneFrameRanges: params.sceneFrameRanges,
      sceneOrder: params.sceneOrder,
    });
    const clipId = params.createId();
    params.clips.push({
      id: clipId,
      type: 'audio',
      fileId,
      trackId: audioTrackId,
      startFrame: range.startFrame,
      durationFrames: range.durationFrames,
      trimInFrame: 0,
      volume: musicBlock.volume,
    });
    params.clipInserts.push({
      clipId,
      projectId: params.projectId,
      trackId: audioTrackId,
      type: 'audio',
      fileId,
      startFrame: range.startFrame,
      durationFrames: range.durationFrames,
      layer: 1,
    });
    params.usedFileIds.push(fileId);
  }
}
