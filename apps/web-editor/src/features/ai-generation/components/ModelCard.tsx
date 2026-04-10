import type { FalModel } from '@/features/ai-generation/types';

import { aiGenerationPanelStyles } from './aiGenerationPanelStyles';

/** Props for the ModelCard pure component. */
export interface ModelCardProps {
  model: FalModel;
  selected: boolean;
  onSelect: (modelId: string) => void;
}

/**
 * Presentational card for picking a single fal.ai model.
 *
 * Reports selection via `onSelect(model.id)`. Owns no state. Used by
 * AiGenerationPanel to render the vertical list of models for the
 * currently active capability.
 */
export function ModelCard({ model, selected, onSelect }: ModelCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      style={
        selected ? aiGenerationPanelStyles.modelCardSelected : aiGenerationPanelStyles.modelCard
      }
      onClick={() => onSelect(model.id)}
    >
      <p style={aiGenerationPanelStyles.modelCardLabel}>{model.label}</p>
      <p style={aiGenerationPanelStyles.modelCardDescription}>{model.description}</p>
    </button>
  );
}
