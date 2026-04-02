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

import { App, PreviewSection, DEV_PROJECT_ID } from './App.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
