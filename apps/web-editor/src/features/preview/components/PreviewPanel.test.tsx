import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

import type { ProjectDoc } from '@ai-video-editor/project-schema';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Capture Player call args and the ref forwarded to Player for assertions.
// Must be declared via vi.hoisted() so they are available inside the vi.mock factory
// (which is hoisted to the top of the file before any variable declarations).
const { mockPlayerProps, getCapturedRef, setCapturedRef } = vi.hoisted(() => {
  const mockPlayerProps: Record<string, unknown>[] = [];
  let capturedRef: React.Ref<unknown> | null = null;
  return {
    mockPlayerProps,
    getCapturedRef: () => capturedRef,
    setCapturedRef: (ref: React.Ref<unknown> | null) => { capturedRef = ref; },
  };
});

vi.mock('@remotion/player', () => ({
  Player: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
    mockPlayerProps.push(props);
    setCapturedRef(ref);
    return React.createElement('div', { 'data-testid': 'remotion-player' });
  }),
}));

vi.mock('@ai-video-editor/remotion-comps', () => ({
  VideoComposition: () => null,
}));

vi.mock('../hooks/useRemotionPlayer.js', () => ({
  useRemotionPlayer: vi.fn(),
}));

// Pass stream URLs through unchanged — prefetch behavior is tested separately.
vi.mock('../hooks/usePrefetchAssets.js', () => ({
  usePrefetchAssets: (urls: Record<string, string>) => urls,
}));

import { useRemotionPlayer } from '../hooks/useRemotionPlayer.js';
import { PreviewPanel } from './PreviewPanel.js';

const mockUseRemotionPlayer = vi.mocked(useRemotionPlayer);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProjectDoc(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
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
  } as unknown as ProjectDoc;
}

function makeHookResult(docOverrides: Partial<ProjectDoc> = {}, assetUrls: Record<string, string> = {}) {
  return {
    projectDoc: makeProjectDoc(docOverrides),
    assetUrls,
    currentFrame: 0,
    playerRef: { current: null },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PreviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayerProps.length = 0;
    setCapturedRef(null);
    mockUseRemotionPlayer.mockReturnValue(makeHookResult() as ReturnType<typeof useRemotionPlayer>);
  });

  describe('rendering', () => {
    it('renders without crashing', () => {
      const { getByTestId } = render(<PreviewPanel />);
      expect(getByTestId('remotion-player')).toBeTruthy();
    });

    it('renders a container div wrapping the player', () => {
      const { container } = render(<PreviewPanel />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.tagName).toBe('DIV');
      expect(wrapper.querySelector('[data-testid="remotion-player"]')).toBeTruthy();
    });
  });

  describe('Player props from projectDoc', () => {
    it('passes fps from projectDoc to Player', () => {
      mockUseRemotionPlayer.mockReturnValue(
        makeHookResult({ fps: 24 }) as ReturnType<typeof useRemotionPlayer>,
      );
      render(<PreviewPanel />);
      expect(mockPlayerProps[0]?.fps).toBe(24);
    });

    it('passes durationFrames as durationInFrames to Player', () => {
      mockUseRemotionPlayer.mockReturnValue(
        makeHookResult({ durationFrames: 600 }) as ReturnType<typeof useRemotionPlayer>,
      );
      render(<PreviewPanel />);
      expect(mockPlayerProps[0]?.durationInFrames).toBe(600);
    });

    it('passes width as compositionWidth to Player', () => {
      mockUseRemotionPlayer.mockReturnValue(
        makeHookResult({ width: 1280 }) as ReturnType<typeof useRemotionPlayer>,
      );
      render(<PreviewPanel />);
      expect(mockPlayerProps[0]?.compositionWidth).toBe(1280);
    });

    it('passes height as compositionHeight to Player', () => {
      mockUseRemotionPlayer.mockReturnValue(
        makeHookResult({ height: 720 }) as ReturnType<typeof useRemotionPlayer>,
      );
      render(<PreviewPanel />);
      expect(mockPlayerProps[0]?.compositionHeight).toBe(720);
    });

    it('sets controls to false on Player', () => {
      render(<PreviewPanel />);
      expect(mockPlayerProps[0]?.controls).toBe(false);
    });
  });

  describe('inputProps memoization', () => {
    it('passes projectDoc inside inputProps', () => {
      const doc = makeProjectDoc({ title: 'Memoized Doc' });
      mockUseRemotionPlayer.mockReturnValue({
        projectDoc: doc,
        assetUrls: {},
        currentFrame: 0,
        playerRef: { current: null },
      } as ReturnType<typeof useRemotionPlayer>);
      render(<PreviewPanel />);
      const inputProps = mockPlayerProps[0]?.inputProps as { projectDoc: ProjectDoc } | undefined;
      expect(inputProps?.projectDoc.title).toBe('Memoized Doc');
    });

    it('passes assetUrls inside inputProps', () => {
      const assetUrls = { 'asset-1': 'https://cdn.example.com/video.mp4' };
      mockUseRemotionPlayer.mockReturnValue(
        makeHookResult({}, assetUrls) as ReturnType<typeof useRemotionPlayer>,
      );
      render(<PreviewPanel />);
      const inputProps = mockPlayerProps[0]?.inputProps as { assetUrls: Record<string, string> } | undefined;
      expect(inputProps?.assetUrls).toEqual(assetUrls);
    });
  });

  describe('container styling', () => {
    it('applies surface background color to container', () => {
      const { container } = render(<PreviewPanel />);
      const wrapper = container.firstChild as HTMLElement;
      // jsdom normalizes hex colors to rgb() — #0D0D14 = rgb(13, 13, 20)
      expect(wrapper.style.background).toBe('rgb(13, 13, 20)');
    });
  });

  describe('playerRef prop forwarding', () => {
    it('uses the internal playerRef from useRemotionPlayer when no prop is passed', () => {
      const internalRef = { current: null };
      mockUseRemotionPlayer.mockReturnValue({
        ...makeHookResult(),
        playerRef: internalRef,
      } as ReturnType<typeof useRemotionPlayer>);

      render(<PreviewPanel />);

      // capturedRef must be the same object reference as internalRef
      expect(getCapturedRef()).toBe(internalRef);
    });

    it('forwards the external playerRef to the Player when provided as a prop', () => {
      const internalRef = { current: null };
      const externalRef = { current: null };

      mockUseRemotionPlayer.mockReturnValue({
        ...makeHookResult(),
        playerRef: internalRef,
      } as ReturnType<typeof useRemotionPlayer>);

      render(<PreviewPanel playerRef={externalRef} />);

      // capturedRef must be the external ref, not the internal one
      expect(getCapturedRef()).toBe(externalRef);
      expect(getCapturedRef()).not.toBe(internalRef);
    });

    it('does not call useRemotionPlayer with an external ref — it is provided directly', () => {
      const externalRef = { current: null };
      mockUseRemotionPlayer.mockReturnValue(makeHookResult() as ReturnType<typeof useRemotionPlayer>);

      render(<PreviewPanel playerRef={externalRef} />);

      // The hook is still called (it always is — for projectDoc/assetUrls), but
      // the external ref wins over the internal one for the Player ref prop.
      expect(getCapturedRef()).toBe(externalRef);
    });
  });
});
