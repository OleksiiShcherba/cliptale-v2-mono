import type {
  StoryboardMusicBlock,
  StoryboardMusicBlockSaveInput,
} from '@/features/storyboard/types';

export type StoryboardMusicBlockSaveCandidate =
  | StoryboardMusicBlock
  | StoryboardMusicBlockSaveInput;

export function toStoryboardMusicBlockSaveInput(
  block: StoryboardMusicBlockSaveCandidate,
): StoryboardMusicBlockSaveInput {
  return {
    id: block.id,
    draftId: block.draftId,
    name: block.name,
    sourceMode: block.sourceMode,
    prompt: block.prompt,
    compositionPlan: block.compositionPlan,
    existingFileId: block.existingFileId,
    startSceneBlockId: block.startSceneBlockId,
    endSceneBlockId: block.endSceneBlockId,
    positionX: block.positionX,
    positionY: block.positionY,
    sortOrder: block.sortOrder,
    volume: block.volume,
    fadeInS: block.fadeInS,
    fadeOutS: block.fadeOutS,
    loopMode: block.loopMode,
  };
}

export function toStoryboardMusicBlockSaveInputs(
  blocks: readonly StoryboardMusicBlockSaveCandidate[] | undefined,
): StoryboardMusicBlockSaveInput[] | undefined {
  return blocks?.map(toStoryboardMusicBlockSaveInput);
}
