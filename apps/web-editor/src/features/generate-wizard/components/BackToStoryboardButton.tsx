import React, { useState } from 'react';

// Design-guide tokens (§3 Dark Theme)
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';

/** Props for BackToStoryboardButton. */
export interface BackToStoryboardButtonProps {
  onClick: () => void;
}

/**
 * Left-anchored header button that navigates back to the Storyboard tab.
 *
 * Must be placed inside a `position: relative` container so the `position:
 * absolute` placement stays within the header bounds and does not displace
 * the WizardStepper (which must remain visually centered).
 */
export function BackToStoryboardButton({ onClick }: BackToStoryboardButtonProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  const buttonStyle: React.CSSProperties = {
    position: 'absolute',
    left: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'transparent',
    border: 'none',
    padding: '8px 12px',
    cursor: 'pointer',
    borderRadius: '8px',
    color: isHovered ? TEXT_PRIMARY : TEXT_SECONDARY,
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: 500,
    lineHeight: '16px',
    transition: 'color 0.15s',
  };

  return (
    <button
      type="button"
      style={buttonStyle}
      aria-label="Back to Storyboard"
      data-testid="back-to-storyboard"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <ChevronLeftIcon />
      Back to Storyboard
    </button>
  );
}

/** Inline chevron-left SVG — no external icon dependency. */
function ChevronLeftIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M10 12L6 8L10 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
