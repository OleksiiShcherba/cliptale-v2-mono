/**
 * GenerateWizardPage — asset detail panel integration tests.
 *
 * Covers:
 * - Clicking an asset card opens the AssetDetailPanel
 * - "Add to Prompt" inserts chip and closes panel
 * - "Delete" triggers soft-delete and shows undo toast
 * - Closing the panel returns to the gallery
 *
 * General wizard chrome tests live in GenerateWizardPage.test.tsx.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { GenerateWizardPage } from './GenerateWizardPage';

// ---------------------------------------------------------------------------
// Shared hoisted mocks
// ---------------------------------------------------------------------------

const { mockDeleteAsset, mockRestoreAsset, mockGetAsset, mockLinkFileToDraft } = vi.hoisted(() => ({
  mockDeleteAsset: vi.fn().mockResolvedValue(undefined),
  mockRestoreAsset: vi.fn().mockResolvedValue(undefined),
  mockGetAsset: vi.fn(),
  mockLinkFileToDraft: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('@/features/generate-wizard/api', () => ({
  listAssets: vi.fn().mockResolvedValue({
    items: [
      {
        id: 'asset-vid-1',
        type: 'video',
        label: 'clip.mp4',
        durationSeconds: 10,
        thumbnailUrl: null,
        createdAt: '2026-04-20T00:00:00.000Z',
      },
    ],
    nextCursor: null,
    totals: { count: 1, bytesUsed: 1_000_000 },
  }),
  createDraft: vi.fn().mockResolvedValue({ id: 'draft-1', promptDoc: {}, createdAt: '', updatedAt: '' }),
  updateDraft: vi.fn().mockResolvedValue({ id: 'draft-1', promptDoc: {}, createdAt: '', updatedAt: '' }),
  deleteDraft: vi.fn().mockResolvedValue(undefined),
  fetchDraft: vi.fn().mockResolvedValue({
    id: 'draft-abc',
    userId: 'user-1',
    promptDoc: { schemaVersion: 1, blocks: [] },
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
  }),
  listDraftAssets: vi.fn().mockResolvedValue({
    items: [
      {
        id: 'asset-vid-1',
        type: 'video',
        label: 'clip.mp4',
        durationSeconds: 10,
        thumbnailUrl: null,
        createdAt: '2026-04-20T00:00:00.000Z',
      },
    ],
    nextCursor: null,
    totals: { count: 1, bytesUsed: 1_000_000 },
  }),
  linkFileToDraft: mockLinkFileToDraft,
  startEnhance: vi.fn(),
  getEnhanceStatus: vi.fn(),
}));

vi.mock('@/features/asset-manager/api', () => ({
  getAsset: mockGetAsset,
  deleteAsset: mockDeleteAsset,
  restoreAsset: mockRestoreAsset,
  updateAsset: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  buildAuthenticatedUrl: (url: string) => url,
  getAuthToken: () => null,
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

vi.mock('@/features/generate-wizard/hooks/useGenerationDraft', () => ({
  useGenerationDraft: () => ({
    draftId: 'draft-1',
    doc: { schemaVersion: 1, blocks: [] },
    setDoc: vi.fn(),
    status: 'idle',
    lastSavedAt: null,
    flush: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/features/generate-wizard/hooks/useEnhancePrompt', () => ({
  useEnhancePrompt: () => ({
    start: vi.fn(),
    status: 'idle' as const,
    proposedDoc: null,
    error: null,
    reset: vi.fn(),
  }),
}));

// Stub heavy child components that are not under test here.
vi.mock('./EnhancePreviewModal', () => ({
  EnhancePreviewModal: () => null,
}));

vi.mock('./ProTipCard', () => ({
  ProTipCard: () => null,
}));

// Stub TranscribeButton (used inside AssetDetailPanel).
vi.mock('@/features/captions/components/TranscribeButton', () => ({
  TranscribeButton: () => null,
}));

// Stub AddToTimelineDropdown (not relevant in draft context).
vi.mock('@/features/asset-manager/components/AddToTimelineDropdown', () => ({
  AddToTimelineDropdown: () => null,
}));

// Stub AssetPreviewModal.
vi.mock('@/features/asset-manager/components/AssetPreviewModal', () => ({
  AssetPreviewModal: () => null,
}));

// Stub InlineRenameField — simplifies test assertions.
vi.mock('@/features/asset-manager/components/InlineRenameField', () => ({
  InlineRenameField: ({ displayedName }: { fileId: string; projectId: string; displayedName: string }) =>
    React.createElement('div', { 'data-testid': 'inline-rename-field' }, displayedName),
}));

// ---------------------------------------------------------------------------
// Shared full-asset fixture
// ---------------------------------------------------------------------------

const FULL_ASSET = {
  id: 'asset-vid-1',
  projectId: '',
  filename: 'clip.mp4',
  displayName: null,
  contentType: 'video/mp4',
  downloadUrl: 'https://example.com/clip.mp4',
  status: 'ready' as const,
  durationSeconds: 10,
  width: 1920,
  height: 1080,
  fileSizeBytes: 5_000_000,
  thumbnailUri: null,
  waveformPeaks: null,
  createdAt: '2026-04-20T00:00:00.000Z',
  updatedAt: '2026-04-20T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(initialEntries: string[] = ['/generate']): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <GenerateWizardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GenerateWizardPage — asset detail panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAsset.mockResolvedValue(FULL_ASSET);
  });

  it('shows the gallery by default (no panel visible)', () => {
    renderPage();
    expect(screen.getByText('Media Gallery')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /close asset details/i })).toBeNull();
  });

  it('clicking an asset card opens the AssetDetailPanel', async () => {
    renderPage();

    // Wait for the asset card to appear in the Recent tab.
    const assetCard = await screen.findByRole('button', { name: 'clip.mp4' });
    fireEvent.click(assetCard);

    // Panel should be loading (or have rendered with the asset).
    // Either the loading slot or the full panel should be visible.
    await waitFor(() => {
      // "Asset Details" header text from AssetDetailPanel
      expect(screen.getByText('Asset Details')).toBeTruthy();
    });

    // The gallery heading should no longer be visible.
    expect(screen.queryByText('Media Gallery')).toBeNull();
  });

  it('renders the Add to Prompt button in the detail panel', async () => {
    renderPage();
    const assetCard = await screen.findByRole('button', { name: 'clip.mp4' });
    fireEvent.click(assetCard);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add.*to prompt/i })).toBeTruthy();
    });
  });

  it('clicking Add to Prompt closes the panel and returns to the gallery', async () => {
    renderPage();
    const assetCard = await screen.findByRole('button', { name: 'clip.mp4' });
    fireEvent.click(assetCard);

    await waitFor(() => screen.getByRole('button', { name: /add.*to prompt/i }));

    fireEvent.click(screen.getByRole('button', { name: /add.*to prompt/i }));

    // Panel should close, gallery should return.
    await waitFor(() => {
      expect(screen.getByText('Media Gallery')).toBeTruthy();
    });
  });

  it('close button returns to the gallery', async () => {
    renderPage();
    const assetCard = await screen.findByRole('button', { name: 'clip.mp4' });
    fireEvent.click(assetCard);

    await waitFor(() => screen.getByRole('button', { name: /close asset details/i }));

    fireEvent.click(screen.getByRole('button', { name: /close asset details/i }));

    await waitFor(() => {
      expect(screen.getByText('Media Gallery')).toBeTruthy();
    });
  });

  it('Delete Asset calls deleteAsset and shows the undo toast', async () => {
    renderPage();
    const assetCard = await screen.findByRole('button', { name: 'clip.mp4' });
    fireEvent.click(assetCard);

    await waitFor(() => screen.getByRole('button', { name: /delete asset/i }));

    fireEvent.click(screen.getByRole('button', { name: /delete asset/i }));

    await waitFor(() => {
      expect(mockDeleteAsset).toHaveBeenCalledWith('asset-vid-1');
    });

    // Undo toast should appear.
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeTruthy();
    });

    // Panel closes, gallery returns.
    await waitFor(() => {
      expect(screen.getByText('Media Gallery')).toBeTruthy();
    });
  });

  it('clicking Add to Prompt calls linkFileToDraft with draftId and asset id', async () => {
    renderPage();
    const assetCard = await screen.findByRole('button', { name: 'clip.mp4' });
    fireEvent.click(assetCard);

    await waitFor(() => screen.getByRole('button', { name: /add.*to prompt/i }));
    fireEvent.click(screen.getByRole('button', { name: /add.*to prompt/i }));

    await waitFor(() => {
      expect(mockLinkFileToDraft).toHaveBeenCalledWith('draft-1', 'asset-vid-1');
    });
  });

  it('clicking Undo in the toast calls restoreAsset', async () => {
    renderPage();
    const assetCard = await screen.findByRole('button', { name: 'clip.mp4' });
    fireEvent.click(assetCard);

    await waitFor(() => screen.getByRole('button', { name: /delete asset/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete asset/i }));

    await waitFor(() => screen.getByRole('button', { name: /undo last action/i }));
    fireEvent.click(screen.getByRole('button', { name: /undo last action/i }));

    await waitFor(() => {
      expect(mockRestoreAsset).toHaveBeenCalledWith('asset-vid-1');
    });
  });
});
