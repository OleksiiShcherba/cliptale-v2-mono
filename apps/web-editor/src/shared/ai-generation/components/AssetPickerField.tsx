import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getContextAssets } from '@/shared/ai-generation/api';
import type { AiGenerationContext } from '@/shared/ai-generation/types';
import type { AssetSummary } from '@/shared/ai-generation/api';

import { aiGenerationPanelStyles as s } from './aiGenerationPanelStyles';

/** Picker modes supported by AssetPickerField. */
export type AssetPickerMode = 'single' | 'multi';

/** Media type filter for the asset picker. */
export type AssetPickerMediaType = 'image' | 'audio';

/** Props for the AssetPickerField component. */
export interface AssetPickerFieldProps {
  context: AiGenerationContext;
  mode: AssetPickerMode;
  value: string | string[] | undefined;
  onChange: (next: string | string[] | undefined) => void;
  label: string;
  required?: boolean;
  description?: string;
  /** Filter assets to this media type. Defaults to 'image'. */
  mediaType?: AssetPickerMediaType;
}

/**
 * Field wrapper that lets a schema-driven form select one or many assets.
 *
 * Fetches assets via `getContextAssets(context)` so it works in both project
 * and generation-draft contexts without a cross-feature import:
 * - project  → GET /projects/:id/assets
 * - draft    → GET /generation-drafts/:id/assets
 *
 * The BE's asset resolver turns the returned internal asset IDs into presigned
 * HTTPS URLs before the worker runs.
 */
export function AssetPickerField({
  context,
  mode,
  value,
  onChange,
  label,
  required,
  description,
  mediaType = 'image',
}: AssetPickerFieldProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const { data: assets = [], isLoading, isError } = useQuery({
    queryKey: ['assets', context.kind, context.id],
    queryFn: () => getContextAssets(context),
    enabled: isPickerOpen,
  });

  const filteredAssets = assets.filter(
    (asset) => asset.contentType.startsWith(`${mediaType}/`) && asset.status === 'ready',
  );

  const selectedIds: string[] =
    mode === 'multi'
      ? Array.isArray(value)
        ? value
        : []
      : typeof value === 'string' && value.length > 0
        ? [value]
        : [];

  const handlePick = (assetId: string) => {
    if (mode === 'single') {
      onChange(assetId);
      setIsPickerOpen(false);
      return;
    }
    const next = selectedIds.includes(assetId)
      ? selectedIds.filter((id) => id !== assetId)
      : [...selectedIds, assetId];
    onChange(next);
  };

  const handleClearSingle = () => onChange(undefined);
  const handleRemoveFromMulti = (assetId: string) => {
    const next = selectedIds.filter((id) => id !== assetId);
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div style={s.fieldWrapper}>
      <p style={s.fieldLabel}>
        {label}
        {required && (
          <span aria-hidden style={s.fieldRequiredMarker}>
            *
          </span>
        )}
      </p>

      {mode === 'single' &&
        (typeof value === 'string' && value.length > 0 ? (
          <div style={s.assetPickerValue}>
            <span>{describeAsset(assets, value)}</span>
            <button
              type="button"
              style={s.assetPickerChipRemove}
              aria-label={`Clear ${label}`}
              onClick={handleClearSingle}
            >
              ×
            </button>
          </div>
        ) : (
          <button
            type="button"
            style={s.assetPickerEmpty}
            onClick={() => setIsPickerOpen(true)}
          >
            {mediaType === 'audio' ? 'Pick an audio asset…' : 'Pick an image asset…'}
          </button>
        ))}

      {mode === 'multi' && (
        <>
          {selectedIds.length > 0 && (
            <div style={s.assetPickerChipList}>
              {selectedIds.map((id) => (
                <span key={id} style={s.assetPickerChip}>
                  {describeAsset(assets, id)}
                  <button
                    type="button"
                    style={s.assetPickerChipRemove}
                    aria-label={`Remove ${id}`}
                    onClick={() => handleRemoveFromMulti(id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            style={s.assetPickerPickButton}
            onClick={() => setIsPickerOpen(true)}
          >
            {mediaType === 'audio' ? '+ Add audio asset' : '+ Add image asset'}
          </button>
        </>
      )}

      {isPickerOpen && (
        <div role="dialog" aria-label={`${label} asset picker`} style={s.assetPickerValue}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            {isLoading && <p style={s.fieldHelp}>Loading assets…</p>}
            {isError && <p style={s.fieldHelp}>Could not load assets</p>}
            {!isLoading && !isError && filteredAssets.length === 0 && (
              <p style={s.fieldHelp}>
                {mediaType === 'audio'
                  ? 'No audio assets yet — upload one first.'
                  : 'No image assets yet — upload one first.'}
              </p>
            )}
            {filteredAssets.map((asset) => {
              const isSelected = selectedIds.includes(asset.id);
              return (
                <button
                  key={asset.id}
                  type="button"
                  aria-pressed={isSelected}
                  style={isSelected ? s.assetPickerValue : s.assetPickerEmpty}
                  onClick={() => handlePick(asset.id)}
                >
                  {asset.filename}
                </button>
              );
            })}
            <button
              type="button"
              style={s.assetPickerPickButton}
              onClick={() => setIsPickerOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {description && <p style={s.fieldHelp}>{description}</p>}
    </div>
  );
}

function describeAsset(assets: AssetSummary[], assetId: string): string {
  const match = assets.find((asset) => asset.id === assetId);
  return match ? match.filename : assetId;
}
