/**
 * Navigation tests for GenerateWizardPage — Back to Storyboard button wiring.
 *
 * Split from GenerateWizardPage.test.tsx per §9.7 (300-line cap).
 * Unit tests for the BackToStoryboardButton itself live in BackToStoryboardButton.test.tsx.
 * These tests verify the page-level wiring: button present + navigate called with the
 * correct path and query-param hint.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/features/generate-wizard/api', () => ({
  listAssets: vi.fn().mockResolvedValue({
    items: [],
    nextCursor: null,
    totals: { count: 0, bytesUsed: 0 },
  }),
  createDraft: vi.fn().mockResolvedValue({ id: 'draft-1', promptDoc: {}, createdAt: '', updatedAt: '' }),
  updateDraft: vi.fn().mockResolvedValue({ id: 'draft-1', promptDoc: {}, createdAt: '', updatedAt: '' }),
  deleteDraft: vi.fn().mockResolvedValue(undefined),
  fetchDraft: vi.fn().mockResolvedValue({ id: 'draft-1', promptDoc: {}, createdAt: '', updatedAt: '' }),
  linkFileToDraft: vi.fn().mockResolvedValue(undefined),
  listDraftAssets: vi.fn().mockResolvedValue({ items: [], nextCursor: null, totals: { count: 0, bytesUsed: 0 } }),
  startEnhance: vi.fn(),
  getEnhanceStatus: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  buildAuthenticatedUrl: (url: string) => url,
  getAuthToken: () => null,
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/features/generate-wizard/hooks/useGenerationDraft', () => ({
  useGenerationDraft: () => ({
    draftId: 'draft-1',
    doc: { schemaVersion: 1, blocks: [{ type: 'text', value: '' }] },
    setDoc: vi.fn(),
    status: 'idle',
    lastSavedAt: null,
    flush: vi.fn().mockResolvedValue(undefined),
  }),
}));

const { mockEnhanceHook } = vi.hoisted(() => {
  const mockEnhanceHook = vi.fn().mockReturnValue({
    start: vi.fn(),
    status: 'idle' as const,
    proposedDoc: null,
    error: null,
    reset: vi.fn(),
  });
  return { mockEnhanceHook };
});

vi.mock('@/features/generate-wizard/hooks/useEnhancePrompt', () => ({
  useEnhancePrompt: (draftId: string | null) => mockEnhanceHook(draftId),
}));

vi.mock('./EnhancePreviewModal', () => ({
  EnhancePreviewModal: () => null,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { GenerateWizardPage } from './GenerateWizardPage';

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(initialEntry = '/generate') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <GenerateWizardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GenerateWizardPage / Back to Storyboard navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnhanceHook.mockReturnValue({
      start: vi.fn(),
      status: 'idle' as const,
      proposedDoc: null,
      error: null,
      reset: vi.fn(),
    });
  });

  it('should render the Back to Storyboard button in the wizard header', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Back to Storyboard' })).toBeTruthy();
  });

  it('should navigate to /?tab=storyboard when Back to Storyboard is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Storyboard' }));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/?tab=storyboard');
  });
});
