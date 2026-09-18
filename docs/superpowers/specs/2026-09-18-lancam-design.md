# LANCam — Local Network Camera Sharing over WebRTC

Date: 2026-09-18
Status: Approved

## Summary

LANCam is a static Next.js web app, deployed to a single public URL (e.g.
Vercel or GitHub Pages), that lets any device use its browser camera as a
broadcast source and any other device view it live over WebRTC — as long
as the two devices are actually on the same local network. There is no
video relay server: video streams directly peer-to-peer between devices.
A small, separately hosted signaling server handles the one-time WebRTC
handshake and automatic discovery of active broadcasters — no room codes,
no manual pairing, no address to configure.

## Goals

- Turn a phone's browser into an ad-hoc IP camera, viewable from other
  devices on the same LAN.
- Zero manual pairing or setup: both devices visit the same public URL;
  the site shows currently active cameras, pick one to view.
- Frontend deployable as static files (Vercel/GitHub Pages) — no frontend
  backend/API routes.
- Video itself never leaves the LAN — only the brief signaling handshake
  (a few small messages, no media) touches the public internet.

## Non-goals

- Guaranteed remote/WAN viewing. No TURN server, so if two devices aren't
  actually mutually reachable on a LAN, the connection fails by design
  (signaling still succeeds since it's public, but ICE/media negotiation
  won't).
- Recording, storage, or playback of past footage — live viewing only.
- Authentication/access control beyond "knows the site URL." Anyone who
  loads the page can see the broadcaster list and connect.
- Audio/video quality controls, multi-camera switching UI polish — basic
  functional viewing only for v1.

## Architecture

Two independently deployed pieces:

1. **Frontend** — Next.js App Router project, built with
   `output: 'export'` for static hosting (Vercel/GitHub Pages). All WebRTC
   logic (`getUserMedia`, `RTCPeerConnection`) and the signaling WebSocket
   client run client-side only. Single page, TypeScript. The signaling
   server's public URL is baked into the build (env var) — nothing for the
   user to configure.
2. **Signaling server** — standalone Node.js process (`ws` library),
   deployed to a platform that runs a real persistent process (Render,
   Fly.io, or Railway free tier — not Vercel, whose serverless functions
   don't hold persistent WebSocket state well). Publicly reachable, not
   LAN-local. Responsibilities: track connected clients, maintain the list
   of active broadcasters, relay WebRTC offer/answer/ICE messages between
   specific peer pairs, push broadcaster-list updates to all clients.

No TURN server. STUN is included so ICE can gather server-reflexive
candidates, but a successful connection still requires the two devices to
have a mutually reachable path (i.e., be on the same LAN).

## Discovery / pairing model

Both devices load the same public URL. The signaling server assigns each
connected client an id and treats every currently connected client as a
discoverable peer — there is no room code, no LAN-address entry, no mDNS.

- Every connected client registers with the signaling server. The server
  maintains a live list of active broadcasters (id, display name) and
  pushes updates to all clients whenever it changes.
- Any device can become a broadcaster ("Start Camera"): calls
  `getUserMedia()`, registers with the signaling server, appears in every
  connected client's list immediately.
- Any device can view a broadcaster by selecting it from the list — no
  code entry, no manual signaling exchange visible to the user.
- Because the signaling server is public, the broadcaster list is visible
  to anyone who loads the page, regardless of network — but a viewer not
  on the broadcaster's LAN will simply fail to connect at the ICE stage
  (see Non-goals).

## Data flow

1. Broadcaster: `getUserMedia()` succeeds → sends `register-broadcaster`
   message (with a device name) to signaling server → server adds it to
   the broadcaster registry and pushes `broadcaster-list` to all clients.
2. Viewer: receives `broadcaster-list`, renders it, user selects one →
   viewer sends `request-connection` to signaling server, targeted at that
   broadcaster's id.
3. Signaling server relays: `offer` (broadcaster → viewer),
   `answer` (viewer → broadcaster), and `ice-candidate` messages
   (both directions), each tagged with a `peerId` so the server can route
   them to the right socket.
4. Once ICE negotiation completes, video flows directly P2P over the LAN.
   The signaling server is no longer in the media path for that pair.
5. Broadcaster supports multiple simultaneous viewers: one
   `RTCPeerConnection` per viewer (star topology centered on the
   broadcaster), each with its own signaling exchange.

## Error handling

- Signaling server unreachable or connection drops: status indicator shows
  disconnected state; automatic reconnect with backoff.
- Broadcaster tab closes / socket disconnects: server removes it from the
  registry and pushes the updated list; viewers show "camera offline" and
  tear down their `RTCPeerConnection`.
- `getUserMedia` denied or no camera available: inline error message on
  the broadcaster's own page; does not affect other clients.
- ICE negotiation failure (e.g., devices not actually mutually reachable):
  viewer shows "connection failed," with an option to retry.

## Testing

- Primary verification is manual, on-LAN, with two real devices (one
  broadcasting, one viewing) — the P2P media path is not meaningfully
  unit-testable.
- Unit tests for the signaling server's pure message-routing/list-update
  logic (given inputs → expected outbound messages), run without real
  sockets.

## Open questions / future work (explicitly out of scope for v1)

- Optional WAN access via TURN, if ever needed later.
- Access control (e.g., a shared passphrase), since the broadcaster list
  is currently visible to anyone who loads the public URL.
- Persisting/renaming broadcaster device names across sessions.
