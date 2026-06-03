import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getContextAssets } from '@/shared/ai-generation/api';
import { useBulkFileStreamUrls } from '@/shared/hooks/useBulkFileStreamUrls';
import type { AiGenerationContext } from '@/shared/ai-generation/types';
import type { AssetSummary } from '@/shared/ai-generation/api';

import { aiGenerationPanelStyles as s } from './aiGenerationPanelStyles';

/** Picker modes supported by AssetPickerField. */
export type AssetPickerMode = 'single' | 'multi';

/** Media type filter for the asset picker. */
export type AssetPickerMediaType = 'image' | 'audio' | 'video';

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

  // Noun used in the picker's prompts/labels (image / audio / video).
  const mediaNoun = mediaType;

  const { data: assets = [], isLoading, isError } = useQuery({
    queryKey: ['assets', context.kind, 'id' in context ? context.id : 'library'],
    queryFn: () => getContextAssets(context),
    enabled: isPickerOpen,
  });

  const filteredAssets = assets.filter(
    (asset) => asset.contentType.startsWith(`${mediaType}/`) && asset.status === 'ready',
  );

  // Resolve small preview thumbnails for the listed assets in one bulk call (cached).
  // Empty until the picker is open and the list has loaded, so it is a no-op otherwise.
  const { urls: thumbUrls } = useBulkFileStreamUrls(filteredAssets.map((a) => a.id));

  const selectedIds: string[] =
    mode === 'multi'
      ? Array.isArray(value)
        ? value
        : []
      : typeof value === 'string' && value.length > 0
        ? [value]
        : [];

  const handlePick = (fileId: string) => {
    if (mode === 'single') {
      onChange(fileId);
      setIsPickerOpen(false);
      return;
    }
    const next = selectedIds.includes(fileId)
      ? selectedIds.filter((id) => id !== fileId)
      : [...selectedIds, fileId];
    onChange(next);
  };

  const handleClearSingle = () => onChange(undefined);
  const handleRemoveFromMulti = (fileId: string) => {
    const next = selectedIds.filter((id) => id !== fileId);
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
            {`Pick ${mediaNoun === 'video' ? 'a' : 'an'} ${mediaNoun} asset…`}
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
            {`+ Add ${mediaNoun} asset`}
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
                {`No ${mediaNoun} assets yet — upload one first.`}
              </p>
            )}
            {filteredAssets.map((asset) => {
              const isSelected = selectedIds.includes(asset.id);
              const thumb = asset.contentType.startsWith('image/') ? thumbUrls[asset.id] : undefined;
              return (
                <button
                  key={asset.id}
                  type="button"
                  aria-pressed={isSelected}
                  style={{
                    ...(isSelected ? s.assetPickerValue : s.assetPickerEmpty),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  onClick={() => handlePick(asset.id)}
                >
                  {thumb && (
                    <img
                      data-testid={`asset-thumb-${asset.id}`}
                      src={thumb}
                      alt=""
                      style={{
                        width: 32,
                        height: 32,
                        objectFit: 'cover',
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span>{asset.filename}</span>
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

function describeAsset(assets: AssetSummary[], fileId: string): string {
  const match = assets.find((asset) => asset.id === fileId);
  return match ? match.filename : fileId;
}
