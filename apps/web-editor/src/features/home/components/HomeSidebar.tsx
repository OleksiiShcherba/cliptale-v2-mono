import React from 'react';
import { useNavigate } from 'react-router-dom';

import type { HomeTab } from '../types';

// ── Design-guide tokens (§3 Dark Theme) ────────────────────────────────────
const SURFACE_ALT = '#16161F';
const PRIMARY_LIGHT = '#4C1D95';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';

interface HomeSidebarProps {
  /** Which Home tab is active. Omitted when the sidebar is shown on a standalone
   *  route (e.g. the Motion Graphics page) where no Home tab is selected. */
  activeTab?: HomeTab;
  /** In-page tab switch handler (Home page). When omitted, clicking a tab
   *  navigates to `/?tab=<id>` so the sidebar can be reused on other routes. */
  onTabChange?: (tab: HomeTab) => void;
  /** Highlights a non-tab nav destination as active (e.g. on `/motion-graphics`). */
  activeNav?: 'motion-graphics';
}

const NAV_ITEMS: Array<{ id: HomeTab; label: string }> = [
  { id: 'projects', label: 'Projects' },
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'generate-ai', label: 'Generate AI' },
];

/**
 * Left sidebar for the Home page.
 * Renders the Projects / Storyboard tab navigation.
 * Active tab uses `primary-light` background per design-guide §3.
 */
export function HomeSidebar({ activeTab, onTabChange, activeNav }: HomeSidebarProps): React.ReactElement {
  const navigate = useNavigate();
  // In-page switch when a handler is supplied (Home); otherwise route to Home
  // with the tab hint so the same sidebar works on standalone routes.
  const handleTab = (id: HomeTab): void => {
    if (onTabChange) onTabChange(id);
    else navigate(`/?tab=${id}`);
  };
  const mgActive = activeNav === 'motion-graphics';
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
                onClick={() => handleTab(id)}
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

        {/* AI Motion Graphics is a peer destination to Projects / Storyboard /
            Generate AI (spec §1, US-01). It lives on its own route rather than an
            in-page Home tab, so it navigates instead of switching `activeTab` —
            but it sits in the SAME primary nav list, at the same visual level. */}
        <li role="none">
          <button
            onClick={() => navigate('/motion-graphics')}
            aria-label="AI Motion Graphics"
            aria-current={mgActive ? 'page' : undefined}
            data-testid="nav-motion-graphics"
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              fontSize: 14,
              fontWeight: mgActive ? 600 : 400,
              fontFamily: 'Inter, sans-serif',
              color: mgActive ? TEXT_PRIMARY : TEXT_SECONDARY,
              background: mgActive ? PRIMARY_LIGHT : 'transparent',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              lineHeight: '20px',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            AI Motion Graphics
          </button>
        </li>
      </ul>

      {/* Settings lives on its own route, pinned to the bottom of the sidebar. */}
      <div style={{ marginTop: 'auto', padding: '8px 8px 0', borderTop: `1px solid ${BORDER}` }}>
        <button
          onClick={() => navigate('/settings')}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '8px 12px',
            fontSize: 14,
            fontWeight: 400,
            fontFamily: 'Inter, sans-serif',
            color: TEXT_SECONDARY,
            background: 'transparent',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            lineHeight: '20px',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          Settings
        </button>
      </div>
    </nav>
  );
}
