import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PlayerRef } from '@remotion/player';

import type { TextOverlayClip } from '@ai-video-editor/project-schema';

import { AssetBrowserPanel } from '@/features/asset-manager/components/AssetBrowserPanel';
import { PreviewPanel } from '@/features/preview/components/PreviewPanel';
import { PlaybackControls } from '@/features/preview/components/PlaybackControls';
import { CaptionEditorPanel } from '@/features/captions/components/CaptionEditorPanel';
import { VersionHistoryPanel } from '@/features/version-history/components/VersionHistoryPanel';
import { ExportModal } from '@/features/export/components/ExportModal';
import { TimelinePanel } from '@/features/timeline/components/TimelinePanel';
import { useRemotionPlayer } from '@/features/preview/hooks/useRemotionPlayer';
import { useEphemeralStore } from '@/store/ephemeral-store';
import { useProjectStore, getSnapshot as getProjectSnapshot, setProject, getCurrentVersionId } from '@/store/project-store';
import { useProjectInit } from '@/features/project/hooks/useProjectInit';

import { TopBar } from './TopBar';

// Design-guide tokens
const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';

const queryClient = new QueryClient();

// ---------------------------------------------------------------------------
// PreviewSection — coordinates playerRef between PreviewPanel and PlaybackControls
// ---------------------------------------------------------------------------

/**
 * Owns the Remotion playerRef and passes it to both PreviewPanel and
 * PlaybackControls so they share the same Player instance.
 *
 * Also subscribes to `playheadFrame` from the ephemeral store and calls
 * `playerRef.current.seekTo()` whenever it changes while the player is not
 * playing. This ensures that ruler clicks, keyboard shortcuts, and any other
 * `setPlayheadFrame` callers automatically drive the Remotion player.
 */
export function PreviewSection(): React.ReactElement {
  const { playerRef } = useRemotionPlayer();
  const { playheadFrame } = useEphemeralStore();

  React.useEffect(() => {
    const player = playerRef.current as (PlayerRef & { isPlaying?: () => boolean }) | null;
    if (!player) return;
    const playing = typeof player.isPlaying === 'function' ? player.isPlaying() : false;
    if (!playing) {
      player.seekTo(playheadFrame);
    }
  }, [playheadFrame, playerRef]);

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
 * The version history panel is toggled from the top bar.
 * The top bar includes the save status indicator via `useAutosave`.
 * The timeline panel is rendered below the editor row.
 */
export function App(): React.ReactElement {
  const projectInit = useProjectInit();
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [isExportOpen, setIsExportOpen] = React.useState(false);

  const handleToggleHistory = (): void => {
    setIsHistoryOpen((prev) => !prev);
  };

  const handleCloseHistory = (): void => {
    setIsHistoryOpen(false);
  };

  const handleToggleExport = (): void => {
    setIsExportOpen((prev) => !prev);
  };

  const handleCloseExport = (): void => {
    setIsExportOpen(false);
  };

  const handleRenameTrack = React.useCallback((trackId: string, newName: string): void => {
    const doc = getProjectSnapshot();
    setProject({
      ...doc,
      tracks: doc.tracks.map((t) => (t.id === trackId ? { ...t, name: newName } : t)),
    });
  }, []);

  const handleToggleMute = React.useCallback((trackId: string): void => {
    const doc = getProjectSnapshot();
    setProject({
      ...doc,
      tracks: doc.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)),
    });
  }, []);

  const handleToggleLock = React.useCallback((trackId: string): void => {
    const doc = getProjectSnapshot();
    setProject({
      ...doc,
      tracks: doc.tracks.map((t) => (t.id === trackId ? { ...t, locked: !t.locked } : t)),
    });
  }, []);

  const currentVersionId = getCurrentVersionId();

  if (projectInit.status === 'loading') {
    return (
      <div style={{ ...styles.shell, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: TEXT_PRIMARY, fontFamily: 'Inter, sans-serif', fontSize: 14 }}>
          Loading project…
        </span>
      </div>
    );
  }

  if (projectInit.status === 'error') {
    return (
      <div style={{ ...styles.shell, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#EF4444', fontFamily: 'Inter, sans-serif', fontSize: 14 }}>
          {projectInit.error}
        </span>
      </div>
    );
  }

  const { projectId } = projectInit;

  return (
    <QueryClientProvider client={queryClient}>
      <div style={styles.shell}>
        {/* Top bar — spans full width above the main columns */}
        <TopBar
          projectId={projectId}
          isHistoryOpen={isHistoryOpen}
          onToggleHistory={handleToggleHistory}
          isExportOpen={isExportOpen}
          onToggleExport={handleToggleExport}
          canExport={currentVersionId !== null}
        />

        {/* Main editor row */}
        <div style={styles.editorRow}>
          {/* Left column — asset browser (fixed width) */}
          <aside style={styles.sidebar} aria-label="Asset browser">
            <AssetBrowserPanel projectId={projectId} />
          </aside>

          {/* Vertical divider */}
          <div style={styles.verticalDivider} aria-hidden="true" />

          {/* Center column — preview + playback controls */}
          <main style={styles.center}>
            <PreviewSection />
          </main>

          {/* Right column — conditional inspector or version history panel */}
          {isHistoryOpen ? (
            <VersionHistoryPanel projectId={projectId} onClose={handleCloseHistory} />
          ) : (
            <RightSidebar />
          )}
        </div>

        {/* Timeline panel — full width, fixed height at the bottom of the editor */}
        <TimelinePanel
          onRenameTrack={handleRenameTrack}
          onToggleMute={handleToggleMute}
          onToggleLock={handleToggleLock}
        />
      </div>

      {/* Export modal — rendered as a portal-like overlay above the editor */}
      {isExportOpen && currentVersionId !== null && (
        <ExportModal versionId={currentVersionId} projectId={projectId} onClose={handleCloseExport} />
      )}
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  shell: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    overflow: 'hidden',
    background: SURFACE,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  editorRow: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  } as React.CSSProperties,

  sidebar: {
    flexShrink: 0,
    background: SURFACE_ALT,
    display: 'flex',
    flexDirection: 'column' as const,
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
