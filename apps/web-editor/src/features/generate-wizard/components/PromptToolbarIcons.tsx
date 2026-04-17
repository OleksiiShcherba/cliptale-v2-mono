/**
 * SVG icon components used by PromptToolbar.
 * All icons are inline SVGs with no external dependency.
 */
import React from 'react';

export function AiEnhanceIcon(): React.ReactElement {
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
        d="M7 1l1.5 3.5L12 6 8.5 7.5 7 11 5.5 7.5 2 6l3.5-1.5L7 1z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SpinnerIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <circle
        cx="7"
        cy="7"
        r="5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="20 15"
        strokeLinecap="round"
      />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

export function VideoIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <path d="M9 5.5l3-2v7l-3-2v-3z" fill="currentColor" />
    </svg>
  );
}

export function ImageIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="2" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="4.5" cy="5.5" r="1" fill="currentColor" />
      <path d="M1 9l3-3 2 2 2-2.5 3 3.5H1z" fill="currentColor" />
    </svg>
  );
}

export function AudioIcon(): React.ReactElement {
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
        d="M5 3v8M3 4.5v5M7 2v10M9 4.5v5M11 3v8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
