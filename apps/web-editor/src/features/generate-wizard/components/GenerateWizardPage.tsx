import React, { useCallback, useRef } from 'react';

import { useEnhancePrompt } from '@/features/generate-wizard/hooks/useEnhancePrompt';
import { useGenerationDraft } from '@/features/generate-wizard/hooks/useGenerationDraft';
import type { AssetSummary, PromptDoc } from '../types';

import type { PromptEditorHandle } from './PromptEditor';
import { EnhancePreviewModal } from './EnhancePreviewModal';
import { MediaGalleryPanel } from './MediaGalleryPanel';
import { ProTipCard } from './ProTipCard';
import { PromptEditor } from './PromptEditor';
import { PromptToolbar } from './PromptToolbar';
import { WizardFooter } from './WizardFooter';
import { WizardStepper } from './WizardStepper';

// Design-guide tokens (matching LeftSidebarTabs.tsx convention)
const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';

/** Breakpoint at which the two-column (8fr / 4fr) layout kicks in. */
const LG_BREAKPOINT = 1024;

/**
 * The `/generate` page shell.
 *
 * Provides:
 * - A header row with the WizardStepper (currentStep=1)
 * - A two-column body (8fr / 4fr) at ≥1024px, single-column below
 *   - Left: PromptEditor
 *   - Right: MediaGalleryPanel wired to promptEditorRef.insertMediaRef
 * - A footer with Cancel and Next buttons (WizardFooter)
 */
export function GenerateWizardPage(): React.ReactElement {
  const [windowWidth, setWindowWidth] = React.useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  );
  const { draftId, doc, setDoc, flush } = useGenerationDraft();
  const { start, status, proposedDoc, error, reset } = useEnhancePrompt(draftId);
  const promptEditorRef = useRef<PromptEditorHandle>(null);

  React.useEffect(() => {
    function handleResize(): void {
      setWindowWidth(window.innerWidth);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isLg = windowWidth >= LG_BREAKPOINT;

  /** True while an enhance job is in-flight (queued or running). */
  const isEnhancing = status === 'queued' || status === 'running';

  /** Called by MediaGalleryPanel when the user clicks an asset card. */
  const handleAssetSelected = useCallback((asset: AssetSummary): void => {
    promptEditorRef.current?.insertMediaRef({
      id: asset.id,
      type: asset.type,
      label: asset.label,
    });
  }, []);

  /** Called by PromptToolbar AI Enhance button. */
  const handleEnhance = useCallback((): void => {
    start(doc);
  }, [doc, start]);

  /**
   * Accept handler — apply the proposed doc to the editor and flush autosave.
   * The `flush()` call ensures the accepted doc persists without waiting for
   * the debounce timer in useGenerationDraft.
   */
  const handleAccept = useCallback(
    (proposed: PromptDoc): void => {
      setDoc(proposed);
      void flush();
      reset();
    },
    [flush, reset, setDoc],
  );

  return (
    <div style={styles.page}>
      {/* Header — WizardStepper */}
      <header style={styles.header}>
        <WizardStepper currentStep={1} />
      </header>

      {/* Two-column body */}
      <main
        style={isLg ? styles.bodyDesktop : styles.bodyMobile}
        aria-label="Generate wizard body"
      >
        {/* Left column — PromptEditor */}
        <section
          style={styles.leftColumn}
          aria-label="Script and media editor"
          data-testid="wizard-left-column"
        >
          <PromptEditor
            ref={promptEditorRef}
            value={doc}
            onChange={setDoc}
          />
          <PromptToolbar
            promptEditorRef={promptEditorRef}
            draftId={draftId}
            isEnhancing={isEnhancing}
            onEnhance={handleEnhance}
          />
        </section>

        {/* Right column — MediaGalleryPanel */}
        <section
          style={styles.rightColumn}
          aria-label="Video road map"
          data-testid="wizard-right-column"
        >
          <MediaGalleryPanel onAssetSelected={handleAssetSelected} />
        </section>
      </main>

      {/* Footer — Cancel / Next */}
      <footer style={styles.footer} aria-label="Wizard footer actions" data-testid="wizard-footer">
        <WizardFooter draftId={draftId} doc={doc} flush={flush} />
      </footer>

      {/* ProTipCard — floating dismissible hint, bottom-right */}
      <ProTipCard />

      {/* AI Enhance preview modal — only mounted when status === 'done' */}
      <EnhancePreviewModal
        open={status === 'done'}
        original={doc}
        proposed={proposedDoc}
        status={status}
        error={error}
        onAccept={handleAccept}
        onDiscard={reset}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    overflow: 'hidden',
    background: SURFACE,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  header: {
    flexShrink: 0,
  } as React.CSSProperties,

  bodyDesktop: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '8fr 4fr',
    overflow: 'hidden',
    gap: 0,
  } as React.CSSProperties,

  bodyMobile: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  leftColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto',
    background: SURFACE,
    borderRight: `1px solid ${BORDER}`,
    padding: '24px',
  } as React.CSSProperties,

  rightColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto',
    background: SURFACE_ALT,
    padding: '0',
  } as React.CSSProperties,

  footer: {
    flexShrink: 0,
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '0 24px',
    background: SURFACE_ELEVATED,
    borderTop: `1px solid ${BORDER}`,
    gap: '12px',
  } as React.CSSProperties,
} as const;
