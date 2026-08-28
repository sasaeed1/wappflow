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

---

## Next — tractable, queued in this order

| # | Item | Notes |
|---|------|-------|
| 26 | Pin leads (unlimited, warn about clutter after 3) | Small. Per-user, like the unread store. |
| 2 | Invoice preview + send + edit + delete from the lead page | Medium, self-contained. |
| 19 | Popups not centred, no gap from nav/footer, "glitchy" — incl. AI floats and copilots | Medium but broad: one shared overlay geometry, not per-popup patches. |
| 21 | Mobile PWA install prompt (once per user) + link in settings + on landing | Small-medium. |
| 23 | Mobile app: session retention, permission prompts, active push | Medium. Session retention first — logging out on close is the worst of it. |

---

## Projects — build once, properly

**The reel editor (#6, #9, #11, #12, #13) is ONE project, not five items.**
Patched individually these produce five half-features. Together they are a real
multi-track timeline:

- 12 — separate text / audio / picture-video tracks with a `+` to add more
- 11 — the bottom bars, incl. a text bar that is currently invisible
- 13 — transitions and effects ON the bars: draggable, adjustable length,
  frequency, volume
- 9 — click-drag to scale/position media within the frame
- 6 — CapCut-grade templates (rests on all of the above)

Other projects:

| # | Item | Why it is a project |
|---|------|---------------------|
| 1 | Active AI assistant on the lead page — inline prompts, reads the lead profile, asks for missing details and writes them back, same for email | New surface + write-back contract |
| 7 | Auto-reel asks personalising questions first (photos/video, flashy vs elegant vs professional, niche) | Depends on the editor project |
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
