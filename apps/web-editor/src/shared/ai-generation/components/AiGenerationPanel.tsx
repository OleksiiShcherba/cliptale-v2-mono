import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { listModels } from '@/shared/ai-generation/api';
import type {
  AiCapability,
  AiGenerationContext,
  AiGroup,
  AiModel,
} from '@/shared/ai-generation/types';
import { useAiGeneration } from '@/shared/ai-generation/hooks/useAiGeneration';

import { aiGenerationPanelStyles as s, getPanelStyle } from './aiGenerationPanelStyles';
import {
  getFirstCapabilityForGroup,
  hasAllRequired,
  isCatalogEmpty,
  seedDefaults,
  splitPromptFromOptions,
} from './aiGenerationPanel.utils';
import { CapabilityTabs } from './CapabilityTabs';
import { GenerationOptionsForm } from './GenerationOptionsForm';
import { GenerationProgress } from './GenerationProgress';
import { ModelCard } from './ModelCard';

/** Props for the AiGenerationPanel component. */
export interface AiGenerationPanelProps {
  /**
   * Context identifying where the panel is used.
   * - `{ kind: 'project', id }` — editor, posts to `/projects/:id/ai/generate`
   * - `{ kind: 'draft',   id }` — wizard, posts to `/generation-drafts/:id/ai/generate`
   */
  context: AiGenerationContext;
  onClose?: () => void;
  onSwitchToAssets?: () => void;
  /**
   * When `true` the panel renders at a fixed 320 px width matching the editor
   * left sidebar so there is no layout shift when the user switches tabs.
   * When `false` (default) the panel fills available horizontal space up to
   * 720 px — used when the panel is embedded in the wizard gallery.
   */
  compact?: boolean;
}

/**
 * Orchestrator for the model-first AI Generation panel (Epic 9 / Ticket 9).
 *
 * Flow:
 *   1. Fetches `GET /ai/models` via React Query.
 *   2. User picks a capability (CapabilityTabs).
 *   3. User picks a model (ModelCard list).
 *   4. User fills the schema-driven form (GenerationOptionsForm).
 *   5. Submission posts `{ modelId, prompt?, options }` via useAiGeneration.
 *
 * The panel owns `optionValues` state keyed by field name, seeded from each
 * selected model's `field.default`s. When the user switches models, the state
 * is reseeded from the new schema. There are deliberately no per-model
 * branches — adding a model to AI_MODELS requires zero changes here.
 */
export function AiGenerationPanel({
  context,
  onClose,
  onSwitchToAssets,
  compact = false,
}: AiGenerationPanelProps): React.ReactElement {
  const queryClient = useQueryClient();
  const { submit, currentJob, isGenerating, error, reset } = useAiGeneration();

  const {
    data: catalog,
    isLoading: isCatalogLoading,
    isError: isCatalogError,
    refetch: refetchCatalog,
  } = useQuery({
    queryKey: ['ai-models'],
    queryFn: listModels,
  });

  const [activeGroup, setActiveGroup] = useState<AiGroup>('images');
  const [activeCapability, setActiveCapability] = useState<AiCapability>('text_to_image');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [optionValues, setOptionValues] = useState<Record<string, unknown>>({});

  const modelsForCapability = catalog?.[activeCapability] ?? [];

  const selectedModel: AiModel | null = useMemo(() => {
    if (!selectedModelId || !catalog) return null;
    for (const list of Object.values(catalog)) {
      const match = list.find((model) => model.id === selectedModelId);
      if (match) return match;
    }
    return null;
  }, [catalog, selectedModelId]);

  // Reset optionValues whenever the selected model changes. Seed with each
  // field's `default` so the form lands in a sensible starting state.
  useEffect(() => {
    if (!selectedModel) {
      setOptionValues({});
      return;
    }
    setOptionValues(seedDefaults(selectedModel.inputSchema));
  }, [selectedModel]);

  // When the user switches capability, clear the model selection so the
  // form doesn't render stale model state.
  const handleCapabilityChange = useCallback((next: AiCapability) => {
    setActiveCapability(next);
    setSelectedModelId(null);
  }, []);

  // When the user switches group, seed the active capability with the
  // first sub-category of that group and clear any stale model selection.
  const handleGroupChange = useCallback((next: AiGroup) => {
    setActiveGroup(next);
    setSelectedModelId(null);
    setActiveCapability(getFirstCapabilityForGroup(next));
  }, []);

  // Invalidate the asset list when a generation finishes so the new asset
  // appears in the Asset Browser / wizard gallery without a manual refresh.
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const status = currentJob?.status ?? null;
    if (prevStatusRef.current !== 'completed' && status === 'completed') {
      // Invalidate context-scoped asset query. Uses the same key shape as
      // AssetPickerField so the picker list also refreshes automatically.
      void queryClient.invalidateQueries({ queryKey: ['assets', context.kind, context.id] });
    }
    prevStatusRef.current = status;
  }, [currentJob?.status, context.kind, context.id, queryClient]);

  const canSubmit = !!selectedModel && !isGenerating && hasAllRequired(selectedModel, optionValues);

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !selectedModel) return;
    const { prompt, options } = splitPromptFromOptions(selectedModel, optionValues);
    void submit(context, { modelId: selectedModel.id, prompt, options });
  }, [canSubmit, selectedModel, optionValues, context, submit]);

  const handleReset = useCallback(() => {
    reset();
    if (selectedModel) {
      setOptionValues(seedDefaults(selectedModel.inputSchema));
    }
  }, [reset, selectedModel]);

  const jobStatus = currentJob?.status ?? null;
  const isComplete = jobStatus === 'completed';
  const isFailed = jobStatus === 'failed' || (!!error && !isGenerating);
  const isIdle = !isGenerating && !isComplete && !isFailed;

  return (
    <div style={getPanelStyle(compact)} data-testid="ai-generation-panel">
      <div style={s.header}>
        <h3 style={s.heading}>AI Generate</h3>
        {onClose && (
          <button type="button" style={s.closeButton} onClick={onClose} aria-label="Close panel">
            &times;
          </button>
        )}
      </div>

      <div style={s.body}>
        {isCatalogLoading && <p style={s.progressSpinner}>Loading models…</p>}

        {isCatalogError && (
          <div role="alert" style={s.inlineError}>
            <span>Could not load AI models.</span>
            <button
              type="button"
              style={s.secondaryButton}
              onClick={() => void refetchCatalog()}
            >
              Retry
            </button>
          </div>
        )}

        {!isCatalogLoading && !isCatalogError && catalog && isCatalogEmpty(catalog) && (
          <p style={s.emptyCatalog}>No AI models available. Check back later.</p>
        )}

        {!isCatalogLoading && !isCatalogError && catalog && !isCatalogEmpty(catalog) && (
          <>
            <CapabilityTabs
              activeGroup={activeGroup}
              activeCapability={activeCapability}
              onGroupChange={handleGroupChange}
              onCapabilityChange={handleCapabilityChange}
            />

            {isIdle && (
              <>
                <div style={s.modelList}>
                  {modelsForCapability.length === 0 && (
                    <p style={s.emptyCatalog}>No models for this capability.</p>
                  )}
                  {modelsForCapability.map((model) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      selected={selectedModelId === model.id}
                      onSelect={setSelectedModelId}
                    />
                  ))}
                </div>

                {selectedModel && (
                  <>
                    <GenerationOptionsForm
                      model={selectedModel}
                      values={optionValues}
                      onChange={setOptionValues}
                      context={context}
                    />
                    <button
                      type="button"
                      style={canSubmit ? s.generateButton : s.generateButtonDisabled}
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                    >
                      Generate
                    </button>
                  </>
                )}
              </>
            )}

            {isGenerating && currentJob && <GenerationProgress job={currentJob} />}
            {isGenerating && !currentJob && <p style={s.progressSpinner}>Submitting…</p>}

            {isComplete && (
              <div style={s.resultWrapper}>
                <p style={s.successText}>Generation complete!</p>
                <p style={s.assetAddedText}>Added to your Assets</p>
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
                <button type="button" style={s.secondaryButton} onClick={handleSubmit}>
                  Retry
                </button>
                <button type="button" style={s.secondaryButton} onClick={handleReset}>
                  Start Over
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

