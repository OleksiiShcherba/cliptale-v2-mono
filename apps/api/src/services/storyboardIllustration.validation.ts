import type { DraftAspectRatio } from '@ai-video-editor/project-schema';

import {
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from '@/lib/errors.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import type { StoryboardBlock } from '@/repositories/storyboard.repository.js';

export async function resolveDraft(userId: string, draftId: string): Promise<GenerationDraft> {
  const draft = await generationDraftRepository.findDraftById(draftId);
  if (!draft) {
    throw new NotFoundError(`Generation draft ${draftId} not found`);
  }
  if (draft.userId !== userId) {
    throw new ForbiddenError(`You do not own generation draft ${draftId}`);
  }
  return draft;
}

export function getDraftAspectRatio(draft: GenerationDraft): DraftAspectRatio {
  const promptDoc = draft.promptDoc;
  if (
    promptDoc &&
    typeof promptDoc === 'object' &&
    'settings' in promptDoc &&
    promptDoc.settings &&
    typeof promptDoc.settings === 'object' &&
    'aspectRatio' in promptDoc.settings
  ) {
    const aspectRatio = promptDoc.settings.aspectRatio;
    if (aspectRatio === '9:16' || aspectRatio === '1:1') {
      return aspectRatio;
    }
  }
  return '16:9';
}

export function buildPrompt(block: StoryboardBlock): string {
  const prompt = block.prompt?.trim();
  if (!prompt) {
    throw new UnprocessableEntityError(`Scene block ${block.id} has no illustration prompt`);
  }
  if (!block.style?.trim()) {
    return prompt;
  }
  return `${prompt}\n\nStyle: ${block.style.trim()}`;
}

export function assertPromptedBlocks(blocks: StoryboardBlock[]): void {
  const missing = blocks.find((block) => !block.prompt?.trim());
  if (missing) {
    throw new UnprocessableEntityError(`Scene block ${missing.id} has no illustration prompt`);
  }
}

export function requireSceneBlock(
  blocks: StoryboardBlock[],
  blockId: string,
  draftId: string,
): StoryboardBlock {
  const block = blocks.find((candidate) => candidate.id === blockId);
  if (!block) {
    throw new NotFoundError(`Storyboard block ${blockId} not found`);
  }
  if (block.draftId !== draftId || block.blockType !== 'scene') {
    throw new NotFoundError(`Storyboard block ${blockId} not found`);
  }
  return block;
}
