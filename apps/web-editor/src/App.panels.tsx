/**
 * App sub-panels: PreviewSection, RightSidebar, MobileTabContent.
 *
 * These are extracted from App.tsx to keep that file within the 300-line limit.
 * They are imported by App.tsx only — not part of the public API.
 */
import React from 'react';
import type { PlayerRef } from '@remotion/player';

import type { AudioClip, CaptionClip, ImageClip, TextOverlayClip, VideoClip } from '@ai-video-editor/project-schema';

import { AssetBrowserPanel } from '@/features/asset-manager/components/AssetBrowserPanel';
import { AiGenerationPanel } from '@/features/ai-generation/components/AiGenerationPanel';
import { PreviewPanel } from '@/features/preview/components/PreviewPanel';
import { PlaybackControls } from '@/features/preview/components/PlaybackControls';
import { CaptionEditorPanel } from '@/features/captions/components/CaptionEditorPanel';
import { AudioClipEditorPanel } from '@/features/timeline/components/AudioClipEditorPanel';
import { ImageClipEditorPanel } from '@/features/timeline/components/ImageClipEditorPanel';
import { VideoClipEditorPanel } from '@/features/timeline/components/VideoClipEditorPanel';
import { useRemotionPlayer } from '@/features/preview/hooks/useRemotionPlayer';
import { useEphemeralStore, setSelectedClips } from '@/store/ephemeral-store';
import { useProjectStore } from '@/store/project-store';

import { styles } from './App.styles';

// ---------------------------------------------------------------------------
// PreviewSection
// ---------------------------------------------------------------------------

/**
 * Owns the Remotion playerRef and passes it to both PreviewPanel and
 * PlaybackControls so they share the same Player instance.
 *
 * Subscribes to `playheadFrame` from the ephemeral store and calls
 * `playerRef.current.seekTo()` whenever it changes while the player is
 * not playing (ruler clicks, keyboard shortcuts, etc.).
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
// RightSidebar
// ---------------------------------------------------------------------------

/**
 * Reads `selectedClipIds` from the ephemeral store and `clips` from the
 * project store. Renders the appropriate inspector panel for the selected clip:
 * - `text-overlay` → CaptionEditorPanel
 * - `image` → ImageClipEditorPanel
 * - `video` → VideoClipEditorPanel
 * - `audio` → AudioClipEditorPanel
 * - Otherwise (multiple/none) → null
 */
export function RightSidebar(): React.ReactElement | null {
  const { selectedClipIds } = useEphemeralStore();
  const project = useProjectStore();

  if (selectedClipIds.length !== 1) return null;

  const selectedClip = project.clips.find((c) => c.id === selectedClipIds[0]);
  if (!selectedClip) return null;

  if (selectedClip.type === 'text-overlay') {
    return (
      <>
        <div style={styles.rightSidebarDivider} aria-hidden="true" />
        <aside style={styles.rightSidebar} aria-label="Inspector">
          <CaptionEditorPanel
            clip={selectedClip as TextOverlayClip}
            onClose={() => setSelectedClips([])}
          />
        </aside>
      </>
    );
  }

  if (selectedClip.type === 'caption') {
    return (
      <>
        <div style={styles.rightSidebarDivider} aria-hidden="true" />
        <aside style={styles.rightSidebar} aria-label="Inspector">
          <CaptionEditorPanel
            clip={selectedClip as CaptionClip}
            onClose={() => setSelectedClips([])}
          />
        </aside>
      </>
    );
  }

  if (selectedClip.type === 'image') {
    return (
      <>
        <div style={styles.rightSidebarDivider} aria-hidden="true" />
        <aside style={styles.rightSidebar} aria-label="Inspector">
          <ImageClipEditorPanel
            clip={selectedClip as ImageClip}
            onClose={() => setSelectedClips([])}
          />
        </aside>
      </>
    );
  }

  if (selectedClip.type === 'video') {
    return (
      <>
        <div style={styles.rightSidebarDivider} aria-hidden="true" />
        <aside style={styles.rightSidebar} aria-label="Inspector">
          <VideoClipEditorPanel
            clip={selectedClip as VideoClip}
            onClose={() => setSelectedClips([])}
          />
        </aside>
      </>
    );
  }

  if (selectedClip.type === 'audio') {
    return (
      <>
        <div style={styles.rightSidebarDivider} aria-hidden="true" />
        <aside style={styles.rightSidebar} aria-label="Inspector">
          <AudioClipEditorPanel
            clip={selectedClip as AudioClip}
            onClose={() => setSelectedClips([])}
          />
        </aside>
      </>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// MobileTabContent
// ---------------------------------------------------------------------------

interface MobileTabContentProps {
  activeTab: 'assets' | 'captions' | 'inspector' | 'ai-generate';
  projectId: string;
  /** Optional callback to switch to the Assets tab. */
  onSwitchToAssets?: () => void;
}

const MOBILE_EMPTY_TEXT_COLOR = '#8A8AA0';

/**
 * Renders the content panel for the selected mobile inspector tab:
 * - assets → AssetBrowserPanel
 * - captions → CaptionEditorPanel (when a caption clip is selected)
 * - inspector → Image/Caption editor (when a clip is selected)
 */
export function MobileTabContent({ activeTab, projectId, onSwitchToAssets }: MobileTabContentProps): React.ReactElement | null {
  const { selectedClipIds } = useEphemeralStore();
  const project = useProjectStore();

  const emptyPanel = (label: string, message: string): React.ReactElement => (
    <div
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      aria-label={label}
    >
      <span style={{ color: MOBILE_EMPTY_TEXT_COLOR, fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 400, textAlign: 'center' }}>
        {message}
      </span>
    </div>
  );

  if (activeTab === 'assets') {
    return <AssetBrowserPanel projectId={projectId} areFilterTabsHidden />;
  }

  if (activeTab === 'ai-generate') {
    return <AiGenerationPanel projectId={projectId} onSwitchToAssets={onSwitchToAssets} />;
  }

  if (activeTab === 'captions') {
    const selectedClip = selectedClipIds.length === 1
      ? project.clips.find((c) => c.id === selectedClipIds[0])
      : undefined;

    if (selectedClip?.type === 'text-overlay') {
      return (
        <CaptionEditorPanel
          clip={selectedClip as TextOverlayClip}
          onClose={() => setSelectedClips([])}
        />
      );
    }

    if (selectedClip?.type === 'caption') {
      return (
        <CaptionEditorPanel
          clip={selectedClip as CaptionClip}
          onClose={() => setSelectedClips([])}
        />
      );
    }

    return emptyPanel('No caption clip selected', 'Select a caption clip to edit it');
  }

  if (activeTab === 'inspector') {
    const selectedClip = selectedClipIds.length === 1
      ? project.clips.find((c) => c.id === selectedClipIds[0])
      : undefined;

    if (selectedClip?.type === 'image') {
      return (
        <ImageClipEditorPanel
          clip={selectedClip as ImageClip}
          onClose={() => setSelectedClips([])}
        />
      );
    }

    if (selectedClip?.type === 'text-overlay') {
      return (
        <CaptionEditorPanel
          clip={selectedClip as TextOverlayClip}
          onClose={() => setSelectedClips([])}
        />
      );
    }

    if (selectedClip?.type === 'caption') {
      return (
        <CaptionEditorPanel
          clip={selectedClip as CaptionClip}
          onClose={() => setSelectedClips([])}
        />
      );
    }

    if (selectedClip?.type === 'video') {
      return (
        <VideoClipEditorPanel
          clip={selectedClip as VideoClip}
          onClose={() => setSelectedClips([])}
        />
      );
    }

    if (selectedClip?.type === 'audio') {
      return (
        <AudioClipEditorPanel
          clip={selectedClip as AudioClip}
          onClose={() => setSelectedClips([])}
        />
      );
    }

    return emptyPanel('No clip selected', 'Select a clip to inspect it');
  }

  return null;
}
