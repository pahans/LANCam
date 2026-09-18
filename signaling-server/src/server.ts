import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Registry } from './registry';
import { routeMessage, routeDisconnect, type RouteResult } from './router';
import { parseClientMessage, InvalidMessageError, type ServerMessage } from './protocol';

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

const wss = new WebSocketServer({ server: httpServer });
const registry = new Registry();
const sockets = new Map<string, WebSocket>();

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

  socket.on('close', () => {
    sockets.delete(id);
    dispatch(routeDisconnect(registry, id));
  });
});

httpServer.listen(PORT, () => {
  console.log(`signaling server listening on :${PORT}`);
});
