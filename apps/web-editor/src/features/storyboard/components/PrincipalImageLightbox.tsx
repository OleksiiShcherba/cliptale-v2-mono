import React, { useCallback, useEffect, useRef } from 'react';

import * as s from './PrincipalImageLightbox.styles';

export interface PrincipalImageLightboxState {
  src: string;
  alt: string;
}

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

export function PrincipalImageLightbox({
  lightbox,
  onClose,
}: {
  lightbox: PrincipalImageLightboxState;
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
    if (event.key !== 'Tab') return;

    const lightboxElement = lightboxRef.current;
    if (!lightboxElement) return;
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
      style={s.lightboxBackdropStyle}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      tabIndex={-1}
      data-testid="principal-image-lightbox"
    >
      <div style={s.lightboxDialogStyle}>
        <button
          type="button"
          style={s.lightboxCloseButtonStyle}
          onClick={onClose}
          aria-label="Close image preview"
          data-testid="principal-image-lightbox-close"
        >
          <CloseIcon />
        </button>
        <img
          src={lightbox.src}
          alt={lightbox.alt}
          style={s.lightboxImageStyle}
          data-testid="principal-image-lightbox-img"
        />
      </div>
    </div>
  );
}
