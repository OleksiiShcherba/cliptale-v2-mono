import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthProvider } from './AuthProvider';
import { useAuth } from '@/features/auth/hooks/useAuth';

vi.mock('@/features/auth/api', () => ({
  fetchCurrentUser: vi.fn(),
  logoutUser: vi.fn(),
}));

import { fetchCurrentUser, logoutUser } from '@/features/auth/api';
const mockFetchCurrentUser = fetchCurrentUser as ReturnType<typeof vi.fn>;
const mockLogoutUser = logoutUser as ReturnType<typeof vi.fn>;

/** Helper component that displays auth state. */
function AuthConsumer() {
  const { user, isLoading, setSession, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user">{user ? user.email : 'null'}</span>
      <button onClick={() => setSession('tok', { userId: 'u1', email: 'a@b.com', displayName: 'A' })}>
        set session
      </button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AuthProvider', () => {
  it('should set isLoading=false immediately when no token exists', async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(mockFetchCurrentUser).not.toHaveBeenCalled();
  });

  it('should validate token on mount and set user if valid', async () => {
    localStorage.setItem('auth_token', 'valid-tok');
    const mockUser = { userId: 'u1', email: 'test@example.com', displayName: 'Test' };
    mockFetchCurrentUser.mockResolvedValue(mockUser);

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('test@example.com');
    });
  });

  it('should clear token if validation returns null', async () => {
    localStorage.setItem('auth_token', 'expired-tok');
    mockFetchCurrentUser.mockResolvedValue(null);

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(screen.getByTestId('user').textContent).toBe('null');
  });

  it('should update user and token when setSession is called', async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    const user = userEvent.setup();
    await user.click(screen.getByText('set session'));

    expect(localStorage.getItem('auth_token')).toBe('tok');
    expect(screen.getByTestId('user').textContent).toBe('a@b.com');
  });

  it('should clear user and token when logout is called', async () => {
    localStorage.setItem('auth_token', 'valid-tok');
    const mockUser = { userId: 'u1', email: 'test@example.com', displayName: 'Test' };
    mockFetchCurrentUser.mockResolvedValue(mockUser);
    mockLogoutUser.mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('test@example.com');
    });

    const user = userEvent.setup();
    await user.click(screen.getByText('logout'));

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(mockLogoutUser).toHaveBeenCalled();
  });
});
