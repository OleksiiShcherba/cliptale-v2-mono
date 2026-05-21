import React from 'react';

import { buildAuthenticatedUrl } from '@/lib/api-client';
import { config } from '@/lib/config';

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
          {sourceReferenceFileIds.map((fileId) => {
            const src = buildAuthenticatedUrl(`${config.apiBaseUrl}/assets/${fileId}/stream`);
            return (
              <div
                key={fileId}
                style={s.referencePreviewStyle}
                title={fileId}
                data-testid="principal-image-reference-preview"
              >
                <button
                  type="button"
                  style={s.referencePreviewButtonStyle}
                  onClick={() => onOpenLightbox({ src, alt: 'Extra reference preview' })}
                  aria-label={`Open reference ${fileId}`}
                  data-testid="principal-image-reference-preview-open"
                >
                  <img
                    src={src}
                    alt="Extra reference preview"
                    style={s.referencePreviewImageStyle}
                    data-testid="principal-image-reference-preview-img"
                  />
                </button>
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
          })}
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
