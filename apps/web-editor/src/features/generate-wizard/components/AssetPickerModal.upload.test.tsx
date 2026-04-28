/**
 * AssetPickerModal — upload affordance tests (SB-UPLOAD-1).
 *
 * Covers 4 scenarios:
 * (a) No uploadTarget → no upload button visible.
 * (b) With uploadTarget → upload button visible.
 * (c) Mock useFileUpload with entry status='done' → onPick called with correct AssetSummary shape.
 * (d) Mock useFileUpload with entry status='uploading' → button replaced by progress indicator.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AssetPickerModal } from './AssetPickerModal';
import type { AssetSummary } from '../types';
import type { UploadEntry, UploadTarget } from '@/shared/file-upload/types';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('@/features/generate-wizard/api', () => ({
  // Inline the empty response — can't reference module-level variables inside mock factories
  listAssets: vi.fn().mockResolvedValue({
    items: [],
    nextCursor: null,
    totals: { count: 0, bytesUsed: 0 },
  }),
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

// Hoist the mock so it is available when the vi.mock factory runs
const { mockUploadFiles, mockUseFileUpload } = vi.hoisted(() => {
  const mockUploadFiles = vi.fn();
  const mockUseFileUpload = vi.fn();
  return { mockUploadFiles, mockUseFileUpload };
});

vi.mock('@/shared/file-upload/useFileUpload', () => ({
  useFileUpload: mockUseFileUpload,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

const TEST_UPLOAD_TARGET: UploadTarget = { kind: 'draft', draftId: 'draft-abc' };

interface RenderOptions {
  onPick?: ReturnType<typeof vi.fn>;
  onClose?: ReturnType<typeof vi.fn>;
  uploadTarget?: UploadTarget;
}

function renderModal(
  mediaType: 'video' | 'image' | 'audio' = 'video',
  { onPick = vi.fn(), onClose = vi.fn(), uploadTarget }: RenderOptions = {},
) {
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AssetPickerModal
        mediaType={mediaType}
        onPick={onPick as never}
        onClose={onClose}
        uploadTarget={uploadTarget}
      />
    </QueryClientProvider>,
  );
}

/** Default no-op entries used when the hook is idle. */
function idleHook(): void {
  mockUseFileUpload.mockReturnValue({
    entries: [] as UploadEntry[],
    isUploading: false,
    uploadFiles: mockUploadFiles,
    clearEntries: vi.fn(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssetPickerModal — upload affordance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idleHook();
  });

  it('(a) should NOT render upload button when uploadTarget is absent', () => {
    renderModal('video');
    expect(screen.queryByTestId('upload-button')).toBeNull();
    expect(screen.queryByTestId('upload-file-input')).toBeNull();
  });

  it('(b) should render upload button when uploadTarget is provided', () => {
    renderModal('video', { uploadTarget: TEST_UPLOAD_TARGET });
    const btn = screen.getByTestId('upload-button');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('Upload new file');
    // File input must exist (hidden) for programmatic click
    expect(screen.getByTestId('upload-file-input')).toBeTruthy();
  });

  it('(c) onPick is called with correct AssetSummary shape after upload completes', async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();

    // Capture the onUploadComplete callback the component registers
    let capturedOnUploadComplete: ((fileId: string) => void) | undefined;
    mockUseFileUpload.mockImplementation((opts: { onUploadComplete?: (fileId: string) => void }) => {
      capturedOnUploadComplete = opts.onUploadComplete;
      return {
        entries: [] as UploadEntry[],
        isUploading: false,
        uploadFiles: mockUploadFiles,
        clearEntries: vi.fn(),
      };
    });

    renderModal('image', { onPick, onClose, uploadTarget: TEST_UPLOAD_TARGET });

    // Simulate clicking the upload button to trigger a file-input change
    const fileInput = screen.getByTestId('upload-file-input') as HTMLInputElement;
    const fakeFile = new File(['data'], 'hero.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    // Now simulate the hook calling onUploadComplete with the new fileId
    expect(capturedOnUploadComplete).toBeDefined();
    capturedOnUploadComplete?.('file-xyz');

    await waitFor(() => {
      expect(onPick).toHaveBeenCalledOnce();
    });

    const calledWith = onPick.mock.calls[0][0] as AssetSummary;
    expect(calledWith.id).toBe('file-xyz');
    expect(calledWith.type).toBe('image');
    expect(calledWith.label).toBe('hero.png');
    expect(calledWith.durationSeconds).toBeNull();
    expect(calledWith.thumbnailUrl).toBeNull();
    expect(calledWith.createdAt).toBeTruthy(); // ISO string present

    // onClose is called as part of handlePick
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('(d) should show progress indicator instead of button while uploading', () => {
    // Simulate hook reporting an in-progress upload at 42%
    mockUseFileUpload.mockReturnValue({
      entries: [
        {
          file: new File(['x'], 'clip.mp4', { type: 'video/mp4' }),
          fileId: 'f1',
          uploadUrl: 'https://s3.example.com/upload',
          expiresAt: '',
          progress: 42,
          status: 'uploading',
        } satisfies UploadEntry,
      ],
      isUploading: true,
      uploadFiles: mockUploadFiles,
      clearEntries: vi.fn(),
    });

    renderModal('video', { uploadTarget: TEST_UPLOAD_TARGET });

    // Upload button should be replaced by the progress indicator
    expect(screen.queryByTestId('upload-button')).toBeNull();
    const progress = screen.getByTestId('upload-progress');
    expect(progress).toBeTruthy();
    expect(progress.textContent).toBe('42%');
  });
});
