import { vi } from 'vitest';

import type { CaptionClip, TextOverlayClip } from '@ai-video-editor/project-schema';

export const CLIP_ID = '00000000-0000-0000-0000-000000000020';
export const TRACK_ID = '00000000-0000-0000-0000-000000000010';

/** Factory for a default `TextOverlayClip` used by the panel tests. */
export function makeClip(overrides: Partial<TextOverlayClip> = {}): TextOverlayClip {
  return {
    id: CLIP_ID,
    type: 'text-overlay',
    trackId: TRACK_ID,
    startFrame: 10,
    durationFrames: 50,
    text: 'Hello world',
    fontSize: 24,
    color: '#FFFFFF',
    position: 'bottom',
    ...overrides,
  };
}

/** Factory for a default `CaptionClip` (empty words array) used by the panel tests. */
export function makeCaptionClip(overrides: Partial<CaptionClip> = {}): CaptionClip {
  return {
    id: CLIP_ID,
    type: 'caption',
    trackId: TRACK_ID,
    startFrame: 10,
    durationFrames: 50,
    words: [],
    activeColor: '#FFFFFF',
    inactiveColor: 'rgba(255,255,255,0.35)',
    fontSize: 24,
    position: 'bottom',
    ...overrides,
  };
}

/** Builds a fresh set of mocked handlers for the text-overlay branch of `useCaptionEditor`. */
export function makeHandlers() {
  return {
    type: 'text-overlay' as const,
    setText: vi.fn(),
    setStartFrame: vi.fn(),
    setEndFrame: vi.fn(),
    setFontSize: vi.fn(),
    setColor: vi.fn(),
    setPosition: vi.fn(),
  };
}

/** Builds a fresh set of mocked handlers for the caption branch of `useCaptionEditor`. */
export function makeCaptionHandlers() {
  return {
    type: 'caption' as const,
    setStartFrame: vi.fn(),
    setEndFrame: vi.fn(),
    setFontSize: vi.fn(),
    setPosition: vi.fn(),
    setActiveColor: vi.fn(),
    setInactiveColor: vi.fn(),
  };
}
