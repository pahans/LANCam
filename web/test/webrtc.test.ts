import { describe, it, expect, vi } from 'vitest';
import { createSignalingClient, type WebSocketLike } from '../lib/signaling-client';
import { createBroadcasterController, createViewerController, type MinimalPeerConnection } from '../lib/webrtc';

function makeFakeSocket(): WebSocketLike & { emitMessage: (data: unknown) => void } {
  const socket: any = {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    emitMessage(data: unknown) {
      this.onmessage?.({ data: JSON.stringify(data) });
    },
  };
  return socket;
}

function makeFakePeer(): MinimalPeerConnection & { emitIceCandidate: (c: RTCIceCandidateInit) => void } {
  const peer: any = {
    addTrack: vi.fn(),
    createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'offer-sdp' }),
    createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'answer-sdp' }),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    setRemoteDescription: vi.fn().mockResolvedValue(undefined),
    addIceCandidate: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    onicecandidate: null,
    ontrack: null,
    onconnectionstatechange: null,
    connectionState: 'new',
    emitIceCandidate(candidate: RTCIceCandidateInit) {
      this.onicecandidate?.({ candidate: { ...candidate, toJSON: () => candidate } });
    },
  };
  return peer;
}

describe('createBroadcasterController', () => {
  it('registers with the signaling server on start', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const controller = createBroadcasterController(client);

    const stream = { getTracks: () => [] } as unknown as MediaStream;
    controller.start(stream);

    expect(socket.send).toHaveBeenCalled();
    const [[callArg]] = (socket.send as ReturnType<typeof vi.fn>).mock.calls;
    const msg = JSON.parse(callArg);
    expect(msg).toEqual({ type: 'register-broadcaster', name: expect.any(String) });
  });

  it('creates a peer connection, adds tracks, and sends an offer when a viewer requests a connection', async () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peer = makeFakePeer();
    const controller = createBroadcasterController(client, { peerFactory: () => peer });

    const track = {} as MediaStreamTrack;
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    controller.start(stream);

    socket.emitMessage({ type: 'request-connection', from: 'viewer-1' });
    await vi.waitFor(() => expect(peer.setLocalDescription).toHaveBeenCalled());

    expect(peer.addTrack).toHaveBeenCalledWith(track, stream);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'offer',
        targetId: 'viewer-1',
        sdp: { type: 'offer', sdp: 'offer-sdp' },
        role: 'broadcaster',
      })
    );
  });

  it('applies an answer to the matching peer connection', async () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peer = makeFakePeer();
    const controller = createBroadcasterController(client, { peerFactory: () => peer });

    controller.start({ getTracks: () => [] } as unknown as MediaStream);
    socket.emitMessage({ type: 'request-connection', from: 'viewer-1' });
    await vi.waitFor(() => expect(peer.setLocalDescription).toHaveBeenCalled());

    socket.emitMessage({
      type: 'answer',
      from: 'viewer-1',
      sdp: { type: 'answer', sdp: 'answer-sdp' },
      role: 'viewer',
    });
    await vi.waitFor(() =>
      expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'answer-sdp' })
    );
  });

  it('ignores an answer tagged with role broadcaster (mis-routed for a dual broadcaster/viewer device)', async () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peer = makeFakePeer();
    const controller = createBroadcasterController(client, { peerFactory: () => peer });

    controller.start({ getTracks: () => [] } as unknown as MediaStream);
    socket.emitMessage({ type: 'request-connection', from: 'peer-1' });
    await vi.waitFor(() => expect(peer.setLocalDescription).toHaveBeenCalled());

    socket.emitMessage({
      type: 'answer',
      from: 'peer-1',
      sdp: { type: 'answer', sdp: 'answer-sdp' },
      role: 'broadcaster',
    });

    expect(peer.setRemoteDescription).not.toHaveBeenCalled();
  });

  it('closes the previous peer connection when a viewer re-requests a connection', async () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peers: ReturnType<typeof makeFakePeer>[] = [];
    const controller = createBroadcasterController(client, {
      peerFactory: () => {
        const p = makeFakePeer();
        peers.push(p);
        return p;
      },
    });

    controller.start({ getTracks: () => [] } as unknown as MediaStream);
    socket.emitMessage({ type: 'request-connection', from: 'viewer-1' });
    await vi.waitFor(() => expect(peers).toHaveLength(1));
    await vi.waitFor(() => expect(peers[0].setLocalDescription).toHaveBeenCalled());

    socket.emitMessage({ type: 'request-connection', from: 'viewer-1' });
    await vi.waitFor(() => expect(peers).toHaveLength(2));

    expect(peers[0].close).toHaveBeenCalled();
  });

  it('closes and removes a viewer peer on peer-disconnected', async () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peer = makeFakePeer();
    const controller = createBroadcasterController(client, { peerFactory: () => peer });

    controller.start({ getTracks: () => [] } as unknown as MediaStream);
    socket.emitMessage({ type: 'request-connection', from: 'viewer-1' });
    await vi.waitFor(() => expect(peer.setLocalDescription).toHaveBeenCalled());

    socket.emitMessage({ type: 'peer-disconnected', id: 'viewer-1' });

    expect(peer.close).toHaveBeenCalled();
  });

  it('re-registers as broadcaster on reconnect if still broadcasting', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const controller = createBroadcasterController(client);

    controller.start({ getTracks: () => [] } as unknown as MediaStream);
    (socket.send as ReturnType<typeof vi.fn>).mockClear();

    socket.emitMessage({ type: 'connected' });

    expect(socket.send).toHaveBeenCalled();
    const [[callArg]] = (socket.send as ReturnType<typeof vi.fn>).mock.calls;
    expect(JSON.parse(callArg)).toEqual({ type: 'register-broadcaster', name: expect.any(String) });
  });

  it('allows start() to be used again after stop() (subscriptions survive)', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const controller = createBroadcasterController(client);

    controller.start({ getTracks: () => [] } as unknown as MediaStream);
    controller.stop();
    (socket.send as ReturnType<typeof vi.fn>).mockClear();
    controller.start({ getTracks: () => [] } as unknown as MediaStream);

    expect(socket.send).toHaveBeenCalled();
  });
});

describe('createViewerController', () => {
  it('sends request-connection to the chosen broadcaster', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const controller = createViewerController(client, { peerFactory: () => makeFakePeer() });

    controller.connect('broadcaster-1');

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'request-connection', targetId: 'broadcaster-1' }));
  });

  it('answers an incoming offer from the connected broadcaster', async () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peer = makeFakePeer();
    const controller = createViewerController(client, { peerFactory: () => peer });

    controller.connect('broadcaster-1');
    socket.emitMessage({
      type: 'offer',
      from: 'broadcaster-1',
      sdp: { type: 'offer', sdp: 'offer-sdp' },
      role: 'broadcaster',
    });

    await vi.waitFor(() => expect(peer.setLocalDescription).toHaveBeenCalled());
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: 'offer-sdp' });
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'answer',
        targetId: 'broadcaster-1',
        sdp: { type: 'answer', sdp: 'answer-sdp' },
        role: 'viewer',
      })
    );
  });

  it('ignores an offer from a broadcaster it did not connect to', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peer = makeFakePeer();
    const controller = createViewerController(client, { peerFactory: () => peer });

    controller.connect('broadcaster-1');
    socket.emitMessage({ type: 'offer', from: 'someone-else', sdp: { type: 'offer', sdp: 'x' }, role: 'broadcaster' });

    expect(peer.setRemoteDescription).not.toHaveBeenCalled();
  });

  it('ignores an offer tagged with role viewer (mis-routed for a dual broadcaster/viewer device)', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peer = makeFakePeer();
    const controller = createViewerController(client, { peerFactory: () => peer });

    controller.connect('broadcaster-1');
    socket.emitMessage({
      type: 'offer',
      from: 'broadcaster-1',
      sdp: { type: 'offer', sdp: 'x' },
      role: 'viewer',
    });

    expect(peer.setRemoteDescription).not.toHaveBeenCalled();
  });

  it('invokes the remote-stream callback when a track arrives', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peer = makeFakePeer();
    const controller = createViewerController(client, { peerFactory: () => peer });
    const onStream = vi.fn();
    controller.onRemoteStream(onStream);

    controller.connect('broadcaster-1');
    const remoteStream = {} as MediaStream;
    peer.ontrack?.({ streams: [remoteStream] } as unknown as RTCTrackEvent);

    expect(onStream).toHaveBeenCalledWith(remoteStream);
  });

  it('invokes the disconnected callback and tears down the peer on peer-disconnected', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peer = makeFakePeer();
    const controller = createViewerController(client, { peerFactory: () => peer });
    const onDisconnected = vi.fn();
    controller.onDisconnected(onDisconnected);

    controller.connect('broadcaster-1');
    socket.emitMessage({ type: 'peer-disconnected', id: 'broadcaster-1' });

    expect(peer.close).toHaveBeenCalled();
    expect(onDisconnected).toHaveBeenCalled();
  });

  it('ignores peer-disconnected for an id it is not connected to', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peer = makeFakePeer();
    const controller = createViewerController(client, { peerFactory: () => peer });
    const onDisconnected = vi.fn();
    controller.onDisconnected(onDisconnected);

    controller.connect('broadcaster-1');
    socket.emitMessage({ type: 'peer-disconnected', id: 'someone-else' });

    expect(peer.close).not.toHaveBeenCalled();
    expect(onDisconnected).not.toHaveBeenCalled();
  });

  it('invokes the connection-failed callback when the peer connection state becomes failed', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peer = makeFakePeer();
    const controller = createViewerController(client, { peerFactory: () => peer });
    const onFailed = vi.fn();
    controller.onConnectionFailed(onFailed);

    controller.connect('broadcaster-1');
    peer.connectionState = 'failed';
    peer.onconnectionstatechange?.({});

    expect(onFailed).toHaveBeenCalled();
  });

  it('re-issues request-connection on reconnect if actively connected', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const controller = createViewerController(client, { peerFactory: () => makeFakePeer() });

    controller.connect('broadcaster-1');
    (socket.send as ReturnType<typeof vi.fn>).mockClear();

    socket.emitMessage({ type: 'connected' });

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'request-connection', targetId: 'broadcaster-1' }));
  });

  it('allows connect() to be used again after disconnect() (subscriptions survive)', async () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peers: ReturnType<typeof makeFakePeer>[] = [];
    const controller = createViewerController(client, {
      peerFactory: () => {
        const p = makeFakePeer();
        peers.push(p);
        return p;
      },
    });

    controller.connect('broadcaster-1');
    controller.disconnect();

    controller.connect('broadcaster-1');
    socket.emitMessage({
      type: 'offer',
      from: 'broadcaster-1',
      sdp: { type: 'offer', sdp: 'offer-sdp' },
      role: 'broadcaster',
    });

    expect(peers).toHaveLength(2);
    await vi.waitFor(() => expect(peers[1].setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: 'offer-sdp' }));
    expect(peers[0].setRemoteDescription).not.toHaveBeenCalled();
  });
});
