import React from 'react';

import type { HomeTab } from '../types';

// ── Design-guide tokens (§3 Dark Theme) ────────────────────────────────────
const SURFACE_ALT = '#16161F';
const PRIMARY_LIGHT = '#4C1D95';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';

interface HomeSidebarProps {
  activeTab: HomeTab;
  onTabChange: (tab: HomeTab) => void;
}

const NAV_ITEMS: Array<{ id: HomeTab; label: string }> = [
  { id: 'projects', label: 'Projects' },
  { id: 'storyboard', label: 'Storyboard' },
];

/**
 * Left sidebar for the Home page.
 * Renders the Projects / Storyboard tab navigation.
 * Active tab uses `primary-light` background per design-guide §3.
 */
export function HomeSidebar({ activeTab, onTabChange }: HomeSidebarProps): React.ReactElement {
  return (
    <nav
      aria-label="Home navigation"
      style={{
        width: 240,
        minHeight: '100vh',
        background: SURFACE_ALT,
        borderRight: `1px solid ${BORDER}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 0',
        fontFamily: 'Inter, sans-serif',
        flexShrink: 0,
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        style={{
          padding: '0 16px 24px',
          fontSize: 20,
          fontWeight: 600,
          color: TEXT_PRIMARY,
          lineHeight: '28px',
          borderBottom: `1px solid ${BORDER}`,
          marginBottom: 8,
        }}
      >
        ClipTale
      </div>

      <ul
        role="tablist"
        aria-label="Content tabs"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: '8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {NAV_ITEMS.map(({ id, label }) => {
          const isActive = activeTab === id;
          return (
            <li key={id} role="none">
              <button
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${id}`}
                id={`tab-${id}`}
                onClick={() => onTabChange(id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  fontFamily: 'Inter, sans-serif',
                  color: isActive ? TEXT_PRIMARY : TEXT_SECONDARY,
                  background: isActive ? PRIMARY_LIGHT : 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  lineHeight: '20px',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
