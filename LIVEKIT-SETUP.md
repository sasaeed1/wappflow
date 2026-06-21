# LiveKit Setup — Communications 2.0 (Phase 4)

WappFlow's real-time voice/video/screenshare runs on **self-hosted LiveKit** (replacing
the old public-Jitsi huddle). The app's token-minting + real-time text are already built
and verified (`backend/comms.js`); this runbook is the **infra you deploy** on the existing
Hetzner box, plus the env + frontend deps that activate it.

> Until LiveKit is deployed + env is set, the backend returns `503 { configured:false }`
> from `/api/comms/livekit/token` and `GET /api/comms/livekit/config` reports `configured:false`
> — so the client simply hides the call buttons. Nothing breaks; text comms work regardless.

---

## 1. Deploy LiveKit on the Hetzner server (single-server, alongside web + api)

```bash
# As root on the Hetzner box. Generate API key/secret first:
docker run --rm livekit/generate            # prints an api key + secret, OR:
#   API key/secret = any matching pair you choose (keep them secret)

# /opt/livekit/livekit.yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50200
  use_external_ip: true
keys:
  <LIVEKIT_API_KEY>: <LIVEKIT_API_SECRET>

# Run it (host networking so WebRTC media ports work):
docker run -d --restart unless-stopped --name livekit --network host \
  -v /opt/livekit/livekit.yaml:/livekit.yaml \
  livekit/livekit-server --config /livekit.yaml
```

Open firewall: TCP **7880** (signaling/WS), TCP **7881** (RTC/TCP), UDP **50000–50200** (RTC media).

## 2. Reverse-proxy TLS (LiveKit needs wss:// from browsers)

Add to the existing nginx/Caddy serving `wappflow.remoteops.co`:

```nginx
# livekit.wappflow.remoteops.co  → ws/wss to 127.0.0.1:7880
location / {
  proxy_pass http://127.0.0.1:7880;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

## 3. Backend env (the API host)

```bash
LIVEKIT_URL=wss://livekit.wappflow.remoteops.co
LIVEKIT_API_KEY=<the key from step 1>
LIVEKIT_API_SECRET=<the secret from step 1>
```

That's all the backend needs — `backend/comms.js` mints tokens with these (no SDK dependency;
it hand-rolls the LiveKit JWT grant, verified in `backend/test-comms.js`).

## 4. Frontend dependency (wappflow-web)

```bash
cd wappflow-web && npm i livekit-client
```

The LiveKit room component (replacing `HuddleModal`/Jitsi) and the chat SSE switch are the
remaining **frontend** work — see the remaining-work table in `DESKTOP-FINAL-VISION.md`.
NOTE: `wappflow-web/AGENTS.md` flags this as a non-standard Next.js build and says to read
`node_modules/next/dist/docs/` first — that guide is currently **absent**, so the frontend
pass should be done with the docs restored + browser verification + LiveKit live.

## 5. Verify end-to-end (after deploy)

1. `GET /api/comms/livekit/config` (authed) → `{ configured: true, url: "wss://…" }`
2. `POST /api/comms/livekit/token { room: "huddle" }` → `{ token, url, room: "ws_<wsid>_huddle" }`
3. Open two browsers in the same workspace, join the same room → audio/video/screenshare connect.

---

## What's already built + verified (server side)

- `POST /api/comms/livekit/token` — per-workspace-namespaced room, 6h token, full publish/subscribe grant.
- `GET /api/comms/livekit/config` — capability probe (show/hide call buttons).
- Real-time text over the existing SSE: `chat_message`, `chat_mention`, `chat_edit`, `chat_delete`,
  `chat_reaction`, `chat_pin`/`chat_unpin`, `chat_typing` (consume via `es.onmessage` + `switch(data.type)`).
- DMs, threads, mentions inbox, pins, unread + read-state, search, edit, presence — all under `/api/comms/*`.
