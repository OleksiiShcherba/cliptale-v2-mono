/**
 * PromptToolbar — AI Enhance button tests (subtask 6).
 *
 * Tests 3 scenarios specific to the AI Enhance integration:
 * 1. Button is disabled when isEnhancing=true.
 * 2. Spinner icon is visible when isEnhancing=true.
 * 3. onClick fires onEnhance when draftId is set and not enhancing.
 *
 * Core toolbar tests (picker modal, labels, asset pick) live in
 * PromptToolbar.test.tsx.
 */

import React, { useRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PromptToolbar } from './PromptToolbar';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/features/generate-wizard/api', () => ({
  listAssets: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  buildAuthenticatedUrl: (url: string) => url,
  getAuthToken: () => null,
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./AssetPickerModal', () => ({
  AssetPickerModal: () => <div data-testid="mock-picker" />,
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface HostProps {
  draftId?: string | null;
  isEnhancing?: boolean;
  onEnhance?: () => void;
}

function Host({
  draftId = 'draft-1',
  isEnhancing = false,
  onEnhance = vi.fn(),
}: HostProps = {}): React.ReactElement {
  const promptEditorRef = useRef({ insertMediaRef: vi.fn(), focus: vi.fn() });

  return (
    <div>
      <PromptToolbar
        promptEditorRef={
          promptEditorRef as React.RefObject<{ insertMediaRef: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> } | null>
        }
        draftId={draftId}
        isEnhancing={isEnhancing}
        onEnhance={onEnhance}
      />
    </div>
  );
}

function renderToolbar(props: HostProps = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Host {...props} />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PromptToolbar — AI Enhance button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled when isEnhancing=true', () => {
    renderToolbar({ isEnhancing: true, draftId: 'draft-1' });

    const aiBtn = screen.getByTestId('toolbar-ai-enhance');
    expect(aiBtn).toHaveProperty('disabled', true);
  });

  it('shows spinner SVG with animation style when isEnhancing=true', () => {
    renderToolbar({ isEnhancing: true, draftId: 'draft-1' });

    const aiBtn = screen.getByTestId('toolbar-ai-enhance');
    const svg = aiBtn.querySelector('svg');
    expect(svg).toBeTruthy();
    // SpinnerIcon has an inline animation style; AiEnhanceIcon does not.
    expect(svg?.getAttribute('style') ?? '').toContain('animation');
  });

  it('calls onEnhance when draftId is set and not enhancing', () => {
    const onEnhance = vi.fn();
    renderToolbar({ onEnhance, draftId: 'draft-1', isEnhancing: false });

    const aiBtn = screen.getByTestId('toolbar-ai-enhance');
    expect(aiBtn).toHaveProperty('disabled', false);

    fireEvent.click(aiBtn);
    expect(onEnhance).toHaveBeenCalledTimes(1);
  });
});
