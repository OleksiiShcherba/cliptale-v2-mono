import React from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { AssetBrowserPanel } from '@/features/asset-manager/components/AssetBrowserPanel';
import { VersionHistoryPanel } from '@/features/version-history/components/VersionHistoryPanel';
import { ExportModal } from '@/features/export/components/ExportModal';
import { RendersQueueModal } from '@/features/export/components/RendersQueueModal';
import { useListRenders } from '@/features/export/hooks/useListRenders';
import { TimelinePanel } from '@/features/timeline/components/TimelinePanel';
import { MobileInspectorTabs } from '@/features/preview/components/MobileInspectorTabs';
import { MobileBottomBar } from '@/features/preview/components/MobileBottomBar';
import { setProject, getSnapshot as getProjectSnapshot, useCurrentVersionId } from '@/store/project-store';
import { useProjectInit } from '@/features/project/hooks/useProjectInit';
import { useUndoRedo } from '@/features/version-history/hooks/useUndoRedo';
import { useKeyboardShortcuts } from '@/features/version-history/hooks/useKeyboardShortcuts';
import { useWindowWidth } from '@/shared/hooks/useWindowWidth';
import { ProjectSettingsModal } from '@/features/project-settings/components/ProjectSettingsModal';
import { AiGenerationPanel } from '@/features/ai-generation/components/AiGenerationPanel';
import { LeftSidebarTabs } from '@/features/ai-generation/components/LeftSidebarTabs';
import type { LeftSidebarTab } from '@/features/ai-generation/components/LeftSidebarTabs';
import { TimelineResizeHandle } from '@/features/timeline/components/TimelineResizeHandle';
import { useTimelineResize } from '@/features/timeline/hooks/useTimelineResize';

import { TopBar } from './TopBar';
import { styles } from './App.styles';
import { PreviewSection, RightSidebar, MobileTabContent } from './App.panels';

/** Viewport width threshold in px — below this the tablet/mobile layout is used. */
const TABLET_BREAKPOINT = 768;

const TEXT_PRIMARY = '#F0F0FA';
const ERROR_COLOR = '#EF4444';

// Re-export PreviewSection so existing tests that import it directly keep working.
export { PreviewSection } from './App.panels';

// ---------------------------------------------------------------------------
// App — two-column editor shell (desktop) or vertical stack (tablet/mobile)
// ---------------------------------------------------------------------------

/**
 * Root application shell. Provides the QueryClient context and renders:
 * - **Desktop (≥768px):** two-column editor layout — asset browser sidebar (left),
 *   preview area (center), optional right inspector panel (right), timeline (bottom).
 * - **Tablet/Mobile (<768px):** vertical stack — top bar, preview, inspector tab bar,
 *   timeline, bottom action bar. No sidebars.
 */
export function App(): React.ReactElement {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const projectInit = useProjectInit();
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < TABLET_BREAKPOINT;

  const { timelineHeight, onResizePointerDown, onResizePointerMove, onResizePointerUp } = useTimelineResize();
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [isExportOpen, setIsExportOpen] = React.useState(false);
  const [isRendersOpen, setIsRendersOpen] = React.useState(false);
  const [leftSidebarTab, setLeftSidebarTab] = React.useState<LeftSidebarTab>('assets');
  const [mobileTab, setMobileTab] = React.useState<'assets' | 'captions' | 'inspector' | 'ai-generate'>('assets');
  const { canUndo, canRedo, handleUndo, handleRedo } = useUndoRedo();
  useKeyboardShortcuts({ onUndo: handleUndo, onRedo: handleRedo });

  const handleLogout = React.useCallback((): void => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const handleToggleSettings = (): void => setIsSettingsOpen((prev) => !prev);
  const handleCloseSettings = (): void => setIsSettingsOpen(false);
  const handleToggleHistory = (): void => setIsHistoryOpen((prev) => !prev);
  const handleCloseHistory = (): void => setIsHistoryOpen(false);
  const handleToggleExport = (): void => setIsExportOpen((prev) => !prev);
  const handleCloseExport = (): void => setIsExportOpen(false);
  const handleToggleRenders = (): void => setIsRendersOpen((prev) => !prev);
  const handleCloseRenders = (): void => setIsRendersOpen(false);

  const handleRenameTrack = React.useCallback((trackId: string, newName: string): void => {
    const doc = getProjectSnapshot();
    setProject({ ...doc, tracks: doc.tracks.map((t) => (t.id === trackId ? { ...t, name: newName } : t)) });
  }, []);

  const handleToggleMute = React.useCallback((trackId: string): void => {
    const doc = getProjectSnapshot();
    setProject({ ...doc, tracks: doc.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)) });
  }, []);

  const handleToggleLock = React.useCallback((trackId: string): void => {
    const doc = getProjectSnapshot();
    setProject({ ...doc, tracks: doc.tracks.map((t) => (t.id === trackId ? { ...t, locked: !t.locked } : t)) });
  }, []);

  const handleReorderTracks = React.useCallback((orderedTrackIds: string[]): void => {
    const doc = getProjectSnapshot();
    const trackMap = new Map(doc.tracks.map((t) => [t.id, t]));
    const reordered = orderedTrackIds
      .map((id) => trackMap.get(id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);
    setProject({ ...doc, tracks: reordered });
  }, []);

  const handleDeleteTrack = React.useCallback((trackId: string): void => {
    const doc = getProjectSnapshot();
    setProject({
      ...doc,
      tracks: doc.tracks.filter((t) => t.id !== trackId),
      clips: doc.clips.filter((c) => c.trackId !== trackId),
    });
  }, []);

  const currentVersionId = useCurrentVersionId();

  // Resolve projectId early for hooks — empty string when not yet loaded.
  const resolvedProjectId = projectInit.status === 'ready' ? projectInit.projectId : '';
  const { activeCount: activeRenderCount } = useListRenders(resolvedProjectId);

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
        <span style={{ color: ERROR_COLOR, fontFamily: 'Inter, sans-serif', fontSize: 14 }}>
          {projectInit.error}
        </span>
      </div>
    );
  }

  const { projectId } = projectInit;
  const timelinePanelProps = {
    onRenameTrack: handleRenameTrack,
    onToggleMute: handleToggleMute,
    onToggleLock: handleToggleLock,
    onReorderTracks: handleReorderTracks,
    onDeleteTrack: handleDeleteTrack,
  };

  // ---------------------------------------------------------------------------
  // Tablet / mobile layout (<768px)
  // ---------------------------------------------------------------------------

  if (isMobile) {
    return (
      <>
        <div style={styles.mobileShell}>
          <TopBar
            projectId={projectId}
            isSettingsOpen={isSettingsOpen}
            onToggleSettings={handleToggleSettings}
            isHistoryOpen={isHistoryOpen}
            onToggleHistory={handleToggleHistory}
            isExportOpen={isExportOpen}
            onToggleExport={handleToggleExport}
            isRendersOpen={isRendersOpen}
            onToggleRenders={handleToggleRenders}
            activeRenderCount={activeRenderCount}
            canExport={currentVersionId !== null}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onLogout={handleLogout}
          />
          <main style={styles.mobilePreviewArea} aria-label="Preview">
            <PreviewSection />
          </main>
          <MobileInspectorTabs activeTab={mobileTab} onTabChange={setMobileTab} />
          <div style={styles.mobileInspectorContent} aria-label={`${mobileTab} panel`}>
            <MobileTabContent activeTab={mobileTab} projectId={projectId} onSwitchToAssets={() => setMobileTab('assets')} />
          </div>
          <div style={styles.mobileTimeline}>
            <TimelinePanel {...timelinePanelProps} />
          </div>
          <MobileBottomBar
            onAddClip={() => setMobileTab('assets')}
            onAI={() => setMobileTab('captions')}
            canExport={currentVersionId !== null}
            onExport={handleToggleExport}
          />
        </div>
        {isSettingsOpen && <ProjectSettingsModal onClose={handleCloseSettings} />}
        {isExportOpen && currentVersionId !== null && (
          <ExportModal versionId={currentVersionId} projectId={projectId} onClose={handleCloseExport} />
        )}
        {isRendersOpen && (
          <RendersQueueModal projectId={projectId} onClose={handleCloseRenders} />
        )}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Desktop layout (≥768px)
  // ---------------------------------------------------------------------------

  return (
    <>
      <div style={styles.shell}>
        <TopBar
          projectId={projectId}
          isSettingsOpen={isSettingsOpen}
          onToggleSettings={handleToggleSettings}
          isHistoryOpen={isHistoryOpen}
          onToggleHistory={handleToggleHistory}
          isExportOpen={isExportOpen}
          onToggleExport={handleToggleExport}
          isRendersOpen={isRendersOpen}
          onToggleRenders={handleToggleRenders}
          activeRenderCount={activeRenderCount}
          canExport={currentVersionId !== null}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onLogout={handleLogout}
        />
        <div style={styles.editorRow}>
          <aside style={styles.sidebar} aria-label="Left sidebar">
            <LeftSidebarTabs activeTab={leftSidebarTab} onTabChange={setLeftSidebarTab} />
            {leftSidebarTab === 'assets' && <AssetBrowserPanel projectId={projectId} />}
            {leftSidebarTab === 'ai-generate' && (
              <AiGenerationPanel projectId={projectId} onSwitchToAssets={() => setLeftSidebarTab('assets')} />
            )}
          </aside>
          <div style={styles.verticalDivider} aria-hidden="true" />
          <main style={styles.center}>
            <PreviewSection />
          </main>
          {isHistoryOpen ? (
            <VersionHistoryPanel projectId={projectId} onClose={handleCloseHistory} />
          ) : (
            <RightSidebar />
          )}
        </div>
        <TimelineResizeHandle
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        />
        <TimelinePanel height={timelineHeight} {...timelinePanelProps} />
      </div>
      {isSettingsOpen && <ProjectSettingsModal onClose={handleCloseSettings} />}
      {isExportOpen && currentVersionId !== null && (
        <ExportModal versionId={currentVersionId} projectId={projectId} onClose={handleCloseExport} />
      )}
      {isRendersOpen && (
        <RendersQueueModal projectId={projectId} onClose={handleCloseRenders} />
      )}
    </>
  );
}
