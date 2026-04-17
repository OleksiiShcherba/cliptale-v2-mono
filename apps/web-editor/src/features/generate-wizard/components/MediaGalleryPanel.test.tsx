/**
 * MediaGalleryPanel tests.
 *
 * Covers 10 scenarios as specified in the subtask acceptance criteria:
 * 1. Skeleton while query is loading
 * 2. Error state on query failure
 * 3. Empty state on items: []
 * 4. Items grouped into Videos / Images / Audio sections
 * 5. Clicking AssetThumbCard fires onAssetSelected
 * 6. Clicking AudioRowCard fires onAssetSelected
 * 7. Folders tab shows placeholder; Recent content hidden
 * 8. Footer GB used format
 * 9. Thumbnails use buildAuthenticatedUrl
 * 10. Section header omitted when group has no items
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MediaGalleryPanel } from './MediaGalleryPanel';
import type { AssetListResponse } from '../types';
import {
  MIXED_RESPONSE,
  EMPTY_RESPONSE,
  VIDEO_ONLY_RESPONSE,
  VIDEO_ASSET,
  AUDIO_ASSET,
} from './MediaGalleryPanel.fixtures';

// ---------------------------------------------------------------------------
// Mock api module
// ---------------------------------------------------------------------------

vi.mock('@/features/generate-wizard/api', () => ({
  listAssets: vi.fn(),
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

import { listAssets } from '@/features/generate-wizard/api';

const mockListAssets = vi.mocked(listAssets);

// ---------------------------------------------------------------------------
// Test wrapper helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function renderPanel(onAssetSelected = vi.fn()) {
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MediaGalleryPanel onAssetSelected={onAssetSelected} />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Helpers to simulate query states
// ---------------------------------------------------------------------------

function mockPending() {
  mockListAssets.mockImplementation(
    () => new Promise<AssetListResponse>(() => { /* never resolves */ }),
  );
}

function mockSuccess(response: AssetListResponse) {
  mockListAssets.mockResolvedValue(response);
}

function mockFailure() {
  mockListAssets.mockRejectedValue(new Error('Network error'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MediaGalleryPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should render skeleton while the query is loading', () => {
    mockPending();
    renderPanel();
    expect(screen.getByTestId('gallery-skeleton')).toBeTruthy();
  });

  it('should render error state when the query fails', async () => {
    mockFailure();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText('Could not load assets')).toBeTruthy();
    });
  });

  it('should render empty state when items is empty', async () => {
    mockSuccess(EMPTY_RESPONSE);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('No assets yet — upload in the editor')).toBeTruthy();
    });
  });

  it('should render Videos, Images, and Audio section groups', async () => {
    mockSuccess(MIXED_RESPONSE);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('asset-group-videos')).toBeTruthy();
      expect(screen.getByTestId('asset-group-images')).toBeTruthy();
      expect(screen.getByTestId('asset-group-audio')).toBeTruthy();
    });
  });

  it('should fire onAssetSelected when an AssetThumbCard is clicked', async () => {
    mockSuccess(MIXED_RESPONSE);
    const onAssetSelected = vi.fn();
    renderPanel(onAssetSelected);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: VIDEO_ASSET.label })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: VIDEO_ASSET.label }));
    expect(onAssetSelected).toHaveBeenCalledWith(VIDEO_ASSET);
  });

  it('should fire onAssetSelected when an AudioRowCard is clicked', async () => {
    mockSuccess(MIXED_RESPONSE);
    const onAssetSelected = vi.fn();
    renderPanel(onAssetSelected);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: AUDIO_ASSET.label })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: AUDIO_ASSET.label }));
    expect(onAssetSelected).toHaveBeenCalledWith(AUDIO_ASSET);
  });

  it('should show Folders placeholder when the Folders tab is clicked', async () => {
    mockSuccess(MIXED_RESPONSE);
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId('tabpanel-recent')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Folders' }));

    expect(screen.getByTestId('folders-placeholder')).toBeTruthy();
    expect(screen.getByText('Folders coming soon')).toBeTruthy();
    // Recent tab panel should no longer be visible
    expect(screen.queryByTestId('tabpanel-recent')).toBeNull();
  });

  it('should show GB used with 2 decimal places in the footer', async () => {
    mockSuccess(MIXED_RESPONSE); // bytesUsed = 1.5 * 1024^3
    renderPanel();

    await waitFor(() => {
      const el = screen.getByTestId('footer-gb-used');
      expect(el.textContent).toContain('1.50 GB');
    });
  });

  it('should build thumbnail URLs through buildAuthenticatedUrl', async () => {
    mockSuccess(MIXED_RESPONSE);
    renderPanel();

    await waitFor(() => {
      const img = screen.getByAltText(VIDEO_ASSET.label) as HTMLImageElement;
      expect(img.src).toContain('token=test-token');
    });
  });

  it('should omit a section header when that group has no items', async () => {
    mockSuccess(VIDEO_ONLY_RESPONSE);
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId('asset-group-videos')).toBeTruthy();
    });

    // Images and Audio groups should NOT be rendered
    expect(screen.queryByTestId('asset-group-images')).toBeNull();
    expect(screen.queryByTestId('asset-group-audio')).toBeNull();
  });
});
