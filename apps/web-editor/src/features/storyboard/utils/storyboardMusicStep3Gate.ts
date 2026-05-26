import type { StoryboardMusicBlock } from '@/features/storyboard/types';

export function isStep3MusicUnresolved(musicBlock: StoryboardMusicBlock): boolean {
  if (musicBlock.sourceMode === 'existing') return !musicBlock.existingFileId;
  if (musicBlock.sourceMode === 'generate_now') {
    return musicBlock.generationStatus !== 'ready' || !musicBlock.outputFileId;
  }
  return false;
}

export function hasUnresolvedStep3Music(musicBlocks: readonly StoryboardMusicBlock[]): boolean {
  return musicBlocks.some(isStep3MusicUnresolved);
}
