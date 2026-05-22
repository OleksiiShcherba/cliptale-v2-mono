import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';

/**
 * Returns scene blocks in the same semantic order used for illustration:
 * START -> scene... -> END when the graph is complete, otherwise sortOrder.
 */
export function orderStoryboardSceneBlocks(
  blocks: StoryboardBlock[],
  edges: StoryboardEdge[],
): StoryboardBlock[] {
  const sceneBlocks = blocks
    .filter((block) => block.blockType === 'scene')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const start = blocks.find((block) => block.blockType === 'start');
  if (!start || sceneBlocks.length === 0) {
    return sceneBlocks;
  }

  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const outgoingBySource = new Map<string, StoryboardEdge[]>();
  for (const edge of edges) {
    const outgoing = outgoingBySource.get(edge.sourceBlockId) ?? [];
    outgoing.push(edge);
    outgoingBySource.set(edge.sourceBlockId, outgoing);
  }

  const ordered: StoryboardBlock[] = [];
  const visited = new Set<string>();
  let currentId = start.id;
  let reachedEnd = false;

  while (!visited.has(currentId)) {
    visited.add(currentId);
    const outgoing = outgoingBySource.get(currentId);
    if (!outgoing || outgoing.length !== 1) {
      break;
    }
    const next = blockById.get(outgoing[0]!.targetBlockId);
    if (!next) {
      break;
    }
    if (next.blockType === 'end') {
      reachedEnd = true;
      break;
    }
    if (next.blockType === 'scene') {
      ordered.push(next);
    }
    currentId = next.id;
  }

  return reachedEnd && ordered.length === sceneBlocks.length ? ordered : sceneBlocks;
}
