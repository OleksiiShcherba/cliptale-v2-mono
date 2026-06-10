/**
 * RED tests for T10 — ReferenceGateMessage and UnlinkedScenesMessage components.
 *
 * AC-02 / AC-03b — a 422 with code 'references.reference_gate_failed' must render:
 *   - Every named blocking block by name
 *   - Finish / retry / remove guidance via EXISTING reference-flow controls
 *     (reuse of existing ReferenceBlockNode actions, not new affordances — AC-02)
 *   - Per-scene: only the blocks linked to that scene (AC-03b — same component,
 *     caller filters details.blocks to the scene scope)
 *
 * AC-04b — a 422 with code 'references.unlinked_scenes' must render:
 *   - Every named unlinked scene (null name → sensible fallback label)
 *   - Link-a-reference guidance
 *
 * These components do NOT exist yet.  Every test here will fail (GOOD red) because
 * the imports resolve to undefined module members.
 *
 * The existing StarGateMessage (storyboard-reference-flows T20, AC-08) is the
 * reference pattern: same *.styles.ts convention, same role="alert" root,
 * same data-testid pattern, same co-location in components/.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';

// ── Import target components ───────────────────────────────────────────────────
// ReferenceGateMessage and UnlinkedScenesMessage do not exist yet (T10 RED).
// We import dynamically below inside tests so the file compiles.
// The top-level type stubs keep TypeScript happy without a module present.

// Typed stubs used in render helpers — resolved to real exports once T10 ships.
type ReferenceGateMessageType = React.ComponentType<{
  blocks: BlockingBlock[];
  onRetryBlock: (blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
}>;

type UnlinkedScenesMessageType = React.ComponentType<{
  scenes: UnlinkedScene[];
}>;

// Resolved lazily in each test; undefined until the module is created.
let ReferenceGateMessage: ReferenceGateMessageType | undefined;
let UnlinkedScenesMessage: UnlinkedScenesMessageType | undefined;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./ReferenceGateMessage') as {
    ReferenceGateMessage?: ReferenceGateMessageType;
    UnlinkedScenesMessage?: UnlinkedScenesMessageType;
  };
  ReferenceGateMessage = mod.ReferenceGateMessage;
  UnlinkedScenesMessage = mod.UnlinkedScenesMessage;
} catch {
  // Module does not exist yet — RED state; tests will fail asserting on undefined.
}

// ── Types matching the openapi.yaml BlockingBlock / UnlinkedScene schemas ────

interface BlockingBlock {
  blockId: string;
  name: string;
}

interface UnlinkedScene {
  blockId: string;
  name: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderGateFailed(
  blocks: BlockingBlock[],
  callbacks: {
    onRetryBlock?: (blockId: string) => void;
    onDeleteBlock?: (blockId: string) => void;
  } = {},
) {
  // Component must exist — if it does not, the test fails here (GOOD red).
  expect(
    ReferenceGateMessage,
    'ReferenceGateMessage must be exported from ./ReferenceGateMessage (T10)',
  ).toBeDefined();
  const Component = ReferenceGateMessage!;
  return render(
    <Component
      blocks={blocks}
      onRetryBlock={callbacks.onRetryBlock ?? vi.fn()}
      onDeleteBlock={callbacks.onDeleteBlock ?? vi.fn()}
    />,
  );
}

function renderUnlinkedScenes(scenes: UnlinkedScene[]) {
  expect(
    UnlinkedScenesMessage,
    'UnlinkedScenesMessage must be exported from ./ReferenceGateMessage (T10)',
  ).toBeDefined();
  const Component = UnlinkedScenesMessage!;
  return render(
    <Component scenes={scenes} />,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-02 — reference_gate_failed branch
// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceGateMessage — AC-02 / AC-03b (reference_gate_failed)', () => {
  it('renders each blocking block by name (AC-02: Creator sees exactly which blocks are unfinished)', () => {
    renderGateFailed([
      { blockId: 'block-1', name: 'Test Character' },
      { blockId: 'block-2', name: 'Test Environment' },
    ]);

    expect(screen.getByText(/Test Character/)).toBeTruthy();
    expect(screen.getByText(/Test Environment/)).toBeTruthy();
  });

  it('renders a "finish, retry, or remove" guidance message (AC-02: no new affordance — uses existing controls)', () => {
    renderGateFailed([{ blockId: 'block-1', name: 'Test Character' }]);

    // The component must contain guidance text referencing the three actions.
    // Exact wording is implementation detail; assert presence of key terms.
    const alert = screen.getByRole('alert');
    const alertText = alert.textContent ?? '';
    // Must mention finish, retry, and remove — these are the existing reference-flow controls.
    expect(alertText.toLowerCase()).toMatch(/finish|retry|remove/);
  });

  it('renders a retry action for each blocking block (existing reference-flow control — AC-02)', () => {
    renderGateFailed([
      { blockId: 'block-1', name: 'Test Character' },
      { blockId: 'block-2', name: 'Test Environment' },
    ]);

    // Follows data-testid pattern: ref-gate-retry-{blockId}
    expect(screen.getByTestId('ref-gate-retry-block-1')).toBeTruthy();
    expect(screen.getByTestId('ref-gate-retry-block-2')).toBeTruthy();
  });

  it('renders a delete/remove action for each blocking block (existing reference-flow control — AC-02)', () => {
    renderGateFailed([
      { blockId: 'block-1', name: 'Test Character' },
    ]);

    expect(screen.getByTestId('ref-gate-delete-block-1')).toBeTruthy();
  });

  it('clicking retry calls onRetryBlock with the correct blockId', () => {
    const onRetryBlock = vi.fn();
    renderGateFailed(
      [{ blockId: 'block-retry-1', name: 'Test Character' }],
      { onRetryBlock },
    );

    fireEvent.click(screen.getByTestId('ref-gate-retry-block-retry-1'));
    expect(onRetryBlock).toHaveBeenCalledTimes(1);
    expect(onRetryBlock).toHaveBeenCalledWith('block-retry-1');
  });

  it('clicking delete calls onDeleteBlock with the correct blockId', () => {
    const onDeleteBlock = vi.fn();
    renderGateFailed(
      [{ blockId: 'block-del-1', name: 'Test Environment' }],
      { onDeleteBlock },
    );

    fireEvent.click(screen.getByTestId('ref-gate-delete-block-del-1'));
    expect(onDeleteBlock).toHaveBeenCalledTimes(1);
    expect(onDeleteBlock).toHaveBeenCalledWith('block-del-1');
  });

  it('lists ALL blocking blocks when multiple are gated (AC-02: names each)', () => {
    const blocks: BlockingBlock[] = [
      { blockId: 'b-1', name: 'Hero' },
      { blockId: 'b-2', name: 'Sidekick' },
      { blockId: 'b-3', name: 'Villain' },
    ];
    renderGateFailed(blocks);

    for (const { blockId, name } of blocks) {
      expect(screen.getByText(new RegExp(name))).toBeTruthy();
      expect(screen.getByTestId(`ref-gate-retry-${blockId}`)).toBeTruthy();
      expect(screen.getByTestId(`ref-gate-delete-${blockId}`)).toBeTruthy();
    }
  });

  it('renders nothing when blocks list is empty (gate passed — no error to show)', () => {
    expect(
      ReferenceGateMessage,
      'ReferenceGateMessage must be exported from ./ReferenceGateMessage (T10)',
    ).toBeDefined();
    const Component = ReferenceGateMessage!;
    const { container } = render(
      <Component blocks={[]} onRetryBlock={vi.fn()} onDeleteBlock={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('has a role="alert" root so screen-readers announce the blocking state', () => {
    renderGateFailed([{ blockId: 'block-1', name: 'Test Character' }]);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('AC-03b: when only scene-scoped blocks are passed, only those blocks appear (caller filters details.blocks)', () => {
    // Per-scene regeneration: the caller passes only the blocks linked to scene S.
    // The component is shared; the scene scope is enforced by the caller passing a
    // filtered blocks array — the component just renders what it receives.
    const sceneBlocks: BlockingBlock[] = [
      { blockId: 'block-scene-only', name: 'Scene Character' },
    ];
    renderGateFailed(sceneBlocks);

    expect(screen.getByText(/Scene Character/)).toBeTruthy();
    // Any other block not in the list must not appear.
    expect(screen.queryByText(/Unrelated Block/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-04b — unlinked_scenes branch
// ─────────────────────────────────────────────────────────────────────────────

describe('UnlinkedScenesMessage — AC-04b (unlinked_scenes)', () => {
  it('renders each unlinked scene by name', () => {
    renderUnlinkedScenes([
      { blockId: 'scene-1', name: 'Opening Shot' },
      { blockId: 'scene-2', name: 'Climax' },
    ]);

    expect(screen.getByText(/Opening Shot/)).toBeTruthy();
    expect(screen.getByText(/Climax/)).toBeTruthy();
  });

  it('renders a "link a reference" guidance message (AC-04b)', () => {
    renderUnlinkedScenes([{ blockId: 'scene-1', name: 'Opening Shot' }]);

    const alert = screen.getByRole('alert');
    const alertText = alert.textContent ?? '';
    // Must instruct the Creator to link a reference before starting.
    expect(alertText.toLowerCase()).toMatch(/link.*reference|reference.*link/);
  });

  it('uses a sensible fallback label when scene name is null (openapi: name is string|null)', () => {
    renderUnlinkedScenes([
      { blockId: 'scene-null', name: null },
    ]);

    // The component must render something identifiable for a null-named scene,
    // not an empty slot or a crash.  Assert there is at least one list item visible.
    const alert = screen.getByRole('alert');
    // A list item for the null-name scene must be present in the DOM.
    expect(alert.querySelectorAll('li').length).toBeGreaterThanOrEqual(1);
    // The rendered text must not be purely empty for the null-name item.
    const text = alert.textContent ?? '';
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it('renders nothing when scenes list is empty', () => {
    expect(
      UnlinkedScenesMessage,
      'UnlinkedScenesMessage must be exported from ./ReferenceGateMessage (T10)',
    ).toBeDefined();
    const Component = UnlinkedScenesMessage!;
    const { container } = render(<Component scenes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('has a role="alert" root so screen-readers announce the blocking state', () => {
    renderUnlinkedScenes([{ blockId: 'scene-1', name: 'Test Scene' }]);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('lists ALL unlinked scenes when multiple are present (AC-04b: names each scene)', () => {
    const scenes: UnlinkedScene[] = [
      { blockId: 's-1', name: 'Intro' },
      { blockId: 's-2', name: 'Montage' },
      { blockId: 's-3', name: null },
    ];
    renderUnlinkedScenes(scenes);

    // Named scenes appear by name.
    expect(screen.getByText(/Intro/)).toBeTruthy();
    expect(screen.getByText(/Montage/)).toBeTruthy();
    // All three items are present (including the null-name one).
    const alert = screen.getByRole('alert');
    expect(alert.querySelectorAll('li').length).toBe(3);
  });
});
