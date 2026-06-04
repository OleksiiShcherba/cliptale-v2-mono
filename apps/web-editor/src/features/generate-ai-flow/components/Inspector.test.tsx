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
 *   - Inspector: voice_picker fields (U2 / AC-16)
 */

import React from 'react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FlowBlock, FlowCanvas } from '@ai-video-editor/project-schema';

// ── Mock @/shared/ai-generation/api (VoicePickerField uses it via hooks) ─────
const { mockListUserVoices, mockListAvailableVoices, mockGetVoiceSampleUrl } = vi.hoisted(() => ({
  mockListUserVoices: vi.fn(),
  mockListAvailableVoices: vi.fn(),
  mockGetVoiceSampleUrl: vi.fn(),
}));

vi.mock('@/shared/ai-generation/api', () => ({
  listUserVoices: mockListUserVoices,
  listAvailableVoices: mockListAvailableVoices,
  getVoiceSampleUrl: mockGetVoiceSampleUrl,
}));

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
  // Voice API defaults (no voices loaded by default; tests that need voices override)
  mockListUserVoices.mockResolvedValue([]);
  mockListAvailableVoices.mockResolvedValue([]);
  mockGetVoiceSampleUrl.mockResolvedValue('https://example.com/sample.mp3');
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

// ── voice_picker (U2 / AC-16) ─────────────────────────────────────────────────
//
// These tests encode the acceptance criteria that the Inspector must render a
// VoicePickerField (not a plain text input) for voice_picker catalog fields, and
// must include required voice_picker fields (previously filtered as required).
//
// Mocking pattern: mock `@/shared/ai-generation/api` (same as VoicePickerField.test.tsx
// and SchemaFieldInput.complex.test.tsx), wrap in QueryClientProvider so React Query
// hooks inside VoicePickerField resolve without network calls.

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function withQuery(ui: ReactNode) {
  return <QueryClientProvider client={makeQueryClient()}>{ui}</QueryClientProvider>;
}

function makeCanvas(block: FlowBlock): FlowCanvas {
  return { blocks: [block], edges: [] };
}

describe('Inspector — voice_picker (U2)', () => {
  // AC-1: TTS voice_id (optional voice_picker) must render VoicePickerField trigger,
  //       NOT a plain text input.
  it('renders a VoicePickerField trigger (not a text input) for elevenlabs/text-to-speech voice_id', () => {
    const block: FlowBlock = {
      blockId: 'tts1',
      type: 'generation',
      position: { x: 0, y: 0 },
      params: { modelId: 'elevenlabs/text-to-speech' },
    };
    render(
      withQuery(
        <Inspector
          selectedBlockId="tts1"
          canvas={makeCanvas(block)}
          onBlockParamsChange={vi.fn()}
        />,
      ),
    );
    // VoicePickerField renders a button "Select a voice…"; a plain text input must NOT appear
    expect(screen.getByRole('button', { name: /select a voice/i })).toBeTruthy();
    // The raw text input that the current code falls back to must be absent
    expect(screen.queryByRole('textbox', { name: /voice/i })).toBeNull();
  });

  // AC-2: STS voice_id is required=true — currently filtered out entirely.
  //       After the fix it must appear as a VoicePickerField.
  it('renders the voice_id VoicePickerField for elevenlabs/speech-to-speech (required field)', () => {
    const block: FlowBlock = {
      blockId: 'sts1',
      type: 'generation',
      position: { x: 0, y: 0 },
      params: { modelId: 'elevenlabs/speech-to-speech' },
    };
    render(
      withQuery(
        <Inspector
          selectedBlockId="sts1"
          canvas={makeCanvas(block)}
          onBlockParamsChange={vi.fn()}
        />,
      ),
    );
    // The voice picker trigger must be present (today it is completely absent)
    expect(screen.getByRole('button', { name: /select a voice/i })).toBeTruthy();
  });

  // AC-3: Choosing a voice via the VoicePickerField onChange path writes
  //       voice_id into the block params via onBlockParamsChange('sts1', { voice_id: '<id>' }).
  it('calls onBlockParamsChange with voice_id when a voice is selected (STS)', async () => {
    const user = userEvent.setup();
    const onParamsChange = vi.fn();

    const VOICE_ID = 'pNInz6obpgDQGcFmaJgB';
    mockListAvailableVoices.mockResolvedValue([
      {
        voiceId: VOICE_ID,
        name: 'Adam',
        category: 'premade',
        description: null,
        previewUrl: 'https://cdn.elevenlabs.io/adam-preview.mp3',
        labels: { gender: 'male', accent: 'american' },
      },
    ]);

    const block: FlowBlock = {
      blockId: 'sts1',
      type: 'generation',
      position: { x: 0, y: 0 },
      params: { modelId: 'elevenlabs/speech-to-speech' },
    };
    render(
      withQuery(
        <Inspector
          selectedBlockId="sts1"
          canvas={makeCanvas(block)}
          onBlockParamsChange={onParamsChange}
        />,
      ),
    );

    // Open the picker
    await user.click(screen.getByRole('button', { name: /select a voice/i }));
    // Wait for library voice to load in the modal
    await screen.findByRole('button', { name: /^Adam$/i });
    await user.click(screen.getByRole('button', { name: /^Adam$/i }));
    await user.click(screen.getByRole('button', { name: /use this voice/i }));

    // The callback must have been called with the voice_id key
    expect(onParamsChange).toHaveBeenCalledWith(
      'sts1',
      expect.objectContaining({ voice_id: VOICE_ID }),
    );
  });

  // AC-4: Other required fields that are wired by canvas connections (those with
  //       modality) must still be excluded from the params panel.
  //       source_audio on STS has modality:'audio' — must NOT appear.
  it('keeps modality-required fields (source_audio) excluded from the params panel', () => {
    const block: FlowBlock = {
      blockId: 'sts1',
      type: 'generation',
      position: { x: 0, y: 0 },
      params: { modelId: 'elevenlabs/speech-to-speech' },
    };
    render(
      withQuery(
        <Inspector
          selectedBlockId="sts1"
          canvas={makeCanvas(block)}
          onBlockParamsChange={vi.fn()}
        />,
      ),
    );
    // source_audio is required+modality — must be absent (wired by canvas edge, not inspector)
    expect(screen.queryByLabelText(/source audio/i)).toBeNull();
    expect(screen.queryByText(/source audio/i)).toBeNull();
  });
});
