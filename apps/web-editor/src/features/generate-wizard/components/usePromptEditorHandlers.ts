/**
 * Encapsulates the DOM-event handlers for `PromptEditor`:
 *  - `handleKeyDown` — backspace-deletes chips
 *  - `handleClick` — × button removes chips
 *  - `handleDragOver` — allows asset payloads to be dropped
 *  - `handleDrop` — inserts a chip at the drop point
 *
 * Extracted into its own file so that `PromptEditor.tsx` stays under the
 * §9.7 300-line cap.
 */

import React, { useCallback } from 'react';

import type { MediaRefBlock, PromptDoc } from '@ai-video-editor/project-schema';

import {
  insertMediaRefAtOffset,
  isChipNode,
  removeChipByElement,
  serializeDOMToDoc,
} from './promptEditorDOM';
import { resolveCaretOffsetAtPoint } from './promptEditorDrop';

/** MIME type used for cross-component drag payloads. */
export const ASSET_DRAG_MIME = 'application/x-cliptale-asset';

export type EmitFromDOMFn = (root: HTMLElement) => void;

export interface PromptEditorHandlerDeps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  pendingCaretRef: React.MutableRefObject<number | null>;
  onChangeRef: React.MutableRefObject<(doc: PromptDoc) => void>;
  emitFromDOM: EmitFromDOMFn;
}

/**
 * Returns stable DOM-event handlers for `PromptEditor`. Handlers are memoised
 * with `useCallback` and reference only the passed-in refs, so the returned
 * callbacks are stable across renders.
 */
export function usePromptEditorHandlers({
  editorRef,
  pendingCaretRef,
  onChangeRef,
  emitFromDOM,
}: PromptEditorHandlerDeps) {
  /** Backspace: walk backward past empty text nodes to delete preceding chips. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Backspace') return;
      const root = editorRef.current;
      if (!root) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return;

      // Caret at offset 0 of a text node — walk backward past consecutive
      // empty text nodes to find the nearest preceding chip.
      if (
        range.startContainer.nodeType === Node.TEXT_NODE &&
        range.startOffset === 0
      ) {
        let prev: ChildNode | null = range.startContainer.previousSibling;
        while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent === '') {
          prev = prev.previousSibling;
        }
        if (prev && isChipNode(prev)) {
          e.preventDefault();
          prev.parentNode?.removeChild(prev);
          emitFromDOM(root);
        }
        return;
      }

      // Caret directly on root (element-level selection) right after a chip.
      if (range.startContainer === root && range.startOffset > 0) {
        const prev = root.childNodes[range.startOffset - 1];
        if (prev && isChipNode(prev)) {
          e.preventDefault();
          root.removeChild(prev);
          emitFromDOM(root);
        }
      }
    },
    [editorRef, emitFromDOM],
  );

  /**
   * Click: when the × button inside a chip is clicked, remove the chip
   * without shifting the caret to an unexpected position.
   */
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const root = editorRef.current;
      if (!root) return;
      const target = e.target as HTMLElement;
      const btn = target.closest('[data-chip-remove]') as HTMLElement | null;
      if (!btn) return;
      const chip = btn.closest('[data-media-ref-id]') as HTMLElement | null;
      if (!chip) return;
      e.preventDefault();
      e.stopPropagation();
      removeChipByElement(chip, emitFromDOM);
    },
    [editorRef, emitFromDOM],
  );

  /** DragOver: accept only cliptale-asset payloads. */
  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes(ASSET_DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [],
  );

  /**
   * Drop: parse the asset payload and insert a chip at the drop-point caret
   * offset, reusing the same `insertMediaRefAtOffset` path as `insertMediaRef`.
   */
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes(ASSET_DRAG_MIME)) return;
      e.preventDefault();
      const root = editorRef.current;
      if (!root) return;

      let payload: { fileId: string; type: string; label: string } | null = null;
      try {
        payload = JSON.parse(e.dataTransfer.getData(ASSET_DRAG_MIME)) as {
          fileId: string;
          type: string;
          label: string;
        };
      } catch {
        return;
      }
      if (!payload) return;

      const caretOffset = resolveCaretOffsetAtPoint(root, e.clientX, e.clientY);
      const chip: MediaRefBlock = {
        type: 'media-ref',
        mediaType: payload.type as MediaRefBlock['mediaType'],
        fileId: payload.fileId,
        label: payload.label,
      };
      const currentDoc = serializeDOMToDoc(root);
      const nextDoc = insertMediaRefAtOffset(currentDoc, caretOffset, chip);
      pendingCaretRef.current = caretOffset + 1;
      onChangeRef.current(nextDoc);
    },
    [editorRef, pendingCaretRef, onChangeRef],
  );

  return { handleKeyDown, handleClick, handleDragOver, handleDrop };
}
