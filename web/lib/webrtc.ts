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
    const peer = peerFactory();
    peers.set(viewerId, peer);
    for (const track of localStream.getTracks()) {
      peer.addTrack(track, localStream);
    }
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        client.send({ type: 'ice-candidate', targetId: viewerId, candidate: event.candidate.toJSON() });
      }
    };
    peer
      .createOffer()
      .then((offer) => peer.setLocalDescription(offer).then(() => offer))
      .then((offer) => {
        client.send({ type: 'offer', targetId: viewerId, sdp: offer });
      });
  }

  function handleAnswer(viewerId: string, sdp: SdpInit): void {
    peers.get(viewerId)?.setRemoteDescription(sdp);
  }

  function handleIceCandidate(viewerId: string, candidate: IceCandidateInit): void {
    peers.get(viewerId)?.addIceCandidate(candidate);
  }

  const unsubscribers = [
    client.on('request-connection', (msg) => handleRequestConnection(msg.from)),
    client.on('answer', (msg) => handleAnswer(msg.from, msg.sdp)),
    client.on('ice-candidate', (msg) => handleIceCandidate(msg.from, msg.candidate)),
  ];

  return {
    start(stream) {
      localStream = stream;
      client.send({ type: 'register-broadcaster', name: deviceName() });
    },
    stop() {
      localStream = null;
      for (const peer of peers.values()) peer.close();
      peers.clear();
      for (const unsubscribe of unsubscribers) unsubscribe();
    },
  };
}

export interface ViewerController {
  connect(broadcasterId: string): void;
  disconnect(): void;
  onRemoteStream(callback: (stream: MediaStream) => void): void;
}

export function createViewerController(
  client: SignalingClient,
  options: { peerFactory?: PeerConnectionFactory } = {}
): ViewerController {
  const peerFactory = options.peerFactory ?? defaultPeerFactory;
  let peer: MinimalPeerConnection | null = null;
  let targetId: string | null = null;
  let streamCallback: ((stream: MediaStream) => void) | null = null;

  function handleOffer(fromId: string, sdp: SdpInit): void {
    if (fromId !== targetId || !peer) return;
    const activePeer = peer;
    activePeer
      .setRemoteDescription(sdp)
      .then(() => activePeer.createAnswer())
      .then((answer) => activePeer.setLocalDescription(answer).then(() => answer))
      .then((answer) => {
        client.send({ type: 'answer', targetId: fromId, sdp: answer });
      });
  }

  function handleIceCandidate(fromId: string, candidate: IceCandidateInit): void {
    if (fromId !== targetId) return;
    peer?.addIceCandidate(candidate);
  }

  const unsubscribers = [
    client.on('offer', (msg) => handleOffer(msg.from, msg.sdp)),
    client.on('ice-candidate', (msg) => handleIceCandidate(msg.from, msg.candidate)),
  ];

  return {
    connect(broadcasterId) {
      targetId = broadcasterId;
      const newPeer = peerFactory();
      peer = newPeer;
      newPeer.onicecandidate = (event) => {
        if (event.candidate) {
          client.send({ type: 'ice-candidate', targetId: broadcasterId, candidate: event.candidate.toJSON() });
        }
      };
      newPeer.ontrack = (event) => {
        if (streamCallback && event.streams[0]) streamCallback(event.streams[0]);
      };
      client.send({ type: 'request-connection', targetId: broadcasterId });
    },
    disconnect() {
      peer?.close();
      peer = null;
      targetId = null;
      for (const unsubscribe of unsubscribers) unsubscribe();
    },
    onRemoteStream(callback) {
      streamCallback = callback;
    },
  };
}
