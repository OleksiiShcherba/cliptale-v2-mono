/**
 * Tests for WizardFooter — Cancel (delete draft) + Next (flush + navigate).
 *
 * §10 vi.mock hoisting: factory-referenced mocks are wrapped with vi.hoisted().
 * QueryClientProvider wraps all renders because WizardFooter uses useMutation
 * for the deleteDraft call (§7 React Query consistency rule).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Hoisted mocks (must precede vi.mock calls)
// ---------------------------------------------------------------------------

const { mockNavigate, mockDeleteDraft } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockDeleteDraft: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/features/generate-wizard/api', () => ({
  deleteDraft: mockDeleteDraft,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { WizardFooter } from './WizardFooter';
import { hasAnyContent } from '@/features/generate-wizard/utils';
import type { PromptDoc } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_DOC: PromptDoc = {
  schemaVersion: 1,
  blocks: [{ type: 'text', value: '' }],
};

const DOC_WITH_TEXT: PromptDoc = {
  schemaVersion: 1,
  blocks: [{ type: 'text', value: 'Hello world' }],
};

const DOC_WITH_MEDIA: PromptDoc = {
  schemaVersion: 1,
  blocks: [{ type: 'media-ref', fileId: '00000000-0000-0000-0000-000000000001', mediaType: 'video', label: 'clip.mp4' }],
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

function renderFooter(props: Partial<React.ComponentProps<typeof WizardFooter>> = {}) {
  const defaults = {
    draftId: 'draft-1',
    doc: DOC_WITH_TEXT,
    flush: vi.fn().mockResolvedValue(undefined),
  };
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WizardFooter {...defaults} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// hasAnyContent unit tests
// ---------------------------------------------------------------------------

describe('hasAnyContent', () => {
  it('returns false for doc with only an empty text block', () => {
    expect(hasAnyContent(EMPTY_DOC)).toBe(false);
  });

  it('returns true for doc with a non-empty text block', () => {
    expect(hasAnyContent(DOC_WITH_TEXT)).toBe(true);
  });

  it('returns true for doc with a media-ref block', () => {
    expect(hasAnyContent(DOC_WITH_MEDIA)).toBe(true);
  });

  it('returns false for doc with only whitespace-only text blocks', () => {
    const doc: PromptDoc = {
      schemaVersion: 1,
      blocks: [{ type: 'text', value: '   ' }],
    };
    expect(hasAnyContent(doc)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WizardFooter render tests
// ---------------------------------------------------------------------------

describe('WizardFooter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Both buttons render
  it('renders the Cancel and Next buttons', () => {
    renderFooter();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /next/i })).toBeTruthy();
  });

  // 2. Next is disabled when doc is empty; enabled when doc has content
  it('Next button is disabled when doc is empty', () => {
    renderFooter({ doc: EMPTY_DOC });
    const nextBtn = screen.getByTestId('next-button');
    expect(nextBtn).toHaveProperty('disabled', true);
  });

  it('Next button is enabled when doc has a non-empty text block', () => {
    renderFooter({ doc: DOC_WITH_TEXT });
    const nextBtn = screen.getByTestId('next-button');
    expect(nextBtn).toHaveProperty('disabled', false);
  });

  it('Next button is enabled when doc has a media-ref block', () => {
    renderFooter({ doc: DOC_WITH_MEDIA });
    const nextBtn = screen.getByTestId('next-button');
    expect(nextBtn).toHaveProperty('disabled', false);
  });

  // 3. Clicking Cancel opens the confirm dialog
  it('clicking Cancel opens the confirm dialog', () => {
    renderFooter();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Discard draft?')).toBeTruthy();
    expect(screen.getByText('Your progress will be lost.')).toBeTruthy();
  });

  // 4. Clicking "Keep editing" closes the dialog without calling deleteDraft
  it('clicking "Keep editing" closes the dialog without calling deleteDraft', async () => {
    renderFooter();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(mockDeleteDraft).not.toHaveBeenCalled();
  });

  // 5. Clicking "Discard" calls deleteDraft(draftId) then navigates to /editor
  it('clicking "Discard" calls deleteDraft then navigates to /editor', async () => {
    mockDeleteDraft.mockResolvedValue(undefined);
    renderFooter({ draftId: 'draft-42' });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /discard/i }));
    await waitFor(() => {
      expect(mockDeleteDraft).toHaveBeenCalledWith('draft-42');
      expect(mockNavigate).toHaveBeenCalledWith('/editor');
    });
  });

  // 6. Cancel with draftId=null skips deleteDraft, still navigates to /editor
  it('Cancel with draftId=null skips deleteDraft, still navigates', async () => {
    renderFooter({ draftId: null });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /discard/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/editor');
    });
    expect(mockDeleteDraft).not.toHaveBeenCalled();
  });

  // 7. Clicking Next calls flush() then navigates to /storyboard/:draftId
  it('clicking Next calls flush then navigates to /storyboard/:draftId when draftId is set', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    renderFooter({ flush, draftId: 'draft-1' });
    fireEvent.click(screen.getByTestId('next-button'));
    await waitFor(() => {
      expect(flush).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/storyboard/draft-1');
    });
  });

  // 7b. Clicking Next falls back to /generate/road-map when draftId is null
  it('clicking Next falls back to /generate/road-map when draftId is null', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    renderFooter({ flush, draftId: null });
    fireEvent.click(screen.getByTestId('next-button'));
    await waitFor(() => {
      expect(flush).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/generate/road-map');
    });
  });

  // 8. If flush() rejects, stays on the page and renders error text
  it('renders error text and does not navigate when flush rejects', async () => {
    const flush = vi.fn().mockRejectedValue(new Error('network error'));
    renderFooter({ flush });
    fireEvent.click(screen.getByTestId('next-button'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText(/could not save/i)).toBeTruthy();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // 9. Pressing Escape inside the dialog closes it without deleting
  it('pressing Escape inside the dialog closes it without deleting', async () => {
    renderFooter();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(mockDeleteDraft).not.toHaveBeenCalled();
  });

  // 10. Next shows a spinner while flushing
  it('Next shows a spinner while flushing', async () => {
    let resolveFlush!: () => void;
    const flush = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveFlush = resolve;
      }),
    );
    renderFooter({ flush });
    fireEvent.click(screen.getByTestId('next-button'));
    // Spinner should appear while the promise is pending.
    await waitFor(() => {
      expect(screen.getByTestId('next-spinner')).toBeTruthy();
    });
    // Clean up — resolve so the promise chain completes (navigate is mocked so
    // component stays mounted; spinner stays visible because isFlushing guards
    // re-click, which is the correct UX while navigation is in progress).
    resolveFlush();
    await waitFor(() => {
      // Default fixture has draftId='draft-1', so navigation goes to storyboard page.
      expect(mockNavigate).toHaveBeenCalledWith('/storyboard/draft-1');
    });
  });
});
