/**
 * CostConfirmModal — the spend gate before a paid Generate (T20 / AC-01, AC-11).
 *
 * Pressing Generate fetches a best-effort estimate (ADR-0005) and shows this modal.
 * Confirm → the parent runs the charged Generate. Cancel → NO generate call, NO
 * charge, the flow unchanged (AC-11). The component is presentational: it owns no
 * api call; useFlowGeneration orchestrates estimate→confirm→generate around it.
 *
 * Follows the repo modal idiom (role="dialog" + aria-modal overlay, design tokens),
 * matching DeleteAssetDialog.
 */

import React from 'react';

import type { CostEstimate } from '../types';
import { BORDER, ERROR, PRIMARY, SURFACE_ELEVATED, TEXT_PRIMARY, TEXT_SECONDARY } from './flowNodeStyles';

export interface CostConfirmModalProps {
  estimate: CostEstimate;
  onConfirm: () => void;
  onCancel: () => void;
  /** True while the Generate request is in flight (confirm disabled). */
  submitting?: boolean;
  /**
   * A plain-language failure reason from a blocked Generate (422 gate / 409 stale
   * version). When set, the gate stays open and shows it so the Creator knows what
   * to fix (AC-03/05/06/17/F4).
   */
  error?: string | null;
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modal: React.CSSProperties = {
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: 16,
  padding: 24,
  width: 420,
  maxWidth: '95vw',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  fontFamily: 'Inter, sans-serif',
  color: TEXT_PRIMARY,
};

export function CostConfirmModal({
  estimate,
  onConfirm,
  onCancel,
  submitting = false,
  error = null,
}: CostConfirmModalProps): React.ReactElement {
  const { currency, amount } = estimate.estimate;

  const handleOverlayClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget && !submitting) onCancel();
  };

  return (
    <div
      style={overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-confirm-title"
      onClick={handleOverlayClick}
    >
      <div style={modal}>
        <h2 id="cost-confirm-title" style={{ fontSize: 18, margin: 0 }}>
          Confirm generation
        </h2>

        <p style={{ margin: 0, fontSize: 14, color: TEXT_SECONDARY }}>
          This will run a paid generation. Estimated cost:
        </p>

        <div style={{ fontSize: 28, fontWeight: 600 }} data-testid="cost-amount">
          {currency} {amount.toFixed(2)}
        </div>

        <p style={{ margin: 0, fontSize: 12, color: TEXT_SECONDARY }}>
          This is a best-effort estimate{estimate.bestEffort ? '' : ''}; the final charge
          may differ.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              margin: 0,
              padding: '8px 12px',
              borderRadius: 8,
              background: '#3B1D1D',
              color: '#FCA5A5',
              border: `1px solid ${ERROR}`,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Cancel generation"
            style={{
              background: 'transparent',
              border: `1px solid ${BORDER}`,
              color: TEXT_PRIMARY,
              borderRadius: 8,
              padding: '8px 16px',
              cursor: submitting ? 'default' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            aria-label="Generate"
            style={{
              background: PRIMARY,
              border: 'none',
              color: '#fff',
              borderRadius: 8,
              padding: '8px 16px',
              cursor: submitting ? 'default' : 'pointer',
            }}
          >
            {submitting ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
