'use client';

import { useEffect, useRef, useState } from 'react';
import { createSignalingClient, type SignalingClient } from '@/lib/signaling-client';
import { createBroadcasterController, createViewerController } from '@/lib/webrtc';
import styles from './page.module.css';

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL;

type Broadcaster = { id: string; name: string };

function CameraIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4F6F5" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export default function Home() {
  const clientRef = useRef<SignalingClient | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
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
      localStreamRef.current = stream;
      broadcasterControllerRef.current?.start(stream);
      setIsBroadcasting(true);
      setError(null);
    } catch (err) {
      setError(`Could not access camera: ${(err as Error).message}`);
    }
  }

  function stopBroadcasting() {
    broadcasterControllerRef.current?.stop();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setIsBroadcasting(false);
  }

  useEffect(() => {
    if (isBroadcasting && localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isBroadcasting]);

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

  function backToDiscover() {
    viewerControllerRef.current?.disconnect();
    setViewingId(null);
    setCameraOffline(false);
    setConnectionFailed(false);
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }

  const viewingName = broadcasters.find((b) => b.id === viewingId)?.name ?? 'Camera';

  if (isBroadcasting) {
    return (
      <main className={styles.shell}>
        <div className={styles.stage}>
          <video ref={localVideoRef} autoPlay muted playsInline className={styles.video} />
          <div className={styles.overlayTop}>
            <span className={styles.iconButton} />
            <div className={styles.liveTag}>
              <span className={styles.liveTagDot} />
              <span className={styles.liveTagText}>LIVE</span>
            </div>
            <span className={styles.iconButton} />
          </div>
          <div className={styles.overlayBottom}>
            <button className={styles.stopButton} onClick={stopBroadcasting}>
              <span style={{ width: 13, height: 13, borderRadius: 3, background: '#fff' }} />
              Stop Broadcasting
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (viewingId && !cameraOffline && !connectionFailed) {
    return (
      <main className={styles.shell}>
        <div className={styles.stage}>
          <video ref={remoteVideoRef} autoPlay playsInline className={styles.video} />
          <div className={styles.overlayTop}>
            <button className={styles.iconButton} onClick={backToDiscover} aria-label="Back to cameras">
              <BackIcon />
            </button>
            <div className={styles.viewerTitleRow}>
              <div className={styles.viewerName}>{viewingName}</div>
              <div className={styles.viewerMeta}>
                <span className={styles.dot} />
                Peer-to-peer · LAN
              </div>
            </div>
            <span className={styles.iconButton} />
          </div>
        </div>
      </main>
    );
  }

  if (cameraOffline || connectionFailed) {
    return (
      <main className={styles.shell}>
        <div className={styles.messageStage}>
          <div className={styles.messageIcon}>
            <CameraIcon color="#8C9793" />
          </div>
          <div>
            <div className={styles.messageTitle}>
              {connectionFailed ? 'Connection failed' : 'This camera went offline'}
            </div>
            <div className={styles.messageText}>
              {connectionFailed
                ? `Couldn't reach ${viewingName}. It may not be on the same local network as this device.`
                : `${viewingName} stopped broadcasting or left the network. It'll reappear here as soon as it's back.`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {connectionFailed && (
              <button className={styles.primaryButton} onClick={retryViewing}>
                Retry
              </button>
            )}
            <button className={styles.secondaryButton} onClick={backToDiscover}>
              Back to cameras
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandDot} />
          <span className={styles.wordmark}>LANCam</span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statusPill}>
            <span className={`${styles.dot} ${isSignalingConnected ? '' : styles.dotOffline}`} />
            {isSignalingConnected ? 'Connected' : 'Reconnecting…'}
          </div>
        </div>
      </div>

      <div className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.title}>Discover</h1>
          <p className={styles.subtitle}>
            Anyone on this Wi-Fi network can be found here. Video never leaves your LAN.
          </p>
        </div>

        {error && <p className={styles.errorBanner} role="alert">{error}</p>}

        <button className={styles.primaryButton} onClick={startBroadcasting}>
          <CameraIcon color="#0B0F0E" />
          Start Broadcasting
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className={styles.sectionLabel}>Active cameras · {broadcasters.length}</span>

          {broadcasters.length === 0 ? (
            <p className={styles.emptyState}>No cameras broadcasting right now.</p>
          ) : (
            <div className={styles.grid}>
              {broadcasters.map((b) => (
                <button key={b.id} className={styles.card} onClick={() => viewBroadcaster(b.id)}>
                  <span className={styles.cardIcon}>
                    <CameraIcon color="#8C9793" />
                  </span>
                  <span className={styles.cardBody}>
                    <span className={styles.cardName}>{b.name}</span>
                  </span>
                  <span className={styles.liveBadge}>
                    <span className={styles.dot} />
                    <span className={styles.liveBadgeText}>LIVE</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
