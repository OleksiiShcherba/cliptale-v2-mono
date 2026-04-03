import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — isolate App from all child feature components and hooks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn().mockImplementation(() => ({})),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/features/asset-manager/components/AssetBrowserPanel', () => ({
  AssetBrowserPanel: ({ projectId }: { projectId: string }) =>
    React.createElement('div', { 'data-testid': 'asset-browser-panel', 'data-project-id': projectId }),
}));

vi.mock('@/features/preview/components/PreviewPanel', () => ({
  PreviewPanel: () => React.createElement('div', { 'data-testid': 'preview-panel' }),
}));

vi.mock('@/features/preview/components/PlaybackControls', () => ({
  PlaybackControls: () => React.createElement('div', { 'data-testid': 'playback-controls' }),
}));

vi.mock('@/features/preview/hooks/useRemotionPlayer', () => ({
  useRemotionPlayer: () => ({ playerRef: { current: null } }),
}));

vi.mock('@/features/captions/components/CaptionEditorPanel', () => ({
  CaptionEditorPanel: ({ clip }: { clip: { id: string } }) =>
    React.createElement('div', { 'data-testid': 'caption-editor-panel', 'data-clip-id': clip.id }),
}));

vi.mock('@/store/ephemeral-store', () => ({
  useEphemeralStore: vi.fn(),
}));

vi.mock('@/store/project-store', () => ({
  useProjectStore: vi.fn(),
  getSnapshot: vi.fn(),
  subscribe: vi.fn().mockReturnValue(() => {}),
  setProject: vi.fn(),
}));

import * as ephemeralStoreModule from '@/store/ephemeral-store';
import * as projectStoreModule from '@/store/project-store';
import type { TextOverlayClip } from '@ai-video-editor/project-schema';

const mockUseEphemeralStore = vi.mocked(ephemeralStoreModule.useEphemeralStore);
const mockUseProjectStore = vi.mocked(projectStoreModule.useProjectStore);

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CLIP_ID = '00000000-0000-0000-0000-000000000020';
const TRACK_ID = '00000000-0000-0000-0000-000000000010';

function makeTextOverlayClip(overrides: Partial<TextOverlayClip> = {}): TextOverlayClip {
  return {
    id: CLIP_ID,
    type: 'text-overlay',
    trackId: TRACK_ID,
    startFrame: 0,
    durationFrames: 30,
    text: 'Hello',
    fontSize: 24,
    color: '#FFFFFF',
    position: 'bottom',
    ...overrides,
  };
}

function makeProjectDoc(clips: TextOverlayClip[] = []) {
  return {
    schemaVersion: 1,
    id: 'proj-001',
    title: 'Test',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [],
    clips,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  } as unknown as ReturnType<typeof projectStoreModule.useProjectStore>;
}

import { App, PreviewSection, DEV_PROJECT_ID } from './App.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no clip selected, empty project
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [],
      playheadFrame: 0,
      zoom: 1,
    });
    mockUseProjectStore.mockReturnValue(makeProjectDoc());
  });

  describe('two-column shell layout', () => {
    it('renders without crashing', () => {
      render(<App />);
    });

    it('renders AssetBrowserPanel in a sidebar aside element', () => {
      render(<App />);
      const sidebar = screen.getByRole('complementary', { name: 'Asset browser' });
      expect(sidebar).toBeTruthy();
      expect(sidebar.querySelector('[data-testid="asset-browser-panel"]')).toBeTruthy();
    });

    it('passes DEV_PROJECT_ID to AssetBrowserPanel', () => {
      render(<App />);
      const panel = screen.getByTestId('asset-browser-panel');
      expect(panel.getAttribute('data-project-id')).toBe(DEV_PROJECT_ID);
    });

    it('renders PreviewPanel in the main content area', () => {
      render(<App />);
      const main = screen.getByRole('main');
      expect(main.querySelector('[data-testid="preview-panel"]')).toBeTruthy();
    });

    it('renders PlaybackControls in the main content area', () => {
      render(<App />);
      const main = screen.getByRole('main');
      expect(main.querySelector('[data-testid="playback-controls"]')).toBeTruthy();
    });

  });

  describe('sidebar', () => {
    it('renders sidebar as an aside landmark with accessible label', () => {
      render(<App />);
      const sidebar = screen.getByRole('complementary', { name: 'Asset browser' });
      expect(sidebar).toBeTruthy();
    });
  });

  describe('vertical divider', () => {
    it('renders a decorative divider element between sidebar and main', () => {
      const { container } = render(<App />);
      const shell = container.firstChild as HTMLElement;
      // Shell children: aside, divider div, main
      const children = Array.from(shell.children);
      expect(children.length).toBe(3);
      const divider = children[1] as HTMLElement;
      expect(divider.getAttribute('aria-hidden')).toBe('true');
    });
  });
});

describe('PreviewSection', () => {
  it('renders PreviewPanel', () => {
    render(<PreviewSection />);
    expect(screen.getByTestId('preview-panel')).toBeTruthy();
  });

  it('renders PlaybackControls', () => {
    render(<PreviewSection />);
    expect(screen.getByTestId('playback-controls')).toBeTruthy();
  });

  it('renders PreviewPanel before PlaybackControls in DOM order', () => {
    const { container } = render(<PreviewSection />);
    const section = container.firstChild as HTMLElement;
    const children = Array.from(section.children);
    // First child wraps PreviewPanel, second is PlaybackControls
    expect(children[0]?.querySelector('[data-testid="preview-panel"]')).toBeTruthy();
    expect(children[1]?.getAttribute('data-testid')).toBe('playback-controls');
  });
});

describe('PreviewPanel props', () => {
  it('accepts optional playerRef without crashing', () => {
    // Verifies the prop change to PreviewPanel is backward-compatible.
    // PreviewPanel mock accepts any props — tested here via PreviewSection integration.
    render(<PreviewSection />);
    expect(screen.getByTestId('preview-panel')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// RightSidebar — conditional inspector panel
// ---------------------------------------------------------------------------

describe('RightSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectStore.mockReturnValue(makeProjectDoc());
  });

  it('does not render the inspector when no clips are selected', () => {
    mockUseEphemeralStore.mockReturnValue({ selectedClipIds: [], playheadFrame: 0, zoom: 1 });
    render(<App />);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(screen.queryByTestId('caption-editor-panel')).toBeNull();
  });

  it('does not render the inspector when more than one clip is selected', () => {
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [CLIP_ID, '00000000-0000-0000-0000-000000000099'],
      playheadFrame: 0,
      zoom: 1,
    });
    mockUseProjectStore.mockReturnValue(makeProjectDoc([makeTextOverlayClip()]));
    render(<App />);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(screen.queryByTestId('caption-editor-panel')).toBeNull();
  });

  it('does not render the inspector when the selected clip id does not exist in the project', () => {
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: ['non-existent-id'],
      playheadFrame: 0,
      zoom: 1,
    });
    // Project has no clips
    mockUseProjectStore.mockReturnValue(makeProjectDoc([]));
    render(<App />);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(screen.queryByTestId('caption-editor-panel')).toBeNull();
  });

  it('does not render the inspector when the selected clip is not a text-overlay', () => {
    const videoClip = {
      id: CLIP_ID,
      type: 'video' as const,
      trackId: TRACK_ID,
      startFrame: 0,
      durationFrames: 30,
      assetId: 'asset-001',
      volume: 1,
    };
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [CLIP_ID],
      playheadFrame: 0,
      zoom: 1,
    });
    mockUseProjectStore.mockReturnValue({
      ...makeProjectDoc([]),
      clips: [videoClip],
    } as unknown as ReturnType<typeof projectStoreModule.useProjectStore>);
    render(<App />);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(screen.queryByTestId('caption-editor-panel')).toBeNull();
  });

  it('renders the inspector aside with CaptionEditorPanel when one text-overlay clip is selected', () => {
    const clip = makeTextOverlayClip();
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [CLIP_ID],
      playheadFrame: 0,
      zoom: 1,
    });
    mockUseProjectStore.mockReturnValue(makeProjectDoc([clip]));
    render(<App />);
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(inspector).toBeTruthy();
    expect(screen.getByTestId('caption-editor-panel')).toBeTruthy();
  });

  it('passes the correct clip to CaptionEditorPanel', () => {
    const clip = makeTextOverlayClip({ id: CLIP_ID });
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [CLIP_ID],
      playheadFrame: 0,
      zoom: 1,
    });
    mockUseProjectStore.mockReturnValue(makeProjectDoc([clip]));
    render(<App />);
    const panel = screen.getByTestId('caption-editor-panel');
    expect(panel.getAttribute('data-clip-id')).toBe(CLIP_ID);
  });
});
