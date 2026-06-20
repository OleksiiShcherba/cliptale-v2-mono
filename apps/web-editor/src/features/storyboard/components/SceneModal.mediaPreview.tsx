import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { AssetKind } from '@/features/generate-wizard/types';
import { useFileStreamUrl } from '@/shared/hooks/useFileStreamUrl';
import { buildAuthenticatedUrl } from '@/lib/api-client';
import { config } from '@/lib/config';

import { useStoryboardBulkStreamUrl } from './SceneBlockNode.mediaThumbnail';
import {
  BORDER,
  SURFACE,
  SURFACE_ALT,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from './SceneModal.styles';
import type { ModalMediaItem, BlockMediaKind } from './SceneModal.types';

const VISUAL_MEDIA_TYPES = new Set<BlockMediaKind>(['image', 'video']);

const previewFrameStyle: React.CSSProperties = {
  width: '52px',
  height: '40px',
  borderRadius: '6px',
  background: SURFACE_ALT,
  border: `1px solid ${BORDER}`,
  overflow: 'hidden',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: TEXT_SECONDARY,
};

const previewButtonStyle: React.CSSProperties = {
  ...previewFrameStyle,
  padding: 0,
  cursor: 'zoom-in',
};

const previewImageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

const lightboxBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1300,
  background: 'rgba(0,0,0,0.86)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
};

const lightboxDialogStyle: React.CSSProperties = {
  position: 'relative',
  width: 'min(1040px, calc(100vw - 48px))',
  height: 'min(760px, calc(100vh - 48px))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const lightboxMediaStyle: React.CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  borderRadius: '8px',
  background: SURFACE,
};

const lightboxCloseButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: '12px',
  right: '12px',
  width: '32px',
  height: '32px',
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  background: 'rgba(13,13,20,0.82)',
  color: TEXT_PRIMARY,
  cursor: 'pointer',
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

interface MediaLightboxState {
  src: string;
  mediaType: 'image' | 'video';
  alt: string;
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selector = [
    'button:not([disabled])',
    'video[controls]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

function getMediaUrl(item: ModalMediaItem, mode: 'thumbnail' | 'full'): string {
  const previewPath = mode === 'thumbnail' && item.mediaType === 'video' ? 'thumbnail' : 'stream';
  return buildAuthenticatedUrl(`${config.apiBaseUrl}/assets/${item.fileId}/${previewPath}`);
}

function MediaPreviewPlaceholder({ label = 'Audio media preview' }: { label?: string }): React.ReactElement {
  return (
    <div style={previewFrameStyle} aria-label={label} data-testid="media-preview-placeholder">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path
          d="M7 5H4.5C3.7 5 3 5.7 3 6.5v3C3 10.3 3.7 11 4.5 11H7l4 3V2L7 5Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M13 6.5c.6.7.6 1.8 0 2.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function MediaPreviewThumbnail({
  item,
  onOpen,
}: {
  item: ModalMediaItem;
  onOpen: (lightbox: MediaLightboxState) => void;
}): React.ReactElement {
  const [previewFailed, setPreviewFailed] = useState(false);
  const fileId = item.mediaType === 'image' ? item.fileId : null;
  const bulkImage = useStoryboardBulkStreamUrl(fileId);
  const shouldFallbackToSingle = !bulkImage.url && (!bulkImage.isBulkManaged || bulkImage.error !== null);
  const { url: fallbackImageUrl } = useFileStreamUrl(shouldFallbackToSingle ? fileId : null);
  const bulkImageUrl = bulkImage.url;
  const imageUrl = bulkImageUrl ?? fallbackImageUrl;

  useEffect(() => {
    setPreviewFailed(false);
  }, [item.fileId, imageUrl]);

  if (!VISUAL_MEDIA_TYPES.has(item.mediaType)) {
    return <MediaPreviewPlaceholder />;
  }

  const previewUrl = item.mediaType === 'image' ? imageUrl : getMediaUrl(item, 'thumbnail');
  const fullUrl = item.mediaType === 'image' ? imageUrl : getMediaUrl(item, 'full');
  const lightboxMediaType: MediaLightboxState['mediaType'] = item.mediaType === 'video' ? 'video' : 'image';
  const alt = `${item.mediaType} preview for ${item.filename}`;

  if (!previewUrl || !fullUrl || previewFailed) {
    return <MediaPreviewPlaceholder label={`${item.mediaType} preview unavailable`} />;
  }

  return (
    <button
      type="button"
      style={previewButtonStyle}
      onClick={() => onOpen({ src: fullUrl, mediaType: lightboxMediaType, alt })}
      aria-label={`Open ${item.filename} preview`}
      data-testid="media-preview-button"
    >
      <img
        src={previewUrl}
        alt={alt}
        style={previewImageStyle}
        loading="lazy"
        crossOrigin="anonymous"
        data-testid="media-preview-image"
        onError={() => setPreviewFailed(true)}
      />
    </button>
  );
}

function MediaLightbox({
  lightbox,
  onClose,
}: {
  lightbox: MediaLightboxState;
  onClose: () => void;
}): React.ReactElement {
  const lightboxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    lightboxRef.current?.focus();
  }, []);

  const handleBackdropClick = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }

    const lightboxElement = lightboxRef.current;
    if (!lightboxElement) {
      return;
    }
    const focusableElements = getFocusableElements(lightboxElement);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (!firstElement || !lastElement) {
      event.preventDefault();
      lightboxElement.focus();
      return;
    }

    const activeElement = document.activeElement;
    const focusIsInside = activeElement instanceof Node && lightboxElement.contains(activeElement);
    if (activeElement === lightboxElement || !focusIsInside) {
      event.preventDefault();
      (event.shiftKey ? lastElement : firstElement).focus();
    } else if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }, [onClose]);

  return (
    <div
      ref={lightboxRef}
      style={lightboxBackdropStyle}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Media preview"
      tabIndex={-1}
      data-testid="media-lightbox"
    >
      <div style={lightboxDialogStyle}>
        <button
          type="button"
          style={lightboxCloseButtonStyle}
          onClick={onClose}
          aria-label="Close media preview"
          data-testid="media-lightbox-close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        {lightbox.mediaType === 'video' ? (
          <video src={lightbox.src} style={lightboxMediaStyle} controls data-testid="media-lightbox-video" />
        ) : (
          <img
            src={lightbox.src}
            alt={lightbox.alt}
            style={lightboxMediaStyle}
            data-testid="media-lightbox-image"
          />
        )}
      </div>
    </div>
  );
}

export function SceneModalMediaPreview({ item }: { item: ModalMediaItem }): React.ReactElement {
  const [lightbox, setLightbox] = useState<MediaLightboxState | null>(null);

  return (
    <>
      <MediaPreviewThumbnail item={item} onOpen={setLightbox} />
      {lightbox && <MediaLightbox lightbox={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}
