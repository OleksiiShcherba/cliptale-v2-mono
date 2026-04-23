/**
 * Scope toggle tests for AssetBrowserPanel.
 *
 * Covers:
 * 1. Scope toggle button is rendered
 * 2. Shows "Show All System Assets" label when scope is project
 * 3. Shows "Show only project assets" label when scope is all
 * 4. Clicking toggle switches scope — triggers new query with updated scope
 * 5. Auto-switch to all when project-scoped list is empty on first load
 * 6. Toggle reports aria-pressed correctly
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockUseQuery, mockUseQueryClient } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockUseQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: () => mockUseQueryClient(),
}));

vi.mock('@/features/asset-manager/api', () => ({
  getAssets: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/features/asset-manager/hooks/useAssetUpload', () => ({
  useAssetUpload: vi.fn().mockReturnValue({
    entries: [],
    isUploading: false,
    uploadFiles: vi.fn(),
    clearEntries: vi.fn(),
  }),
}));

vi.mock('@/features/asset-manager/hooks/useAssetPolling', () => ({
  useAssetPolling: vi.fn(),
}));

vi.mock('./AssetCard', () => ({
  AssetCard: ({ asset }: { asset: { id: string; filename: string } }) =>
    React.createElement('div', { 'data-testid': `asset-card-${asset.id}` }, asset.filename),
}));

vi.mock('@/shared/asset-detail/AssetDetailPanel', () => ({
  AssetDetailPanel: () => React.createElement('div', { 'data-testid': 'asset-detail-panel' }),
}));

vi.mock('./DeleteAssetDialog', () => ({
  DeleteAssetDialog: () => React.createElement('div', { 'data-testid': 'delete-asset-dialog' }),
}));

vi.mock('./ReplaceAssetDialog', () => ({
  ReplaceAssetDialog: () => React.createElement('div', { 'data-testid': 'replace-asset-dialog' }),
}));

vi.mock('./UploadDropzone', () => ({
  UploadDropzone: () => React.createElement('div', { 'data-testid': 'upload-dropzone' }),
}));

import { AssetBrowserPanel } from './AssetBrowserPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-scope-001';

function makeAsset(id: string) {
  return {
    id,
    filename: `${id}.mp4`,
    contentType: 'video/mp4',
    status: 'ready',
    thumbnailUri: null,
    waveformPeaks: null,
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    fileSizeBytes: 1024,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    downloadUrl: null,
  };
}

function makeEnvelope(assets: object[] = []) {
  return { items: assets, nextCursor: null, totals: { count: assets.length, bytesUsed: 0 } };
}

/** Project-scoped empty, all-scoped empty — used for initial auto-switch test. */
function mockBothEmpty() {
  mockUseQuery.mockReturnValue({ data: makeEnvelope([]), isLoading: false, isError: false });
}

/** Project-scoped empty for first call, all-scoped has assets for second. */
function mockProjectEmptyAllHasAssets(allAssets: object[]) {
  mockUseQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[2] === 'all') {
      return { data: makeEnvelope(allAssets), isLoading: false, isError: false };
    }
    return { data: makeEnvelope([]), isLoading: false, isError: false };
  });
}

/** Both scopes have assets. */
function mockBothHaveAssets(assets: object[]) {
  mockUseQuery.mockReturnValue({ data: makeEnvelope(assets), isLoading: false, isError: false });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssetBrowserPanel — scope toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBothEmpty();
  });

  it('renders the scope toggle button', () => {
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);
    expect(screen.getByTestId('scope-toggle')).toBeDefined();
  });

  it('shows "Show All System Assets" label when scope is project (default)', () => {
    mockBothHaveAssets([makeAsset('a1')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);
    expect(screen.getByTestId('scope-toggle').textContent).toBe('Show All System Assets');
  });

  it('toggle has aria-pressed=false when scope is project', () => {
    mockBothHaveAssets([makeAsset('a1')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);
    expect(screen.getByTestId('scope-toggle').getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking toggle switches label to "Show only project assets"', () => {
    mockBothHaveAssets([makeAsset('a1')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);

    fireEvent.click(screen.getByTestId('scope-toggle'));

    expect(screen.getByTestId('scope-toggle').textContent).toBe('Show only project assets');
  });

  it('toggle has aria-pressed=true after switching to all', () => {
    mockBothHaveAssets([makeAsset('a1')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);

    fireEvent.click(screen.getByTestId('scope-toggle'));

    expect(screen.getByTestId('scope-toggle').getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking toggle again restores "Show All System Assets" label', () => {
    mockBothHaveAssets([makeAsset('a1')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);

    fireEvent.click(screen.getByTestId('scope-toggle'));
    fireEvent.click(screen.getByTestId('scope-toggle'));

    expect(screen.getByTestId('scope-toggle').textContent).toBe('Show All System Assets');
  });

  it('auto-switches to all when project-scoped list is empty on first load', async () => {
    mockProjectEmptyAllHasAssets([makeAsset('global-asset-1')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);

    // After auto-switch the toggle label should reflect scope=all
    await waitFor(() => {
      expect(screen.getByTestId('scope-toggle').textContent).toBe('Show only project assets');
    });
  });

  it('auto-switch sets aria-pressed=true on toggle', async () => {
    mockProjectEmptyAllHasAssets([makeAsset('global-asset-1')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);

    await waitFor(() => {
      expect(screen.getByTestId('scope-toggle').getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('does NOT auto-switch when project scope has assets', () => {
    mockBothHaveAssets([makeAsset('a1')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);
    // Auto-switch guard prevents switching even if idle
    expect(screen.getByTestId('scope-toggle').textContent).toBe('Show All System Assets');
  });
});
