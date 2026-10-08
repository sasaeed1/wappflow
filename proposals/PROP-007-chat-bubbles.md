# Technical Proposal — Chat bubbles (Messenger-style chat heads)

- **Proposal ID / date:** PROP-007 · 2026-10-09
- **Author:** Claude (for the founder)
- **Status:** in-review
- **Audit findings addressed:** none (founder UX request)
- **Roadmap phase:** UX / Delight
- **Priority-order rank:** UX → Delight

---

## 1. Problem
A studio misses customer messages unless it is looking at Chat. The founder wants Messenger-style
chat heads:
- A round bubble with the customer's initial **pops onto the screen when a message arrives**.
- It can be **dragged anywhere**, snaps to the nearest edge, and **can be closed**: drag it to an ✕ target at the bottom, or tap ✕.
- **Tapping it opens a mini chat** so the studio can read and reply without leaving the page.
- It can be **turned on or off in Settings**.
- It works **"whether the app is open or closed"**.

Today, an inbound customer message reaches the app only as an SSE `new_message` frame
(`whatsapp-service.js:672/869/963`, routed through `broadcastToWorkspace`, `server.js:1223`). No push
is sent for customer messages: `sendPushToUser` fires only for new leads, reminders, mentions and
calls (`server.js:2443`, `:4422`, `comms.js:189/211/487`). So nothing happens when the app is closed.

## 2. Proposed solution — three surfaces, one behaviour

**What "closed" can and cannot mean (a hard platform limit).** On a phone, drawing a bubble over
*other* apps needs Android's "display over other apps" permission. Only native Android apps can
request it. WappFlow on a phone is a web app or PWA, and iOS allows no overlays at all. So on a phone
with WappFlow closed, a true floating bubble is impossible; the nearest equivalent is a **push
notification** that opens the chat as a bubble when tapped. On the **desktop app** (Electron), a
real always-on-top bubble *is* possible while the window is closed to the tray.

| Where | App open | App closed |
|---|---|---|
| Phone / browser (PWA) | Floating bubble pops in-app, draggable, closable, opens a mini chat | **Push notification** "Ayesha: Is the 14th free?". Tapping it opens WappFlow with that chat bubble already open |
| Desktop app (Windows/Linux) | Same in-app bubble | **Real floating bubble on the desktop**, always on top and draggable. Clicking it opens the chat window |

**Pieces:**
1. **`ChatHeads` (web, shell-level).** It reuses the existing realtime bus (`useRealtime('new_message')`)
   and the **existing `FloatingChat`** mini-chat for read and reply. No second chat panel is built.
   - One head per conversation, up to 4 stacked. Each shows an unread count and a short pop
     animation with the existing new-message sound.
   - Drag with Pointer Events, which covers mouse and touch. Heads snap to the left or right edge,
     and the position is remembered per device.
   - Close by dropping a head on the ✕ target or tapping its ✕.
   - No head appears for a conversation already open on screen, or for the studio's own messages.
2. **Push for customer messages.** In `broadcastToWorkspace`, when the frame is an inbound
   `new_message` (`from_me = 0`), also call `sendPushToUser` for members who turned bubbles on.
   - The push `tag` is per lead, so repeat messages replace the notification instead of stacking.
   - The WhatsApp service is **not touched**; this hooks the existing fan-out in `server.js`.
   - The service worker opens `/chat?lead=<id>&bubble=1`, which opens that bubble.
3. **Desktop bubble (Electron).**
   - A small frameless, transparent, always-on-top `BrowserWindow`, shown when a `new_message`
     arrives while the main window is hidden in the tray.
   - It reuses the desktop app's existing tray, notification and IPC plumbing.
   - Dragging is native; clicking opens the main window on that chat.
4. **Setting.** Settings → Notifications → **"Chat bubbles"** (on/off). It defaults to on for owners
   and agents.
   - Stored per user, so each teammate chooses.
   - Turning it off hides in-app heads, stops message pushes for that user, and disables the desktop bubble.

## 3. Golden-Rule check
- **Mini chat:** reuses `FloatingChat` (`components/FloatingChat.js`) and its existing open-lead
  event `wf:open-chat`.
- **Realtime:** reuses the one shell SSE connection (`components/shell/realtime.js`).
- **Push:** reuses `sendPushToUser`, `push_subscriptions`, `public/sw.js` and the existing
  Settings push opt-in.
- **Desktop:** reuses the tray, notifications and IPC in `wappflow-desktop/src/main`.

Nothing is duplicated.

## 4. Affected modules
CRM / Comms (inbox), Platform (shell, Settings, push), Desktop.

## 5. Database changes
`users.chat_bubbles INTEGER DEFAULT 1`, added via the existing `safeAlter` pattern. It is additive,
and existing users get the default (on). There are no other schema changes.

## 6. APIs
- `GET /api/me/preferences` returns `{ chat_bubbles }`.
- `PUT /api/me/preferences` with `{ chat_bubbles: boolean }`. It is scoped to the signed-in user and
  uses the standard `{ error }` shape.

If a user-preferences route already exists, this extends it rather than adding a new one.

## 7. UI impact
- A bubble layer in the shell, so it appears on every app page and on no public page.
- A "Chat bubbles" toggle in Settings → Notifications.
- **States:** no bubbles (nothing shown), several bubbles (stack plus "+N"), offline (heads stay;
  the mini chat shows the existing reconnecting state).
- **Behaviour:** works in light and dark; respects reduced motion (no bounce); focusable with the
  keyboard; Esc closes; every head has an accessible name ("Ayesha, 2 unread messages").

## 8. Platform-standards compliance
- **Notifications:** this is a notification surface and respects the user's setting.
- **Permissions:** a head appears only for leads the user may already see. It reuses the
  per-member lead visibility that the SSE fan-out already applies.
- **Responsive and A11y:** as in section 7.
- **Desktop:** the native bubble described above.
- **Offline:** degrades to nothing.
- **Plan enforcement:** none needed. It is part of the inbox.

## 9. Workflow integration
Message arrives → bubble → reply in the mini chat → the lead timeline updates (existing). There are
no dead ends; "Open full chat" goes to `/chat` on that lead.

## 10. Backward compatibility
- The existing `FloatingChat` button and behaviour stay.
- The WhatsApp message flow is untouched.
- The SSE frame format is unchanged.
- Users who never enabled push see only in-app bubbles.

## 11. Risks & mitigations
- **Notification spam:** the per-lead push tag means one notification per conversation. A
  30-second cool-down per lead stops repeated buzzing, and the setting turns it off.
- **Covering UI:** heads snap to edges, and can be closed or turned off. They stay clear of the
  existing AI and chat floating buttons.
- **Privacy on a locked phone:** the push body shows the first 80 characters, as WhatsApp does.
  A later option can hide previews.
- **Desktop window misuse:** the bubble window loads only a local page with
  `contextIsolation` on and no node integration, the same as the main window.

## 12. Rollout plan
Ship in this order: in-app heads and the setting, then message push, then the desktop bubble (it
needs a desktop release). Verify each on a phone and desktop with demo data. To roll back, turn the
setting off by default, or revert the shell mount.

---

## Definition of Done check
- [x] 1. No duplication (reuses FloatingChat, realtime, push)
- [x] 2. Reuses existing architecture
- [x] 3. Improves platform cohesion (one inbox surface everywhere)
- [x] 4. Complies with platform standards
- [x] 5. Discoverable (the setting, and the bubbles themselves)
- [x] 6. Performant (no extra connections)
- [x] 7. Accessible
- [x] 8. Responsive
- [x] 9. Integrates with workflows
- [x] 10. Maintainable
