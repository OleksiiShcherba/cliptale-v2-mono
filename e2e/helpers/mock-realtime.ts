/**
 * Browser-local realtime WebSocket mock helpers for storyboard E2E tests.
 */

import type { Page } from '@playwright/test';

type MockRealtimeEvent = {
  type: 'storyboard.status.updated' | 'ai.job.updated';
  userId: string;
  draftId?: string;
  jobId?: string;
  payload: Record<string, unknown>;
};

/**
 * Installs a browser-local WebSocket replacement for mocked E2E flows.
 * Tests can then emit realtime events without depending on a live API socket.
 */
export async function installMockRealtime(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Listener = (event?: unknown) => void;
    type ListenerMap = Map<string, Set<Listener>>;

    const sockets: MockWebSocket[] = [];

    class MockWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly url: string;
      readyState = MockWebSocket.CONNECTING;
      sentMessages: unknown[] = [];
      private readonly listeners: ListenerMap = new Map();

      constructor(url: string) {
        this.url = url;
        sockets.push(this);
        window.setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.dispatch('open');
          this.dispatch('message', {
            data: JSON.stringify({ type: 'connected', heartbeatMs: 30_000 }),
          });
        }, 0);
      }

      addEventListener(type: string, listener: Listener): void {
        const listenersForType = this.listeners.get(type) ?? new Set<Listener>();
        listenersForType.add(listener);
        this.listeners.set(type, listenersForType);
      }

      removeEventListener(type: string, listener: Listener): void {
        this.listeners.get(type)?.delete(listener);
      }

      send(data: string): void {
        const message = JSON.parse(data) as {
          type?: string;
          scope?: string;
          draftId?: string;
          jobId?: string;
        };
        this.sentMessages.push(message);
        if (message.type === 'subscribe' && message.scope) {
          this.dispatch('message', {
            data: JSON.stringify({
              type: 'subscribed',
              scope: message.scope,
              resourceId: message.draftId ?? message.jobId ?? '',
            }),
          });
        }
      }

      close(): void {
        this.readyState = MockWebSocket.CLOSED;
        this.dispatch('close');
      }

      dispatch(type: string, event?: unknown): void {
        this.listeners.get(type)?.forEach((listener) => listener(event));
      }
    }

    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });

    Object.assign(window, {
      __cliptaleRealtimeMock: {
        emit(event: unknown): void {
          for (const socket of sockets) {
            if (socket.readyState !== MockWebSocket.OPEN) continue;
            socket.dispatch('message', {
              data: JSON.stringify({ type: 'event', event }),
            });
          }
        },
        messages(): unknown[] {
          return sockets.flatMap((socket) => socket.sentMessages);
        },
      },
    });
  });
}

export async function emitMockRealtimeEvent(
  page: Page,
  event: MockRealtimeEvent,
): Promise<void> {
  await page.evaluate((nextEvent) => {
    const api = (window as unknown as {
      __cliptaleRealtimeMock?: { emit: (event: unknown) => void };
    }).__cliptaleRealtimeMock;
    if (!api) throw new Error('Mock realtime WebSocket is not installed.');
    api.emit(nextEvent);
  }, event);
}

export async function readMockRealtimeMessages(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const api = (window as unknown as {
      __cliptaleRealtimeMock?: { messages: () => unknown[] };
    }).__cliptaleRealtimeMock;
    return api?.messages() ?? [];
  });
}
