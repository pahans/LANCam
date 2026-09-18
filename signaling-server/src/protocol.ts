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

export class InvalidMessageError extends Error {}

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
      return { type: msg.type, targetId: msg.targetId, sdp: msg.sdp as SdpInit };
    }
    case 'ice-candidate': {
      if (typeof msg.targetId !== 'string' || typeof msg.candidate !== 'object' || msg.candidate === null) {
        throw new InvalidMessageError('ice-candidate requires targetId and candidate');
      }
      return { type: 'ice-candidate', targetId: msg.targetId, candidate: msg.candidate as IceCandidateInit };
    }
    default:
      throw new InvalidMessageError(`unknown message type: ${String(msg.type)}`);
  }
}
