import React from 'react';

// ── Design-guide tokens (§3 Dark Theme) ────────────────────────────────────
const TEXT_SECONDARY = '#8A8AA0';
const ERROR = '#EF4444';
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';

/**
 * Skeleton card shown during loading.
 * Three are displayed in the storyboard panel while data is being fetched.
 */
export function StoryboardSkeletonCard(): React.ReactElement {
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
        gap: 0,
      }}
    >
      {/* Badge row */}
      <div style={{ padding: '12px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            height: 16,
            width: 60,
            borderRadius: 4,
            background: '#252535',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      </div>
      {/* Text preview rows */}
      <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            height: 14,
            borderRadius: 4,
            background: '#252535',
            width: '90%',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <div
          style={{
            height: 14,
            borderRadius: 4,
            background: '#252535',
            width: '70%',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      </div>
      {/* Media preview row */}
      <div style={{ padding: '8px 16px 12px', display: 'flex', gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 56,
              height: 56,
              borderRadius: 4,
              background: '#252535',
              flexShrink: 0,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Shared error state for the Storyboard panel. */
export function StoryboardErrorState(): React.ReactElement {
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
        Could not load storyboards
      </p>
      <p style={{ fontSize: 14, fontWeight: 400, margin: 0 }}>
        Please refresh the page and try again.
      </p>
    </div>
  );
}
