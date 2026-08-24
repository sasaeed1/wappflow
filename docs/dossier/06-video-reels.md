## Video, Reels and the Rendering Pipeline

### What this part of the product is for

WappFlow's core customer is a photo/video studio (weddings, real estate, restaurants, fashion). After a shoot, the studio has hundreds of photos and a handful of video clips sitting in a Media Studio **project** (also called a "shoot"). Photos get delivered as galleries; but the studio also wants a **reel** — a short, vertical, music-backed social video (Instagram Reel / TikTok / YouTube Shorts) cut from that same shoot, to post as marketing and to hand the client as a bonus deliverable.

The Video Studio is the subsystem that produces that reel. It is a genuine non-linear video editor built into the web app: a three-pane editor (media rail / preview stage / property inspector) over a scrubbable timeline, backed by a server-side **ffmpeg** render farm-of-one. On top of the hand-editing path sit three separate "AI" on-ramps that pre-build a timeline from the shoot's media so the user starts from something rather than a blank canvas.

Vocabulary you need before the mechanics:

- **Asset** — one uploaded file (photo, video, or audio) belonging to a project. Rows in `ms_assets`.
- **Cull** — the human act of marking each photo keep / reject / maybe with a star rating. Stored in `ms_cull_decisions`. The video subsystem *reads* cull decisions to rank media but never writes them.
- **Track-0 scores** — advisory computer-vision numbers about an asset (sharpness, aesthetic, composition, face count, a composite "hero" score). Rows in `ms_asset_scores`. Produced by the ingest worker on the server and/or by a separate desktop app. Always advisory — no AI path writes a decision.
- **Timeline / EDL** — the reel itself, stored as ONE JSON document (an Edit Decision List) in `ms_timelines.document`. Every reel-generation path in the product converges on this one artifact.
- **Export** — a queued request to compile a timeline into an MP4. Rows in `ms_video_exports`.
- **LUT** — a colour "look" (a 3D lookup table, `.cube` file) baked into the render by ffmpeg's `lut3d` filter.
- **Ken Burns** — the slow zoom/pan applied to a still photo so it feels like motion footage.

---

### The timeline document model (the EDL)

`backend/video-engine.js` is the shared, mostly-pure heart of the subsystem. Both the API (`media-studio.js`) and the render worker (`media-worker.js`) import it. `buildExportCommand()` is deliberately a pure function — no spawning, no filesystem — so the whole render graph is unit-testable on a machine with no ffmpeg installed (`video-engine.js:15-18`).

A timeline document is `{ version, aspect, width, height, fps, duration, safeArea, tracks[] }`. Each track is `{ id, type, clips[] }` where `type ∈ {video, audio, text, overlay}`. A `video` track holds clips whose own `kind` is `video` or `photo`.

`sanitizeTimeline(doc)` (`video-engine.js:179-198`) is the single validation gate. Everything that writes a timeline calls it. It whitelists enums, clamps every numeric, drops malformed clips, sorts clips by start, recomputes duration as the max clip end, and derives `width`/`height` from aspect + quality. Hard caps: **12 tracks, 400 clips per track**, clip `start` ≤ 3,600,000 ms, clip `duration` clamped to 10 ms – 600,000 ms.

Per-clip fields after sanitisation (`sanitizeClip`, `video-engine.js:66-149`):

| Clip kind | Fields |
|---|---|
| `video` / `photo` | `assetId`, `in`, `out`, `speed` (0.25–4), `reverse`, `freeze`, `freezeAtMs`, `transform{x,y,scale,rotation,flipH,flipV,opacity,fit}`, `kenBurns{fromScale,toScale,fromX,toX,fromY,toY}`, `motionKeys[≤8]{t,scale,x,y}`, `opacityKeys[≤8]{t,v}`, `transitionIn/Out`, `effects[≤6]`, `lut`, `color{brightness,contrast,saturation,temperature,tint}` |
| `text` | `text{content≤280, type, font, size, weight, color, opacity, align, letterSpacing, animation}`, `transform{x,y,scale,opacity}` |
| `audio` | `assetId`, `trackId`, `in`, `audio{volume 0–2, mute, fadeIn, fadeOut}` |
| `overlay` | `assetId`, `transform{x,y,scale,opacity}` — **STUB**: sanitised and stored, but `buildExportCommand` never reads overlay tracks, so an overlay clip renders as nothing. |

Vocabularies (`video-engine.js:22-45`):

- `ASPECTS`: `16:9, 9:16, 1:1, 4:5, 21:9, 3:2`
- `QUALITIES` (short edge): `720, 1080, 1440, 2160`
- `TRANSITIONS`: `none, fade, crossDissolve, slide, push, zoom, blur, dipToBlack, dipToWhite`
- `EFFECTS`: `filmGrain, letterbox, lightLeak, glow, pan, zoom, shake, blur, softFocus, vignette, kenBurns`
- `TEXT_TYPES`: `heading, subheading, caption, lowerThird, cta`; `TEXT_ANIM`: `none, fade, slide, scale, typewriter, pop, zoom`

**Export presets** (`video-engine.js:28-39`) map a platform to an aspect + a safe-area key: `ig_reel`, `tiktok`, `yt_shorts`, `fb_reel` (all 9:16), `ig_feed` (4:5), `square` (1:1), `yt_16x9`, `website` (16:9), `cinematic` (21:9), `custom` (keeps the timeline's own aspect). `dimsFor(aspect, quality)` derives even-numbered W×H from the short edge (`video-engine.js:54-61`).

#### The transition alias resolver

The AI planners in `video-ai.js` speak a different transition vocabulary from the renderer — they emit `cut`, `whip`, `dissolve`. `sanitizeTransition` used to return `null` for anything unrecognised, which reads downstream as "no transition", so a user who chose "whip" silently got a hard cut. `TRANSITION_ALIASES` + `resolveTransitionType` (`video-engine.js:157-168`) now map `cut → none`, `whip → slide`, `dissolve → crossDissolve`, and return `null` only for genuinely unknown names. Status: **PARTIAL** — the alias table resolves, but see the defects section: `slide` is itself not drawable by the renderer, so `whip` still renders as a cut.

---

### Templates: two independent template systems

There are **two** unrelated "template" engines, with different data models and different consumers. This is one of the clearest architectural smells in the module.

**(A) Creative Packs** — `backend/video-templates.js`. A hardcoded array of 12 packs (`wedding_luxury`, `wedding_emotional`, `wedding_cinematic`, `realestate_luxury`, `restaurant_premium`, `travel_story`, `corporate_brand`, `fitness_energy`, `fashion_campaign`, `education_showcase`, `agency_portfolio`, `social_premium`). Each carries a LUT id, `slotMs` pacing, a motion mode (`alt|zoomIn|zoomOut|pan`), a transition + duration, effects, a two-colour poster palette, and a mood line. `buildTimeline(pack, media, {aspect, durationSec, title})` (`video-templates.js:65-110`) computes `slotCount = round(targetMs / pack.slotMs)` clamped to 3–80, cycles the supplied media into that many equal slots (the last slot absorbs rounding so the total is *exactly* 15/30/45/60 s), attaches Ken Burns to photos, and optionally adds a title-card text track. **SHIPPED** — this is the path behind both the "Templates" gallery and the "AI drafts" modal.

**(B) `ms_template_library`** — `backend/video-ai.js:36-40, 57-72`. A *data-driven* slot spec (`{role, min_ms, max_ms, media, motion, transition_in}`) seeded idempotently with 7 system rows keyed by niche (`wedding, real_estate, restaurant, fitness, travel, corporate, commercial`) and marketed in the file header as "Marketplace-ready". **PARTIAL/STUB** — there is no endpoint to list, create, edit, or share these templates; the only consumer is `POST /api/video-ai/projects/:id/reel`, which picks one by `project_type`. `workspace_id` is always `'system'`.

---

### The three-and-a-half reel-generation paths

All of them now converge on a single artifact — an `ms_timelines` row that opens in the one editor that can export. That convergence was a deliberate Phase-6 fix and is enforced by `backend/test-phase6-one-reel-path.js`.

| Path | Endpoint | Module | Ranking input | Status |
|---|---|---|---|---|
| Blank reel | `POST /api/media/projects/:id/timelines` | media-studio.js:2336 | none | SHIPPED |
| Creative Pack ("Templates") | `POST /api/media/projects/:id/templates/:templateId/apply` | media-studio.js:2219 | explicit `asset_ids`, else keepers-first by capture time | SHIPPED |
| AI Draft | `POST /api/media/projects/:id/ai-drafts` (+ `GET .../ai-drafts/styles`) | media-studio.js:2269 | `quality`, `sharpness`, `faces`, `smile`, cull decision + rating, duplicate-group dedup (`video-ai-drafts.js:39-55`) | SHIPPED |
| Auto-reel | `POST /api/media/projects/:id/reel-render` | reel-engine.js:154 | `hero`, `aesthetic`, `composition`, `face_count`, `scene_class` → story-arc roles | SHIPPED (renders) |
| Auto-reel plan (advisory) | `POST /api/media/projects/:id/reel-plan` | reel-engine.js:137 | same | SHIPPED but **has no UI** — `reelAPI.plan` exists in `lib/api.js:526` and is never called |
| Story Engine | `POST /api/video-ai/projects/:id/reel` | video-ai.js:117 | `hook`, `emotion`, `quality` on videos + `highlights`/`best_of` selection or `hero` on photos | PARTIAL (see below) |

**AI Drafts** rank media (`rankMedia`), order it (chronological for story-ish categories, best-first otherwise), then pour it into the matching Creative Pack. The result is stored with `source='ai_draft'`, an `ai_style` (the pack id) and an `ai_signature` (sha1 of the media set). Uploading new assets to the project sets `ai_stale = 1` on every `ai_draft` timeline (`media-studio.js:649`), and `POST /api/media/timelines/:id/refresh` rebuilds it from current media and clears the flag. This staleness loop is a genuinely nice piece of design and it is **SHIPPED**.

**Auto-reel** (`backend/reel-engine.js`) is the story-structured planner. `buildPlan` (`reel-engine.js:91-134`) computes an `energy` score (`aesthetic*0.5 + composition*0.2 + min(1, faces/3)*0.3`), picks the highest-energy shot as the **hook**, the highest-hero shot as the **climax**, a landscape/faceless shot as the **outro**, then fills the **build** body by round-robining scenes ordered by group size. `planToTimeline` (`reel-engine.js:40-74`) turns that into a 9:16 EDL: per-role durations (`hook 2800 ms, build 2200, climax 3000, outro 3400`), a 350 ms `crossDissolve` overlap between every cut, alternating Ken Burns on photos, an optional title text track and an optional music track. It optionally bakes a house-style colour grade per clip by comparing each asset's measured look (from the `aesthetic` score's `reasons` JSON) against the workspace `style_profiles` row via `style-apply.js` — on by default, `auto_style:false` opts out, silently skipped when no profile exists.

**Story Engine** (`backend/video-ai.js`) generates a narrative spec (`hook → establish → build → peak → resolve`) into `ms_story_specs`, fills the matching `ms_template_library` slots to a target length (15/30/60/90 s), and then converts the plan into an `ms_timelines` row. It is surfaced only as a small "Reel (Story Engine)" control inside the Studio AI modal on the project page (`wappflow-web/src/app/studio/[id]/page.js:738-743`), which then links to the real timeline editor. Rated **PARTIAL** because its ranking depends on `hook` and `emotion` scores that nothing in this repo ever writes (see Concerns).

#### The ownership assertion in reel-engine

`reel-engine.js:27-31` runs at mount:

```js
for (const t of ['ms_timelines', 'ms_video_exports', 'ms_jobs']) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)) {
    throw new Error(`${t} must be created by media-studio before reel-engine mounts`);
  }
}
```

Why it exists: reel-engine **writes** three tables whose DDL and semantics are owned by `media-studio.js`. That only works because `server.js` happens to `require('./media-studio')` at line 6255 and `require('./reel-engine')` at line 6469 — an ordering dependency that nothing declared. The guard converts a silent, far-away failure (a 500 at the first render request, or worse, SQLite creating a *different* table shape) into a loud boot crash. `video-ai.js:31-33` carries the same guard for `ms_timelines`, and `studio-ai.js` for `ms_albums`. `backend/test-phase6-video-truth.js` asserts both guards survive and that **every table has exactly one DDL owner** across the whole backend.

---

### Schema

| Table | Owner | Key columns |
|---|---|---|
| `ms_timelines` | media-studio.js:1428 | `id`, `workspace_id`, `project_id`, `name`, `source` (`manual\|template\|ai_draft\|ai_reel`), `template_id`, `aspect_ratio`, `width`, `height`, `fps`, `duration_ms`, `document` (the EDL JSON), `status` (`draft\|ready`), `ai_style`, `ai_signature`, `ai_stale`, `created_by`, timestamps. Index on `project_id`. |
| `ms_video_exports` | media-studio.js:1451 | `id`, `workspace_id`, `timeline_id`, `project_id`, `preset`, `width`, `height`, `fps`, `quality`, `status` (`pending\|rendering\|done\|failed`), `progress` 0–100, `storage_key`, `size_bytes`, `error_message`, `created_by`, `created_at`, `finished_at`. Index on `timeline_id`. |
| `ms_jobs` | media-studio.js:141 | `id`, `workspace_id`, `type`, `asset_id`, `project_id`, `status`, `progress`, `payload` (JSON), `error_message`, `retry_count`, `next_retry_at`, `lease_until`, `finished_at`. Video job types: `video_probe`, `video_poster`, `video_proxy`, `video_export`. |
| `ms_luts` | media-studio.js:1475 | `id`, `workspace_id`, `name`, `category`, `cube_path`, `thumbnail_url` |
| `ms_video_clips` | media-studio.js:1412 | `id`, `workspace_id`, `project_id`, `asset_id`, `label`, `in_ms`, `out_ms`, `sort_order` — sub-clip markers on a source video. **STUB**: 5 CRUD endpoints exist, nothing in the render path reads them, no client method, no UI. |
| `ms_audio_tracks` | media-studio.js:1470 | built-in/custom music library — **SOLD-NOT-BUILT**: table created, never inserted into, never read. The editor's music picker uses project audio assets instead. |
| `ms_video_templates` | media-studio.js:1480 | **SOLD-NOT-BUILT**: created, never touched by any code path. |
| `ms_story_specs` | video-ai.js:41 | `id`, `workspace_id`, `project_id`, `spec` (JSON) — written and read by the Story Engine. |
| `ms_reel_plans` | video-ai.js:45 | **DEAD**: created at boot, never inserted into, never selected from. Residue of the removed private-plan editor. |
| `ms_template_library` | video-ai.js:36 | `id`, `workspace_id`, `kind`, `niche`, `name`, `def` (JSON slot spec), `is_system` |

Assets carry video metadata as columns added by `safeAlter` (`media-studio.js:178-182`): `v_duration_ms, v_width, v_height, v_fps, v_codec, v_has_audio, proxy_url, poster_url`.

---

### Endpoint inventory

All authenticated routes sit behind the standard bearer `auth` middleware and are scoped to `req.workspaceId`. `/api/media/*` and `/api/video-ai/*` additionally sit behind the `media_studio` module gate (`server.js:6222-6249`), which 403s if a workspace has the module explicitly disabled.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/media/video/presets` | Aspects, qualities, presets, transitions, effects, text types/animations, font families, **detected font paths**, LUTs, and `ffmpeg: {ffmpeg:bool, ffprobe:bool}` |
| GET | `/api/media/video/luts` | Built-in looks + workspace custom LUTs (each with a CSS-filter approximation for preview) |
| POST | `/api/media/video/luts` | Upload a `.cube` (multipart field `file`, ≤8 MB, validated for `LUT_3D_SIZE`) |
| DELETE | `/api/media/video/luts/:lutId` | Remove a custom LUT + its file |
| GET | `/api/media/video/templates` | The 12 Creative Packs, enriched with the look's CSS hint |
| POST | `/api/media/projects/:id/templates/:templateId/apply` | Pack → new timeline. Body `{asset_ids?, aspect?, duration_sec?, name?}` |
| GET | `/api/media/projects/:id/ai-drafts/styles` | Recommended + all draft styles for the shoot type |
| POST | `/api/media/projects/:id/ai-drafts` | Score-ranked media → new timeline (`source='ai_draft'`) |
| POST | `/api/media/timelines/:id/refresh` | Rebuild an `ai_draft` from current media; clears `ai_stale` |
| GET | `/api/media/projects/:id/audio` | Audio assets in the shoot (music picker) |
| GET/POST | `/api/media/projects/:id/timelines` | List / create |
| GET/PUT/DELETE | `/api/media/timelines/:id` | Read / save (full-document replace) / hard-delete (cascades `ms_video_exports`) |
| POST | `/api/media/timelines/:id/export` | Enqueue an MP4 render. Body `{preset?, quality?}` → 202 + the export row |
| GET | `/api/media/timelines/:id/exports` | Last 20 exports for this timeline (with `url`) |
| GET | `/api/media/video/exports/:exportId` | Poll one export (status/progress/url) |
| GET | `/api/media/projects/:id/videos` | Video assets + `clip_count` |
| GET/POST | `/api/media/assets/:id/clips`, PUT `/api/media/assets/:id/clips/order`, PUT/DELETE `/api/media/clips/:clipId` | `ms_video_clips` CRUD — **STUB**, no UI |
| POST | `/api/media/projects/:id/reel-plan` | Advisory story-arc shot list (writes nothing) |
| POST | `/api/media/projects/:id/reel-render` | Plan → timeline → export job. 202 with `{timeline_id, export_id, segments, duration_ms, structure, preset, auto_style}` |
| POST | `/api/video-ai/projects/:id/reel` | Story Engine. Body `{length_s?, story_id?, template_id?, mode?}` → `{reel_id, timeline_id, story_id, template, plan}` |

---

### How a render job is queued and executed

1. **Queue.** `POST /api/media/timelines/:id/export` resolves the preset → aspect → `dimsFor(aspect, quality)`, inserts a row into `ms_video_exports` with `status='pending'`, then inserts an `ms_jobs` row `{type:'video_export', payload:{export_id}}` and returns 202 (`media-studio.js:2379-2399`). `reel-render` does the same two inserts inline (`reel-engine.js:199-203`).

2. **Drain.** `createMediaWorker(db, {...})` is constructed and started from inside `media-studio.js:2877-2878` (a `setInterval` every 5000 ms, `unref`'d). `processOnce(batch=10)` reaps stale leases, selects due `pending` jobs oldest-first, and claims each with an atomic conditional `UPDATE ... SET status='running', lease_until=now+10min WHERE id=? AND status='pending'` — only one worker's update can win (`media-worker.js:833-841, 874-888`). Failures retry up to `MAX_RETRIES=3` with a `retry * 30 s` backoff.

3. **Compile.** `processVideoExport` (`media-worker.js:752-830`):
   - bails with a user-readable failure if `detectFfmpeg().ffmpeg` is false (`"FFmpeg is not installed on the server. Run: apt install ffmpeg"`);
   - loads the timeline, parses `document`;
   - if storage is remote (R2), pre-downloads every referenced asset to `uploads/media/tmp/` because the `resolve` callback handed to the pure builder is synchronous — **a dead branch today**, since the R2 provider cannot be activated (its AWS SDK dependency is absent from `backend/package.json`; see §14 §7 and §05's resolved UNKNOWN), so `storage.isRemote` is always false;
   - materialises the built-in `.cube` files on disk via `videoLuts.ensureCubeFiles` and merges workspace custom LUTs;
   - detects fonts;
   - calls `videoEngine.buildExportCommand(document, {width, height, fps}, resolve, lutPath, fontFile)`.

4. **The render graph** (`video-engine.js:236-382`). The first `video` track is the spine. Per clip, an ordered list of filter atoms is assembled onto `[i:v]`:
   - **source**: photos → `-loop 1 -t <dur> -i <file>`; video → `-ss <in> -to <in+dur*speed> -i <file>`; freeze-frame → `-ss <in> -i <file>` + `loop=loop=-1:size=1` + `setpts=N/FRAME_RATE/TB`; a missing file → an `lavfi color=0x111114` grey placeholder;
   - **geometry**: `scaleCover` (`scale=W:H:force_original_aspect_ratio=increase,crop=W:H`) for video, or `scale=2W:2H` + `zoompan` for Ken Burns / motion keyframes;
   - **grade**: `eq` (brightness/contrast/saturation) + `colorbalance` (temperature/tint) → `lut3d=<cube>` → effect atoms (`vignette`, `noise` for film grain, `gblur` for blur/soft focus, `drawbox` bars for letterbox);
   - **compositing effects**: `glow` (`split` + `gblur sigma=18` + `blend=screen@0.45`) and `lightLeak` (a generated `gradients` source blended `screen@0.32`) get their own sub-graphs;
   - **opaque transitions**: `dipToBlack` / `dipToWhite` become `fade=t=in|out` with an optional `:color=white`;
   - **alpha stage**: `fade` / `crossDissolve` become `format=yuva420p` + `fade=...:alpha=1`; keyframed opacity becomes a `geq` alpha expression built by `pwl()` (`video-engine.js:418-429`), a piecewise-linear ffmpeg expression generator;
   - **placement**: `setpts=PTS-STARTPTS+<start>/TB`.

   All layers are then overlaid one by one onto a full-length black `color` canvas, each gated by `overlay=eof_action=pass:enable='between(t,start,end)'`. Gaps show the base through; overlaps let the top clip win, and alpha makes overlaps crossfade. Text clips become `drawtext` atoms appended to the composite. The first clip of the first audio track becomes `volume` + `afade in/out` + `atrim`. Encode is fixed at `libx264`, `-preset medium`, `-crf 20`, `yuv420p`, `+faststart`, AAC 192 k with `-shortest` when audio exists.

5. **Execute + report.** The worker prefixes `-progress pipe:1 -nostats`, appends the output path, and spawns ffmpeg with `windowsHide`. It parses `out_time_ms=` from stdout and converts to a percentage (`media-worker.js:645-659`) — note ffmpeg emits that key in *microseconds*, and the `/1000` in the code correctly compensates. Each tick writes `ms_video_exports.progress` and broadcasts.

6. **Output.** The MP4 lands at `<uploadsDir>/media/exports/<export_id>.mp4`. On R2 it is additionally uploaded to the bucket (local copy kept as a dual-read fallback). The row is set to `status='done', progress=100, storage_key, size_bytes, finished_at`, and the URL is `storage.getPublicUrl(key)` — for local storage that is `/uploads/media/exports/<id>.mp4`, served by the plain `express.static` mount at `server.js:116-120`.

#### Progress reporting over SSE

The worker calls `broadcastToWorkspace(workspace_id, 'ms_video_export', {...})` on start, on every progress tick, on failure and on completion. `broadcastToUser` (`server.js:978-988`) writes **unnamed** SSE frames with the event name folded into the payload as `type`, so consumers must use `es.onmessage` + `switch (data.type)`.

**Nothing consumes `ms_video_export` in the web client.** The frontend's single shared `EventSource` router (`wappflow-web/src/components/shell/realtime.js`) has no handler for it, and the export modal instead polls `GET /api/media/video/exports/:id` every 1500 ms (`video/[timelineId]/page.js:900-906`). The SSE channel is therefore write-only today. Completion *does* now create a durable notification row via `notify()` (`media-worker.js:762, 825`), so closing the modal no longer loses the render entirely — this contradicts `PRODUCT-AUDIT.md`, which still lists "Global Notifications on render completion" as missing.

---

### The editor (frontend)

- `wappflow-web/src/app/studio/[id]/video/page.js` — the Reels list. Four creation entry points (Auto-reel, AI drafts, Templates, blank), a poster-art template gallery, per-card source badges (`ai_draft` / `ai_reel` / `template`), a stale-draft refresh button, and delete.
- `wappflow-web/src/app/studio/[id]/video/[timelineId]/page.js` (974 lines) — the editor. Media rail → click to append; a preview stage that reproduces transform + Ken Burns + motion/opacity keyframes + colour + LUT (as CSS filters) + text overlays + safe-area guides; a `requestAnimationFrame` playhead that seeks a `<video>` element and a music `<audio>` element; a draggable multi-track timeline with move/trim-left/trim-right handles and zoom; split at playhead; per-kind inspectors (clip / text / audio); debounced 800 ms autosave with saved/saving/dirty state; keyboard shortcuts (Space, S, Del, arrows); and the export modal.
- `wappflow-web/src/app/studio/video-constants.js` — a hand-mirrored copy of the engine's aspects, presets, qualities, safe areas, transitions, text types/animations, font families, effects and the CSS colour-preview approximation.

Status: **SHIPPED** as an editor. Known gaps it does not attempt: no undo/redo, no exports-history surface (`mediaAPI.listVideoExports` exists in `lib/api.js:398` and is never called), no export cancel, and no mobile layout for the three-pane shell.

---

### Concerns: bugs, security weaknesses, data-integrity risks and smells

*Read-only observations. Nothing here was changed.*

**S1 — Cross-tenant asset read through the render path (security, high).** `resolveAssetPath` (`media-worker.js:635-644`) and `localizeRenderAsset` (`media-worker.js:728-750`) both do `SELECT * FROM ms_assets WHERE id = ?` with **no workspace clause**. `PUT /api/media/timelines/:id` accepts an arbitrary document and `sanitizeClip` only truncates `assetId` to 64 chars — it never verifies the asset belongs to the caller. An authenticated user who learns (or guesses) another workspace's asset id can place it in their own timeline, export, and download another studio's photo or video inside their MP4. The LUT resolution on the same code path *is* correctly scoped by `exp.workspace_id` (`media-worker.js:786`), which makes the omission look accidental rather than intentional.

**S2 — Rendered MP4s are served unauthenticated.** Output lands under `/uploads/media/exports/` behind `express.static` with `Access-Control-Allow-Origin: *` (`server.js:116-120`). Access control is "know the UUID". Acceptable as capability-URL design, but it is not stated anywhere and differs from the tokenised gallery routes.

**S3 — `reel_engine` / `story_engine` entitlements are declared but never enforced.** `entitlements.js:56` sets both to `false` on the Creator plan and `:84` to `true` on higher tiers, and `:131` documents them as shipped. No code anywhere reads either flag — the only gate on the reel routes is the coarse `media_studio` module gate. A Creator-plan workspace can use Auto-reel and the Story Engine freely.

**S4 — Video exports are invisible to the storage quota.** `storage-enforce.js:37-42` sums `ms_assets` + `ms_exports` (the gallery ZIP table) and **never** `ms_video_exports`. 4K renders are the largest single artifacts a workspace produces and they do not count against `storage_gb`. Nothing ever deletes old MP4s either — deleting a timeline removes the `ms_video_exports` rows (`media-studio.js:2372`) but leaves the files on disk.

**B1 — Four of the nine transitions render as nothing.** `buildExportCommand` only draws `fade`/`crossDissolve` (alpha) and `dipToBlack`/`dipToWhite` (opaque fade). `slide`, `push`, `zoom` and `blur` are accepted by `sanitizeTransition`, stored, offered in the editor picker (`video-constants.js:44-53`) and produce **no filter at all** — I verified this by running `buildExportCommand` on a `slide` transition and inspecting the generated `filter_complex`: the graph contains only `overlay`, no `xfade` or equivalent. This also undermines the alias fix: `whip → slide` maps a legacy name onto a transition the renderer still cannot draw, despite the comment at `video-engine.js:159` claiming slide is "the closest thing the renderer can actually draw".

**B2 — Ken Burns distorts the photo's aspect ratio.** The Ken Burns and motion-keyframe branches use `scale=${W*2}:${H*2}` with no `force_original_aspect_ratio` (`video-engine.js:269, 273`), so a 3:2 landscape photo is squashed into the 9:16 canvas before `zoompan` crops it. The non-motion branch correctly uses `scaleCover`. Because every template, AI draft and Auto-reel attaches Ken Burns to photos by default, this affects nearly every generated reel. Generated graph for a 9:16 export: `scale=2160:3840,zoompan=z='min(zoom+0.002000,1.12)':d=60:s=1080x1920:fps=30`.

**B3 — Ken Burns ignores pan, and "zoom out" is a no-op.** The same `zoompan` expression sets only `z` — no `x`/`y` — so `fromX/toX/fromY/toY` (set by every pack with `motion:'pan'` and by the editor's "Pan ▸" preset) do nothing, and `zoompan`'s default `x=0:y=0` anchors the zoom at the **top-left** corner rather than the centre. It also ignores `fromScale`: `zoompan.zoom` always starts at 1, so a zoom-out (`fromScale 1.16 → toScale 1`, used by `corporate_brand` and the editor's "Zoom out" chip) computes `min(zoom - 0.0027, 1)`, which clamps to a static frame. The browser preview *does* honour `fromScale`, `fromX` and `toX` correctly (`video/[timelineId]/page.js:318-320`), so preview and render disagree.

**B4 — Crossfades dip toward black.** Overlaps are composited by chaining `overlay` calls onto a black base, with both clips carrying alpha. At the midpoint of a 50/50 crossfade the arithmetic is `out = 0.5·B + (1−0.5)·(0.5·A) = 0.5B + 0.25A` — total weight 0.75, i.e. a ~25 % luminance dip. A proper `xfade` would sum to 1. Since Auto-reel puts a `crossDissolve` on *every* cut (`reel-engine.js:52-53`), this affects the default output.

**B5 — Text silently vanishes when no font is found.** `drawtextAtom` is only emitted when `fontFile(family)` resolves (`video-engine.js:351-353`); `detectFonts` probes a fixed list of DejaVu/Liberation/Arial/Times paths (`video-engine.js:468-479`). On a slim container with no fonts installed, every text clip — including template title cards — is dropped from the render with no error, while still appearing in the preview. `GET /api/media/video/presets` returns the detected font paths and the ffmpeg presence flags, but the editor reads only `luts` from that response (`video/[timelineId]/page.js:95`), so neither condition is surfaced before the user clicks Render.

**B6 — Missing media becomes a silent grey card.** `buildExportCommand` counts unresolvable assets in `built.missing`, but `processVideoExport` drops that field from its result (`media-worker.js:827`), so a reel that rendered half its clips as grey `0x111114` placeholders reports `status='done'` with no warning.

**B7 — `-shortest` lets a short music track truncate the reel.** With audio present the encoder gets `-shortest` (`video-engine.js:377`). `atrim=duration=<total>` caps the audio but cannot extend it, so a 20 s music file under a 60 s reel likely ends the output at 20 s. *UNKNOWN: not verified against a real ffmpeg run — I could not execute a render in this environment.*

**D1 — `reel-plan` and `reel-render` disagree about deleted assets.** The plan query has no `deleted_at` filter (`reel-engine.js:141`); the render query has `AND deleted_at IS NULL` (`reel-engine.js:158`). The advisory plan a user reviews can include trashed photos that the render will then drop.

**D2 — reel-engine persists an unsanitised document.** It computes `san = sanitizeTimeline(doc)` for the row's dimension columns but stores `JSON.stringify(doc)` — the raw plan output (`reel-engine.js:191`). `video-ai.js:173` and `media-studio.js` both store the sanitised form. The render re-sanitises so output is unaffected, but the editor loads a document missing defaulted fields.

**D3 — Cross-workspace template lookup.** `video-ai.js:128` fetches `SELECT * FROM ms_template_library WHERE id = ?` with no `workspace_id` clause. Harmless today because every row is `'system'`, but it becomes an IDOR the moment workspace-owned templates ship (which the "Marketplace-ready" header explicitly plans).

**D4 — `ms_jobs.type` no longer declares what is written to it.** The column comment says `ingest|transcode|score|zip_export|watermark` (`media-studio.js:144`) while the worker actually writes `video_probe`, `video_poster`, `video_proxy`, `video_export`, `pdf_export` and `render_edits`. `test-phase6-video-truth.js` enforces exactly this discipline for `ms_timelines.source` but not here.

**A1 — The render graph is O(clips × duration).** Every clip becomes a full-length `overlay` pass over the whole canvas, chained serially. A 60 s reel with 40 clips runs 40 full-duration compositing passes instead of decoding 60 s of footage once. With the sanitiser's 400-clip ceiling, a maximal timeline produces 400 `-i` inputs and a filtergraph likely beyond practical argv/ffmpeg limits. There is no guard between the sanitiser's cap and what the encoder can survive.

**A2 — One worker, one process, serialised.** `processOnce` awaits each job in turn behind a `busy` flag, so a long 4K render blocks *all* media work — photo ingest, ZIP exports, album PDFs — for its duration. The 10-minute job lease plus `reapStale()` also means that if the worker were ever run in more than one process, a render exceeding 10 minutes would be re-claimed and rendered twice concurrently to the same output path. There is no export cancel and no concurrency limit.

**A3 — Server-side video intelligence does not exist.** `analyzers/index.js:50` registers the `video` analyzer with `where: 'client'` — its score types (`shake, motion, quality, speech, emotion, scene_cut, action`) are only ever produced by an external desktop/cloud analyzer POSTing to the score-ingestion endpoint. Worse, the ingest worker short-circuits video and audio assets straight to `video_probe` before the Jimp-based vision pass (`media-worker.js:235-241`), so on a server-only deployment **video assets receive no scores at all**. The composite formula (`analyzers/index.js:143-186`) writes `hero`, `portfolio`, `album`, `storytelling` — it never writes `hook`, `story` or `social` despite declaring them. The Story Engine ranks video clips by `hook + emotion` (`video-ai.js:101-102`) and Auto-reel's `energy` leans on `aesthetic`/`composition`; on a server-only install those are all zero for video, so the "AI" ordering for clips degrades to insertion order. Classify the *P8 Video Culling* layer as **SOLD-NOT-BUILT**: `VKIND` (`video-ai.js:81-88`) defines six culling profiles (`best_moments`, `best_clips`, `best_reactions`, `best_action`, `best_interviews`, `best_drone`) and is referenced by nothing.

**A4 — Two template systems, one product surface.** Creative Packs (hardcoded, no persistence, drives the UI) and `ms_template_library` (persisted, seeded, marketplace-shaped, drives one hidden endpoint) solve the same problem with different data models. Neither can consume the other.

**Doc drift worth flagging to the reader.** `PRODUCT-AUDIT.md`'s "Media Studio — Video & Reel" section is materially stale against the code: it describes the Story Engine as writing `ms_reel_plans` and opening a dead-end editor at `/studio/[id]/reel/[reelId]` (that route no longer exists; `video-ai.js:170-176` writes `ms_timelines`), lists render-completion notifications as missing (they exist), lists `ms_timelines.source` without `ai_reel`, and cites `server.js:5434-5442` for the module gates that are now at `6222-6249`. `backend/MEDIA-STUDIO-API.md` still says "no worker runs yet". The code is the truth in all four cases.
