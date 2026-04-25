import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { resetPassword } from '@/features/auth/api';
import { authStyles as s } from './authStyles';

/** Validates the reset-password form. */
function validateForm(
  password: string,
  confirmPassword: string,
): { password?: string; confirmPassword?: string } {
  const errors: { password?: string; confirmPassword?: string } = {};
  if (!password) errors.password = 'Password is required';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
  return errors;
}

/** Reset password page — set a new password using a token from the URL. */
export function ResetPasswordPage(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<{
    password?: string;
    confirmPassword?: string;
  }>({});
  const [apiError, setApiError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);

  if (!token) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={s.title}>Invalid link</h1>
          <p style={s.subtitle}>
            This password reset link is invalid or has expired.
          </p>
          <Link to="/forgot-password" style={{ ...s.link, display: 'block', textAlign: 'center' as const }}>
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setApiError('');

    const errors = validateForm(password, confirmPassword);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await resetPassword(token, password);
      setIsSuccess(true);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={s.title}>Password reset</h1>
          <p style={s.successText}>Your password has been reset successfully.</p>
          <Link to="/login" style={{ ...s.link, display: 'block', textAlign: 'center' as const }}>
            Sign in with your new password
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>Reset password</h1>
        <p style={s.subtitle}>Enter your new password</p>

        <form onSubmit={handleSubmit} noValidate>
          {apiError && <p style={s.errorText} role="alert">{apiError}</p>}

          <label style={s.label} htmlFor="reset-password">New password</label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            style={{ ...s.input, ...(fieldErrors.password ? s.inputError : {}) }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          {fieldErrors.password && <p style={s.fieldError}>{fieldErrors.password}</p>}

          <label style={s.label} htmlFor="reset-confirm">Confirm password</label>
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            style={{ ...s.input, ...(fieldErrors.confirmPassword ? s.inputError : {}) }}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat password"
          />
          {fieldErrors.confirmPassword && <p style={s.fieldError}>{fieldErrors.confirmPassword}</p>}

          <button
            type="submit"
            style={{ ...s.button, ...(isSubmitting ? s.buttonDisabled : {}) }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Resetting…' : 'Reset password'}
          </button>
        </form>

        <div style={s.footer}>
          <Link to="/login" style={s.link}>Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
