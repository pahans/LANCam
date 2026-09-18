'use client';

import { useEffect, useRef, useState } from 'react';
import { createSignalingClient, type SignalingClient } from '@/lib/signaling-client';
import { createBroadcasterController, createViewerController } from '@/lib/webrtc';

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL;

type Broadcaster = { id: string; name: string };

export default function Home() {
  const clientRef = useRef<SignalingClient | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const broadcasterControllerRef = useRef<ReturnType<typeof createBroadcasterController> | null>(null);
  const viewerControllerRef = useRef<ReturnType<typeof createViewerController> | null>(null);

  const [broadcasters, setBroadcasters] = useState<Broadcaster[]>([]);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSignalingConnected, setIsSignalingConnected] = useState(false);
  const [cameraOffline, setCameraOffline] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);

  useEffect(() => {
    if (!SIGNALING_URL) {
      setError('NEXT_PUBLIC_SIGNALING_URL is not configured for this build.');
      return;
    }

    const client = createSignalingClient(SIGNALING_URL);
    clientRef.current = client;
    broadcasterControllerRef.current = createBroadcasterController(client);

    const viewerController = createViewerController(client);
    viewerControllerRef.current = viewerController;
    viewerController.onRemoteStream((stream) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
    });
    viewerController.onDisconnected(() => {
      setViewingId(null);
      setCameraOffline(true);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    });
    viewerController.onConnectionFailed(() => {
      setConnectionFailed(true);
    });

    const unsubscribeList = client.on('broadcaster-list', (msg) => setBroadcasters(msg.broadcasters));
    const unsubscribeConnected = client.on('connected', () => setIsSignalingConnected(true));
    const unsubscribeDisconnected = client.on('disconnected', () => setIsSignalingConnected(false));

    return () => {
      unsubscribeList();
      unsubscribeConnected();
      unsubscribeDisconnected();
      client.close();
    };
  }, []);

  async function startBroadcasting() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      broadcasterControllerRef.current?.start(stream);
      setIsBroadcasting(true);
    } catch (err) {
      setError(`Could not access camera: ${(err as Error).message}`);
    }
  }

  function viewBroadcaster(id: string) {
    setCameraOffline(false);
    setConnectionFailed(false);
    viewerControllerRef.current?.disconnect();
    viewerControllerRef.current?.connect(id);
    setViewingId(id);
  }

  function retryViewing() {
    if (viewingId) viewBroadcaster(viewingId);
  }

  return (
    <main>
      <h1>LANCam</h1>
      <p>Signaling: {isSignalingConnected ? 'Connected' : 'Disconnected — retrying...'}</p>
      {error && <p role="alert">{error}</p>}

      <section>
        <h2>Broadcast this device&apos;s camera</h2>
        {!isBroadcasting && <button onClick={startBroadcasting}>Start Camera</button>}
        <video ref={localVideoRef} autoPlay muted playsInline width={320} />
      </section>

      <section>
        <h2>Available cameras on this network</h2>
        {broadcasters.length === 0 && <p>No cameras broadcasting right now.</p>}
        <ul>
          {broadcasters.map((b) => (
            <li key={b.id}>
              {b.name}{' '}
              <button onClick={() => viewBroadcaster(b.id)} disabled={viewingId === b.id}>
                {viewingId === b.id ? 'Viewing' : 'View'}
              </button>
            </li>
          ))}
        </ul>
        {cameraOffline && <p role="status">Camera offline</p>}
        {connectionFailed && (
          <p role="alert">
            Connection failed. <button onClick={retryViewing}>Retry</button>
          </p>
        )}
        <video ref={remoteVideoRef} autoPlay playsInline width={320} />
      </section>
    </main>
  );
}
