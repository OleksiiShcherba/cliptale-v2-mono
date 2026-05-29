import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';

import {
  REALTIME_REDIS_CHANNEL,
  type RealtimeClientMessage,
  type RealtimeRedisEvent,
  type RealtimeServerMessage,
  realtimeClientMessageSchema,
  realtimeRedisEventSchema,
} from '@ai-video-editor/project-schema';
import type Redis from 'ioredis';
import { WebSocket, WebSocketServer } from 'ws';

import { redis as defaultRedis } from '@/lib/redis.js';
import { authenticateRealtimeRequest, type RealtimeUser } from '@/lib/realtimeAuth.js';
import {
  assertOwnsSubscription,
  resourceIdForMessage,
  subscriptionKeyForEvent,
  subscriptionKeyForMessage,
} from '@/lib/realtimeSubscriptions.js';

const REALTIME_PATH = '/realtime';
const HEARTBEAT_MS = 30_000;
const MAX_SUBSCRIPTIONS_PER_CONNECTION = 100;

type Client = {
  socket: WebSocket;
  user: RealtimeUser;
  isAlive: boolean;
  subscriptions: Set<string>;
};

type RedisSubscriber = Pick<Redis, 'subscribe' | 'unsubscribe' | 'on' | 'off' | 'quit'>;

export type RealtimeServerOptions = {
  authenticate?: typeof authenticateRealtimeRequest;
  redisSubscriber?: RedisSubscriber;
  heartbeatMs?: number;
};

function closeUpgrade(socket: Duplex, statusCode: number, message: string): void {
  socket.write(`HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function parseJsonMessage(data: WebSocket.RawData): unknown {
  const raw = typeof data === 'string' ? data : data.toString('utf8');
  return JSON.parse(raw) as unknown;
}

function send(socket: WebSocket, message: RealtimeServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export class RealtimeWebSocketServer {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly clients = new Set<Client>();
  private readonly subscriptions = new Map<string, Set<Client>>();
  private readonly authenticate: typeof authenticateRealtimeRequest;
  private readonly redisSubscriber: RedisSubscriber;
  private readonly heartbeatMs: number;
  private heartbeat: NodeJS.Timeout | null = null;
  private started = false;

  constructor(options: RealtimeServerOptions = {}) {
    this.authenticate = options.authenticate ?? authenticateRealtimeRequest;
    this.redisSubscriber = options.redisSubscriber ?? defaultRedis.duplicate();
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  }

  attach(server: HttpServer): void {
    if (this.started) {
      return;
    }
    this.started = true;

    server.on('upgrade', (req, socket, head) => {
      const host = req.headers.host ?? 'localhost';
      const url = new URL(req.url ?? '/', `http://${host}`);
      if (url.pathname !== REALTIME_PATH) {
        socket.destroy();
        return;
      }

      this.handleUpgrade(req, socket, head).catch((err: unknown) => {
        console.error('[realtime] WebSocket upgrade failed:', err);
        closeUpgrade(socket, 401, 'Unauthorized');
      });
    });

    this.redisSubscriber.on('message', this.onRedisMessage);
    void this.redisSubscriber.subscribe(REALTIME_REDIS_CHANNEL).catch((err: unknown) => {
      console.error('[realtime] Redis subscribe failed:', err);
    });

    this.heartbeat = setInterval(() => this.pingClients(), this.heartbeatMs);
    this.heartbeat.unref();
  }

  async close(): Promise<void> {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }

    this.redisSubscriber.off('message', this.onRedisMessage);
    await this.redisSubscriber.unsubscribe(REALTIME_REDIS_CHANNEL).catch(() => undefined);
    await this.redisSubscriber.quit().catch(() => undefined);

    for (const client of [...this.clients]) {
      client.socket.close();
      this.cleanupClient(client);
    }

    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  private async handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<void> {
    let user: RealtimeUser;
    try {
      user = await this.authenticate(req);
    } catch {
      closeUpgrade(socket, 401, 'Unauthorized');
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.handleConnection(ws, user);
    });
  }

  private handleConnection(socket: WebSocket, user: RealtimeUser): void {
    const client: Client = {
      socket,
      user,
      isAlive: true,
      subscriptions: new Set(),
    };

    this.clients.add(client);
    send(socket, { type: 'connected', heartbeatMs: this.heartbeatMs });

    socket.on('pong', () => {
      client.isAlive = true;
    });
    socket.on('message', (data) => {
      void this.handleMessage(client, data);
    });
    socket.on('close', () => this.cleanupClient(client));
    socket.on('error', () => this.cleanupClient(client));
  }

  private async handleMessage(client: Client, data: WebSocket.RawData): Promise<void> {
    let message: RealtimeClientMessage;
    try {
      message = realtimeClientMessageSchema.parse(parseJsonMessage(data));
    } catch {
      send(client.socket, {
        type: 'error',
        code: 'bad_message',
        message: 'Invalid realtime message',
      });
      return;
    }

    if (message.type === 'unsubscribe') {
      this.removeSubscription(client, subscriptionKeyForMessage(message, client.user.userId));
      send(client.socket, {
        type: 'unsubscribed',
        requestId: message.requestId,
        scope: message.scope,
        resourceId: resourceIdForMessage(message),
      });
      return;
    }

    if (client.subscriptions.size >= MAX_SUBSCRIPTIONS_PER_CONNECTION) {
      send(client.socket, {
        type: 'error',
        requestId: message.requestId,
        code: 'forbidden',
        message: 'Too many realtime subscriptions',
      });
      return;
    }

    try {
      await assertOwnsSubscription(message, client.user.userId);
    } catch {
      send(client.socket, {
        type: 'error',
        requestId: message.requestId,
        code: 'not_found',
        message: 'Realtime subscription target was not found',
      });
      return;
    }

    this.addSubscription(client, subscriptionKeyForMessage(message, client.user.userId));
    send(client.socket, {
      type: 'subscribed',
      requestId: message.requestId,
      scope: message.scope,
      resourceId: resourceIdForMessage(message),
    });
  }

  private addSubscription(client: Client, key: string): void {
    client.subscriptions.add(key);
    const clients = this.subscriptions.get(key) ?? new Set<Client>();
    clients.add(client);
    this.subscriptions.set(key, clients);
  }

  private removeSubscription(client: Client, key: string): void {
    client.subscriptions.delete(key);
    const clients = this.subscriptions.get(key);
    if (!clients) {
      return;
    }
    clients.delete(client);
    if (clients.size === 0) {
      this.subscriptions.delete(key);
    }
  }

  private cleanupClient(client: Client): void {
    if (!this.clients.delete(client)) {
      return;
    }
    for (const key of [...client.subscriptions]) {
      this.removeSubscription(client, key);
    }
  }

  private pingClients(): void {
    for (const client of [...this.clients]) {
      if (!client.isAlive) {
        client.socket.terminate();
        this.cleanupClient(client);
        continue;
      }
      client.isAlive = false;
      client.socket.ping();
    }
  }

  private readonly onRedisMessage = (channel: string, raw: string): void => {
    if (channel !== REALTIME_REDIS_CHANNEL) {
      return;
    }

    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      console.error('[realtime] Ignoring malformed Redis event JSON');
      return;
    }

    const parsed = realtimeRedisEventSchema.safeParse(event);
    if (!parsed.success) {
      console.error('[realtime] Ignoring invalid Redis event');
      return;
    }

    const targets = this.subscriptions.get(subscriptionKeyForEvent(parsed.data));
    if (!targets) {
      return;
    }

    for (const client of targets) {
      send(client.socket, { type: 'event', event: parsed.data });
    }
  };
}

export function attachRealtimeWebSocketServer(
  server: HttpServer,
  options?: RealtimeServerOptions,
): RealtimeWebSocketServer {
  const realtimeServer = new RealtimeWebSocketServer(options);
  realtimeServer.attach(server);
  return realtimeServer;
}
