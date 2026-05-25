import React from 'react';

import { useFileStreamUrl } from '@/shared/hooks/useFileStreamUrl';

import type { PrincipalImageLightboxState } from './PrincipalImageLightbox';
import * as s from './PrincipalImageApprovalModal.styles';

interface PrincipalImagePreviewProps {
  fileId: string | null;
  isPreviewLoading: boolean;
  onOpenLightbox: (lightbox: PrincipalImageLightboxState) => void;
}

export function PrincipalImagePreview({
  fileId,
  isPreviewLoading,
  onOpenLightbox,
}: PrincipalImagePreviewProps): React.ReactElement {
  const [previewFailed, setPreviewFailed] = React.useState(false);
  const { url: previewUrl, isLoading: isUrlLoading, error } = useFileStreamUrl(fileId);

  React.useEffect(() => {
    setPreviewFailed(false);
  }, [fileId, previewUrl]);

  const showLoader = isPreviewLoading || isUrlLoading;

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
            onError={() => setPreviewFailed(true)}
            data-testid="principal-image-preview-img"
          />
        </button>
      ) : showLoader ? null : (
        <span style={s.previewFallbackStyle} data-testid="principal-image-preview-fallback">
          {error ?? 'Preview unavailable'}
        </span>
      )}
      {showLoader && (
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
