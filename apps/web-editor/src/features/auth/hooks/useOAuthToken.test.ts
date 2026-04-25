import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

import { useOAuthToken } from './useOAuthToken';
import { AuthProvider } from '@/features/auth/components/AuthProvider';
import * as authApi from '@/features/auth/api';

// Mock the API module
vi.mock('@/features/auth/api', () => ({
  fetchCurrentUser: vi.fn(),
}));

const mockFetchCurrentUser = authApi.fetchCurrentUser as ReturnType<typeof vi.fn>;

/** Wrapper to provide Router and AuthProvider context. */
function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      BrowserRouter,
      {},
      React.createElement(AuthProvider, {}, children),
    );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Clear URL query params
  window.history.replaceState({}, '', '/');
});

describe('useOAuthToken', () => {
  it('should do nothing when no token in URL', async () => {
    renderHook(() => useOAuthToken(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockFetchCurrentUser).not.toHaveBeenCalled();
    });
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('should extract token from URL and store in localStorage', async () => {
    // Simulate ?token=xxx in URL
    window.history.replaceState({}, '', '/?token=test-token-123');

    const mockUser = { userId: 'u1', email: 'user@gmail.com', displayName: 'OAuth User' };
    mockFetchCurrentUser.mockResolvedValue(mockUser);

    renderHook(() => useOAuthToken(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockFetchCurrentUser).toHaveBeenCalled();
    });

    expect(localStorage.getItem('auth_token')).toBe('test-token-123');
  });

  it('should call fetchCurrentUser to validate the token', async () => {
    window.history.replaceState({}, '', '/?token=valid-token');

    const mockUser = { userId: 'u2', email: 'valid@example.com', displayName: 'Valid User' };
    mockFetchCurrentUser.mockResolvedValue(mockUser);

    renderHook(() => useOAuthToken(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockFetchCurrentUser).toHaveBeenCalled();
    });
  });

  it('should clean token from URL after extraction', async () => {
    window.history.replaceState({}, '', '/?token=abc123&other=param');

    const mockUser = { userId: 'u3', email: 'clean@example.com', displayName: 'Clean User' };
    mockFetchCurrentUser.mockResolvedValue(mockUser);

    renderHook(() => useOAuthToken(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockFetchCurrentUser).toHaveBeenCalled();
    });

    // Token should be removed from URL
    expect(window.location.search).not.toContain('token=');
    // But other params should remain
    expect(window.location.search).toContain('other=param');
  });

  it('should remove token from localStorage if validation fails', async () => {
    window.history.replaceState({}, '', '/?token=invalid-token');

    mockFetchCurrentUser.mockResolvedValue(null);

    renderHook(() => useOAuthToken(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockFetchCurrentUser).toHaveBeenCalled();
    });

    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('should remove token from localStorage if fetchCurrentUser throws', async () => {
    window.history.replaceState({}, '', '/?token=error-token');

    mockFetchCurrentUser.mockRejectedValue(new Error('Network error'));

    renderHook(() => useOAuthToken(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockFetchCurrentUser).toHaveBeenCalled();
    });

    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('should handle multiple query parameters with token', async () => {
    window.history.replaceState({}, '', '/?state=xyz&token=multi-token&code=abc');

    const mockUser = { userId: 'u4', email: 'multi@example.com', displayName: 'Multi Param' };
    mockFetchCurrentUser.mockResolvedValue(mockUser);

    renderHook(() => useOAuthToken(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('multi-token');
    });

    // Token should be cleaned but other params may remain
    expect(window.location.search).not.toContain('token=');
  });
});
