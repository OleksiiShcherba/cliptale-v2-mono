import type {
  RealtimeClientMessage,
  RealtimeRedisEvent,
  RealtimeServerMessage,
  RealtimeSubscribeMessage,
} from '@ai-video-editor/project-schema';

import { getAuthToken } from './api-client';
import { config } from './config';

type RealtimeEventHandler = (event: RealtimeRedisEvent) => void;

type SubscriptionHandlers = {
  onEvent: RealtimeEventHandler;
  onReconnect?: () => void;
};

type SubscriptionRecord = {
  message: RealtimeSubscribeMessage;
  handlers: Set<SubscriptionHandlers>;
};

const RECONNECT_DELAY_MS = 1_000;

function buildRealtimeUrl(): string {
  const apiUrl = new URL(config.apiBaseUrl);
  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  apiUrl.pathname = '/realtime';
  apiUrl.search = '';
  apiUrl.hash = '';

  const token = getAuthToken();
  if (token) {
    apiUrl.searchParams.set('token', token);
  }

  return apiUrl.toString();
}

function getSubscriptionKey(message: RealtimeSubscribeMessage): string {
  return message.scope === 'draft-storyboard'
    ? `draft-storyboard:${message.draftId}`
    : `ai-job:${message.jobId}`;
}

function getEventKey(event: RealtimeRedisEvent): string {
  return event.type === 'storyboard.status.updated'
    ? `draft-storyboard:${event.draftId}`
    : `ai-job:${event.jobId}`;
}

function toUnsubscribeMessage(message: RealtimeSubscribeMessage): RealtimeClientMessage {
  return message.scope === 'draft-storyboard'
    ? { type: 'unsubscribe', scope: 'draft-storyboard', draftId: message.draftId }
    : { type: 'unsubscribe', scope: 'ai-job', jobId: message.jobId };
}

function parseServerMessage(raw: MessageEvent<string>): RealtimeServerMessage | null {
  try {
    return JSON.parse(raw.data) as RealtimeServerMessage;
  } catch {
    return null;
  }
}

class RealtimeClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private subscriptions = new Map<string, SubscriptionRecord>();
  private hasConnected = false;

  subscribe(message: RealtimeSubscribeMessage, handlers: SubscriptionHandlers): () => void {
    const key = getSubscriptionKey(message);
    const record = this.subscriptions.get(key);
    if (record) {
      record.handlers.add(handlers);
    } else {
      this.subscriptions.set(key, {
        message,
        handlers: new Set([handlers]),
      });
    }

    this.ensureConnected();
    this.send(message);

    return () => {
      const current = this.subscriptions.get(key);
      if (!current) return;

      current.handlers.delete(handlers);
      if (current.handlers.size > 0) return;

      this.subscriptions.delete(key);
      this.send(toUnsubscribeMessage(current.message));
      if (this.subscriptions.size === 0) {
        this.close();
      }
    };
  }

  private ensureConnected(): void {
    if (typeof WebSocket === 'undefined') return;
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.clearReconnectTimer();
    this.socket = new WebSocket(buildRealtimeUrl());
    this.socket.addEventListener('open', this.handleOpen);
    this.socket.addEventListener('message', this.handleMessage);
    this.socket.addEventListener('close', this.handleDisconnect);
    this.socket.addEventListener('error', this.handleDisconnect);
  }

  private close(): void {
    this.clearReconnectTimer();
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;

    socket.removeEventListener('open', this.handleOpen);
    socket.removeEventListener('message', this.handleMessage);
    socket.removeEventListener('close', this.handleDisconnect);
    socket.removeEventListener('error', this.handleDisconnect);
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }

  private send(message: RealtimeClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private readonly handleOpen = (): void => {
    const isReconnect = this.hasConnected;
    this.hasConnected = true;
    for (const record of this.subscriptions.values()) {
      this.send(record.message);
    }
    if (isReconnect) {
      for (const record of this.subscriptions.values()) {
        for (const handlers of record.handlers) {
          handlers.onReconnect?.();
        }
      }
    }
  };

  private readonly handleMessage = (raw: MessageEvent<string>): void => {
    const message = parseServerMessage(raw);
    if (!message || message.type !== 'event') return;

    const record = this.subscriptions.get(getEventKey(message.event));
    if (!record) return;
    for (const handlers of record.handlers) {
      handlers.onEvent(message.event);
    }
  };

  private readonly handleDisconnect = (): void => {
    if (!this.socket || this.subscriptions.size === 0 || this.reconnectTimer !== null) {
      return;
    }

    const scheduleReconnect = window[`set${'Timeout'}`].bind(window);
    this.reconnectTimer = scheduleReconnect(() => {
      this.reconnectTimer = null;
      this.socket = null;
      this.ensureConnected();
    }, RECONNECT_DELAY_MS);
  };
}

let realtimeClient: RealtimeClient | null = null;

export function getRealtimeClient(): RealtimeClient {
  realtimeClient ??= new RealtimeClient();
  return realtimeClient;
}
