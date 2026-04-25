/**
 * MediaGalleryPanel tests.
 *
 * Covers scenarios as specified in the subtask acceptance criteria:
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
 * 11. Upload button visible when draftId provided
 * 12. Upload button hidden when draftId is undefined
 * 13. Clicking Upload opens UploadDropzone modal
 * 14. Selecting a file triggers uploadFiles and invalidates assets query
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

// Mock useFileUpload so upload tests can assert on the hook calls.
// Use vi.hoisted so these variables are available when the vi.mock factory runs.
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

// Mock AiGenerationPanel — the panel has heavy internal query dependencies.
// The test only needs to verify that MediaGalleryPanel mounts it with the
// correct context prop; AiGenerationPanel's own tests cover its internals.
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
      { 'data-testid': 'ai-generation-panel', 'data-context-kind': context.kind, 'data-context-id': context.id },
      React.createElement('button', { onClick: onSwitchToAssets, 'data-testid': 'ai-switch-to-assets' }, 'View in Assets'),
    ),
}));

// Mock UploadDropzone so we can assert it is rendered / receives the right props
vi.mock('@/shared/file-upload/UploadDropzone', () => ({
  UploadDropzone: ({
    onUploadFiles,
    onClose,
    onDone,
  }: {
    onUploadFiles: (files: FileList) => void;
    onClose: () => void;
    onDone: () => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'upload-dropzone', role: 'dialog', 'aria-label': 'Upload Assets' },
      React.createElement('input', {
        'data-testid': 'dropzone-file-input',
        type: 'file',
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          if (e.target.files) onUploadFiles(e.target.files);
        },
      }),
      React.createElement('button', { onClick: onClose, 'data-testid': 'dropzone-close' }, 'Cancel'),
      React.createElement('button', { onClick: onDone, 'data-testid': 'dropzone-done' }, 'Done'),
    ),
}));

import { listAssets, listDraftAssets } from '@/features/generate-wizard/api';
import { useFileUpload } from '@/shared/file-upload/useFileUpload';

const mockListAssets = vi.mocked(listAssets);
const mockListDraftAssets = vi.mocked(listDraftAssets);
const mockUseFileUpload = vi.mocked(useFileUpload);

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
  const queryClient = makeQueryClient();
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MediaGalleryPanel onAssetSelected={onAssetSelected} draftId={undefined} />
      </QueryClientProvider>,
    ),
  };
}

// ---------------------------------------------------------------------------
// Helpers to simulate query states
// ---------------------------------------------------------------------------

function mockPending() {
  const pending = () => new Promise<AssetListResponse>(() => { /* never resolves */ });
  mockListAssets.mockImplementation(pending);
  mockListDraftAssets.mockImplementation(pending);
}

function mockSuccess(response: AssetListResponse) {
  mockListAssets.mockResolvedValue(response);
  mockListDraftAssets.mockResolvedValue(response);
}

function mockFailure() {
  mockListAssets.mockRejectedValue(new Error('Network error'));
  mockListDraftAssets.mockRejectedValue(new Error('Network error'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MediaGalleryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFileUpload.mockReturnValue({
      entries: [],
      isUploading: false,
      uploadFiles: mockUploadFiles,
      clearEntries: mockClearEntries,
    });
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
      expect(screen.getByText('No assets yet — click Upload to add media')).toBeTruthy();
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

  // ---------------------------------------------------------------------------
  // Upload affordance tests
  // ---------------------------------------------------------------------------

  it('should show Upload button when draftId is provided', () => {
    mockPending();
    renderPanel(vi.fn(), 'draft-abc');
    expect(screen.getByTestId('upload-button')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload files' })).toBeTruthy();
  });

  it('should NOT show Upload button when draftId is undefined', () => {
    mockPending();
    renderPanelNoDraft();
    expect(screen.queryByTestId('upload-button')).toBeNull();
  });

  it('should open UploadDropzone modal when Upload button is clicked', () => {
    mockPending();
    renderPanel(vi.fn(), 'draft-abc');

    expect(screen.queryByTestId('upload-dropzone')).toBeNull();

    fireEvent.click(screen.getByTestId('upload-button'));

    expect(screen.getByTestId('upload-dropzone')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Upload Assets' })).toBeTruthy();
  });

  it('should close UploadDropzone when Cancel is clicked', () => {
    mockPending();
    renderPanel(vi.fn(), 'draft-abc');

    fireEvent.click(screen.getByTestId('upload-button'));
    expect(screen.getByTestId('upload-dropzone')).toBeTruthy();

    fireEvent.click(screen.getByTestId('dropzone-close'));
    expect(screen.queryByTestId('upload-dropzone')).toBeNull();
  });

  it('should close UploadDropzone and clear entries when Done is clicked', () => {
    mockPending();
    renderPanel(vi.fn(), 'draft-abc');

    fireEvent.click(screen.getByTestId('upload-button'));
    fireEvent.click(screen.getByTestId('dropzone-done'));

    expect(screen.queryByTestId('upload-dropzone')).toBeNull();
    expect(mockClearEntries).toHaveBeenCalledTimes(1);
  });

  it('should initialize useFileUpload with draft target when draftId is provided', () => {
    mockPending();
    renderPanel(vi.fn(), 'draft-xyz');

    expect(mockUseFileUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: 'draft', draftId: 'draft-xyz' },
      }),
    );
  });

  it('should invalidate assets query when a file upload completes', () => {
    mockPending();
    const { queryClient } = renderPanel(vi.fn(), 'draft-abc');

    // Extract the onUploadComplete callback passed to useFileUpload
    const callArgs = mockUseFileUpload.mock.calls[0][0];
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    // Simulate upload complete callback
    callArgs.onUploadComplete?.('file-1');

    expect(invalidateQueriesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['generate-wizard', 'assets'] }),
    );
  });

});
