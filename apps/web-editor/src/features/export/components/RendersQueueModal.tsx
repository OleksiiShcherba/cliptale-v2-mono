import React from 'react';

import { useListRenders } from '@/features/export/hooks/useListRenders';
import { getPresetLabel, formatDate, getStatusBadgeStyle, getStatusLabel } from '@/features/export/utils';
import type { RenderJob } from '@/features/export/types';
import { rendersQueueModalStyles as styles } from './rendersQueueModal.styles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RendersQueueModalProps {
  projectId: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// RenderJobCard — single job row
// ---------------------------------------------------------------------------

function RenderJobCard({ job }: { job: RenderJob }): React.ReactElement {
  return (
    <article
      style={styles.jobCard}
      aria-label={`Render job ${job.jobId}: ${getStatusLabel(job.status)}`}
    >
      {/* Header: preset label + date + status badge */}
      <div style={styles.jobCardHeader}>
        <span style={styles.jobPresetLabel}>{getPresetLabel(job.preset.key)}</span>
        <span style={styles.jobDate}>{formatDate(job.createdAt)}</span>
        <span
          style={getStatusBadgeStyle(job.status)}
          aria-label={`Status: ${getStatusLabel(job.status)}`}
        >
          {getStatusLabel(job.status)}
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={styles.progressTrack}
        role="progressbar"
        aria-valuenow={job.progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Render progress: ${job.progressPct}%`}
      >
        <div style={styles.progressFill(job.progressPct, job.status)} />
      </div>

      {/* Footer: percentage + download link or error */}
      <div style={styles.jobFooter}>
        <span style={styles.pctLabel}>{job.progressPct}%</span>
        {job.status === 'complete' && job.downloadUrl && (
          <a
            href={job.downloadUrl}
            download
            style={styles.downloadLink}
            aria-label={`Download render ${job.jobId}`}
          >
            Download
          </a>
        )}
        {job.status === 'failed' && job.errorMessage && (
          <p style={styles.errorMsg}>{job.errorMessage}</p>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// RendersQueueModal
// ---------------------------------------------------------------------------

/**
 * Modal that lists all render jobs for the current project, with live progress.
 *
 * Opens from the TopBar "Renders" button. Polls every 5 seconds while any
 * job is queued or processing, then stops.
 */
export function RendersQueueModal({ projectId, onClose }: RendersQueueModalProps): React.ReactElement {
  const { renders, isLoading, error } = useListRenders(projectId);
  const [isHoveringClose, setIsHoveringClose] = React.useState(false);

  return (
    <>
      {/* Backdrop */}
      <div
        style={styles.backdrop}
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Renders in progress"
        style={styles.modal}
      >
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.heading}>Renders in Progress</h2>
          <button
            type="button"
            style={isHoveringClose ? styles.closeButtonHover : styles.closeButton}
            onClick={onClose}
            onMouseEnter={() => setIsHoveringClose(true)}
            onMouseLeave={() => setIsHoveringClose(false)}
            aria-label="Close renders queue"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {isLoading && (
            <p style={styles.loadingState}>Loading renders…</p>
          )}

          {!isLoading && error && (
            <p style={styles.errorState} role="alert">
              {error.message}
            </p>
          )}

          {!isLoading && !error && renders.length === 0 && (
            <p style={styles.emptyState}>No render jobs found for this project.</p>
          )}

          {!isLoading && !error && renders.map((job) => (
            <RenderJobCard key={job.jobId} job={job} />
          ))}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button
            type="button"
            style={styles.closeFooterButton}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
