# WappFlow Desktop

**The native operating system for running a creative business.**
CRM · Media Studio · Contracts · Booking · Client Delivery · AI — one application, one login, one workspace, one window.

WappFlow Desktop is **not** a Lightroom/Pixieset/Photo-Mechanic clone. It is the desktop shell for the entire WappFlow ecosystem, and — most importantly — the **local AI worker** that makes Media Intelligence desktop-first.

---

## Architecture (locked)

```
┌──────────────────────────── WappFlow Desktop (Electron) ────────────────────────────┐
│                                                                                      │
│  RENDERER                                                                            │
│   ├─ Cloud modules (CLOUD-FIRST) ── load the existing wappflow-web UI in a webview:  │
│   │     CRM · Contracts Studio · Booking · Client Portal · Studio web views          │
│   └─ Local AI view (DESKTOP-FIRST) ── native panel: pick a project → analyze locally │
│                                                                                      │
│  MAIN PROCESS (Node)                                                                 │
│   ├─ Window / menu / auto-update / deep-link auth                                    │
│   ├─ Secure IPC (contextBridge)                                                      │
│   └─ LOCAL AI ENGINE  ◀── the moat                                                   │
│        analyzers (CPU now · ONNX vision later) → scores + reasons                    │
│        → POST to the server's Track-0 ingestion endpoints                            │
└──────────────────────────────────────────────────────────────────────────────────┘
                │ HTTPS (auth: workspace JWT)                    ▲ scores
                ▼                                                │
        wappflow backend  ──  stores ms_asset_analysis / ms_asset_scores / workspace_brain
        (business logic only ever READS scores — it never knows who computed them)
```

**The most important decision:** CRM, Contracts, Booking, and Client Portal stay **cloud-first** (the desktop wraps their web UI — one login, one window). **Media Intelligence becomes desktop-first** — heavy analysis runs locally on the user's machine and uploads results to the same store. Invariants (inherited from the server): **advisory-only · analyze-once · human-owned decisions · non-destructive.**

The desktop becomes the **primary producer** of `ms_asset_analysis`, `ms_asset_scores`, and `workspace_brain` feedback via the existing endpoints:
- `POST /api/media/assets/:id/scores`
- `POST /api/media/projects/:id/scores`

No business logic changes. Desktop performs inference; server stores results.

---

## Local AI Engine

Runs in the Electron **main process** (full Node + native modules). Pipeline:

1. **Auth** — pair to a workspace (login → workspace-scoped JWT, stored in the OS keychain seam).
2. **Pull** — list a project's assets + download originals/variants for local analysis.
3. **Analyze locally** — the swappable **Analyzer** interface (ported from `backend/analyzers`):
   - **CPU analyzers (work today):** sharpness, exposure, blur, composition heuristics, duplicate detection, technical/EXIF.
   - **ONNX vision analyzers (pluggable seam):** face / eye / smile / scene / emotion / aesthetic / hero-shot / portfolio-candidate / album-candidate scoring — via `onnxruntime-node` (GPU when available, CPU fallback).
4. **Score** — produce per-asset scores + reasons + composites, respecting the **analyze-once** ledger.
5. **Upload** — POST to the Track-0 ingestion endpoints. Server stores; Studio Brain + culling consume.

Models are **not bundled in this repo** (real ONNX model files have size/licence considerations). They drop into `src/main/ai/models/` and register in the analyzer registry — the runtime + pipeline + upload path are built around them.

---

## Directory layout

```
wappflow-desktop/
├─ package.json            electron, electron-builder, electron-updater, onnxruntime-node, sharp, axios
├─ src/
│  ├─ main/
│  │  ├─ main.js           window, menu, auto-update + deep-link seams, IPC wiring
│  │  ├─ preload.js        secure contextBridge API exposed to the renderer
│  │  ├─ config.js         server base URL, paths, app config
│  │  ├─ auth.js           login + token storage (workspace pairing)
│  │  └─ ai/
│  │     ├─ engine.js      orchestrates pull → analyze → score → upload
│  │     ├─ analyzers/     the Analyzer interface + CPU analyzers (+ ONNX seam)
│  │     ├─ onnx.js        onnxruntime-node runtime (GPU/CPU), model loader
│  │     ├─ scores-client.js  POST to /api/media/.../scores
│  │     └─ models/        (ONNX model files — not committed)
│  └─ renderer/
│     ├─ index.html        app chrome + module switcher
│     ├─ shell.js          loads cloud web app (webview) + the Local AI view
│     └─ local-ai.js       native Local-AI panel (pick project, run, progress, results)
├─ electron-builder.yml    packaging config (win/mac/linux)
└─ README.md
```

---

## Cloud-first vs desktop-first

| Module | Where it runs | Desktop role |
|---|---|---|
| CRM, Inbox, WhatsApp, Team Chat | Cloud | Wrap web UI |
| Contracts Studio | Cloud | Wrap web UI |
| Booking | Cloud | Wrap web UI |
| Client Portal | Cloud | Wrap web UI |
| Media Studio (galleries/albums/portfolio UI) | Cloud UI, **desktop compute** | Wrap UI + run AI locally |
| **Media Intelligence (culling/scoring/video AI)** | **Desktop** | **Primary worker** |

---

## Roadmap (phased)

- **Phase 1 — Analysis (this foundation):** unified shell + Local AI Engine pipeline (CPU analyzers) → scores → upload. ONNX vision seam ready.
- **Phase 2 — Learning:** feed cull/delivery decisions into `workspace_brain`; editing/cull/delivery preference learning.
- **Phase 3 — Style learning:** train on raw↔edited↔delivered pairs → workspace/creator/studio style profiles → auto recommendations.
- **Video AI:** clip quality / scene / emotion / shot classification → story structure → reel planning → draft → (future) local enhancement. Desktop is the execution environment.
- **Sync:** projects, assets, albums, galleries, contracts, client data, settings, Studio Brain, style profiles, feature flags, plan data.
- **Command Center desktop management:** version / machine count / last-sync, force-update, block-version, feature flags, beta access, rollouts — all controlled centrally (no desktop-specific pricing logic; respects plan limits + overrides + feature flags).

---

## Build & run

> Requires a real desktop build machine (Windows/macOS/Linux with a GUI). Electron + native `onnxruntime-node`/`sharp` cannot be GUI-run or packaged in a headless CI sandbox.

```bash
cd wappflow-desktop
npm install
# Point at your server (defaults to the deployed API):
#   set WAPPFLOW_API_URL=https://api.yourdomain.com/api   (or http://localhost:3001/api)
npm run dev        # launch in development
npm run build      # package via electron-builder (per-OS)
```

Command Center (future) governs versions, feature flags, and rollouts; this app reports its version + last sync and respects plan/feature gates from the workspace entitlements.
