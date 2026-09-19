import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Registry } from './registry.js';
import { routeMessage, routeDisconnect, type RouteResult } from './router.js';
import { parseClientMessage, InvalidMessageError, type ServerMessage } from './protocol.js';

const PORT = Number(process.env.PORT) || 8080;

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: 64 * 1024 });
const registry = new Registry();
const sockets = new Map<string, WebSocket>();
const aliveState = new WeakMap<WebSocket, boolean>();

const HEARTBEAT_INTERVAL_MS = 30000;

function send(id: string, message: ServerMessage): void {
  const socket = sockets.get(id);
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function dispatch(results: RouteResult[]): void {
  for (const result of results) {
    if (result.targetId === 'broadcast') {
      for (const id of sockets.keys()) send(id, result.message);
    } else {
      send(result.targetId, result.message);
    }
  }
}

wss.on('connection', (socket) => {
  const id = randomUUID();
  sockets.set(id, socket);
  aliveState.set(socket, true);
  registry.addClient(id);
  send(id, { type: 'welcome', id });
  send(id, { type: 'broadcaster-list', broadcasters: registry.listBroadcasters() });

  socket.on('message', (data) => {
    let parsed: ReturnType<typeof parseClientMessage>;
    try {
      parsed = parseClientMessage(JSON.parse(data.toString()));
    } catch (error) {
      if (error instanceof InvalidMessageError || error instanceof SyntaxError) {
        console.warn(`ignoring invalid message from ${id}:`, error.message);
        return;
      }
      throw error;
    }
    dispatch(routeMessage(registry, id, parsed));
  });

  socket.on('pong', () => {
    aliveState.set(socket, true);
  });

  socket.on('error', (err) => {
    console.warn(`socket error for client ${id}:`, err);
  });

  socket.on('close', () => {
    sockets.delete(id);
    dispatch(routeDisconnect(registry, id));
  });
});

wss.on('error', (err) => {
  console.warn('websocket server error:', err);
});

httpServer.on('error', (err) => {
  console.warn('http server error:', err);
});

const heartbeatInterval = setInterval(() => {
  for (const socket of sockets.values()) {
    if (aliveState.get(socket) === false) {
      socket.terminate();
      continue;
    }
    aliveState.set(socket, false);
    socket.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

function shutdown(): void {
  clearInterval(heartbeatInterval);
  wss.close();
  httpServer.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);

httpServer.listen(PORT, () => {
  console.log(`signaling server listening on :${PORT}`);
});
