import React from 'react';

import { useFileStreamUrl } from '@/shared/hooks/useFileStreamUrl';

import type { PrincipalImageLightboxState } from './PrincipalImageLightbox';
import * as s from './PrincipalImageApprovalModal.styles';

function CloseIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface PrincipalImageApprovalControlsProps {
  prompt: string;
  promptLabelId: string;
  sourceReferenceFileIds: string[];
  statusError: string | null;
  disabled: boolean;
  isBusy: boolean;
  addReferenceButtonRef: React.RefObject<HTMLButtonElement>;
  replaceButtonRef: React.RefObject<HTMLButtonElement>;
  onPromptChange: (value: string) => void;
  onEdit: () => void;
  onRemoveReference: (fileId: string) => void;
  onOpenLightbox: (lightbox: PrincipalImageLightboxState) => void;
  onOpenReferencePicker: () => void;
  onOpenReplacePicker: () => void;
}

interface ReferencePreviewProps {
  fileId: string;
  isBusy: boolean;
  onRemoveReference: (fileId: string) => void;
  onOpenLightbox: (lightbox: PrincipalImageLightboxState) => void;
}

function ReferencePreview({
  fileId,
  isBusy,
  onRemoveReference,
  onOpenLightbox,
}: ReferencePreviewProps): React.ReactElement {
  const [previewFailed, setPreviewFailed] = React.useState(false);
  const { url, isLoading, error } = useFileStreamUrl(fileId);

  React.useEffect(() => {
    setPreviewFailed(false);
  }, [fileId, url]);

  return (
    <div
      style={s.referencePreviewStyle}
      title={fileId}
      data-testid="principal-image-reference-preview"
    >
      {url && !previewFailed ? (
        <button
          type="button"
          style={s.referencePreviewButtonStyle}
          onClick={() => onOpenLightbox({ src: url, alt: 'Extra reference preview' })}
          aria-label={`Open reference ${fileId}`}
          data-testid="principal-image-reference-preview-open"
        >
          <img
            src={url}
            alt="Extra reference preview"
            style={s.referencePreviewImageStyle}
            onError={() => setPreviewFailed(true)}
            data-testid="principal-image-reference-preview-img"
          />
        </button>
      ) : (
        <span
          style={s.referencePreviewFallbackStyle}
          aria-label={error ?? (isLoading ? 'Loading reference preview' : 'Reference preview unavailable')}
        >
          {isLoading ? '' : '!'}
        </span>
      )}
      <button
        type="button"
        style={s.removeChipButtonStyle}
        onClick={() => onRemoveReference(fileId)}
        aria-label={`Remove reference ${fileId}`}
        disabled={isBusy}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

export function PrincipalImageApprovalControls({
  prompt,
  promptLabelId,
  sourceReferenceFileIds,
  statusError,
  disabled,
  isBusy,
  addReferenceButtonRef,
  replaceButtonRef,
  onPromptChange,
  onEdit,
  onRemoveReference,
  onOpenLightbox,
  onOpenReferencePicker,
  onOpenReplacePicker,
}: PrincipalImageApprovalControlsProps): React.ReactElement {
  return (
    <div style={s.controlsStyle}>
      <section style={s.sectionStyle}>
        <label id={promptLabelId} htmlFor="principal-image-edit-prompt" style={s.sectionTitleStyle}>
          Edit prompt
        </label>
        <textarea
          id="principal-image-edit-prompt"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Describe the adjustment"
          style={s.textareaStyle}
          disabled={isBusy}
          aria-labelledby={promptLabelId}
          data-testid="principal-image-edit-prompt"
        />
        <div style={s.actionRowStyle}>
          <button
            type="button"
            style={disabled || !prompt.trim() ? s.disabledButtonStyle : s.secondaryButtonStyle}
            disabled={disabled || !prompt.trim()}
            onClick={onEdit}
            data-testid="principal-image-edit-button"
          >
            Regenerate
          </button>
        </div>
      </section>

      <section style={s.sectionStyle}>
        <p style={s.sectionTitleStyle}>Extra references</p>
        <div style={s.referenceListStyle} data-testid="principal-image-reference-list">
          {sourceReferenceFileIds.map((fileId) => (
            <ReferencePreview
              key={fileId}
              fileId={fileId}
              isBusy={isBusy}
              onRemoveReference={onRemoveReference}
              onOpenLightbox={onOpenLightbox}
            />
          ))}
        </div>
        <div style={s.actionRowStyle}>
          <button
            ref={addReferenceButtonRef}
            type="button"
            style={disabled ? s.disabledButtonStyle : s.secondaryButtonStyle}
            disabled={disabled}
            onClick={onOpenReferencePicker}
            data-testid="principal-image-add-reference-button"
          >
            Add reference
          </button>
          <button
            ref={replaceButtonRef}
            type="button"
            style={disabled ? s.disabledButtonStyle : s.secondaryButtonStyle}
            disabled={disabled}
            onClick={onOpenReplacePicker}
            data-testid="principal-image-replace-button"
          >
            Replace image
          </button>
        </div>
      </section>

      {statusError && <p style={s.errorStyle} role="alert">{statusError}</p>}
    </div>
  );
}
