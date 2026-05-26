import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { useAssets } from '@/features/generate-wizard/hooks/useAssets';
import { getMusicRangeInfo } from '@/features/storyboard/hooks/useStoryboardMusic';
import type { StoryboardBlock, StoryboardMusicBlock, StoryboardMusicSourceMode } from '@/features/storyboard/types';

import { musicBlockModalStyles as styles } from './MusicBlockModal.styles';

interface MusicBlockModalProps {
  draftId: string;
  block: StoryboardMusicBlock;
  orderedScenes: StoryboardBlock[];
  isGenerating: boolean;
  error: string | null;
  onChange: (block: StoryboardMusicBlock) => void;
  onGenerate: (block: StoryboardMusicBlock) => Promise<void>;
  onClose: () => void;
}

const SOURCE_OPTIONS: Array<{ mode: StoryboardMusicSourceMode; label: string }> = [
  { mode: 'existing', label: 'Existing track' },
  { mode: 'generate_now', label: 'Generate now' },
  { mode: 'generate_on_step3', label: 'Auto later' },
];

function displaySceneName(scene: StoryboardBlock): string {
  return scene.name?.trim() || `Scene ${String(scene.sortOrder).padStart(2, '0')}`;
}

function getGenerateLabel(block: StoryboardMusicBlock): string {
  if (block.generationStatus === 'failed') return 'Retry';
  if (block.generationStatus === 'ready') return 'Regenerate';
  return 'Generate';
}

function totalPlanSeconds(block: StoryboardMusicBlock): number | null {
  if (!block.compositionPlan) return null;
  return Math.round(
    block.compositionPlan.sections.reduce((sum, section) => sum + section.duration_ms, 0) / 1000,
  );
}

export function MusicBlockModal({
  draftId,
  block,
  orderedScenes,
  isGenerating,
  error,
  onChange,
  onGenerate,
  onClose,
}: MusicBlockModalProps): React.ReactElement {
  const dialogRef = useRef<HTMLElement | null>(null);
  const assets = useAssets({ type: 'audio', draftId, scope: 'all' });
  const rangeInfo = useMemo(() => getMusicRangeInfo(block, orderedScenes), [block, orderedScenes]);
  const coveredSceneIds = new Set(rangeInfo.coveredSceneIds);
  const startIndex = orderedScenes.findIndex((scene) => scene.id === block.startSceneBlockId);
  const endIndex = orderedScenes.findIndex((scene) => scene.id === block.endSceneBlockId);
  const planSeconds = totalPlanSeconds(block);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    },
    [onClose],
  );

  const patch = (updates: Partial<StoryboardMusicBlock>): void => {
    onChange({ ...block, ...updates });
  };

  const handleStartChange = (sceneId: string): void => {
    const nextStartIndex = orderedScenes.findIndex((scene) => scene.id === sceneId);
    const safeEndSceneId = endIndex >= nextStartIndex && endIndex >= 0
      ? block.endSceneBlockId
      : sceneId;
    patch({ startSceneBlockId: sceneId, endSceneBlockId: safeEndSceneId });
  };

  const handleEndChange = (sceneId: string): void => {
    const nextEndIndex = orderedScenes.findIndex((scene) => scene.id === sceneId);
    const safeStartSceneId = startIndex <= nextEndIndex && startIndex >= 0
      ? block.startSceneBlockId
      : sceneId;
    patch({ startSceneBlockId: safeStartSceneId, endSceneBlockId: sceneId });
  };

  return (
    <div style={styles.backdrop} role="presentation" data-testid="music-block-modal">
      <section
        ref={dialogRef}
        style={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Music block inspector"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <header style={styles.header}>
          <div style={styles.titleGroup}>
            <input
              style={styles.titleInput}
              value={block.name}
              onChange={(event) => patch({ name: event.target.value })}
              aria-label="Music block name"
            />
            <span style={styles.rangeText} data-testid="music-modal-range-label">
              {rangeInfo.rangeLabel}
            </span>
          </div>
          <button type="button" style={styles.closeButton} onClick={onClose} aria-label="Close music inspector">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div style={styles.body}>
          <div style={styles.segmented} data-testid="music-source-control">
            {SOURCE_OPTIONS.map((option) => {
              const active = block.sourceMode === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  style={active ? styles.segmentActive : styles.segment}
                  onClick={() => patch({ sourceMode: option.mode })}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {block.sourceMode === 'existing' ? (
            <label style={styles.field}>
              <span style={styles.label}>Audio file</span>
              <select
                style={styles.input}
                value={block.existingFileId ?? ''}
                onChange={(event) => patch({ existingFileId: event.target.value || null })}
                data-testid="music-audio-picker"
              >
                <option value="">Select audio</option>
                {(assets.data?.items ?? []).map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label style={styles.field}>
                <span style={styles.label}>Prompt</span>
                <textarea
                  style={styles.textarea}
                  value={block.prompt ?? ''}
                  onChange={(event) => patch({ prompt: event.target.value })}
                  data-testid="music-prompt"
                />
              </label>
              {planSeconds !== null ? (
                <div style={styles.planSummary} data-testid="music-plan-summary">
                  {block.compositionPlan?.sections.length ?? 0} sections / {planSeconds}s
                </div>
              ) : null}
            </>
          )}

          <div style={styles.rangeGrid}>
            <label style={styles.field}>
              <span style={styles.label}>Start</span>
              <select
                style={styles.input}
                value={block.startSceneBlockId}
                onChange={(event) => handleStartChange(event.target.value)}
                data-testid="music-start-scene-select"
              >
                {orderedScenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {displaySceneName(scene)}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.field}>
              <span style={styles.label}>End</span>
              <select
                style={styles.input}
                value={block.endSceneBlockId}
                onChange={(event) => handleEndChange(event.target.value)}
                data-testid="music-end-scene-select"
              >
                {orderedScenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {displaySceneName(scene)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={styles.sceneLane} data-testid="music-range-preview">
            {orderedScenes.map((scene) => (
              <span
                key={scene.id}
                style={coveredSceneIds.has(scene.id) ? styles.sceneLaneItemActive : styles.sceneLaneItem}
                title={displaySceneName(scene)}
              />
            ))}
          </div>

          <div style={styles.rangeGrid}>
            <label style={styles.field}>
              <span style={styles.label}>Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={block.volume}
                onChange={(event) => patch({ volume: Number(event.target.value) })}
                data-testid="music-volume"
              />
            </label>
            <label style={styles.field}>
              <span style={styles.label}>Loop</span>
              <select
                style={styles.input}
                value={block.loopMode}
                onChange={(event) => patch({ loopMode: event.target.value as StoryboardMusicBlock['loopMode'] })}
                data-testid="music-loop-mode"
              >
                <option value="trim">Trim</option>
                <option value="loop">Loop</option>
              </select>
            </label>
          </div>

          <div style={styles.rangeGrid}>
            <label style={styles.field}>
              <span style={styles.label}>Fade in</span>
              <input
                style={styles.input}
                type="number"
                min="0"
                step="0.25"
                value={block.fadeInS}
                onChange={(event) => patch({ fadeInS: Math.max(0, Number(event.target.value)) })}
                data-testid="music-fade-in"
              />
            </label>
            <label style={styles.field}>
              <span style={styles.label}>Fade out</span>
              <input
                style={styles.input}
                type="number"
                min="0"
                step="0.25"
                value={block.fadeOutS}
                onChange={(event) => patch({ fadeOutS: Math.max(0, Number(event.target.value)) })}
                data-testid="music-fade-out"
              />
            </label>
          </div>

          {block.sourceMode === 'generate_now' ? (
            <button
              type="button"
              style={styles.primaryButton}
              disabled={isGenerating}
              onClick={() => { void onGenerate(block); }}
              data-testid="music-generate-button"
            >
              {isGenerating ? 'Generating' : getGenerateLabel(block)}
            </button>
          ) : null}

          {assets.isError ? <div style={styles.error}>Audio assets unavailable.</div> : null}
          {block.errorMessage ? <div style={styles.error}>{block.errorMessage}</div> : null}
          {error ? <div style={styles.error}>{error}</div> : null}
        </div>
      </section>
    </div>
  );
}
