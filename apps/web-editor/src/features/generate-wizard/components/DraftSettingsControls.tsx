import React, { useCallback, useEffect, useState } from 'react';

import type {
  DraftAspectRatio,
  DraftSettings,
  DraftStyleKey,
  PromptDoc,
} from '@/features/generate-wizard/types';
import { getDraftSettings } from '@/features/generate-wizard/utils';

import { wizardPageStyles as s } from './generateWizardPage.styles';

const VIDEO_LENGTH_PRESETS: Array<{ value: number; label: string }> = [
  { value: 15, label: '15 sec' },
  { value: 30, label: '30 sec' },
  { value: 60, label: '60 sec' },
  { value: 90, label: '90 sec' },
  { value: 120, label: '120 sec' },
];

const MIN_VIDEO_LENGTH_SECONDS = 1;
const MAX_VIDEO_LENGTH_SECONDS = 600;

const ASPECT_RATIO_OPTIONS: DraftAspectRatio[] = ['16:9', '9:16', '1:1'];

const STYLE_OPTIONS: Array<{ value: DraftStyleKey; label: string }> = [
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'documentary', label: 'Documentary' },
  { value: 'social', label: 'Social' },
  { value: 'product', label: 'Product' },
  { value: 'minimal', label: 'Minimal' },
];

export type DraftSettingsControlsProps = {
  doc: PromptDoc;
  onChange: (next: PromptDoc) => void;
};

export function DraftSettingsControls({
  doc,
  onChange,
}: DraftSettingsControlsProps): React.ReactElement {
  const [settings, setSettings] = useState<DraftSettings>(() => getDraftSettings(doc));
  const [lengthInputValue, setLengthInputValue] = useState(() =>
    String(getDraftSettings(doc).videoLengthSeconds),
  );

  useEffect(() => {
    const nextSettings = getDraftSettings(doc);
    setSettings(nextSettings);
    setLengthInputValue(String(nextSettings.videoLengthSeconds));
  }, [doc]);

  const updateSettings = useCallback(
    (patch: Partial<DraftSettings>): void => {
      setSettings((current) => {
        const nextSettings = {
          ...current,
          ...patch,
        };

        onChange({
          ...doc,
          settings: nextSettings,
        });
        if (patch.videoLengthSeconds !== undefined) {
          setLengthInputValue(String(patch.videoLengthSeconds));
        }

        return nextSettings;
      });
    },
    [doc, onChange],
  );

  return (
    <section style={s.settingsPanel} aria-label="Draft settings">
      <label style={s.settingsGroup}>
        <span style={s.settingsLabel}>Length</span>
        <input
          type="number"
          aria-label="Video length"
          min={MIN_VIDEO_LENGTH_SECONDS}
          max={MAX_VIDEO_LENGTH_SECONDS}
          step={1}
          value={lengthInputValue}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setLengthInputValue(nextValue);
            const nextSeconds = Number(nextValue);
            if (!Number.isInteger(nextSeconds)) return;
            if (
              nextSeconds < MIN_VIDEO_LENGTH_SECONDS ||
              nextSeconds > MAX_VIDEO_LENGTH_SECONDS
            ) {
              return;
            }
            updateSettings({ videoLengthSeconds: nextSeconds });
          }}
          onBlur={() => setLengthInputValue(String(settings.videoLengthSeconds))}
          style={s.settingsInput}
        />
        <div style={s.lengthPresetGroup} role="group" aria-label="Length presets">
          {VIDEO_LENGTH_PRESETS.map((option) => {
            const selected = settings.videoLengthSeconds === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                style={
                  selected
                    ? { ...s.lengthPresetButton, ...s.segmentButtonActive }
                    : s.lengthPresetButton
                }
                onClick={() => updateSettings({ videoLengthSeconds: option.value })}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </label>

      <div style={s.settingsGroup}>
        <span style={s.settingsLabel}>Aspect</span>
        <div style={s.segmentGroup} role="group" aria-label="Aspect ratio">
          {ASPECT_RATIO_OPTIONS.map((aspectRatio) => {
            const selected = settings.aspectRatio === aspectRatio;
            return (
              <button
                key={aspectRatio}
                type="button"
                aria-pressed={selected}
                style={
                  selected
                    ? { ...s.segmentButton, ...s.segmentButtonActive }
                    : s.segmentButton
                }
                onClick={() => updateSettings({ aspectRatio })}
              >
                {aspectRatio}
              </button>
            );
          })}
        </div>
      </div>

      <label style={s.settingsGroup}>
        <span style={s.settingsLabel}>Style</span>
        <select
          aria-label="Style"
          value={settings.styleKey}
          onChange={(event) =>
            updateSettings({ styleKey: event.currentTarget.value as DraftStyleKey })
          }
          style={s.settingsSelect}
        >
          {STYLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
