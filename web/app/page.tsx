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

    const unsubscribeList = client.on('broadcaster-list', (msg) => setBroadcasters(msg.broadcasters));

    return () => {
      unsubscribeList();
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
    viewerControllerRef.current?.connect(id);
    setViewingId(id);
  }

  return (
    <main>
      <h1>LANCam</h1>
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
        <video ref={remoteVideoRef} autoPlay playsInline width={320} />
      </section>
    </main>
  );
}
