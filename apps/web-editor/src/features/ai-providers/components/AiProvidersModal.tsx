import React, { useState } from 'react';

import { useAiProviders } from '@/features/ai-providers/hooks/useAiProviders';
import { PROVIDER_CATALOG } from '@/features/ai-providers/types';

import { ProviderCard } from './ProviderCard';
import { aiProvidersModalStyles as styles, TEXT_PRIMARY } from './aiProvidersModalStyles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for the AI Providers settings modal. */
export interface AiProvidersModalProps {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// AiProvidersModal
// ---------------------------------------------------------------------------

/**
 * 560px centered modal for managing AI provider API key configurations.
 *
 * Lists all 8 providers from `PROVIDER_CATALOG`. Each provider shows its
 * configuration state (unconfigured / connected + active/inactive) and
 * allows adding, updating, or deleting API keys.
 */
export function AiProvidersModal({ onClose }: AiProvidersModalProps): React.ReactElement {
  const {
    providers,
    isLoading,
    error,
    addProvider,
    updateProvider,
    deleteProvider,
    isMutating,
  } = useAiProviders();

  const [isHoveringClose, setIsHoveringClose] = useState(false);

  return (
    <>
      {/* Backdrop */}
      <div
        style={styles.backdrop}
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI Providers"
        style={styles.modal}
      >
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.heading}>AI Providers</h2>
          <button
            type="button"
            style={
              isHoveringClose
                ? { ...styles.closeButton, color: TEXT_PRIMARY }
                : styles.closeButton
            }
            onClick={onClose}
            onMouseEnter={() => setIsHoveringClose(true)}
            onMouseLeave={() => setIsHoveringClose(false)}
            aria-label="Close AI providers modal"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {isLoading && (
            <p style={styles.loadingText}>Loading providers…</p>
          )}

          {error && (
            <p style={styles.errorText} role="alert">{error}</p>
          )}

          {!isLoading &&
            PROVIDER_CATALOG.map((info) => {
              const summary = providers.find((p) => p.provider === info.provider);
              return (
                <ProviderCard
                  key={info.provider}
                  info={info}
                  summary={summary}
                  onAdd={addProvider}
                  onUpdate={updateProvider}
                  onDelete={deleteProvider}
                  isMutating={isMutating}
                />
              );
            })}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <span style={styles.footerLink}>
            Need help? Check provider documentation.
          </span>
        </div>
      </div>
    </>
  );
}
