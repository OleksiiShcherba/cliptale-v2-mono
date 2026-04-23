/**
 * Tests for SceneBlockNode — subtask 5.
 *
 * Covers:
 * - Renders scene name; auto-generates "SCENE 01" when name is blank.
 * - Prompt truncation at 80 chars (81st char onwards replaced with "…").
 * - Shows placeholder SVG when no media is attached.
 * - Renders up to 3 thumbnail items when media is present; ignores the rest.
 * - Red × (remove) button is present.
 * - Duration badge is rendered.
 *
 * @xyflow/react is mocked to avoid canvas/DOM layout requirements in jsdom.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { StoryboardBlock, BlockMediaItem } from '../types';

// ---------------------------------------------------------------------------
// Mock @xyflow/react — Handle requires a ReactFlow context not available in jsdom.
// ---------------------------------------------------------------------------

vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position, id, 'aria-label': ariaLabel }: {
    type: string;
    position: string;
    id: string;
    style?: React.CSSProperties;
    'aria-label'?: string;
  }) => (
    <div
      data-testid={`handle-${type}-${id}`}
      data-position={position}
      aria-label={ariaLabel}
    />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useReactFlow: () => ({ getNodes: vi.fn(() => []) }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { SceneBlockNode } from './SceneBlockNode';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBlock(overrides: Partial<StoryboardBlock> = {}): StoryboardBlock {
  return {
    id: 'block-1',
    draftId: 'draft-abc',
    blockType: 'scene',
    name: 'Scene One',
    prompt: 'A cinematic shot of mountains at dawn.',
    durationS: 5,
    positionX: 100,
    positionY: 200,
    sortOrder: 1,
    style: null,
    createdAt: '2026-04-22T00:00:00.000Z',
    updatedAt: '2026-04-22T00:00:00.000Z',
    mediaItems: [],
    ...overrides,
  };
}

function makeMediaItem(overrides: Partial<BlockMediaItem> = {}): BlockMediaItem {
  return {
    id: `media-${Math.random()}`,
    fileId: 'file-1',
    mediaType: 'image',
    sortOrder: 0,
    ...overrides,
  };
}

function renderNode(
  block: StoryboardBlock,
  onRemove: (id: string) => void = vi.fn(),
  id = 'block-1',
) {
  return render(
    <SceneBlockNode
      id={id}
      data={{ block, onRemove }}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SceneBlockNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Scene name ─────────────────────────────────────────────────────────────

  it('renders the scene name when provided', () => {
    renderNode(makeBlock({ name: 'My Scene' }));
    expect(screen.getByTestId('scene-name').textContent).toBe('My Scene');
  });

  it('auto-generates "SCENE 01" when name is null', () => {
    renderNode(makeBlock({ name: null, sortOrder: 1 }));
    expect(screen.getByTestId('scene-name').textContent).toBe('SCENE 01');
  });

  it('auto-generates "SCENE 03" when name is null and sortOrder is 3', () => {
    renderNode(makeBlock({ name: null, sortOrder: 3 }));
    expect(screen.getByTestId('scene-name').textContent).toBe('SCENE 03');
  });

  it('auto-generates "SCENE 12" for sortOrder 12', () => {
    renderNode(makeBlock({ name: null, sortOrder: 12 }));
    expect(screen.getByTestId('scene-name').textContent).toBe('SCENE 12');
  });

  // ── Prompt truncation ──────────────────────────────────────────────────────

  it('renders prompt text when under 80 chars', () => {
    const prompt = 'Short prompt.';
    renderNode(makeBlock({ prompt }));
    const el = screen.getByTestId('prompt-preview');
    expect(el.textContent).toBe(prompt);
  });

  it('truncates prompt at 80 chars with ellipsis', () => {
    // 85 chars of text
    const prompt = 'A'.repeat(85);
    renderNode(makeBlock({ prompt }));
    const el = screen.getByTestId('prompt-preview');
    expect(el.textContent).toBe(`${'A'.repeat(80)}…`);
    expect(el.textContent?.length).toBe(81); // 80 + ellipsis char
  });

  it('shows no prompt element when prompt is null', () => {
    renderNode(makeBlock({ prompt: null }));
    expect(screen.queryByTestId('prompt-preview')).toBeNull();
  });

  it('prompt at exactly 80 chars is NOT truncated', () => {
    const prompt = 'B'.repeat(80);
    renderNode(makeBlock({ prompt }));
    const el = screen.getByTestId('prompt-preview');
    expect(el.textContent).toBe(prompt);
  });

  // ── Duration badge ─────────────────────────────────────────────────────────

  it('renders the duration badge with seconds value', () => {
    renderNode(makeBlock({ durationS: 8 }));
    expect(screen.getByTestId('duration-badge').textContent).toBe('8s');
  });

  // ── Thumbnails — no media ──────────────────────────────────────────────────

  it('shows placeholder SVG when no media is attached', () => {
    renderNode(makeBlock({ mediaItems: [] }));
    // One thumbnail item with placeholder SVG
    const thumbnailItems = screen.getAllByTestId('thumbnail-item');
    expect(thumbnailItems.length).toBe(1);
    expect(screen.getAllByTestId('placeholder-svg').length).toBeGreaterThan(0);
  });

  // ── Thumbnails — with media ────────────────────────────────────────────────

  it('renders one thumbnail item for one media item', () => {
    const items = [makeMediaItem({ sortOrder: 0 })];
    renderNode(makeBlock({ mediaItems: items }));
    expect(screen.getAllByTestId('thumbnail-item').length).toBe(1);
  });

  it('renders up to 3 thumbnail items for 3 media items', () => {
    const items = [
      makeMediaItem({ id: 'm1', sortOrder: 0 }),
      makeMediaItem({ id: 'm2', sortOrder: 1 }),
      makeMediaItem({ id: 'm3', sortOrder: 2 }),
    ];
    renderNode(makeBlock({ mediaItems: items }));
    expect(screen.getAllByTestId('thumbnail-item').length).toBe(3);
  });

  it('renders only 3 thumbnails when 5 media items are present', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeMediaItem({ id: `m${i}`, sortOrder: i }),
    );
    renderNode(makeBlock({ mediaItems: items }));
    expect(screen.getAllByTestId('thumbnail-item').length).toBe(3);
  });

  // ── Remove button ──────────────────────────────────────────────────────────

  it('renders the red × remove button', () => {
    renderNode(makeBlock());
    expect(screen.getByTestId('remove-block-button')).toBeTruthy();
  });

  it('calls onRemove with the node id when × is clicked', () => {
    const onRemove = vi.fn();
    renderNode(makeBlock(), onRemove, 'block-xyz');
    fireEvent.click(screen.getByTestId('remove-block-button'));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('block-xyz');
  });

  // ── Port handles ───────────────────────────────────────────────────────────

  it('renders an income port (target handle, left)', () => {
    renderNode(makeBlock());
    const handle = screen.getByTestId('handle-target-income');
    expect(handle).toBeTruthy();
    expect(handle.getAttribute('data-position')).toBe('left');
  });

  it('renders an exit port (source handle, right)', () => {
    renderNode(makeBlock());
    const handle = screen.getByTestId('handle-source-exit');
    expect(handle).toBeTruthy();
    expect(handle.getAttribute('data-position')).toBe('right');
  });
});
