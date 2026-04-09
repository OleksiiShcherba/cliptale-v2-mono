import React from 'react';

import type { AiGenerationType } from '@/features/ai-generation/types';

import { aiGenerationPanelStyles as s } from './aiGenerationPanelStyles';

/** Props for the GenerationTypeSelector component. */
export interface GenerationTypeSelectorProps {
  /** Currently selected generation type. */
  selected: AiGenerationType;
  /** Callback when the user selects a different type. */
  onSelect: (type: AiGenerationType) => void;
}

const TYPE_OPTIONS: { type: AiGenerationType; icon: string; label: string }[] = [
  { type: 'image', icon: '\uD83D\uDDBC\uFE0F', label: 'Image' },
  { type: 'video', icon: '\uD83C\uDFAC', label: 'Video' },
  { type: 'audio', icon: '\uD83C\uDFB5', label: 'Audio' },
];

/**
 * Three-button type selector for choosing between Image, Video, and Audio generation.
 * Selected state uses primary background; unselected uses surface-elevated.
 */
export function GenerationTypeSelector({
  selected,
  onSelect,
}: GenerationTypeSelectorProps): React.ReactElement {
  return (
    <div style={s.typeRow}>
      {TYPE_OPTIONS.map(({ type, icon, label }) => (
        <button
          key={type}
          type="button"
          style={selected === type ? s.typeButtonSelected : s.typeButton}
          onClick={() => onSelect(type)}
          aria-pressed={selected === type}
          aria-label={`Generate ${label}`}
        >
          <span style={s.typeIcon}>{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}
