import { describe, it, expect } from 'vitest';
import { Registry } from '../src/registry';
import { routeMessage, routeDisconnect } from '../src/router';

describe('routeMessage', () => {
  it('broadcasts an updated list on register-broadcaster', () => {
    const registry = new Registry();
    registry.addClient('a');
    const results = routeMessage(registry, 'a', { type: 'register-broadcaster', name: 'Phone' });
    expect(results).toEqual([
      { targetId: 'broadcast', message: { type: 'broadcaster-list', broadcasters: [{ id: 'a', name: 'Phone' }] } },
    ]);
  });

  it('relays request-connection to the target with the sender attached', () => {
    const registry = new Registry();
    registry.addClient('a');
    registry.addClient('b');
    const results = routeMessage(registry, 'b', { type: 'request-connection', targetId: 'a' });
    expect(results).toEqual([{ targetId: 'a', message: { type: 'request-connection', from: 'b' } }]);
  });

  it('drops messages targeting an unknown client', () => {
    const registry = new Registry();
    registry.addClient('b');
    const results = routeMessage(registry, 'b', { type: 'request-connection', targetId: 'ghost' });
    expect(results).toEqual([]);
  });

  it('relays offer and answer with sender id and role attached', () => {
    const registry = new Registry();
    registry.addClient('a');
    registry.addClient('b');
    const sdp = { type: 'offer' as const, sdp: 'v=0...' };
    expect(routeMessage(registry, 'a', { type: 'offer', targetId: 'b', sdp, role: 'broadcaster' })).toEqual([
      { targetId: 'b', message: { type: 'offer', from: 'a', sdp, role: 'broadcaster' } },
    ]);
    expect(routeMessage(registry, 'b', { type: 'answer', targetId: 'a', sdp, role: 'viewer' })).toEqual([
      { targetId: 'a', message: { type: 'answer', from: 'b', sdp, role: 'viewer' } },
    ]);
  });

  it('relays ice-candidate with sender id and role attached', () => {
    const registry = new Registry();
    registry.addClient('a');
    registry.addClient('b');
    const candidate = { candidate: 'candidate:1 ...' };
    expect(
      routeMessage(registry, 'b', { type: 'ice-candidate', targetId: 'a', candidate, role: 'viewer' })
    ).toEqual([{ targetId: 'a', message: { type: 'ice-candidate', from: 'b', candidate, role: 'viewer' } }]);
  });
});

describe('routeDisconnect', () => {
  it('announces peer-disconnected', () => {
    const registry = new Registry();
    registry.addClient('a');
    const results = routeDisconnect(registry, 'a');
    expect(results).toContainEqual({ targetId: 'broadcast', message: { type: 'peer-disconnected', id: 'a' } });
  });

  it('also broadcasts an updated broadcaster list when the disconnecting client was a broadcaster', () => {
    const registry = new Registry();
    registry.addClient('a');
    registry.registerBroadcaster('a', 'Phone');
    const results = routeDisconnect(registry, 'a');
    expect(results).toContainEqual({ targetId: 'broadcast', message: { type: 'broadcaster-list', broadcasters: [] } });
  });

  it('does not broadcast a list update when the disconnecting client was only a viewer', () => {
    const registry = new Registry();
    registry.addClient('a');
    const results = routeDisconnect(registry, 'a');
    expect(results).toHaveLength(1);
  });

  it('removes the client from the registry', () => {
    const registry = new Registry();
    registry.addClient('a');
    routeDisconnect(registry, 'a');
    expect(registry.getClient('a')).toBeUndefined();
  });
});
