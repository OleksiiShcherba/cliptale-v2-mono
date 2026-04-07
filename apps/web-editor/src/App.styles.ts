import type React from 'react';

// Design-guide tokens
const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';

export const styles = {
  // ---------------------------------------------------------------------------
  // Desktop layout (≥768px) — two-column side-by-side with sidebars
  // ---------------------------------------------------------------------------

  shell: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    overflow: 'hidden',
    background: SURFACE,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  editorRow: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  } as React.CSSProperties,

  sidebar: {
    flexShrink: 0,
    background: SURFACE_ALT,
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,

  verticalDivider: {
    width: '1px',
    flexShrink: 0,
    background: BORDER,
  } as React.CSSProperties,

  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    background: SURFACE,
  } as React.CSSProperties,

  previewSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  previewPanelWrapper: {
    flex: 1,
    overflow: 'hidden',
  } as React.CSSProperties,

  rightSidebar: {
    width: '280px',
    flexShrink: 0,
    background: SURFACE_ALT,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  rightSidebarDivider: {
    width: '1px',
    flexShrink: 0,
    background: BORDER,
  } as React.CSSProperties,

  // ---------------------------------------------------------------------------
  // Tablet/mobile layout (<768px) — vertical stack, no sidebars
  // Matches Figma node 13:111 (Main Editor / Tablet)
  // ---------------------------------------------------------------------------

  /** Root shell — same column flex but fills viewport height. */
  mobileShell: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    overflow: 'hidden',
    background: SURFACE,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  /**
   * Mobile preview area — fixed-height region containing the video frame and
   * playback controls. Height uses a viewport-relative expression:
   * `56.25vw` for the 16:9 video frame (width × 9/16) + `40px` for the
   * playback controls row. This scales proportionally on any screen width,
   * so an iPhone 14 (390px wide) gets ~259px and a tablet (768px) gets ~472px.
   *
   * `flexShrink: 0` ensures the preview is never compressed by sibling flex
   * children, keeping the Remotion player permanently visible.
   */
  mobilePreviewArea: {
    flexShrink: 0,
    height: 'calc(56.25vw + 40px)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    background: SURFACE,
  } as React.CSSProperties,

  /**
   * Mobile inspector content panel — appears below the tab bar in normal
   * document flow when a tab is active. Uses `flex: 1` + `overflow: auto`
   * so it fills the remaining vertical space between the tab bar and the
   * timeline area without overlaying the preview.
   *
   * Unlike the prior absolute-overlay approach, this keeps the preview
   * permanently visible above the tab bar on all screen sizes.
   */
  mobileInspectorContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto',
    background: SURFACE_ALT,
    minHeight: 0,
  } as React.CSSProperties,

  /** Mobile timeline — fixed height below the inspector content (mirroring Figma 300px). */
  mobileTimeline: {
    flexShrink: 0,
    height: '300px',
    overflow: 'hidden',
  } as React.CSSProperties,
} as const;
