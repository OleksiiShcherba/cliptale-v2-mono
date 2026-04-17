import React from 'react';

import { useDismissableFlag } from '@/features/generate-wizard/hooks/useDismissableFlag';

import {
  bodyTextStyle,
  cardStyle,
  closeButtonStyle,
  headerRowStyle,
  labelStyle,
} from './proTipCardStyles';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for the generate-wizard Step 1 pro tip. */
const PRO_TIP_KEY = 'proTip:generateStep1';

// ---------------------------------------------------------------------------
// Close icon
// ---------------------------------------------------------------------------

function CloseIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M11 3L3 11M3 3l8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ProTipCard
// ---------------------------------------------------------------------------

/**
 * Floating dismissible hint card, mounted bottom-right inside `GenerateWizardPage`.
 *
 * - Renders only when `localStorage['proTip:generateStep1'] !== 'dismissed'`.
 * - Close button writes the dismissed sentinel and unmounts the card.
 * - Styled with `SURFACE_ELEVATED` background and `primary/30` border.
 * - z-index above the gallery panel but below any modal (z-index 1000).
 * - SSR-safe: localStorage access is guarded in `useDismissableFlag`.
 *
 * §5: no logic in this file — localStorage handling lives in `useDismissableFlag`.
 */
export function ProTipCard(): React.ReactElement | null {
  const { dismissed, dismiss } = useDismissableFlag(PRO_TIP_KEY);

  if (dismissed) return null;

  return (
    <aside
      style={cardStyle}
      role="note"
      aria-label="Pro tip"
      data-testid="pro-tip-card"
    >
      {/* Header row: label + close */}
      <div style={headerRowStyle}>
        <span style={labelStyle}>Pro tip</span>
        <button
          type="button"
          style={closeButtonStyle}
          onClick={dismiss}
          aria-label="Dismiss pro tip"
          data-testid="pro-tip-close"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Body */}
      <p style={bodyTextStyle}>
        Use the <strong>@</strong> symbol inside the script to embed a media reference directly into
        your prompt, so the AI knows exactly which clip or audio file to include.
      </p>
    </aside>
  );
}
