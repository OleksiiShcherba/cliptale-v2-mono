import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { RegisterPage } from './RegisterPage';

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
  registerUser: vi.fn(),
}));

import { registerUser } from '@/features/auth/api';
const mockRegister = registerUser as ReturnType<typeof vi.fn>;

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <RegisterPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('RegisterPage', () => {
  it('should render create account form with all fields', () => {
    renderRegister();
    expect(screen.getByRole('heading', { name: /create account/i })).toBeDefined();
    expect(screen.getByLabelText(/display name/i)).toBeDefined();
    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
  });

  it('should show validation errors for empty fields', async () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByText('Display name is required')).toBeDefined();
    expect(screen.getByText('Email is required')).toBeDefined();
    expect(screen.getByText('Password is required')).toBeDefined();
  });

  it('should show error for password shorter than 8 characters', async () => {
    renderRegister();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/display name/i), 'Test');
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByText('Password must be at least 8 characters')).toBeDefined();
  });

  it('should call registerUser and setSession on success', async () => {
    const mockUser = { userId: 'u1', email: 'new@example.com', displayName: 'New User' };
    mockRegister.mockResolvedValue({
      user: mockUser,
      token: 'tok456',
      expiresAt: '2026-04-15T00:00:00.000Z',
    });

    renderRegister();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/display name/i), 'New User');
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('new@example.com', 'password123', 'New User');
      expect(mockSetSession).toHaveBeenCalledWith('tok456', mockUser);
      expect(mockNavigate).toHaveBeenCalledWith('/editor', { replace: true });
    });
  });

  it('should display API error on duplicate email', async () => {
    mockRegister.mockRejectedValue(new Error('Email is already registered'));

    renderRegister();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/display name/i), 'Dup');
    await user.type(screen.getByLabelText(/email/i), 'dup@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('Email is already registered')).toBeDefined();
    });
  });

  it('should have link to sign in page', () => {
    renderRegister();
    expect(screen.getByText('Sign in')).toBeDefined();
  });
});
