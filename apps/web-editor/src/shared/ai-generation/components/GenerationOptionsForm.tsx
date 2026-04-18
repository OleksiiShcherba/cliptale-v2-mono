import type { AiGenerationContext, AiModel } from '@/shared/ai-generation/types';

import { aiGenerationPanelStyles as s } from './aiGenerationPanelStyles';
import { SchemaFieldInput } from './SchemaFieldInput';

/** Props for the GenerationOptionsForm component. */
export interface GenerationOptionsFormProps {
  /** The selected model whose schema drives the form. */
  model: AiModel;
  /** Controlled option values keyed by field name. */
  values: Record<string, unknown>;
  /** Callback fired with the merged next values on any field change. */
  onChange: (next: Record<string, unknown>) => void;
  /** Context forwarded to AssetPickerField for image_url / image_url_list / audio_url fields. */
  context: AiGenerationContext;
}

/**
 * Generic, schema-driven options form.
 *
 * Iterates `model.inputSchema.fields` and renders one `<SchemaFieldInput />`
 * per entry. There are deliberately no per-model `if (modelId === 'x')`
 * branches: adding a new model to the fal.ai catalog requires zero changes
 * here. Model-specific validation (e.g. kling-o3 prompt XOR multi_prompt) is
 * enforced server-side, not in this form.
 *
 * The parent owns `values` state; this component is fully controlled.
 */
export function GenerationOptionsForm({
  model,
  values,
  onChange,
  context,
}: GenerationOptionsFormProps) {
  return (
    <div style={s.optionsGroup}>
      {model.inputSchema.fields.map((field) => (
        <SchemaFieldInput
          key={field.name}
          field={field}
          value={values[field.name]}
          context={context}
          onChange={(next) => {
            const merged = { ...values };
            if (next === undefined) {
              delete merged[field.name];
            } else {
              merged[field.name] = next;
            }
            onChange(merged);
          }}
        />
      ))}
    </div>
  );
}
