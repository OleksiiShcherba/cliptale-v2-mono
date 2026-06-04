/**
 * Inspector — side panel that edits a selected generation block's optional model
 * parameters (T18 / AC-16).
 *
 * The Inspector reads the selected block from the canvas doc, resolves the catalog
 * model, and renders form controls for every OPTIONAL, non-modality field (fields
 * with modality are satisfied by canvas connections, not by the inspector).
 *
 * Each form control writes the new value back via `onBlockParamsChange(blockId, patch)`,
 * keyed by the catalog field name — matching the server-authoritative params contract
 * (generation block: supplied params keyed by catalog field name).
 *
 * The Inspector also renders a ContentInput when a content block is selected.
 */

import React from 'react';

import type { FlowBlock, FlowCanvas } from '@ai-video-editor/project-schema';
import { getModelById } from '../hooks/useFlowCanvas';
import { AI_MODELS } from '@ai-video-editor/api-contracts';
import type { FalFieldSchema } from '@ai-video-editor/api-contracts';
import { ContentInput } from './ContentInput';
import { VoicePickerField } from '@/shared/ai-generation/components/VoicePickerField';
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  SURFACE_ELEVATED,
  SURFACE_BASE,
  BORDER,
} from './flowNodeStyles';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InspectorProps = {
  /** The blockId of the selected block, or null for no selection. */
  selectedBlockId: string | null;
  /** The live canvas document. */
  canvas: FlowCanvas;
  /**
   * Called when the user edits a block's params.
   * @param blockId  The block being edited.
   * @param patch    Partial params to merge onto the block.
   */
  onBlockParamsChange: (blockId: string, patch: Record<string, unknown>) => void;
  /**
   * Called when the user picks a different model on a generation block. The page
   * routes this through useFlowCanvas.changeModel so handles rebuild and now-
   * incompatible input edges are pruned with a notice (AC-07).
   */
  onModelChange?: (blockId: string, modelId: string) => void;
};

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 12,
  background: SURFACE_ELEVATED,
  borderLeft: `1px solid ${BORDER}`,
  minWidth: 240,
  maxWidth: 320,
  overflowY: 'auto',
  fontFamily: 'Inter, sans-serif',
  color: TEXT_PRIMARY,
};

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: TEXT_SECONDARY,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: SURFACE_BASE,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_PRIMARY,
  fontSize: 12,
  padding: '4px 8px',
  fontFamily: 'Inter, sans-serif',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: TEXT_SECONDARY,
  marginBottom: 4,
};

// ── Main component ────────────────────────────────────────────────────────────

export function Inspector({
  selectedBlockId,
  canvas,
  onBlockParamsChange,
  onModelChange,
}: InspectorProps): React.ReactElement {
  if (!selectedBlockId) return <></>;

  const block = canvas.blocks.find((b) => b.blockId === selectedBlockId);
  if (!block) return <></>;

  const handleContentChange = (params: Record<string, unknown>) => {
    onBlockParamsChange(selectedBlockId, params);
  };

  if (block.type === 'content') {
    return (
      <div style={panelStyle} data-testid="inspector-panel">
        <div style={sectionHeaderStyle}>Content</div>
        <ContentInput key={selectedBlockId} block={block} onBlockParamsChange={handleContentChange} />
      </div>
    );
  }

  if (block.type === 'generation') {
    return (
      <div style={panelStyle} data-testid="inspector-panel">
        <div style={sectionHeaderStyle}>Model</div>
        <ModelPicker
          block={block}
          onModelChange={(modelId) => onModelChange?.(selectedBlockId, modelId)}
        />
        <div style={sectionHeaderStyle}>Parameters</div>
        <GenerationParamFields
          block={block}
          onParamChange={(fieldName, value) =>
            onBlockParamsChange(selectedBlockId, { [fieldName]: value })
          }
        />
      </div>
    );
  }

  return <></>;
}

// ── Model picker (AC-15 / AC-07) ──────────────────────────────────────────────

/** Catalog group → display label for the optgroups. */
const GROUP_LABELS: Record<string, string> = {
  images: 'Image',
  videos: 'Video',
  audio: 'Audio',
};

/**
 * The model `<select>` for a generation block. Choosing a different model routes
 * through `onModelChange` → useFlowCanvas.changeModel, which rebuilds the input
 * handles and prunes now-incompatible connections with a notice (AC-07).
 */
function ModelPicker({
  block,
  onModelChange,
}: {
  block: FlowBlock;
  onModelChange: (modelId: string) => void;
}): React.ReactElement {
  const modelId = (block.params.modelId as string | undefined) ?? '';

  // Group the catalog by media group so the list stays scannable.
  const groups: Record<string, typeof AI_MODELS[number][]> = {};
  for (const m of AI_MODELS) {
    (groups[m.group] ??= []).push(m);
  }

  return (
    <div style={fieldGroupStyle}>
      <label htmlFor="generation-model" style={labelStyle}>
        Model
      </label>
      <select
        id="generation-model"
        aria-label="Model"
        value={modelId}
        onChange={(e) => onModelChange(e.target.value)}
        style={inputStyle}
      >
        {Object.entries(groups).map(([group, models]) => (
          <optgroup key={group} label={GROUP_LABELS[group] ?? group}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

// ── Generation param fields ───────────────────────────────────────────────────

/**
 * Renders form controls for the optional, non-wirable fields of the selected model.
 * Fields with `modality` (wired via canvas connections) and required fields are excluded —
 * required fields are satisfied by connections, not by the inspector.
 * Fields in an `exclusiveGroup` are wirable so they are also excluded here.
 */
function GenerationParamFields({
  block,
  onParamChange,
}: {
  block: FlowBlock;
  onParamChange: (fieldName: string, value: unknown) => void;
}): React.ReactElement {
  const modelId = block.params.modelId as string | undefined;
  const model = getModelById(modelId);

  if (!model) {
    return <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>Select a model to see parameters.</div>;
  }

  // Show fields that are inspector-editable:
  //   - Not wired by canvas connections (no modality, no exclusiveGroup)
  //   - Not catalog-hidden (legacy fields like music_length_ms)
  //   - Either optional, OR required but of type 'voice_picker' (no connection
  //     modality exists for voices — the Inspector is the only way to set them).
  const optionalFields = model.inputSchema.fields.filter(
    (f) =>
      !f.modality &&
      !f.exclusiveGroup &&
      !f.hidden &&
      (!f.required || f.type === 'voice_picker'),
  );

  if (optionalFields.length === 0) {
    return <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>No optional parameters for this model.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {optionalFields.map((field) => (
        <ParamField
          key={field.name}
          field={field}
          value={block.params[field.name]}
          onParamChange={onParamChange}
        />
      ))}
    </div>
  );
}

// ── Individual param field ────────────────────────────────────────────────────

function ParamField({
  field,
  value,
  onParamChange,
}: {
  field: FalFieldSchema;
  value: unknown;
  onParamChange: (fieldName: string, value: unknown) => void;
}): React.ReactElement {
  const fieldId = `param-${field.name}`;
  const currentValue = value ?? field.default ?? '';

  if (field.type === 'enum' && field.enum) {
    return (
      <div style={fieldGroupStyle}>
        <label htmlFor={fieldId} style={labelStyle}>
          {field.label}
        </label>
        <select
          id={fieldId}
          value={String(currentValue)}
          onChange={(e) => onParamChange(field.name, e.target.value)}
          style={inputStyle}
          aria-label={field.label}
        >
          {field.enum.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === 'boolean') {
    return (
      <div style={{ ...fieldGroupStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input
          id={fieldId}
          type="checkbox"
          checked={currentValue === true || currentValue === 'true'}
          onChange={(e) => onParamChange(field.name, e.target.checked)}
          aria-label={field.label}
        />
        <label htmlFor={fieldId} style={labelStyle}>
          {field.label}
        </label>
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <div style={fieldGroupStyle}>
        <label htmlFor={fieldId} style={labelStyle}>
          {field.label}
        </label>
        <input
          id={fieldId}
          type="number"
          value={currentValue === '' || currentValue === undefined ? '' : String(currentValue)}
          min={field.min}
          max={field.max}
          onChange={(e) => {
            const num = e.target.value === '' ? undefined : Number(e.target.value);
            onParamChange(field.name, num);
          }}
          style={inputStyle}
          aria-label={field.label}
        />
      </div>
    );
  }

  if (field.type === 'voice_picker') {
    return (
      <VoicePickerField
        value={value as string | undefined}
        onChange={(v) => onParamChange(field.name, v)}
        label={field.label}
        required={field.required}
        description={field.description}
      />
    );
  }

  // Default: text
  return (
    <div style={fieldGroupStyle}>
      <label htmlFor={fieldId} style={labelStyle}>
        {field.label}
      </label>
      <input
        id={fieldId}
        type="text"
        value={String(currentValue)}
        onChange={(e) => onParamChange(field.name, e.target.value)}
        style={inputStyle}
        aria-label={field.label}
      />
    </div>
  );
}
