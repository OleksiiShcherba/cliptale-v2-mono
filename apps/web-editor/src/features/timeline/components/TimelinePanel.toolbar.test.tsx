import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import * as ephemeralStore from '@/store/ephemeral-store';
import * as projectStore from '@/store/project-store';

import { TimelinePanel } from './TimelinePanel';

// ── Mock stores and sub-components ────────────────────────────────────────────

vi.mock('@/store/ephemeral-store', async (importOriginal) => {
  const actual = await importOriginal<typeof ephemeralStore>();
  return {
    ...actual,
    useEphemeralStore: vi.fn(),
    setScrollOffsetX: vi.fn(),
    setPxPerFrame: vi.fn(),
    setPlayheadFrame: vi.fn(),
  };
});

vi.mock('@/store/project-store', () => ({
  useProjectStore: vi.fn(),
  getSnapshot: vi.fn(),
  setProject: vi.fn(),
}));

vi.mock('../hooks/useClipDrag', () => ({
  useClipDrag: vi.fn(() => ({
    dragInfo: null,
    onClipPointerDown: vi.fn(),
  })),
}));

vi.mock('../hooks/useClipTrim', () => ({
  useClipTrim: vi.fn(() => ({
    trimInfo: null,
    getTrimCursor: vi.fn().mockReturnValue(null),
    onTrimPointerDown: vi.fn().mockReturnValue(false),
  })),
}));

vi.mock('./TimelineRuler', () => ({
  TimelineRuler: () => React.createElement('div', { 'data-testid': 'ruler' }),
}));

vi.mock('./TrackList', () => ({
  TrackList: () => React.createElement('div', { 'data-testid': 'track-list' }),
  TRACK_HEADER_WIDTH: 160,
}));

// Stub react-query so the drop hooks (which call `useQueryClient`) do not need
// a QueryClientProvider in the test tree.
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// ── Stub ResizeObserver ───────────────────────────────────────────────────────

let triggerResize: ((width: number) => void) | null = null;

beforeEach(() => {
  triggerResize = null;
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn((callback: ResizeObserverCallback) => ({
      observe: vi.fn(() => {
        triggerResize = (width: number) => {
          act(() => {
            callback(
              [{ contentRect: { width } }] as unknown as ResizeObserverEntry[],
              null as unknown as ResizeObserver,
            );
          });
        };
      }),
      disconnect: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const SCROLL_OVERRUN_PX = 300;
const LANE_WIDTH = 640; // TRACK_HEADER_WIDTH=160, panelWidth=800

function makeEphemeralState(overrides: {
  pxPerFrame?: number;
  scrollOffsetX?: number;
  playheadFrame?: number;
} = {}) {
  return {
    pxPerFrame: overrides.pxPerFrame ?? 4,
    scrollOffsetX: overrides.scrollOffsetX ?? 0,
    selectedClipIds: [],
    playheadFrame: overrides.playheadFrame ?? 0,
    zoom: 1,
  };
}

function makeProjectState(overrides: { durationFrames?: number } = {}) {
  return {
    id: 'proj-001',
    fps: 30,
    durationFrames: overrides.durationFrames ?? 300,
    tracks: [],
    clips: [],
  };
}

const defaultProps = {
  onRenameTrack: vi.fn(),
  onToggleMute: vi.fn(),
  onToggleLock: vi.fn(),
};

function renderPanel(opts: {
  pxPerFrame?: number;
  scrollOffsetX?: number;
  durationFrames?: number;
  playheadFrame?: number;
} = {}) {
  vi.mocked(ephemeralStore.useEphemeralStore).mockReturnValue(
    makeEphemeralState({ pxPerFrame: opts.pxPerFrame, scrollOffsetX: opts.scrollOffsetX, playheadFrame: opts.playheadFrame }),
  );
  vi.mocked(projectStore.useProjectStore).mockReturnValue(
    makeProjectState({ durationFrames: opts.durationFrames }) as never,
  );
  vi.mocked(projectStore.getSnapshot).mockReturnValue(
    makeProjectState({ durationFrames: opts.durationFrames }) as never,
  );

  const result = render(<TimelinePanel {...defaultProps} />);
  triggerResize!(800);
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TimelinePanel — return-to-first-frame button', () => {
  it('does NOT render the return-to-first-frame button when playheadFrame is 0', () => {
    renderPanel({ playheadFrame: 0 });
    expect(screen.queryByRole('button', { name: 'Return to first frame' })).toBeNull();
  });

  it('renders the return-to-first-frame button when playheadFrame > 0', () => {
    renderPanel({ playheadFrame: 60 });
    expect(screen.getByRole('button', { name: 'Return to first frame' })).toBeDefined();
  });

  it('calls setPlayheadFrame(0) when the button is clicked', () => {
    renderPanel({ playheadFrame: 90 });
    const btn = screen.getByRole('button', { name: 'Return to first frame' });
    fireEvent.click(btn);
    expect(vi.mocked(ephemeralStore.setPlayheadFrame)).toHaveBeenCalledWith(0);
  });
});

describe('TimelinePanel — scroll-to-beginning button', () => {
  it('does NOT render the scroll-to-beginning button when scrollOffsetX is 0', () => {
    renderPanel({ scrollOffsetX: 0 });
    expect(screen.queryByRole('button', { name: 'Scroll to beginning' })).toBeNull();
  });

  it('renders the scroll-to-beginning button when scrollOffsetX > 0', () => {
    renderPanel({ scrollOffsetX: 200 });
    expect(screen.getByRole('button', { name: 'Scroll to beginning' })).toBeDefined();
  });

  it('calls setScrollOffsetX(0) when the button is clicked', () => {
    renderPanel({ scrollOffsetX: 400 });
    const btn = screen.getByRole('button', { name: 'Scroll to beginning' });
    fireEvent.click(btn);
    expect(vi.mocked(ephemeralStore.setScrollOffsetX)).toHaveBeenCalledWith(0);
  });
});

describe('TimelinePanel — scroll overrun', () => {
  it('thumb size accounts for SCROLL_OVERRUN_PX=300 beyond content', () => {
    renderPanel({ pxPerFrame: 4, durationFrames: 100 });
    const thumb = screen.getByRole('scrollbar');
    const scrollableWidth = 100 * 4 + SCROLL_OVERRUN_PX; // 700
    const expectedWidth = Math.max(16, (LANE_WIDTH / scrollableWidth) * LANE_WIDTH);
    expect(parseFloat(thumb.style.width)).toBeCloseTo(expectedWidth, 0);
  });

  it('no overflow when scrollableWidth <= laneWidth', () => {
    // contentWidth=320, scrollableWidth=620 < laneWidth=640 → no overflow
    renderPanel({ pxPerFrame: 4, durationFrames: 80 });
    const thumb = screen.getByRole('scrollbar');
    expect(parseFloat(thumb.style.width)).toBe(LANE_WIDTH);
  });

  it('shows overflow when scrollableWidth > laneWidth due to overrun', () => {
    // contentWidth=360, scrollableWidth=660 > laneWidth=640 → overflow
    renderPanel({ pxPerFrame: 4, durationFrames: 90 });
    const thumb = screen.getByRole('scrollbar');
    const scrollableWidth = 90 * 4 + SCROLL_OVERRUN_PX; // 660
    const expectedWidth = Math.max(16, (LANE_WIDTH / scrollableWidth) * LANE_WIDTH);
    expect(parseFloat(thumb.style.width)).toBeCloseTo(expectedWidth, 0);
    expect(thumb.style.pointerEvents).toBe('auto');
  });
});
