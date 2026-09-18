# LANCam — Local Network Camera Sharing over WebRTC

Date: 2026-09-18
Status: Approved

## Summary

LANCam is a static, GitHub-Pages-deployable Next.js web app that lets any
device on the same local network use its browser camera as a broadcast
source, and any other device on that network view it live over WebRTC.
There is no video relay server: video streams directly peer-to-peer between
devices. A small self-hosted signaling server (run separately, on the LAN)
handles the one-time WebRTC handshake and automatic discovery of active
broadcasters — no room codes, no manual pairing.

## Goals

- Turn a phone's browser into an ad-hoc IP camera, viewable from other
  devices on the same LAN.
- Zero manual pairing: visiting the site shows currently active cameras,
  pick one to view.
- Frontend deployable as static files (GitHub Pages or equivalent) — no
  frontend backend/API routes.
- Works fully offline within the LAN (no internet dependency once devices
  and signaling server are on the same network).

## Non-goals

- Remote/WAN viewing (outside the LAN). No TURN server, no NAT traversal
  beyond LAN-local ICE candidates.
- Recording, storage, or playback of past footage — live viewing only.
- Authentication/access control beyond "reachable on the LAN." Anyone who
  can reach the signaling server can see the broadcaster list and connect.
- Audio/video quality controls, multi-camera switching UI polish — basic
  functional viewing only for v1.

## Architecture

Two independently deployed pieces:

1. **Frontend** — Next.js App Router project, built with
   `output: 'export'` for static hosting (GitHub Pages). All WebRTC logic
   (`getUserMedia`, `RTCPeerConnection`) and the signaling WebSocket client
   run client-side only. Single page, TypeScript.
2. **Signaling server** — standalone Node.js process (`ws` library) that
   the user runs on any machine on their LAN. Not part of the static
   deploy. Responsibilities: track connected clients, maintain the list of
   active broadcasters, relay WebRTC offer/answer/ICE messages between
   specific peer pairs, push broadcaster-list updates to all clients.

No TURN server. STUN is included defensively (for multi-subnet LANs) but
not required for the common single-subnet case.

## Discovery / pairing model

Reachability to the signaling server defines the "network": any device
that can open a WebSocket connection to the signaling server's LAN address
is treated as a peer on the network. There is no separate discovery
protocol (no mDNS) and no room codes.

- On first use, a device enters the signaling server's address
  (`ws://<lan-ip>:<port>`) once, stored in `localStorage`. This is the one
  unavoidable manual step, since a statically hosted frontend cannot know
  a LAN-local address at build time.
- Every connected client registers with the signaling server. The server
  maintains a live list of active broadcasters (id, display name) and
  pushes updates to all clients whenever it changes.
- Any device can become a broadcaster ("Start Camera"): calls
  `getUserMedia()`, registers with the signaling server, appears in every
  connected client's list immediately.
- Any device can view a broadcaster by selecting it from the list — no
  code entry, no manual signaling exchange visible to the user.

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
  disconnected state; UI stays usable (can still edit the server address);
  automatic reconnect with backoff.
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
- Access control (e.g., a shared passphrase) if the LAN isn't trusted.
- Persisting/renaming broadcaster device names across sessions.
