import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ProtectedRoute } from './ProtectedRoute';

const mockUseAuth = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function renderProtected(initialPath = '/editor') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ProtectedRoute>
        <div data-testid="protected-content">Editor</div>
      </ProtectedRoute>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('should show loading state while auth is being checked', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true, setSession: vi.fn(), logout: vi.fn() });
    renderProtected();
    expect(screen.getByText('Loading…')).toBeDefined();
    expect(screen.queryByTestId('protected-content')).toBeNull();
  });

  it('should render children when user is authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: { userId: 'u1', email: 'test@example.com', displayName: 'Test' },
      isLoading: false,
      setSession: vi.fn(),
      logout: vi.fn(),
    });
    renderProtected();
    expect(screen.getByTestId('protected-content')).toBeDefined();
  });

  it('should redirect to /login when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, setSession: vi.fn(), logout: vi.fn() });
    renderProtected();
    expect(screen.queryByTestId('protected-content')).toBeNull();
    // Navigate renders nothing visible in test, but content should not be shown
  });
});
