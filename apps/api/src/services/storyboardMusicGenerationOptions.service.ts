import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';
import type {
  ElevenLabsCompositionPlan,
  StoryboardMusicBlock,
} from '@/repositories/storyboardMusic.repository.js';
import { UnprocessableEntityError } from '@/lib/errors.js';
import { orderStoryboardSceneBlocks } from '@/services/storyboardGraph.service.js';

const BASE_MUSIC_OPTIONS = {
  model_id: 'music_v1',
  respect_sections_durations: true,
  force_instrumental: true,
} as const;

function getPlanLengthMs(plan: ElevenLabsCompositionPlan | null): number | undefined {
  const sections = Array.isArray(plan?.['sections']) ? plan['sections'] : [];
  const total = sections.reduce((sum, section) => {
    if (typeof section !== 'object' || section === null) return sum;
    const duration = (section as Record<string, unknown>)['duration_ms'];
    return typeof duration === 'number' ? sum + duration : sum;
  }, 0);
  return total > 0 ? total : undefined;
}

function getCoveredSceneLengthMs(
  block: StoryboardMusicBlock,
  sceneBlocks: StoryboardBlock[],
  edges: StoryboardEdge[],
): number | undefined {
  const orderedScenes = orderStoryboardSceneBlocks(sceneBlocks, edges);
  const startIndex = orderedScenes.findIndex((scene) => scene.id === block.startSceneBlockId);
  const endIndex = orderedScenes.findIndex((scene) => scene.id === block.endSceneBlockId);
  if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) return undefined;

  const totalSeconds = orderedScenes
    .slice(startIndex, endIndex + 1)
    .reduce((sum, scene) => sum + scene.durationS, 0);
  return totalSeconds > 0 ? Math.round(totalSeconds * 1000) : undefined;
}

/**
 * Builds worker options for one storyboard music generation request.
 */
export function buildStoryboardMusicGenerationOptions(
  block: StoryboardMusicBlock,
  sceneBlocks: StoryboardBlock[],
  edges: StoryboardEdge[],
): Record<string, unknown> {
  const prompt = block.prompt?.trim();
  const plan = block.compositionPlan as ElevenLabsCompositionPlan | null;
  const musicLengthMs = getPlanLengthMs(plan) ?? getCoveredSceneLengthMs(block, sceneBlocks, edges);

  if (plan && prompt) {
    return {
      ...BASE_MUSIC_OPTIONS,
      prompt,
      source_composition_plan: plan,
      music_length_ms: musicLengthMs,
      regenerate_composition_plan: true,
    };
  }

  if (plan) {
    return { ...BASE_MUSIC_OPTIONS, composition_plan: plan };
  }

  if (!prompt) {
    throw new UnprocessableEntityError(`Music block ${block.id} has no prompt or composition plan`);
  }

  return {
    ...BASE_MUSIC_OPTIONS,
    prompt,
    music_length_ms: musicLengthMs,
  };
}
