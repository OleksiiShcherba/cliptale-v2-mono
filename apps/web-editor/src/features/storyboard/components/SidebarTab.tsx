/**
 * SidebarTab — icon tab button for the storyboard left sidebar.
 *
 * Renders an icon button that can be active or inactive. Active state
 * uses PRIMARY_LIGHT background and PRIMARY colour; inactive uses transparent
 * background and TEXT_SECONDARY colour.
 */

import React from 'react';

import type { StoryboardSidebarTab } from '../types';
import { storyboardPageStyles as s } from './storyboardPageStyles';

// ── Props ──────────────────────────────────────────────────────────────────────

interface SidebarTabProps {
  tab: StoryboardSidebarTab;
  activeTab: StoryboardSidebarTab;
  onSelect: (tab: StoryboardSidebarTab) => void;
  label: string;
  icon: React.ReactNode;
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * Single icon button in the storyboard left sidebar.
 * Applies active / inactive styles based on `tab === activeTab`.
 */
export function SidebarTab({
  tab,
  activeTab,
  onSelect,
  label,
  icon,
}: SidebarTabProps): React.ReactElement {
  const isActive = tab === activeTab;
  return (
    <button
      type="button"
      style={isActive ? s.sidebarTabActive : s.sidebarTabInactive}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      data-testid={`sidebar-tab-${tab}`}
      onClick={() => onSelect(tab)}
    >
      {icon}
    </button>
  );
}
