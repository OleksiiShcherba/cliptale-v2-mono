/**
 * MotionGraphicBlockMediaPicker — T18 (AC-04, AC-08).
 *
 * The block-media picker extension that lets a Creator pick one of their READY
 * Motion Graphics and attach it to a storyboard block. Covers:
 *  - the picker lists ONLY the Creator's ready graphics (generating/failed hidden);
 *  - picking one calls attachMotionGraphicToBlock(draftId, blockId, { motionGraphicId });
 *  - on 201 the attached motion_graphic appears among the block's media, rendered
 *    via the runtime preview (MotionGraphicPlayer) (AC-04);
 *  - a 422 motion_graphic.not_ready surfaces the refusal message (AC-08).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const {
  mockListMotionGraphics,
  mockAttach,
  capturedPlayerProps,
} = vi.hoisted(() => ({
  mockListMotionGraphics: vi.fn(),
  mockAttach: vi.fn(),
  capturedPlayerProps: { current: null as Record<string, unknown> | null },
}));

vi.mock('@/features/motion-graphic/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/motion-graphic/api')>(
    '@/features/motion-graphic/api',
  );
  return {
    // Keep the real AttachMotionGraphicError so `instanceof` checks match.
    AttachMotionGraphicError: actual.AttachMotionGraphicError,
    listMotionGraphics: mockListMotionGraphics,
    attachMotionGraphicToBlock: mockAttach,
  };
});

// Render glue: a thumbnail variant that mounts the runtime player. We assert it
// receives the snapshot's frozen code + geometry.
vi.mock('@/features/motion-graphic/runtime', () => ({
  MotionGraphicPlayer: (props: Record<string, unknown>) => {
    capturedPlayerProps.current = props;
    return <div data-testid="motion-graphic-runtime-preview" />;
  },
}));

// ── Import SUT after mocks ─────────────────────────────────────────────────────

import { MotionGraphicBlockMediaPicker } from './MotionGraphicBlockMediaPicker';
import {
  AttachMotionGraphicError,
} from '@/features/motion-graphic/api';

// ── Fixtures ────────────────────────────────────────────────────────────────────

const READY = {
  id: 'mg-ready-1',
  title: 'Title Card',
  durationSeconds: 5,
  status: 'ready' as const,
  version: 2,
  createdAt: '2026-06-19T00:00:00Z',
  updatedAt: '2026-06-19T00:00:00Z',
};

const GENERATING = { ...READY, id: 'mg-gen-1', title: 'Still cooking', status: 'generating' as const };
const FAILED = { ...READY, id: 'mg-fail-1', title: 'Broken', status: 'failed' as const };

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

function renderPicker(onAttached = vi.fn()) {
  render(
    <MotionGraphicBlockMediaPicker
      draftId="draft-1"
      blockId="block-1"
      onAttached={onAttached}
      onClose={vi.fn()}
    />,
  );
  return { onAttached };
}

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('MotionGraphicBlockMediaPicker', () => {
  beforeEach(() => {
    mockListMotionGraphics.mockReset();
    mockAttach.mockReset();
    capturedPlayerProps.current = null;
    mockListMotionGraphics.mockResolvedValue({
      items: [READY, GENERATING, FAILED],
      nextCursor: null,
    });
  });

  it('lists only the Creator ready graphics (generating/failed hidden)', async () => {
    renderPicker();

    expect(await screen.findByText('Title Card')).toBeTruthy();
    expect(screen.queryByText('Still cooking')).toBeNull();
    expect(screen.queryByText('Broken')).toBeNull();
  });

  it('attaches the picked ready graphic with the right draftId/blockId/motionGraphicId', async () => {
    mockAttach.mockResolvedValue(SNAPSHOT_ROW);
    const { onAttached } = renderPicker();

    fireEvent.click(await screen.findByText('Title Card'));

    await waitFor(() => {
      expect(mockAttach).toHaveBeenCalledWith('draft-1', 'block-1', {
        motionGraphicId: 'mg-ready-1',
      });
    });
    await waitFor(() => {
      expect(onAttached).toHaveBeenCalledWith(SNAPSHOT_ROW);
    });
  });

  it('renders the attached motion_graphic via the runtime preview on success (AC-04)', async () => {
    mockAttach.mockResolvedValue(SNAPSHOT_ROW);
    renderPicker();

    fireEvent.click(await screen.findByText('Title Card'));

    await screen.findByTestId('motion-graphic-runtime-preview');
    expect(capturedPlayerProps.current?.code).toBe('export default () => null;');
    const geometry = capturedPlayerProps.current?.geometry as Record<string, unknown>;
    expect(geometry).toMatchObject({
      durationSeconds: 5,
      fps: 30,
      width: 1920,
      height: 1080,
    });
  });

  it('surfaces the not_ready refusal message on a 422 motion_graphic.not_ready (AC-08)', async () => {
    mockAttach.mockRejectedValue(
      new AttachMotionGraphicError('Only a ready, working graphic can be added.', {
        code: 'motion_graphic.not_ready',
        status: 422,
      }),
    );
    renderPicker();

    fireEvent.click(await screen.findByText('Title Card'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/only a ready, working graphic can be added/i);
  });
});
