import type React from 'react';

import { RENDER_PRESET_OPTIONS } from '@/features/export/types';
import type { RenderJob } from '@/features/export/types';

// Design tokens used by the status badge — kept here so the helper is
// self-contained and does not import from a `components/` file (§4 dep rule).
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const SUCCESS = '#10B981';
const ERROR = '#EF4444';
const SURFACE_ALT = '#16161F';

const STATUS_BADGE_BASE: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  background: SURFACE_ALT,
  borderRadius: '4px',
  padding: '2px 6px',
  lineHeight: '16px',
  flexShrink: 0,
};

/** Returns a human-readable label for a preset key. */
export function getPresetLabel(key: string): string {
  const preset = RENDER_PRESET_OPTIONS.find((p) => p.key === key);
  return preset ? `${preset.label} · ${preset.resolution} · ${preset.format.toUpperCase()}` : key;
}

/** Formats an ISO date string to a short readable form. */
export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Returns the inline style for the status badge based on job status. */
export function getStatusBadgeStyle(status: RenderJob['status']): React.CSSProperties {
  const colorMap: Record<RenderJob['status'], string> = {
    queued: TEXT_SECONDARY,
    processing: PRIMARY,
    complete: SUCCESS,
    failed: ERROR,
  };
  return { ...STATUS_BADGE_BASE, color: colorMap[status] };
}

/** Returns the human-readable status label. */
export function getStatusLabel(status: RenderJob['status']): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'processing':
      return 'Processing';
    case 'complete':
      return 'Complete';
    case 'failed':
      return 'Failed';
  }
}
