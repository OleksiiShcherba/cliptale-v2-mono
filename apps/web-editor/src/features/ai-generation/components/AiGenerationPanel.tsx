import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { listProviders } from '@/features/ai-providers/api';
import { PROVIDER_CATALOG } from '@/features/ai-providers/types';
import type { ProviderSummary } from '@/features/ai-providers/types';
import type {
  AiGenerationType,
  ImageGenOptions,
  VideoGenOptions,
  AudioGenOptions,
} from '@/features/ai-generation/types';
import { useAiGeneration } from '@/features/ai-generation/hooks/useAiGeneration';

import { aiGenerationPanelStyles as s } from './aiGenerationPanelStyles';
import { GenerationTypeSelector } from './GenerationTypeSelector';
import { GenerationOptionsForm } from './GenerationOptionsForm';
import { GenerationProgress } from './GenerationProgress';

/** Props for the AiGenerationPanel component. */
export interface AiGenerationPanelProps {
  /** Project ID for the current editor session. */
  projectId: string;
  /** Optional callback to close the panel. */
  onClose?: () => void;
  /** Optional callback when the user wants to open the AI Providers settings. */
  onOpenProviders?: () => void;
  /** When true the providers modal is open — providers are refetched when this flips to false. */
  isProvidersModalOpen?: boolean;
  /** Optional callback to switch the sidebar to the Assets tab — called when user clicks "View in Assets". */
  onSwitchToAssets?: () => void;
}

const DEFAULT_IMAGE_OPTIONS: ImageGenOptions = { size: '1024x1024', style: 'vivid' };
const DEFAULT_VIDEO_OPTIONS: VideoGenOptions = { duration: 5, aspectRatio: '16:9' };
const DEFAULT_AUDIO_OPTIONS: AudioGenOptions = { type: 'music', duration: 10 };

/** Returns default options for the given generation type. */
function defaultOptionsForType(
  type: AiGenerationType,
): ImageGenOptions | VideoGenOptions | AudioGenOptions {
  if (type === 'video') return { ...DEFAULT_VIDEO_OPTIONS };
  if (type === 'audio') return { ...DEFAULT_AUDIO_OPTIONS };
  return { ...DEFAULT_IMAGE_OPTIONS };
}

/**
 * Sidebar panel for submitting AI generation requests.
 *
 * Displays four phases: idle (form), generating (progress), complete (success), failed (error).
 * Checks configured providers to disable generation when none are available for the selected type.
 */
export function AiGenerationPanel({
  projectId,
  onClose,
  onOpenProviders,
  isProvidersModalOpen,
  onSwitchToAssets,
}: AiGenerationPanelProps): React.ReactElement {
  const { submit, currentJob, isGenerating, error, reset } = useAiGeneration();
  const queryClient = useQueryClient();

  const [type, setType] = useState<AiGenerationType>('image');
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<ImageGenOptions | VideoGenOptions | AudioGenOptions>(
    DEFAULT_IMAGE_OPTIONS,
  );
  const [providers, setProviders] = useState<ProviderSummary[]>([]);

  // Invalidate asset list when generation completes so the new asset appears in the browser
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const status = currentJob?.status ?? null;
    if (prevStatusRef.current !== 'completed' && status === 'completed') {
      void queryClient.invalidateQueries({ queryKey: ['assets', projectId] });
    }
    prevStatusRef.current = status;
  }, [currentJob?.status, projectId, queryClient]);

  // Fetch configured providers on mount and when the providers modal closes
  useEffect(() => {
    if (isProvidersModalOpen) return;
    listProviders()
      .then(setProviders)
      .catch(() => {
        /* provider fetch is best-effort */
      });
  }, [isProvidersModalOpen]);

  // Reset options when type changes
  const handleTypeChange = useCallback((newType: AiGenerationType) => {
    setType(newType);
    setOptions(defaultOptionsForType(newType));
  }, []);

  // Check if any provider supports the selected type
  const hasProviderForType = providers.some((p) => {
    const info = PROVIDER_CATALOG.find((c) => c.provider === p.provider);
    return info?.supportedTypes.includes(type) && p.isActive;
  });

  const canGenerate = prompt.trim().length > 0 && hasProviderForType && !isGenerating;

  const handleSubmit = useCallback(() => {
    if (!canGenerate) return;
    void submit(projectId, { type, prompt: prompt.trim(), options });
  }, [canGenerate, submit, projectId, type, prompt, options]);

  const handleReset = useCallback(() => {
    reset();
    setPrompt('');
  }, [reset]);

  const jobStatus = currentJob?.status ?? null;
  const isIdle = !isGenerating && jobStatus !== 'completed' && jobStatus !== 'failed' && !error;
  const isComplete = jobStatus === 'completed';
  const isFailed = jobStatus === 'failed' || (!!error && !isGenerating);

  return (
    <div style={s.panel} data-testid="ai-generation-panel">
      {/* Header */}
      <div style={s.header}>
        <h3 style={s.heading}>AI Generate</h3>
        {onClose && (
          <button type="button" style={s.closeButton} onClick={onClose} aria-label="Close panel">
            &times;
          </button>
        )}
      </div>

      {/* Body */}
      <div style={s.body}>
        {isIdle && (
          <IdlePhase
            type={type}
            onTypeChange={handleTypeChange}
            prompt={prompt}
            onPromptChange={setPrompt}
            options={options}
            onOptionsChange={setOptions}
            canGenerate={canGenerate}
            hasProviderForType={hasProviderForType}
            onGenerate={handleSubmit}
            onOpenProviders={onOpenProviders}
          />
        )}

        {isGenerating && currentJob && <GenerationProgress job={currentJob} />}
        {isGenerating && !currentJob && <p style={s.progressSpinner}>Submitting...</p>}

        {isComplete && (
          <div style={s.resultWrapper}>
            <p style={s.successText}>Generation complete!</p>
            <p style={s.assetAddedText}>
              Added to your Assets
            </p>
            {onSwitchToAssets && (
              <button
                type="button"
                style={s.generateButton}
                onClick={() => {
                  onSwitchToAssets();
                  handleReset();
                }}
              >
                View in Assets
              </button>
            )}
            <button type="button" style={s.secondaryButton} onClick={handleReset}>
              Generate Another
            </button>
          </div>
        )}

        {isFailed && (
          <div style={s.resultWrapper}>
            <p style={s.errorText}>
              {currentJob?.errorMessage ?? error ?? 'Generation failed'}
            </p>
            <button type="button" style={s.secondaryButton} onClick={handleReset}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Idle phase sub-component (keeps main component under 300 lines) ───────

interface IdlePhaseProps {
  type: AiGenerationType;
  onTypeChange: (t: AiGenerationType) => void;
  prompt: string;
  onPromptChange: (v: string) => void;
  options: ImageGenOptions | VideoGenOptions | AudioGenOptions;
  onOptionsChange: (o: ImageGenOptions | VideoGenOptions | AudioGenOptions) => void;
  canGenerate: boolean;
  hasProviderForType: boolean;
  onGenerate: () => void;
  onOpenProviders?: () => void;
}

/** Idle phase content — type selector, prompt input, options, and generate button. */
function IdlePhase({
  type,
  onTypeChange,
  prompt,
  onPromptChange,
  options,
  onOptionsChange,
  canGenerate,
  hasProviderForType,
  onGenerate,
  onOpenProviders,
}: IdlePhaseProps): React.ReactElement {
  return (
    <>
      <GenerationTypeSelector selected={type} onSelect={onTypeChange} />

      <textarea
        style={s.promptTextarea}
        placeholder="Describe what you want to generate..."
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value.slice(0, 1000))}
        maxLength={1000}
        aria-label="Generation prompt"
      />
      <p style={s.charCount}>{prompt.length}/1000</p>

      <GenerationOptionsForm type={type} options={options} onChange={onOptionsChange} />

      {!hasProviderForType && (
        <p style={s.disabledNotice}>
          No provider configured for {type}.{' '}
          {onOpenProviders ? (
            <button type="button" style={s.linkButton} onClick={onOpenProviders}>
              Configure in AI Providers
            </button>
          ) : (
            'Configure in AI Providers settings.'
          )}
        </p>
      )}

      <button
        type="button"
        style={canGenerate ? s.generateButton : s.generateButtonDisabled}
        onClick={onGenerate}
        disabled={!canGenerate}
      >
        Generate
      </button>
    </>
  );
}
