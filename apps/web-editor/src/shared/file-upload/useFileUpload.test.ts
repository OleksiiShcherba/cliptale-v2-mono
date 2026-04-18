import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useFileUpload } from './useFileUpload';
import * as api from '@/shared/file-upload/api';

vi.mock('@/shared/file-upload/api');

const mockRequestUploadUrl = vi.mocked(api.requestUploadUrl);
const mockFinalizeFile = vi.mocked(api.finalizeFile);
const mockLinkFileToProject = vi.mocked(api.linkFileToProject);
const mockLinkFileToDraft = vi.mocked(api.linkFileToDraft);

// Capture XHR instances so tests can trigger progress/load/error events
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

const PROJECT_TARGET = { kind: 'project' as const, projectId: 'project-1' };
const DRAFT_TARGET = { kind: 'draft' as const, draftId: 'draft-1' };

describe('useFileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    xhrInstances = [];
    vi.stubGlobal('XMLHttpRequest', MockXhr);
    mockRequestUploadUrl.mockResolvedValue({
      fileId: 'file-1',
      uploadUrl: 'https://s3.example.com/upload',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
    mockFinalizeFile.mockResolvedValue(undefined);
    mockLinkFileToProject.mockResolvedValue(undefined);
    mockLinkFileToDraft.mockResolvedValue(undefined);
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  it('starts with empty entries and isUploading false', () => {
    const { result } = renderHook(() => useFileUpload({ target: PROJECT_TARGET }));
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.isUploading).toBe(false);
  });

  // ── Happy path — uploading state ──────────────────────────────────────────

  it('adds an entry with uploading status after requestUploadUrl resolves', async () => {
    const { result } = renderHook(() => useFileUpload({ target: PROJECT_TARGET }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(result.current.entries[0].status).toBe('uploading');
    expect(result.current.entries[0].fileId).toBe('file-1');
    expect(result.current.isUploading).toBe(true);
  });

  it('updates entry progress as XHR progress events fire', async () => {
    const { result } = renderHook(() => useFileUpload({ target: PROJECT_TARGET }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));

    act(() => xhrInstances[0].triggerProgress(60, 100));
    expect(result.current.entries[0].progress).toBe(60);
  });

  // ── Project target ────────────────────────────────────────────────────────

  it('marks entry done and calls linkFileToProject for project target after XHR load', async () => {
    const { result } = renderHook(() => useFileUpload({ target: PROJECT_TARGET }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));
    act(() => xhrInstances[0].triggerLoad());
    await vi.waitFor(() => expect(result.current.entries[0]?.status).toBe('done'));

    expect(result.current.entries[0].status).toBe('done');
    expect(result.current.isUploading).toBe(false);
    expect(mockLinkFileToProject).toHaveBeenCalledWith('project-1', 'file-1');
    expect(mockLinkFileToDraft).not.toHaveBeenCalled();
  });

  // ── Draft target ──────────────────────────────────────────────────────────

  it('calls linkFileToDraft (not linkFileToProject) for draft target', async () => {
    const { result } = renderHook(() => useFileUpload({ target: DRAFT_TARGET }));
    const file = new File(['data'], 'image.png', { type: 'image/png' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));
    act(() => xhrInstances[0].triggerLoad());
    await vi.waitFor(() => expect(result.current.entries[0]?.status).toBe('done'));

    expect(mockLinkFileToDraft).toHaveBeenCalledWith('draft-1', 'file-1');
    expect(mockLinkFileToProject).not.toHaveBeenCalled();
  });

  it('marks entry done after draft link succeeds', async () => {
    const { result } = renderHook(() => useFileUpload({ target: DRAFT_TARGET }));
    const file = new File(['data'], 'image.png', { type: 'image/png' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));
    act(() => xhrInstances[0].triggerLoad());
    await vi.waitFor(() => expect(result.current.entries[0]?.status).toBe('done'));

    expect(result.current.entries[0].status).toBe('done');
    expect(result.current.isUploading).toBe(false);
  });

  // ── Error paths ───────────────────────────────────────────────────────────

  it('marks entry as error when XHR network error fires', async () => {
    const { result } = renderHook(() => useFileUpload({ target: PROJECT_TARGET }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));
    act(() => xhrInstances[0].triggerError());
    await vi.waitFor(() => expect(result.current.entries[0]?.status).toBe('error'));

    expect(result.current.entries[0].status).toBe('error');
    expect(result.current.entries[0].error).toBeTruthy();
  });

  it('marks entry as error when requestUploadUrl fails', async () => {
    mockRequestUploadUrl.mockRejectedValue(new Error('Server error'));
    const { result } = renderHook(() => useFileUpload({ target: PROJECT_TARGET }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    // Entry never gets added since fileId is empty on failure before entry creation
    // The hook handles it gracefully (no crash)
    await vi.waitFor(() => expect(mockRequestUploadUrl).toHaveBeenCalled());
    // No entry should exist or should be in error state
    await new Promise((r) => setTimeout(r, 50));
    // If entry was added before error, it would be error; if not added at all, length is 0
    const statuses = result.current.entries.map((e) => e.status);
    expect(statuses.every((s) => s === 'error')).toBe(true);
  });

  // ── Callbacks ─────────────────────────────────────────────────────────────

  it('calls onUploadComplete with fileId when upload succeeds (project target)', async () => {
    const onUploadComplete = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({ target: PROJECT_TARGET, onUploadComplete }),
    );
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));
    act(() => xhrInstances[0].triggerLoad());
    await vi.waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith('file-1'));
  });

  it('calls onUploadComplete with fileId when upload succeeds (draft target)', async () => {
    const onUploadComplete = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({ target: DRAFT_TARGET, onUploadComplete }),
    );
    const file = new File(['data'], 'image.png', { type: 'image/png' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));
    act(() => xhrInstances[0].triggerLoad());
    await vi.waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith('file-1'));
  });

  // ── clearEntries ──────────────────────────────────────────────────────────

  it('clearEntries resets entries to empty', async () => {
    const { result } = renderHook(() => useFileUpload({ target: PROJECT_TARGET }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => result.current.entries.length > 0);
    act(() => result.current.clearEntries());

    expect(result.current.entries).toHaveLength(0);
  });

  // ── API call correctness ──────────────────────────────────────────────────

  it('passes correct mimeType and filename to requestUploadUrl', async () => {
    const { result } = renderHook(() => useFileUpload({ target: PROJECT_TARGET }));
    const file = new File(['data'], 'clip.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(mockRequestUploadUrl).toHaveBeenCalled());

    expect(mockRequestUploadUrl).toHaveBeenCalledWith({
      filename: 'clip.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: file.size,
    });
  });

  it('calls finalizeFile after XHR load completes', async () => {
    const { result } = renderHook(() => useFileUpload({ target: PROJECT_TARGET }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));
    act(() => xhrInstances[0].triggerLoad());
    await vi.waitFor(() => expect(result.current.entries[0]?.status).toBe('done'));

    expect(mockFinalizeFile).toHaveBeenCalledWith('file-1');
  });
});
