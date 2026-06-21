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
   - **CPU analyzers (work today):** sharpness, exposure, contrast, colourfulness → `aesthetic`; rule-of-thirds → `composition`. Pure-JS `jimp`, no native build, runs anywhere.
   - **ONNX vision analyzers (live):** `face_count` via **UltraFace RFB-320**, `smile` via **FER+** run on each detected face crop — through `onnxruntime-node` (DirectML/CUDA when available, CPU fallback). Seam ready for eyes/scene/subject/aesthetic models.
4. **Score** — produce per-asset scores + reasons, respecting the **analyze-once** ledger and the server's `SCORE_TYPES` gate. `model_version` is `vision-v0` (must match the server registry, or assets stay `pending`).
5. **Upload** — POST to the Track-0 ingestion endpoints. Server stores; Studio Brain + culling consume. Composites (hero/portfolio/album) are **server-derived** — the desktop never sends them.

### Models & self-test

Model files are **not committed** (size + licence). Fetch and verify them on a machine with internet:

```bash
npm run fetch-models                  # downloads UltraFace (~1.3 MB) + FER+ (~35 MB) → src/main/ai/models/
npm run test:vision <a-photo.jpg>     # headless: runs the SAME analyzer the app uses, prints scores
```

`test:vision` decodes a single image through the real pipeline so you can confirm the ONNX decode on your hardware before trusting it on a whole library — a photo with one smiling face should print `face_count 1` and a high `smile`. If models are absent it degrades to CPU primitives only (`composition`/`aesthetic`). Adding a new model later is **additive**: drop the `.onnx` in `models/`, map its outputs in `onnxVision()`, and use the **Re-analyze all** toggle in the Local AI view to re-score existing assets.

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
│  │     ├─ analyzers/     the Analyzer interface: CPU primitives + onnxVision()
│  │     ├─ onnx.js        onnxruntime-node runtime (DirectML/CUDA/CPU), model loader
│  │     ├─ preprocess.js  image → tensor helpers (toCHW / cropGray / softmax / nms)
│  │     ├─ models.js      ONNX model registry (files, input specs, download URLs)
│  │     ├─ scores-client.js  POST to /api/media/.../scores
│  │     └─ models/        (ONNX model files — fetched, not committed)
│  └─ renderer/
│     ├─ index.html        app chrome + module switcher + Local AI view
│     ├─ shell.js          loads cloud web app (webview) + the Local AI view
│     └─ local-ai.js       native Local-AI panel (pick project, run, progress, results)
├─ scripts/
│  ├─ fetch-models.js      downloads the registered ONNX models
│  └─ test-vision.js       headless self-test for the vision pipeline
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

- **Phase 1 — Analysis (this foundation):** unified shell + Local AI Engine pipeline → scores → upload. CPU primitives (composition/aesthetic) **and** ONNX vision (`face_count` UltraFace + `smile` FER+) live and verified end-to-end. Seam ready for eyes/scene/subject/aesthetic models.
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
npm run fetch-models               # download the ONNX vision models (one-time, needs internet)
npm run test:vision <a-photo.jpg>  # optional: verify the decode on your hardware
# Point at your server (defaults to the deployed API):
#   set WAPPFLOW_API_URL=https://api.yourdomain.com/api   (or http://localhost:3001/api)
npm run dev        # launch in development
npm run build      # package via electron-builder (per-OS)
```

> `npm install` never hard-fails if a platform can't fetch the `onnxruntime-node`/`jimp` prebuilt binaries — the engine lazy-requires them and falls back to CPU primitives. Run `fetch-models` to enable `face_count`/`smile`.

Command Center (future) governs versions, feature flags, and rollouts; this app reports its version + last sync and respects plan/feature gates from the workspace entitlements.
