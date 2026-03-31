import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useAssetUpload } from './useAssetUpload';
import * as api from '@/features/asset-manager/api';
import type { Asset } from '@/features/asset-manager/types';

vi.mock('@/features/asset-manager/api');

const mockRequestUploadUrl = vi.mocked(api.requestUploadUrl);
const mockFinalizeAsset = vi.mocked(api.finalizeAsset);

// Capture XHR instances so tests can trigger progress/load/error
let xhrInstances: MockXhr[] = [];

class MockXhr {
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: ((e: Event) => void) | null = null;
  onerror: (() => void) | null = null;
  status = 200;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();

  constructor() {
    xhrInstances.push(this);
  }

  triggerProgress(loaded: number, total: number): void {
    this.upload.onprogress?.(
      new ProgressEvent('progress', { loaded, total, lengthComputable: true }),
    );
  }

  triggerLoad(): void {
    this.onload?.(new Event('load'));
  }

  triggerError(): void {
    this.onerror?.();
  }
}

function makeAsset(): Asset {
  return {
    id: 'asset-1',
    projectId: 'project-1',
    filename: 'video.mp4',
    contentType: 'video/mp4',
    storageUri: 's3://bucket/key',
    status: 'processing',
    durationSeconds: null,
    width: null,
    height: null,
    fileSizeBytes: 1024,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('useAssetUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    xhrInstances = [];
    vi.stubGlobal('XMLHttpRequest', MockXhr);
    mockRequestUploadUrl.mockResolvedValue({
      assetId: 'asset-1',
      uploadUrl: 'https://s3.example.com/upload',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
    mockFinalizeAsset.mockResolvedValue(makeAsset());
  });

  it('starts with empty entries and isUploading false', () => {
    const { result } = renderHook(() => useAssetUpload({ projectId: 'project-1' }));
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.isUploading).toBe(false);
  });

  it('adds an entry with uploading status after requestUploadUrl resolves', async () => {
    const { result } = renderHook(() => useAssetUpload({ projectId: 'project-1' }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(result.current.entries[0].status).toBe('uploading');
    expect(result.current.entries[0].assetId).toBe('asset-1');
    expect(result.current.isUploading).toBe(true);
  });

  it('updates entry progress as XHR progress events fire', async () => {
    const { result } = renderHook(() => useAssetUpload({ projectId: 'project-1' }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));

    act(() => xhrInstances[0].triggerProgress(60, 100));
    expect(result.current.entries[0].progress).toBe(60);
  });

  it('marks entry done after XHR load event and finalize resolve', async () => {
    const { result } = renderHook(() => useAssetUpload({ projectId: 'project-1' }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));
    act(() => xhrInstances[0].triggerLoad());
    await vi.waitFor(() => expect(result.current.entries[0]?.status).toBe('done'));

    expect(result.current.entries[0].status).toBe('done');
    expect(result.current.isUploading).toBe(false);
  });

  it('marks entry as error when XHR network error fires', async () => {
    const { result } = renderHook(() => useAssetUpload({ projectId: 'project-1' }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));
    act(() => xhrInstances[0].triggerError());
    await vi.waitFor(() => expect(result.current.entries[0]?.status).toBe('error'));

    expect(result.current.entries[0].status).toBe('error');
    expect(result.current.entries[0].error).toBeTruthy();
  });

  it('calls onUploadComplete with assetId when upload succeeds', async () => {
    const onUploadComplete = vi.fn();
    const { result } = renderHook(() =>
      useAssetUpload({ projectId: 'project-1', onUploadComplete }),
    );
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));
    act(() => xhrInstances[0].triggerLoad());
    await vi.waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith('asset-1'));
  });

  it('clearEntries resets entries to empty', async () => {
    const { result } = renderHook(() => useAssetUpload({ projectId: 'project-1' }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => result.current.entries.length > 0);
    act(() => result.current.clearEntries());

    expect(result.current.entries).toHaveLength(0);
  });
});
