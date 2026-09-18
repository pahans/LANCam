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
    const [[callArg]] = socket.send.mock.calls;
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
      JSON.stringify({ type: 'offer', targetId: 'viewer-1', sdp: { type: 'offer', sdp: 'offer-sdp' } })
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

    socket.emitMessage({ type: 'answer', from: 'viewer-1', sdp: { type: 'answer', sdp: 'answer-sdp' } });
    await vi.waitFor(() =>
      expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'answer-sdp' })
    );
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
    socket.emitMessage({ type: 'offer', from: 'broadcaster-1', sdp: { type: 'offer', sdp: 'offer-sdp' } });

    await vi.waitFor(() => expect(peer.setLocalDescription).toHaveBeenCalled());
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: 'offer-sdp' });
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'answer', targetId: 'broadcaster-1', sdp: { type: 'answer', sdp: 'answer-sdp' } })
    );
  });

  it('ignores an offer from a broadcaster it did not connect to', () => {
    const socket = makeFakeSocket();
    const client = createSignalingClient('ws://example', { wsFactory: () => socket });
    const peer = makeFakePeer();
    const controller = createViewerController(client, { peerFactory: () => peer });

    controller.connect('broadcaster-1');
    socket.emitMessage({ type: 'offer', from: 'someone-else', sdp: { type: 'offer', sdp: 'x' } });

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
    peer.ontrack?.({ streams: [remoteStream] } as RTCTrackEvent);

    expect(onStream).toHaveBeenCalledWith(remoteStream);
  });
});
