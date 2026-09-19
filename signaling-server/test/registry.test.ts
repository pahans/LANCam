import { describe, it, expect } from 'vitest';
import { Registry } from '../src/registry';

describe('Registry', () => {
  it('lists no broadcasters initially', () => {
    const registry = new Registry();
    expect(registry.listBroadcasters()).toEqual([]);
  });

  it('registers a broadcaster and lists it', () => {
    const registry = new Registry();
    registry.addClient('a');
    registry.registerBroadcaster('a', 'Phone');
    expect(registry.listBroadcasters()).toEqual([{ id: 'a', name: 'Phone' }]);
  });

  it('does not list a client that has not registered as a broadcaster', () => {
    const registry = new Registry();
    registry.addClient('a');
    expect(registry.listBroadcasters()).toEqual([]);
  });

  it('stops listing a client after it is removed', () => {
    const registry = new Registry();
    registry.addClient('a');
    registry.registerBroadcaster('a', 'Phone');
    registry.removeClient('a');
    expect(registry.listBroadcasters()).toEqual([]);
  });

  it('throws when registering an unknown client as a broadcaster', () => {
    const registry = new Registry();
    expect(() => registry.registerBroadcaster('missing', 'Phone')).toThrow();
  });

  it('returns undefined for an unknown client', () => {
    const registry = new Registry();
    expect(registry.getClient('missing')).toBeUndefined();
  });
});
