import type {
  MediaRefBlock,
  PromptBlock,
  PromptDoc,
  TextBlock,
} from '@ai-video-editor/project-schema';

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
  span.setAttribute('data-media-ref-id', block.assetId);
  span.setAttribute('data-media-type', block.mediaType);
  span.setAttribute('data-label', block.label);
  Object.assign(span.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    margin: '0 2px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    lineHeight: '16px',
    color: TEXT_PRIMARY,
    background: CHIP_COLORS[block.mediaType],
    verticalAlign: 'baseline',
    userSelect: 'all',
    cursor: 'default',
  });
  span.textContent = block.label;
  return span;
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
        assetId: el.getAttribute('data-media-ref-id') ?? '',
        label: el.getAttribute('data-label') ?? '',
      });
    } else {
      pushText(el.textContent ?? '');
    }
  }

  if (blocks.length === 0) blocks.push({ type: 'text', value: '' });
  return { schemaVersion: 1, blocks };
}

/** Total number of text characters in `doc` (chips are not counted). */
export function countTextChars(doc: PromptDoc): number {
  let total = 0;
  for (const b of doc.blocks) {
    if (b.type === 'text') total += b.value.length;
  }
  return total;
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

/**
 * Inserts `chip` at linear offset `offset` within `doc`. Splits the containing
 * text block when the offset falls inside one, and pads with empty text blocks
 * at chip-adjacent boundaries so the result remains walkable.
 */
export function insertMediaRefAtOffset(
  doc: PromptDoc,
  offset: number,
  chip: MediaRefBlock,
): PromptDoc {
  const out: PromptBlock[] = [];
  let pos = 0;
  let inserted = false;

  for (const block of doc.blocks) {
    if (inserted) {
      out.push(block);
      continue;
    }

    if (block.type === 'text') {
      const len = block.value.length;
      if (offset >= pos && offset <= pos + len) {
        const split = offset - pos;
        out.push({ type: 'text', value: block.value.slice(0, split) });
        out.push(chip);
        out.push({ type: 'text', value: block.value.slice(split) });
        inserted = true;
      } else {
        out.push(block);
      }
      pos += len;
      continue;
    }

    // chip block
    if (offset === pos) {
      out.push({ type: 'text', value: '' });
      out.push(chip);
      out.push(block);
      inserted = true;
    } else {
      out.push(block);
    }
    pos += 1;
  }

  if (!inserted) {
    if (out.length === 0 || out[out.length - 1].type !== 'text') {
      out.push({ type: 'text', value: '' });
    }
    out.push(chip);
    out.push({ type: 'text', value: '' });
  }

  return { schemaVersion: 1, blocks: out };
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
