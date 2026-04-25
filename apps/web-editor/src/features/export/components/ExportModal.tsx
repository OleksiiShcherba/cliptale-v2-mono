import React from 'react';

import { useExportRender } from '@/features/export/hooks/useExportRender';
import { RenderProgressBar } from './RenderProgressBar';
import { RENDER_PRESET_OPTIONS } from '@/features/export/types';
import type { RenderPresetKey } from '@/features/export/types';
import { exportModalStyles as styles, TEXT_PRIMARY, TEXT_SECONDARY } from './ExportModal.styles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExportModalProps {
  /** Version ID to render — must be the current locked version. */
  versionId: number;
  projectId: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// ExportModal
// ---------------------------------------------------------------------------

/**
 * Export modal — 560×700px centered over the editor.
 *
 * Phases:
 * 1. Preset selection — 6 preset cards in a 3×2 grid.
 * 2. Rendering in progress — progress bar + percentage.
 * 3. Complete — download button + close.
 * 4. Failed — error message + retry button.
 */
export function ExportModal({ versionId, projectId, onClose }: ExportModalProps): React.ReactElement {
  const { startRender, isSubmitting, activeJob, error, reset } = useExportRender(versionId, projectId);
  const [selectedPreset, setSelectedPreset] = React.useState<RenderPresetKey | null>(null);
  const [isHoveringClose, setIsHoveringClose] = React.useState(false);

  const isRendering = activeJob?.status === 'queued' || activeJob?.status === 'processing';
  const isComplete = activeJob?.status === 'complete';
  const isFailed = activeJob?.status === 'failed';

  const handleStartExport = async (): Promise<void> => {
    if (!selectedPreset) return;
    await startRender(selectedPreset);
  };

  const handleRetry = (): void => {
    reset();
    setSelectedPreset(null);
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={styles.backdrop}
        onClick={handleClose}
        role="presentation"
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export video"
        style={styles.modal}
      >
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.heading}>Export Video</h2>
          <button
            type="button"
            style={
              isHoveringClose
                ? { ...styles.closeButton, color: TEXT_PRIMARY }
                : styles.closeButton
            }
            onClick={handleClose}
            onMouseEnter={() => setIsHoveringClose(true)}
            onMouseLeave={() => setIsHoveringClose(false)}
            aria-label="Close export modal"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {/* ── Preset selection ─────────────────────────────────────────── */}
          {!isRendering && !isComplete && !isFailed && (
            <>
              <section aria-labelledby="preset-section-label">
                <p style={styles.sectionLabel} id="preset-section-label">
                  RENDER PRESET
                </p>
                <div style={styles.presetGrid} role="radiogroup" aria-label="Select render preset">
                  {RENDER_PRESET_OPTIONS.map((preset) => {
                    const isSelected = selectedPreset === preset.key;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        style={isSelected ? styles.presetCardSelected : styles.presetCard}
                        onClick={() => setSelectedPreset(preset.key)}
                        aria-label={`${preset.label} — ${preset.resolution}, ${preset.fps}fps`}
                      >
                        <span style={styles.presetCardLabel}>{preset.label}</span>
                        <span style={styles.presetCardMeta}>
                          {preset.resolution} · {preset.fps}fps · {preset.format.toUpperCase()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {error && (
                <p style={styles.errorText} role="alert">
                  {error.message}
                </p>
              )}

              <button
                type="button"
                style={
                  selectedPreset && !isSubmitting
                    ? styles.startButton
                    : styles.startButtonDisabled
                }
                onClick={() => void handleStartExport()}
                disabled={!selectedPreset || isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? 'Starting\u2026' : 'Start Export'}
              </button>
            </>
          )}

          {/* ── Rendering in progress ────────────────────────────────────── */}
          {isRendering && (
            <section aria-live="polite" aria-label="Render progress">
              <p style={styles.sectionLabel}>RENDER QUEUE</p>
              <div style={styles.statusRow}>
                <span
                  style={
                    activeJob?.status === 'queued'
                      ? styles.statusBadgeQueued
                      : styles.statusBadgeProcessing
                  }
                >
                  {activeJob?.status === 'queued' ? 'Queued' : 'Processing'}
                </span>
                <span style={styles.pctText}>{activeJob?.progressPct ?? 0}%</span>
              </div>

              <RenderProgressBar
                progressPct={activeJob?.progressPct ?? 0}
                label={`Rendering\u2026 ${activeJob?.progressPct ?? 0}%`}
              />

              <p style={styles.statusHint}>
                Your video is being rendered. This may take a few minutes.
              </p>

              <button
                type="button"
                style={styles.startButtonDisabled}
                disabled
                aria-disabled="true"
              >
                Download
              </button>
            </section>
          )}

          {/* ── Complete ────────────────────────────────────────────────── */}
          {isComplete && (
            <section aria-live="polite" aria-label="Export complete">
              <p style={styles.sectionLabel}>EXPORT COMPLETE</p>
              <RenderProgressBar progressPct={100} />

              <p style={styles.successText}>Your video is ready to download.</p>

              <a
                href={activeJob?.downloadUrl}
                download
                style={styles.downloadButton}
                aria-label="Download rendered video"
              >
                Download Video
              </a>
            </section>
          )}

          {/* ── Failed ──────────────────────────────────────────────────── */}
          {isFailed && (
            <section aria-live="assertive" aria-label="Export failed">
              <p style={styles.sectionLabel}>EXPORT FAILED</p>
              <p style={styles.errorText} role="alert">
                {activeJob?.errorMessage ?? 'An error occurred during rendering.'}
              </p>
              <button
                type="button"
                style={styles.startButton}
                onClick={handleRetry}
              >
                Try Again
              </button>
            </section>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button
            type="button"
            style={styles.cancelButton}
            onClick={handleClose}
          >
            {isComplete ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </>
  );
}
