/**
 * Tests for storyboard/api.ts — scene template CRUD functions.
 *
 * Covers:
 * - listSceneTemplates: GET /scene-templates (with and without search param)
 * - createSceneTemplate: POST /scene-templates with correct body
 * - getSceneTemplate: GET /scene-templates/:id
 * - updateSceneTemplate: PUT /scene-templates/:id with correct body
 * - deleteSceneTemplate: DELETE /scene-templates/:id
 * - addTemplateToStoryboard: POST /scene-templates/:id/add-to-storyboard with { draftId }
 * - Error propagation when API returns non-ok status
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}));

// ── Import SUT after mocks are set up ─────────────────────────────────────────

import {
  listSceneTemplates,
  createSceneTemplate,
  getSceneTemplate,
  updateSceneTemplate,
  deleteSceneTemplate,
  addTemplateToStoryboard,
} from '../api';

import type { SceneTemplate, CreateSceneTemplatePayload, UpdateSceneTemplatePayload } from '../types';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const mockTemplate: SceneTemplate = {
  id: 'tpl-001',
  userId: 'user-123',
  name: 'Intro Scene',
  prompt: 'A dramatic opening shot of a cityscape at sunset',
  durationS: 5,
  style: 'cinematic-glow',
  mediaItems: [
    {
      id: 'media-001',
      templateId: 'tpl-001',
      fileId: 'file-abc',
      mediaType: 'image',
      sortOrder: 0,
    },
  ],
  createdAt: '2026-04-23T10:00:00Z',
  updatedAt: '2026-04-23T10:00:00Z',
};

/** Returns a mock Response-like object for apiClient methods. */
function mockOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  };
}

function mockErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({ error: 'not found' }),
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('listSceneTemplates', () => {
  it('should call GET /scene-templates without query param when no search is provided', async () => {
    mockApiClient.get.mockResolvedValue(mockOkResponse({ items: [mockTemplate] }));

    const result = await listSceneTemplates();

    expect(mockApiClient.get).toHaveBeenCalledWith('/scene-templates');
    expect(result).toEqual({ items: [mockTemplate] });
  });

  it('should call GET /scene-templates?search=<encoded> when search is provided', async () => {
    mockApiClient.get.mockResolvedValue(mockOkResponse({ items: [] }));

    await listSceneTemplates('city sunset');

    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/scene-templates?search=city%20sunset',
    );
  });

  it('should URL-encode special characters in the search param', async () => {
    mockApiClient.get.mockResolvedValue(mockOkResponse({ items: [] }));

    await listSceneTemplates('a&b=c');

    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/scene-templates?search=a%26b%3Dc',
    );
  });

  it('should throw when the API returns a non-ok status', async () => {
    mockApiClient.get.mockResolvedValue(mockErrorResponse(500));

    await expect(listSceneTemplates()).rejects.toThrow(
      'GET /scene-templates failed: 500',
    );
  });
});

describe('createSceneTemplate', () => {
  it('should call POST /scene-templates with the correct body', async () => {
    mockApiClient.post.mockResolvedValue(mockOkResponse(mockTemplate));

    const payload: CreateSceneTemplatePayload = {
      name: 'Intro Scene',
      prompt: 'A dramatic opening shot',
      durationS: 5,
      style: 'cinematic-glow',
      mediaItems: [{ fileId: 'file-abc', mediaType: 'image', sortOrder: 0 }],
    };

    const result = await createSceneTemplate(payload);

    expect(mockApiClient.post).toHaveBeenCalledWith('/scene-templates', payload);
    expect(result).toEqual(mockTemplate);
  });

  it('should call POST /scene-templates without optional fields when omitted', async () => {
    mockApiClient.post.mockResolvedValue(mockOkResponse(mockTemplate));

    const payload: CreateSceneTemplatePayload = {
      name: 'Minimal Scene',
      prompt: 'A simple scene',
      durationS: 3,
    };

    await createSceneTemplate(payload);

    expect(mockApiClient.post).toHaveBeenCalledWith('/scene-templates', payload);
  });

  it('should throw when the API returns a non-ok status', async () => {
    mockApiClient.post.mockResolvedValue(mockErrorResponse(400));

    await expect(
      createSceneTemplate({ name: 'x', prompt: 'y', durationS: 1 }),
    ).rejects.toThrow('POST /scene-templates failed: 400');
  });
});

describe('getSceneTemplate', () => {
  it('should call GET /scene-templates/:id with the correct id', async () => {
    mockApiClient.get.mockResolvedValue(mockOkResponse(mockTemplate));

    const result = await getSceneTemplate('tpl-001');

    expect(mockApiClient.get).toHaveBeenCalledWith('/scene-templates/tpl-001');
    expect(result).toEqual(mockTemplate);
  });

  it('should throw when the API returns 404', async () => {
    mockApiClient.get.mockResolvedValue(mockErrorResponse(404));

    await expect(getSceneTemplate('nonexistent')).rejects.toThrow(
      'GET /scene-templates/nonexistent failed: 404',
    );
  });

  it('should throw when the API returns 401', async () => {
    mockApiClient.get.mockResolvedValue(mockErrorResponse(401));

    await expect(getSceneTemplate('tpl-001')).rejects.toThrow(
      'GET /scene-templates/tpl-001 failed: 401',
    );
  });
});

describe('updateSceneTemplate', () => {
  it('should call PUT /scene-templates/:id with the correct body', async () => {
    const updated = { ...mockTemplate, name: 'Updated Name' };
    mockApiClient.put.mockResolvedValue(mockOkResponse(updated));

    const payload: UpdateSceneTemplatePayload = { name: 'Updated Name' };
    const result = await updateSceneTemplate('tpl-001', payload);

    expect(mockApiClient.put).toHaveBeenCalledWith('/scene-templates/tpl-001', payload);
    expect(result.name).toBe('Updated Name');
  });

  it('should support updating mediaItems list in the payload', async () => {
    mockApiClient.put.mockResolvedValue(mockOkResponse(mockTemplate));

    const payload: UpdateSceneTemplatePayload = {
      mediaItems: [
        { fileId: 'file-new', mediaType: 'video', sortOrder: 0 },
      ],
    };

    await updateSceneTemplate('tpl-001', payload);

    expect(mockApiClient.put).toHaveBeenCalledWith('/scene-templates/tpl-001', payload);
  });

  it('should throw when the API returns a non-ok status', async () => {
    mockApiClient.put.mockResolvedValue(mockErrorResponse(403));

    await expect(
      updateSceneTemplate('tpl-001', { name: 'x' }),
    ).rejects.toThrow('PUT /scene-templates/tpl-001 failed: 403');
  });
});

describe('deleteSceneTemplate', () => {
  it('should call DELETE /scene-templates/:id', async () => {
    mockApiClient.delete.mockResolvedValue({ ok: true, status: 204 });

    await deleteSceneTemplate('tpl-001');

    expect(mockApiClient.delete).toHaveBeenCalledWith('/scene-templates/tpl-001');
  });

  it('should resolve without error on success', async () => {
    mockApiClient.delete.mockResolvedValue({ ok: true, status: 204 });

    await expect(deleteSceneTemplate('tpl-001')).resolves.toBeUndefined();
  });

  it('should throw when the API returns a non-ok status', async () => {
    mockApiClient.delete.mockResolvedValue(mockErrorResponse(404));

    await expect(deleteSceneTemplate('nonexistent')).rejects.toThrow(
      'DELETE /scene-templates/nonexistent failed: 404',
    );
  });
});

describe('addTemplateToStoryboard', () => {
  it('should call POST /scene-templates/:id/add-to-storyboard with { draftId }', async () => {
    const newBlock = {
      id: 'block-999',
      draftId: 'draft-abc',
      blockType: 'scene' as const,
      name: 'Intro Scene',
      prompt: 'A dramatic opening shot',
      durationS: 5,
      positionX: 100,
      positionY: 200,
      sortOrder: 1,
      style: 'cinematic-glow',
      createdAt: '2026-04-23T10:00:00Z',
      updatedAt: '2026-04-23T10:00:00Z',
      mediaItems: [],
    };
    mockApiClient.post.mockResolvedValue(mockOkResponse(newBlock));

    const result = await addTemplateToStoryboard({
      templateId: 'tpl-001',
      draftId: 'draft-abc',
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/scene-templates/tpl-001/add-to-storyboard',
      { draftId: 'draft-abc' },
    );
    expect(result).toEqual(newBlock);
    expect(result.blockType).toBe('scene');
  });

  it('should return a StoryboardBlock with the expected shape', async () => {
    const newBlock = {
      id: 'block-new',
      draftId: 'draft-abc',
      blockType: 'scene' as const,
      name: null,
      prompt: null,
      durationS: 3,
      positionX: 50,
      positionY: 50,
      sortOrder: 2,
      style: null,
      createdAt: '2026-04-23T11:00:00Z',
      updatedAt: '2026-04-23T11:00:00Z',
      mediaItems: [],
    };
    mockApiClient.post.mockResolvedValue(mockOkResponse(newBlock));

    const result = await addTemplateToStoryboard({
      templateId: 'tpl-002',
      draftId: 'draft-xyz',
    });

    expect(result.id).toBe('block-new');
    expect(result.draftId).toBe('draft-abc');
  });

  it('should throw when the API returns 404 (template not found or not owned)', async () => {
    mockApiClient.post.mockResolvedValue(mockErrorResponse(404));

    await expect(
      addTemplateToStoryboard({ templateId: 'ghost', draftId: 'draft-abc' }),
    ).rejects.toThrow(
      'POST /scene-templates/ghost/add-to-storyboard failed: 404',
    );
  });

  it('should throw when the API returns 403 (cross-ownership violation)', async () => {
    mockApiClient.post.mockResolvedValue(mockErrorResponse(403));

    await expect(
      addTemplateToStoryboard({ templateId: 'tpl-001', draftId: 'other-draft' }),
    ).rejects.toThrow(
      'POST /scene-templates/tpl-001/add-to-storyboard failed: 403',
    );
  });
});
