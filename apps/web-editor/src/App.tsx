import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AssetBrowserPanel } from '@/features/asset-manager/components/AssetBrowserPanel';
import { PreviewPanel } from '@/features/preview/components/PreviewPanel';
import { PlaybackControls } from '@/features/preview/components/PlaybackControls';
import { CaptionEditorPanel } from '@/features/captions/components/CaptionEditorPanel';
import { useRemotionPlayer } from '@/features/preview/hooks/useRemotionPlayer';
import { useEphemeralStore } from '@/store/ephemeral-store';
import { useProjectStore } from '@/store/project-store';
import type { TextOverlayClip } from '@ai-video-editor/project-schema';

// Hardcoded project ID for development until the project creation flow is implemented.
export const DEV_PROJECT_ID = 'dev-project-001';

const queryClient = new QueryClient();

// ---------------------------------------------------------------------------
// Design-guide tokens
// ---------------------------------------------------------------------------

const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';
const SURFACE_ELEVATED = '#1E1E2E';
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
// RightSidebar — renders CaptionEditorPanel when a caption clip is selected
// ---------------------------------------------------------------------------

/**
 * Reads `selectedClipIds` from the ephemeral store and `clips` from the
 * project store. Renders `CaptionEditorPanel` only when exactly one clip is
 * selected and it is of type `text-overlay`; otherwise renders nothing.
 */
function RightSidebar(): React.ReactElement | null {
  const { selectedClipIds } = useEphemeralStore();
  const project = useProjectStore();

  if (selectedClipIds.length !== 1) return null;

  const selectedClip = project.clips.find((c) => c.id === selectedClipIds[0]);

  if (!selectedClip || selectedClip.type !== 'text-overlay') return null;

  const captionClip = selectedClip as TextOverlayClip;

  return (
    <>
      <div style={styles.rightSidebarDivider} aria-hidden="true" />
      <aside style={styles.rightSidebar} aria-label="Inspector">
        <CaptionEditorPanel clip={captionClip} />
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// App — two-column editor shell
// ---------------------------------------------------------------------------

/**
 * Root application shell. Provides the QueryClient context and renders the
 * two-column editor layout: asset browser sidebar (left) and preview area (right).
 * A conditional right inspector panel is shown when a caption clip is selected.
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

        {/* Right column — conditional inspector panel */}
        <RightSidebar />
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

  rightSidebar: {
    width: '280px',
    flexShrink: 0,
    background: SURFACE_ALT,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  rightSidebarDivider: {
    width: '1px',
    flexShrink: 0,
    background: BORDER,
  } as React.CSSProperties,
} as const;
