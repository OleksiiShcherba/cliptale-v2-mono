/**
 * Placeholder page for /generate/road-map (Step 2 — Video Road Map).
 *
 * Rendered while the full Step 2 implementation is pending.
 * Provides a back-link to Step 1 so Next in the wizard never dead-ends.
 */

import React from 'react';

import { Link } from 'react-router-dom';

// Design tokens (design-guide §3)
const SURFACE = '#0D0D14';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';

export function GenerateRoadMapPlaceholder(): React.ReactElement {
  return (
    <div style={styles.page}>
      <div style={styles.content}>
        <h1 style={styles.heading}>Step 2 — Video Road Map</h1>
        <p style={styles.subheading}>Coming soon</p>
        <Link to="/generate" style={styles.backLink}>
          Back to Step 1
        </Link>
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: SURFACE,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '16px',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  heading: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: '32px',
    color: TEXT_PRIMARY,
  } as React.CSSProperties,

  subheading: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '20px',
    color: TEXT_SECONDARY,
  } as React.CSSProperties,

  backLink: {
    color: PRIMARY,
    fontSize: '14px',
    fontWeight: 500,
    textDecoration: 'none',
  } as React.CSSProperties,
} as const;
