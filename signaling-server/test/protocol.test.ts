import { describe, it, expect } from 'vitest';
import { parseClientMessage, InvalidMessageError } from '../src/protocol';

describe('parseClientMessage', () => {
  it('parses a register-broadcaster message', () => {
    expect(parseClientMessage({ type: 'register-broadcaster', name: 'Phone' })).toEqual({
      type: 'register-broadcaster',
      name: 'Phone',
    });
  });

  it('rejects register-broadcaster without a name', () => {
    expect(() => parseClientMessage({ type: 'register-broadcaster' })).toThrow(InvalidMessageError);
  });

  it('rejects register-broadcaster with an empty name', () => {
    expect(() => parseClientMessage({ type: 'register-broadcaster', name: '  ' })).toThrow(InvalidMessageError);
  });

  it('parses a request-connection message', () => {
    expect(parseClientMessage({ type: 'request-connection', targetId: 'abc' })).toEqual({
      type: 'request-connection',
      targetId: 'abc',
    });
  });

  it('parses an offer message', () => {
    const sdp = { type: 'offer', sdp: 'v=0...' };
    expect(parseClientMessage({ type: 'offer', targetId: 'abc', sdp })).toEqual({
      type: 'offer',
      targetId: 'abc',
      sdp,
    });
  });

  it('parses an ice-candidate message', () => {
    const candidate = { candidate: 'candidate:1 ...' };
    expect(parseClientMessage({ type: 'ice-candidate', targetId: 'abc', candidate })).toEqual({
      type: 'ice-candidate',
      targetId: 'abc',
      candidate,
    });
  });

  it('rejects an unknown message type', () => {
    expect(() => parseClientMessage({ type: 'not-a-real-type' })).toThrow(InvalidMessageError);
  });

  it('rejects a non-object payload', () => {
    expect(() => parseClientMessage('nope')).toThrow(InvalidMessageError);
    expect(() => parseClientMessage(null)).toThrow(InvalidMessageError);
  });
});
