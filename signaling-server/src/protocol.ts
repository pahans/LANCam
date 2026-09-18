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

export type PeerRole = 'broadcaster' | 'viewer';

export type ClientMessage =
  | { type: 'register-broadcaster'; name: string }
  | { type: 'request-connection'; targetId: string }
  | { type: 'offer'; targetId: string; sdp: SdpInit; role: PeerRole }
  | { type: 'answer'; targetId: string; sdp: SdpInit; role: PeerRole }
  | { type: 'ice-candidate'; targetId: string; candidate: IceCandidateInit; role: PeerRole };

export type ServerMessage =
  | { type: 'welcome'; id: string }
  | { type: 'broadcaster-list'; broadcasters: { id: string; name: string }[] }
  | { type: 'request-connection'; from: string }
  | { type: 'offer'; from: string; sdp: SdpInit; role: PeerRole }
  | { type: 'answer'; from: string; sdp: SdpInit; role: PeerRole }
  | { type: 'ice-candidate'; from: string; candidate: IceCandidateInit; role: PeerRole }
  | { type: 'peer-disconnected'; id: string };

const MAX_NAME_LENGTH = 64;

export class InvalidMessageError extends Error {}

function isPeerRole(value: unknown): value is PeerRole {
  return value === 'broadcaster' || value === 'viewer';
}

export function parseClientMessage(raw: unknown): ClientMessage {
  if (typeof raw !== 'object' || raw === null) {
    throw new InvalidMessageError('message must be an object');
  }
  const msg = raw as Record<string, unknown>;

  switch (msg.type) {
    case 'register-broadcaster': {
      if (typeof msg.name !== 'string' || msg.name.trim() === '') {
        throw new InvalidMessageError('register-broadcaster requires a non-empty name');
      }
      if (msg.name.length > MAX_NAME_LENGTH) {
        throw new InvalidMessageError(`register-broadcaster name must be at most ${MAX_NAME_LENGTH} characters`);
      }
      return { type: 'register-broadcaster', name: msg.name };
    }
    case 'request-connection': {
      if (typeof msg.targetId !== 'string') {
        throw new InvalidMessageError('request-connection requires targetId');
      }
      return { type: 'request-connection', targetId: msg.targetId };
    }
    case 'offer':
    case 'answer': {
      if (typeof msg.targetId !== 'string' || typeof msg.sdp !== 'object' || msg.sdp === null) {
        throw new InvalidMessageError(`${msg.type} requires targetId and sdp`);
      }
      if (!isPeerRole(msg.role)) {
        throw new InvalidMessageError(`${msg.type} requires a valid role`);
      }
      return { type: msg.type, targetId: msg.targetId, sdp: msg.sdp as SdpInit, role: msg.role };
    }
    case 'ice-candidate': {
      if (typeof msg.targetId !== 'string' || typeof msg.candidate !== 'object' || msg.candidate === null) {
        throw new InvalidMessageError('ice-candidate requires targetId and candidate');
      }
      if (!isPeerRole(msg.role)) {
        throw new InvalidMessageError('ice-candidate requires a valid role');
      }
      return { type: 'ice-candidate', targetId: msg.targetId, candidate: msg.candidate as IceCandidateInit, role: msg.role };
    }
    default:
      throw new InvalidMessageError(`unknown message type: ${String(msg.type)}`);
  }
}
