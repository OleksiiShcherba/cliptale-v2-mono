/**
 * SceneModal — attaching a Motion Graphic must survive Save (AC-04 / US-07).
 *
 * Defect (review r4): the picker's onAttached row was never wired into the modal's
 * media list, so attaching a graphic showed a preview but the Save payload carried
 * NO motion_graphic item — the subsequent autosave PUT replaced the block media with
 * an empty set and the server-attached row was silently deleted.
 *
 * This test attaches a ready graphic through the real picker and asserts the Save
 * payload contains the motion_graphic item with its frozen snapshot id, so the FK
 * round-trips and the attachment persists.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockListMotionGraphics, mockAttach, mockApiClientGet } = vi.hoisted(() => ({
  mockListMotionGraphics: vi.fn(),
  mockAttach: vi.fn(),
  mockApiClientGet: vi.fn(),
}));

vi.mock('@/features/motion-graphic/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/motion-graphic/api')>(
    '@/features/motion-graphic/api',
  );
  return {
    AttachMotionGraphicError: actual.AttachMotionGraphicError,
    listMotionGraphics: mockListMotionGraphics,
    attachMotionGraphicToBlock: mockAttach,
  };
});

vi.mock('@/features/motion-graphic/runtime', () => ({
  MotionGraphicPlayer: () => <div data-testid="mock-motion-graphic-player" />,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: mockApiClientGet },
  buildAuthenticatedUrl: (url: string) => `${url}?token=test`,
}));

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

vi.mock('@/features/generate-wizard/components/AssetPickerModal', () => ({
  AssetPickerModal: () => <div data-testid="asset-picker-modal" />,
}));

vi.mock('@ai-video-editor/api-contracts', () => ({
  STORYBOARD_STYLES: [
    { id: 'cyberpunk', label: 'Cyberpunk', description: 'Neon', previewColor: '#00FFFF' },
  ],
}));

// ── Import SUT after mocks ─────────────────────────────────────────────────────

import { SceneModal } from './SceneModal';
import type { StoryboardBlock } from '../types';

const READY = {
  id: 'mg-ready-1',
  title: 'Title Card',
  durationSeconds: 5,
  status: 'ready' as const,
  version: 2,
  createdAt: '2026-06-19T00:00:00Z',
  updatedAt: '2026-06-19T00:00:00Z',
};

const SNAPSHOT_ROW = {
  id: 'bm-1',
  blockId: 'block-1',
  mediaType: 'motion_graphic' as const,
  sortOrder: 0,
  snapshot: {
    id: 'snap-1',
    code: 'export default () => null;',
    propsSchema: null,
    durationSeconds: 5,
    fps: 30,
    width: 1920,
    height: 1080,
    runtimeVersion: 'r1',
    sourceVersion: 2,
    createdAt: '2026-06-19T00:00:00Z',
  },
};

function makeBlock(overrides: Partial<StoryboardBlock> = {}): StoryboardBlock {
  return {
    id: 'block-1',
    draftId: 'draft-1',
    blockType: 'scene',
    name: 'Intro Scene',
    prompt: 'A dramatic opening',
    videoPrompt: null,
    durationS: 15,
    positionX: 0,
    positionY: 0,
    sortOrder: 1,
    style: 'cyberpunk',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    mediaItems: [],
    ...overrides,
  };
}

describe('SceneModal — attach Motion Graphic survives Save (AC-04/US-07)', () => {
  beforeEach(() => {
    mockListMotionGraphics.mockReset();
    mockAttach.mockReset();
    mockListMotionGraphics.mockResolvedValue({ items: [READY], nextCursor: null });
    mockAttach.mockResolvedValue(SNAPSHOT_ROW);
  });

  it('includes the attached motion_graphic (with its snapshot id) in the Save payload', async () => {
    const onSave = vi.fn();
    render(
      <SceneModal
        mode="block"
        block={makeBlock()}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // + Add Media -> Motion Graphic -> pick the ready graphic
    fireEvent.click(screen.getByTestId('add-media-button'));
    fireEvent.click(screen.getByTestId('type-chip-motion_graphic'));
    fireEvent.click(await screen.findByText('Title Card'));

    await waitFor(() => expect(mockAttach).toHaveBeenCalled());

    // Save the scene
    fireEvent.click(screen.getByTestId('save-button'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [, payload] = onSave.mock.calls[0];
    const mgItems = payload.mediaItems.filter(
      (m: { mediaType: string }) => m.mediaType === 'motion_graphic',
    );
    expect(mgItems).toHaveLength(1);
    expect(mgItems[0].motionGraphic?.snapshotId).toBe('snap-1');
  });
});
