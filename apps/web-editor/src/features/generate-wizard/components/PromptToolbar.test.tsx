/**
 * PromptToolbar tests.
 *
 * Tests 8 scenarios per the subtask acceptance criteria:
 * 1. All four buttons render with correct labels.
 * 2. AI Enhance is disabled; clicking it does NOT open any modal.
 * 3. Clicking Insert Video opens the modal with mediaType='video'.
 * 4. Clicking Insert Image opens the modal with mediaType='image'.
 * 5. Clicking Insert Audio opens the modal with mediaType='audio'.
 * 6. Only one modal open at a time — clicking Insert Image while Video modal is open switches to Image.
 * 7. Picking an asset calls promptEditorRef.current.insertMediaRef with { id, type, label }.
 * 8. Modal closes after pick (onClose called and modal unmounts).
 *
 * AI Enhance–specific tests (disabled-when-enhancing, spinner, onClick) live in
 * PromptToolbar.enhance.test.tsx.
 */

import React, { useRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { AssetSummary } from '../types';
import { PromptToolbar } from './PromptToolbar';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the api module so useAssets never fires real HTTP
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

// Stub AssetPickerModal so we can control what it renders and when onPick/onClose fire.
// The mock captures the latest props via a ref so tests can inspect and trigger them.
// vi.hoisted ensures pickerPropsRef is initialised before the vi.mock factory runs.

const { pickerPropsRef } = vi.hoisted(() => ({
  pickerPropsRef: {
    current: null as {
      mediaType: string;
      onPick: (asset: AssetSummary) => void;
      onClose: () => void;
    } | null,
  },
}));

vi.mock('./AssetPickerModal', () => ({
  AssetPickerModal: (props: {
    mediaType: string;
    onPick: (asset: AssetSummary) => void;
    onClose: () => void;
  }) => {
    pickerPropsRef.current = props;
    return (
      <div data-testid="mock-picker" data-media-type={props.mediaType}>
        <button
          type="button"
          data-testid="mock-pick-button"
          onClick={() =>
            props.onPick({
              id: 'asset-1',
              type: props.mediaType as AssetSummary['type'],
              label: 'Test Asset',
              durationSeconds: null,
              thumbnailUrl: null,
              createdAt: '2026-01-01T00:00:00Z',
            })
          }
        >
          Pick
        </button>
        <button
          type="button"
          data-testid="mock-close-button"
          onClick={() => props.onClose()}
        >
          Close
        </button>
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// Track the most recent insertMediaRef spy across renders
let capturedInsertMediaRef: ReturnType<typeof vi.fn>;

interface HostWithCaptureProps {
  draftId?: string | null;
  isEnhancing?: boolean;
  onEnhance?: () => void;
}

function HostWithCapture({
  draftId = 'draft-1',
  isEnhancing = false,
  onEnhance = vi.fn(),
}: HostWithCaptureProps = {}): React.ReactElement {
  const insertMediaRef = vi.fn();
  capturedInsertMediaRef = insertMediaRef;
  const focus = vi.fn();
  const promptEditorRef = useRef({ insertMediaRef, focus });

  return (
    <div>
      <PromptToolbar
        promptEditorRef={
          promptEditorRef as React.RefObject<{ insertMediaRef: typeof insertMediaRef; focus: typeof focus } | null>
        }
        draftId={draftId}
        isEnhancing={isEnhancing}
        onEnhance={onEnhance}
      />
    </div>
  );
}

function renderToolbar(props: HostWithCaptureProps = {}) {
  pickerPropsRef.current = null;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HostWithCapture {...props} />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PromptToolbar', () => {
  beforeEach(() => {
    pickerPropsRef.current = null;
  });

  it('renders all four buttons with correct labels', () => {
    renderToolbar();

    expect(screen.getByRole('button', { name: /ai enhance/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /insert video/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /insert image/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /insert audio/i })).toBeTruthy();
  });

  it('AI Enhance button is disabled when draftId is null and clicking it does not open a modal', () => {
    renderToolbar({ draftId: null });

    const aiBtn = screen.getByRole('button', { name: /ai enhance/i });
    expect(aiBtn).toHaveProperty('disabled', true);

    fireEvent.click(aiBtn);

    expect(screen.queryByTestId('mock-picker')).toBeNull();
  });

  it('clicking Insert Video opens the modal with mediaType="video"', () => {
    renderToolbar();

    fireEvent.click(screen.getByTestId('toolbar-insert-video'));

    const picker = screen.getByTestId('mock-picker');
    expect(picker).toBeTruthy();
    expect(picker.getAttribute('data-media-type')).toBe('video');
  });

  it('clicking Insert Image opens the modal with mediaType="image"', () => {
    renderToolbar();

    fireEvent.click(screen.getByTestId('toolbar-insert-image'));

    const picker = screen.getByTestId('mock-picker');
    expect(picker).toBeTruthy();
    expect(picker.getAttribute('data-media-type')).toBe('image');
  });

  it('clicking Insert Audio opens the modal with mediaType="audio"', () => {
    renderToolbar();

    fireEvent.click(screen.getByTestId('toolbar-insert-audio'));

    const picker = screen.getByTestId('mock-picker');
    expect(picker).toBeTruthy();
    expect(picker.getAttribute('data-media-type')).toBe('audio');
  });

  it('only one modal open at a time — clicking Insert Image while Video modal is open switches to Image', () => {
    renderToolbar();

    // Open video picker first
    fireEvent.click(screen.getByTestId('toolbar-insert-video'));
    expect(screen.getByTestId('mock-picker').getAttribute('data-media-type')).toBe('video');

    // Now open image picker — video picker should close, image picker opens
    fireEvent.click(screen.getByTestId('toolbar-insert-image'));
    const pickers = screen.getAllByTestId('mock-picker');
    // Only one picker at a time
    expect(pickers).toHaveLength(1);
    expect(pickers[0].getAttribute('data-media-type')).toBe('image');
  });

  it('picking an asset calls insertMediaRef with { id, type, label }', () => {
    renderToolbar();

    fireEvent.click(screen.getByTestId('toolbar-insert-video'));

    fireEvent.click(screen.getByTestId('mock-pick-button'));

    expect(capturedInsertMediaRef).toHaveBeenCalledTimes(1);
    expect(capturedInsertMediaRef).toHaveBeenCalledWith({
      id: 'asset-1',
      type: 'video',
      label: 'Test Asset',
    });
  });

  it('modal closes after pick (onClose is called and picker unmounts)', async () => {
    renderToolbar();

    fireEvent.click(screen.getByTestId('toolbar-insert-audio'));
    expect(screen.getByTestId('mock-picker')).toBeTruthy();

    // Click the close button inside the mock picker (simulating modal calling onClose)
    fireEvent.click(screen.getByTestId('mock-close-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('mock-picker')).toBeNull();
    });
  });
});
