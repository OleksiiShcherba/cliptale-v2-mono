import React from 'react';

import type {
  AiGenerationType,
  ImageGenOptions,
  VideoGenOptions,
  AudioGenOptions,
} from '@/features/ai-generation/types';

import { aiGenerationPanelStyles as s } from './aiGenerationPanelStyles';

/** Props for the GenerationOptionsForm component. */
export interface GenerationOptionsFormProps {
  /** Currently selected generation type — determines which options to render. */
  type: AiGenerationType;
  /** Current options object. */
  options: ImageGenOptions | VideoGenOptions | AudioGenOptions;
  /** Callback when any option value changes. */
  onChange: (options: ImageGenOptions | VideoGenOptions | AudioGenOptions) => void;
}

/**
 * Renders type-specific generation options.
 *
 * - Image: size dropdown, style dropdown.
 * - Video: duration dropdown, aspect ratio dropdown.
 * - Audio: type dropdown, duration slider (1–60s).
 */
export function GenerationOptionsForm({
  type,
  options,
  onChange,
}: GenerationOptionsFormProps): React.ReactElement | null {
  if (type === 'image') {
    const opts = options as ImageGenOptions;
    return (
      <div style={s.optionsGroup}>
        <label style={s.optionLabel}>
          Size
          <select
            style={s.optionSelect}
            value={opts.size ?? '1024x1024'}
            onChange={(e) => onChange({ ...opts, size: e.target.value as ImageGenOptions['size'] })}
          >
            <option value="1024x1024">1024 x 1024</option>
            <option value="1024x1792">1024 x 1792</option>
            <option value="1792x1024">1792 x 1024</option>
          </select>
        </label>
        <label style={s.optionLabel}>
          Style
          <select
            style={s.optionSelect}
            value={opts.style ?? 'vivid'}
            onChange={(e) => onChange({ ...opts, style: e.target.value as ImageGenOptions['style'] })}
          >
            <option value="vivid">Vivid</option>
            <option value="natural">Natural</option>
          </select>
        </label>
      </div>
    );
  }

  if (type === 'video') {
    const opts = options as VideoGenOptions;
    return (
      <div style={s.optionsGroup}>
        <label style={s.optionLabel}>
          Duration
          <select
            style={s.optionSelect}
            value={String(opts.duration ?? 5)}
            onChange={(e) => onChange({ ...opts, duration: Number(e.target.value) as VideoGenOptions['duration'] })}
          >
            <option value="3">3 seconds</option>
            <option value="5">5 seconds</option>
            <option value="10">10 seconds</option>
          </select>
        </label>
        <label style={s.optionLabel}>
          Aspect Ratio
          <select
            style={s.optionSelect}
            value={opts.aspectRatio ?? '16:9'}
            onChange={(e) => onChange({ ...opts, aspectRatio: e.target.value as VideoGenOptions['aspectRatio'] })}
          >
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </select>
        </label>
      </div>
    );
  }

  if (type === 'audio') {
    const opts = options as AudioGenOptions;
    return (
      <div style={s.optionsGroup}>
        <label style={s.optionLabel}>
          Type
          <select
            style={s.optionSelect}
            value={opts.type ?? 'music'}
            onChange={(e) => onChange({ ...opts, type: e.target.value as AudioGenOptions['type'] })}
          >
            <option value="music">Music</option>
            <option value="sfx">Sound Effect</option>
            <option value="voice">Voice</option>
          </select>
        </label>
        <label style={s.optionLabel}>
          Duration: {opts.duration ?? 10}s
          <input
            type="range"
            min={1}
            max={60}
            step={1}
            value={opts.duration ?? 10}
            onChange={(e) => onChange({ ...opts, duration: Number(e.target.value) })}
            style={s.optionSlider}
          />
        </label>
      </div>
    );
  }

  return null;
}
