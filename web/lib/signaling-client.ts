export interface SdpInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

export interface IceCandidateInit {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type ClientMessage =
  | { type: 'register-broadcaster'; name: string }
  | { type: 'request-connection'; targetId: string }
  | { type: 'offer'; targetId: string; sdp: SdpInit }
  | { type: 'answer'; targetId: string; sdp: SdpInit }
  | { type: 'ice-candidate'; targetId: string; candidate: IceCandidateInit };

export type ServerMessage =
  | { type: 'welcome'; id: string }
  | { type: 'broadcaster-list'; broadcasters: { id: string; name: string }[] }
  | { type: 'request-connection'; from: string }
  | { type: 'offer'; from: string; sdp: SdpInit }
  | { type: 'answer'; from: string; sdp: SdpInit }
  | { type: 'ice-candidate'; from: string; candidate: IceCandidateInit }
  | { type: 'peer-disconnected'; id: string };

type Handler<T> = (message: T) => void;

export interface SignalingClient {
  send(message: ClientMessage): void;
  on<T extends ServerMessage['type']>(
    type: T,
    handler: Handler<Extract<ServerMessage, { type: T }>>
  ): () => void;
  close(): void;
}

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

const OPEN = 1;

export function createSignalingClient(
  url: string,
  options: { wsFactory?: WebSocketFactory; reconnectDelayMs?: number } = {}
): SignalingClient {
  const wsFactory = options.wsFactory ?? ((u: string) => new WebSocket(u) as unknown as WebSocketLike);
  const baseDelay = options.reconnectDelayMs ?? 1000;
  const listeners = new Map<string, Set<Handler<ServerMessage>>>();

  let ws: WebSocketLike | null = null;
  let closedByCaller = false;
  let attempt = 0;

  function emit(message: ServerMessage): void {
    const handlers = listeners.get(message.type);
    handlers?.forEach((handler) => handler(message));
  }

  function connect(): void {
    const socket = wsFactory(url);
    ws = socket;
    socket.onopen = () => {
      attempt = 0;
    };
    socket.onmessage = (event) => {
      emit(JSON.parse(event.data) as ServerMessage);
    };
    socket.onclose = () => {
      if (closedByCaller) return;
      attempt += 1;
      setTimeout(connect, baseDelay * Math.min(attempt, 5));
    };
    socket.onerror = () => {
      socket.close();
    };
  }

  connect();

  return {
    send(message) {
      if (ws && ws.readyState === OPEN) {
        ws.send(JSON.stringify(message));
      }
    },
    on(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler as Handler<ServerMessage>);
      return () => {
        listeners.get(type)?.delete(handler as Handler<ServerMessage>);
      };
    },
    close() {
      closedByCaller = true;
      ws?.close();
    },
  };
}
