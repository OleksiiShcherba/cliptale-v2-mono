import React, { useCallback, useEffect, useRef } from 'react';

import type { EnhanceStatus, PromptDoc } from '@/features/generate-wizard/types';

import { renderPromptDocText } from './renderPromptDocText';
import {
  acceptButtonStyle,
  backdropStyle,
  closeButtonStyle,
  dialogStyle,
  discardButtonStyle,
  errorBodyStyle,
  errorTextStyle,
  footerStyle,
  headerStyle,
  panelBodyStyle,
  panelDividerStyle,
  panelLabelStyle,
  panelStyle,
  panelsWrapperStyle,
  titleStyle,
} from './enhancePreviewModalStyles';

// ---------------------------------------------------------------------------
// Close icon
// ---------------------------------------------------------------------------

function CloseIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 4L4 12M4 4l8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EnhancePreviewModalProps {
  /** When false the modal is not mounted. */
  open: boolean;
  /** The user's original PromptDoc before enhancement. */
  original: PromptDoc;
  /** The LLM-proposed PromptDoc (null when status is not 'done'). */
  proposed: PromptDoc | null;
  /** Current enhance lifecycle state. */
  status: EnhanceStatus;
  /** Error message — populated when status === 'failed'. */
  error: string | null;
  /** Called with the proposed doc when the user accepts. */
  onAccept: (proposed: PromptDoc) => void;
  /** Called when the user discards, presses Esc, or clicks the backdrop. */
  onDiscard: () => void;
}

// ---------------------------------------------------------------------------
// EnhancePreviewModal
// ---------------------------------------------------------------------------

/**
 * Modal that shows the AI-enhanced prompt as a Before / After diff.
 *
 * - Does not mount when `open === false`.
 * - role="dialog", aria-modal="true", aria-labelledby tied to the header.
 * - Before / After panels use SURFACE_ELEVATED background separated by a BORDER divider.
 * - Accept uses primary CTA styling; Discard uses secondary styling.
 * - Esc key and backdrop click both route to `onDiscard`.
 * - When `status === 'failed'`, only the error message and a Close button are rendered.
 * - §14: no imports from `features/ai-generation/`.
 * - §5: no business logic in this file — all helpers live in `.ts` siblings.
 */
export function EnhancePreviewModal({
  open,
  original,
  proposed,
  status,
  error,
  onAccept,
  onDiscard,
}: EnhancePreviewModalProps): React.ReactElement | null {
  if (!open) return null;

  return (
    <EnhancePreviewModalInner
      original={original}
      proposed={proposed}
      status={status}
      error={error}
      onAccept={onAccept}
      onDiscard={onDiscard}
    />
  );
}

// ---------------------------------------------------------------------------
// Inner component — only mounted when open === true
// ---------------------------------------------------------------------------

interface InnerProps {
  original: PromptDoc;
  proposed: PromptDoc | null;
  status: EnhanceStatus;
  error: string | null;
  onAccept: (proposed: PromptDoc) => void;
  onDiscard: () => void;
}

function EnhancePreviewModalInner({
  original,
  proposed,
  status,
  error,
  onAccept,
  onDiscard,
}: InnerProps): React.ReactElement {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const headerId = 'enhance-preview-modal-title';

  const isFailed = status === 'failed';

  // Move focus into the dialog when it mounts so Esc is captured.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // ── Keyboard handler ─────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDiscard();
      }
    },
    [onDiscard],
  );

  // ── Backdrop click — only fires when target IS the backdrop ──────────────

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onDiscard();
      }
    },
    [onDiscard],
  );

  // ── Accept handler ───────────────────────────────────────────────────────

  const handleAccept = useCallback(() => {
    if (proposed !== null) {
      onAccept(proposed);
    }
  }, [onAccept, proposed]);

  // ── Content ──────────────────────────────────────────────────────────────

  const originalText = renderPromptDocText(original);
  const proposedText = proposed !== null ? renderPromptDocText(proposed) : '';

  return (
    <div
      style={backdropStyle}
      onClick={handleBackdropClick}
      data-testid="enhance-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headerId}
        style={dialogStyle}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        data-testid="enhance-dialog"
      >
        {/* Header */}
        <div style={headerStyle}>
          <h2 id={headerId} style={titleStyle}>
            AI Enhanced Prompt
          </h2>
          <button
            type="button"
            style={closeButtonStyle}
            onClick={onDiscard}
            aria-label="Discard enhancement"
            data-testid="enhance-close-button"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body — diff panels or error state */}
        {isFailed ? (
          <div style={errorBodyStyle} role="alert" data-testid="enhance-error">
            <p style={errorTextStyle}>
              {error ?? 'Enhancement failed. Please try again.'}
            </p>
          </div>
        ) : (
          <div style={panelsWrapperStyle} data-testid="enhance-panels">
            {/* Before panel */}
            <div style={panelStyle}>
              <div style={panelLabelStyle}>Before</div>
              <div
                style={panelBodyStyle}
                data-testid="enhance-before-text"
              >
                {originalText}
              </div>
            </div>

            {/* Divider */}
            <div style={panelDividerStyle} aria-hidden="true" />

            {/* After panel */}
            <div style={panelStyle}>
              <div style={panelLabelStyle}>After</div>
              <div
                style={panelBodyStyle}
                data-testid="enhance-after-text"
              >
                {proposedText}
              </div>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div style={footerStyle}>
          <button
            type="button"
            style={discardButtonStyle}
            onClick={onDiscard}
            data-testid="enhance-discard-button"
          >
            {isFailed ? 'Close' : 'Discard'}
          </button>

          {!isFailed && (
            <button
              type="button"
              style={acceptButtonStyle}
              onClick={handleAccept}
              data-testid="enhance-accept-button"
            >
              Accept
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
