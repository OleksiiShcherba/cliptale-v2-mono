import React, { useEffect, useMemo, useState } from 'react';

import type { AiModel } from '@/shared/ai-generation/types';
import { listModels } from '@/shared/ai-generation/api';
import {
  backdropStyle,
  BORDER,
  closeButtonStyle,
  dialogStyle,
  ERROR,
  headerStyle,
  headerTitleStyle,
  PRIMARY,
  SURFACE_ALT,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from './SceneModal.styles';

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

const styles = {
  dialog: {
    ...dialogStyle,
    width: 'min(560px, calc(100vw - 32px))',
  } as React.CSSProperties,
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 20,
    overflowY: 'auto',
  } as React.CSSProperties,
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  } as React.CSSProperties,
  optionButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    width: '100%',
    padding: 12,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    background: SURFACE_ALT,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    textAlign: 'left',
  } as React.CSSProperties,
  optionTitle: {
    fontSize: 14,
    lineHeight: '20px',
    fontWeight: 600,
  } as React.CSSProperties,
  optionDescription: {
    fontSize: 12,
    lineHeight: '18px',
    color: TEXT_SECONDARY,
  } as React.CSSProperties,
  label: {
    fontSize: 12,
    lineHeight: '18px',
    color: TEXT_SECONDARY,
    fontWeight: 500,
    textTransform: 'uppercase',
  } as React.CSSProperties,
  select: {
    width: '100%',
    height: 38,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    background: SURFACE_ALT,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    padding: '0 10px',
  } as React.CSSProperties,
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 28,
    fontSize: 14,
    lineHeight: '20px',
    color: TEXT_PRIMARY,
  } as React.CSSProperties,
  muted: {
    margin: 0,
    fontSize: 13,
    lineHeight: '18px',
    color: TEXT_SECONDARY,
  } as React.CSSProperties,
  error: {
    margin: 0,
    fontSize: 13,
    lineHeight: '18px',
    color: ERROR,
  } as React.CSSProperties,
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '14px 20px',
    borderTop: `1px solid ${BORDER}`,
    background: SURFACE_ELEVATED,
  } as React.CSSProperties,
  secondaryButton: {
    height: 36,
    padding: '0 14px',
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    background: SURFACE_ALT,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,
  primaryButton: {
    height: 36,
    padding: '0 14px',
    border: 0,
    borderRadius: 8,
    background: PRIMARY,
    color: '#FFFFFF',
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,
  primaryButtonDisabled: {
    height: 36,
    padding: '0 14px',
    border: 0,
    borderRadius: 8,
    background: PRIMARY,
    color: '#FFFFFF',
    fontFamily: 'Inter, sans-serif',
    cursor: 'not-allowed',
    opacity: 0.5,
  } as React.CSSProperties,
} as const;
