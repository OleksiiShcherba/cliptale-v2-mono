/**
 * AssetPickerModal tests.
 *
 * Covers 8 scenarios as specified in the subtask acceptance criteria:
 * 1. Renders title based on mediaType ("Insert Video" / "Insert Image" / "Insert Audio").
 * 2. Body shows only items of the requested type (filtered at server; assert card renders).
 * 3. Clicking an asset card fires onPick with the full asset AND calls onClose.
 * 4. Pressing Esc fires onClose.
 * 5. Clicking the backdrop fires onClose; clicking the dialog body does NOT.
 * 6. Skeleton renders while loading.
 * 7. Empty state renders when items: [].
 * 8. Focus returns to the passed-in triggerRef after close.
 */

import React, { createRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AssetPickerModal } from './AssetPickerModal';
import type { AssetListResponse } from '../types';
import {
  VIDEO_ASSET,
  AUDIO_ASSET,
  VIDEO_RESPONSE,
  IMAGE_RESPONSE,
  AUDIO_RESPONSE,
  EMPTY_RESPONSE,
} from './AssetPickerModal.fixtures';

// ---------------------------------------------------------------------------
// Mock dependencies
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
// Test helpers
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

interface RenderModalOptions {
  onPick?: (asset: ReturnType<typeof vi.fn>) => void;
  onClose?: ReturnType<typeof vi.fn>;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

function renderModal(
  mediaType: 'video' | 'image' | 'audio' = 'video',
  {
    onPick = vi.fn(),
    onClose = vi.fn(),
    triggerRef,
  }: RenderModalOptions = {},
) {
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AssetPickerModal
        mediaType={mediaType}
        onPick={onPick as never}
        onClose={onClose}
        triggerRef={triggerRef}
      />
    </QueryClientProvider>,
  );
}

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

describe('AssetPickerModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should render "Insert Video" title when mediaType is video', async () => {
    mockSuccess(VIDEO_RESPONSE);
    renderModal('video');
    expect(screen.getByText('Insert Video')).toBeTruthy();
    expect(screen.getByText('Select from your library')).toBeTruthy();
  });

  it('should render "Insert Image" title when mediaType is image', async () => {
    mockSuccess(IMAGE_RESPONSE);
    renderModal('image');
    expect(screen.getByText('Insert Image')).toBeTruthy();
  });

  it('should render "Insert Audio" title when mediaType is audio', async () => {
    mockSuccess(AUDIO_RESPONSE);
    renderModal('audio');
    expect(screen.getByText('Insert Audio')).toBeTruthy();
  });

  it('should show video card when mediaType is video', async () => {
    mockSuccess(VIDEO_RESPONSE);
    renderModal('video');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: VIDEO_ASSET.label })).toBeTruthy();
    });
  });

  it('should show audio row when mediaType is audio', async () => {
    mockSuccess(AUDIO_RESPONSE);
    renderModal('audio');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: AUDIO_ASSET.label })).toBeTruthy();
    });
  });

  it('should fire onPick with the full asset and call onClose when a card is clicked', async () => {
    mockSuccess(VIDEO_RESPONSE);
    const onPick = vi.fn();
    const onClose = vi.fn();
    renderModal('video', { onPick, onClose });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: VIDEO_ASSET.label })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: VIDEO_ASSET.label }));

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick).toHaveBeenCalledWith(VIDEO_ASSET);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('should call onClose when Esc is pressed', async () => {
    mockSuccess(VIDEO_RESPONSE);
    const onClose = vi.fn();
    renderModal('video', { onClose });

    const dialog = screen.getByTestId('picker-dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('should call onClose when the backdrop is clicked', async () => {
    mockSuccess(VIDEO_RESPONSE);
    const onClose = vi.fn();
    renderModal('video', { onClose });

    const backdrop = screen.getByTestId('picker-backdrop');
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('should NOT call onClose when the dialog body content area is clicked', async () => {
    mockSuccess(VIDEO_RESPONSE);
    const onClose = vi.fn();
    renderModal('video', { onClose });

    const body = screen.getByTestId('picker-body');
    fireEvent.click(body);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('should render the skeleton while loading', () => {
    mockPending();
    renderModal('video');
    expect(screen.getByTestId('picker-skeleton')).toBeTruthy();
  });

  it('should render the error state when the query fails', async () => {
    mockFailure();
    renderModal('video');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText('Could not load assets')).toBeTruthy();
    });
  });

  it('should render the empty state when items is empty', async () => {
    mockSuccess(EMPTY_RESPONSE);
    renderModal('video');
    await waitFor(() => {
      expect(screen.getByText('No assets found for this type')).toBeTruthy();
    });
  });

  it('should return focus to the triggerRef element after close', async () => {
    mockSuccess(VIDEO_RESPONSE);
    const onClose = vi.fn();

    // Create a real focusable element in the DOM
    const triggerButton = document.createElement('button');
    triggerButton.textContent = 'Open picker';
    document.body.appendChild(triggerButton);

    const triggerRef = createRef<HTMLElement>() as React.MutableRefObject<HTMLElement>;
    // @ts-expect-error: assigning to the read-only .current for test purposes
    triggerRef.current = triggerButton;

    const { unmount } = renderModal('video', { onClose, triggerRef });

    // Unmounting simulates the modal closing and the useEffect cleanup running
    unmount();

    expect(document.activeElement).toBe(triggerButton);

    document.body.removeChild(triggerButton);
  });
});
