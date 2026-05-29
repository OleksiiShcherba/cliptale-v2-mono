import type { IncomingMessage } from 'node:http';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConfig, mockAuthService } = vi.hoisted(() => ({
  mockConfig: {
    config: {
      auth: { devAuthBypass: false },
    },
  },
  mockAuthService: {
    validateSession: vi.fn(),
  },
}));

vi.mock('@/config.js', () => mockConfig);
vi.mock('@/services/auth.service.js', () => mockAuthService);

const { authenticateRealtimeRequest, extractRealtimeToken } = await import('./realtimeAuth.js');

function req(params: {
  authorization?: string;
  url?: string;
  host?: string;
}): IncomingMessage {
  return {
    headers: {
      ...(params.authorization ? { authorization: params.authorization } : {}),
      ...(params.host ? { host: params.host } : {}),
    },
    url: params.url ?? '/realtime',
  } as IncomingMessage;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.config.auth.devAuthBypass = false;
});

describe('realtime auth', () => {
  it('extracts bearer tokens before query tokens', () => {
    expect(
      extractRealtimeToken(req({
        authorization: 'Bearer header-token',
        url: '/realtime?token=query-token',
      })),
    ).toBe('header-token');
  });

  it('extracts browser query tokens when no Authorization header is available', () => {
    expect(extractRealtimeToken(req({ url: '/realtime?token=query-token' }))).toBe('query-token');
  });

  it('uses the same session validator as HTTP auth', async () => {
    mockAuthService.validateSession.mockResolvedValue({
      userId: 'user-1',
      email: 'u@example.com',
      displayName: 'User',
    });

    await expect(
      authenticateRealtimeRequest(req({ authorization: 'Bearer session-token' })),
    ).resolves.toMatchObject({ userId: 'user-1' });
    expect(mockAuthService.validateSession).toHaveBeenCalledWith('session-token');
  });

  it('supports dev auth bypass without a token', async () => {
    mockConfig.config.auth.devAuthBypass = true;

    await expect(authenticateRealtimeRequest(req({}))).resolves.toEqual({
      userId: 'dev-user-001',
      email: 'dev@cliptale.local',
      displayName: 'Dev User',
    });
    expect(mockAuthService.validateSession).not.toHaveBeenCalled();
  });
});
