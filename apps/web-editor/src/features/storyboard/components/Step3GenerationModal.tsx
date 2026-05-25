import React, { useEffect, useMemo, useState } from 'react';

import type { AiModel } from '@/shared/ai-generation/types';
import { listModels } from '@/shared/ai-generation/api';
import {
  backdropStyle,
  closeButtonStyle,
  headerStyle,
  headerTitleStyle,
} from './SceneModal.styles';
import { step3Styles as styles } from './Step3GenerationModal.styles';

type Step3GenerationModalProps = {
  isBusy: boolean;
  error: string | null;
  onClose: () => void;
  onSkip: () => void;
  onGenerate: (params: { modelId: string; generateAudio: boolean }) => void;
};

function CloseIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function supportsAudio(model: AiModel): boolean {
  return model.inputSchema.fields.some(
    (field) => field.name === 'generate_audio' || field.name === 'generate_audio_switch',
  );
}

type DurationBehavior = {
  copy: string;
  tone: 'default' | 'warning';
};

/**
 * Describes how Step 3 will map storyboard scene duration to the selected
 * Image-to-Video model's supported input fields.
 */
export function getModelDurationBehavior(model: AiModel | null): DurationBehavior | null {
  if (!model) return null;

  const fieldNames = new Set(model.inputSchema.fields.map((field) => field.name));
  if (fieldNames.has('duration')) {
    return { copy: 'Uses each scene duration directly.', tone: 'default' };
  }

  if (fieldNames.has('num_frames') && (fieldNames.has('fps') || fieldNames.has('frames_per_second'))) {
    return { copy: 'Uses each scene duration by converting it to generated frames.', tone: 'default' };
  }

  return { copy: 'No recognized duration control; provider default duration may apply.', tone: 'warning' };
}

export function Step3GenerationModal({
  isBusy,
  error,
  onClose,
  onSkip,
  onGenerate,
}: Step3GenerationModalProps): React.ReactElement {
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [generateAudio, setGenerateAudio] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingModels(true);
    setLoadError(null);
    listModels()
      .then((result) => {
        if (cancelled) return;
        const videoModels = result.image_to_video ?? [];
        setModels(videoModels);
        setSelectedModelId((current) => current || videoModels[0]?.id || '');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load video models.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingModels(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );
  const selectedSupportsAudio = selectedModel ? supportsAudio(selectedModel) : false;
  const durationBehavior = getModelDurationBehavior(selectedModel);

  useEffect(() => {
    if (!selectedSupportsAudio) {
      setGenerateAudio(false);
    }
  }, [selectedSupportsAudio]);

  const canGenerate = Boolean(selectedModelId) && !isBusy && !isLoadingModels;

  return (
    <div style={backdropStyle} role="presentation" data-testid="step3-generation-modal">
      <div style={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="step3-modal-title">
        <header style={headerStyle}>
          <h2 id="step3-modal-title" style={headerTitleStyle}>Step 3</h2>
          <button
            type="button"
            style={closeButtonStyle}
            onClick={onClose}
            aria-label="Close"
            disabled={isBusy}
          >
            <CloseIcon />
          </button>
        </header>

        <div style={styles.body}>
          <section style={styles.section} aria-label="Storyboard project mode">
            <button
              type="button"
              style={styles.optionButton}
              onClick={onSkip}
              disabled={isBusy}
              data-testid="step3-skip-videos-button"
            >
              <span style={styles.optionTitle}>Keep image clips</span>
              <span style={styles.optionDescription}>Use the approved scene illustrations in the editor timeline.</span>
            </button>
          </section>

          <section style={styles.section} aria-label="Image to video model">
            <label style={styles.label} htmlFor="step3-video-model">Image to Video Model</label>
            <select
              id="step3-video-model"
              value={selectedModelId}
              onChange={(event) => setSelectedModelId(event.target.value)}
              disabled={isBusy || isLoadingModels || models.length === 0}
              style={styles.select}
              data-testid="step3-video-model-select"
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>{model.label}</option>
              ))}
            </select>
            {durationBehavior ? (
              <p
                style={durationBehavior.tone === 'warning' ? styles.durationNoteWarning : styles.durationNote}
                data-testid="step3-duration-behavior"
              >
                {durationBehavior.copy}
              </p>
            ) : null}
          </section>

          {selectedSupportsAudio ? (
            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={generateAudio}
                onChange={(event) => setGenerateAudio(event.target.checked)}
                disabled={isBusy}
                data-testid="step3-generate-audio-checkbox"
              />
              Generate audio
            </label>
          ) : null}

          {isLoadingModels ? <p style={styles.muted}>Loading models...</p> : null}
          {models.length === 0 && !isLoadingModels ? <p style={styles.error}>No Image to Video models are available.</p> : null}
          {loadError ? <p style={styles.error}>{loadError}</p> : null}
          {error ? <p style={styles.error}>{error}</p> : null}
        </div>

        <footer style={styles.footer}>
          <button type="button" style={styles.secondaryButton} onClick={onClose} disabled={isBusy}>
            Cancel
          </button>
          <button
            type="button"
            style={canGenerate ? styles.primaryButton : styles.primaryButtonDisabled}
            onClick={() => onGenerate({ modelId: selectedModelId, generateAudio: selectedSupportsAudio && generateAudio })}
            disabled={!canGenerate}
            data-testid="step3-start-videos-button"
          >
            {isBusy ? 'Starting...' : 'Generate videos'}
          </button>
        </footer>
      </div>
    </div>
  );
}
