import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { ResetPasswordPage } from './ResetPasswordPage';

vi.mock('@/features/auth/api', () => ({
  resetPassword: vi.fn(),
}));

import { resetPassword } from '@/features/auth/api';
const mockResetPassword = resetPassword as ReturnType<typeof vi.fn>;

function renderResetPassword(search = '?token=valid-token') {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <ResetPasswordPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResetPasswordPage', () => {
  it('should show invalid link message when token is missing', () => {
    renderResetPassword('');
    expect(screen.getByRole('heading', { name: /invalid link/i })).toBeDefined();
    expect(screen.getByText(/request a new reset link/i)).toBeDefined();
  });

  it('should render reset password form when token is present', () => {
    renderResetPassword();
    expect(screen.getByRole('heading', { name: /reset password/i })).toBeDefined();
    expect(screen.getByLabelText(/new password/i)).toBeDefined();
    expect(screen.getByLabelText(/confirm password/i)).toBeDefined();
  });

  it('should show error for empty password', () => {
    renderResetPassword();
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    expect(screen.getByText('Password is required')).toBeDefined();
  });

  it('should show error for short password', async () => {
    renderResetPassword();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new password/i), 'short');
    await user.type(screen.getByLabelText(/confirm password/i), 'short');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    expect(screen.getByText('Password must be at least 8 characters')).toBeDefined();
  });

  it('should show error when passwords do not match', async () => {
    renderResetPassword();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new password/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'different123');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    expect(screen.getByText('Passwords do not match')).toBeDefined();
  });

  it('should show success message after successful reset', async () => {
    mockResetPassword.mockResolvedValue({ message: 'Password has been reset successfully.' });

    renderResetPassword();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new password/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('valid-token', 'newpassword123');
      expect(screen.getByText(/password has been reset/i)).toBeDefined();
    });
  });

  it('should display API error on failure', async () => {
    mockResetPassword.mockRejectedValue(new Error('Token expired or invalid'));

    renderResetPassword();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new password/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('Token expired or invalid')).toBeDefined();
    });
  });
});
