import type { SignalingClient, SdpInit, IceCandidateInit } from './signaling-client';

export interface MinimalPeerConnection {
  addTrack(track: MediaStreamTrack, stream: MediaStream): void;
  createOffer(): Promise<SdpInit>;
  createAnswer(): Promise<SdpInit>;
  setLocalDescription(description: SdpInit): Promise<void>;
  setRemoteDescription(description: SdpInit): Promise<void>;
  addIceCandidate(candidate: IceCandidateInit): Promise<void>;
  close(): void;
  onicecandidate: ((event: { candidate: { toJSON(): IceCandidateInit } | null }) => void) | null;
  ontrack: ((event: { streams: readonly MediaStream[] }) => void) | null;
  onconnectionstatechange: ((event: unknown) => void) | null;
  connectionState?: string;
}

export type PeerConnectionFactory = () => MinimalPeerConnection;

const defaultPeerFactory: PeerConnectionFactory = () =>
  new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }) as unknown as MinimalPeerConnection;

function deviceName(): string {
  if (typeof navigator === 'undefined') return 'Camera';
  return navigator.userAgent.includes('iPhone')
    ? 'iPhone'
    : navigator.userAgent.includes('Android')
      ? 'Android device'
      : 'Camera';
}

export interface BroadcasterController {
  start(stream: MediaStream): void;
  stop(): void;
}

export function createBroadcasterController(
  client: SignalingClient,
  options: { peerFactory?: PeerConnectionFactory } = {}
): BroadcasterController {
  const peerFactory = options.peerFactory ?? defaultPeerFactory;
  const peers = new Map<string, MinimalPeerConnection>();
  let localStream: MediaStream | null = null;

  function handleRequestConnection(viewerId: string): void {
    if (!localStream) return;
    const existing = peers.get(viewerId);
    if (existing) existing.close();
    const peer = peerFactory();
    peers.set(viewerId, peer);
    for (const track of localStream.getTracks()) {
      peer.addTrack(track, localStream);
    }
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        client.send({
          type: 'ice-candidate',
          targetId: viewerId,
          candidate: event.candidate.toJSON(),
          role: 'broadcaster',
        });
      }
    };
    peer
      .createOffer()
      .then((offer) => peer.setLocalDescription(offer).then(() => offer))
      .then((offer) => {
        client.send({ type: 'offer', targetId: viewerId, sdp: offer, role: 'broadcaster' });
      })
      .catch((err) => {
        console.warn('broadcaster: failed to create/send offer', err);
      });
  }

  function handleAnswer(viewerId: string, sdp: SdpInit): void {
    peers
      .get(viewerId)
      ?.setRemoteDescription(sdp)
      .catch((err) => {
        console.warn('broadcaster: failed to apply answer', err);
      });
  }

  function handleIceCandidate(viewerId: string, candidate: IceCandidateInit): void {
    peers
      .get(viewerId)
      ?.addIceCandidate(candidate)
      .catch((err) => {
        console.warn('broadcaster: failed to add ice candidate', err);
      });
  }

  function handlePeerDisconnected(id: string): void {
    const peer = peers.get(id);
    if (peer) {
      peer.close();
      peers.delete(id);
    }
  }

  // Subscriptions live for the whole lifetime of the controller so that
  // start()/stop() cycles don't permanently deafen it to signaling events.
  client.on('request-connection', (msg) => handleRequestConnection(msg.from));
  client.on('answer', (msg) => {
    if (msg.role !== 'viewer') return;
    handleAnswer(msg.from, msg.sdp);
  });
  client.on('ice-candidate', (msg) => {
    if (msg.role !== 'viewer') return;
    handleIceCandidate(msg.from, msg.candidate);
  });
  client.on('peer-disconnected', (msg) => handlePeerDisconnected(msg.id));
  client.on('connected', () => {
    if (localStream) {
      client.send({ type: 'register-broadcaster', name: deviceName() });
    }
  });

  return {
    start(stream) {
      localStream = stream;
      client.send({ type: 'register-broadcaster', name: deviceName() });
    },
    stop() {
      localStream = null;
      for (const peer of peers.values()) peer.close();
      peers.clear();
    },
  };
}

export interface ViewerController {
  connect(broadcasterId: string): void;
  disconnect(): void;
  onRemoteStream(callback: (stream: MediaStream) => void): void;
  onDisconnected(callback: () => void): void;
  onConnectionFailed(callback: () => void): void;
}

export function createViewerController(
  client: SignalingClient,
  options: { peerFactory?: PeerConnectionFactory } = {}
): ViewerController {
  const peerFactory = options.peerFactory ?? defaultPeerFactory;
  let peer: MinimalPeerConnection | null = null;
  let targetId: string | null = null;
  let streamCallback: ((stream: MediaStream) => void) | null = null;
  let disconnectedCallback: (() => void) | null = null;
  let connectionFailedCallback: (() => void) | null = null;

  function handleOffer(fromId: string, sdp: SdpInit): void {
    if (fromId !== targetId || !peer) return;
    const activePeer = peer;
    activePeer
      .setRemoteDescription(sdp)
      .then(() => activePeer.createAnswer())
      .then((answer) => activePeer.setLocalDescription(answer).then(() => answer))
      .then((answer) => {
        client.send({ type: 'answer', targetId: fromId, sdp: answer, role: 'viewer' });
      })
      .catch((err) => {
        console.warn('viewer: failed to answer offer', err);
        connectionFailedCallback?.();
      });
  }

  function handleIceCandidate(fromId: string, candidate: IceCandidateInit): void {
    if (fromId !== targetId) return;
    peer?.addIceCandidate(candidate).catch((err) => {
      console.warn('viewer: failed to add ice candidate', err);
    });
  }

  function teardownPeer(): void {
    peer?.close();
    peer = null;
  }

  function handlePeerDisconnected(id: string): void {
    if (id !== targetId) return;
    teardownPeer();
    targetId = null;
    disconnectedCallback?.();
  }

  // Subscriptions live for the whole lifetime of the controller so that
  // connect()/disconnect() cycles don't permanently deafen it to signaling events.
  client.on('offer', (msg) => {
    if (msg.role !== 'broadcaster') return;
    handleOffer(msg.from, msg.sdp);
  });
  client.on('ice-candidate', (msg) => {
    if (msg.role !== 'broadcaster') return;
    handleIceCandidate(msg.from, msg.candidate);
  });
  client.on('peer-disconnected', (msg) => handlePeerDisconnected(msg.id));
  client.on('connected', () => {
    if (targetId) {
      client.send({ type: 'request-connection', targetId });
    }
  });

  function startPeer(broadcasterId: string): void {
    targetId = broadcasterId;
    const newPeer = peerFactory();
    peer = newPeer;
    newPeer.onicecandidate = (event) => {
      if (event.candidate) {
        client.send({
          type: 'ice-candidate',
          targetId: broadcasterId,
          candidate: event.candidate.toJSON(),
          role: 'viewer',
        });
      }
    };
    newPeer.ontrack = (event) => {
      if (streamCallback && event.streams[0]) streamCallback(event.streams[0]);
    };
    newPeer.onconnectionstatechange = () => {
      const state = newPeer.connectionState;
      if (state === 'failed' || state === 'disconnected') {
        connectionFailedCallback?.();
      }
    };
    client.send({ type: 'request-connection', targetId: broadcasterId });
  }

  return {
    connect(broadcasterId) {
      startPeer(broadcasterId);
    },
    disconnect() {
      teardownPeer();
      targetId = null;
    },
    onRemoteStream(callback) {
      streamCallback = callback;
    },
    onDisconnected(callback) {
      disconnectedCallback = callback;
    },
    onConnectionFailed(callback) {
      connectionFailedCallback = callback;
    },
  };
}
