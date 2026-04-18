import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { MediaRefBlock, PromptDoc } from '@ai-video-editor/project-schema';

import {
  countTextChars,
  getLinearCaretOffset,
  insertMediaRefAtOffset,
  renderDocToDOM,
  serializeDOMToDoc,
  setLinearCaretOffset,
  type PromptEditorAssetRef,
} from './promptEditorDOM';
import { usePromptEditorHandlers } from './usePromptEditorHandlers';

// Design-guide tokens (matching LeftSidebarTabs.tsx convention)
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const WARNING = '#F59E0B';
const ERROR = '#EF4444';
const PRIMARY_FOCUS = 'rgba(124, 58, 237, 0.5)';

/** Default text-only character limit for the editor surface. */
export const DEFAULT_PROMPT_MAX_CHARS = 2000;

/** Imperative handle exposed to parent components via `ref`. */
export type PromptEditorHandle = {
  /** Injects a media-ref chip at the current caret position. */
  insertMediaRef(asset: PromptEditorAssetRef): void;
  /** Moves keyboard focus to the editor surface. */
  focus(): void;
};

export interface PromptEditorProps {
  /** Controlled PromptDoc. */
  value: PromptDoc;
  /** Called whenever the user's edits produce a new PromptDoc. */
  onChange: (next: PromptDoc) => void;
  /**
   * Maximum number of text-only characters (chips do not count).
   * Defaults to `DEFAULT_PROMPT_MAX_CHARS` (2000).
   */
  maxChars?: number;
}

export const PromptEditor = forwardRef<PromptEditorHandle, PromptEditorProps>(
  function PromptEditor(
    { value, onChange, maxChars = DEFAULT_PROMPT_MAX_CHARS },
    ref,
  ) {
    const editorRef = useRef<HTMLDivElement>(null);
    const lastSerializedRef = useRef<string>('');
    const pendingCaretRef = useRef<number | null>(null);

    // Stable refs to the latest props so effect/handler closures stay correct
    // without needing to tear down and re-subscribe on every render.
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const maxCharsRef = useRef(maxChars);
    maxCharsRef.current = maxChars;

    const [isFocused, setIsFocused] = useState(false);

    // Sync DOM content whenever `value` diverges from what we last emitted.
    useLayoutEffect(() => {
      const root = editorRef.current;
      if (!root) return;
      const serialized = JSON.stringify(value);
      if (serialized !== lastSerializedRef.current) {
        renderDocToDOM(root, value);
        lastSerializedRef.current = serialized;
      }
      if (pendingCaretRef.current !== null) {
        setLinearCaretOffset(root, pendingCaretRef.current);
        pendingCaretRef.current = null;
      }
    }, [value]);

    // Native beforeinput listener — enforces the text-only character limit.
    // Using the DOM API (not React's synthetic onBeforeInput) gives us typed
    // access to `InputEvent.inputType` and `InputEvent.data`.
    useEffect(() => {
      const root = editorRef.current;
      if (!root) return;

      function handleBeforeInput(event: Event): void {
        const e = event as InputEvent;
        const inputType = e.inputType;
        if (inputType !== 'insertText' && inputType !== 'insertFromPaste') return;
        const data = e.data ?? '';
        if (data.length === 0) return;

        const currentDoc = serializeDOMToDoc(root!);
        const currentLen = countTextChars(currentDoc);

        const sel = window.getSelection();
        let replacing = 0;
        if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) {
          replacing = sel.getRangeAt(0).toString().length;
        }

        if (currentLen - replacing + data.length > maxCharsRef.current) {
          e.preventDefault();
        }
      }

      root.addEventListener('beforeinput', handleBeforeInput);
      return () => root.removeEventListener('beforeinput', handleBeforeInput);
    }, []);

    const handleInput = useCallback(() => {
      const root = editorRef.current;
      if (!root) return;
      const doc = serializeDOMToDoc(root);
      lastSerializedRef.current = JSON.stringify(doc);
      onChangeRef.current(doc);
    }, []);

    const emitFromDOM = useCallback((root: HTMLElement) => {
      const doc = serializeDOMToDoc(root);
      lastSerializedRef.current = JSON.stringify(doc);
      onChangeRef.current(doc);
    }, []);

    // DOM event handlers extracted to a dedicated hook to keep this file under
    // the §9.7 300-line cap.
    const { handleKeyDown, handleClick, handleDragOver, handleDrop } =
      usePromptEditorHandlers({
        editorRef,
        pendingCaretRef,
        onChangeRef,
        emitFromDOM,
      });

    useImperativeHandle(
      ref,
      () => ({
        insertMediaRef(asset: PromptEditorAssetRef) {
          const root = editorRef.current;
          if (!root) return;
          const currentDoc = serializeDOMToDoc(root);
          const caretOffset = getLinearCaretOffset(root);
          const chip: MediaRefBlock = {
            type: 'media-ref',
            mediaType: asset.type,
            assetId: asset.id,
            label: asset.label,
          };
          const nextDoc = insertMediaRefAtOffset(currentDoc, caretOffset, chip);
          pendingCaretRef.current = caretOffset + 1;
          onChangeRef.current(nextDoc);
        },
        focus() {
          editorRef.current?.focus();
        },
      }),
      [],
    );

    const textLen = useMemo(() => countTextChars(value), [value]);
    const counterColor =
      textLen >= maxChars
        ? ERROR
        : textLen >= Math.floor(maxChars * 0.9)
          ? WARNING
          : TEXT_SECONDARY;

    return (
      <div style={styles.container}>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Prompt editor"
          data-testid="prompt-editor"
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={{
            ...styles.editor,
            outline: isFocused ? `2px solid ${PRIMARY_FOCUS}` : 'none',
            borderColor: isFocused ? 'transparent' : BORDER,
          }}
        />
        <div
          style={{ ...styles.counter, color: counterColor }}
          data-testid="prompt-editor-counter"
          aria-live="polite"
        >
          {textLen} / {maxChars}
        </div>
      </div>
    );
  },
);

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    width: '100%',
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  editor: {
    minHeight: '160px',
    padding: '12px 14px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    lineHeight: '20px',
    overflowY: 'auto' as const,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  } as React.CSSProperties,

  counter: {
    alignSelf: 'flex-end',
    fontSize: '11px',
    fontWeight: 400,
    lineHeight: '16px',
  } as React.CSSProperties,
} as const;
