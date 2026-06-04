/**
 * Inspector + ContentInput — component tests (T18 / AC-16).
 *
 * Covers:
 *   - ContentInput: typed text entry → params.contentType:'text' + params.text
 *   - ContentInput: file upload     → params.contentType:'asset' + params.fileId
 *   - ContentInput: library pick    → params.contentType:'asset' + params.fileId
 *     (AssetPickerField is mocked; the real component is tested in AssetPickerField.test.tsx)
 *   - Inspector: editing an optional generation param persists keyed by field name
 *   - Inspector: param value retained in the canvas doc after edit
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import type { FlowBlock, FlowCanvas } from '@ai-video-editor/project-schema';

// ── Mock AssetPickerField (the real one needs react-query + API) ──────────────
const { mockAssetPickerField } = vi.hoisted(() => ({
  mockAssetPickerField: vi.fn(),
}));

vi.mock('@/shared/ai-generation/components/AssetPickerField', () => ({
  AssetPickerField: mockAssetPickerField,
}));

// ── Mock useFileUpload (avoids XHR / presigned-URL network calls) ─────────────
const { mockUploadFiles, mockEntries } = vi.hoisted(() => ({
  mockUploadFiles: vi.fn(),
  mockEntries: { current: [] as { fileId: string; status: string }[] },
}));

vi.mock('@/shared/file-upload/useFileUpload', () => ({
  useFileUpload: () => ({
    entries: mockEntries.current,
    isUploading: false,
    uploadFiles: mockUploadFiles,
    clearEntries: vi.fn(),
  }),
}));

import { ContentInput } from './ContentInput';
import { Inspector } from './Inspector';

// ResizeObserver stub needed for @xyflow/react internals
beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockEntries.current = [];
  // Default mock: render a simple button the test can click to simulate pick
  mockAssetPickerField.mockImplementation(
    ({ onChange, label }: { onChange: (v: string) => void; label: string }) => (
      <button
        data-testid="mock-asset-picker"
        onClick={() => onChange('library-file-id-42')}
      >
        {label}
      </button>
    ),
  );
});

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTextBlock(overrides?: Partial<FlowBlock['params']>): FlowBlock {
  return {
    blockId: 'c1',
    type: 'content',
    position: { x: 0, y: 0 },
    params: { contentType: 'text', text: '', modality: 'text', ...overrides },
  };
}

function makeAssetBlock(modality: 'image' | 'audio' | 'video' = 'image'): FlowBlock {
  return {
    blockId: 'c2',
    type: 'content',
    position: { x: 0, y: 0 },
    params: { contentType: 'asset', fileId: '', modality },
  };
}

const LTX_MODEL_ID = 'fal-ai/ltx-2-19b/image-to-video';

function makeGenerationBlock(): FlowBlock {
  return {
    blockId: 'g1',
    type: 'generation',
    position: { x: 300, y: 0 },
    params: { modelId: LTX_MODEL_ID },
  };
}

// ── ContentInput tests ────────────────────────────────────────────────────────

describe('ContentInput — text source', () => {
  it('renders a textarea for a text content block', () => {
    const onChange = vi.fn();
    render(
      <ContentInput block={makeTextBlock()} onBlockParamsChange={onChange} />,
    );
    expect(screen.getByRole('textbox')).toBeDefined();
  });

  it('typing in the textarea writes contentType:text + params.text onto the block', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ContentInput block={makeTextBlock()} onBlockParamsChange={onChange} />,
    );
    const ta = screen.getByRole('textbox');
    await user.type(ta, 'Hello world');
    // Last call should carry contentType:'text' and the typed text
    const lastCall = onChange.mock.calls.at(-1)![0];
    expect(lastCall.contentType).toBe('text');
    expect(lastCall.text).toContain('Hello world');
  });
});

describe('ContentInput — file upload source', () => {
  it('renders a file input for an asset content block', () => {
    const onChange = vi.fn();
    render(
      <ContentInput block={makeAssetBlock()} onBlockParamsChange={onChange} />,
    );
    // Should offer a way to upload a file
    expect(screen.getByTestId('file-upload-input')).toBeDefined();
  });

  it('selecting a file triggers upload and sets contentType:asset + fileId when upload completes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    // Simulate upload completing with fileId 'uploaded-file-99'
    mockEntries.current = [{ fileId: 'uploaded-file-99', status: 'done' }];

    // Re-render with the completed upload entry
    const { rerender } = render(
      <ContentInput block={makeAssetBlock()} onBlockParamsChange={onChange} />,
    );

    // Trigger file selection
    const fileInput = screen.getByTestId('file-upload-input');
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput, file);

    expect(mockUploadFiles).toHaveBeenCalled();

    // Re-render to reflect the completed upload
    rerender(
      <ContentInput block={makeAssetBlock()} onBlockParamsChange={onChange} />,
    );

    // onChange should have been called with contentType:'asset' and the fileId
    const calls = onChange.mock.calls;
    const assetCall = calls.find((c) => c[0].contentType === 'asset' && c[0].fileId === 'uploaded-file-99');
    expect(assetCall).toBeDefined();
  });
});

describe('ContentInput — library pick source', () => {
  it('renders the AssetPickerField for an asset block', () => {
    const onChange = vi.fn();
    render(
      <ContentInput block={makeAssetBlock('image')} onBlockParamsChange={onChange} />,
    );
    expect(screen.getByTestId('mock-asset-picker')).toBeDefined();
  });

  it('picking from library writes contentType:asset + the selected fileId', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ContentInput block={makeAssetBlock('image')} onBlockParamsChange={onChange} />,
    );
    await user.click(screen.getByTestId('mock-asset-picker'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'asset', fileId: 'library-file-id-42' }),
    );
  });
});

// ── Inspector tests ───────────────────────────────────────────────────────────

describe('Inspector — generation block optional params', () => {
  function makeCanvas(block: FlowBlock): FlowCanvas {
    return { blocks: [block], edges: [] };
  }

  it('renders nothing when no block is selected', () => {
    const { container } = render(
      <Inspector selectedBlockId={null} canvas={makeCanvas(makeGenerationBlock())} onBlockParamsChange={vi.fn()} />,
    );
    // Inspector should be empty / not show param fields
    expect(container.textContent?.trim()).toBe('');
  });

  // F2 (AC-15 / AC-07): the Inspector is the surface where a Creator picks/changes
  // the generation block's model — without it changeModel/reconcile is unreachable.
  it('renders a model picker defaulting to the block\'s current model', () => {
    const block = makeGenerationBlock();
    render(
      <Inspector
        selectedBlockId="g1"
        canvas={makeCanvas(block)}
        onBlockParamsChange={vi.fn()}
        onModelChange={vi.fn()}
      />,
    );
    const sel = screen.getByLabelText(/^model$/i) as HTMLSelectElement;
    expect(sel.value).toBe(LTX_MODEL_ID);
  });

  it('calls onModelChange(blockId, newModelId) when a different model is chosen', () => {
    const onModelChange = vi.fn();
    const block = makeGenerationBlock();
    render(
      <Inspector
        selectedBlockId="g1"
        canvas={makeCanvas(block)}
        onBlockParamsChange={vi.fn()}
        onModelChange={onModelChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^model$/i), {
      target: { value: 'elevenlabs/text-to-speech' },
    });
    expect(onModelChange).toHaveBeenCalledWith('g1', 'elevenlabs/text-to-speech');
  });

  it('renders optional param fields for the selected generation block', () => {
    const block = makeGenerationBlock();
    render(
      <Inspector selectedBlockId="g1" canvas={makeCanvas(block)} onBlockParamsChange={vi.fn()} />,
    );
    // LTX model has optional params like "Video Quality", "FPS", "Seed" etc.
    expect(screen.getByLabelText(/video quality/i)).toBeDefined();
  });

  // Review pass 14 (2): the music model exposes ONE length control — 'Length (seconds)'.
  // The legacy 'Music Length (ms)' is catalog-hidden (silent ms-wins precedence confused
  // the Creator); hidden fields never render in the Inspector.
  it('music model shows a single Length (seconds) field and hides catalog-hidden fields', () => {
    const block: FlowBlock = {
      blockId: 'g1',
      type: 'generation',
      position: { x: 0, y: 0 },
      params: { modelId: 'elevenlabs/music-generation' },
    };
    render(
      <Inspector selectedBlockId="g1" canvas={makeCanvas(block)} onBlockParamsChange={vi.fn()} />,
    );
    expect(screen.getByLabelText(/length \(seconds\)/i)).toBeDefined();
    expect(screen.queryByLabelText(/music length \(ms\)/i)).toBeNull();
  });

  it('editing an optional param calls onBlockParamsChange with the field-name key', async () => {
    const user = userEvent.setup();
    const onParamsChange = vi.fn();
    const block = makeGenerationBlock();
    render(
      <Inspector
        selectedBlockId="g1"
        canvas={makeCanvas(block)}
        onBlockParamsChange={onParamsChange}
      />,
    );

    // Find the Seed field (number input) and type a value
    const seedInput = screen.getByLabelText(/^seed$/i);
    await user.clear(seedInput);
    await user.type(seedInput, '42');

    // Should have called onBlockParamsChange at some point with seed:42
    await waitFor(() => {
      const calls = onParamsChange.mock.calls;
      const seedCall = calls.find((c) => c[1].seed !== undefined);
      expect(seedCall).toBeDefined();
      expect(String(seedCall![1].seed)).toContain('4'); // at least '4' typed
    });
  });

  it('retains the edited param in the canvas doc (persists through serialize)', async () => {
    const user = userEvent.setup();
    const capturedParams: Record<string, unknown>[] = [];
    const onParamsChange = vi.fn((_blockId: string, params: Record<string, unknown>) => {
      capturedParams.push(params);
    });

    // Use the Inspector with an updateable block to check persistence
    const block = makeGenerationBlock();
    const { rerender } = render(
      <Inspector
        selectedBlockId="g1"
        canvas={{ blocks: [block], edges: [] }}
        onBlockParamsChange={onParamsChange}
      />,
    );

    const seedInput = screen.getByLabelText(/^seed$/i);
    await user.clear(seedInput);
    await user.type(seedInput, '7');

    // After typing, onBlockParamsChange carries the new seed value
    await waitFor(() => expect(capturedParams.length).toBeGreaterThan(0));

    // Simulate the canvas doc being updated with the new params
    const lastParams = capturedParams.at(-1)!;
    const updatedBlock: FlowBlock = { ...block, params: { ...block.params, ...lastParams } };
    rerender(
      <Inspector
        selectedBlockId="g1"
        canvas={{ blocks: [updatedBlock], edges: [] }}
        onBlockParamsChange={onParamsChange}
      />,
    );

    // The seed field should now display the persisted value
    expect((screen.getByLabelText(/^seed$/i) as HTMLInputElement).value).toContain('7');
  });
});
