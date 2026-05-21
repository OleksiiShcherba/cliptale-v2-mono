import React from 'react';

import type { PrincipalImageLightboxState } from './PrincipalImageLightbox';
import * as s from './PrincipalImageApprovalModal.styles';

interface PrincipalImagePreviewProps {
  previewUrl: string | null;
  previewFailed: boolean;
  isPreviewLoading: boolean;
  onPreviewFailed: () => void;
  onOpenLightbox: (lightbox: PrincipalImageLightboxState) => void;
}

export function PrincipalImagePreview({
  previewUrl,
  previewFailed,
  isPreviewLoading,
  onPreviewFailed,
  onOpenLightbox,
}: PrincipalImagePreviewProps): React.ReactElement {
  return (
    <div style={s.previewShellStyle} data-testid="principal-image-preview">
      {previewUrl && !previewFailed ? (
        <button
          type="button"
          style={s.previewButtonStyle}
          onClick={() => onOpenLightbox({ src: previewUrl, alt: 'Principal image preview' })}
          aria-label="Open principal image preview"
          data-testid="principal-image-preview-open"
        >
          <img
            src={previewUrl}
            alt="Principal image preview"
            style={s.previewImageStyle}
            onError={onPreviewFailed}
            data-testid="principal-image-preview-img"
          />
        </button>
      ) : isPreviewLoading ? null : (
        <span style={s.previewFallbackStyle} data-testid="principal-image-preview-fallback">
          Preview unavailable
        </span>
      )}
      {isPreviewLoading && (
        <div
          style={s.previewLoadingOverlayStyle}
          role="status"
          aria-live="polite"
          data-testid="principal-image-preview-loader"
        >
          <span style={s.previewSpinnerStyle} aria-hidden="true" />
          <span>Generating preview</span>
        </div>
      )}
    </div>
  );
}
