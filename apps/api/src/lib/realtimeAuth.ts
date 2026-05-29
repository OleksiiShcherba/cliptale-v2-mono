import type { IncomingMessage } from 'node:http';

import { config } from '@/config.js';
import * as authService from '@/services/auth.service.js';

export type RealtimeUser = {
  userId: string;
  email: string;
  displayName: string;
};

const DEV_USER: RealtimeUser = {
  userId: 'dev-user-001',
  email: 'dev@cliptale.local',
  displayName: 'Dev User',
};

function tokenFromUrl(req: IncomingMessage): string | null {
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);
  const token = url.searchParams.get('token');
  return token && token.length > 0 ? token : null;
}

export function extractRealtimeToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : tokenFromUrl(req);
}

export async function authenticateRealtimeRequest(req: IncomingMessage): Promise<RealtimeUser> {
  if (config.auth.devAuthBypass) {
    return DEV_USER;
  }

  const token = extractRealtimeToken(req);
  if (!token) {
    throw new Error('Missing or malformed Authorization header');
  }

  return authService.validateSession(token);
}
