import React from 'react';

import { formatRelativeDate } from '@/shared/utils/formatRelativeDate';
import type { VersionSummary } from '@/features/version-history/api';

// ---------------------------------------------------------------------------
// Design-guide tokens
// ---------------------------------------------------------------------------

const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const ERROR = '#EF4444';
const SURFACE = '#0D0D14';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RestoreModalProps {
  version: VersionSummary;
  isRestoring: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// RestoreModal
// ---------------------------------------------------------------------------

/**
 * Confirmation modal shown before restoring a prior version.
 *
 * Warns the user that restoring will replace their current version.
 * Closes on overlay click or Cancel; confirms on Restore.
 */
export function RestoreModal({
  version,
  isRestoring,
  onConfirm,
  onCancel,
}: RestoreModalProps): React.ReactElement {
  const relativeTime = formatRelativeDate(new Date(version.createdAt));
  const absoluteTime = new Date(version.createdAt).toISOString();

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const restoreButtonStyle: React.CSSProperties = {
    ...styles.restoreButton,
    ...(isRestoring ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
  };

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-modal-title"
      aria-describedby="restore-modal-desc"
      onClick={handleOverlayClick}
    >
      <div style={styles.modal}>
        <h2 id="restore-modal-title" style={styles.title}>
          Restore Version
        </h2>

        <p id="restore-modal-desc" style={styles.description}>
          This will replace your current version with the version saved{' '}
          <span title={absoluteTime} style={styles.timestamp}>
            {relativeTime}
          </span>
          . Any unsaved changes will be lost.
        </p>

        <p style={styles.versionInfo}>
          Version <strong style={styles.versionId}>#{version.versionId}</strong>
        </p>

        <div style={styles.actions}>
          <button
            type="button"
            style={styles.cancelButton}
            onClick={onCancel}
            disabled={isRestoring}
            aria-label="Cancel restore"
          >
            Cancel
          </button>

          <button
            type="button"
            style={restoreButtonStyle}
            onClick={onConfirm}
            disabled={isRestoring}
            aria-label={`Restore version ${version.versionId}`}
          >
            {isRestoring ? 'Restoring\u2026' : 'Restore'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,

  modal: {
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    padding: '24px',
    width: '400px',
    maxWidth: '90vw',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
    lineHeight: '28px',
  } as React.CSSProperties,

  description: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '20px',
  } as React.CSSProperties,

  timestamp: {
    color: TEXT_PRIMARY,
    textDecoration: 'underline dotted',
    cursor: 'help',
  } as React.CSSProperties,

  versionInfo: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: '4px',
    padding: '8px 12px',
  } as React.CSSProperties,

  versionId: {
    color: TEXT_PRIMARY,
    fontWeight: 600,
  } as React.CSSProperties,

  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  } as React.CSSProperties,

  cancelButton: {
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    padding: '8px 16px',
    cursor: 'pointer',
    lineHeight: '20px',
  } as React.CSSProperties,

  restoreButton: {
    background: ERROR,
    border: 'none',
    borderRadius: '6px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    padding: '8px 16px',
    cursor: 'pointer',
    lineHeight: '20px',
  } as React.CSSProperties,
} as const;
