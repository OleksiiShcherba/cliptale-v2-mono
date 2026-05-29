import { createServer, get, type IncomingMessage, type Server } from 'node:http';
import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

const { mockRedisModule, mockDraftRepository, mockJobRepository } = vi.hoisted(() => ({
  mockRedisModule: {
    redis: {
      duplicate: vi.fn(() => ({
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        quit: vi.fn(),
      })),
    },
  },
  mockDraftRepository: {
    findDraftById: vi.fn(),
  },
  mockJobRepository: {
    getJobById: vi.fn(),
  },
}));

vi.mock('@/lib/redis.js', () => mockRedisModule);
vi.mock('@/repositories/generationDraft.repository.js', () => mockDraftRepository);
vi.mock('@/repositories/aiGenerationJob.repository.js', () => mockJobRepository);

const { RealtimeWebSocketServer } = await import('./realtime.js');

const REALTIME_REDIS_CHANNEL = 'cliptale:realtime:v1';

class FakeRedisSubscriber extends EventEmitter {
  subscribe = vi.fn(async () => 1);
  unsubscribe = vi.fn(async () => 1);
  quit = vi.fn(async () => 'OK');
}

type ServerMessage = {
  type: string;
  [key: string]: unknown;
};

let httpServer: Server;
let realtimeServer: InstanceType<typeof RealtimeWebSocketServer>;
let redisSubscriber: FakeRedisSubscriber;
let port: number;

function auth(req: IncomingMessage) {
  if (req.url?.includes('token=valid')) {
    return Promise.resolve({
      userId: 'user-1',
      email: 'u@example.com',
      displayName: 'User',
    });
  }
  if (req.url?.includes('token=user-2')) {
    return Promise.resolve({
      userId: 'user-2',
      email: 'u2@example.com',
      displayName: 'User 2',
    });
  }
  throw new Error('bad token');
}

function onceMessage(socket: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve) => {
    socket.once('message', (data) => {
      resolve(JSON.parse(data.toString('utf8')) as ServerMessage);
    });
  });
}

function openSocket(path = '/realtime?token=valid'): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

async function openSocketWithFirstMessage(path = '/realtime?token=valid'): Promise<{
  socket: WebSocket;
  firstMessage: ServerMessage;
}> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  const opened = new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  const firstMessage = onceMessage(socket);
  await opened;
  return { socket, firstMessage: await firstMessage };
}

function getText(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) {
    return;
  }
  await new Promise<void>((resolve) => {
    socket.once('close', () => resolve());
    socket.close();
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  redisSubscriber = new FakeRedisSubscriber();
  httpServer = createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  realtimeServer = new RealtimeWebSocketServer({
    authenticate: auth,
    redisSubscriber,
    heartbeatMs: 1_000,
  });
  realtimeServer.attach(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test server');
  }
  port = address.port;
});

afterEach(async () => {
  await realtimeServer.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe('RealtimeWebSocketServer', () => {
  it('keeps regular HTTP routes working through the same server', async () => {
    await expect(getText('/health')).resolves.toBe('ok');
  });

  it('rejects unauthenticated websocket handshakes', async () => {
    await expect(openSocket('/realtime?token=bad')).rejects.toThrow();
  });

  it('accepts owned draft storyboard subscriptions', async () => {
    mockDraftRepository.findDraftById.mockResolvedValue({ id: 'draft-1', userId: 'user-1' });
    const { socket, firstMessage } = await openSocketWithFirstMessage();

    expect(firstMessage).toMatchObject({ type: 'connected' });
    const subscribed = onceMessage(socket);
    socket.send(JSON.stringify({
      type: 'subscribe',
      requestId: 'req-1',
      scope: 'draft-storyboard',
      draftId: 'draft-1',
    }));

    await expect(subscribed).resolves.toMatchObject({
      type: 'subscribed',
      requestId: 'req-1',
      scope: 'draft-storyboard',
      resourceId: 'draft-1',
    });

    await closeSocket(socket);
  });

  it('hides foreign draft subscriptions behind a not_found error', async () => {
    mockDraftRepository.findDraftById.mockResolvedValue({ id: 'draft-1', userId: 'other-user' });
    const { socket } = await openSocketWithFirstMessage();

    const error = onceMessage(socket);
    socket.send(JSON.stringify({
      type: 'subscribe',
      requestId: 'req-2',
      scope: 'draft-storyboard',
      draftId: 'draft-1',
    }));

    await expect(error).resolves.toMatchObject({
      type: 'error',
      requestId: 'req-2',
      code: 'not_found',
    });

    await closeSocket(socket);
  });

  it('hides foreign AI job subscriptions behind a not_found error', async () => {
    mockJobRepository.getJobById.mockResolvedValue({ jobId: 'job-1', userId: 'other-user' });
    const { socket } = await openSocketWithFirstMessage();

    const error = onceMessage(socket);
    socket.send(JSON.stringify({
      type: 'subscribe',
      requestId: 'req-foreign-job',
      scope: 'ai-job',
      jobId: 'job-1',
    }));

    await expect(error).resolves.toMatchObject({
      type: 'error',
      requestId: 'req-foreign-job',
      code: 'not_found',
    });

    await closeSocket(socket);
  });

  it('accepts owned AI job subscriptions and fans out matching Redis events', async () => {
    mockJobRepository.getJobById.mockResolvedValue({ jobId: 'job-1', userId: 'user-1' });
    const { socket } = await openSocketWithFirstMessage();

    const subscribed = onceMessage(socket);
    socket.send(JSON.stringify({
      type: 'subscribe',
      requestId: 'req-3',
      scope: 'ai-job',
      jobId: 'job-1',
    }));
    await expect(subscribed).resolves.toMatchObject({ type: 'subscribed' });

    const event = onceMessage(socket);
    redisSubscriber.emit('message', REALTIME_REDIS_CHANNEL, JSON.stringify({
      type: 'ai.job.updated',
      userId: 'user-1',
      jobId: 'job-1',
      payload: { status: 'completed', outputFileId: 'file-1' },
    }));

    await expect(event).resolves.toMatchObject({
      type: 'event',
      event: {
        type: 'ai.job.updated',
        userId: 'user-1',
        jobId: 'job-1',
        payload: { status: 'completed', outputFileId: 'file-1' },
      },
    });

    await closeSocket(socket);
  });

  it('fans out Redis events only to subscribers for the matching user and resource', async () => {
    mockJobRepository.getJobById.mockImplementation(async (jobId: string) => ({
      jobId,
      userId: jobId === 'job-2' ? 'user-2' : 'user-1',
    }));
    const { socket: userOneSocket } = await openSocketWithFirstMessage();
    const { socket: userTwoSocket } = await openSocketWithFirstMessage('/realtime?token=user-2');

    const userOneSubscribed = onceMessage(userOneSocket);
    userOneSocket.send(JSON.stringify({ type: 'subscribe', scope: 'ai-job', jobId: 'job-1' }));
    await expect(userOneSubscribed).resolves.toMatchObject({ type: 'subscribed' });

    const userTwoSubscribed = onceMessage(userTwoSocket);
    userTwoSocket.send(JSON.stringify({ type: 'subscribe', scope: 'ai-job', jobId: 'job-2' }));
    await expect(userTwoSubscribed).resolves.toMatchObject({ type: 'subscribed' });

    const userOneEvent = onceMessage(userOneSocket);
    const unexpectedUserTwoEvent = vi.fn();
    userTwoSocket.once('message', unexpectedUserTwoEvent);
    redisSubscriber.emit('message', REALTIME_REDIS_CHANNEL, JSON.stringify({
      type: 'ai.job.updated',
      userId: 'user-1',
      jobId: 'job-1',
      payload: { status: 'completed' },
    }));

    await expect(userOneEvent).resolves.toMatchObject({
      type: 'event',
      event: {
        type: 'ai.job.updated',
        userId: 'user-1',
        jobId: 'job-1',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(unexpectedUserTwoEvent).not.toHaveBeenCalled();

    await closeSocket(userOneSocket);
    await closeSocket(userTwoSocket);
  });

  it('does not fan out events after unsubscribe', async () => {
    mockJobRepository.getJobById.mockResolvedValue({ jobId: 'job-1', userId: 'user-1' });
    const { socket } = await openSocketWithFirstMessage();

    socket.send(JSON.stringify({ type: 'subscribe', scope: 'ai-job', jobId: 'job-1' }));
    await onceMessage(socket);
    socket.send(JSON.stringify({ type: 'unsubscribe', scope: 'ai-job', jobId: 'job-1' }));
    await expect(onceMessage(socket)).resolves.toMatchObject({ type: 'unsubscribed' });

    const unexpected = vi.fn();
    socket.once('message', unexpected);
    redisSubscriber.emit('message', REALTIME_REDIS_CHANNEL, JSON.stringify({
      type: 'ai.job.updated',
      userId: 'user-1',
      jobId: 'job-1',
      payload: { status: 'processing' },
    }));

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(unexpected).not.toHaveBeenCalled();

    await closeSocket(socket);
  });

  it('returns bad_message for malformed client messages', async () => {
    const { socket } = await openSocketWithFirstMessage();

    const error = onceMessage(socket);
    socket.send('{not-json');

    await expect(error).resolves.toMatchObject({
      type: 'error',
      code: 'bad_message',
    });

    await closeSocket(socket);
  });

  it('ignores malformed Redis events without disrupting later valid fanout', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockJobRepository.getJobById.mockResolvedValue({ jobId: 'job-1', userId: 'user-1' });
    const { socket } = await openSocketWithFirstMessage();

    socket.send(JSON.stringify({ type: 'subscribe', scope: 'ai-job', jobId: 'job-1' }));
    await onceMessage(socket);

    redisSubscriber.emit('message', REALTIME_REDIS_CHANNEL, '{not-json');
    redisSubscriber.emit('message', REALTIME_REDIS_CHANNEL, JSON.stringify({
      type: 'ai.job.updated',
      userId: '',
      jobId: 'job-1',
      payload: {},
    }));

    const validEvent = onceMessage(socket);
    redisSubscriber.emit('message', REALTIME_REDIS_CHANNEL, JSON.stringify({
      type: 'ai.job.updated',
      userId: 'user-1',
      jobId: 'job-1',
      payload: { status: 'processing' },
    }));

    await expect(validEvent).resolves.toMatchObject({
      type: 'event',
      event: {
        type: 'ai.job.updated',
        payload: { status: 'processing' },
      },
    });
    expect(consoleError).toHaveBeenCalledWith('[realtime] Ignoring malformed Redis event JSON');
    expect(consoleError).toHaveBeenCalledWith('[realtime] Ignoring invalid Redis event');
    consoleError.mockRestore();

    await closeSocket(socket);
  });
});
