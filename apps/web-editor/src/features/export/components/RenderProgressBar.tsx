import React from 'react';

// Design-guide tokens
const PRIMARY = '#7C3AED';
const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';

export interface RenderProgressBarProps {
  /** Progress percentage, 0–100. */
  progressPct: number;
  /** Text label shown below the bar (e.g. "Processing… 65%"). */
  label?: string;
}

/**
 * Horizontal progress bar for render job progress.
 * Track uses surface-elevated; fill uses the primary brand color.
 */
export function RenderProgressBar({
  progressPct,
  label,
}: RenderProgressBarProps): React.ReactElement {
  const clampedPct = Math.max(0, Math.min(100, progressPct));

  return (
    <div style={styles.wrapper}>
      {/* Track */}
      <div
        style={styles.track}
        role="progressbar"
        aria-valuenow={clampedPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `Render progress: ${clampedPct}%`}
      >
        {/* Fill */}
        <div
          style={{
            ...styles.fill,
            width: `${clampedPct}%`,
          }}
        />
      </div>

      {label && (
        <p style={styles.label}>{label}</p>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  } as React.CSSProperties,

  track: {
    height: '8px',
    borderRadius: '9999px',
    background: SURFACE_ELEVATED,
    overflow: 'hidden',
    width: '100%',
  } as React.CSSProperties,

  fill: {
    height: '100%',
    borderRadius: '9999px',
    background: PRIMARY,
    transition: 'width 0.3s ease',
    minWidth: '0%',
  } as React.CSSProperties,

  label: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
  } as React.CSSProperties,

  pctText: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 500,
    color: TEXT_PRIMARY,
    lineHeight: '16px',
  } as React.CSSProperties,
} as const;
