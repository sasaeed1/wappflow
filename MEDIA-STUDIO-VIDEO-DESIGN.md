# Media Studio — Video Studio · Architecture & Design

> Status: **DESIGN** (pre-implementation). Control-first. Integrated module, no separate app/db/product.
> Positioning: Pixieset + CapCut Templates + Canva + AI Reel Drafts + WappFlow CRM + WhatsApp.

---

## 1. Audit of what exists today

| Area | Today | Reused as-is | Gap for Video Studio |
|---|---|---|---|
| Projects / workspace / roles | `ms_projects`, `workspace_id`, JWT auth | ✅ | — |
| Library / storage | `ms_assets`, multer disk → `/uploads`, variants | ✅ (photos) | Needs **video** probing + poster + preview transcode |
| Worker / jobs | `ms_jobs` queue, `media-worker.js` (`ingest｜zip_export｜pdf_export｜render_edits`) | ✅ | Add `video_probe`, `video_proxy`, `video_export`, `ai_reel_draft` |
| Image render | jimp (pure-JS) | ✅ | **Cannot touch video.** Video = FFmpeg only |
| Existing "Video" | `ms_video_clips` (in/out markers on one asset) | ⚠️ superseded | Replaced by the timeline document model |
| AI | `ai-engine.callLLM`, on-device CV (sharpness/exposure/quality/dup) | ✅ | No faces/smiles/scene-detection yet |
| Delivery | galleries, ZIP, WhatsApp send seam | ✅ | Reuse to deliver finished reels |
| CV scores | `ms_asset_scores` | ✅ | Add video clip scoring later |

**The one hard truth:** real multi-track video editing + MP4 export (trim, speed, reverse, transitions, LUTs, audio mix, text, up to 4K) **requires FFmpeg + ffprobe as system binaries on the server.** There is no realistic pure-JS path. This is the single prerequisite the whole module stands on, and it's an infra change on the VPS (`apt install ffmpeg`), not an npm install.

---

## 2. The core architectural model — "EDL → FFmpeg"

We do **not** build a frame compositor in Node. We use the same model every web editor (Canva, Kapwing, Veed, CapCut-web) uses:

```
            ┌─────────────────────────────────────────────┐
            │  TIMELINE DOCUMENT (JSON)  — the single       │
            │  source of truth. Non-destructive. Versioned. │
            └─────────────────────────────────────────────┘
                  │                              │
        (same JSON drives both)                  │
                  ▼                              ▼
   ┌──────────────────────────┐    ┌───────────────────────────────┐
   │  PREVIEW ENGINE (browser) │    │  EXPORT ENGINE (worker job)    │
   │  DOM/Canvas player, RAF,  │    │  JSON → ffmpeg filter_complex  │
   │  proxy media, instant     │    │  → MP4. Progress via -progress │
   │  scrub. Never renders.    │    │  parsed to ms_video_exports.   │
   └──────────────────────────┘    └───────────────────────────────┘
```

- **Edit = mutate JSON** (instant, free, reversible). Matches "Control First."
- **Preview = play the JSON** in the browser against lightweight **proxy** media (720p H.264) so scrubbing stays smooth on big projects.
- **Export = compile the JSON to one FFmpeg `filter_complex`** in a background job. The UI never blocks; progress streams over the existing websocket.
- **Text** is rendered with **node-canvas → transparent PNG**, then composited as an overlay input in FFmpeg (gives us the full Canva type system + custom fonts; avoids FFmpeg `drawtext` limitations).

Why this fits WappFlow: reuses the job queue, storage, projects, websocket, and delivery seams verbatim. No new service, no new DB engine, no separate product.

---

## 3. Database schema (all `ms_*`, workspace-scoped, `safeAlter` migrations)

```
ms_timelines
  id, workspace_id, project_id, name,
  source            -- 'manual' | 'template' | 'ai_draft'
  template_id       -- nullable origin
  aspect_ratio      -- '16:9' | '9:16' | '1:1' | '4:5' | '21:9' | '3:2'
  width, height, fps, duration_ms,
  document          -- JSON: the full EDL (tracks/clips/keyframes/audio/text)
  status            -- 'draft' | 'ready'
  ai_signature      -- hash of source media set (for stale detection)
  ai_stale          -- 0|1  (newer content uploaded since draft)
  created_by, created_at, updated_at

ms_video_exports
  id, workspace_id, timeline_id, project_id,
  preset            -- 'ig_reel' | 'tiktok' | 'yt_shorts' | 'ig_feed' | 'square' | 'yt_16x9' | 'cinematic_21x9' | 'custom'
  width, height, fps, quality   -- 720|1080|1440|2160
  status            -- 'pending' | 'rendering' | 'done' | 'failed'
  progress          -- 0..100
  output_url, output_bytes, error, job_id, created_at

ms_audio_tracks            -- music library (workspace_id NULL = built-in)
  id, workspace_id, category, title, artist, url, duration_ms, license, created_by

ms_luts                    -- color LUTs (workspace_id NULL = built-in)
  id, workspace_id, name, category, cube_path, thumbnail_url, created_by

ms_video_templates         -- reel templates (workspace_id NULL = built-in)
  id, workspace_id, category, name, thumbnail_url,
  aspect_ratios     -- JSON array supported
  document          -- JSON EDL with typed placeholders
  created_by

-- ms_assets gets richer video metadata (safeAlter ADD COLUMN):
  v_duration_ms, v_width, v_height, v_fps, v_codec, v_has_audio, proxy_url, poster_url
```

The **timeline `document`** is stored as one JSON blob (atomic save, trivial undo/version, matches how these editors persist). We only break out into relational rows what we query across timelines (exports, templates, music, luts).

### Timeline document spec (the heart)
```jsonc
{
  "version": 1,
  "aspect": "9:16", "width": 1080, "height": 1920, "fps": 30, "duration": 18400,
  "safeArea": "tiktok",
  "tracks": [
    { "id", "type": "video|audio|text|overlay", "clips": [ {
        "id", "assetId|null", "kind": "video|photo|text|logo",
        "start", "end",          // position on timeline (ms)
        "in", "out",             // source trim (ms) for video
        "transform": { "x":0,"y":0,"scale":1,"rotation":0,"flipH":false,"flipV":false,"opacity":1, "fit":"cover|contain|fill" },
        "speed": 1.0, "reverse": false, "freezeAtMs": null,
        "kenBurns": { "fromScale":1.0,"toScale":1.12,"fromX":0,"toX":0.04 },
        "transitionIn":  { "type":"fade","duration":400 },
        "transitionOut": { "type":"dipToBlack","duration":300 },
        "effects": ["filmGrain","vignette"],
        "lut": "wedding_warm", "color": { "brightness":0,"contrast":0,"saturation":0,"temperature":0,"tint":0 },
        "keyframes": { "position":[...], "scale":[...], "opacity":[...] },
        "text": { "content","type":"heading|subheading|caption|lowerThird|cta","font","size","weight","color","opacity","align","letterSpacing","animation":"typewriter" },
        "audio": { "volume":1,"mute":false,"fadeIn":0,"fadeOut":600 }
    } ] }
  ]
}
```

---

## 4. Rendering & export pipeline

**Upload (per video asset), worker jobs:**
1. `video_probe` — ffprobe → duration/res/fps/codec/audio → fill `ms_assets` columns.
2. `video_poster` — extract a frame → poster (jimp can resize the extracted PNG).
3. `video_proxy` — transcode a 720p H.264 **proxy** for smooth web preview/scrub.

**Export, `video_export` job:**
1. Load timeline `document`; resolve preset → width/height/fps.
2. Build the FFmpeg graph:
   - inputs: each source (or freeze PNG / Ken Burns still / text PNG from node-canvas)
   - per clip: `trim`/`atrim` + `setpts`/`atempo` (speed), `reverse`/`areverse`, `scale`+`crop`/`pad` (aspect fit/fill/reposition), `eq`/`curves` (color), `lut3d` (`.cube` LUT), effect filters (grain/vignette/blur/glow/letterbox/Ken Burns via `zoompan`)
   - composition: `overlay` (position/scale/rotation/opacity, keyframed via `sendcmd`/expressions), `xfade`/`fade` (transitions), `amix`+`afade` (audio)
   - output: `-c:v libx264 -crf <quality> -pix_fmt yuv420p`, scaled to preset, `-movflags +faststart`
3. Stream `-progress pipe:` → parse → update `ms_video_exports.progress` → broadcast.
4. On done: store MP4 in `/uploads`, expose `output_url`; offer **WhatsApp delivery** (reuse the send seam) + attach to a gallery.

**Concurrency:** cap to 1–2 simultaneous exports (config). Renders are CPU-bound and minutes-long; the queue serializes them so the UI/API stay responsive.

---

## 5. Template engine

A template **is** a timeline document whose clips are typed **placeholders** (`photo｜video｜text｜music`). "Apply template":
1. Clone the document.
2. Map the user's selected media into placeholders in order (respecting per-placeholder duration).
3. Fill text defaults; attach the template's music + transitions.
4. Open in the same editor — fully editable.

**Multi-aspect:** a template stores a base layout + per-aspect transform overrides; switching aspect re-fits placeholders (cover/contain) with user override. Categories: Wedding, Real Estate, Restaurant, Travel, Corporate, Fitness, Product, Fashion, Education, Agency, Social.

---

## 6. AI Reel Drafts (control-first)

- **Trigger:** project created / photos or videos uploaded / significant new content → enqueue `ai_reel_draft` (debounced).
- **Inputs the AI may use:** keepers, star ratings, sharpness, quality scores, durations, scene changes, (later) faces/smiles.
- **Process:** `ai-engine.callLLM` receives the analyzed media list + a draft style; returns an **ordered shot list + pacing + music category + LUT suggestion**. We assemble that into a real timeline `document` (`source='ai_draft'`), per selected aspect ratio.
- **Draft types:** Cinematic Highlights · Emotional Story · Social Short · Wedding Highlights · Real Estate Tour · Promotional.
- **Never final:** drafts are saved, **never auto-exported/published/delivered.** User can Preview / Edit / Duplicate / Regenerate / Delete.
- **Refresh system:** `ai_signature` = hash of the source media set. New uploads → `ai_stale=1` → UI shows "Draft outdated · Refresh available" → user chooses Refresh or Keep.
- **Suggestions:** AI may propose better clips/music/LUTs/templates as dismissible chips. Never forced.

> Honest note: **faces/smiles aren't in the current CV.** Phase-4 MVP uses what we have (keepers/ratings/quality/sharpness/duration/scene-change). Face/smile scoring is a later add (face-api.js wasm or a small model) and is flagged as such.

---

## 7. UI / UX

New **Video Studio** at `/studio/[id]/video` (replaces the clip-marker page). Editor shell, **light mode primary**, premium dark second; reuses StudioShell + the glass-HUD language.

```
┌───────────────────────────────────────────────────────────────┐
│  ◄ Shoot   [Aspect 9:16 ▾] [Preset ▾]        [Preview] [Export ▸]│  top bar
├──────────┬──────────────────────────────────────┬──────────────┤
│ MEDIA /  │            STAGE (hero)              │  INSPECTOR    │
│ ELEMENTS │   the video, centered, safe-area     │ properties of │
│  rail    │   guides, play/scrub                 │ selected clip │
│ (library,│                                      │ (transform,   │
│  text,   │                                      │  speed, color,│
│  music,  │                                      │  LUT, text…)  │
│  luts,   ├──────────────────────────────────────┴──────────────┤
│  effects)│  MULTI-TRACK TIMELINE  (video/audio/text/overlay)    │
│          │  trim · split · drag · keyframes · playhead          │
└──────────┴──────────────────────────────────────────────────────┘
```

Principles: media dominates, controls secondary, intentional whitespace, editorial type, **not** a dashboard. Aspect switch is one click and the stage + safe-area guides adapt live; preview modes for IG Reel / TikTok / Shorts / YT landscape / web embed.

---

## 8. Implementation roadmap (phased, shippable)

**Phase 0 — Foundations & infra** *(prerequisite; proves the pipeline)*
FFmpeg + ffprobe on the VPS · `video_probe`/`video_poster`/`video_proxy` jobs · `ms_timelines` + `ms_video_exports` schema · the EDL document spec · an export worker that renders **one trimmed clip → preset MP4** end-to-end. Tests + a single "hello, render" export.

**Phase 1 — Manual timeline editor (the core product / MVP)**
Multi-track JSON model · in-browser preview player (proxy media) · trim / split / reorder / delete / duplicate · transform (crop/scale/position/rotate/flip) · photos with **Ken Burns** · basic transitions (fade/dissolve/dip) · aspect switching + safe areas · **export to MP4 presets** (all 9 ratios/presets) · WhatsApp/gallery delivery of the result.

**Phase 2 — Creative layer**
Text system (node-canvas overlays) + text animations · music system (upload + supplied library) + audio controls · color grading + **LUT (.cube)** system · full transitions/effects set · speed / slow-mo / reverse / freeze frame · basic keyframes (position/scale/opacity).

**Phase 3 — Templates**
Template engine · categories · placeholder mapping · multi-aspect adaptation.

**Phase 4 — AI Reel Drafts**
Draft generation + draft types · stale/refresh system · AI suggestions · per-aspect drafts · (optional) face/smile scoring add-on.

**Phase 5 — Delivery polish**
Social presets one-click · reel delivery via WhatsApp/gallery · analytics.

---

## 9. Risks / honest constraints

1. **FFmpeg is mandatory and lives on your server.** I can't `apt install` it (no SSH). You run one command; without it nothing renders.
2. **4K export is heavy.** On a small VPS, a 4K reel is minutes of CPU. We cap concurrency and stream progress, but the box may need an upgrade for heavy 4K use. 1080p is comfortable.
3. **Music licensing is yours.** I won't fabricate or scrape a music library. We ship the *system* + any royalty-free tracks **you** provide/license; uploads work day one.
4. **Faces/smiles** need a new model (not in current CV) — Phase 4 add-on, flagged.
5. **Browser preview ≠ final render** (CSS/canvas approximation vs FFmpeg). We keep them close; export is the source of truth — same contract as the photo editor.
```
```
