/**
 * ReferenceDetailsModal — details dialog opened by a reference-block click.
 *
 * Covers:
 *   - scene links shown via SceneLinkSelector and ADJUSTABLE (save → onSaveSceneLinks
 *     with the replacement list + compare-and-set version);
 *   - the prompt used is VIEW ONLY (rendered text, no input);
 *   - "View flow" action present when the block has a flow, absent otherwise;
 *   - close via the header ×, the footer button, and Escape.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import type { StoryboardBlock, StoryboardReferenceBlock } from '@/features/storyboard/types';
import { ReferenceDetailsModal } from './ReferenceDetailsModal';

const SCENES: StoryboardBlock[] = (['scene-a', 'scene-b', 'scene-c'] as const).map((id, i) => ({
  id,
  draftId: 'draft-1',
  blockType: 'scene',
  name: `Scene 0${i + 1}`,
  prompt: null,
  videoPrompt: null,
  durationS: 5,
  positionX: 0,
  positionY: 0,
  sortOrder: i + 1,
  style: null,
  createdAt: '',
  updatedAt: '',
  mediaItems: [],
}));

function makeBlock(overrides: Partial<StoryboardReferenceBlock> = {}): StoryboardReferenceBlock {
  return {
    id: 'rb-1',
    draftId: 'draft-1',
    flowId: 'flow-1',
    castType: 'character',
    name: 'Hero',
    description: 'A brave protagonist with a red cloak.',
    sortOrder: 0,
    positionX: 0,
    positionY: 0,
    windowStatus: 'done',
    firstJobId: null,
    errorMessage: null,
    version: 3,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function renderModal(overrides: Partial<Parameters<typeof ReferenceDetailsModal>[0]> = {}) {
  const props = {
    referenceBlock: makeBlock(),
    sceneBlockIds: ['scene-a'],
    orderedScenes: SCENES,
    onSaveSceneLinks: vi.fn().mockResolvedValue({ sceneBlockIds: ['scene-a'], version: 4 }),
    onViewFlow: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<ReferenceDetailsModal {...props} />) };
}

describe('ReferenceDetailsModal', () => {
  it('shows the linked scenes and the prompt used (view only)', () => {
    renderModal();

    // Linked scene chip is present and adjustable via the selector.
    expect(screen.getByTestId('linked-scene-scene-a')).toBeTruthy();
    expect(screen.getByTestId('add-scene-scene-b')).toBeTruthy();

    // Prompt is rendered as text — not an editable input.
    const prompt = screen.getByTestId('reference-details-prompt');
    expect(prompt.textContent).toMatch(/red cloak/);
    expect(prompt.tagName.toLowerCase()).not.toBe('textarea');
    expect(prompt.tagName.toLowerCase()).not.toBe('input');
  });

  it('falls back to the block name as the prompt when description is empty', () => {
    renderModal({ referenceBlock: makeBlock({ description: null }) });

    expect(screen.getByTestId('reference-details-prompt').textContent).toBe('Hero');
  });

  it('adjusting scenes and saving calls onSaveSceneLinks with the new list + version', async () => {
    const onSaveSceneLinks = vi
      .fn()
      .mockResolvedValue({ sceneBlockIds: ['scene-a', 'scene-b'], version: 4 });
    renderModal({ onSaveSceneLinks });

    fireEvent.click(screen.getByTestId('add-scene-scene-b'));
    fireEvent.click(screen.getByTestId('save-scene-links'));

    await waitFor(() => expect(onSaveSceneLinks).toHaveBeenCalledTimes(1));
    expect(onSaveSceneLinks).toHaveBeenCalledWith(['scene-a', 'scene-b'], 3);
  });

  it('"View flow" calls onViewFlow; hidden when the block has no flow', () => {
    const onViewFlow = vi.fn();
    const { unmount } = renderModal({ onViewFlow });

    fireEvent.click(screen.getByTestId('reference-details-view-flow'));
    expect(onViewFlow).toHaveBeenCalledTimes(1);
    unmount();

    renderModal({ referenceBlock: makeBlock({ flowId: null }) });
    expect(screen.queryByTestId('reference-details-view-flow')).toBeNull();
  });

  it('closes via the header ×, the footer Close, and Escape', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByTestId('reference-details-close'));
    fireEvent.click(screen.getByTestId('reference-details-close-button'));
    fireEvent.keyDown(screen.getByTestId('reference-details-modal'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
