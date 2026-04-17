/**
 * ProTipCard — 3 test cases.
 *
 * 1. Renders when the localStorage flag is absent.
 * 2. Does not render when the flag is already set to 'dismissed'.
 * 3. Close button click writes the sentinel to localStorage and unmounts the card.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ProTipCard } from './ProTipCard';

// ---------------------------------------------------------------------------
// The localStorage key used by ProTipCard (keep in sync with the component).
// ---------------------------------------------------------------------------

const PRO_TIP_KEY = 'proTip:generateStep1';

// ---------------------------------------------------------------------------
// Setup: clear localStorage before and after each test.
// ---------------------------------------------------------------------------

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProTipCard', () => {
  // -------------------------------------------------------------------------
  // Case 1 — renders when flag is absent
  // -------------------------------------------------------------------------

  it('renders the card when the localStorage flag is absent', () => {
    render(<ProTipCard />);

    expect(screen.getByTestId('pro-tip-card')).toBeDefined();
    expect(screen.getByTestId('pro-tip-close')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Case 2 — does not render when flag is already 'dismissed'
  // -------------------------------------------------------------------------

  it('does not render when localStorage already contains the dismissed sentinel', () => {
    window.localStorage.setItem(PRO_TIP_KEY, 'dismissed');

    render(<ProTipCard />);

    expect(screen.queryByTestId('pro-tip-card')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 3 — close button writes flag and unmounts the card
  // -------------------------------------------------------------------------

  it('writes the dismissed sentinel to localStorage and unmounts when close is clicked', () => {
    render(<ProTipCard />);

    // Card is visible before dismissal.
    expect(screen.getByTestId('pro-tip-card')).toBeDefined();

    fireEvent.click(screen.getByTestId('pro-tip-close'));

    // Card is gone after dismissal.
    expect(screen.queryByTestId('pro-tip-card')).toBeNull();

    // The sentinel was written to localStorage.
    expect(window.localStorage.getItem(PRO_TIP_KEY)).toBe('dismissed');
  });
});
