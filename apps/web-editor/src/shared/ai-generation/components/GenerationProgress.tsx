import React from 'react';

import type { AiGenerationJob } from '@/shared/ai-generation/types';

import { aiGenerationPanelStyles as s, PRIMARY, SURFACE_ELEVATED, TEXT_SECONDARY } from './aiGenerationPanelStyles';

/** Props for the GenerationProgress component. */
export interface GenerationProgressProps {
  /** Current job state — must be `queued` or `processing`. */
  job: AiGenerationJob;
}

/** Status label displayed beneath the progress bar. */
function statusLabel(status: string, progress: number): string {
  if (status === 'queued') return 'Queued — waiting for worker...';
  return `Processing... ${progress}%`;
}

/**
 * Displays a progress bar and status text for an in-progress AI generation job.
 * Follows the RenderProgressBar pattern from the export feature.
 */
export function GenerationProgress({ job }: GenerationProgressProps): React.ReactElement {
  const pct = Math.max(0, Math.min(100, job.progress));

  return (
    <div style={s.progressWrapper}>
      {/* Progress bar */}
      <div style={{ width: '100%' }}>
        <div
          style={trackStyle}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Generation progress: ${pct}%`}
        >
          <div style={{ ...fillStyle, width: `${pct}%` }} />
        </div>
      </div>

      <p style={s.progressSpinner}>{statusLabel(job.status, pct)}</p>
    </div>
  );
}

// ── Local bar styles (matches RenderProgressBar) ──────────────────────────

const trackStyle: React.CSSProperties = {
  height: '8px',
  borderRadius: '9999px',
  background: SURFACE_ELEVATED,
  overflow: 'hidden',
  width: '100%',
};

const fillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: '9999px',
  background: PRIMARY,
  transition: 'width 0.3s ease',
  minWidth: '0%',
};
