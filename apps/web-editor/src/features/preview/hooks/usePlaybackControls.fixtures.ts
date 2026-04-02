import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock PlayerRef
// ---------------------------------------------------------------------------

/**
 * Creates a mock Remotion PlayerRef with controllable internal state.
 * `currentFrame.value` and `playing.value` can be mutated directly in tests
 * to simulate player behaviour without triggering real playback.
 */
export function makePlayerRef(overrides: Record<string, unknown> = {}) {
  const currentFrame = { value: 0 };
  const playing = { value: false };

  const player = {
    play: vi.fn(() => {
      playing.value = true;
    }),
    pause: vi.fn(() => {
      playing.value = false;
    }),
    seekTo: vi.fn((f: number) => {
      currentFrame.value = f;
    }),
    getCurrentFrame: vi.fn(() => currentFrame.value),
    isPlaying: vi.fn(() => playing.value),
    ...overrides,
  };

  return {
    ref: { current: player } as unknown as React.RefObject<import('@remotion/player').PlayerRef | null>,
    player,
    currentFrame,
    playing,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Builds a minimal ProjectDoc for testing. Spread `overrides` to customise. */
export function makeProjectDoc(overrides = {}) {
  return {
    schemaVersion: 1,
    id: '00000000-0000-0000-0000-000000000001',
    title: 'Test',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [],
    clips: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
