import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports of the module under test
// ---------------------------------------------------------------------------

const mockUseQuery = vi.fn();
const mockUseQueryClient = vi.fn(() => ({ invalidateQueries: vi.fn() }));

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
  AssetCard: ({ asset, isSelected, onSelect }: {
    asset: { id: string; filename: string };
    isSelected: boolean;
    onSelect: (id: string) => void;
  }) =>
    React.createElement('div', {
      'data-testid': `asset-card-${asset.id}`,
      'data-selected': String(isSelected),
      onClick: () => onSelect(asset.id),
    }, asset.filename),
}));

vi.mock('./AssetDetailPanel', () => ({
  AssetDetailPanel: ({ asset, onClose, onDelete }: {
    asset: { id: string; filename: string };
    onClose: () => void;
    onDelete?: () => void;
  }) =>
    React.createElement('div', {
      'data-testid': 'asset-detail-panel',
      'data-asset-id': asset.id,
    },
      React.createElement('button', { onClick: onClose }, 'Close'),
      onDelete
        ? React.createElement('button', { onClick: onDelete, 'data-testid': 'detail-delete-trigger' }, 'Delete Asset')
        : null,
    ),
}));

vi.mock('./DeleteAssetDialog', () => ({
  DeleteAssetDialog: ({ onClose, onDeleted }: {
    asset: object;
    onClose: () => void;
    onDeleted: () => void;
  }) =>
    React.createElement('div', { 'data-testid': 'delete-asset-dialog' },
      React.createElement('button', { onClick: onClose }, 'Cancel'),
      React.createElement('button', { onClick: onDeleted, 'data-testid': 'dialog-confirm-delete' }, 'Confirm Delete'),
    ),
}));

vi.mock('./ReplaceAssetDialog', () => ({
  ReplaceAssetDialog: ({ onClose }: { onClose: () => void }) =>
    React.createElement('div', { 'data-testid': 'replace-asset-dialog' },
      React.createElement('button', { onClick: onClose }, 'Close'),
    ),
}));

vi.mock('./UploadDropzone', () => ({
  UploadDropzone: ({ onClose }: { onClose: () => void }) =>
    React.createElement('div', { 'data-testid': 'upload-dropzone' },
      React.createElement('button', { onClick: onClose }, 'Close'),
    ),
}));

import { AssetBrowserPanel } from './AssetBrowserPanel';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = 'project-001';

function makeAsset(id: string, filename = `${id}.mp4`): object {
  return {
    id,
    filename,
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

/** Default query result: no assets, not loading, no error. */
function mockEmptyQuery(): void {
  mockUseQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
}

/** Query result with a list of assets. */
function mockAssetsQuery(assets: object[]): void {
  mockUseQuery.mockReturnValue({ data: assets, isLoading: false, isError: false });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssetBrowserPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmptyQuery();
  });

  // ── Layout ─────────────────────────────────────────────────────────────────

  it('renders the outer wrapper with flex:1 to fill its flex container', () => {
    const { container } = render(<AssetBrowserPanel projectId={PROJECT_ID} />);
    const outerWrapper = container.firstChild as HTMLElement;
    // flex:1 ensures the panel fills the sidebar column height so that
    // inner height:100% and flex:1 on the asset list resolve correctly.
    // Browsers normalize "flex: 1" to "1 1 0%" (flex-grow: 1, flex-shrink: 1, flex-basis: 0%).
    // We verify flex-grow is 1, indicating the outer wrapper participates in flex growth.
    expect(outerWrapper.style.flexGrow).toBe('1');
  });

  it('renders the upload button with width:100% (not a hardcoded pixel value)', () => {
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);
    const uploadButton = screen.getByRole('button', { name: '+ Upload Assets' });
    // width:100% is robust — it fills the container regardless of panel width
    // and avoids magic-number pixel values that break when the container changes.
    expect(uploadButton.style.width).toBe('100%');
  });

  it('upload button container padding is the same whether an asset is selected or not', () => {
    mockAssetsQuery([makeAsset('asset-001')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);

    const uploadButton = screen.getByRole('button', { name: '+ Upload Assets' });
    const uploadContainer = uploadButton.parentElement as HTMLElement;
    const paddingBefore = uploadContainer.style.padding;

    // Select an asset
    fireEvent.click(screen.getByTestId('asset-card-asset-001'));

    // Container padding must not change on asset selection
    const paddingAfter = uploadContainer.style.padding;
    expect(paddingBefore).toBe(paddingAfter);
    expect(paddingBefore).not.toBe('');
  });

  // ── Structure ───────────────────────────────────────────────────────────────

  it('renders type filter tabs: All, Video, Audio, Image', () => {
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);
    expect(screen.getByRole('button', { name: 'All' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Video' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Audio' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Image' })).toBeDefined();
  });

  it('renders the search input with accessible label', () => {
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);
    expect(screen.getByRole('searchbox', { name: 'Search assets' })).toBeDefined();
  });

  it('renders the Upload Assets button', () => {
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);
    expect(screen.getByRole('button', { name: '+ Upload Assets' })).toBeDefined();
  });

  it('shows empty state message when no assets exist', () => {
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);
    expect(screen.getByText('No assets yet — upload to get started')).toBeDefined();
  });

  it('shows loading state', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);
    expect(screen.getByText('Loading assets…')).toBeDefined();
  });

  it('shows error state with role=alert', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('opens UploadDropzone when Upload Assets button is clicked', () => {
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Upload Assets' }));
    expect(screen.getByTestId('upload-dropzone')).toBeDefined();
  });

  it('shows AssetDetailPanel when an asset card is clicked', () => {
    mockAssetsQuery([makeAsset('asset-001')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);

    fireEvent.click(screen.getByTestId('asset-card-asset-001'));

    expect(screen.getByTestId('asset-detail-panel')).toBeDefined();
    expect(screen.getByTestId('asset-detail-panel').getAttribute('data-asset-id')).toBe('asset-001');
  });

  it('hides AssetDetailPanel when close button is clicked', () => {
    mockAssetsQuery([makeAsset('asset-001')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);

    fireEvent.click(screen.getByTestId('asset-card-asset-001'));
    expect(screen.getByTestId('asset-detail-panel')).toBeDefined();

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('asset-detail-panel')).toBeNull();
  });

  // ── Delete Asset dialog wiring ──────────────────────────────────────────────

  it('opens DeleteAssetDialog when onDelete is triggered from AssetDetailPanel', () => {
    mockAssetsQuery([makeAsset('asset-001')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);

    // Select asset so AssetDetailPanel appears
    fireEvent.click(screen.getByTestId('asset-card-asset-001'));
    expect(screen.queryByTestId('delete-asset-dialog')).toBeNull();

    // Trigger the onDelete callback wired into AssetDetailPanel
    fireEvent.click(screen.getByTestId('detail-delete-trigger'));
    expect(screen.getByTestId('delete-asset-dialog')).toBeDefined();
  });

  it('closes DeleteAssetDialog without deselecting the asset when Cancel is clicked', () => {
    mockAssetsQuery([makeAsset('asset-001')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);

    fireEvent.click(screen.getByTestId('asset-card-asset-001'));
    fireEvent.click(screen.getByTestId('detail-delete-trigger'));
    expect(screen.getByTestId('delete-asset-dialog')).toBeDefined();

    // Cancel closes dialog but keeps asset selected (AssetDetailPanel still visible)
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('delete-asset-dialog')).toBeNull();
    expect(screen.getByTestId('asset-detail-panel')).toBeDefined();
  });

  it('closes DeleteAssetDialog and deselects the asset when deletion is confirmed', () => {
    mockAssetsQuery([makeAsset('asset-001')]);
    render(<AssetBrowserPanel projectId={PROJECT_ID} />);

    fireEvent.click(screen.getByTestId('asset-card-asset-001'));
    fireEvent.click(screen.getByTestId('detail-delete-trigger'));
    expect(screen.getByTestId('delete-asset-dialog')).toBeDefined();

    // Confirming deletion closes dialog and clears selectedAssetId
    fireEvent.click(screen.getByTestId('dialog-confirm-delete'));
    expect(screen.queryByTestId('delete-asset-dialog')).toBeNull();
    // AssetDetailPanel is hidden because selectedAssetId was reset to null
    expect(screen.queryByTestId('asset-detail-panel')).toBeNull();
  });
});
