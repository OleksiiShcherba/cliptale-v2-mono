/**
 * SceneLinkSelector — multi-select scene linker for reference blocks (T16, AC-10/AC-10b).
 *
 * Styled to match the Music block modal's scene colour scheme: a linked scene is a
 * green (SUCCESS) chip, an available scene is a neutral chip — the same active/idle
 * language the music range preview uses.
 */

import React, { useState } from 'react';
import type { CSSProperties } from 'react';

import type { StoryboardBlock } from '@/features/storyboard/types';
import {
  BORDER,
  SUCCESS,
  SURFACE,
  SURFACE_ALT,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  PRIMARY,
} from './storyboardPageStyles';

export interface SceneLinkSelectorProps {
  /** The reference block id whose scene links are being edited. */
  blockId: string;
  /** All scene blocks of the draft in display order. */
  orderedScenes: StoryboardBlock[];
  /** Currently linked scene block ids (from the API). */
  linkedSceneIds: string[];
  /** The block's current version (compare-and-set guard for the save call). */
  version: number;
  /**
   * Called when the Creator saves the updated list.
   * Receives the full replacement list and the version the client knew.
   * Returns the server's response (new list + incremented version) on success,
   * or throws an error with status=409 on version conflict.
   */
  onSave: (
    sceneBlockIds: string[],
    version: number,
  ) => Promise<{ sceneBlockIds: string[]; version: number }>;
}

const FONT = 'Inter, sans-serif';

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  } as CSSProperties,
  empty: { color: TEXT_SECONDARY, fontSize: 12, lineHeight: '16px' } as CSSProperties,
  // Linked scene — green active chip (matches the music range preview's SUCCESS).
  linkedChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 6px 3px 10px',
    borderRadius: 999,
    background: 'rgba(16, 185, 129, 0.15)',
    border: `1px solid ${SUCCESS}`,
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontFamily: FONT,
  } as CSSProperties,
  removeButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    padding: 0,
    border: 0,
    borderRadius: 999,
    background: 'transparent',
    color: SUCCESS,
    cursor: 'pointer',
    fontSize: 13,
    lineHeight: '16px',
  } as CSSProperties,
  // Available scene — neutral idle chip.
  addChip: {
    padding: '3px 10px',
    borderRadius: 999,
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    color: TEXT_SECONDARY,
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: FONT,
  } as CSSProperties,
  saveButton: {
    alignSelf: 'flex-start',
    height: 28,
    padding: '0 12px',
    borderRadius: 8,
    border: 0,
    background: PRIMARY,
    color: TEXT_PRIMARY,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: FONT,
  } as CSSProperties,
  conflict: {
    padding: '6px 10px',
    borderRadius: 8,
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: '16px',
  } as CSSProperties,
} as const;

function sceneLabel(scene: StoryboardBlock): string {
  return scene.name?.trim() || `Scene ${String(scene.sortOrder).padStart(2, '0')}`;
}

/**
 * Multi-select scene-link selector with:
 *  - Visible linked-scenes list (AC-10)
 *  - Add / remove individual scenes (AC-10)
 *  - Save carries the block version (AC-10 compare-and-set)
 *  - 409 version-conflict → reload prompt (AC-10 NFR concurrency)
 *  - Filters out scene ids absent from orderedScenes (AC-10b lifecycle)
 */
export function SceneLinkSelector({
  orderedScenes,
  linkedSceneIds,
  version,
  onSave,
}: SceneLinkSelectorProps): React.ReactElement {
  const sceneIdSet = new Set(orderedScenes.map((s) => s.id));

  // AC-10b: filter out stale ids not present in orderedScenes
  const [linked, setLinked] = useState<string[]>(() =>
    linkedSceneIds.filter((id) => sceneIdSet.has(id)),
  );
  const [conflictPrompt, setConflictPrompt] = useState(false);

  const linkedSet = new Set(linked);

  function handleAdd(sceneId: string) {
    setLinked((prev) => [...prev, sceneId]);
  }

  function handleRemove(sceneId: string) {
    setLinked((prev) => prev.filter((id) => id !== sceneId));
  }

  async function handleSave() {
    try {
      await onSave(linked, version);
      setConflictPrompt(false);
    } catch (err: unknown) {
      const e = err as { status?: number };
      if (e?.status === 409) {
        setConflictPrompt(true);
      }
    }
  }

  // Preserve story order for the linked chips so they read like the music lane.
  const linkedScenes = orderedScenes.filter((s) => linkedSet.has(s.id));
  const unlinkedScenes = orderedScenes.filter((s) => !linkedSet.has(s.id));

  return (
    <div style={styles.root}>
      {/* Visible linked-scenes list — green active chips */}
      <ul style={styles.chipRow}>
        {linkedScenes.length === 0 && <li style={styles.empty}>No scenes selected yet</li>}
        {linkedScenes.map((scene) => (
          <li key={scene.id} data-testid={`linked-scene-${scene.id}`} style={styles.linkedChip}>
            {sceneLabel(scene)}
            <button
              data-testid={`remove-scene-${scene.id}`}
              onClick={() => handleRemove(scene.id)}
              aria-label={`Remove ${sceneLabel(scene)}`}
              style={styles.removeButton}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {/* Available (unlinked) scenes to add — neutral idle chips */}
      {unlinkedScenes.length > 0 && (
        <ul style={styles.chipRow}>
          {unlinkedScenes.map((scene) => (
            <li key={scene.id}>
              <button
                data-testid={`add-scene-${scene.id}`}
                onClick={() => handleAdd(scene.id)}
                style={styles.addChip}
              >
                + {sceneLabel(scene)}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button data-testid="save-scene-links" onClick={handleSave} style={styles.saveButton}>
        Save scenes
      </button>

      {/* 409 version-conflict reload prompt (AC-10 NFR concurrency) */}
      {conflictPrompt && (
        <div data-testid="scene-links-conflict-prompt" style={styles.conflict}>
          Another change was made to this block. Please reload to get the
          latest version before saving.
        </div>
      )}
    </div>
  );
}
