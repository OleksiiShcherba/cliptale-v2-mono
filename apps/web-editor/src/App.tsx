import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AssetBrowserPanel } from '@/features/asset-manager/components/AssetBrowserPanel';
import { PreviewPanel } from '@/features/preview/components/PreviewPanel';
import { PlaybackControls } from '@/features/preview/components/PlaybackControls';
import { useRemotionPlayer } from '@/features/preview/hooks/useRemotionPlayer';

// Hardcoded project ID for development until the project creation flow is implemented.
export const DEV_PROJECT_ID = 'dev-project-001';

const queryClient = new QueryClient();

// ---------------------------------------------------------------------------
// Design-guide tokens
// ---------------------------------------------------------------------------

const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';

// ---------------------------------------------------------------------------
// PreviewSection — coordinates playerRef between PreviewPanel and PlaybackControls
// ---------------------------------------------------------------------------

/**
 * Owns the Remotion playerRef and passes it to both PreviewPanel and
 * PlaybackControls so they share the same Player instance.
 */
export function PreviewSection(): React.ReactElement {
  const { playerRef } = useRemotionPlayer();

  return (
    <div style={styles.previewSection}>
      <div style={styles.previewPanelWrapper}>
        <PreviewPanel playerRef={playerRef} />
      </div>
      <PlaybackControls playerRef={playerRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// App — two-column editor shell
// ---------------------------------------------------------------------------

/**
 * Root application shell. Provides the QueryClient context and renders the
 * two-column editor layout: asset browser sidebar (left) and preview area (right).
 */
export function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <div style={styles.shell}>
        {/* Left column — asset browser (fixed width) */}
        <aside style={styles.sidebar} aria-label="Asset browser">
          <AssetBrowserPanel projectId={DEV_PROJECT_ID} />
        </aside>

        {/* Vertical divider */}
        <div style={styles.verticalDivider} aria-hidden="true" />

        {/* Center column — preview + playback controls */}
        <main style={styles.center}>
          <PreviewSection />
        </main>
      </div>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  shell: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    background: SURFACE,
    color: '#F0F0FA',
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  sidebar: {
    width: '320px',
    flexShrink: 0,
    background: SURFACE_ALT,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  verticalDivider: {
    width: '1px',
    flexShrink: 0,
    background: BORDER,
  } as React.CSSProperties,

  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    background: SURFACE,
  } as React.CSSProperties,

  previewSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  previewPanelWrapper: {
    flex: 1,
    overflow: 'hidden',
  } as React.CSSProperties,
} as const;
