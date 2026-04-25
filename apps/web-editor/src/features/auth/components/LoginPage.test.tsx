import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { LoginPage } from './LoginPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockSetSession = vi.fn();
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ setSession: mockSetSession, user: null, isLoading: false, logout: vi.fn() }),
}));

vi.mock('@/features/auth/api', () => ({
  loginUser: vi.fn(),
}));

import { loginUser } from '@/features/auth/api';
const mockLogin = loginUser as ReturnType<typeof vi.fn>;

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('LoginPage', () => {
  it('should render sign in form with email and password fields', () => {
    renderLogin();
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeDefined();
    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined();
  });

  it('should show validation errors for empty fields on submit', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByText('Email is required')).toBeDefined();
    expect(screen.getByText('Password is required')).toBeDefined();
  });

  it('should show validation error for invalid email format', async () => {
    renderLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByText('Enter a valid email')).toBeDefined();
  });

  it('should call loginUser and setSession on success', async () => {
    const mockUser = { userId: 'u1', email: 'test@example.com', displayName: 'Test' };
    mockLogin.mockResolvedValue({
      user: mockUser,
      token: 'tok123',
      expiresAt: '2026-04-15T00:00:00.000Z',
    });

    renderLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockSetSession).toHaveBeenCalledWith('tok123', mockUser);
      // Post-login redirect must go to `/` (home hub), not `/editor` (subtask 4)
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('should display API error message on failure', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid email or password'));

    renderLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('Invalid email or password')).toBeDefined();
    });
  });

  it('should have links to register and forgot password pages', () => {
    renderLogin();
    expect(screen.getByText('Forgot password?')).toBeDefined();
    expect(screen.getByText('Create account')).toBeDefined();
  });
});
