import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetAuthToken } = vi.hoisted(() => ({
  mockGetAuthToken: vi.fn(),
}));

vi.mock('./api-client', () => ({
  getAuthToken: mockGetAuthToken,
}));

vi.mock('./config', () => ({
  config: {
    apiBaseUrl: 'https://api.example.test/v1',
  },
}));

type Listener = (event?: unknown) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  closed = false;
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeWebSocket.CLOSED;
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  receive(data: unknown): void {
    this.emit('message', { data: JSON.stringify(data) });
  }

  disconnect(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  }

  private emit(type: string, event?: unknown): void {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

async function importClient(): Promise<typeof import('./realtime-client')> {
  vi.resetModules();
  return import('./realtime-client');
}

describe('realtime-client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    FakeWebSocket.instances = [];
    mockGetAuthToken.mockReturnValue('token-123');
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  it('shares one authenticated socket, routes scoped events, and cleans up the final subscription', async () => {
    const { getRealtimeClient } = await importClient();
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    const unsubscribeFirst = getRealtimeClient().subscribe(
      { type: 'subscribe', scope: 'draft-storyboard', draftId: 'draft-1' },
      { onEvent: firstHandler },
    );
    const unsubscribeSecond = getRealtimeClient().subscribe(
      { type: 'subscribe', scope: 'draft-storyboard', draftId: 'draft-1' },
      { onEvent: secondHandler },
    );

    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe('wss://api.example.test/realtime?token=token-123');

    socket.open();
    expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
      { type: 'subscribe', scope: 'draft-storyboard', draftId: 'draft-1' },
    ]);

    socket.receive({
      type: 'event',
      event: {
        type: 'storyboard.status.updated',
        draftId: 'draft-1',
        userId: 'user-1',
        payload: { resource: 'storyboardPlan', status: 'running' },
      },
    });

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    socket.receive({
      type: 'event',
      event: {
        type: 'storyboard.status.updated',
        draftId: 'draft-1',
        userId: 'user-1',
        payload: { resource: 'storyboardPlan', status: 'completed' },
      },
    });

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(2);

    unsubscribeSecond();
    expect(JSON.parse(socket.sent.at(-1) ?? '{}')).toEqual({
      type: 'unsubscribe',
      scope: 'draft-storyboard',
      draftId: 'draft-1',
    });
    expect(socket.closed).toBe(true);
  });

  it('resubscribes and refreshes active handlers once after reconnect', async () => {
    const { getRealtimeClient } = await importClient();
    const onReconnect = vi.fn();

    getRealtimeClient().subscribe(
      { type: 'subscribe', scope: 'draft-storyboard', draftId: 'draft-1' },
      { onEvent: vi.fn(), onReconnect },
    );

    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.open();
    firstSocket.disconnect();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    const secondSocket = FakeWebSocket.instances[1];
    secondSocket.open();

    expect(secondSocket.sent.map((message) => JSON.parse(message))).toEqual([
      { type: 'subscribe', scope: 'draft-storyboard', draftId: 'draft-1' },
    ]);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
