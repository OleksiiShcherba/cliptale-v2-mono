import React from 'react';

import { useVersionHistory } from '@/features/version-history/hooks/useVersionHistory';
import { RestoreModal } from '@/features/version-history/components/RestoreModal';
import { formatRelativeDate } from '@/shared/utils/formatRelativeDate';
import { getCurrentVersionId } from '@/store/project-store';
import type { VersionSummary } from '@/features/version-history/api';

// ---------------------------------------------------------------------------
// Design-guide tokens
// ---------------------------------------------------------------------------

const SURFACE_ALT = '#16161F';
const SURFACE_ELEVATED = '#1E1E2E';
const PRIMARY_LIGHT = '#4C1D95';
const PRIMARY = '#7C3AED';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const ERROR = '#EF4444';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VersionHistoryPanelProps {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// VersionEntryRow — a single row in the version list
// ---------------------------------------------------------------------------

interface VersionEntryRowProps {
  version: VersionSummary;
  isCurrent: boolean;
  onRestoreClick: (version: VersionSummary) => void;
}

function VersionEntryRow({
  version,
  isCurrent,
  onRestoreClick,
}: VersionEntryRowProps): React.ReactElement {
  const relativeTime = formatRelativeDate(new Date(version.createdAt));
  const absoluteTime = new Date(version.createdAt).toISOString();

  const rowStyle: React.CSSProperties = {
    ...styles.entryRow,
    background: isCurrent ? PRIMARY_LIGHT : SURFACE_ELEVATED,
  };

  return (
    <div style={rowStyle} data-testid="version-entry-row">
      {/* Snapshot thumbnail placeholder */}
      <div style={styles.thumbnail} aria-hidden="true" />

      {/* Label + timestamp + meta */}
      <div style={styles.entryMeta}>
        <div style={styles.entryLabelRow}>
          <span style={styles.versionLabel} title={absoluteTime}>
            v{version.versionId}
          </span>
          <span style={styles.timestamp} title={absoluteTime}>
            {relativeTime}
          </span>
          {isCurrent && (
            <span style={styles.currentBadge} aria-label="Current version">
              Current
            </span>
          )}
        </div>

        {version.durationFrames !== null && (
          <span style={styles.diffSummary}>
            {version.durationFrames} frames
          </span>
        )}
      </div>

      {/* Restore button — hidden for current version */}
      {!isCurrent && (
        <button
          type="button"
          style={styles.restoreButton}
          onClick={() => onRestoreClick(version)}
          aria-label={`Restore version ${version.versionId} saved ${relativeTime}`}
        >
          Restore
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VersionHistoryPanel
// ---------------------------------------------------------------------------

/**
 * 320px right-side panel listing the last 50 versions of the project.
 *
 * - Current version (matching `getCurrentVersionId()`) is highlighted with
 *   the `primary-light` background and no Restore button.
 * - Relative timestamps show on the entry; absolute ISO timestamp appears on
 *   hover via the `title` attribute.
 * - Clicking Restore opens `RestoreModal` for confirmation.
 * - On confirmed restore: calls `restoreToVersion`, updates project store,
 *   invalidates the version list query.
 */
export function VersionHistoryPanel({ onClose }: VersionHistoryPanelProps): React.ReactElement {
  const { versions, isLoading, isError, restoreToVersion, isRestoring } = useVersionHistory();
  const [pendingVersion, setPendingVersion] = React.useState<VersionSummary | null>(null);
  const currentVersionId = getCurrentVersionId();

  const handleRestoreClick = (version: VersionSummary): void => {
    setPendingVersion(version);
  };

  const handleConfirm = async (): Promise<void> => {
    if (pendingVersion === null) return;
    await restoreToVersion(pendingVersion.versionId);
    setPendingVersion(null);
  };

  const handleCancelModal = (): void => {
    setPendingVersion(null);
  };

  return (
    <>
      <aside style={styles.panel} aria-label="Version history">
        {/* Panel header */}
        <div style={styles.header}>
          <h2 style={styles.heading}>Version History</h2>
          <button
            type="button"
            style={styles.closeButton}
            onClick={onClose}
            aria-label="Close version history"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div style={styles.scrollArea}>
          {isLoading && (
            <p style={styles.statusText}>Loading versions\u2026</p>
          )}

          {isError && !isLoading && (
            <p style={{ ...styles.statusText, color: ERROR }}>
              Failed to load versions.
            </p>
          )}

          {!isLoading && !isError && versions.length === 0 && (
            <p style={styles.statusText}>No saved versions yet.</p>
          )}

          {!isLoading && !isError && versions.map((v) => (
            <VersionEntryRow
              key={v.versionId}
              version={v}
              isCurrent={v.versionId === currentVersionId}
              onRestoreClick={handleRestoreClick}
            />
          ))}
        </div>
      </aside>

      {/* Restore confirmation modal — portal-style, rendered next to panel */}
      {pendingVersion !== null && (
        <RestoreModal
          version={pendingVersion}
          isRestoring={isRestoring}
          onConfirm={() => void handleConfirm()}
          onCancel={handleCancelModal}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  panel: {
    width: '320px',
    flexShrink: 0,
    background: SURFACE_ALT,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    borderLeft: `1px solid ${BORDER}`,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  header: {
    height: '48px',
    flexShrink: 0,
    background: SURFACE_ELEVATED,
    borderBottom: `1px solid ${BORDER}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: '16px',
    paddingRight: '12px',
  } as React.CSSProperties,

  heading: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
    lineHeight: '24px',
  } as React.CSSProperties,

  closeButton: {
    background: 'transparent',
    border: 'none',
    color: TEXT_SECONDARY,
    fontSize: '20px',
    lineHeight: '20px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,

  scrollArea: {
    flex: 1,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,

  statusText: {
    margin: 0,
    padding: '16px',
    fontSize: '14px',
    color: TEXT_SECONDARY,
    textAlign: 'center' as const,
  } as React.CSSProperties,

  entryRow: {
    height: '72px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    borderBottom: `1px solid ${BORDER}`,
  } as React.CSSProperties,

  thumbnail: {
    width: '64px',
    height: '48px',
    flexShrink: 0,
    background: SURFACE_ALT,
    borderRadius: '4px',
  } as React.CSSProperties,

  entryMeta: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    overflow: 'hidden',
  } as React.CSSProperties,

  entryLabelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    overflow: 'hidden',
  } as React.CSSProperties,

  versionLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
    lineHeight: '20px',
    flexShrink: 0,
  } as React.CSSProperties,

  timestamp: {
    fontSize: '12px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
    flexShrink: 0,
    cursor: 'help',
  } as React.CSSProperties,

  currentBadge: {
    fontSize: '11px',
    fontWeight: 500,
    color: PRIMARY,
    lineHeight: '16px',
    flexShrink: 0,
  } as React.CSSProperties,

  diffSummary: {
    fontSize: '11px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  restoreButton: {
    flexShrink: 0,
    background: PRIMARY,
    border: 'none',
    borderRadius: '6px',
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    padding: '6px 12px',
    cursor: 'pointer',
    lineHeight: '16px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
} as const;
