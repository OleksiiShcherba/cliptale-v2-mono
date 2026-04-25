/**
 * Scope toggle tests for MediaGalleryPanel.
 *
 * Covers:
 * 1. Scope toggle rendered when draftId provided
 * 2. Scope toggle hidden when no draftId
 * 3. Default label is "Show all" (scope=draft)
 * 4. Clicking toggle shows "Show only this draft"
 * 5. Auto-switch to all when draft-scoped list is empty on first load
 * 6. aria-pressed reflects current scope
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MediaGalleryPanel } from './MediaGalleryPanel';
import type { AssetListResponse } from '../types';
import { EMPTY_RESPONSE, MIXED_RESPONSE } from './MediaGalleryPanel.fixtures';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/features/generate-wizard/api', () => ({
  listAssets: vi.fn(),
  listDraftAssets: vi.fn(),
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

vi.mock('@/shared/ai-generation/components/AiGenerationPanel', () => ({
  AiGenerationPanel: () =>
    React.createElement('div', { 'data-testid': 'ai-generation-panel' }),
}));

vi.mock('@/shared/file-upload/UploadDropzone', () => ({
  UploadDropzone: ({ onClose }: { onClose: () => void }) =>
    React.createElement('div', { 'data-testid': 'upload-dropzone' },
      React.createElement('button', { onClick: onClose }, 'Cancel'),
    ),
}));

import { listAssets, listDraftAssets } from '@/features/generate-wizard/api';

const mockListAssets = vi.mocked(listAssets);
const mockListDraftAssets = vi.mocked(listDraftAssets);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderPanel(draftId: string | undefined = 'draft-1') {
  const queryClient = makeQueryClient();
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MediaGalleryPanel onAssetSelected={vi.fn()} draftId={draftId} />
      </QueryClientProvider>,
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MediaGalleryPanel — scope toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: draft-scoped and full-library both return MIXED_RESPONSE
    mockListDraftAssets.mockResolvedValue(MIXED_RESPONSE);
    mockListAssets.mockResolvedValue(MIXED_RESPONSE);
  });

  it('renders the scope toggle when draftId is provided', async () => {
    renderPanel('draft-1');
    await waitFor(() => {
      expect(screen.getByTestId('scope-toggle')).toBeTruthy();
    });
  });

  it('does NOT render the scope toggle when draftId is undefined', async () => {
    mockListAssets.mockResolvedValue(MIXED_RESPONSE);
    renderPanel(undefined);
    await waitFor(() => {
      expect(screen.queryByTestId('scope-toggle')).toBeNull();
    });
  });

  it('shows "Show all" label by default (scope=draft)', async () => {
    renderPanel('draft-1');
    await waitFor(() => {
      expect(screen.getByTestId('scope-toggle').textContent).toBe('Show all');
    });
  });

  it('toggle has aria-pressed=false when scope is draft', async () => {
    renderPanel('draft-1');
    await waitFor(() => {
      expect(screen.getByTestId('scope-toggle').getAttribute('aria-pressed')).toBe('false');
    });
  });

  it('clicking toggle changes label to "Show only this draft"', async () => {
    renderPanel('draft-1');
    await waitFor(() => {
      expect(screen.getByTestId('scope-toggle')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('scope-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('scope-toggle').textContent).toBe('Show only this draft');
    });
  });

  it('toggle has aria-pressed=true after switching to all', async () => {
    renderPanel('draft-1');
    await waitFor(() => {
      expect(screen.getByTestId('scope-toggle')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('scope-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('scope-toggle').getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('clicking toggle again restores "Show all" label', async () => {
    renderPanel('draft-1');
    await waitFor(() => {
      expect(screen.getByTestId('scope-toggle')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('scope-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('scope-toggle').textContent).toBe('Show only this draft');
    });

    fireEvent.click(screen.getByTestId('scope-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('scope-toggle').textContent).toBe('Show all');
    });
  });

  it('auto-switches to all when draft-scoped list is empty on first load', async () => {
    // First draft-scope call returns empty; all-scope returns data
    mockListDraftAssets.mockResolvedValue(EMPTY_RESPONSE as AssetListResponse);
    mockListAssets.mockResolvedValue(MIXED_RESPONSE);

    renderPanel('draft-empty');

    await waitFor(() => {
      // After auto-switch the toggle should show "Show only this draft"
      expect(screen.getByTestId('scope-toggle').textContent).toBe('Show only this draft');
    });
  });

  it('auto-switch sets aria-pressed=true on toggle after empty first load', async () => {
    mockListDraftAssets.mockResolvedValue(EMPTY_RESPONSE as AssetListResponse);
    mockListAssets.mockResolvedValue(MIXED_RESPONSE);

    renderPanel('draft-empty');

    await waitFor(() => {
      expect(screen.getByTestId('scope-toggle').getAttribute('aria-pressed')).toBe('true');
    });
  });
});
