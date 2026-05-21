import React, { useCallback, useEffect, useRef, useState } from 'react';

import { AssetPickerModal } from '@/features/generate-wizard/components/AssetPickerModal';
import type { AssetSummary } from '@/features/generate-wizard/types';
import type { StoryboardIllustrationReferenceStatus } from '@/features/storyboard/types';
import { buildAuthenticatedUrl } from '@/lib/api-client';
import { config } from '@/lib/config';

import {
  PrincipalImageLightbox,
  type PrincipalImageLightboxState,
} from './PrincipalImageLightbox';
import { PrincipalImageApprovalControls } from './PrincipalImageApprovalControls';
import { PrincipalImagePreview } from './PrincipalImagePreview';
import * as s from './PrincipalImageApprovalModal.styles';

type PrincipalImageApprovalModalProps = {
  draftId: string;
  reference: StoryboardIllustrationReferenceStatus;
  isBusy?: boolean;
  error?: string | null;
  onApprove: () => Promise<void>;
  onEdit: (prompt: string, extraReferenceFileIds: string[]) => Promise<void>;
  onReplace: (fileId: string) => Promise<void>;
  onSetReferences: (fileIds: string[]) => Promise<void>;
  onClose?: () => void;
};

function CloseIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

function getPrincipalImageActionError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Principal image action failed';
  if (
    message.includes('/illustrations/principal-image/references failed: 422') ||
    message.includes('/illustrations/principal-image/replace failed: 422')
  ) {
    return 'Selected image is not available for this draft.';
  }
  return message;
}

export function PrincipalImageApprovalModal({
  draftId,
  reference,
  isBusy = false,
  error = null,
  onApprove,
  onEdit,
  onReplace,
  onSetReferences,
  onClose,
}: PrincipalImageApprovalModalProps): React.ReactElement {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const replaceButtonRef = useRef<HTMLButtonElement | null>(null);
  const addReferenceButtonRef = useRef<HTMLButtonElement | null>(null);
  const [prompt, setPrompt] = useState('');
  const [sourceReferenceFileIds, setSourceReferenceFileIds] = useState(reference.sourceReferenceFileIds);
  const [pickerMode, setPickerMode] = useState<'replace' | 'references' | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [lightbox, setLightbox] = useState<PrincipalImageLightboxState | null>(null);
  const disabled = isBusy || reference.status !== 'ready' || !reference.outputFileId;
  const promptLabelId = 'principal-image-edit-prompt-label';

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const updateCompact = () => {
      const compact = typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 680px)').matches
        : window.innerWidth <= 680;
      setIsCompact(compact);
    };
    updateCompact();
    window.addEventListener('resize', updateCompact);
    return () => window.removeEventListener('resize', updateCompact);
  }, []);

  useEffect(() => {
    setPreviewFailed(false);
  }, [reference.outputFileId]);

  useEffect(() => {
    setSourceReferenceFileIds(reference.sourceReferenceFileIds);
  }, [reference.sourceReferenceFileIds]);

  const closePicker = useCallback(() => {
    setPickerMode(null);
  }, []);

  const runAction = useCallback(async (action: () => Promise<void>): Promise<void> => {
    setLocalError(null);
    try {
      await action();
    } catch (err) {
      setLocalError(getPrincipalImageActionError(err));
    }
  }, []);

  const handleApprove = useCallback(() => {
    void runAction(onApprove);
  }, [onApprove, runAction]);

  const handleEdit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setLocalError('Edit prompt is required.');
      return;
    }
    void runAction(() => onEdit(trimmed, sourceReferenceFileIds));
  }, [onEdit, prompt, runAction, sourceReferenceFileIds]);

  const handleReplacePick = useCallback((asset: AssetSummary) => {
    closePicker();
    void runAction(() => onReplace(asset.id));
  }, [closePicker, onReplace, runAction]);

  const handleReferencePick = useCallback((asset: AssetSummary) => {
    const next = [...new Set([...sourceReferenceFileIds, asset.id])];
    closePicker();
    void runAction(async () => {
      await onSetReferences(next);
      setSourceReferenceFileIds(next);
    });
  }, [closePicker, onSetReferences, runAction, sourceReferenceFileIds]);

  const handleRemoveReference = useCallback((fileId: string) => {
    const next = sourceReferenceFileIds.filter((candidate) => candidate !== fileId);
    void runAction(async () => {
      await onSetReferences(next);
      setSourceReferenceFileIds(next);
    });
  }, [onSetReferences, runAction, sourceReferenceFileIds]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && onClose) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusableElements = getFocusableElements(dialog);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (!firstElement || !lastElement) return;

    const activeElement = document.activeElement;
    const focusIsInsideDialog = activeElement instanceof Node && dialog.contains(activeElement);

    if (activeElement === dialog || !focusIsInsideDialog) {
      event.preventDefault();
      if (event.shiftKey) {
        lastElement.focus();
      } else {
        firstElement.focus();
      }
    } else if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }, [onClose]);

  const handleBackdropClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && onClose) onClose();
  }, [onClose]);

  const previewUrl = reference.outputFileId
    ? buildAuthenticatedUrl(`${config.apiBaseUrl}/assets/${reference.outputFileId}/stream`)
    : null;
  const statusError = localError ?? error;
  const isPreviewLoading = isBusy || reference.status === 'queued' || reference.status === 'running';

  return (
    <>
      <div style={s.backdropStyle} onClick={handleBackdropClick} data-testid="principal-image-modal-backdrop">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Review principal image"
          tabIndex={-1}
          style={s.dialogStyle}
          onKeyDown={handleKeyDown}
          data-testid="principal-image-modal"
        >
          <div style={s.headerStyle}>
            <h2 style={s.titleStyle}>Review principal image</h2>
            {onClose && (
              <button type="button" style={s.closeButtonStyle} onClick={onClose} aria-label="Close modal">
                <CloseIcon />
              </button>
            )}
          </div>

          <div style={isCompact ? s.bodyCompactStyle : s.bodyStyle}>
            <PrincipalImagePreview
              previewUrl={previewUrl}
              previewFailed={previewFailed}
              isPreviewLoading={isPreviewLoading}
              onPreviewFailed={() => setPreviewFailed(true)}
              onOpenLightbox={setLightbox}
            />
            <PrincipalImageApprovalControls
              prompt={prompt}
              promptLabelId={promptLabelId}
              sourceReferenceFileIds={sourceReferenceFileIds}
              statusError={statusError}
              disabled={disabled}
              isBusy={isBusy}
              addReferenceButtonRef={addReferenceButtonRef}
              replaceButtonRef={replaceButtonRef}
              onPromptChange={setPrompt}
              onEdit={handleEdit}
              onRemoveReference={handleRemoveReference}
              onOpenLightbox={setLightbox}
              onOpenReferencePicker={() => setPickerMode('references')}
              onOpenReplacePicker={() => setPickerMode('replace')}
            />
          </div>

          <div style={s.footerStyle}>
            <span style={s.previewFallbackStyle}>{isBusy ? 'Working…' : 'Awaiting approval'}</span>
            <button
              type="button"
              style={disabled ? s.disabledButtonStyle : s.primaryButtonStyle}
              disabled={disabled}
              onClick={handleApprove}
              data-testid="principal-image-approve-button"
            >
              Approve and continue
            </button>
          </div>
        </div>
      </div>

      {pickerMode === 'replace' && (
        <AssetPickerModal
          mediaType="image"
          draftId={draftId}
          scope="draft"
          uploadTarget={{ kind: 'draft', draftId }}
          triggerRef={replaceButtonRef}
          onPick={handleReplacePick}
          onClose={closePicker}
        />
      )}
      {pickerMode === 'references' && (
        <AssetPickerModal
          mediaType="image"
          draftId={draftId}
          scope="draft"
          uploadTarget={{ kind: 'draft', draftId }}
          triggerRef={addReferenceButtonRef}
          onPick={handleReferencePick}
          onClose={closePicker}
        />
      )}
      {lightbox && <PrincipalImageLightbox lightbox={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}
