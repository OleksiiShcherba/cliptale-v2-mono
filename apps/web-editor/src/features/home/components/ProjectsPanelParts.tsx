import React from 'react';

// ── Design-guide tokens (§3 Dark Theme) ────────────────────────────────────
const TEXT_SECONDARY = '#8A8AA0';
const ERROR = '#EF4444';
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';

/** Skeleton card shown during loading. */
export function SkeletonCard(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      style={{
        background: SURFACE_ELEVATED,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          background: '#252535',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            height: 14,
            borderRadius: 4,
            background: '#252535',
            width: '70%',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <div
          style={{
            height: 12,
            borderRadius: 4,
            background: '#252535',
            width: '40%',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  );
}

/** Shared error state for the Projects panel. */
export function ProjectsErrorState(): React.ReactElement {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        gap: 8,
        color: TEXT_SECONDARY,
        fontFamily: 'Inter, sans-serif',
        padding: 32,
      }}
    >
      <p style={{ fontSize: 16, fontWeight: 600, color: ERROR, margin: 0 }}>
        Could not load projects
      </p>
      <p style={{ fontSize: 14, margin: 0 }}>Please refresh the page and try again.</p>
    </div>
  );
}
