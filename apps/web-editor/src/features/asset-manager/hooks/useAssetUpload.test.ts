/**
 * Tests for the useAssetUpload backward-compatibility shim.
 *
 * The shim wraps useFileUpload({ target: { kind: 'project', projectId } }).
 * These tests verify that the shim passes through the projectId and that the
 * full upload flow (requestUploadUrl → XHR PUT → finalizeFile → linkFileToProject)
 * still works end-to-end for project callers.
 *
 * Detailed coverage of the shared hook lives in
 * apps/web-editor/src/shared/file-upload/useFileUpload.test.ts.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useAssetUpload } from './useAssetUpload';
import * as sharedApi from '@/shared/file-upload/api';

vi.mock('@/shared/file-upload/api');

const mockRequestUploadUrl = vi.mocked(sharedApi.requestUploadUrl);
const mockFinalizeFile = vi.mocked(sharedApi.finalizeFile);
const mockLinkFileToProject = vi.mocked(sharedApi.linkFileToProject);

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

  triggerLoad(): void {
    this.onload?.(new Event('load'));
  }

  triggerError(): void {
    this.onerror?.();
  }
}

describe('useAssetUpload (compat shim)', () => {
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
    expect(result.current.isUploading).toBe(true);
  });

  it('marks entry done and calls linkFileToProject after successful upload', async () => {
    const { result } = renderHook(() => useAssetUpload({ projectId: 'project-1' }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));
    act(() => xhrInstances[0].triggerLoad());
    await vi.waitFor(() => expect(result.current.entries[0]?.status).toBe('done'));

    expect(mockLinkFileToProject).toHaveBeenCalledWith('project-1', 'file-1');
    expect(result.current.isUploading).toBe(false);
  });

  it('marks entry as error when XHR network error fires', async () => {
    const { result } = renderHook(() => useAssetUpload({ projectId: 'project-1' }));
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));
    act(() => xhrInstances[0].triggerError());
    await vi.waitFor(() => expect(result.current.entries[0]?.status).toBe('error'));

    expect(result.current.entries[0].error).toBeTruthy();
  });

  it('calls onUploadComplete with fileId when upload succeeds', async () => {
    const onUploadComplete = vi.fn();
    const { result } = renderHook(() =>
      useAssetUpload({ projectId: 'project-1', onUploadComplete }),
    );
    const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });

    act(() => result.current.uploadFiles([file]));
    await vi.waitFor(() => expect(xhrInstances.length).toBeGreaterThan(0));
    act(() => xhrInstances[0].triggerLoad());
    await vi.waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith('file-1'));
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
