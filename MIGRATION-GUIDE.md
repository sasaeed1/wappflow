# 💻 New-laptop migration guide

Everything you need to rebuild your WappFlow setup + Claude Code history on a new machine.
Written 2026-06-27.

---

## 1. Repos (all on GitHub — `sasaeed1`)

| Repo | What | Clone |
|---|---|---|
| **wappflow** | The product — backend (Express + better-sqlite3), web (Next.js), desktop (Electron), iOS. Everything we built this session is here. | `git clone https://github.com/sasaeed1/wappflow.git` |
| **flux-content-engine** | Flux (sibling AI content engine) | `git clone https://github.com/sasaeed1/flux-content-engine.git` |
| **helix** | HELIX — the autonomous-AI outbound / marketing-agency engine (24 design docs). **Backed up 2026-06-27.** | `git clone https://github.com/sasaeed1/helix.git` |

Put them under the **same path** as now — `C:\Users\DELL\Desktop\Sami\` — if you want the Claude history to resume cleanly (see §4).

> Still on disk and **NOT yet in git** (back these up manually to USB/cloud if you want them):
> `sikandar-khan-jadoon/` (a site), the loose files in `Desktop\Sami\` (`roadmap - flux.txt`, `Studio.txt`, `flux-*.mp4/.png`, `skj-site-deploy.zip`). Tell me if you want these on GitHub too.

---

## 2. Secrets / env files to recreate (NOT in git — by design)

The repos don't contain secrets. On the new machine recreate these from your saved values
(the values are in the **server's** copy and in your Claude chat history zip):

**`wappflow/backend/.env`** — copy from the live server (`scp root@<hetzner>:/root/wappflow/backend/.env .`) or rebuild from `backend/.env.example`. Keys it needs:
- `JWT_SECRET`, `FLUX_SSO_SECRET`
- `STORAGE_PROVIDER=r2` + `R2_ACCOUNT_ID`, `R2_BUCKET` (`wappflow-production`), `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `LIVEKIT_URL` (livekit.wappflow.remoteops.co), `LIVEKIT_API_KEY` (`APIwwgzvmosGNCc`), `LIVEKIT_API_SECRET`
- SMTP/IMAP (per-workspace, stored in DB — not env), Google OAuth client id (web `.env`), `TRUST_PROXY=1`
- AI provider key(s) for the text engine (Groq/Gemini)

**`wappflow/wappflow-desktop`** — `npm install`; on first run it recreates `%APPDATA%\wappflow-desktop\` (config.json, session.json, device.json, offline.json). Drop the ONNX models back in `src/main/ai/models/` (`npm run fetch-models`) and install `ffmpeg` for video.

**The SQLite DB** (`backend/*.db`) lives on the **server**, not locally — production data is safe on Hetzner. For local dev a fresh DB is created on boot.

---

## 3. Server (Hetzner) — nothing to migrate

Production runs on the Hetzner box (`/root/wappflow`, pm2 apps `wappflow-api` + `wappflow-web`, LiveKit at `/opt/livekit`). It's independent of your laptop. Just keep your SSH key / access. Deploy = `cd /root/wappflow && git pull && cd wappflow-web && npm install && npm run build && pm2 restart wappflow-api wappflow-web`.

---

## 4. Claude Code history — resume THIS chat on the new machine

Your full history (transcripts + the 16 memory files) is zipped at
**`Desktop\Sami\claude-history-fe79aded.zip`** — copy it to the new laptop (USB / private cloud; it contains chat contents incl. secrets, so don't make it public).

On the new machine:
1. Install Claude Code.
2. Clone the repos to **`C:\Users\DELL\Desktop\Sami`** (same user `DELL`, same path — this is what the history folder name is derived from).
3. Unzip so the folder lands at: `C:\Users\DELL\.claude\projects\C--Users-DELL-Desktop-Sami\` (transcripts `*.jsonl` + `memory/`).
4. From `Desktop\Sami`, run **`claude --resume`** and pick session **`fe79aded-678f-47f6-adcb-fcf2c3256f08`** (or `claude --resume fe79aded-678f-47f6-adcb-fcf2c3256f08`).

> ⚠️ **Path-hash dependency:** the folder name `C--Users-DELL-Desktop-Sami` is the project path with `\`/`:` → `-`. If the new machine uses a different username or path, the hash differs. Fix: run `claude` once in the new project path (it creates the correctly-named folder under `~/.claude/projects/`), then copy the `*.jsonl` + `memory/` from the zip **into that new folder**.
> Also copy `~/.claude/settings.json` and `Desktop\Sami\.claude\` (launch.json, settings.local.json) if you want identical config. Do **not** copy `~/.claude/.credentials.json` — log in fresh.
