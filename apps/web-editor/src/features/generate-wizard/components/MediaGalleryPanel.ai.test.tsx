/**
 * MediaGalleryPanel — AI tab tests.
 *
 * Split from MediaGalleryPanel.test.tsx per §9.7 300-line cap.
 * Covers the new "AI" tab added in Subtask 6:
 * 1. AI tab is present in the tab list
 * 2. Switching to AI tab with a draftId renders AiGenerationPanel with draft context
 * 3. AI tab panel replaces the Recent tab panel
 * 4. Upload button is hidden while the AI tab is active
 * 5. Without a draftId, AI tab shows an unavailable message
 * 6. onSwitchToAssets from AiGenerationPanel navigates back to Recent tab
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MediaGalleryPanel } from './MediaGalleryPanel';
import type { AssetListResponse } from '../types';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports of mocked modules
// ---------------------------------------------------------------------------

vi.mock('@/features/generate-wizard/api', () => ({
  listAssets: vi.fn().mockImplementation(
    () => new Promise<AssetListResponse>(() => { /* never resolves — keeps queries pending */ }),
  ),
}));

vi.mock('@/lib/api-client', () => ({
  buildAuthenticatedUrl: (url: string) => `${url}?token=test-token`,
  getAuthToken: () => 'test-token',
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const { mockUploadFiles, mockClearEntries } = vi.hoisted(() => ({
  mockUploadFiles: vi.fn(),
  mockClearEntries: vi.fn(),
}));

vi.mock('@/shared/file-upload/useFileUpload', () => ({
  useFileUpload: vi.fn().mockReturnValue({
    entries: [],
    isUploading: false,
    uploadFiles: mockUploadFiles,
    clearEntries: mockClearEntries,
  }),
}));

vi.mock('@/shared/file-upload/UploadDropzone', () => ({
  UploadDropzone: () => React.createElement('div', { 'data-testid': 'upload-dropzone' }),
}));

/**
 * Lightweight stub for AiGenerationPanel that captures the context prop and
 * exposes a button to invoke onSwitchToAssets — enough to verify wiring.
 */
vi.mock('@/shared/ai-generation/components/AiGenerationPanel', () => ({
  AiGenerationPanel: ({
    context,
    onSwitchToAssets,
  }: {
    context: { kind: string; id: string };
    onSwitchToAssets?: () => void;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'ai-generation-panel',
        'data-context-kind': context.kind,
        'data-context-id': context.id,
      },
      React.createElement(
        'button',
        { onClick: onSwitchToAssets, 'data-testid': 'ai-switch-to-assets' },
        'View in Assets',
      ),
    ),
}));

// ---------------------------------------------------------------------------
// Test wrapper helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderPanel(onAssetSelected = vi.fn(), draftId: string | undefined = 'draft-1') {
  const queryClient = makeQueryClient();
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MediaGalleryPanel onAssetSelected={onAssetSelected} draftId={draftId} />
      </QueryClientProvider>,
    ),
  };
}

function renderPanelNoDraft(onAssetSelected = vi.fn()) {
  return renderPanel(onAssetSelected, undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MediaGalleryPanel / AI tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render an AI tab in the tab list', () => {
    renderPanel();
    expect(screen.getByRole('tab', { name: 'AI' })).toBeTruthy();
  });

  it('should render AiGenerationPanel with draft context when AI tab is clicked', () => {
    renderPanel(vi.fn(), 'draft-42');

    fireEvent.click(screen.getByRole('tab', { name: 'AI' }));

    const panel = screen.getByTestId('ai-generation-panel');
    expect(panel).toBeTruthy();
    expect(panel.getAttribute('data-context-kind')).toBe('draft');
    expect(panel.getAttribute('data-context-id')).toBe('draft-42');
  });

  it('should mount AiGenerationPanel inside a tabpanel with correct ARIA attributes', () => {
    renderPanel(vi.fn(), 'draft-42');

    fireEvent.click(screen.getByRole('tab', { name: 'AI' }));

    const tabpanel = screen.getByTestId('tabpanel-ai');
    expect(tabpanel.getAttribute('role')).toBe('tabpanel');
    expect(tabpanel.getAttribute('aria-labelledby')).toBe('tab-ai');
    expect(screen.getByTestId('ai-generation-panel')).toBeTruthy();
  });

  it('should hide the Recent tab panel when AI tab is active', () => {
    renderPanel(vi.fn(), 'draft-42');

    fireEvent.click(screen.getByRole('tab', { name: 'AI' }));

    expect(screen.queryByTestId('tabpanel-recent')).toBeNull();
    expect(screen.getByTestId('tabpanel-ai')).toBeTruthy();
  });

  it('should hide the Upload button when AI tab is active', () => {
    renderPanel(vi.fn(), 'draft-abc');

    // Upload button is visible on the default Recent tab
    expect(screen.getByTestId('upload-button')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'AI' }));

    // Upload button should be hidden while on the AI tab
    expect(screen.queryByTestId('upload-button')).toBeNull();
  });

  it('should show unavailable message when AI tab is active but draftId is undefined', () => {
    renderPanelNoDraft();

    fireEvent.click(screen.getByRole('tab', { name: 'AI' }));

    expect(screen.queryByTestId('ai-generation-panel')).toBeNull();
    expect(
      screen.getByText('AI generation is available after the draft is created.'),
    ).toBeTruthy();
  });

  it('should switch back to Recent tab when onSwitchToAssets is invoked from AiGenerationPanel', () => {
    renderPanel(vi.fn(), 'draft-42');

    fireEvent.click(screen.getByRole('tab', { name: 'AI' }));
    expect(screen.getByTestId('tabpanel-ai')).toBeTruthy();

    // Simulate the AI panel calling onSwitchToAssets (e.g. "View in Assets" button)
    fireEvent.click(screen.getByTestId('ai-switch-to-assets'));

    // Should navigate back to the Recent tab
    expect(screen.getByTestId('tabpanel-recent')).toBeTruthy();
    expect(screen.queryByTestId('tabpanel-ai')).toBeNull();
  });
});
