/**
 * Styles for GenerateWizardPage.
 *
 * Color values are mirrored from design-guide.md §2/§3 and defined as
 * per-file typed constants — the established project convention used in
 * ProjectCard.tsx, StoryboardCard.tsx, undoToast.styles.ts, and others.
 * CSS custom properties (var(--…)) are not used anywhere else in the codebase.
 */
import type React from 'react';

// Design-guide tokens (§3 surface palette)
const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';

export const wizardPageStyles = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    overflow: 'hidden',
    background: SURFACE,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  header: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'stretch',
    position: 'relative' as const,
  } as React.CSSProperties,

  stepperWrapper: {
    flex: 1,
  } as React.CSSProperties,

  bodyDesktop: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '8fr 4fr',
    overflow: 'hidden',
    gap: 0,
  } as React.CSSProperties,

  bodyMobile: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  leftColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto',
    background: SURFACE,
    borderRight: `1px solid ${BORDER}`,
    padding: '24px',
  } as React.CSSProperties,

  rightColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto',
    background: SURFACE_ALT,
    padding: '24px',
  } as React.CSSProperties,

  footer: {
    flexShrink: 0,
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '0 24px',
    background: SURFACE_ELEVATED,
    borderTop: `1px solid ${BORDER}`,
    gap: '12px',
  } as React.CSSProperties,
} as const;
