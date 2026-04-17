import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { GenerateWizardPage } from './GenerateWizardPage';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock the api module so the gallery's useAssets query never fires real HTTP
vi.mock('@/features/generate-wizard/api', () => ({
  listAssets: vi.fn().mockResolvedValue({
    items: [],
    nextCursor: null,
    totals: { count: 0, bytesUsed: 0 },
  }),
  createDraft: vi.fn().mockResolvedValue({ id: 'draft-1', promptDoc: {}, createdAt: '', updatedAt: '' }),
  updateDraft: vi.fn().mockResolvedValue({ id: 'draft-1', promptDoc: {}, createdAt: '', updatedAt: '' }),
  deleteDraft: vi.fn().mockResolvedValue(undefined),
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

// Shared control surface for useGenerationDraft mock — tests can override per case.
const { mockSetDoc, mockFlush } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockFlush: vi.fn().mockResolvedValue(undefined),
}));

// Mock useGenerationDraft so no real autosave timers or mutations fire.
vi.mock('@/features/generate-wizard/hooks/useGenerationDraft', () => ({
  useGenerationDraft: () => ({
    draftId: 'draft-1',
    doc: { schemaVersion: 1, blocks: [{ type: 'text', value: '' }] },
    setDoc: mockSetDoc,
    status: 'idle',
    lastSavedAt: null,
    flush: mockFlush,
  }),
}));

// Shared control surface for useEnhancePrompt mock — tests can override per case.
const { mockEnhanceStart, mockEnhanceReset, mockEnhanceHook } = vi.hoisted(() => {
  const mockEnhanceStart = vi.fn();
  const mockEnhanceReset = vi.fn();
  const mockEnhanceHook = vi.fn().mockReturnValue({
    start: mockEnhanceStart,
    status: 'idle' as const,
    proposedDoc: null,
    error: null,
    reset: mockEnhanceReset,
  });
  return { mockEnhanceStart, mockEnhanceReset, mockEnhanceHook };
});

vi.mock('@/features/generate-wizard/hooks/useEnhancePrompt', () => ({
  useEnhancePrompt: (draftId: string | null) => mockEnhanceHook(draftId),
}));

// Stub EnhancePreviewModal — the full modal has its own test suite.
// Here we just need to verify mount/unmount and that Accept/Discard are wired.
const { modalPropsRef } = vi.hoisted(() => ({
  modalPropsRef: {
    current: null as {
      open: boolean;
      onAccept: (proposed: unknown) => void;
      onDiscard: () => void;
    } | null,
  },
}));

vi.mock('./EnhancePreviewModal', () => ({
  EnhancePreviewModal: (props: {
    open: boolean;
    onAccept: (proposed: unknown) => void;
    onDiscard: () => void;
  }) => {
    modalPropsRef.current = props;
    if (!props.open) return null;
    return (
      <div data-testid="mock-enhance-modal">
        <button
          type="button"
          data-testid="mock-accept-button"
          onClick={() => props.onAccept({ schemaVersion: 1, blocks: [] })}
        >
          Accept
        </button>
        <button
          type="button"
          data-testid="mock-discard-button"
          onClick={() => props.onDiscard()}
        >
          Discard
        </button>
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <GenerateWizardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('GenerateWizardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset enhance hook to idle default after each test
    mockEnhanceHook.mockReturnValue({
      start: mockEnhanceStart,
      status: 'idle' as const,
      proposedDoc: null,
      error: null,
      reset: mockEnhanceReset,
    });
  });

  it('renders the WizardStepper with currentStep=1', () => {
    renderPage();
    // Stepper is present — check navigation landmark and step 1 active node
    expect(screen.getByRole('navigation', { name: 'Wizard steps' })).toBeTruthy();
    const nodes = screen.getAllByText(/^[123]$/);
    const activeNode = nodes[0].closest('[aria-current="step"]');
    expect(activeNode).toBeTruthy();
  });

  it('renders the left column slot', () => {
    renderPage();
    expect(screen.getByTestId('wizard-left-column')).toBeTruthy();
  });

  it('renders the right column slot', () => {
    renderPage();
    expect(screen.getByTestId('wizard-right-column')).toBeTruthy();
  });

  it('renders the footer slot', () => {
    renderPage();
    expect(screen.getByTestId('wizard-footer')).toBeTruthy();
  });

  it('renders the main body with accessible label', () => {
    renderPage();
    expect(screen.getByRole('main', { name: 'Generate wizard body' })).toBeTruthy();
  });

  it('renders the left column with accessible label', () => {
    renderPage();
    expect(screen.getByRole('region', { name: 'Script and media editor' })).toBeTruthy();
  });

  it('renders the right column with accessible label', () => {
    renderPage();
    expect(screen.getByRole('region', { name: 'Video road map' })).toBeTruthy();
  });

  it('renders the footer with accessible label', () => {
    renderPage();
    expect(screen.getByRole('contentinfo', { name: 'Wizard footer actions' })).toBeTruthy();
  });

  it('renders all three stepper step labels', () => {
    renderPage();
    expect(screen.getByText('Script & Media')).toBeTruthy();
    expect(screen.getByText('Video Road Map')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
  });

  it('renders the PromptEditor', () => {
    renderPage();
    expect(screen.getByTestId('prompt-editor')).toBeTruthy();
  });

  it('renders the MediaGalleryPanel heading', () => {
    renderPage();
    expect(screen.getByText('Media Gallery')).toBeTruthy();
  });

  it('renders the Cancel and Next buttons in the footer', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
    expect(screen.getByTestId('next-button')).toBeTruthy();
  });

  // ── New subtask-6 cases ────────────────────────────────────────────────────

  it('EnhancePreviewModal is absent when status is not done', () => {
    // Default mock returns status='idle'
    mockEnhanceHook.mockReturnValue({
      start: mockEnhanceStart,
      status: 'idle' as const,
      proposedDoc: null,
      error: null,
      reset: mockEnhanceReset,
    });

    renderPage();

    expect(screen.queryByTestId('mock-enhance-modal')).toBeNull();
  });

  it('EnhancePreviewModal is visible when status is done and Accept calls setDoc', () => {
    const proposedDoc = { schemaVersion: 1, blocks: [{ type: 'text', value: 'Enhanced' }] };
    mockEnhanceHook.mockReturnValue({
      start: mockEnhanceStart,
      status: 'done' as const,
      proposedDoc,
      error: null,
      reset: mockEnhanceReset,
    });

    renderPage();

    expect(screen.getByTestId('mock-enhance-modal')).toBeTruthy();

    // Click Accept — should call setDoc with the proposed doc
    fireEvent.click(screen.getByTestId('mock-accept-button'));
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).toHaveBeenCalledWith({ schemaVersion: 1, blocks: [] });
  });

  it('Discard calls reset and the modal closes', () => {
    mockEnhanceHook.mockReturnValue({
      start: mockEnhanceStart,
      status: 'done' as const,
      proposedDoc: { schemaVersion: 1, blocks: [] },
      error: null,
      reset: mockEnhanceReset,
    });

    renderPage();

    expect(screen.getByTestId('mock-enhance-modal')).toBeTruthy();

    fireEvent.click(screen.getByTestId('mock-discard-button'));
    expect(mockEnhanceReset).toHaveBeenCalledTimes(1);
  });
});
