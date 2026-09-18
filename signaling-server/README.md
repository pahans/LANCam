# LANCam Signaling Server

A small, persistent Node/WebSocket process. It never touches video — it
only registers connected clients, tracks active broadcasters, and relays
WebRTC offer/answer/ICE messages between paired clients.

## Local development

    npm install
    npm run dev

Serves on `PORT` (default 8080), with a `GET /health` endpoint.

## Deployment

Deploy to a platform that runs a real persistent process — **not** Vercel,
whose serverless functions recycle instances and don't hold the in-memory
client registry reliably. Render, Fly.io, and Railway all work with their
free tiers:

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Port:** the platform sets `PORT`; the server reads it automatically.

After deploying, note the server's public `wss://` URL — the frontend
(`web/`) needs it as `NEXT_PUBLIC_SIGNALING_URL` at build time.
