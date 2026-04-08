import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { config } from '@/lib/config';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { loginUser } from '@/features/auth/api';
import { authStyles as s } from './authStyles';

/** Validates form fields and returns per-field error messages. */
function validateForm(email: string, password: string): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {};
  if (!email) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email';
  if (!password) errors.password = 'Password is required';
  return errors;
}

/** Login page — email/password authentication. */
export function LoginPage(): React.ReactElement {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<{ email?: string; password?: string }>({});
  const [apiError, setApiError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setApiError('');

    const errors = validateForm(email, password);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const result = await loginUser(email, password);
      setSession(result.token, result.user);
      navigate('/editor', { replace: true });
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>Sign in</h1>
        <p style={s.subtitle}>Welcome back to ClipTale</p>

        <form onSubmit={handleSubmit} noValidate>
          {apiError && <p style={s.errorText} role="alert">{apiError}</p>}

          <label style={s.label} htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            style={{ ...s.input, ...(fieldErrors.email ? s.inputError : {}) }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          {fieldErrors.email && <p style={s.fieldError}>{fieldErrors.email}</p>}

          <label style={s.label} htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            style={{ ...s.input, ...(fieldErrors.password ? s.inputError : {}) }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          {fieldErrors.password && <p style={s.fieldError}>{fieldErrors.password}</p>}

          <button
            type="submit"
            style={{ ...s.button, ...(isSubmitting ? s.buttonDisabled : {}) }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
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
          <Link to="/forgot-password" style={s.link}>Forgot password?</Link>
          <span style={{ margin: '0 8px', color: s.footer.color }}>·</span>
          <Link to="/register" style={s.link}>Create account</Link>
        </div>
      </div>
    </div>
  );
}
