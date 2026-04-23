/**
 * Wizard footer — Cancel (delete draft) + Next (flush + navigate).
 *
 * CancelConfirmDialog is extracted to ./CancelConfirmDialog.tsx per §9.7
 * (300-line file cap).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { deleteDraft } from '@/features/generate-wizard/api';
import { hasAnyContent } from '@/features/generate-wizard/utils';

import { CancelConfirmDialog } from './CancelConfirmDialog';
import type { PromptDoc } from '../types';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const TEXT_SECONDARY = '#8A8AA0';
const TEXT_PRIMARY = '#F0F0FA';
const PRIMARY = '#7C3AED';
const PRIMARY_DARK = '#5B21B6';
const ERROR = '#EF4444';

// Typography — label token (design-guide §3): 12px / 500 / 16px
const LABEL_FONT_SIZE = '12px';
const LABEL_FONT_WEIGHT = 500;
const LABEL_LINE_HEIGHT = '16px';

// ---------------------------------------------------------------------------
// WizardFooter
// ---------------------------------------------------------------------------

export interface WizardFooterProps {
  draftId: string | null;
  doc: PromptDoc;
  flush: () => Promise<void>;
}

/**
 * Footer bar with Cancel (opens confirm dialog → delete draft + navigate) and
 * Next (flush + navigate to /generate/road-map) buttons.
 */
export function WizardFooter({ draftId, doc, flush }: WizardFooterProps): React.ReactElement {
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
  const [flushError, setFlushError] = useState<string | null>(null);
  const [isCancelHovered, setIsCancelHovered] = useState(false);
  const [isNextHovered, setIsNextHovered] = useState(false);
  const [isNextActive, setIsNextActive] = useState(false);
  // Guard against setState-after-unmount for the async flush+navigate path.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // §7 — server state mutation wrapped in React Query for consistency with
  // createMutation / updateMutation in useGenerationDraft.
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDraft(id),
  });

  const isContentPresent = hasAnyContent(doc);

  // ── Cancel handlers ────────────────────────────────────────────────────────

  const handleCancelClick = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const handleKeepEditing = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  const handleDiscard = useCallback(async () => {
    setIsDialogOpen(false);
    if (draftId !== null) {
      // Best-effort delete — navigate regardless of result.
      try {
        await deleteMutation.mutateAsync(draftId);
      } catch {
        // Intentionally swallowed: user-initiated discard; network errors
        // on delete should not block navigation.
      }
    }
    navigate('/editor');
  }, [draftId, deleteMutation, navigate]);

  // ── Next handlers ──────────────────────────────────────────────────────────

  const handleNextClick = useCallback(async () => {
    if (!isContentPresent || isFlushing) return;
    setFlushError(null);
    setIsFlushing(true);
    try {
      await flush();
      if (isMountedRef.current) {
        // Navigate to the storyboard page for this draft if we have an ID,
        // otherwise fall back to the road-map placeholder.
        const destination = draftId != null ? `/storyboard/${draftId}` : '/generate/road-map';
        navigate(destination);
      }
    } catch {
      if (isMountedRef.current) {
        setIsFlushing(false);
        setFlushError('Could not save your draft. Please try again.');
      }
    }
  }, [isContentPresent, isFlushing, flush, navigate, draftId]);

  // ── Styles ─────────────────────────────────────────────────────────────────

  const cancelStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    padding: '0 12px',
    height: '40px',
    fontSize: LABEL_FONT_SIZE,
    fontWeight: LABEL_FONT_WEIGHT,
    lineHeight: LABEL_LINE_HEIGHT,
    color: isCancelHovered ? TEXT_PRIMARY : TEXT_SECONDARY,
    cursor: 'pointer',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    transition: 'color 0.15s',
  };

  const nextStyle: React.CSSProperties = {
    background: isNextHovered ? PRIMARY_DARK : PRIMARY,
    border: 'none',
    padding: '0 24px',
    height: '40px',
    fontSize: LABEL_FONT_SIZE,
    fontWeight: LABEL_FONT_WEIGHT,
    lineHeight: LABEL_LINE_HEIGHT,
    color: '#FFFFFF',
    cursor: isContentPresent && !isFlushing ? 'pointer' : 'not-allowed',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    opacity: isContentPresent && !isFlushing ? 1 : 0.5,
    transform: isNextActive ? 'scale(0.98)' : 'scale(1)',
    transition: 'background 0.15s, opacity 0.15s, transform 0.1s',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };

  return (
    <>
      {isDialogOpen && (
        <CancelConfirmDialog
          onKeepEditing={handleKeepEditing}
          onDiscard={handleDiscard}
        />
      )}

      {/* Footer container is the parent <footer> in GenerateWizardPage; we
          render only our buttons + optional error text here. */}
      <div style={footerInnerStyles.wrapper}>
        {flushError && (
          <span role="alert" style={footerInnerStyles.error}>
            {flushError}
          </span>
        )}
        <button
          type="button"
          onClick={handleCancelClick}
          onMouseEnter={() => setIsCancelHovered(true)}
          onMouseLeave={() => setIsCancelHovered(false)}
          style={cancelStyle}
          aria-label="Cancel and discard draft"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleNextClick}
          onMouseEnter={() => setIsNextHovered(true)}
          onMouseLeave={() => { setIsNextHovered(false); setIsNextActive(false); }}
          onMouseDown={() => setIsNextActive(true)}
          onMouseUp={() => setIsNextActive(false)}
          disabled={!isContentPresent || isFlushing}
          aria-disabled={!isContentPresent || isFlushing}
          aria-label="Save draft and continue to next step"
          style={nextStyle}
          data-testid="next-button"
        >
          {isFlushing && <Spinner />}
          Next
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Spinner — minimal inline SVG spinner shown while flushing.
// ---------------------------------------------------------------------------

function Spinner(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      data-testid="next-spinner"
      style={{
        animation: 'wizard-footer-spin 0.7s linear infinite',
      }}
    >
      <style>{`@keyframes wizard-footer-spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="7" cy="7" r="5.5" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
      <path
        d="M7 1.5A5.5 5.5 0 0 1 12.5 7"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const footerInnerStyles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,

  error: {
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: '16px',
    color: ERROR,
  } as React.CSSProperties,
} as const;
