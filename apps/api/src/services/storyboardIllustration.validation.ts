import type { DraftAspectRatio, PromptBlock } from '@ai-video-editor/project-schema';

import {
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from '@/lib/errors.js';
import * as fileLinksRepository from '@/repositories/fileLinks.repository.js';
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

function getDraftTextPrompt(draft: GenerationDraft): string {
  return draft.promptDoc.blocks
    .filter((block): block is Extract<PromptBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.value.trim())
    .filter(Boolean)
    .join('\n\n');
}

export function buildReferencePrompt(draft: GenerationDraft): string {
  const text = getDraftTextPrompt(draft);
  const style = draft.promptDoc.settings?.styleKey;
  const styleLine = style ? `\n\nStyle: ${style}` : '';
  return [
    'Create one canonical visual style reference image for a storyboard sequence.',
    'It must establish the shared character language, lighting, palette, composition, and visual tone for all later scene images.',
    text ? `Storyboard brief:\n${text}` : 'Storyboard brief: infer a polished visual direction from the available references.',
    `${styleLine}`,
  ].join('\n\n').trim();
}

export async function resolveDraftImageReferenceFileIds(
  draft: GenerationDraft,
): Promise<string[]> {
  const promptImageRefs = draft.promptDoc.blocks
    .filter((block): block is Extract<PromptBlock, { type: 'media-ref' }> => (
      block.type === 'media-ref' && block.mediaType === 'image'
    ))
    .map((block) => block.fileId);
  const uniquePromptRefs = [...new Set(promptImageRefs)];
  if (!uniquePromptRefs.length) {
    return [];
  }

  const linkedFiles = await fileLinksRepository.findFilesByDraftId(draft.id);
  const linkedImageIds = new Set(
    linkedFiles
      .filter((file) => file.userId === draft.userId && file.kind === 'image' && file.status === 'ready')
      .map((file) => file.fileId),
  );
  const missing = uniquePromptRefs.find((fileId) => !linkedImageIds.has(fileId));
  if (missing) {
    throw new UnprocessableEntityError(`Image reference file ${missing} is not available on this draft`);
  }
  return uniquePromptRefs;
}

export async function assertReadyDraftImageFileIds(params: {
  draft: GenerationDraft;
  fileIds: string[];
}): Promise<string[]> {
  const uniqueFileIds = [...new Set(params.fileIds)];
  if (!uniqueFileIds.length) {
    return [];
  }

  const linkedFiles = await fileLinksRepository.findFilesByDraftId(params.draft.id);
  const linkedReadyImages = new Set(
    linkedFiles
      .filter((file) => file.userId === params.draft.userId && file.kind === 'image' && file.status === 'ready')
      .map((file) => file.fileId),
  );
  const missing = uniqueFileIds.find((fileId) => !linkedReadyImages.has(fileId));
  if (missing) {
    throw new UnprocessableEntityError(`Image file ${missing} is not available on this draft`);
  }
  return uniqueFileIds;
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
