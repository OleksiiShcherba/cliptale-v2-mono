/**
 * Tests for SceneBlockNode thumbnail rendering and media type badge rendering.
 *
 * Covers:
 * - 0 media items → single placeholder shown
 * - 1 image item → thumbnail img element rendered with authenticated URL
 * - 3 media items → 3 thumbnail slots rendered
 * - 4 media items → capped at 3 thumbnails (4th item not rendered)
 * - Audio item → placeholder (no img) since audio has no visual thumbnail
 * - Media type badges rendered for each unique type across ALL media items
 * - Remove button fires onRemove with node id (and stops propagation to onEdit)
 * - Edit callback fires when card is clicked
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockBuildAuthenticatedUrl } = vi.hoisted(() => ({
  mockBuildAuthenticatedUrl: vi.fn((url: string) => `${url}?token=mock`),
}));

vi.mock('@/lib/api-client', () => ({
  buildAuthenticatedUrl: mockBuildAuthenticatedUrl,
}));

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

// React Flow mock: Handle requires a ReactFlow context — stub it out.
vi.mock('@xyflow/react', () => ({
  Handle: ({ type, id, 'aria-label': ariaLabel }: {
    type: string;
    id?: string;
    'aria-label'?: string;
  }) =>
    React.createElement('div', {
      'data-testid': `handle-${type}-${id ?? ''}`,
      'aria-label': ariaLabel,
    }),
  Position: { Left: 'left', Right: 'right' },
}));

// ── Import SUT after mocks ─────────────────────────────────────────────────────

import { SceneBlockNode } from '../components/SceneBlockNode';
import type { BlockMediaItem, StoryboardBlock } from '../types';

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeMedia(
  overrides: Pick<BlockMediaItem, 'fileId' | 'mediaType'> & Partial<BlockMediaItem>,
): BlockMediaItem {
  return {
    id: `media-${overrides.fileId}`,
    sortOrder: 0,
    ...overrides,
  };
}

function makeBlock(mediaItems: BlockMediaItem[] = []): StoryboardBlock {
  return {
    id: 'node-1',
    draftId: 'draft-1',
    blockType: 'scene',
    name: 'Test Scene',
    prompt: 'A test prompt',
    durationS: 10,
    positionX: 0,
    positionY: 0,
    sortOrder: 1,
    style: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    mediaItems,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SceneBlockNode thumbnails', () => {
  const mockOnRemove = vi.fn();
  const mockOnEdit = vi.fn();

  beforeEach(() => {
    mockOnRemove.mockClear();
    mockOnEdit.mockClear();
  });

  it('shows a single placeholder when there are no media items', () => {
    render(
      <SceneBlockNode
        id="node-1"
        data={{ block: makeBlock([]), onRemove: mockOnRemove }}
      />,
    );

    const items = screen.getAllByTestId('thumbnail-item');
    expect(items).toHaveLength(1);
    // Placeholder SVG present; no thumbnail img
    expect(screen.getByTestId('placeholder-svg')).toBeTruthy();
    expect(screen.queryByTestId('thumbnail-img')).toBeFalsy();
  });

  it('renders a thumbnail img for 1 image media item', () => {
    const media = [makeMedia({ fileId: 'img-1', mediaType: 'image' })];
    render(
      <SceneBlockNode
        id="node-1"
        data={{ block: makeBlock(media), onRemove: mockOnRemove }}
      />,
    );

    const items = screen.getAllByTestId('thumbnail-item');
    expect(items).toHaveLength(1);
    const img = screen.getByTestId('thumbnail-img') as HTMLImageElement;
    expect(img).toBeTruthy();
    // URL contains fileId and token
    expect(img.src).toContain('img-1/thumbnail');
    expect(img.src).toContain('token=mock');
  });

  it('renders 3 thumbnail items for 3 media items', () => {
    const media = [
      makeMedia({ fileId: 'img-1', mediaType: 'image', sortOrder: 0 }),
      makeMedia({ fileId: 'vid-1', mediaType: 'video', sortOrder: 1 }),
      makeMedia({ fileId: 'img-2', mediaType: 'image', sortOrder: 2 }),
    ];
    render(
      <SceneBlockNode
        id="node-1"
        data={{ block: makeBlock(media), onRemove: mockOnRemove }}
      />,
    );

    const items = screen.getAllByTestId('thumbnail-item');
    expect(items).toHaveLength(3);
  });

  it('caps thumbnails at 3 even when 4 media items exist', () => {
    const media = Array.from({ length: 4 }, (_, i) =>
      makeMedia({ fileId: `img-${i}`, mediaType: 'image', sortOrder: i }),
    );
    render(
      <SceneBlockNode
        id="node-1"
        data={{ block: makeBlock(media), onRemove: mockOnRemove }}
      />,
    );

    const items = screen.getAllByTestId('thumbnail-item');
    expect(items).toHaveLength(3);
  });

  it('renders placeholder for audio media items (no visual thumbnail)', () => {
    const media = [makeMedia({ fileId: 'aud-1', mediaType: 'audio' })];
    render(
      <SceneBlockNode
        id="node-1"
        data={{ block: makeBlock(media), onRemove: mockOnRemove }}
      />,
    );

    // Audio → placeholder, not img
    expect(screen.queryByTestId('thumbnail-img')).toBeFalsy();
    expect(screen.getByTestId('placeholder-svg')).toBeTruthy();
  });

  it('renders media type badges for each unique type', () => {
    const media = [
      makeMedia({ fileId: 'img-1', mediaType: 'image', sortOrder: 0 }),
      makeMedia({ fileId: 'aud-1', mediaType: 'audio', sortOrder: 1 }),
      makeMedia({ fileId: 'img-2', mediaType: 'image', sortOrder: 2 }),
    ];
    render(
      <SceneBlockNode
        id="node-1"
        data={{ block: makeBlock(media), onRemove: mockOnRemove }}
      />,
    );

    const badges = screen.getAllByTestId('media-type-badge');
    const badgeTexts = badges.map((b) => b.textContent ?? '');
    expect(badgeTexts).toContain('IMAGE CLIP');
    expect(badgeTexts).toContain('AUDIO CLIP');
    // Image badge appears only once even though 2 image items
    const imageBadgeCount = badgeTexts.filter((t) => t === 'IMAGE CLIP').length;
    expect(imageBadgeCount).toBe(1);
  });

  it('fires onRemove with the node id when remove button is clicked', () => {
    render(
      <SceneBlockNode
        id="node-1"
        data={{ block: makeBlock([]), onRemove: mockOnRemove }}
      />,
    );

    fireEvent.click(screen.getByTestId('remove-block-button'));
    expect(mockOnRemove).toHaveBeenCalledWith('node-1');
  });

  it('fires onEdit when the node card is clicked', () => {
    render(
      <SceneBlockNode
        id="node-1"
        data={{ block: makeBlock([]), onRemove: mockOnRemove, onEdit: mockOnEdit }}
      />,
    );

    fireEvent.click(screen.getByTestId('scene-block-node'));
    expect(mockOnEdit).toHaveBeenCalledWith('node-1');
  });

  it('does not fire onEdit when remove button is clicked (stopPropagation)', () => {
    render(
      <SceneBlockNode
        id="node-1"
        data={{ block: makeBlock([]), onRemove: mockOnRemove, onEdit: mockOnEdit }}
      />,
    );

    fireEvent.click(screen.getByTestId('remove-block-button'));
    expect(mockOnEdit).not.toHaveBeenCalled();
    expect(mockOnRemove).toHaveBeenCalledWith('node-1');
  });
});
