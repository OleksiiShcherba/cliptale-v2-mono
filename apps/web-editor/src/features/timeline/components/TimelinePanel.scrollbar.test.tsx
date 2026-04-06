/**
 * TimelinePanel — scrollbar strip behaviour.
 *
 * Tests cover:
 *   - strip renders with role="scrollbar"
 *   - thumb geometry when totalContentWidth > laneWidth (overflow)
 *   - thumb fills strip when totalContentWidth <= laneWidth (no overflow)
 *   - pointer events disabled when no overflow
 *   - thumb drag via pointer capture updates setScrollOffsetX
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import * as ephemeralStore from '@/store/ephemeral-store';
import * as projectStore from '@/store/project-store';

import { TimelinePanel } from './TimelinePanel';

// ── PointerEvent polyfill so clientX is honoured in JSDOM ────────────────────
//
// JSDOM's native PointerEvent does not forward MouseEventInit fields (clientX,
// clientY …) to the underlying MouseEvent, so e.clientX is always 0.
// Replacing it with a subclass that delegates to MouseEvent fixes this,
// matching the same pattern used in useClipDrag.test.ts.

class PointerEventWithClientX extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init as MouseEventInit);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? 'mouse';
    this.isPrimary = init.isPrimary ?? true;
  }
}
vi.stubGlobal('PointerEvent', PointerEventWithClientX);

// ── Mock stores and sub-components ────────────────────────────────────────────

vi.mock('@/store/ephemeral-store', async (importOriginal) => {
  const actual = await importOriginal<typeof ephemeralStore>();
  return {
    ...actual,
    useEphemeralStore: vi.fn(),
    setScrollOffsetX: vi.fn(),
    setPxPerFrame: vi.fn(),
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

// ── Stub ResizeObserver ───────────────────────────────────────────────────────
//
// We store the callback and fire it explicitly with act() AFTER the initial
// render so that the ResizeObserver result (width=800) wins over the inline
// `setPanelWidth(el.clientWidth)` call (which returns 0 in JSDOM).

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

/** TRACK_HEADER_WIDTH=160, panelWidth=800 → laneWidth=640 */
const LANE_WIDTH = 640;

function makeEphemeralState(overrides: {
  pxPerFrame?: number;
  scrollOffsetX?: number;
} = {}) {
  return {
    pxPerFrame: overrides.pxPerFrame ?? 4,
    scrollOffsetX: overrides.scrollOffsetX ?? 0,
    selectedClipIds: [],
    playheadFrame: 0,
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
} = {}) {
  vi.mocked(ephemeralStore.useEphemeralStore).mockReturnValue(
    makeEphemeralState({ pxPerFrame: opts.pxPerFrame, scrollOffsetX: opts.scrollOffsetX }),
  );
  vi.mocked(projectStore.useProjectStore).mockReturnValue(
    makeProjectState({ durationFrames: opts.durationFrames }) as never,
  );
  vi.mocked(projectStore.getSnapshot).mockReturnValue(
    makeProjectState({ durationFrames: opts.durationFrames }) as never,
  );

  const result = render(<TimelinePanel {...defaultProps} />);

  // Fire ResizeObserver with panelWidth=800 so laneWidth=640 is applied.
  triggerResize!(800);

  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TimelinePanel — scrollbar strip', () => {
  it('renders the scrollbar strip with role="scrollbar"', () => {
    renderPanel();
    expect(screen.getByRole('scrollbar')).toBeDefined();
  });

  describe('overflow — totalContentWidth (300 * 4 = 1200) > laneWidth (640)', () => {
    it('thumb width is proportional to laneWidth / totalContentWidth', () => {
      renderPanel({ pxPerFrame: 4, durationFrames: 300 });
      const thumb = screen.getByRole('scrollbar');
      // totalContentWidth = 300 * 4 = 1200
      const expectedWidth = Math.max(16, (LANE_WIDTH / 1200) * LANE_WIDTH);
      expect(parseFloat(thumb.style.width)).toBeCloseTo(expectedWidth, 0);
    });

    it('thumb left is 0 when scrollOffsetX is 0', () => {
      renderPanel({ pxPerFrame: 4, durationFrames: 300, scrollOffsetX: 0 });
      const thumb = screen.getByRole('scrollbar');
      expect(parseFloat(thumb.style.left)).toBe(0);
    });

    it('thumb left shifts right as scrollOffsetX increases', () => {
      renderPanel({ pxPerFrame: 4, durationFrames: 300, scrollOffsetX: 300 });
      const thumb = screen.getByRole('scrollbar');
      const thumbWidth = Math.max(16, (LANE_WIDTH / 1200) * LANE_WIDTH);
      const expectedLeft = Math.min((300 / 1200) * LANE_WIDTH, LANE_WIDTH - thumbWidth);
      expect(parseFloat(thumb.style.left)).toBeCloseTo(expectedLeft, 0);
    });

    it('enables pointer events on the thumb when overflowing', () => {
      renderPanel({ pxPerFrame: 4, durationFrames: 300 });
      const thumb = screen.getByRole('scrollbar');
      expect(thumb.style.pointerEvents).toBe('auto');
    });
  });

  describe('no overflow — totalContentWidth (50 * 4 = 200) <= laneWidth (640)', () => {
    it('thumb fills the full lane width', () => {
      renderPanel({ pxPerFrame: 4, durationFrames: 50 });
      const thumb = screen.getByRole('scrollbar');
      expect(parseFloat(thumb.style.width)).toBe(LANE_WIDTH);
    });

    it('disables pointer events when no overflow', () => {
      renderPanel({ pxPerFrame: 4, durationFrames: 50 });
      const thumb = screen.getByRole('scrollbar');
      expect(thumb.style.pointerEvents).toBe('none');
    });
  });

  describe('thumb drag updates scrollOffsetX', () => {
    /**
     * Dispatch a pointer event directly on the element with the correct clientX.
     * We use `MouseEvent` (which JSDOM properly initialises with clientX/Y) rather
     * than `PointerEvent` (whose init dict handling varies by JSDOM version).
     * React's event delegation picks up the bubbling event and dispatches it to
     * the React `onPointerDown`/`onPointerMove`/`onPointerUp` handlers.
     */
    function dispatchPointer(el: Element, type: string, clientX: number) {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX,
      });
      el.dispatchEvent(event);
    }

    it('calls setScrollOffsetX on pointer move after pointer down', () => {
      renderPanel({ pxPerFrame: 4, durationFrames: 300, scrollOffsetX: 0 });
      const thumb = screen.getByRole('scrollbar');

      // Stub setPointerCapture — jsdom does not implement it
      thumb.setPointerCapture = vi.fn();

      // Press down at clientX=200, then move right by 100px
      act(() => { dispatchPointer(thumb, 'pointerdown', 200); });
      act(() => { dispatchPointer(thumb, 'pointermove', 300); });

      // ratio = totalContentWidth / laneWidth = 1200 / 640 = 1.875
      // newOffset = 0 + 100 * 1.630 = 163.0
      const ratio = 1200 / LANE_WIDTH;
      const expectedOffset = Math.max(0, 0 + 100 * ratio);

      expect(vi.mocked(ephemeralStore.setScrollOffsetX)).toHaveBeenCalledWith(
        expect.closeTo(expectedOffset, 0),
      );
    });

    it('clamps offset to minimum 0 when dragging left past start', () => {
      renderPanel({ pxPerFrame: 4, durationFrames: 300, scrollOffsetX: 0 });
      const thumb = screen.getByRole('scrollbar');
      thumb.setPointerCapture = vi.fn();

      act(() => { dispatchPointer(thumb, 'pointerdown', 200); });
      // Move left by 500px — would produce negative offset
      act(() => { dispatchPointer(thumb, 'pointermove', -300); });

      // max(0, ...) floors it at 0
      expect(vi.mocked(ephemeralStore.setScrollOffsetX)).toHaveBeenCalledWith(0);
    });

    it('does not call setScrollOffsetX on pointer move without prior pointer down', () => {
      renderPanel({ pxPerFrame: 4, durationFrames: 300 });
      const thumb = screen.getByRole('scrollbar');

      act(() => { dispatchPointer(thumb, 'pointermove', 300); });

      expect(vi.mocked(ephemeralStore.setScrollOffsetX)).not.toHaveBeenCalled();
    });

    it('stops updating after pointer up', () => {
      renderPanel({ pxPerFrame: 4, durationFrames: 300, scrollOffsetX: 0 });
      const thumb = screen.getByRole('scrollbar');
      thumb.setPointerCapture = vi.fn();

      act(() => { dispatchPointer(thumb, 'pointerdown', 200); });
      act(() => { dispatchPointer(thumb, 'pointerup', 200); });

      vi.mocked(ephemeralStore.setScrollOffsetX).mockClear();

      act(() => { dispatchPointer(thumb, 'pointermove', 300); });
      expect(vi.mocked(ephemeralStore.setScrollOffsetX)).not.toHaveBeenCalled();
    });
  });
});
