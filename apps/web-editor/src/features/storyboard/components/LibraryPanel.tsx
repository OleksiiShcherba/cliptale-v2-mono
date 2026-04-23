/**
 * LibraryPanel — sidebar panel shown when the "library" tab is active.
 *
 * Displays the user's scene templates with search, create, edit, delete,
 * and "Add to Storyboard" actions.
 *
 * Layout:
 * - Header: title + "+ New Scene" button
 * - Search input (client-side filter, 300ms debounce via useSceneTemplates)
 * - Scrollable list of TemplateCards
 * - Empty state when no templates match
 *
 * SceneModal is used in template mode for both create and edit flows;
 * the parent (StoryboardPage) supplies `draftId` for add-to-storyboard calls.
 */

import React, { useState, useCallback } from 'react';

import { addBlockNode } from '../store/storyboard-store';
import type { SceneTemplate } from '../types';
import type { SceneModalSavePayload } from './SceneModal.types';
import { useSceneTemplates } from '../hooks/useSceneTemplates';
import { SceneModal } from './SceneModal';
import { TemplateCard } from './LibraryPanel.templateCard';
import {
  emptyStateStyle,
  errorBannerStyle,
  headerStyle,
  headerTitleRowStyle,
  headerTitleStyle,
  listStyle,
  loadingStyle,
  newSceneButtonStyle,
  panelStyle,
  searchInputStyle,
} from './LibraryPanel.styles';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface LibraryPanelProps {
  /** The draftId of the current storyboard — needed for add-to-storyboard. */
  draftId: string;
  /** Callback so the panel can switch the active tab to 'storyboard' after adding. */
  onSwitchToStoryboard: () => void;
}

// ── LibraryPanel ───────────────────────────────────────────────────────────────

/**
 * Library sidebar panel listing the user's scene templates.
 */
export function LibraryPanel({ draftId, onSwitchToStoryboard }: LibraryPanelProps): React.ReactElement {
  const {
    templates,
    isLoading,
    error,
    filterText,
    setFilterText,
    createTemplate,
    updateTemplate,
    removeTemplate,
    addToStoryboard,
  } = useSceneTemplates();

  // ── Modal state ──────────────────────────────────────────────────────────────

  /** null → modal closed; 'create' → new template; SceneTemplate → editing that template */
  const [modalTarget, setModalTarget] = useState<null | 'create' | SceneTemplate>(null);

  /** Track which card is waiting for add-to-storyboard to resolve. */
  const [addingId, setAddingId] = useState<string | null>(null);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleNewScene = useCallback((): void => {
    setModalTarget('create');
  }, []);

  const handleEdit = useCallback((template: SceneTemplate): void => {
    setModalTarget(template);
  }, []);

  const handleDelete = useCallback(
    async (templateId: string): Promise<void> => {
      await removeTemplate(templateId);
    },
    [removeTemplate],
  );

  const handleAddToStoryboard = useCallback(
    async (templateId: string): Promise<void> => {
      setAddingId(templateId);
      try {
        // onRemove is a no-op here — removal is handled via the canvas keyboard/menu
        const block = await addToStoryboard(templateId, draftId);
        addBlockNode(block, () => { /* node removal handled by StoryboardPage */ });
        onSwitchToStoryboard();
      } finally {
        setAddingId(null);
      }
    },
    [addToStoryboard, draftId, onSwitchToStoryboard],
  );

  const handleModalSave = useCallback(
    async (payload: SceneModalSavePayload): Promise<void> => {
      if (modalTarget === 'create') {
        await createTemplate({
          name: payload.name,
          prompt: payload.prompt,
          durationS: payload.durationS,
          style: payload.style ?? undefined,
          mediaItems: payload.mediaItems.map((m, i) => ({
            fileId: m.fileId,
            mediaType: m.mediaType,
            sortOrder: m.sortOrder ?? i,
          })),
        });
      } else if (modalTarget !== null) {
        await updateTemplate(modalTarget.id, {
          name: payload.name,
          prompt: payload.prompt,
          durationS: payload.durationS,
          style: payload.style ?? undefined,
          mediaItems: payload.mediaItems.map((m, i) => ({
            fileId: m.fileId,
            mediaType: m.mediaType,
            sortOrder: m.sortOrder ?? i,
          })),
        });
      }
      setModalTarget(null);
    },
    [modalTarget, createTemplate, updateTemplate],
  );

  const handleModalClose = useCallback((): void => {
    setModalTarget(null);
  }, []);

  // ── Initial values for template-edit mode ────────────────────────────────────

  const templateInitialValues =
    modalTarget !== null && modalTarget !== 'create'
      ? {
          name: modalTarget.name,
          prompt: modalTarget.prompt,
          durationS: modalTarget.durationS,
          style: modalTarget.style,
          mediaItems: modalTarget.mediaItems.map((m) => ({
            fileId: m.fileId,
            mediaType: m.mediaType,
            filename: m.fileId,
            sortOrder: m.sortOrder,
          })),
        }
      : undefined;

  const templateId =
    modalTarget !== null && modalTarget !== 'create' ? modalTarget.id : undefined;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <div style={panelStyle} data-testid="library-panel">
        {/* Header */}
        <div style={headerStyle}>
          <div style={headerTitleRowStyle}>
            <h3 style={headerTitleStyle}>Library</h3>
            <button
              type="button"
              style={newSceneButtonStyle}
              onClick={handleNewScene}
              aria-label="Create new scene template"
              data-testid="new-scene-button"
            >
              + New Scene
            </button>
          </div>

          <input
            type="search"
            placeholder="Search templates…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={searchInputStyle}
            aria-label="Search scene templates"
            data-testid="library-search-input"
          />
        </div>

        {/* Error banner */}
        {error && (
          <div style={errorBannerStyle} role="alert" data-testid="library-error">
            {error}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div style={loadingStyle} data-testid="library-loading">
            Loading templates…
          </div>
        )}

        {/* Template list */}
        {!isLoading && (
          <div style={listStyle} data-testid="library-template-list">
            {templates.length === 0 ? (
              <div style={emptyStateStyle} data-testid="library-empty-state">
                <span>No templates yet</span>
                <span style={{ fontSize: '11px' }}>
                  Click "+ New Scene" to create your first template.
                </span>
              </div>
            ) : (
              templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onAddToStoryboard={handleAddToStoryboard}
                  isAdding={addingId === template.id}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* SceneModal — rendered outside panel div to escape overflow:hidden */}
      {modalTarget !== null && (
        <SceneModal
          mode="template"
          templateId={templateId}
          initialValues={templateInitialValues}
          onSave={handleModalSave}
          onClose={handleModalClose}
        />
      )}
    </>
  );
}
