import type {
  MediaRefBlock,
  PromptBlock,
  PromptDoc,
  TextBlock,
} from '@ai-video-editor/project-schema';

// Pure doc-level helpers (no DOM). Re-exported here so existing import sites
// that import from `./promptEditorDOM` continue to work without changes.
export { countTextChars, insertMediaRefAtOffset } from './promptEditorInsert';

const TEXT_PRIMARY = '#F0F0FA';

// Media-ref chip color palette (docs/design-guide.md §3)
export const CHIP_COLORS: Record<MediaRefBlock['mediaType'], string> = {
  video: '#0EA5E9', // info
  image: '#F59E0B', // warning
  audio: '#10B981', // success
};

/** Asset descriptor accepted by `PromptEditor.insertMediaRef`. */
export type PromptEditorAssetRef = {
  id: string;
  type: MediaRefBlock['mediaType'];
  label: string;
};

/** True when `node` is an element that represents a media-ref chip. */
export function isChipNode(node: Node): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    (node as HTMLElement).hasAttribute('data-media-ref-id')
  );
}

/** Builds a non-editable chip element for a `media-ref` block. */
export function createChipElement(block: MediaRefBlock): HTMLSpanElement {
  const span = document.createElement('span');
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('data-media-ref-id', block.fileId);
  span.setAttribute('data-media-type', block.mediaType);
  span.setAttribute('data-label', block.label);
  Object.assign(span.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',  // space-1 / space-2 tokens (4px grid)
    margin: '0 4px',     // space-1 token (4px grid)
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    lineHeight: '16px',
    color: TEXT_PRIMARY,
    background: CHIP_COLORS[block.mediaType],
    verticalAlign: 'baseline',
    // userSelect: 'all' on the chip wrapper — lets the user select the chip as
    // an atomic unit, but the cross button inside must stop propagation so that
    // clicking it does not accidentally trigger a selection-change that moves
    // the caret outside the chip before the removeChild fires.
    userSelect: 'all',
    cursor: 'default',
  });

  const labelNode = document.createTextNode(block.label);
  span.appendChild(labelNode);

  // × cross-icon delete button
  const btn = document.createElement('button');
  btn.setAttribute('type', 'button');
  btn.setAttribute('aria-label', `Remove ${block.label}`);
  btn.setAttribute('data-chip-remove', 'true');
  Object.assign(btn.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    margin: '0 0 0 4px',   // space-1 token (4px grid)
    width: '16px',          // 4px-grid aligned (radius-sm icon size)
    height: '16px',         // 4px-grid aligned
    borderRadius: '4px',    // radius-sm token
    border: 'none',
    // TODO: refactor to token when chip-button-bg token exists — no opacity token
    // in design-guide §3 for this case; rgba(255,255,255,0.25) is acceptable interim.
    background: 'rgba(255,255,255,0.25)',
    color: TEXT_PRIMARY,
    fontSize: '12px',       // label token (12px 500 Medium) per design-guide §3
    lineHeight: '1',
    cursor: 'pointer',
    flexShrink: '0',
    // Prevent the button click from propagating into the contenteditable area
    // in a way that triggers unwanted focus/caret shifts.
    verticalAlign: 'middle',
  });
  btn.textContent = '×';
  span.appendChild(btn);

  return span;
}

/**
 * Removes `chipEl` from its parent and calls `onRemove` so the host can
 * serialize the updated DOM back to a `PromptDoc`.
 *
 * The button inside the chip uses `e.preventDefault()` / `e.stopPropagation()`
 * so that the click does not fire the contenteditable `input` event or shift
 * the caret to an unexpected position before the removal is committed.
 */
export function removeChipByElement(
  chipEl: HTMLElement,
  onRemove: (root: HTMLElement) => void,
): void {
  const root = chipEl.parentElement;
  if (!root) return;
  root.removeChild(chipEl);
  onRemove(root);
}

/** Replaces `root`'s children with a flat DOM representation of `doc`. */
export function renderDocToDOM(root: HTMLElement, doc: PromptDoc): void {
  while (root.firstChild) root.removeChild(root.firstChild);
  for (const block of doc.blocks) {
    if (block.type === 'text') {
      root.appendChild(document.createTextNode(block.value));
    } else {
      root.appendChild(createChipElement(block));
    }
  }
}

/**
 * Walks `root`'s direct children, merging adjacent text nodes into a single
 * text block and converting chip spans into `media-ref` blocks. Unknown
 * elements (e.g. browser-inserted `<br>`, pasted `<div>` wrappers) are
 * flattened to their `textContent`.
 */
export function serializeDOMToDoc(root: HTMLElement): PromptDoc {
  const blocks: PromptBlock[] = [];

  const pushText = (text: string): void => {
    const last = blocks[blocks.length - 1];
    if (last && last.type === 'text') {
      (last as TextBlock).value += text;
    } else {
      blocks.push({ type: 'text', value: text });
    }
  };

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent ?? '');
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    if (isChipNode(el)) {
      blocks.push({
        type: 'media-ref',
        mediaType: el.getAttribute('data-media-type') as MediaRefBlock['mediaType'],
        fileId: el.getAttribute('data-media-ref-id') ?? '',
        label: el.getAttribute('data-label') ?? '',
      });
    } else {
      pushText(el.textContent ?? '');
    }
  }

  if (blocks.length === 0) blocks.push({ type: 'text', value: '' });
  return { schemaVersion: 1, blocks };
}

/**
 * Linear offset of the current caret measured against `root`, where each text
 * character counts as 1 and each chip counts as 1. Falls back to the end of
 * the document when no selection exists inside `root`.
 */
export function getLinearCaretOffset(root: HTMLElement): number {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0) return totalLinearLength(root);
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) && range.startContainer !== root) {
    return totalLinearLength(root);
  }

  const container = range.startContainer;
  const containerOffset = range.startOffset;
  let offset = 0;

  if (container === root) {
    const children = Array.from(root.childNodes);
    for (let i = 0; i < Math.min(containerOffset, children.length); i++) {
      offset += nodeLinearLength(children[i]);
    }
    return offset;
  }

  for (const node of Array.from(root.childNodes)) {
    if (node === container) {
      return offset + containerOffset;
    }
    if (node.contains(container)) {
      // Caret landed inside a chip (or other element) — treat as at its start.
      return offset;
    }
    offset += nodeLinearLength(node);
  }
  return offset;
}

/** Places the caret at linear offset `target` inside `root`. */
export function setLinearCaretOffset(root: HTMLElement, target: number): void {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel) return;

  let pos = 0;
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? '').length;
      if (target >= pos && target <= pos + len) {
        const range = document.createRange();
        range.setStart(node, target - pos);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      pos += len;
      continue;
    }
    if (isChipNode(node)) {
      if (target === pos) {
        placeCaretBeforeNode(sel, node);
        return;
      }
      pos += 1;
    }
  }

  const last = root.lastChild;
  if (last && last.nodeType === Node.TEXT_NODE) {
    const range = document.createRange();
    range.setStart(last, (last.textContent ?? '').length);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function nodeLinearLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').length;
  }
  if (isChipNode(node)) return 1;
  return (node.textContent ?? '').length;
}

function totalLinearLength(root: HTMLElement): number {
  let len = 0;
  for (const node of Array.from(root.childNodes)) {
    len += nodeLinearLength(node);
  }
  return len;
}

function placeCaretBeforeNode(sel: Selection, node: Node): void {
  const range = document.createRange();
  range.setStartBefore(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
