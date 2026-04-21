import React, { useCallback, useRef, useState } from 'react';

import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { useEnhancePrompt } from '@/features/generate-wizard/hooks/useEnhancePrompt';
import { useGenerationDraft } from '@/features/generate-wizard/hooks/useGenerationDraft';
import { useWizardAsset } from '@/features/generate-wizard/hooks/useWizardAsset';
import { deleteAsset, restoreAsset } from '@/features/asset-manager/api';
import { linkFileToDraft } from '@/features/generate-wizard/api';
import { UndoToast } from '@/shared/undo/UndoToast';
import { useUndoToast } from '@/shared/undo/useUndoToast';
import type { AssetSummary, PromptDoc } from '@/features/generate-wizard/types';
import type { Asset } from '@/features/asset-manager/types';

import type { PromptEditorHandle } from './PromptEditor';
import { BackToStoryboardButton } from './BackToStoryboardButton';
import { EnhancePreviewModal } from './EnhancePreviewModal';
import { MediaGalleryPanel } from './MediaGalleryPanel';
import { ProTipCard } from './ProTipCard';
import { PromptEditor } from './PromptEditor';
import { PromptToolbar } from './PromptToolbar';
import { WizardAssetDetailSlot } from './WizardAssetDetailSlot';
import { WizardFooter } from './WizardFooter';
import { WizardStepper } from './WizardStepper';
import { wizardPageStyles as s } from './generateWizardPage.styles';

/** Breakpoint at which the two-column (8fr / 4fr) layout kicks in. */
const LG_BREAKPOINT = 1024;

/**
 * The `/generate` page shell.
 *
 * Provides:
 * - A header row with the WizardStepper (currentStep=1)
 * - A two-column body (8fr / 4fr) at ≥1024px, single-column below
 *   - Left: PromptEditor
 *   - Right: MediaGalleryPanel (gallery) or WizardAssetDetailSlot (panel)
 * - A footer with Cancel and Next buttons (WizardFooter)
 * - An UndoToast for soft-delete undo
 */
export function GenerateWizardPage(): React.ReactElement {
  const [windowWidth, setWindowWidth] = React.useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  );
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Read ?draftId=<id> from the URL — present when resuming an existing draft.
  const initialDraftId = searchParams.get('draftId');
  const { draftId, doc, setDoc, flush } = useGenerationDraft({ initialDraftId });
  const { start, status, proposedDoc, error, reset } = useEnhancePrompt(draftId);
  const promptEditorRef = useRef<PromptEditorHandle>(null);
  const queryClient = useQueryClient();

  /** ID of the asset currently shown in the detail panel (null = gallery view). */
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const { asset: selectedAsset, isLoading: isAssetLoading } = useWizardAsset(selectedAssetId);

  const { toastState, showToast, dismissToast, handleUndo } = useUndoToast();

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

  /**
   * Called by MediaGalleryPanel when the user clicks an asset card.
   * Opens the AssetDetailPanel instead of directly inserting into the prompt.
   */
  const handleAssetSelected = useCallback((asset: AssetSummary): void => {
    setSelectedAssetId(asset.id);
  }, []);

  /** Closes the detail panel and returns to the gallery. */
  const handleClosePanel = useCallback((): void => {
    setSelectedAssetId(null);
  }, []);

  /**
   * Called by the panel's "Add to Prompt" button.
   * Inserts a media ref chip into the PromptEditor, closes the panel, and
   * auto-links the file to the current draft (fire-and-forget).
   */
  const handleAddToPrompt = useCallback((asset: Asset): void => {
    // Derive the wizard-compatible media type from the asset's MIME type.
    const type = asset.contentType.startsWith('video/')
      ? 'video'
      : asset.contentType.startsWith('audio/')
        ? 'audio'
        : 'image';

    promptEditorRef.current?.insertMediaRef({
      id: asset.id,
      type,
      label: asset.displayName ?? asset.filename,
    });
    setSelectedAssetId(null);

    // Auto-link the file to the draft so it appears in the scoped file list.
    // Fire-and-forget — chip insertion is already committed.
    if (draftId) {
      void linkFileToDraft(draftId, asset.id).catch(() => undefined);
    }
  }, [draftId]);

  /**
   * Called when a file chip is inserted into the PromptEditor via drag-and-drop.
   * Auto-links the dropped file to the current draft (fire-and-forget).
   */
  const handleFileLinked = useCallback((fileId: string): void => {
    if (draftId) {
      void linkFileToDraft(draftId, fileId).catch(() => undefined);
    }
  }, [draftId]);

  /**
   * Called by the panel's "Delete Asset" button.
   * Soft-deletes the asset, closes the panel, and shows an undo toast.
   * Invalidates the gallery query so the deleted item disappears immediately.
   */
  const handleDeleteAsset = useCallback((): void => {
    if (!selectedAsset) return;
    const { id, displayName, filename } = selectedAsset;
    const label = displayName ?? filename;

    void deleteAsset(id).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['generate-wizard', 'assets'] });
      void queryClient.invalidateQueries({ queryKey: ['wizard-asset', id] });
      setSelectedAssetId(null);

      showToast({
        label: `"${label}" deleted`,
        onUndo: async () => {
          await restoreAsset(id);
          void queryClient.invalidateQueries({ queryKey: ['generate-wizard', 'assets'] });
        },
      });
    });
  }, [selectedAsset, queryClient, showToast]);

  /**
   * Navigate home with a query-param hint to open the Storyboard tab.
   * Query param (`?tab=storyboard`) was chosen over sessionStorage because it
   * is bookmarkable and does not require cleanup — absence keeps the default
   * (Projects tab).
   */
  const handleBackToStoryboard = useCallback((): void => {
    navigate('/?tab=storyboard');
  }, [navigate]);

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
    <div style={s.page}>
      {/* Header — Back-to-Storyboard button (left) + WizardStepper (center) */}
      <header style={s.header}>
        <BackToStoryboardButton onClick={handleBackToStoryboard} />
        {/* Full-width wrapper ensures WizardStepper centers across the whole header */}
        <div style={s.stepperWrapper}>
          <WizardStepper currentStep={1} />
        </div>
      </header>

      {/* Two-column body */}
      <main
        style={isLg ? s.bodyDesktop : s.bodyMobile}
        aria-label="Generate wizard body"
      >
        {/* Left column — PromptEditor */}
        <section
          style={s.leftColumn}
          aria-label="Script and media editor"
          data-testid="wizard-left-column"
        >
          <PromptEditor
            ref={promptEditorRef}
            value={doc}
            onChange={setDoc}
            onFileLinked={handleFileLinked}
          />
          <PromptToolbar
            promptEditorRef={promptEditorRef}
            draftId={draftId}
            isEnhancing={isEnhancing}
            onEnhance={handleEnhance}
          />
        </section>

        {/* Right column — gallery or asset detail panel */}
        <section
          style={s.rightColumn}
          aria-label="Video road map"
          data-testid="wizard-right-column"
        >
          {selectedAssetId !== null ? (
            <WizardAssetDetailSlot
              asset={selectedAsset}
              isLoading={isAssetLoading}
              draftId={draftId}
              onClose={handleClosePanel}
              onAddToPrompt={handleAddToPrompt}
              onDelete={handleDeleteAsset}
            />
          ) : (
            <MediaGalleryPanel
              onAssetSelected={handleAssetSelected}
              draftId={draftId ?? undefined}
            />
          )}
        </section>
      </main>

      {/* Footer — Cancel / Next */}
      <footer style={s.footer} aria-label="Wizard footer actions" data-testid="wizard-footer">
        <WizardFooter draftId={draftId} doc={doc} flush={flush} />
      </footer>

      {/* ProTipCard — floating dismissible hint, bottom-right */}
      <ProTipCard />

      {/* Undo toast for soft-delete */}
      <UndoToast
        toastState={toastState}
        onDismiss={dismissToast}
        onUndo={handleUndo}
      />

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
