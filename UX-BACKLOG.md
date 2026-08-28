# UX / UI backlog — the 27

The working list from 2026-08-28. Nothing here is dropped: an item leaves this
file only when it is deployed AND verified on the live site, and the note says
how it was verified.

Status legend: `DONE` (deployed + verified live) · `NEXT` (tractable, queued) ·
`PROJECT` (needs building once, properly — not patchable in a pass).

---

## Done — deployed and verified live

| # | Item | What it actually was | Verified by |
|---|------|----------------------|-------------|
| 3 | WhatsApp must render every media type (stickers missing) | THREE hand-rolled copies of the wire-type mapping, each knowing a different set of types. Same sticker → picture from history, 📎 link when live. Prod had a RIFF/WEBP sticker + 3 `ftypmp42` mp4s stored as nameless `.bin`. | 23/23 tests; control-run fails 6/7 new checks pre-fix; repaired 4 prod rows; sticker serves `200 · image/webp` |
| 4 | Print shop dark theme unreadable | `color-scheme` was never declared anywhere, so every NATIVE control (select popups, checkboxes, date pickers, autofill) rendered light regardless of palette | `getComputedStyle(html).colorScheme === 'dark'` live |
| 5 | Rename gallery "Photos" → "Media" | Galleries carry video too | Live: `Media (2)`, `Media (1)`, no `Photos` |
| 10 | Reel media selector hard to judge | Rail fix had already landed; the banding was a screenshot-downscaling artifact — decoded pixels had 0 white rows, files end `FFD9`, standalone thumbnail clean | Canvas pixel scan + standalone render |
| 14 | Aspect ratio disagrees with the 9:16 label | TWO causes: effect keyed on a plain ref (never re-ran, `stageSize` stuck at the `360×640` default) AND `.ms-ve-frame` shrunk as a flex item in a flex column (inline 640px → computed 126.58px) | Live ratio `0.5615` vs `0.5625` expected, on first load |
| 15 | Galleries need their own scrollbar | Sticky aside with no scroller — reaching the last gallery scrolled the library away | Live: `scrollHeight 638 > clientHeight 404`, `overflow-y: auto` |
| 16 | Option to unpublish a gallery | Route AND client binding both existed; nothing ever called them | Live: `Unpublish` on published gallery only |
| 17 | Shoot hero image not scaled/fitted | ~6:1 box sliced portrait frames to a midriff band with faces cut off | Live: 3.51:1, `object-position: 50% 32%`, prefers a landscape frame when one exists |
| 24 | Recent activity labels old leads "new lead" | Dashboard imported no datetime helpers — parsed UTC-naive timestamps with bare `new Date()`; bare date beside a status chip read as recency | Relative time live |
| 25 | Chat bubble should only animate for unread | Gate was already correct; the animation was `infinite` on 20 of 25 rows at once | Live: `animationIterationCount: 3` |
| 27 | Recent activity sorts to top, unread highlighted | Sorting was already the default; the marker was missing | Live: 21 rows with `inset 3px 0 0 #ef4444` |
| 26 | Pin leads (unlimited, warn past 3) | Server-side + per-user so a pin follows you to your phone. Pins outrank every sort. No server cap — the nudge is UI-only. `pin()` verifies workspace ownership before writing, because the list is read back joined against leads | 12 tests; live: pinned 3rd lead → 1st with indigo marker, unpin restored the original order |
| 2 | Invoice preview + send + edit + delete from the lead page | Tab was read-only — you could see an invoice existed and do nothing about it, on the page where you talk to the customer. `SendInvoiceModal` extracted to `components/` so both pages mount one copy | Live: paid invoice shows Preview+Email only; unpaid shows all four; editor opens prefilled with real line items |
| 19 | Popups not centred / no gap from nav / "glitchy" | The PRIMITIVES were wrong, not each popup. `Dropdown` had no viewport awareness at all — no max-height, no flip-up, no clamp. `FloatingChat` (340×520 at bottom:24 = 544px needed) and `AICommandCenter` (70vh from bottom:155 = 507px) both overflowed a 503px viewport | Live: dropdown capped at 425px with `overflow-y: auto`, fits viewport |
| 21 | PWA install prompt + settings + landing | The manifest was SVG-only, so Chrome never considered the app installable and `beforeinstallprompt` never fired — an install prompt would have been dead code. PNGs generated from the same mark via `ImageResponse` | Live: `/pwa-icon-192.png` and `/pwa-icon-512.png` serve real PNGs; manifest lists both |
| 23 | Mobile session retention *(partial — see below)* | "Remember me" defaulted to UNCHECKED, and unchecked clears the session once every tab is gone — on a phone that is just "you closed the app". Now checked by default, and an installed app always persists regardless | Build + deploy; needs a real device to confirm |

---

## Next — tractable, queued in this order

| # | Item | Notes |
|---|------|-------|
| 23b | Mobile: permission prompts + **verify push actually delivers** | Session retention is done. Push infrastructure already existed (`usePushNotifications`, service worker, settings toggle) but has NOT been verified end to end on a real device — do not mark done until a notification actually arrives. |

---

## The reel editor — foundation DONE, templates remain

**#9, #11, #12, #13 are done and verified live.** Treating them as one project
was right, but for an unexpected reason: **most of it already existed.** The
renderer (`backend/video-engine.js`) has always taken up to 12 tracks of
video/audio/text/overlay, already flattens the clips of *every* text track, and
already honours per-clip `transform {x,y,scale}`, 9 transitions, motion/opacity
keyframes and per-clip audio fades. The editor drew three hardcoded lanes, so the
capability was there and unreachable.

| # | Item | What it actually was | Verified |
|---|------|----------------------|----------|
| 11 | Bottom bars poor, text bar not visible | It literally was not visible: a fixed 168px panel with `overflow-y: hidden`, while video (76) + text (38) + audio (36) + padding (32) needs ~182px. The lanes that did not fit were clipped off the bottom with no scrollbar | Live: panel drag-resizable + remembered; `scrollsWhenTall: true` with 3 tracks |
| 12 | Separate tracks with a `+` | Timeline renders `doc.tracks` generically with sticky labelled headers (name, mute, delete), in presentation order independent of document order. Capped at the renderer's own 12 so the UI refuses the 13th rather than silently dropping a layer on export. Deleting the last video track empties it — duration is measured from the spine | Live: `+ Track` offers Text/Audio/Overlay/Media; added Audio → 3 lanes ordered Media→Text→Audio |
| 13 | Transitions on the bars | Reachable only via the inspector, so you could not see which clips had one, which edge, or how long. Now drawn on the clip at real duration — a 400ms dissolve is 400ms wide at the current zoom | Live: 24 transition markers rendering |
| 9 | Click-drag to scale/position media | The renderer always honoured `transform`; the editor exposed it only as inspector number fields. Drag the preview, wheel to scale, normalised to −1..1 of the frame | Live: drag → persisted `x: 0.988` → reload → preview `translate(83.24px)` on an 81px frame |

Also fixed by generalising: the preview only ever composited the **first** text
track, so a second one exported captions the editor had never drawn.

| 6 | Templates "very basic" | Every clip the same length, the same transition on every cut, one title card, nothing else — a slideshow with a colour grade. A pack now describes a STRUCTURE: named rhythms, a hook that opens short and an outro that holds, cycled transitions, per-shot motion variation, and a closing CTA on its own track | 16 tests; control run fails 7 against the old builder. Live 30s draft: exactly 30000ms, 6 distinct beat lengths, opens 1142ms → closes 3945ms, 3 transition types, 2 text tracks with the CTA at 27250ms |
| 7 | Auto-reel should ask personalising questions first | "AI reel" meant picking one of twelve style names with no way to say what the reel was FOR — the same shoot produced the same reel whether it was going to a couple or to Instagram. Now asks what it is made of, how it should feel, what it is for, how long | Live: 4 questions, styles hidden until answered; Elegant → 3 of 12, + Wedding → 2 of 12 |

**The reel cluster is closed.** #8 (face/scene-aware framing) is the remaining
reel item and is a vision-engine job, not an editor one.

Other projects:

| # | Item | Why it is a project |
|---|------|---------------------|
| 1 | Active AI assistant on the lead page — inline prompts, reads the lead profile, asks for missing details and writes them back, same for email | New surface + write-back contract |
| 8 | Auto AI reel detects faces/scenes and frames accordingly | Needs the vision engine |
| 18 | Contracts Studio → DocuSign-grade: place signature/initial/field anchors before sending; client just clicks | Real placement UI + signing flow |
| 20 | Rebuild ALL client-facing pages from scratch, premium/high-end | Agree the shape first |
| 22 | Desktop app — finalise, downloadable from landing + settings | Build/sign/distribute pipeline |

---

## Still open from earlier (not part of the 27)

- SMTP unconfigured in prod — password reset is broken until it is set
- Credentials not rotated (owner: "make it work for now")
- `backup.js` is manual-run only
- Demo data still seeded (`scripts/seed-demo.js --clean` is lossless)
- Fabricated-looking login testimonial
- Analytics / Clients / Knowledge / Team surfaces not yet walked in the audit
- Upload sites other than the shoot uploader not migrated to the upload manager
