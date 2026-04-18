import type { AiGenerationContext } from '@/shared/ai-generation/types';
import type { FalFieldSchema } from '@/shared/ai-generation/types';

import { aiGenerationPanelStyles as s } from './aiGenerationPanelStyles';
import { AssetPickerField } from './AssetPickerField';
import { VoicePickerField } from './VoicePickerField';

/** Props for the SchemaFieldInput dispatcher. */
export interface SchemaFieldInputProps {
  field: FalFieldSchema;
  value: unknown;
  onChange: (next: unknown) => void;
  /** Context forwarded to AssetPickerField for image_url / image_url_list / audio_url types. */
  context: AiGenerationContext;
}

/**
 * Schema-driven input dispatcher for a single FalFieldSchema entry.
 *
 * Branches on `field.type` to render the correct primitive. This is the ONLY
 * place that knows about field type → input mapping; everything above this
 * just iterates `model.inputSchema.fields` and delegates per-field render.
 *
 * Field defaults are seeded by the parent form, not here.
 */
export function SchemaFieldInput({ field, value, onChange, context }: SchemaFieldInputProps) {
  const labelNode = (
    <p style={s.fieldLabel}>
      {field.label}
      {field.required && (
        <span aria-hidden style={s.fieldRequiredMarker}>
          *
        </span>
      )}
    </p>
  );

  switch (field.type) {
    case 'image_url':
      return (
        <AssetPickerField
          context={context}
          mode="single"
          value={typeof value === 'string' ? value : undefined}
          onChange={onChange}
          label={field.label}
          required={field.required}
          description={field.description}
        />
      );

    case 'image_url_list':
      return (
        <AssetPickerField
          context={context}
          mode="multi"
          value={Array.isArray(value) ? (value as string[]) : undefined}
          onChange={onChange}
          label={field.label}
          required={field.required}
          description={field.description}
        />
      );

    case 'audio_url':
      return (
        <AssetPickerField
          context={context}
          mode="single"
          mediaType="audio"
          value={typeof value === 'string' ? value : undefined}
          onChange={onChange}
          label={field.label}
          required={field.required}
          description={field.description}
        />
      );

    case 'audio_upload':
      return (
        <div style={s.fieldWrapper}>
          {labelNode}
          <input
            type="file"
            aria-label={field.label}
            accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              onChange(file ?? undefined);
            }}
          />
          {field.description && <p style={s.fieldHelp}>{field.description}</p>}
        </div>
      );

    case 'string':
      return (
        <div style={s.fieldWrapper}>
          {labelNode}
          <input
            type="text"
            aria-label={field.label}
            style={s.textInput}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.description && <p style={s.fieldHelp}>{field.description}</p>}
        </div>
      );

    case 'text':
      return (
        <div style={s.fieldWrapper}>
          {labelNode}
          <textarea
            aria-label={field.label}
            style={s.textAreaInput}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.description && <p style={s.fieldHelp}>{field.description}</p>}
        </div>
      );

    case 'number':
      return (
        <div style={s.fieldWrapper}>
          {labelNode}
          <input
            type="number"
            aria-label={field.label}
            style={s.textInput}
            value={typeof value === 'number' ? value : ''}
            min={field.min}
            max={field.max}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                onChange(undefined);
                return;
              }
              const parsed = Number(raw);
              onChange(Number.isFinite(parsed) ? parsed : undefined);
            }}
          />
          {field.description && <p style={s.fieldHelp}>{field.description}</p>}
        </div>
      );

    case 'boolean':
      return (
        <div style={s.fieldWrapper}>
          <label style={s.checkboxRow}>
            <input
              type="checkbox"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span>
              {field.label}
              {field.required && (
                <span aria-hidden style={s.fieldRequiredMarker}>
                  *
                </span>
              )}
            </span>
          </label>
          {field.description && <p style={s.fieldHelp}>{field.description}</p>}
        </div>
      );

    case 'enum':
      return (
        <div style={s.fieldWrapper}>
          {labelNode}
          <select
            aria-label={field.label}
            style={s.optionSelect}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          >
            {!field.required && <option value="">— none —</option>}
            {(field.enum ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {field.description && <p style={s.fieldHelp}>{field.description}</p>}
        </div>
      );

    case 'string_list': {
      const list: string[] = Array.isArray(value) ? (value as string[]) : [];
      const updateAt = (index: number, next: string) => {
        const copy = [...list];
        copy[index] = next;
        onChange(copy);
      };
      const removeAt = (index: number) => {
        const copy = list.filter((_, i) => i !== index);
        onChange(copy.length > 0 ? copy : undefined);
      };
      const addEntry = () => onChange([...list, '']);

      return (
        <div style={s.fieldWrapper}>
          {labelNode}
          {list.map((entry, index) => (
            <div key={index} style={s.stringListRow}>
              <input
                type="text"
                aria-label={`${field.label} ${index + 1}`}
                style={s.textInput}
                value={entry}
                onChange={(e) => updateAt(index, e.target.value)}
              />
              <button
                type="button"
                style={s.stringListRemove}
                aria-label={`Remove ${field.label} ${index + 1}`}
                onClick={() => removeAt(index)}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" style={s.stringListAdd} onClick={addEntry}>
            + Add
          </button>
          {field.description && <p style={s.fieldHelp}>{field.description}</p>}
        </div>
      );
    }

    case 'voice_picker':
      return (
        <VoicePickerField
          value={typeof value === 'string' ? value : undefined}
          onChange={(voiceId) => onChange(voiceId)}
          label={field.label}
          required={field.required}
          description={field.description}
        />
      );

    default: {
      // Exhaustiveness guard — compile-time error if a new FalFieldType is
      // introduced without being handled here.
      const _exhaustive: never = field.type;
      return _exhaustive;
    }
  }
}
