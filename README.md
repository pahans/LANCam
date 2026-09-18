# LANCam

Turn any browser into an ad-hoc local-network IP camera, viewable live from
any other device on the same LAN, over WebRTC — no video relay server, no
manual pairing.

## How it works

Both the broadcasting device and the viewing device load the same public
site. A small signaling server (see `signaling-server/`) matches them up
automatically: it maintains a live list of active broadcasters and relays
the brief WebRTC handshake (offer/answer/ICE candidates) between paired
devices. Once that handshake completes, video streams directly
peer-to-peer between the two devices — the signaling server never sees the
video itself, and if the two devices aren't actually on the same LAN, the
connection simply fails at that stage (there is no TURN server / no WAN
fallback by design — see `docs/superpowers/specs/2026-09-18-lancam-design.md`).

## Packages

- `web/` — the Next.js frontend, deployed as a static export (Vercel,
  GitHub Pages, or any static host).
- `signaling-server/` — the small persistent Node/WebSocket process. See
  `signaling-server/README.md` for deployment instructions.

## Local development

    cd signaling-server && npm install && npm run dev
    # in another terminal
    cd web && npm install
    echo "NEXT_PUBLIC_SIGNALING_URL=ws://localhost:8080" > .env.local
    npm run dev

Then open `http://localhost:3000` on two devices on the same network (use
your machine's LAN IP instead of `localhost` on the second device).

## Deploying

1. Deploy `signaling-server/` to Render, Fly.io, or Railway (see its
   README) and note its public `wss://` URL.
2. Set `NEXT_PUBLIC_SIGNALING_URL` to that URL when building `web/`, then
   deploy the static export to Vercel or GitHub Pages.
