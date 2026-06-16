# WappFlow — Intelligence Roadmap: build status

Status of the 17-phase intelligence/quality roadmap + Track 0 + payments. Built this session, **committed & pushed to `main`, not yet deployed** (run `bash deploy.sh` when ready). All new tables self-create on boot.

## Architecture decision (locked)
**Hybrid-first, desktop-bound, behind a swappable Analyzer abstraction.** Server does cheap CPU analysis now (`media-worker`, jimp/exifr); a future **desktop app runs heavy ONNX locally and uploads results** to the same store. Business logic only ever reads `ms_asset_scores` — it never knows or cares who computed a score. Invariants everywhere: **advisory-only, analyze-once, human-owned decisions, non-destructive.**

## Status by phase

| Phase | Scope | Backend | Frontend | Notes |
|---|---|---|---|---|
| **Track 0** | Analyzer abstraction, analyze-once ledger, reasons, composites, Learning System, Workspace Brain | ✅ | n/a | `backend/analyzers/index.js`; worker hooked; feedback from cull decisions |
| **P1** | Intelligence layer (scores) | ✅ | n/a | technical/dedup live in worker; vision/video = desktop ONNX (seam ready) |
| **P2** | Culling 2.0 (selections) | ✅ | ✅ Studio AI panel | best_of/highlights/portfolio/album/delivery, niche-weighted, explainable, dup-safe |
| **P3** | Style learning (profiles) | ✅ | ✅ manager | style manager in studio settings; learning-from-RAW pairs = desktop |
| **P4** | AI editing | ✅ suggestions | ⏳ | non-destructive params via existing edit pipeline; apply UI pending |
| **P5** | Gallery builder | ✅ | ✅ (panel) | gallery-from-selection |
| **P6** | Album Studio | ✅ drafts | ✅ editor | `/studio/[id]/album/[albumId]` — spreads reorder, add/remove from tray |
| **P7** | Video intelligence | ✅ ingest | n/a | scores via Track-0 ingestion (desktop/cloud) |
| **P8** | Video culling | ✅ | ⏳ | best moments/clips/reactions/action/interview/drone |
| **P9** | Template system (data-driven) | ✅ seeded | ⏳ editor | 7 niche system templates; CRUD |
| **P10** | Story Engine | ✅ | ✅ (panel) | narrative spec hook→build→peak→resolve |
| **P11** | Reel Studio | ✅ plan | ✅ panel + timeline editor | `/studio/[id]/reel/[reelId]` — reorder/retime clips, transitions/motion |
| **P12** | Client experience 2.0 | ✅ milestones | ✅ portal + gallery favourites filter | "My favourites" view in client gallery; milestones in portal |
| **P13** | Portfolio engine | ✅ picks | ⏳ | portfolio-grade recommendations endpoint |
| **P14** | Print Store 2.0 | ✅ recs | ⏳ | recommendations from project intelligence |
| **P15** | Client Portal 2.0 | ✅ | ✅ | portal now shows progress/albums/orders + docs/galleries/invoices/projects |
| **P16** | Marketplace foundations | ✅ `ms_pack` | n/a (by design) | generic pack catalog; no store UI per instruction |
| **P17** | Learning system | ✅ | n/a | `ms_feedback` + `workspace_brain` + derive |
| **Payments** | Stripe seam (biggest gap) | ✅ | ✅ pay page + invoice link | manual now; set `STRIPE_SECRET_KEY` to enable Checkout |

## New backend modules (all mounted in server.js, additive)
`analyzers/index.js` (intelligence), `studio-ai.js` (P2–P6,P13), `video-ai.js` (P7–P11), `studio-experience.js` (P12/P14/P16), `payments.js`. Plus client-portal endpoints inline.

## New tables (self-create)
`ms_asset_analysis` (ledger), `ms_feedback`, `workspace_brain`, `ms_selections`, `ms_style_profiles`, `ms_albums`, `ms_template_library`, `ms_story_specs`, `ms_reel_plans`, `ms_pack`, `ms_milestones`, `payments`. (+ `reasons` column on `ms_asset_scores`.)

## Key new endpoints
- Intelligence: `POST /api/media/assets/:id/scores` & `/projects/:id/scores` (desktop ingestion), `POST /projects/:id/analyze`, `GET /projects/:id/intelligence`, `GET/PUT/POST /api/media/brain[/derive]`.
- Studio AI: `/api/studio-ai/projects/:id/{selections,gallery-from-selection,album,albums}`, `/portfolio-picks`, `/styles`, `/assets/:id/auto-edit`.
- Video AI: `/api/video-ai/{templates}`, `/projects/:id/{cull,story,reel,reels}`.
- Experience: `/api/packs`, `/api/media/projects/:id/{milestones,print-recommendations}`, `/api/media/milestones/:id`.
- Payments: `POST /api/payments/link`, `GET /api/payments`, `POST /api/payments/:id/mark-paid`, `GET /api/payments/public/:token`, `POST /api/payments/webhook`.

## Done since (this build)
- ✅ **Fast cull** — AI-hero sort + score badges/reasons in cull; **windowed filmstrip** + 10k asset cap for 5k+ shoots.
- ✅ **Frontend depth** — album layout editor, reel timeline editor, style-profile manager, Studio Brain panel, gallery "My favourites" filter.
- ✅ **RAW pipeline** — embedded-preview extraction (exiftool/dcraw/exifr) → variants + CV scores; RAW shoots viewable & cullable.
- ✅ **Worker observability/scale** — `/api/media/jobs` health + System panel + retry-failed; lease-based claiming + stale-job reaper (multi-worker safe).

## Polish tail (completed — "complete it, skip desktop+payments")
- ✅ **Contracts depth** — bulk-send (template/pack → many leads), clause library, version content/diff compare.
- ✅ **Booking 2.0** — timezone label, buffers, blackout dates, intake questions, self-serve reschedule/cancel via manage link.
- ✅ **Gallery CX 2.0** — named favourite collections (client save → studio view) + story sections (folders → named chapters in the client gallery) + "Order prints" button when a store exists.
- ✅ **CRM depth** — next-best-action queue (heuristic, instant), saved views (persist filter combos), WhatsApp-safe duplicate merge (reassign child rows, keep routing phone, soft-delete dupes to trash).
- ✅ **Unified notification center** — `notifications` table + `notify()` helper + DI seam; emits new lead (API/IG/FB), reminder due, booking, contract signed, gallery collection/comment; navbar bell merges persistent feed (60s poll, mark-all-read). WhatsApp message flow untouched.
- ✅ **Data & Privacy** — full workspace JSON export (`GET /api/workspace/export`) + audit-log viewer in Settings.
- ✅ **Touch cull** — swipe gestures on the cull stage (↑ keep · ↓ reject · ←→ browse) + coarse-pointer hint.
- ✅ **Brain consumption** — cull "Top picks" spotlights the studio's learned `cull_keep_rate` % by AI hero score (advisory only; never writes a decision).
- ✅ **Library grid** — incremental render (show-more) + 10k cap for 5k+ shoots.

## What still needs work (deferred by request)
1. **The desktop app** — the long-term moat: package `media-worker`'s analyzer interface into an Electron/ONNX app that runs face/eye/smile/scene/aesthetic + video ML locally and POSTs to `/scores`. The `face-detect.js` seam + ingestion endpoints are ready. _(deferred until further notice)_
2. **Stripe go-live**: set `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`); harden the webhook to verify the signature over the raw body. _(deferred until further notice)_
3. **Booking ↔ Google Calendar 2-way sync** — needs OAuth.
4. **AI cost governor + opt-in cloud tier** for any future server-side cloud vision; **P4 apply-edit UI** + portfolio auto-publish + gallery-surfaced print recs.

See `ECOSYSTEM.md` for the full feature/architecture reference of the shipped product.
