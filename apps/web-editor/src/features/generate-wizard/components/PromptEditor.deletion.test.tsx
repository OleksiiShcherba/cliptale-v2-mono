/**
 * PromptEditor — chip deletion tests (subtask 5).
 *
 * Reproduces and verifies the fix for:
 *   "Media-ref chips inserted by rapidly clicking asset cards cannot be
 *   deleted afterward."
 *
 * Root cause confirmed by reproduction: `insertMediaRefAtOffset` emits empty
 * text-node pads around every chip. When the editor is blurred each insertion
 * uses `totalLinearLength` as the caret offset, and the resulting consecutive
 * empty-text-node pads cause `handleKeyDown` to encounter empty-string
 * `previousSibling` text nodes instead of the chip, making backspace silently
 * no-op.
 *
 * Fix strategy: `handleKeyDown` now walks backward past consecutive empty text
 * nodes to locate the chip.
 */

import React, { useRef, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

import type { PromptDoc } from '@ai-video-editor/project-schema';

import { PromptEditor, type PromptEditorHandle } from './PromptEditor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyDoc(): PromptDoc {
  return { schemaVersion: 1, blocks: [{ type: 'text', value: '' }] };
}

function getEditor(): HTMLDivElement {
  return screen.getByTestId('prompt-editor') as HTMLDivElement;
}

/** Places the caret at `offset` within `node`. */
function placeCaret(node: Node, offset: number): void {
  const sel = window.getSelection();
  if (!sel) throw new Error('no selection');
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Clears the current selection entirely (simulates focus moving away). */
function clearSelection(): void {
  window.getSelection()?.removeAllRanges();
}

function ControlledEditor({
  initial,
  onDocChange,
  editorRef,
}: {
  initial: PromptDoc;
  onDocChange?: (doc: PromptDoc) => void;
  editorRef?: React.Ref<PromptEditorHandle>;
}): React.ReactElement {
  const [doc, setDoc] = useState<PromptDoc>(initial);
  return (
    <PromptEditor
      ref={editorRef}
      value={doc}
      onChange={(next) => {
        setDoc(next);
        onDocChange?.(next);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Case 1 — 3 chips in a row: backspace deletes rightmost chip
// ---------------------------------------------------------------------------

describe('PromptEditor chip deletion — 3 chips in a row', () => {
  it('deletes the rightmost chip when Backspace is pressed after 3 blurred insertions', () => {
    const onChange = vi.fn();
    const ref = React.createRef<PromptEditorHandle>();

    render(<ControlledEditor initial={emptyDoc()} onDocChange={onChange} editorRef={ref} />);
    const editor = getEditor();

    // Simulate 3 rapid insertions while editor is blurred (no selection inside root).
    act(() => {
      clearSelection();
      ref.current!.insertMediaRef({ id: 'a1', type: 'video', label: 'clip1.mp4' });
    });
    act(() => {
      clearSelection();
      ref.current!.insertMediaRef({ id: 'a2', type: 'image', label: 'img2.jpg' });
    });
    act(() => {
      clearSelection();
      ref.current!.insertMediaRef({ id: 'a3', type: 'audio', label: 'snd3.mp3' });
    });

    // All 3 chips must be present.
    expect(editor.querySelector('[data-media-ref-id="a1"]')).toBeTruthy();
    expect(editor.querySelector('[data-media-ref-id="a2"]')).toBeTruthy();
    expect(editor.querySelector('[data-media-ref-id="a3"]')).toBeTruthy();

    // Place caret at the end of the editor (simulate user clicking into editor
    // after the chips were inserted).
    const lastChild = editor.lastChild!;
    placeCaret(lastChild, lastChild.nodeType === Node.TEXT_NODE ? (lastChild.textContent?.length ?? 0) : 0);

    // Press Backspace — should delete the last chip (a3).
    fireEvent.keyDown(editor, { key: 'Backspace' });

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as PromptDoc;
    const chipIds = last.blocks
      .filter((b) => b.type === 'media-ref')
      .map((b) => (b as { assetId: string }).assetId);
    expect(chipIds).toContain('a1');
    expect(chipIds).toContain('a2');
    expect(chipIds).not.toContain('a3');
    expect(editor.querySelector('[data-media-ref-id="a3"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Case 2 — Backspace through entire chip sequence one by one
// ---------------------------------------------------------------------------

describe('PromptEditor chip deletion — sequential backspace through all chips', () => {
  it('removes each chip in reverse order via repeated Backspace presses', () => {
    const onChange = vi.fn();
    const ref = React.createRef<PromptEditorHandle>();

    render(<ControlledEditor initial={emptyDoc()} onDocChange={onChange} editorRef={ref} />);
    const editor = getEditor();

    // Insert 3 chips while blurred.
    act(() => {
      clearSelection();
      ref.current!.insertMediaRef({ id: 'b1', type: 'video', label: 'v1' });
    });
    act(() => {
      clearSelection();
      ref.current!.insertMediaRef({ id: 'b2', type: 'video', label: 'v2' });
    });
    act(() => {
      clearSelection();
      ref.current!.insertMediaRef({ id: 'b3', type: 'video', label: 'v3' });
    });

    // Helper: place caret at end of editor and press Backspace.
    function backspaceAtEnd(): void {
      const last = editor.lastChild!;
      placeCaret(last, last.nodeType === Node.TEXT_NODE ? (last.textContent?.length ?? 0) : 0);
      fireEvent.keyDown(editor, { key: 'Backspace' });
    }

    backspaceAtEnd();
    expect(editor.querySelector('[data-media-ref-id="b3"]')).toBeNull();
    expect(editor.querySelector('[data-media-ref-id="b2"]')).toBeTruthy();

    backspaceAtEnd();
    expect(editor.querySelector('[data-media-ref-id="b2"]')).toBeNull();
    expect(editor.querySelector('[data-media-ref-id="b1"]')).toBeTruthy();

    backspaceAtEnd();
    expect(editor.querySelector('[data-media-ref-id="b1"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Case 3 — mixed text + chip + chip + text
// ---------------------------------------------------------------------------

describe('PromptEditor chip deletion — mixed text + chip + chip + text', () => {
  it('deletes chips correctly when surrounded by real text', () => {
    const onChange = vi.fn();
    const initial: PromptDoc = {
      schemaVersion: 1,
      blocks: [
        { type: 'text', value: 'intro ' },
        { type: 'media-ref', mediaType: 'video', assetId: 'c1', label: 'vid1' },
        { type: 'media-ref', mediaType: 'image', assetId: 'c2', label: 'img2' },
        { type: 'text', value: ' outro' },
      ],
    };

    render(<ControlledEditor initial={initial} onDocChange={onChange} />);
    const editor = getEditor();

    // Find the text node that starts with ' outro' (it follows the last chip).
    // The DOM order is: textNode("intro "), chip(c1), chip(c2)*, textNode(" outro")
    // OR with empty-pad normalisation: textNode("intro "), chip(c1), textNode(""), chip(c2), textNode(" outro")
    // Either way, the text node containing " outro" is the last child.
    const outroNode = editor.lastChild!;
    expect(outroNode.nodeType).toBe(Node.TEXT_NODE);

    placeCaret(outroNode, 0);
    fireEvent.keyDown(editor, { key: 'Backspace' });

    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as PromptDoc;
    const chipIds = last.blocks
      .filter((b) => b.type === 'media-ref')
      .map((b) => (b as { assetId: string }).assetId);

    // c2 should be gone, c1 should remain.
    expect(chipIds).not.toContain('c2');
    expect(chipIds).toContain('c1');
    expect(editor.querySelector('[data-media-ref-id="c2"]')).toBeNull();
    expect(editor.querySelector('[data-media-ref-id="c1"]')).toBeTruthy();

    // Second backspace: place caret at start of remaining text after c1.
    const nodeAfterC1 = editor.lastChild!;
    placeCaret(nodeAfterC1, 0);
    fireEvent.keyDown(editor, { key: 'Backspace' });

    const last2 = onChange.mock.calls[onChange.mock.calls.length - 1][0] as PromptDoc;
    const chipIds2 = last2.blocks
      .filter((b) => b.type === 'media-ref')
      .map((b) => (b as { assetId: string }).assetId);
    expect(chipIds2).not.toContain('c1');
    expect(editor.querySelector('[data-media-ref-id="c1"]')).toBeNull();
  });
});
