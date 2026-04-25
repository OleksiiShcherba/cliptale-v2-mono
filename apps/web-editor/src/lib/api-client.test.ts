import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./config.js', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

import { apiClient, buildAuthenticatedUrl, getAuthToken } from './api-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiClient', () => {
  describe('Bearer token injection', () => {
    it('should include Authorization header when token exists in localStorage', async () => {
      localStorage.setItem('auth_token', 'my-token');
      mockFetch.mockResolvedValue({ status: 200, ok: true });

      await apiClient.get('/test');

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/test', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer my-token',
        },
      });
    });

    it('should not include Authorization header when no token exists', async () => {
      mockFetch.mockResolvedValue({ status: 200, ok: true });

      await apiClient.get('/test');

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/test', {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    it('should attach token to POST requests', async () => {
      localStorage.setItem('auth_token', 'tok');
      mockFetch.mockResolvedValue({ status: 200, ok: true });

      await apiClient.post('/data', { key: 'value' });

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toBe('Bearer tok');
      expect(opts.method).toBe('POST');
      expect(opts.body).toBe(JSON.stringify({ key: 'value' }));
    });

    it('should attach token to PATCH requests', async () => {
      localStorage.setItem('auth_token', 'tok');
      mockFetch.mockResolvedValue({ status: 200, ok: true });

      await apiClient.patch('/data/1', { key: 'new' });

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toBe('Bearer tok');
      expect(opts.method).toBe('PATCH');
    });

    it('should attach token to DELETE requests', async () => {
      localStorage.setItem('auth_token', 'tok');
      mockFetch.mockResolvedValue({ status: 200, ok: true });

      await apiClient.delete('/data/1');

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toBe('Bearer tok');
      expect(opts.method).toBe('DELETE');
    });
  });

  describe('401 handling', () => {
    it('should clear token on 401 response', async () => {
      localStorage.setItem('auth_token', 'expired');
      // Mock window.location
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { ...originalLocation, href: '/editor', pathname: '/editor' },
      });

      mockFetch.mockResolvedValue({ status: 401, ok: false });

      await apiClient.get('/protected');

      expect(localStorage.getItem('auth_token')).toBeNull();

      // Restore
      Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
    });

    it('should not redirect on 401 when already on login page', async () => {
      localStorage.setItem('auth_token', 'expired');
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { ...originalLocation, href: '/login', pathname: '/login' },
      });

      mockFetch.mockResolvedValue({ status: 401, ok: false });

      await apiClient.get('/protected');

      expect(localStorage.getItem('auth_token')).toBeNull();
      // Should not have changed href to /login (it's already there)
      expect(window.location.pathname).toBe('/login');

      Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
    });
  });
});

describe('getAuthToken', () => {
  it('returns the stored auth token', () => {
    localStorage.setItem('auth_token', 'my-token-123');
    expect(getAuthToken()).toBe('my-token-123');
  });

  it('returns null when no token is stored', () => {
    expect(getAuthToken()).toBeNull();
  });

  it('returns the most recently set token', () => {
    localStorage.setItem('auth_token', 'token-1');
    expect(getAuthToken()).toBe('token-1');
    localStorage.setItem('auth_token', 'token-2');
    expect(getAuthToken()).toBe('token-2');
  });
});

describe('buildAuthenticatedUrl', () => {
  it('appends token as ?token= query parameter when token exists', () => {
    localStorage.setItem('auth_token', 'test-token');
    const url = 'http://localhost:3001/assets/img-001/stream';
    expect(buildAuthenticatedUrl(url)).toBe('http://localhost:3001/assets/img-001/stream?token=test-token');
  });

  it('returns URL unchanged when no token is stored', () => {
    const url = 'http://localhost:3001/assets/img-001/stream';
    expect(buildAuthenticatedUrl(url)).toBe(url);
  });

  it('uses & separator when URL already contains query parameters', () => {
    localStorage.setItem('auth_token', 'token-xyz');
    const url = 'http://localhost:3001/assets/img-001/thumbnail?v=1';
    expect(buildAuthenticatedUrl(url)).toBe('http://localhost:3001/assets/img-001/thumbnail?v=1&token=token-xyz');
  });

  it('uses ? separator when URL has no existing query parameters', () => {
    localStorage.setItem('auth_token', 'token-abc');
    const url = 'http://localhost:3001/assets/img-002/stream';
    const result = buildAuthenticatedUrl(url);
    expect(result).toMatch(/\?token=/);
    expect(result).not.toMatch(/&token=/);
  });

  it('URL-encodes the token value', () => {
    localStorage.setItem('auth_token', 'token+with/special=chars&more');
    const url = 'http://localhost:3001/assets/img-001/stream';
    const result = buildAuthenticatedUrl(url);
    // Raw token should not appear; it should be encoded
    expect(result).not.toContain('token+with/special=chars&more');
    expect(result).toContain('token=');
  });

  it('handles URLs with multiple existing query parameters', () => {
    localStorage.setItem('auth_token', 'tok');
    const url = 'http://localhost:3001/assets/img-001/stream?format=webp&quality=high';
    const result = buildAuthenticatedUrl(url);
    expect(result).toBe('http://localhost:3001/assets/img-001/stream?format=webp&quality=high&token=tok');
  });

  it('handles URLs with fragments', () => {
    localStorage.setItem('auth_token', 'token-frag');
    const url = 'http://localhost:3001/assets/img-001/stream#section';
    const result = buildAuthenticatedUrl(url);
    // Fragment should remain at the end
    expect(result).toContain('?token=token-frag');
    expect(result).toContain('#section');
  });

  it('preserves the URL scheme and host', () => {
    localStorage.setItem('auth_token', 'token');
    const url = 'https://secure.api.example.com/assets/img-001/stream';
    const result = buildAuthenticatedUrl(url);
    expect(result).toMatch(/^https:\/\/secure\.api\.example\.com\/assets\/img-001\/stream\?token=token/);
  });
});
