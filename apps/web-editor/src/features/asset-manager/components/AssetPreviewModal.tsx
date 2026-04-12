import React, { useEffect, useMemo, type MouseEvent } from 'react';

import type { Asset } from '@/features/asset-manager/types';
import { getAssetPreviewUrl } from '@/features/asset-manager/utils';
import { buildAuthenticatedUrl } from '@/lib/api-client';
import { config } from '@/lib/config';
import { WaveformSvg } from '@/features/timeline/components/WaveformSvg';

import { assetPreviewModalStyles as styles } from './assetPreviewModal.styles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AssetPreviewModalProps {
  /** The asset to preview. Its `contentType` selects the player element. */
  asset: Asset;
  /** Called when the user dismisses the modal. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// AssetPreviewModal
// ---------------------------------------------------------------------------

/**
 * Full-screen overlay modal that previews a single media asset without adding
 * it to the timeline. Branches by MIME content type:
 *
 *   - `video/*` → native `<video controls>`
 *   - `audio/*` → native `<audio controls>` with optional `WaveformSvg`
 *   - `image/*` → `<img>` at full detail size
 *
 * Closes on Escape key, on backdrop click, and via the header close button.
 * Remotion `<Player>` is intentionally NOT used here — this is a standalone
 * previewer, not a composition preview.
 */
export function AssetPreviewModal({ asset, onClose }: AssetPreviewModalProps): React.ReactElement {
  // Close on Escape.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) onClose();
  };

  const isVideo = asset.contentType.startsWith('video/');
  const isAudio = asset.contentType.startsWith('audio/');
  const isImage = asset.contentType.startsWith('image/');

  /**
   * Authenticated download URL for video and audio elements.
   * Browser media elements cannot set Authorization headers, so the token is
   * appended as a `?token=` query parameter via `buildAuthenticatedUrl`.
   */
  const authenticatedDownloadUrl = useMemo(
    () => buildAuthenticatedUrl(asset.downloadUrl),
    [asset.downloadUrl],
  );

  /**
   * Authenticated source URL for image preview.
   * `getAssetPreviewUrl` selects the best URL (thumbnailUri or stream endpoint)
   * and already wraps it with `buildAuthenticatedUrl` internally.
   */
  const imageSrc = useMemo(
    () => (isImage ? getAssetPreviewUrl(asset, config.apiBaseUrl) : null),
    [asset, isImage],
  );

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="asset-preview-title"
      onClick={handleOverlayClick}
    >
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 id="asset-preview-title" style={styles.title} title={asset.filename}>
            {asset.filename}
          </h2>
          <button
            type="button"
            style={styles.closeButton}
            onClick={onClose}
            aria-label="Close asset preview"
          >
            &#x2715;
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {isVideo && (
            <video
              data-testid="asset-preview-video"
              src={authenticatedDownloadUrl}
              controls
              autoPlay
              style={styles.video}
              aria-label={`Video preview for ${asset.filename}`}
            />
          )}

          {isAudio && (
            <div style={styles.audioWrapper}>
              {asset.waveformPeaks && asset.waveformPeaks.length > 0 ? (
                <div style={styles.waveformBox} data-testid="asset-preview-waveform">
                  <WaveformSvg peaks={asset.waveformPeaks} width={600} height={120} />
                </div>
              ) : (
                <div style={styles.waveformEmpty}>No waveform available</div>
              )}
              <audio
                data-testid="asset-preview-audio"
                src={authenticatedDownloadUrl}
                controls
                autoPlay
                style={styles.audio}
                aria-label={`Audio preview for ${asset.filename}`}
              />
            </div>
          )}

          {isImage && imageSrc && (
            <img
              data-testid="asset-preview-image"
              src={imageSrc}
              alt={`Preview of ${asset.filename}`}
              style={styles.image}
            />
          )}

          {!isVideo && !isAudio && !isImage && (
            <p style={styles.notReady}>
              Preview not supported for this file type.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
