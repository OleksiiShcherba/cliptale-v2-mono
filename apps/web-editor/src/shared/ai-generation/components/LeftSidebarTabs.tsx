import React from 'react';

/** Valid left sidebar tab identifiers. */
export type LeftSidebarTab = 'assets' | 'ai-generate';

/** Props for the LeftSidebarTabs component. */
export interface LeftSidebarTabsProps {
  /** Currently active tab. */
  activeTab: LeftSidebarTab;
  /** Called when a tab button is pressed. */
  onTabChange: (tab: LeftSidebarTab) => void;
}

// Design-guide tokens
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const PRIMARY_LIGHT = '#4C1D95';

const TABS: { id: LeftSidebarTab; label: string }[] = [
  { id: 'assets', label: 'Assets' },
  { id: 'ai-generate', label: 'AI Generate' },
];

/**
 * Tab bar for the desktop left sidebar — switches between Asset Browser and AI Generation panel.
 * Matches the MobileInspectorTabs visual pattern.
 */
export function LeftSidebarTabs({
  activeTab,
  onTabChange,
}: LeftSidebarTabsProps): React.ReactElement {
  return (
    <nav style={styles.container} aria-label="Left sidebar tabs" role="tablist">
      {TABS.map(({ id, label }) => {
        const isActive = id === activeTab;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            style={isActive ? styles.tabActive : styles.tab}
            onClick={() => onTabChange(id)}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    height: '40px',
    flexShrink: 0,
    background: SURFACE_ALT,
    borderBottom: `1px solid ${BORDER}`,
    display: 'flex',
    alignItems: 'stretch',
  } as React.CSSProperties,

  tab: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: TEXT_SECONDARY,
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: 400,
    cursor: 'pointer',
    padding: '0 8px',
    letterSpacing: '0.02em',
  } as React.CSSProperties,

  tabActive: {
    flex: 1,
    background: PRIMARY_LIGHT,
    border: 'none',
    borderBottom: `2px solid ${PRIMARY}`,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    padding: '0 8px',
    letterSpacing: '0.02em',
  } as React.CSSProperties,
} as const;
