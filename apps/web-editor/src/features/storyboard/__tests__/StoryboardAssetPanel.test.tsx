/**
 * Tests for StoryboardAssetPanel — ST-B6 A2 + A3.
 *
 * Covers:
 * - Renders a panel container with data-testid="storyboard-asset-panel"
 * - Renders AssetBrowserPanel with the draftId as projectId
 * - Passes hideTranscribe={true} to AssetBrowserPanel (A3)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAssetBrowserPanel = vi.fn(
  ({
    projectId,
    hideTranscribe,
  }: {
    projectId: string;
    hideTranscribe?: boolean;
  }) => (
    <div
      data-testid="asset-browser-panel-mock"
      data-project-id={projectId}
      data-hide-transcribe={String(hideTranscribe ?? false)}
    />
  ),
);

vi.mock('@/features/asset-manager/components/AssetBrowserPanel', () => ({
  AssetBrowserPanel: (
    props: { projectId: string; hideTranscribe?: boolean },
  ) => mockAssetBrowserPanel(props),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { StoryboardAssetPanel } from '@/features/storyboard/components/StoryboardAssetPanel';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StoryboardAssetPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the outer container with data-testid="storyboard-asset-panel"', () => {
    render(<StoryboardAssetPanel draftId="d-001" />);
    expect(screen.getByTestId('storyboard-asset-panel')).toBeTruthy();
  });

  it('renders AssetBrowserPanel with draftId as projectId', () => {
    render(<StoryboardAssetPanel draftId="d-abc" />);
    const panel = screen.getByTestId('asset-browser-panel-mock');
    expect(panel.getAttribute('data-project-id')).toBe('d-abc');
  });

  it('passes hideTranscribe={true} to AssetBrowserPanel (A3)', () => {
    render(<StoryboardAssetPanel draftId="d-001" />);
    const panel = screen.getByTestId('asset-browser-panel-mock');
    expect(panel.getAttribute('data-hide-transcribe')).toBe('true');
  });

  it('updates projectId when draftId prop changes', () => {
    const { rerender } = render(<StoryboardAssetPanel draftId="d-001" />);
    rerender(<StoryboardAssetPanel draftId="d-002" />);
    const panel = screen.getByTestId('asset-browser-panel-mock');
    expect(panel.getAttribute('data-project-id')).toBe('d-002');
  });
});
