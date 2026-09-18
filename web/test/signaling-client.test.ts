import { describe, it, expect, vi } from 'vitest';
import { createSignalingClient, type WebSocketLike } from '../lib/signaling-client';

function makeFakeSocket() {
  const socket: WebSocketLike & { emitOpen: () => void; emitMessage: (data: unknown) => void; emitClose: () => void } = {
    readyState: 0,
    send: vi.fn(),
    close: vi.fn(function (this: WebSocketLike) {
      this.readyState = 3;
    }),
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    emitOpen() {
      this.readyState = 1;
      this.onopen?.();
    },
    emitMessage(data: unknown) {
      this.onmessage?.({ data: JSON.stringify(data) });
    },
    emitClose() {
      this.readyState = 3;
      this.onclose?.();
    },
  };
  return socket;
}

describe('createSignalingClient', () => {
  it('sends messages only once the socket is open', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });

    client.send({ type: 'register-broadcaster', name: 'Phone' });
    expect(socket.send).not.toHaveBeenCalled();

    socket.emitOpen();
    client.send({ type: 'register-broadcaster', name: 'Phone' });
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'register-broadcaster', name: 'Phone' }));
  });

  it('dispatches incoming messages to handlers registered for that type', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });

    const handler = vi.fn();
    client.on('broadcaster-list', handler);
    socket.emitMessage({ type: 'broadcaster-list', broadcasters: [{ id: 'a', name: 'Phone' }] });

    expect(handler).toHaveBeenCalledWith({ type: 'broadcaster-list', broadcasters: [{ id: 'a', name: 'Phone' }] });
  });

  it('does not call handlers for other message types', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });

    const handler = vi.fn();
    client.on('welcome', handler);
    socket.emitMessage({ type: 'broadcaster-list', broadcasters: [] });

    expect(handler).not.toHaveBeenCalled();
  });

  it('stops calling a handler after it unsubscribes', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });

    const handler = vi.fn();
    const unsubscribe = client.on('welcome', handler);
    unsubscribe();
    socket.emitMessage({ type: 'welcome', id: 'a' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('emits a synthetic connected message when the socket opens', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });

    const handler = vi.fn();
    client.on('connected', handler);
    socket.emitOpen();

    expect(handler).toHaveBeenCalledWith({ type: 'connected' });
  });

  it('emits a synthetic disconnected message when the socket closes', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });

    const handler = vi.fn();
    client.on('disconnected', handler);
    socket.emitClose();

    expect(handler).toHaveBeenCalledWith({ type: 'disconnected' });
  });

  it('reconnects after the socket closes, unless the client was closed by the caller', () => {
    vi.useFakeTimers();
    const sockets: ReturnType<typeof makeFakeSocket>[] = [];
    const wsFactory = () => {
      const socket = makeFakeSocket();
      sockets.push(socket);
      return socket;
    };
    createSignalingClient('ws://example', { wsFactory, reconnectDelayMs: 100 });

    expect(sockets).toHaveLength(1);
    sockets[0].emitClose();
    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(2);

    vi.useRealTimers();
  });

  it('does not reconnect after close() is called by the caller', () => {
    vi.useFakeTimers();
    const sockets: ReturnType<typeof makeFakeSocket>[] = [];
    const wsFactory = () => {
      const socket = makeFakeSocket();
      sockets.push(socket);
      return socket;
    };
    const client = createSignalingClient('ws://example', { wsFactory, reconnectDelayMs: 100 });

    client.close();
    sockets[0].emitClose();
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(1);

    vi.useRealTimers();
  });
});
