import React from 'react';
import { Link } from 'react-router-dom';

import { forgotPassword } from '@/features/auth/api';
import { authStyles as s } from './authStyles';

/** Forgot password page — sends a reset link to the user's email. */
export function ForgotPasswordPage(): React.ReactElement {
  const [email, setEmail] = React.useState('');
  const [fieldError, setFieldError] = React.useState('');
  const [apiError, setApiError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setApiError('');
    setFieldError('');

    if (!email) {
      setFieldError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError('Enter a valid email');
      return;
    }

    setIsSubmitting(true);
    try {
      await forgotPassword(email);
      setIsSuccess(true);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={s.title}>Check your email</h1>
          <p style={s.subtitle}>
            If an account exists for {email}, we've sent a password reset link.
          </p>
          <Link to="/login" style={{ ...s.link, display: 'block', textAlign: 'center' as const }}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>Forgot password</h1>
        <p style={s.subtitle}>Enter your email and we'll send you a reset link</p>

        <form onSubmit={handleSubmit} noValidate>
          {apiError && <p style={s.errorText} role="alert">{apiError}</p>}

          <label style={s.label} htmlFor="forgot-email">Email</label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            style={{ ...s.input, ...(fieldError ? s.inputError : {}) }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          {fieldError && <p style={s.fieldError}>{fieldError}</p>}

          <button
            type="submit"
            style={{ ...s.button, ...(isSubmitting ? s.buttonDisabled : {}) }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <div style={s.footer}>
          <Link to="/login" style={s.link}>Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
