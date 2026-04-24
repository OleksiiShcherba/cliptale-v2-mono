/**
 * StoryboardTopBar — extracted top-bar header for StoryboardPage.
 *
 * Extracted to keep StoryboardPage.tsx within the 300-line cap (§9.7).
 * Renders: logo, wizard stepper, autosave indicator, History button,
 * Settings icon, and Help icon.
 */

import React from 'react';

import { WizardStepper } from '@/features/generate-wizard/components/WizardStepper';

import {
  GearIcon,
  HelpIcon,
} from './storyboardIcons';
import { storyboardPageStyles as s, BORDER, TEXT_SECONDARY } from './storyboardPageStyles';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface StoryboardTopBarProps {
  /** Human-readable autosave status label (e.g. "Saved just now"). */
  saveLabel: string;
  /** True when the history panel is open — controls button highlight. */
  isHistoryOpen: boolean;
  /** Called when the user clicks the History button. */
  onHistoryToggle: () => void;
  /** Called when the user clicks the Home button — navigates back to the home hub. */
  onNavigateHome: () => void;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const homeButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  borderRadius: '6px',
  color: TEXT_SECONDARY,
  fontSize: '12px',
  fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
  padding: '4px 10px',
  cursor: 'pointer',
  lineHeight: '16px',
  flexShrink: 0,
};

const historyButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  borderRadius: '4px',
  color: '#F0F0FA',
  fontSize: '12px',
  fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
  padding: '0 8px',
  height: '28px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
};

const historyButtonActiveStyle: React.CSSProperties = {
  ...historyButtonStyle,
  background: '#4C1D95',
  borderColor: '#7C3AED',
};

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * Top bar for the storyboard editor, extracted for line-cap compliance.
 */
export function StoryboardTopBar({
  saveLabel,
  isHistoryOpen,
  onHistoryToggle,
  onNavigateHome,
}: StoryboardTopBarProps): React.ReactElement {
  return (
    <header style={s.topBar}>
      <div style={s.topBarLeft}>
        <button
          type="button"
          style={homeButtonStyle}
          onClick={onNavigateHome}
          aria-label="Go to home"
          data-testid="home-button"
        >
          {/* House icon */}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M1 5.5L6 1L11 5.5V11H7.5V8H4.5V11H1V5.5Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
          Home
        </button>
        <span style={s.logoText}>ClipTale</span>
      </div>
      <div style={s.topBarCenter}>
        <WizardStepper currentStep={2} />
      </div>
      <div style={s.topBarRight}>
        <span
          style={s.autosaveIndicator}
          aria-label="Autosave status"
          data-testid="autosave-indicator"
        >
          {saveLabel}
        </span>
        <button
          type="button"
          style={isHistoryOpen ? historyButtonActiveStyle : historyButtonStyle}
          aria-label="Toggle history panel"
          aria-pressed={isHistoryOpen}
          title="History"
          onClick={onHistoryToggle}
          data-testid="history-toggle-button"
        >
          History
        </button>
        <button
          type="button"
          style={s.iconButton}
          aria-label="Settings"
          title="Settings"
          data-testid="settings-icon-button"
        >
          <GearIcon />
        </button>
        <button
          type="button"
          style={s.iconButton}
          aria-label="Help"
          title="Help"
          data-testid="help-icon-button"
        >
          <HelpIcon />
        </button>
      </div>
    </header>
  );
}
