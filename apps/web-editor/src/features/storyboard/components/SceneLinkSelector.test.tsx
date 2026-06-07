/**
 * Tests for SceneLinkSelector (storyboard-reference-flows T16, AC-10 + AC-10b).
 *
 * AC-10 (happy path — scene links):
 *   Given reference blocks were created with AI-proposed scene links,
 *   When the Creator opens a block's scene selector and adds or removes individual scenes,
 *   Then the block's visible linked-scenes list updates and the save call carries
 *   the current block version (compare-and-set guard, spec §6 NFR concurrency).
 *
 * AC-10 (409 reload prompt):
 *   When saveSceneLinks resolves with a 409 version-conflict response,
 *   Then a reload prompt is shown to the Creator and the edit is NOT silently lost
 *   (NFR concurrency, Flow 5 alt, openapi.yaml 409 references.version_conflict).
 *
 * AC-10b (edge — scene lifecycle, component view):
 *   Scenes that have been deleted from the draft (i.e., absent from the orderedScenes
 *   list passed to the selector) must NOT appear in the visible linked-scenes list —
 *   backend CASCADE removes dangling link rows; the component must respect what the
 *   server returns (no stale scene ids rendered as if they still exist).
 *
 * Level: component (per test-plan.md AC-10 row — "integration + component").
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import type { StoryboardBlock } from '@/features/storyboard/types';

import { SceneLinkSelector } from './SceneLinkSelector';
import type { SceneLinkSelectorProps } from './SceneLinkSelector';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCENES: StoryboardBlock[] = [
  {
    id: 'scene-a',
    draftId: 'draft-1',
    blockType: 'scene',
    name: 'Opening',
    prompt: null,
    videoPrompt: null,
    durationS: 5,
    positionX: 0,
    positionY: 0,
    sortOrder: 1,
    style: null,
    mediaItems: [],
    createdAt: '2026-06-07T00:00:00Z',
    updatedAt: '2026-06-07T00:00:00Z',
  },
  {
    id: 'scene-b',
    draftId: 'draft-1',
    blockType: 'scene',
    name: 'Middle',
    prompt: null,
    videoPrompt: null,
    durationS: 5,
    positionX: 0,
    positionY: 0,
    sortOrder: 2,
    style: null,
    mediaItems: [],
    createdAt: '2026-06-07T00:00:00Z',
    updatedAt: '2026-06-07T00:00:00Z',
  },
  {
    id: 'scene-c',
    draftId: 'draft-1',
    blockType: 'scene',
    name: 'Close',
    prompt: null,
    videoPrompt: null,
    durationS: 5,
    positionX: 0,
    positionY: 0,
    sortOrder: 3,
    style: null,
    mediaItems: [],
    createdAt: '2026-06-07T00:00:00Z',
    updatedAt: '2026-06-07T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SaveFn = SceneLinkSelectorProps['onSave'];

interface RenderOptions {
  linkedSceneIds?: string[];
  version?: number;
  onSave?: SaveFn;
}

function makeSaveMock(linkedSceneIds: string[], version: number): SaveFn {
  const mock = vi.fn();
  mock.mockResolvedValue({ sceneBlockIds: linkedSceneIds, version: version + 1 });
  return mock as unknown as SaveFn;
}

function renderSelector(opts: RenderOptions = {}) {
  const {
    linkedSceneIds = ['scene-a'],
    version = 3,
  } = opts;
  const saveMock = opts.onSave ?? makeSaveMock(linkedSceneIds, version);

  render(
    <SceneLinkSelector
      blockId="block-1"
      orderedScenes={SCENES}
      linkedSceneIds={linkedSceneIds}
      version={version}
      onSave={saveMock}
    />,
  );

  return { saveMock };
}

// ---------------------------------------------------------------------------
// AC-10: add / remove individual scenes — visible list updates
// ---------------------------------------------------------------------------

describe('SceneLinkSelector — AC-10 (scene links happy path)', () => {
  it('renders the visible linked-scenes list with the initially linked scenes', () => {
    renderSelector({ linkedSceneIds: ['scene-a', 'scene-b'] });

    // Both linked scenes must appear in the visible linked-scenes list
    expect(screen.getByTestId('linked-scene-scene-a')).toBeTruthy();
    expect(screen.getByTestId('linked-scene-scene-b')).toBeTruthy();
    // Unlinked scene must NOT appear in the linked list
    expect(screen.queryByTestId('linked-scene-scene-c')).toBeNull();
  });

  it('adding a scene via the multi-select updates the visible linked-scenes list', async () => {
    renderSelector({ linkedSceneIds: ['scene-a'] });

    // The selector should show scene-c as available (unlinked) and allow adding it
    const addButton = screen.getByTestId('add-scene-scene-c');
    fireEvent.click(addButton);

    // After adding, scene-c appears in the visible linked list
    await waitFor(() => {
      expect(screen.getByTestId('linked-scene-scene-c')).toBeTruthy();
    });
  });

  it('removing a scene via the linked list removes it from the visible list', async () => {
    renderSelector({ linkedSceneIds: ['scene-a', 'scene-b'] });

    const removeButton = screen.getByTestId('remove-scene-scene-a');
    fireEvent.click(removeButton);

    // After removal, scene-a should no longer appear in the linked list
    await waitFor(() => {
      expect(screen.queryByTestId('linked-scene-scene-a')).toBeNull();
    });
    // scene-b must still be linked
    expect(screen.getByTestId('linked-scene-scene-b')).toBeTruthy();
  });

  it('save button sends the current scene list AND the block version (compare-and-set)', async () => {
    const onSave = vi.fn() as unknown as SaveFn;
    (onSave as ReturnType<typeof vi.fn>).mockResolvedValue({ sceneBlockIds: ['scene-a', 'scene-b'], version: 4 });
    render(
      <SceneLinkSelector
        blockId="block-1"
        orderedScenes={SCENES}
        linkedSceneIds={['scene-a']}
        version={3}
        onSave={onSave}
      />,
    );

    // Add scene-b
    fireEvent.click(screen.getByTestId('add-scene-scene-b'));

    // Trigger save
    fireEvent.click(screen.getByTestId('save-scene-links'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    // Must include the new scene AND the original version (3)
    const [calledIds, calledVersion] = (onSave as ReturnType<typeof vi.fn>).mock.calls[0] as [string[], number];
    expect(calledIds).toContain('scene-a');
    expect(calledIds).toContain('scene-b');
    expect(calledVersion).toBe(3); // compare-and-set: sends the version the client knew
  });
});

// ---------------------------------------------------------------------------
// AC-10: 409 version-conflict → reload prompt (NFR concurrency)
// ---------------------------------------------------------------------------

describe('SceneLinkSelector — AC-10 (409 → reload prompt)', () => {
  it('shows a reload prompt when the save call returns a 409 version-conflict', async () => {
    const conflictError = Object.assign(new Error('Version conflict'), {
      status: 409,
      code: 'references.version_conflict',
    });
    const onSave = vi.fn() as unknown as SaveFn;
    (onSave as ReturnType<typeof vi.fn>).mockRejectedValue(conflictError);

    render(
      <SceneLinkSelector
        blockId="block-1"
        orderedScenes={SCENES}
        linkedSceneIds={['scene-a']}
        version={3}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByTestId('save-scene-links'));

    // After the rejection, a reload prompt must be visible — the edit must NOT be
    // silently discarded (spec §6 NFR concurrency, sad.md Flow 5 alt)
    await waitFor(() => {
      expect(screen.getByTestId('scene-links-conflict-prompt')).toBeTruthy();
    });
  });

  it('does NOT show the conflict prompt on a successful save', async () => {
    const onSave = vi.fn() as unknown as SaveFn;
    (onSave as ReturnType<typeof vi.fn>).mockResolvedValue({ sceneBlockIds: ['scene-a'], version: 4 });
    render(
      <SceneLinkSelector
        blockId="block-1"
        orderedScenes={SCENES}
        linkedSceneIds={['scene-a']}
        version={3}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByTestId('save-scene-links'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());

    expect(screen.queryByTestId('scene-links-conflict-prompt')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC-10b: scene lifecycle (component view) — deleted scenes must not appear
// ---------------------------------------------------------------------------

describe('SceneLinkSelector — AC-10b (scene lifecycle — deleted scenes not shown)', () => {
  it('does not render a deleted scene in the linked-scenes list even if its id is in linkedSceneIds', () => {
    // Simulate server already cascaded the deletion of 'scene-deleted';
    // the component receives the post-cascade linkedSceneIds (which no longer contains
    // 'scene-deleted') — or alternatively the old ids are passed but the scene is absent
    // from orderedScenes (backend FK cascade already removed the row, but the client
    // received a stale snapshot before refresh).
    //
    // The component MUST filter linkedSceneIds to only those present in orderedScenes.
    const linkedWithStale = ['scene-a', 'scene-deleted'];
    // 'scene-deleted' is not in SCENES — simulates a scene that was deleted from the draft
    render(
      <SceneLinkSelector
        blockId="block-1"
        orderedScenes={SCENES}
        linkedSceneIds={linkedWithStale}
        version={2}
        onSave={makeSaveMock(['scene-a'], 2)}
      />,
    );

    // scene-a should be visible (it is still in the draft)
    expect(screen.getByTestId('linked-scene-scene-a')).toBeTruthy();
    // 'scene-deleted' must NOT appear — no dangling link rendered (AC-10b)
    expect(screen.queryByTestId('linked-scene-scene-deleted')).toBeNull();
  });

  it('a newly added scene (with no initial link) is not pre-selected in the linked list', () => {
    // When the component mounts with an empty linkedSceneIds, no scene should appear
    // as linked — a new scene receives no links automatically (AC-10b)
    renderSelector({ linkedSceneIds: [] });

    for (const scene of SCENES) {
      expect(screen.queryByTestId(`linked-scene-${scene.id}`)).toBeNull();
    }
  });

  it('does not change linked scenes when the orderedScenes list is reordered', () => {
    // Reordering the draft does not change links — a link binds to the scene itself,
    // not its position (AC-10b).
    // Pass scenes in reverse order (position 3, 2, 1) but the same linkedSceneIds.
    const reversed = [...SCENES].reverse();
    render(
      <SceneLinkSelector
        blockId="block-1"
        orderedScenes={reversed}
        linkedSceneIds={['scene-a']}
        version={1}
        onSave={makeSaveMock(['scene-a'], 1)}
      />,
    );

    // scene-a must still be in the linked list regardless of its new display position
    expect(screen.getByTestId('linked-scene-scene-a')).toBeTruthy();
    // scene-b and scene-c must NOT be in the linked list (they were never linked)
    expect(screen.queryByTestId('linked-scene-scene-b')).toBeNull();
    expect(screen.queryByTestId('linked-scene-scene-c')).toBeNull();
  });
});
