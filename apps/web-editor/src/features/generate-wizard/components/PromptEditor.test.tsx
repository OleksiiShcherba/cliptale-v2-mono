import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

import type { PromptDoc } from '@ai-video-editor/project-schema';

import { PromptEditor, type PromptEditorHandle } from './PromptEditor';

function emptyDoc(): PromptDoc {
  return { schemaVersion: 1, blocks: [{ type: 'text', value: '' }] };
}

function getEditor(): HTMLDivElement {
  return screen.getByTestId('prompt-editor') as HTMLDivElement;
}

function placeCaret(node: Node, offset: number): void {
  const sel = window.getSelection();
  if (!sel) throw new Error('no selection');
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function fireBeforeInput(
  target: HTMLElement,
  inputType: string,
  data: string | null,
): Event {
  let event: Event;
  try {
    event = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType,
      data,
    });
  } catch {
    event = new Event('beforeinput', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'inputType', { value: inputType });
    Object.defineProperty(event, 'data', { value: data });
  }
  // jsdom's InputEvent implementation sometimes drops `inputType` — force it.
  if ((event as InputEvent).inputType !== inputType) {
    Object.defineProperty(event, 'inputType', { value: inputType });
  }
  if ((event as InputEvent).data !== data) {
    Object.defineProperty(event, 'data', { value: data });
  }
  target.dispatchEvent(event);
  return event;
}

/**
 * Wraps `PromptEditor` in a minimal controlled host so that `onChange` causes a
 * re-render with the new value — mirrors how GenerateWizardPage will use it.
 */
function ControlledEditor({
  initial,
  onDocChange,
  editorRef,
  maxChars,
}: {
  initial: PromptDoc;
  onDocChange?: (doc: PromptDoc) => void;
  editorRef?: React.Ref<PromptEditorHandle>;
  maxChars?: number;
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
      maxChars={maxChars}
    />
  );
}

describe('PromptEditor', () => {
  it('emits a single text block when the user types plain text', () => {
    const onChange = vi.fn();
    render(<ControlledEditor initial={emptyDoc()} onDocChange={onChange} />);
    const editor = getEditor();

    // Simulate the browser appending a text node after an input event.
    while (editor.firstChild) editor.removeChild(editor.firstChild);
    editor.appendChild(document.createTextNode('hello'));
    fireEvent.input(editor);

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as PromptDoc;
    expect(last.blocks).toEqual([{ type: 'text', value: 'hello' }]);
  });

  it('injects a media-ref chip at the caret via insertMediaRef and splits the text', () => {
    const onChange = vi.fn();
    const ref = React.createRef<PromptEditorHandle>();
    const initial: PromptDoc = {
      schemaVersion: 1,
      blocks: [{ type: 'text', value: 'hello world' }],
    };
    render(<ControlledEditor initial={initial} onDocChange={onChange} editorRef={ref} />);
    const editor = getEditor();

    const textNode = editor.firstChild;
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);
    placeCaret(textNode!, 5); // between 'hello' and ' world'

    act(() => {
      ref.current!.insertMediaRef({ id: 'asset-1', type: 'video', label: 'clip.mp4' });
    });

    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as PromptDoc;
    expect(last.blocks).toEqual([
      { type: 'text', value: 'hello' },
      { type: 'media-ref', mediaType: 'video', assetId: 'asset-1', label: 'clip.mp4' },
      { type: 'text', value: ' world' },
    ]);

    // Chip span exists in the DOM with the expected data attributes.
    const chip = editor.querySelector('[data-media-ref-id="asset-1"]') as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.getAttribute('data-media-type')).toBe('video');
    expect(chip.getAttribute('data-label')).toBe('clip.mp4');
    expect(chip.getAttribute('contenteditable')).toBe('false');
  });

  it('deletes a preceding chip when Backspace is pressed immediately after it', () => {
    const onChange = vi.fn();
    const initial: PromptDoc = {
      schemaVersion: 1,
      blocks: [
        { type: 'text', value: 'hi ' },
        { type: 'media-ref', mediaType: 'video', assetId: 'a1', label: 'vid' },
        { type: 'text', value: ' bye' },
      ],
    };
    render(<ControlledEditor initial={initial} onDocChange={onChange} />);
    const editor = getEditor();

    // Third root child should be the ' bye' text node.
    const afterChip = editor.childNodes[2];
    expect(afterChip?.nodeType).toBe(Node.TEXT_NODE);
    placeCaret(afterChip!, 0);

    fireEvent.keyDown(editor, { key: 'Backspace' });

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as PromptDoc;
    expect(last.blocks).toEqual([{ type: 'text', value: 'hi  bye' }]);
    expect(editor.querySelector('[data-media-ref-id="a1"]')).toBeNull();
  });

  it('blocks keystrokes that would exceed maxChars (chips do not count)', () => {
    const onChange = vi.fn();
    const initial: PromptDoc = {
      schemaVersion: 1,
      blocks: [
        { type: 'text', value: 'hello' },
        { type: 'media-ref', mediaType: 'image', assetId: 'img', label: 'pic' },
        { type: 'text', value: '' },
      ],
    };
    render(
      <ControlledEditor initial={initial} onDocChange={onChange} maxChars={5} />,
    );
    const editor = getEditor();

    const event = fireBeforeInput(editor, 'insertText', 'X');
    expect(event.defaultPrevented).toBe(true);

    // Counter shows the text-only length, which equals maxChars (5), not 6.
    const counter = screen.getByTestId('prompt-editor-counter');
    expect(counter.textContent).toBe('5 / 5');
  });

  it('round-trips a mixed text + chip document through insertMediaRef', () => {
    const onChange = vi.fn();
    const ref = React.createRef<PromptEditorHandle>();
    const initial: PromptDoc = {
      schemaVersion: 1,
      blocks: [
        { type: 'text', value: 'A' },
        { type: 'media-ref', mediaType: 'image', assetId: 'img1', label: 'pic' },
        { type: 'text', value: 'B' },
      ],
    };
    render(<ControlledEditor initial={initial} onDocChange={onChange} editorRef={ref} />);
    const editor = getEditor();

    // Place caret at the end of trailing 'B'
    const lastText = editor.lastChild;
    expect(lastText?.nodeType).toBe(Node.TEXT_NODE);
    placeCaret(lastText!, 1);

    act(() => {
      ref.current!.insertMediaRef({ id: 'vid1', type: 'video', label: 'clip' });
    });

    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as PromptDoc;
    expect(last.blocks).toEqual([
      { type: 'text', value: 'A' },
      { type: 'media-ref', mediaType: 'image', assetId: 'img1', label: 'pic' },
      { type: 'text', value: 'B' },
      { type: 'media-ref', mediaType: 'video', assetId: 'vid1', label: 'clip' },
      { type: 'text', value: '' },
    ]);

    // Both chips are present in the DOM after the controlled re-render.
    expect(editor.querySelector('[data-media-ref-id="img1"]')).toBeTruthy();
    expect(editor.querySelector('[data-media-ref-id="vid1"]')).toBeTruthy();
  });

  it('renders the character counter using only text-block lengths', () => {
    const initial: PromptDoc = {
      schemaVersion: 1,
      blocks: [
        { type: 'text', value: 'abc' },
        { type: 'media-ref', mediaType: 'image', assetId: 'a1', label: 'img' },
        { type: 'text', value: 'de' },
      ],
    };
    render(<ControlledEditor initial={initial} />);
    expect(screen.getByTestId('prompt-editor-counter').textContent).toBe('5 / 2000');
  });
});
