import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, waitFor } from '@testing-library/react';

import {
  mockCreateProjectFromStoryboard,
  mockFetchStoryboard,
  mockUseBulkFileStreamUrls,
  renderPage,
  setupStoryboardProjectPageTestLifecycle,
} from './GenerateProjectFromStoryboardPage.test-utils';

describe('GenerateProjectFromStoryboardPage bulk storyboard image URLs', () => {
  setupStoryboardProjectPageTestLifecycle();

  it('bulk-resolves storyboard image URLs before image assembly', async () => {
    mockFetchStoryboard.mockResolvedValue({
      blocks: [
        {
          id: 'scene-1',
          mediaItems: [
            { id: 'media-1', fileId: 'image-file-1', mediaType: 'image', sortOrder: 0 },
            { id: 'media-2', fileId: 'video-file-1', mediaType: 'video', sortOrder: 1 },
          ],
        },
        {
          id: 'scene-2',
          mediaItems: [
            { id: 'media-3', fileId: 'image-file-2', mediaType: 'image', sortOrder: 0 },
          ],
        },
      ],
      edges: [],
      musicBlocks: [],
    });
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-123', versionId: 7 });

    renderPage();

    await waitFor(() => {
      expect(mockUseBulkFileStreamUrls).toHaveBeenCalledWith(['image-file-1', 'image-file-2']);
    });
    await waitFor(() => expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'images'));
  });

  it('waits for bulk-resolved storyboard image URLs before image assembly', async () => {
    const bulkResolvers: Array<() => void> = [];
    mockFetchStoryboard.mockResolvedValue({
      blocks: [
        {
          id: 'scene-1',
          mediaItems: [
            { id: 'media-1', fileId: 'image-file-1', mediaType: 'image', sortOrder: 0 },
            { id: 'media-2', fileId: 'image-file-2', mediaType: 'image', sortOrder: 1 },
          ],
        },
      ],
      edges: [],
      musicBlocks: [],
    });
    mockUseBulkFileStreamUrls.mockImplementation((fileIds: readonly string[]) => {
      const [state, setState] = React.useState({
        urls: {},
        isLoading: false,
        error: null,
        missingFileIds: [],
      });
      const fileIdKey = fileIds.join('|');

      React.useEffect(() => {
        if (fileIds.length === 0) {
          setState({ urls: {}, isLoading: false, error: null, missingFileIds: [] });
          return undefined;
        }

        setState({ urls: {}, isLoading: true, error: null, missingFileIds: [] });
        let active = true;
        const resolveBulk = new Promise<void>((resolve) => {
          bulkResolvers.push(resolve);
        });
        void resolveBulk.then(() => {
          if (!active) return;
          setState({
            urls: Object.fromEntries(fileIds.map((fileId) => [fileId, `https://signed.test/${fileId}`])),
            isLoading: false,
            error: null,
            missingFileIds: [],
          });
        });

        return () => {
          active = false;
        };
      }, [fileIdKey]);

      return state;
    });
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-123', versionId: 7 });

    renderPage();

    await waitFor(() => {
      expect(mockUseBulkFileStreamUrls).toHaveBeenCalledWith(['image-file-1', 'image-file-2']);
    });
    expect(mockCreateProjectFromStoryboard).not.toHaveBeenCalled();

    await act(async () => {
      bulkResolvers.forEach((resolve) => resolve());
      await Promise.resolve();
    });

    await waitFor(() => expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'images'));
  });

  it('continues image assembly when bulk storyboard image URL preload fails', async () => {
    mockFetchStoryboard.mockResolvedValue({
      blocks: [
        {
          id: 'scene-1',
          mediaItems: [
            { id: 'media-1', fileId: 'image-file-1', mediaType: 'image', sortOrder: 0 },
            { id: 'media-2', fileId: 'image-file-2', mediaType: 'image', sortOrder: 1 },
          ],
        },
      ],
      edges: [],
      musicBlocks: [],
    });
    mockUseBulkFileStreamUrls.mockImplementation((fileIds: readonly string[]) => ({
      urls: fileIds.length > 0 ? { 'image-file-1': 'https://signed.test/image-file-1' } : {},
      isLoading: false,
      error: fileIds.length > 0 ? 'POST /files/stream-urls failed: 500' : null,
      missingFileIds: [],
    }));
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-123', versionId: 7 });

    renderPage();

    await waitFor(() => {
      expect(mockUseBulkFileStreamUrls).toHaveBeenCalledWith(['image-file-1', 'image-file-2']);
      expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'images');
    });
  });

  it('continues image assembly when a bulk storyboard image is reported missing', async () => {
    mockFetchStoryboard.mockResolvedValue({
      blocks: [
        {
          id: 'scene-1',
          mediaItems: [
            { id: 'media-1', fileId: 'image-file-1', mediaType: 'image', sortOrder: 0 },
            { id: 'media-2', fileId: 'image-file-missing', mediaType: 'image', sortOrder: 1 },
          ],
        },
      ],
      edges: [],
      musicBlocks: [],
    });
    mockUseBulkFileStreamUrls.mockImplementation((fileIds: readonly string[]) => ({
      urls: fileIds.length > 0 ? { 'image-file-1': 'https://signed.test/image-file-1' } : {},
      isLoading: false,
      error: null,
      missingFileIds: fileIds.includes('image-file-missing') ? ['image-file-missing'] : [],
    }));
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-123', versionId: 7 });

    renderPage();

    await waitFor(() => {
      expect(mockUseBulkFileStreamUrls).toHaveBeenCalledWith(['image-file-1', 'image-file-missing']);
      expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'images');
    });
  });
});
