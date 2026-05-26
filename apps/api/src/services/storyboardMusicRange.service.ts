import type { BlockInsert, EdgeInsert } from '@/repositories/storyboard.repository.js';
import type { StoryboardMusicBlockInsert } from '@/repositories/storyboardMusic.repository.js';
import { ValidationError } from '@/lib/errors.js';
import { orderStoryboardSceneBlocks } from '@/services/storyboardGraph.service.js';

export function validateMusicBlockRanges(
  draftId: string,
  blocks: BlockInsert[],
  edges: EdgeInsert[],
  musicBlocks: StoryboardMusicBlockInsert[],
): void {
  const draftBlocks = blocks.filter((block) => block.draftId === draftId);
  const draftEdges = edges.filter((edge) => edge.draftId === draftId);
  const sceneBlockIds = new Set(
    draftBlocks
      .filter((block) => block.blockType === 'scene')
      .map((block) => block.id),
  );
  const orderedSceneIds = orderStoryboardSceneBlocks(draftBlocks, draftEdges)
    .map((block) => block.id);
  const orderedSceneIndex = new Map(
    orderedSceneIds.map((sceneId, index) => [sceneId, index]),
  );
  for (const musicBlock of musicBlocks) {
    if (musicBlock.draftId !== draftId) {
      throw new ValidationError(`Music block ${musicBlock.id} does not belong to this draft`);
    }
    if (!sceneBlockIds.has(musicBlock.startSceneBlockId)) {
      throw new ValidationError(`Music block ${musicBlock.id} references a missing start scene`);
    }
    if (!sceneBlockIds.has(musicBlock.endSceneBlockId)) {
      throw new ValidationError(`Music block ${musicBlock.id} references a missing end scene`);
    }
    const startIndex = orderedSceneIndex.get(musicBlock.startSceneBlockId);
    const endIndex = orderedSceneIndex.get(musicBlock.endSceneBlockId);
    if (startIndex === undefined || endIndex === undefined) {
      throw new ValidationError(`Music block ${musicBlock.id} references a scene outside storyboard order`);
    }
    if (startIndex > endIndex) {
      throw new ValidationError('Music range start scene must not come after end scene');
    }
  }
}
