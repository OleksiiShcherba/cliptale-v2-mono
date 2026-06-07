/**
 * SceneLinkSelector — multi-select scene linker for reference blocks (T16, AC-10/AC-10b).
 */

import React, { useState } from 'react';

import type { StoryboardBlock } from '@/features/storyboard/types';

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

  const unlinkedScenes = orderedScenes.filter((s) => !linkedSet.has(s.id));

  return (
    <div>
      {/* Visible linked-scenes list */}
      <ul>
        {linked.map((id) => {
          const scene = orderedScenes.find((s) => s.id === id);
          if (!scene) return null;
          return (
            <li key={id} data-testid={`linked-scene-${id}`}>
              {scene.name ?? id}
              <button
                data-testid={`remove-scene-${id}`}
                onClick={() => handleRemove(id)}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      {/* Available (unlinked) scenes to add */}
      <ul>
        {unlinkedScenes.map((scene) => (
          <li key={scene.id}>
            <button
              data-testid={`add-scene-${scene.id}`}
              onClick={() => handleAdd(scene.id)}
            >
              Add {scene.name ?? scene.id}
            </button>
          </li>
        ))}
      </ul>

      <button data-testid="save-scene-links" onClick={handleSave}>
        Save
      </button>

      {/* 409 version-conflict reload prompt (AC-10 NFR concurrency) */}
      {conflictPrompt && (
        <div data-testid="scene-links-conflict-prompt">
          Another change was made to this block. Please reload to get the
          latest version before saving.
        </div>
      )}
    </div>
  );
}
