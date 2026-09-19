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

  it('rejects register-broadcaster with a name longer than 64 characters', () => {
    expect(() =>
      parseClientMessage({ type: 'register-broadcaster', name: 'a'.repeat(65) })
    ).toThrow(InvalidMessageError);
  });

  it('accepts register-broadcaster with a name exactly 64 characters', () => {
    const name = 'a'.repeat(64);
    expect(parseClientMessage({ type: 'register-broadcaster', name })).toEqual({
      type: 'register-broadcaster',
      name,
    });
  });

  it('parses a request-connection message', () => {
    expect(parseClientMessage({ type: 'request-connection', targetId: 'abc' })).toEqual({
      type: 'request-connection',
      targetId: 'abc',
    });
  });

  it('parses an offer message', () => {
    const sdp = { type: 'offer', sdp: 'v=0...' };
    expect(parseClientMessage({ type: 'offer', targetId: 'abc', sdp, role: 'broadcaster' })).toEqual({
      type: 'offer',
      targetId: 'abc',
      sdp,
      role: 'broadcaster',
    });
  });

  it('rejects an offer message without a valid role', () => {
    const sdp = { type: 'offer', sdp: 'v=0...' };
    expect(() => parseClientMessage({ type: 'offer', targetId: 'abc', sdp })).toThrow(InvalidMessageError);
    expect(() => parseClientMessage({ type: 'offer', targetId: 'abc', sdp, role: 'bogus' })).toThrow(
      InvalidMessageError
    );
  });

  it('parses an ice-candidate message', () => {
    const candidate = { candidate: 'candidate:1 ...' };
    expect(parseClientMessage({ type: 'ice-candidate', targetId: 'abc', candidate, role: 'viewer' })).toEqual({
      type: 'ice-candidate',
      targetId: 'abc',
      candidate,
      role: 'viewer',
    });
  });

  it('rejects an ice-candidate message without a valid role', () => {
    const candidate = { candidate: 'candidate:1 ...' };
    expect(() => parseClientMessage({ type: 'ice-candidate', targetId: 'abc', candidate })).toThrow(
      InvalidMessageError
    );
  });

  it('rejects an unknown message type', () => {
    expect(() => parseClientMessage({ type: 'not-a-real-type' })).toThrow(InvalidMessageError);
  });

  it('rejects a non-object payload', () => {
    expect(() => parseClientMessage('nope')).toThrow(InvalidMessageError);
    expect(() => parseClientMessage(null)).toThrow(InvalidMessageError);
  });
});
