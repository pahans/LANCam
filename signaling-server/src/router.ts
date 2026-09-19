import type { Registry } from './registry.js';
import type { ClientMessage, ServerMessage } from './protocol.js';

export interface RouteResult {
  targetId: string | 'broadcast';
  message: ServerMessage;
}

export function routeMessage(registry: Registry, senderId: string, message: ClientMessage): RouteResult[] {
  switch (message.type) {
    case 'register-broadcaster': {
      registry.registerBroadcaster(senderId, message.name);
      return [
        { targetId: 'broadcast', message: { type: 'broadcaster-list', broadcasters: registry.listBroadcasters() } },
      ];
    }
    case 'request-connection': {
      if (!registry.getClient(message.targetId)) return [];
      return [{ targetId: message.targetId, message: { type: 'request-connection', from: senderId } }];
    }
    case 'offer': {
      if (!registry.getClient(message.targetId)) return [];
      return [
        { targetId: message.targetId, message: { type: 'offer', from: senderId, sdp: message.sdp, role: message.role } },
      ];
    }
    case 'answer': {
      if (!registry.getClient(message.targetId)) return [];
      return [
        { targetId: message.targetId, message: { type: 'answer', from: senderId, sdp: message.sdp, role: message.role } },
      ];
    }
    case 'ice-candidate': {
      if (!registry.getClient(message.targetId)) return [];
      return [
        {
          targetId: message.targetId,
          message: { type: 'ice-candidate', from: senderId, candidate: message.candidate, role: message.role },
        },
      ];
    }
  }
}

export function routeDisconnect(registry: Registry, clientId: string): RouteResult[] {
  const client = registry.getClient(clientId);
  const wasBroadcaster = client?.role === 'broadcaster';
  registry.removeClient(clientId);

  const results: RouteResult[] = [{ targetId: 'broadcast', message: { type: 'peer-disconnected', id: clientId } }];
  if (wasBroadcaster) {
    results.push({
      targetId: 'broadcast',
      message: { type: 'broadcaster-list', broadcasters: registry.listBroadcasters() },
    });
  }
  return results;
}
