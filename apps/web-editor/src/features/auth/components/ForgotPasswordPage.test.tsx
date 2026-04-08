import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { ForgotPasswordPage } from './ForgotPasswordPage';

vi.mock('@/features/auth/api', () => ({
  forgotPassword: vi.fn(),
}));

import { forgotPassword } from '@/features/auth/api';
const mockForgotPassword = forgotPassword as ReturnType<typeof vi.fn>;

function renderForgotPassword() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ForgotPasswordPage', () => {
  it('should render forgot password form', () => {
    renderForgotPassword();
    expect(screen.getByRole('heading', { name: /forgot password/i })).toBeDefined();
    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeDefined();
  });

  it('should show validation error for empty email', async () => {
    renderForgotPassword();
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(screen.getByText('Email is required')).toBeDefined();
  });

  it('should show validation error for invalid email', async () => {
    renderForgotPassword();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'bad-email');
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(screen.getByText('Enter a valid email')).toBeDefined();
  });

  it('should show success message after successful submission', async () => {
    mockForgotPassword.mockResolvedValue({
      message: 'If the email is registered, a reset link has been sent.',
    });

    renderForgotPassword();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /check your email/i })).toBeDefined();
      expect(screen.getByText(/test@example\.com/)).toBeDefined();
    });
  });

  it('should display API error on failure', async () => {
    mockForgotPassword.mockRejectedValue(new Error('Request failed'));

    renderForgotPassword();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
  });

  it('should have link back to sign in', () => {
    renderForgotPassword();
    expect(screen.getByText('Back to sign in')).toBeDefined();
  });
});
