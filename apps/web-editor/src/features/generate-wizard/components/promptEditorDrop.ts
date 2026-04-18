/**
 * Drop-point resolution helpers for `PromptEditor`.
 *
 * Extracted into its own file so that `PromptEditor.tsx` and
 * `promptEditorDOM.ts` both stay under the §9.7 300-line cap.
 */

import { isChipNode } from './promptEditorDOM';

/**
 * Computes a linear caret offset within `root` at the given client coordinates
 * using `document.caretPositionFromPoint` (standard) with a
 * `document.caretRangeFromPoint` fallback (Chrome/WebKit legacy).
 *
 * Falls back to append-at-end when neither API is supported or the resolved
 * position is outside `root`.
 */
export function resolveCaretOffsetAtPoint(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): number {
  let node: Node | null = null;
  let nodeOffset = 0;

  type DocWithLegacyCaret = Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  // Standard W3C API (Firefox, modern engines)
  if (typeof document.caretPositionFromPoint === 'function') {
    const pos = document.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      node = pos.offsetNode;
      nodeOffset = pos.offset;
    }
  } else if (
    typeof (document as DocWithLegacyCaret).caretRangeFromPoint === 'function'
  ) {
    // Legacy WebKit/Chrome fallback
    const range = (document as DocWithLegacyCaret).caretRangeFromPoint!(
      clientX,
      clientY,
    );
    if (range) {
      node = range.startContainer;
      nodeOffset = range.startOffset;
    }
  }

  if (!node || (!root.contains(node) && node !== root)) {
    // Drop was outside editor content — append at end.
    return totalDropLinearLength(root);
  }

  // Selection at the root child-index level (element-level selection).
  if (node === root) {
    let offset = 0;
    const children = Array.from(root.childNodes);
    for (let i = 0; i < Math.min(nodeOffset, children.length); i++) {
      offset += dropNodeLength(children[i]);
    }
    return offset;
  }

  // Selection inside a direct-child text node or chip.
  let offset = 0;
  for (const child of Array.from(root.childNodes)) {
    if (child === node) {
      return offset + nodeOffset;
    }
    if (child.contains(node)) {
      // Dropped inside a chip element — treat as before the chip.
      return offset;
    }
    offset += dropNodeLength(child);
  }

  return offset;
}

function dropNodeLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').length;
  if (isChipNode(node)) return 1;
  return (node.textContent ?? '').length;
}

function totalDropLinearLength(root: HTMLElement): number {
  let len = 0;
  for (const node of Array.from(root.childNodes)) {
    len += dropNodeLength(node);
  }
  return len;
}
