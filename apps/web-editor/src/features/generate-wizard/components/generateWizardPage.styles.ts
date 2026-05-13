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
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const PRIMARY_LIGHT = '#4C1D95';

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

  settingsPanel: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
    gap: '12px',
    marginTop: '16px',
    padding: '12px',
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
  } as React.CSSProperties,

  settingsGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    minWidth: 0,
  } as React.CSSProperties,

  settingsLabel: {
    color: TEXT_SECONDARY,
    fontSize: '12px',
    fontWeight: 500,
    lineHeight: '16px',
  } as React.CSSProperties,

  settingsSelect: {
    height: '32px',
    width: '100%',
    color: TEXT_PRIMARY,
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    padding: '0 8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    lineHeight: '16px',
  } as React.CSSProperties,

  settingsInput: {
    height: '32px',
    width: '100%',
    color: TEXT_PRIMARY,
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    padding: '0 8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    lineHeight: '16px',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  lengthPresetGroup: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    gap: '4px',
  } as React.CSSProperties,

  lengthPresetButton: {
    height: '28px',
    color: TEXT_SECONDARY,
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: '16px',
    padding: '0 4px',
  } as React.CSSProperties,

  segmentGroup: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '4px',
  } as React.CSSProperties,

  segmentButton: {
    height: '32px',
    color: TEXT_SECONDARY,
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: 500,
    lineHeight: '16px',
  } as React.CSSProperties,

  segmentButtonActive: {
    color: TEXT_PRIMARY,
    background: PRIMARY_LIGHT,
    border: `1px solid ${PRIMARY}`,
  } as React.CSSProperties,
} as const;
