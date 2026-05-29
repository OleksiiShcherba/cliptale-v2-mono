import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { capturedPickerProps, mockApiClientGet } = vi.hoisted(() => ({
  capturedPickerProps: { current: null as Record<string, unknown> | null },
  mockApiClientGet: vi.fn(),
}));

vi.mock('@/features/generate-wizard/components/AssetPickerModal', () => ({
  AssetPickerModal: (props: Record<string, unknown>) => {
    capturedPickerProps.current = props;
    return <div data-testid="asset-picker-modal" />;
  },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: mockApiClientGet },
}));

import { PrincipalImageApprovalModal } from './PrincipalImageApprovalModal';
import { StoryboardBulkStreamUrlProvider } from './SceneBlockNode.mediaThumbnail';
import type { StoryboardIllustrationReferenceStatus } from '@/features/storyboard/types';
import type { AssetSummary } from '@/features/generate-wizard/types';

function reference(
  overrides: Partial<StoryboardIllustrationReferenceStatus> = {},
): StoryboardIllustrationReferenceStatus {
  return {
    status: 'ready',
    jobId: 'ref-job-1',
    outputFileId: 'principal-file-1',
    sourceReferenceFileIds: [],
    approvalStatus: 'pending',
    errorMessage: null,
    ...overrides,
  };
}

function asset(id: string): AssetSummary {
  return {
    id,
    type: 'image',
    label: `${id}.png`,
    durationSeconds: null,
    thumbnailUrl: null,
    createdAt: '2026-05-21T00:00:00.000Z',
  };
}

function renderModal(overrides: Partial<React.ComponentProps<typeof PrincipalImageApprovalModal>> = {}) {
  const props = {
    draftId: 'draft-1',
    reference: reference(),
    onApprove: vi.fn().mockResolvedValue(undefined),
    onEdit: vi.fn().mockResolvedValue(undefined),
    onReplace: vi.fn().mockResolvedValue(undefined),
    onSetReferences: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return {
    props,
    ...render(<PrincipalImageApprovalModal {...props} />),
  };
}

describe('PrincipalImageApprovalModal', () => {
  beforeEach(() => {
    capturedPickerProps.current = null;
    vi.clearAllMocks();
    mockApiClientGet.mockImplementation((path: string) => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ url: `https://signed.test${path}` }),
    }));
  });

  it('renders the authenticated principal image preview and approves it', async () => {
    const { props } = renderModal();

    const image = await screen.findByTestId('principal-image-preview-img') as HTMLImageElement;
    expect(image.src).toContain('https://signed.test/files/principal-file-1/stream');
    expect(mockApiClientGet).toHaveBeenCalledWith('/files/principal-file-1/stream');

    fireEvent.click(screen.getByTestId('principal-image-approve-button'));

    await waitFor(() => {
      expect(props.onApprove).toHaveBeenCalledTimes(1);
    });
  });

  it('uses pre-resolved bulk stream URLs for principal and reference previews', async () => {
    render(
      <StoryboardBulkStreamUrlProvider
        urls={{
          'principal-file-1': 'https://signed.test/bulk/principal-file-1',
          'reference-file-1': 'https://signed.test/bulk/reference-file-1',
        }}
      >
        <PrincipalImageApprovalModal
          draftId="draft-1"
          reference={reference({ sourceReferenceFileIds: ['reference-file-1'] })}
          onApprove={vi.fn().mockResolvedValue(undefined)}
          onEdit={vi.fn().mockResolvedValue(undefined)}
          onReplace={vi.fn().mockResolvedValue(undefined)}
          onSetReferences={vi.fn().mockResolvedValue(undefined)}
        />
      </StoryboardBulkStreamUrlProvider>,
    );

    const principal = await screen.findByTestId('principal-image-preview-img') as HTMLImageElement;
    const referencePreview = await screen.findByTestId('principal-image-reference-preview-img') as HTMLImageElement;

    expect(principal.src).toBe('https://signed.test/bulk/principal-file-1');
    expect(referencePreview.src).toBe('https://signed.test/bulk/reference-file-1');
    expect(mockApiClientGet).not.toHaveBeenCalledWith('/files/principal-file-1/stream');
    expect(mockApiClientGet).not.toHaveBeenCalledWith('/files/reference-file-1/stream');
  });

  it('marks missing bulk-managed principal and reference previews unavailable without loading forever', () => {
    render(
      <StoryboardBulkStreamUrlProvider
        urls={{}}
        fileIds={['principal-file-1', 'reference-file-1']}
        missingFileIds={['principal-file-1', 'reference-file-1']}
      >
        <PrincipalImageApprovalModal
          draftId="draft-1"
          reference={reference({ sourceReferenceFileIds: ['reference-file-1'] })}
          onApprove={vi.fn().mockResolvedValue(undefined)}
          onEdit={vi.fn().mockResolvedValue(undefined)}
          onReplace={vi.fn().mockResolvedValue(undefined)}
          onSetReferences={vi.fn().mockResolvedValue(undefined)}
        />
      </StoryboardBulkStreamUrlProvider>,
    );

    expect(screen.getByTestId('principal-image-preview-fallback').textContent).toBe('Preview unavailable');
    expect(screen.queryByTestId('principal-image-preview-loader')).toBeNull();
    expect(screen.getByLabelText('Reference preview unavailable')).toBeTruthy();
    expect(mockApiClientGet).not.toHaveBeenCalledWith('/files/principal-file-1/stream');
    expect(mockApiClientGet).not.toHaveBeenCalledWith('/files/reference-file-1/stream');
  });

  it('opens a full preview from the principal image and closes it', async () => {
    renderModal();

    fireEvent.click(await screen.findByTestId('principal-image-preview-open'));

    const lightbox = screen.getByTestId('principal-image-lightbox');
    const lightboxImage = screen.getByTestId('principal-image-lightbox-img') as HTMLImageElement;
    expect(lightboxImage.src).toContain('https://signed.test/files/principal-file-1/stream');
    expect(document.activeElement).toBe(lightbox);

    fireEvent.keyDown(lightbox, { key: 'Escape' });
    expect(screen.queryByTestId('principal-image-lightbox')).toBeNull();
  });

  it('keeps keyboard focus inside the full preview modal', async () => {
    renderModal();

    fireEvent.click(await screen.findByTestId('principal-image-preview-open'));

    const lightbox = screen.getByTestId('principal-image-lightbox');
    const closeButton = screen.getByTestId('principal-image-lightbox-close');

    expect(document.activeElement).toBe(lightbox);
    fireEvent.keyDown(lightbox, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.click(screen.getByTestId('principal-image-lightbox-close'));
    expect(screen.queryByTestId('principal-image-lightbox')).toBeNull();
  });

  it('requires an edit prompt before regenerating', async () => {
    const { props } = renderModal();

    expect((screen.getByTestId('principal-image-edit-button') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('principal-image-edit-prompt'), {
      target: { value: 'Make the product brighter' },
    });
    fireEvent.click(screen.getByTestId('principal-image-edit-button'));

    await waitFor(() => {
      expect(props.onEdit).toHaveBeenCalledWith('Make the product brighter', []);
    });
  });

  it('shows a loader over the preview while principal image work is active', () => {
    renderModal({ isBusy: true });

    expect(screen.getByTestId('principal-image-preview-loader').textContent).toContain('Generating preview');
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('shows a preview loader instead of unavailable copy while regenerated output is pending', () => {
    renderModal({
      reference: reference({
        status: 'running',
        jobId: 'ref-job-2',
        outputFileId: null,
      }),
    });

    expect(screen.getByTestId('principal-image-preview-loader')).toBeTruthy();
    expect(screen.queryByTestId('principal-image-preview-fallback')).toBeNull();
  });

  it('opens draft-scoped replacement picker and submits the selected file', async () => {
    const { props } = renderModal();

    fireEvent.click(screen.getByTestId('principal-image-replace-button'));

    expect(screen.getByTestId('asset-picker-modal')).toBeTruthy();
    expect(capturedPickerProps.current).toMatchObject({
      mediaType: 'image',
      draftId: 'draft-1',
      scope: 'draft',
      uploadTarget: { kind: 'draft', draftId: 'draft-1' },
    });

    const onPick = capturedPickerProps.current?.onPick as (picked: AssetSummary) => void;
    act(() => {
      onPick(asset('replacement-file-1'));
    });

    await waitFor(() => {
      expect(props.onReplace).toHaveBeenCalledWith('replacement-file-1');
    });
  });

  it('adds and removes extra reference images', async () => {
    const { props } = renderModal({
      reference: reference({ sourceReferenceFileIds: ['reference-file-1'] }),
    });

    const initialPreview = await screen.findByTestId('principal-image-reference-preview-img') as HTMLImageElement;
    expect(initialPreview.src).toContain('https://signed.test/files/reference-file-1/stream');
    expect(screen.queryByText('reference-file-1')).toBeNull();

    fireEvent.click(screen.getByTestId('principal-image-add-reference-button'));
    const onPick = capturedPickerProps.current?.onPick as (picked: AssetSummary) => void;
    act(() => {
      onPick(asset('reference-file-2'));
    });

    await waitFor(() => {
      expect(props.onSetReferences).toHaveBeenCalledWith(['reference-file-1', 'reference-file-2']);
    });

    fireEvent.click(screen.getByLabelText('Remove reference reference-file-1'));

    await waitFor(() => {
      expect(props.onSetReferences).toHaveBeenLastCalledWith(['reference-file-2']);
    });
  });

  it('opens a full preview from an extra reference thumbnail', async () => {
    renderModal({
      reference: reference({ sourceReferenceFileIds: ['reference-file-1'] }),
    });

    fireEvent.click(await screen.findByTestId('principal-image-reference-preview-open'));

    const lightboxImage = screen.getByTestId('principal-image-lightbox-img') as HTMLImageElement;
    expect(lightboxImage.src).toContain('https://signed.test/files/reference-file-1/stream');
  });

  it('does not show a picked extra reference when the update fails', async () => {
    const { props } = renderModal({
      reference: reference({ sourceReferenceFileIds: ['reference-file-1'] }),
      onSetReferences: vi.fn().mockRejectedValue(
        new Error('PUT /storyboards/draft-1/illustrations/principal-image/references failed: 422'),
      ),
    });

    fireEvent.click(screen.getByTestId('principal-image-add-reference-button'));
    const onPick = capturedPickerProps.current?.onPick as (picked: AssetSummary) => void;
    act(() => {
      onPick(asset('reference-file-2'));
    });

    await waitFor(() => {
      expect(props.onSetReferences).toHaveBeenCalledWith(['reference-file-1', 'reference-file-2']);
      expect(screen.getByRole('alert').textContent).toBe('Selected image is not available for this draft.');
    });
    expect(screen.getAllByTestId('principal-image-reference-preview')).toHaveLength(1);
  });

  it('falls back when the preview image fails', async () => {
    renderModal();

    fireEvent.error(await screen.findByTestId('principal-image-preview-img'));

    expect(screen.getByTestId('principal-image-preview-fallback').textContent).toBe('Preview unavailable');
  });

  it('traps tab focus within the modal', async () => {
    renderModal();

    const dialog = screen.getByTestId('principal-image-modal');
    const previewButton = await screen.findByTestId('principal-image-preview-open') as HTMLButtonElement;
    const editPrompt = screen.getByTestId('principal-image-edit-prompt') as HTMLTextAreaElement;
    const approveButton = screen.getByTestId('principal-image-approve-button') as HTMLButtonElement;

    dialog.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(approveButton);

    dialog.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(previewButton);

    approveButton.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(previewButton);

    previewButton.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(approveButton);
  });
});
