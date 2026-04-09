import React, { useState } from 'react';

import type { AiProvider, ProviderInfo, ProviderSummary } from '@/features/ai-providers/types';

import { aiProvidersModalStyles as styles, TEXT_PRIMARY } from './aiProvidersModalStyles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for a single provider card in the AI Providers modal. */
export interface ProviderCardProps {
  info: ProviderInfo;
  /** Server state for this provider — undefined if not configured. */
  summary: ProviderSummary | undefined;
  onAdd: (provider: AiProvider, apiKey: string) => Promise<void>;
  onUpdate: (provider: AiProvider, updates: { apiKey?: string; isActive?: boolean }) => Promise<void>;
  onDelete: (provider: AiProvider) => Promise<void>;
  isMutating: boolean;
}

// ---------------------------------------------------------------------------
// ProviderCard
// ---------------------------------------------------------------------------

/**
 * A single provider row in the AI Providers modal.
 *
 * Not-configured state: shows an API key input + Save button.
 * Configured state: shows Connected badge, active toggle, Update Key expand,
 * and Delete button with confirmation.
 */
export function ProviderCard({
  info,
  summary,
  onAdd,
  onUpdate,
  onDelete,
  isMutating,
}: ProviderCardProps): React.ReactElement {
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isConfigured = summary?.isConfigured ?? false;
  const isActive = summary?.isActive ?? false;

  const handleSave = async (): Promise<void> => {
    if (!apiKey.trim()) return;
    if (isConfigured) {
      await onUpdate(info.provider, { apiKey });
    } else {
      await onAdd(info.provider, apiKey);
    }
    setApiKey('');
    setShowKeyInput(false);
    setShowPassword(false);
  };

  const handleToggleActive = async (): Promise<void> => {
    await onUpdate(info.provider, { isActive: !isActive });
  };

  const handleDelete = async (): Promise<void> => {
    await onDelete(info.provider);
    setConfirmDelete(false);
  };

  /** First two letters of provider name as icon placeholder. */
  const iconText = info.name.slice(0, 2).toUpperCase();

  return (
    <div style={styles.card} data-testid={`provider-card-${info.provider}`}>
      {/* Top row: icon + info + status */}
      <div style={styles.cardHeader}>
        <div style={styles.providerIcon} aria-hidden="true">
          {iconText}
        </div>

        <div style={styles.cardInfo}>
          <p style={styles.providerName}>{info.name}</p>
          <p style={styles.providerDescription}>{info.description}</p>
          <div style={styles.badgeRow}>
            {info.supportedTypes.map((t) => (
              <span key={t} style={styles.typeBadge}>{t}</span>
            ))}
          </div>
        </div>

        <div style={styles.cardActions}>
          {isConfigured && (
            <>
              <span style={styles.connectedBadge}>Connected</span>
              <button
                type="button"
                style={isActive ? styles.toggleButtonActive : styles.toggleButton}
                onClick={() => void handleToggleActive()}
                disabled={isMutating}
                aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${info.name}`}
              >
                {isActive ? 'Active' : 'Inactive'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Key input — shown for unconfigured providers or when "Update Key" is clicked */}
      {(!isConfigured || showKeyInput) && (
        <div style={styles.keyInputRow}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={isConfigured ? 'Enter new API key' : 'Enter API key'}
            style={styles.keyInput}
            aria-label={`API key for ${info.name}`}
          />
          <button
            type="button"
            style={{ ...styles.secondaryButton, padding: '4px 6px', fontSize: '11px' }}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide API key' : 'Show API key'}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
          <button
            type="button"
            style={apiKey.trim() && !isMutating ? styles.saveButton : styles.saveButtonDisabled}
            disabled={!apiKey.trim() || isMutating}
            onClick={() => void handleSave()}
          >
            Save
          </button>
          {isConfigured && (
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => { setShowKeyInput(false); setApiKey(''); setShowPassword(false); }}
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Action buttons for configured providers */}
      {isConfigured && !showKeyInput && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => setShowKeyInput(true)}
          >
            Update Key
          </button>
          {!confirmDelete ? (
            <button
              type="button"
              style={styles.deleteButton}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          ) : (
            <>
              <button
                type="button"
                style={{ ...styles.deleteButton, color: TEXT_PRIMARY, background: '#EF4444' }}
                onClick={() => void handleDelete()}
                disabled={isMutating}
              >
                Confirm
              </button>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
