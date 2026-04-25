import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { config } from '@/lib/config';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { registerUser } from '@/features/auth/api';
import { authStyles as s } from './authStyles';

type FieldErrors = {
  email?: string;
  password?: string;
  displayName?: string;
};

/** Validates registration form fields. */
function validateForm(email: string, password: string, displayName: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email';
  if (!password) errors.password = 'Password is required';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  if (!displayName.trim()) errors.displayName = 'Display name is required';
  return errors;
}

/** Register page — create a new account with email/password. */
export function RegisterPage(): React.ReactElement {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [apiError, setApiError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setApiError('');

    const errors = validateForm(email, password, displayName);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const result = await registerUser(email, password, displayName.trim());
      setSession(result.token, result.user);
      navigate('/editor', { replace: true });
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>Create account</h1>
        <p style={s.subtitle}>Get started with ClipTale</p>

        <form onSubmit={handleSubmit} noValidate>
          {apiError && <p style={s.errorText} role="alert">{apiError}</p>}

          <label style={s.label} htmlFor="register-name">Display name</label>
          <input
            id="register-name"
            type="text"
            autoComplete="name"
            style={{ ...s.input, ...(fieldErrors.displayName ? s.inputError : {}) }}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
          {fieldErrors.displayName && <p style={s.fieldError}>{fieldErrors.displayName}</p>}

          <label style={s.label} htmlFor="register-email">Email</label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            style={{ ...s.input, ...(fieldErrors.email ? s.inputError : {}) }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          {fieldErrors.email && <p style={s.fieldError}>{fieldErrors.email}</p>}

          <label style={s.label} htmlFor="register-password">Password</label>
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            style={{ ...s.input, ...(fieldErrors.password ? s.inputError : {}) }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          {fieldErrors.password && <p style={s.fieldError}>{fieldErrors.password}</p>}

          <button
            type="submit"
            style={{ ...s.button, ...(isSubmitting ? s.buttonDisabled : {}) }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div style={s.divider}>
          <span style={s.dividerText}>or continue with</span>
        </div>

        <div style={s.oauthRow}>
          <a href={`${config.apiBaseUrl}/auth/google`} style={s.oauthButton}>
            Google
          </a>
          <a href={`${config.apiBaseUrl}/auth/github`} style={s.oauthButton}>
            GitHub
          </a>
        </div>

        <div style={s.footer}>
          Already have an account?{' '}
          <Link to="/login" style={s.link}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
