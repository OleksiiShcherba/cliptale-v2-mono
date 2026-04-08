import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./config.js', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

import { apiClient } from './api-client';

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
