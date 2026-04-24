/**
 * Inline SVG icon components used in StoryboardPage.
 *
 * Extracted to keep StoryboardPage.tsx under the 300-line limit.
 * No external icon library — all icons are inline SVG.
 */

import React from 'react';

export function GearIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.2 5.6c.1.3.2.6.2.9l1.2 1-.6 1-1.4-.4c-.4.4-.9.7-1.4.9L11 10.5l-1 .3-.8-1.2c-.4 0-.8 0-1.2-.1L7.2 10.8 6.4 10l.3-1.4C6.4 8.2 6 7.7 5.9 7.2L4.5 7 4 6l.8-1.2c-.1-.4-.1-.8 0-1.2L3.6 2.4l.6-1L5.6 1.8C6 1.4 6.5 1.1 7 .9L7.2.5l1-.3.8 1.2c.4 0 .8 0 1.2.1l.8-1.2.8.6-.3 1.4c.3.4.6.9.8 1.4Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HelpIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M6 6c0-1.1.9-2 2-2s2 .9 2 2c0 1-.6 1.6-1.3 2-.4.2-.7.6-.7 1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="11.5" r=".75" fill="currentColor" />
    </svg>
  );
}

export function StoryboardIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <rect x="1.5" y="2.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9.5" y="2.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.5" y="9.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9.5" y="9.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function LibraryIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 3h4v10H3zM9 3h4v10H9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function EffectsIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M8 1.5l1.5 4h4l-3.2 2.4 1.2 3.8L8 9.2l-3.5 2.5 1.2-3.8L2.5 5.5h4L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
