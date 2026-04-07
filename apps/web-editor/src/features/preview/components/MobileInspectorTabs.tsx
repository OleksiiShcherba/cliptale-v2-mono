import React from 'react';

// Design-guide tokens
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const PRIMARY_LIGHT = '#4C1D95';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The three selectable tabs in the mobile inspector panel. */
export type MobileTab = 'assets' | 'captions' | 'inspector';

/** Props for {@link MobileInspectorTabs}. */
export interface MobileInspectorTabsProps {
  /** Currently active tab. */
  activeTab: MobileTab;
  /** Called when a tab button is pressed. */
  onTabChange: (tab: MobileTab) => void;
}

// ---------------------------------------------------------------------------
// MobileInspectorTabs
// ---------------------------------------------------------------------------

/**
 * Collapsed inspector panel for the tablet/mobile layout.
 * Renders three tab buttons: Assets, Captions, Inspector.
 * Matches the "INSPECTOR PANEL (COLLAPSED TABS)" region in Figma node 13:120.
 */
export function MobileInspectorTabs({
  activeTab,
  onTabChange,
}: MobileInspectorTabsProps): React.ReactElement {
  const tabs: { id: MobileTab; label: string }[] = [
    { id: 'assets', label: 'Assets' },
    { id: 'captions', label: 'Captions' },
    { id: 'inspector', label: 'Inspector' },
  ];

  return (
    <nav style={styles.container} aria-label="Mobile inspector tabs" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            style={isActive ? styles.tabActive : styles.tab}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
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
    height: '48px',
    flexShrink: 0,
    background: SURFACE_ALT,
    borderTop: `1px solid ${BORDER}`,
    borderBottom: `1px solid ${BORDER}`,
    display: 'flex',
    alignItems: 'stretch',
  } as React.CSSProperties,

  tab: {
    flex: 1,
    background: 'transparent',
    borderTop: 'none',
    borderBottom: 'none',
    borderLeft: 'none',
    borderRight: `1px solid ${BORDER}`,
    color: TEXT_SECONDARY,
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    padding: '0 8px',
    letterSpacing: '0.02em',
  } as React.CSSProperties,

  tabActive: {
    flex: 1,
    background: PRIMARY_LIGHT,
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: `1px solid ${BORDER}`,
    borderBottom: `2px solid ${PRIMARY}`,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '0 8px',
    letterSpacing: '0.02em',
  } as React.CSSProperties,
} as const;
