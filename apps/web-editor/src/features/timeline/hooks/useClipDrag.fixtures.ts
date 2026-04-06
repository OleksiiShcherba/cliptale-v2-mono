import { vi } from 'vitest';

import type { Clip, ProjectDoc } from '@ai-video-editor/project-schema';

// ---------------------------------------------------------------------------
// jsdom polyfill for PointerEvent
// ---------------------------------------------------------------------------

if (typeof PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init?: PointerEventInit) {
      super(type, init);
      this.pointerId = init?.pointerId ?? 0;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).PointerEvent = PointerEventPolyfill;
}

export const TRACK_ROW_HEIGHT = 48;

export const makeClip = (id: string, startFrame: number, trackId = 'track-001'): Clip => ({
  id,
  type: 'video',
  assetId: 'asset-001',
  trackId,
  startFrame,
  durationFrames: 30,
  trimInFrame: 0,
  volume: 1,
  opacity: 1,
});

export const makeProject = (
  clips: Clip[],
  extraTracks: Array<{ id: string; name: string }> = [],
): ProjectDoc => ({
  schemaVersion: 1,
  id: 'project-001',
  title: 'Test',
  fps: 30,
  durationFrames: 300,
  width: 1920,
  height: 1080,
  tracks: [
    { id: 'track-001', type: 'video', name: 'Video', muted: false, locked: false },
    ...extraTracks.map(t => ({
      id: t.id,
      type: 'video' as const,
      name: t.name,
      muted: false,
      locked: false,
    })),
  ],
  clips,
  createdAt: '',
  updatedAt: '',
} as unknown as ProjectDoc);

/** Creates a minimal React.PointerEvent-like object for testing. */
export const makeReactPointerEvent = (clientX: number, button = 0) => {
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  return {
    button,
    clientX,
    pointerId: 1,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: { setPointerCapture, releasePointerCapture },
  } as unknown as React.PointerEvent;
};

/** Dispatches a PointerEvent on the document. */
export const dispatchPointerEvent = (type: string, clientX: number, clientY = 0) => {
  const event = new PointerEvent(type, { clientX, clientY, pointerId: 1, bubbles: true });
  const releasePointerCapture = vi.fn();
  Object.defineProperty(event, 'target', {
    value: { releasePointerCapture },
    writable: true,
  });
  document.dispatchEvent(event);
  return event;
};
