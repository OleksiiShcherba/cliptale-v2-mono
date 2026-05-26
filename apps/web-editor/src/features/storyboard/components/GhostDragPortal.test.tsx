import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { Node } from '@xyflow/react';

import type { GhostDragState } from '@/features/storyboard/hooks/useStoryboardDrag';
import type { MusicBlockNodeData, StoryboardBlock, StoryboardMusicBlock } from '@/features/storyboard/types';

import { GhostDragPortal } from './GhostDragPortal';

function makeBlock(overrides: Partial<StoryboardBlock> = {}): StoryboardBlock {
  return {
    id: 'scene-1',
    draftId: 'draft-1',
    blockType: 'scene',
    name: 'Opening',
    prompt: 'A wide sunrise establishing shot with slow camera movement.',
    videoPrompt: null,
    durationS: 5,
    positionX: 100,
    positionY: 200,
    sortOrder: 1,
    style: null,
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:00:00.000Z',
    mediaItems: [],
    ...overrides,
  };
}

function makeDragState(node: Node): GhostDragState {
  return {
    node,
    clientX: 320,
    clientY: 180,
    nodeWidth: 220,
    nodeHeight: 120,
  };
}

function makeMusicBlock(overrides: Partial<StoryboardMusicBlock> = {}): StoryboardMusicBlock {
  return {
    id: 'music-1',
    draftId: 'draft-1',
    name: 'Opening pulse',
    sourceMode: 'generate_now',
    prompt: 'Soft pulse',
    compositionPlan: null,
    existingFileId: null,
    startSceneBlockId: 'scene-1',
    endSceneBlockId: 'scene-2',
    positionX: 120,
    positionY: 520,
    sortOrder: 0,
    volume: 0.8,
    fadeInS: 0,
    fadeOutS: 1,
    loopMode: 'trim',
    generationStatus: 'running',
    generationJobId: 'job-1',
    outputFileId: null,
    errorMessage: null,
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}

function makeMusicData(overrides: Partial<MusicBlockNodeData> = {}): MusicBlockNodeData {
  return {
    musicBlock: makeMusicBlock(),
    rangeLabel: 'Opening - Close',
    sourceLabel: 'Generate now',
    statusLabel: 'Running',
    isActive: true,
    onEdit: () => {},
    onHover: () => {},
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('GhostDragPortal', () => {
  it('renders a full disabled scene block preview', () => {
    render(
      <GhostDragPortal
        dragState={makeDragState({
          id: 'scene-1',
          type: 'scene-block',
          position: { x: 100, y: 200 },
          data: { block: makeBlock() },
        })}
      />,
    );

    const clone = screen.getByTestId('ghost-drag-clone');
    expect(clone.getAttribute('aria-hidden')).toBe('true');
    expect(clone.style.pointerEvents).toBe('none');
    expect(screen.getByTestId('ghost-drag-scene-preview')).toBeTruthy();
    expect(screen.getByText('Opening')).toBeTruthy();
    expect(screen.getByText('5s')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove scene block' })).toBeNull();
    expect(screen.queryByText('Moving...')).toBeNull();
  });

  it('mirrors scene illustration status in the disabled scene preview', () => {
    render(
      <GhostDragPortal
        dragState={makeDragState({
          id: 'scene-1',
          type: 'scene-block',
          position: { x: 100, y: 200 },
          data: {
            block: makeBlock(),
            illustration: {
              blockId: 'scene-1',
              status: 'running',
              jobId: 'job-1',
              outputFileId: null,
              errorMessage: null,
            },
          },
        })}
      />,
    );

    expect(screen.getByText('Image running')).toBeTruthy();
  });

  it('renders an inert disabled music block preview without opening the modal', () => {
    const onEdit = vi.fn();
    const onHover = vi.fn();

    render(
      <GhostDragPortal
        dragState={makeDragState({
          id: 'music-1',
          type: 'music-block',
          position: { x: 120, y: 520 },
          data: makeMusicData({ onEdit, onHover }),
        })}
      />,
    );

    const clone = screen.getByTestId('ghost-drag-clone');
    expect(clone.getAttribute('aria-hidden')).toBe('true');
    expect(clone.hasAttribute('inert')).toBe(true);
    expect(clone.style.pointerEvents).toBe('none');
    expect(screen.getByTestId('music-block-title').textContent).toBe('Opening pulse');
    expect(screen.getByTestId('music-source-badge').textContent).toBe('Generate now');
    expect(screen.getByTestId('music-status-badge').textContent).toBe('Running');
    expect(screen.getByTestId('music-range-label').textContent).toBe('Opening - Close');
    expect(screen.getByTestId('music-preview-affordance')).toBeTruthy();

    fireEvent.mouseEnter(screen.getByTestId('music-block-node'));
    fireEvent.click(screen.getByTestId('music-block-node'));

    expect(onEdit).not.toHaveBeenCalled();
    expect(onHover).not.toHaveBeenCalled();
  });

  it('renders START and END sentinel previews', () => {
    const { rerender } = render(
      <GhostDragPortal
        dragState={makeDragState({
          id: 'start',
          type: 'start',
          position: { x: 60, y: 200 },
          data: { label: 'START' },
        })}
      />,
    );

    expect(screen.getByTestId('ghost-drag-start-preview')).toBeTruthy();
    expect(screen.getByText('START')).toBeTruthy();

    rerender(
      <GhostDragPortal
        dragState={makeDragState({
          id: 'end',
          type: 'end',
          position: { x: 900, y: 200 },
          data: { label: 'END' },
        })}
      />,
    );

    expect(screen.getByTestId('ghost-drag-end-preview')).toBeTruthy();
    expect(screen.getByText('END')).toBeTruthy();
  });
});
