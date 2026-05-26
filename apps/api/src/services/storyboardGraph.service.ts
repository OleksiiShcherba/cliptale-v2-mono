import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';

type OrderableStoryboardBlock = Pick<StoryboardBlock, 'id' | 'blockType' | 'sortOrder'>;
type OrderableStoryboardEdge = Pick<StoryboardEdge, 'sourceBlockId' | 'targetBlockId'>;

/**
 * Returns scene blocks in the same semantic order used for illustration:
 * START -> scene... -> END when the graph is complete, otherwise sortOrder.
 */
export function orderStoryboardSceneBlocks<TBlock extends OrderableStoryboardBlock>(
  blocks: TBlock[],
  edges: OrderableStoryboardEdge[],
): TBlock[] {
  const sceneBlocks = blocks
    .filter((block) => block.blockType === 'scene')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const start = blocks.find((block) => block.blockType === 'start');
  if (!start || sceneBlocks.length === 0) {
    return sceneBlocks;
  }

  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const outgoingBySource = new Map<string, OrderableStoryboardEdge[]>();
  for (const edge of edges) {
    const outgoing = outgoingBySource.get(edge.sourceBlockId) ?? [];
    outgoing.push(edge);
    outgoingBySource.set(edge.sourceBlockId, outgoing);
  }

  const ordered: TBlock[] = [];
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
