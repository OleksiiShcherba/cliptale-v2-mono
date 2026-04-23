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
import { storyboardPageStyles as s } from './storyboardPageStyles';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface StoryboardTopBarProps {
  /** Human-readable autosave status label (e.g. "Saved just now"). */
  saveLabel: string;
  /** True when the history panel is open — controls button highlight. */
  isHistoryOpen: boolean;
  /** Called when the user clicks the History button. */
  onHistoryToggle: () => void;
}

// ── Design tokens ──────────────────────────────────────────────────────────────

const BORDER_COLOR = '#252535';

// ── Styles ─────────────────────────────────────────────────────────────────────

const historyButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${BORDER_COLOR}`,
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
}: StoryboardTopBarProps): React.ReactElement {
  return (
    <header style={s.topBar}>
      <div style={s.topBarLeft}>
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
