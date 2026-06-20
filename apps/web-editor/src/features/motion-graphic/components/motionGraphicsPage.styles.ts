/**
 * Styles for MotionGraphicsPage.
 *
 * Color values are mirrored from design-guide.md §2/§3 and defined as
 * per-file typed constants — the established project convention used in
 * GenerateWizardPage, FlowListPage, SettingsPage, and others. CSS custom
 * properties (var(--…)) are not used anywhere else in the codebase.
 *
 * The card grid + card chrome match FlowListPage (the §3 Dark Theme card
 * tokens shared with ProjectsPanel / ProjectCard) so the gallery reads the
 * same as the rest of the app.
 */
import type React from 'react';

// Design-guide tokens (§3 surface palette)
export const SURFACE = '#0D0D14';
export const SURFACE_BASE = '#13131F';
export const SURFACE_ELEVATED = '#1E1E2E';
export const TEXT_PRIMARY = '#F0F0FA';
export const TEXT_SECONDARY = '#8A8AA0';
export const BORDER = '#252535';
export const PRIMARY = '#7C3AED';
export const ERROR = '#EF4444';
export const SUCCESS = '#22C55E';
export const WARNING = '#F59E0B';

/** Per-status accent color for the status pill. */
export function statusColor(status: 'generating' | 'ready' | 'failed'): string {
  switch (status) {
    case 'ready':
      return SUCCESS;
    case 'failed':
      return ERROR;
    case 'generating':
    default:
      return WARNING;
  }
}

export const motionGraphicsPageStyles = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: '100vh',
    background: SURFACE,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    padding: '32px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  } as React.CSSProperties,
  heading: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
    lineHeight: '32px',
  } as React.CSSProperties,
  newButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    color: '#FFFFFF',
    background: PRIMARY,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    lineHeight: '20px',
  } as React.CSSProperties,
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    color: TEXT_SECONDARY,
    fontSize: 14,
  } as React.CSSProperties,
  error: {
    padding: 32,
    color: ERROR,
    fontSize: 14,
  } as React.CSSProperties,
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 80,
  } as React.CSSProperties,
  emptyTitle: {
    fontSize: 20,
    fontWeight: 600,
    color: TEXT_PRIMARY,
    margin: 0,
  } as React.CSSProperties,
  emptyHint: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    margin: 0,
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 20,
    marginTop: 24,
  } as React.CSSProperties,
};
