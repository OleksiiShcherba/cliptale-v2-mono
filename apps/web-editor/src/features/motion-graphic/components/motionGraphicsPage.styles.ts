/**
 * Styles for MotionGraphicsPage.
 *
 * Color values are mirrored from design-guide.md §2/§3 and defined as
 * per-file typed constants — the established project convention used in
 * GenerateWizardPage, SettingsPage, and others. CSS custom properties
 * (var(--…)) are not used anywhere else in the codebase.
 */
import type React from 'react';

// Design-guide tokens (§3 surface palette)
const SURFACE = '#0D0D14';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';

export const motionGraphicsPageStyles = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    overflow: 'hidden',
    background: SURFACE,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    padding: '32px',
  } as React.CSSProperties,
  heading: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
  } as React.CSSProperties,
  empty: {
    marginTop: '24px',
    color: TEXT_SECONDARY,
    fontSize: '14px',
  } as React.CSSProperties,
};
