## WhatsApp engine, messaging and internal Comms

### Orientation: what this part of the product is for

WappFlow is a CRM for small service businesses (photography studios in particular) whose customers arrive over **WhatsApp**, not over email or a web form. Everything in this section exists to serve two very different conversations:

1. **The conversation with the customer.** WappFlow logs into the studio's *real, personal WhatsApp account* — the same one on their phone — and turns every incoming chat into a CRM record. A stranger messages the studio's number; a `leads` row appears; every message thereafter is stored against that lead; the team can reply from inside the CRM (text, files, voice notes) and the reply lands in the customer's ordinary WhatsApp thread. There is no WhatsApp Business API, no Meta app review, no per-message fee. The mechanism is **browser automation**: the backend runs a headless Chromium via Puppeteer, drives `web.whatsapp.com` through the `whatsapp-web.js` library, and pairs by showing the user a QR code to scan with their phone's "Linked Devices" screen. This is the product's single biggest technical asset and its single biggest operational liability, and the document is blunt about both.

2. **The conversation inside the team.** A separate, unrelated subsystem (`backend/comms.js` plus the `chat_*` tables in `server.js`) is a Slack-shaped internal messenger: public channels, private channels, direct messages, threads, @mentions, reactions, pins, presence, typing indicators, unread counts, and voice/video "huddles" over LiveKit. It also provides **project rooms** — a private channel automatically bound to a business object (a lead, a shoot, a gallery, a contract, a booking) so the team can discuss *this specific job* next to the job itself.

The two share only a transport (the Server-Sent Events bus) and a vocabulary. They do not share tables, code, or concepts. Do not confuse `messages` (customer conversations) with `chat_messages` (internal team chat) — they are different tables with different owners.

---

## Part A — The WhatsApp engine (`backend/whatsapp-service.js`, 1,582 lines)

### A.1 Two classes: a manager and per-account services

`whatsapp-service.js` exports two classes (`whatsapp-service.js:1582`):

* **`WhatsAppService`** — one instance = one logged-in WhatsApp number = one headless Chromium process. Owns the client, the QR, the status, the message listener, media download, sends, sync, and auto-reply.
* **`WhatsAppManager`** — a registry of `WhatsAppService` instances keyed by `platform_accounts.id`, plus the special key `'__legacy__'` for installs that predate multi-account. All of `server.js` talks to the manager, never to a service directly.

`server.js:1241` constructs exactly one manager for the whole process:

```js
const whatsappService = new WhatsAppManager(db, broadcastToUser, broadcastToWorkspace, notify);
```

and `whatsappService.loadAccounts()` runs at boot (`server.js:1248`). `loadAccounts` (`whatsapp-service.js:1380-1397`) selects **every** `platform_accounts` row where `platform='whatsapp'` — across all tenants — and starts each one, staggered 12 seconds apart (`whatsapp-service.js:1388-1393`) because launching N Chromiums simultaneously thrashes CPU/RAM and trips "browser is already running" races. If there are zero rows it falls back to `_startLegacy()` (`whatsapp-service.js:1400-1406`), a service with `accountId = null` and no `clientId`.

**Consequence worth stating plainly:** the backend must be a **single process on a single machine with a persistent disk**. It cannot be horizontally scaled, and a restart costs one Chromium cold-start per connected number. `DEPLOYMENT.md:40` says the same thing.

### A.2 Session lifecycle and QR pairing

`initialize()` (`whatsapp-service.js:214-501`) constructs the client:

```js
this.client = new Client({
  authStrategy: new LocalAuth({
    dataPath: process.env.NODE_ENV === 'production' ? '/data/.wwebjs_auth' : './.wwebjs_auth',
    ...(this.sessionName ? { clientId: this.sessionName } : {}),
  }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox',
    '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run',
    '--no-zygote', '--disable-gpu'] }
});
```

Status is an **accessor**, not a plain field (`whatsapp-service.js:56-72`). Every assignment resolves the owning workspace and pushes an SSE frame named `whatsapp_status` carrying `{account_id, status, phone, has_qr}`. That is why the frontend can drop its 2-second poll to a 20-second safety net.

| Status | Set at | Meaning |
|---|---|---|
| `initializing` | `whatsapp-service.js:215` | Chromium starting; watchdog armed |
| `qr_ready` | `whatsapp-service.js:245` | QR available as a data-URL PNG in `this.qrCode` |
| `authenticated` | `whatsapp-service.js:279` | Phone scanned; session handshaking |
| `connected` | `whatsapp-service.js:263` | Ready; `isReady=true`; heartbeat started |
| `auth_failure` → `auth_failed` | `whatsapp-service.js:284` | Pairing rejected |
| `disconnected` | `whatsapp-service.js:290`, `:701` | Dropped, or user logged out |
| `unhealthy` | `whatsapp-service.js:616` | 3 consecutive heartbeat failures |
| `error` | `whatsapp-service.js:497`, `:551` | `client.initialize()` threw, or 60s init watchdog fired |
| `reconnect_failed` | `whatsapp-service.js:575` | 3 auto-reconnect attempts exhausted |
| `not_initialized` | `whatsapp-service.js:1437` | Manager has no instance for that account id |

The QR is rendered to a PNG data-URL with the `qrcode` package (`whatsapp-service.js:248`) and stamped with `qrTimestamp`. `getStatus()` (`whatsapp-service.js:670-682`) returns `{status, isReady, qrCode, qrTimestamp, qrAgeSeconds, phoneNumber, initAgeSeconds}` — `initAgeSeconds` is what lets the Settings UI show a "Reset" button after 40 seconds of a stuck init.

On `ready` the service records `client.info.wid.user` as `phoneNumber`, resets counters, starts the heartbeat, and schedules a missed-message sync 4 seconds later (`whatsapp-service.js:240-255`).

### A.3 The session store on disk

`LocalAuth` writes a full Chromium user-data directory per session. Path (`whatsapp-service.js:139-141`, `:226`):

* production: `/data/.wwebjs_auth/session-acct-<accountId>` (or `/data/.wwebjs_auth/session` for the legacy session)
* dev: `./.wwebjs_auth/...` relative to CWD

The `clientId` is `acct-<accountId>` (`whatsapp-service.js:1415`) — deliberately keyed on the globally unique account id rather than `slot_index`, because `slot_index` is only unique *within* a workspace and two tenants' "slot 0" would otherwise collide on the same profile directory.

**Configuration smell:** the session store is the one thing in the codebase that does **not** honour `DATA_DIR`. `server.js:38` and `server.js:61` define `DATA_DIR`/`DATA_ROOT` as `process.env.DATA_DIR || (NODE_ENV==='production' ? '/data' : __dirname)`, and inbound media *does* honour it (`whatsapp-service.js:415`). The auth path hardcodes the `NODE_ENV` ternary with no env override. Point `DATA_DIR` somewhere else and the DB, the uploads and the WhatsApp sessions live in two different places.

Environment variables that matter here: `NODE_ENV`, `DATA_DIR`, `PUPPETEER_SKIP_DOWNLOAD` (documented in `backend/.env.example:10`), `PUPPETEER_EXECUTABLE_PATH` (only referenced in `DEPLOYMENT.md:552`, never read by application code — Puppeteer itself reads it). `backend/nixpacks.toml` provisions `chromium`, `nss`, `freetype`, `harfbuzz`, `ca-certificates`, `ttf-dejavu`. Note `puppeteer` is **not** a direct dependency in `backend/package.json` — it arrives transitively under `whatsapp-web.js ^1.34.7`.

### A.4 The reliability machinery (and what it tells you)

Roughly 40% of `whatsapp-service.js` is defence against Puppeteer misbehaviour. That proportion is itself the honest summary of this integration's maturity.

* **`_cleanLocks()`** (`whatsapp-service.js:138-210`) runs before every `initialize()`. On Linux it `pgrep`s for `--user-data-dir=<profile>`, then **re-reads `/proc/<pid>/cmdline` to confirm an exact argument match** before killing — because `pgrep`'s substring match would make `session` a prefix of `session-wf-1` and cleaning one account would kill every other tenant's Chromium. On Windows it uses `wmic`/`taskkill` and only for the legacy session. Then it unlinks `SingletonLock`, `SingletonCookie`, `SingletonSocket`, `.lock`, `lockfile`.
* **Init watchdog** (`whatsapp-service.js:546-563`): if status is still `initializing` after 60s, force status to `error` and tear the client down so the next `/connect` can start clean.
* **Heartbeat** (`whatsapp-service.js:593-621`): every 60s, `client.getState()` raced against an 8s timeout; 3 consecutive failures → `unhealthy` → reconnect.
* **Auto-reconnect with backoff** (`whatsapp-service.js:571-589`): delays `[10s, 30s, 90s]`, max 3 attempts, then `reconnect_failed` and manual intervention required. Skipped entirely when the disconnect reason matches `/LOGOUT|NAVIGATION/i` or the user logged out deliberately (`whatsapp-service.js:295`).
* **Idempotent `reconnect()`** (`whatsapp-service.js:507-541`): a no-op if a healthy QR is <45s old or an init started <20s ago, unless `{force:true}`. Tearing down a working Chromium is described in the comment as "the exact bug that traps the next init in `initializing` forever". Teardown removes listeners, calls `destroy()`, SIGKILLs the lingering browser PID, and waits **3 seconds** before starting a new instance.
* **`_resolveChatId()`** (`whatsapp-service.js:714-720`): constructs `<digits>@c.us` directly instead of calling `client.getNumberId()`, because that call queries WhatsApp's servers from inside the browser page and "intermittently hangs (`Runtime.callFunctionOn timed out`), which wedges the whole request".
* **Voice notes are deliberately not sent as PTT** (`whatsapp-service.js:804-809`): passing `sendAudioAsVoice:true` "wedges the WhatsApp Web page, which then breaks every other send (text included) on the account".

### A.5 Inbound ingestion: message → lead

The whole pipeline is the `client.on('message')` handler (`whatsapp-service.js:300-493`).

**Filtering.** Group chats (`@g.us`) are dropped at `whatsapp-service.js:303`. Then `WhatsAppService.isIngestableChat(jid, chat)` (`whatsapp-service.js:87-95`):

```js
if (id.includes('@newsletter')) return false;
if (id.includes('broadcast')) return false;
if (chat && (chat.isChannel === true || chat.isNewsletter === true || chat.isBroadcast === true)) return false;
```

`@newsletter` JIDs are **WhatsApp Channels** — one-way publisher feeds the user follows. `status@broadcast` and other `broadcast` JIDs are Status updates and broadcast lists. Without this filter every channel the studio owner follows became a "customer" in their CRM and every channel post became that customer's message. It is a static method precisely so the missed-message sync can apply the same rule (`whatsapp-service.js:1248`).

Finally, messages with no body and no media are skipped (`whatsapp-service.js:306`), and a 1000-entry in-memory `processedMessages` Set suppresses same-process duplicates (`whatsapp-service.js:308-315`).

**Identity resolution.** `contact.pushname || contact.name || phone` becomes the lead name. Phone derivation handles WhatsApp's newer privacy JIDs: for a `@lid` sender the code tries `contact.id._serialized`, then `contact.number`, and only if both fail stores the raw `@lid` JID as the "phone" (`whatsapp-service.js:323-334`). WhatsApp usernames are read defensively from `contact.username || contact.handle || contact.pushname_username` and stored in `leads.wa_username` as a *second* identifier — the number stays authoritative (`whatsapp-service.js:322`).

**Tenant attribution.** `_resolveOwner()` (`whatsapp-service.js:116-135`) maps `accountId → platform_accounts.workspace_id → the earliest-created user in that workspace`. For the legacy session (no `accountId`) it falls back to the first user in the whole database. This is the multi-tenancy hinge: an inbound message creates its lead in the workspace whose connected account received it.

**Lead upsert.** Wrapped in a `better-sqlite3` transaction (`whatsapp-service.js:353-374`) so two simultaneous messages from the same number cannot create two leads. Matching is by digits-only phone with a SQL `REPLACE` chain stripping ` +-().`, first exact, then a `LIKE '%<last 10 digits>'` suffix match to survive `+92` vs `0` country-code swaps. A new lead is inserted with `status='New'`, `platform_source='whatsapp'`, `platform_account_id=<accountId>`.

**Side effects on a new lead:** a `notifications` row via `notify()` (`whatsapp-service.js:382-388`), an SSE `lead_created` frame, and `_maybeAutoAnalyze()` (`whatsapp-service.js:629-668`) which — 5 seconds later, and only if `workspace_ai_profile.auto_analyze` is set — feeds up to 30 messages plus AI memories to `ai-engine.analyzeLeadIntelligence` and writes back `lead_score`, `sentiment`, `urgency`, `intent_category`, then pushes `lead_updated`.

**Message persistence.** After a `wa_message_id` uniqueness check (`whatsapp-service.js:458-461`, backed by `idx_messages_wa_id`, `server.js:917`) the row is inserted with `from_me=0`, `platform='whatsapp'`, `platform_account_id`, and a placeholder body (`[Voice Note]` / `[Image]` / `[Video]` / `[File]`) when the message is media-only.

**Fan-out.** `_emit(user, 'new_message', {...})` (`whatsapp-service.js:480-486`) sends to the whole workspace when a workspace broadcaster is available, else to the resolved owner. Identity (`customer_name`, `customer_phone`, `wa_username`) travels *with* the frame — previously it carried only `lead_id`, so every notification read "New message from Unknown".

Then `checkAutoReply()` runs.

### A.6 Media handling, and where ffmpeg is needed

Inbound media (`whatsapp-service.js:396-455`) maps `message.type` to a coarse `media_type` (`voice` for `ptt`/`audio`, `image`, `video`, else `media`), calls `message.downloadMedia()`, and writes the base64 payload to disk under `<DATA_DIR>/uploads/{voices|images|videos|files}` with a timestamp-derived filename (`voice-<ms>.ogg`, `img-<ms>.jpg`, `video-<ms>.mp4`, `<ms>-<sanitised original>`). The stored `media_url` is the relative path `/uploads/<subdir>/<file>`, served by `express.static` at `server.js:116-120`.

**ffmpeg is required only on the outbound voice path.** `sendVoiceNote()` (`whatsapp-service.js:734-815`) transcodes anything that is not already OGG:

```js
execFile('ffmpeg', ['-y','-i', filePath, '-vn','-c:a','libopus','-b:a','32k','-ar','48000','-ac','1', oggPath], { timeout: 25000 }, ...)
```

It uses `execFile` (async) rather than `execSync`, with an explicit comment that a synchronous spawn in a request path "blocks the entire Node event loop and freezes every other API call". If ffmpeg is missing or fails, it logs and **sends the original file anyway** — degrade, don't fail. `ffmpeg` is not declared anywhere in `package.json` or `nixpacks.toml`; it is an undeclared host dependency.

### A.7 Outgoing sends

| Method | Line | Behaviour |
|---|---|---|
| `sendMessage(phone, text)` | `whatsapp-service.js:722` | Throws if `!isReady`; `client.sendMessage(_resolveChatId(phone), text)` |
| `sendMedia(phone, path, mime, name, caption)` | `whatsapp-service.js:727` | Reads file → base64 → `MessageMedia` |
| `sendVoiceNote(phone, path, mime)` | `whatsapp-service.js:734` | ffmpeg transcode → plain audio attachment (never PTT) |
| `saveOutgoingMessage(leadId, userId, body)` | `whatsapp-service.js:1063` | Inserts `from_me=1` row only — does not send |
| `fetchHistory(phone, limit=200)` | `whatsapp-service.js:1072` | `chat.fetchMessages()`; here it *does* call `getNumberId()`, the call the send path deliberately avoids |

Outbound sends never receive a delivery receipt: there is no `message_ack` listener anywhere in the file. There is also no `message_create` listener, which means **messages the studio owner sends from their own phone are never captured** — the CRM thread is missing half of any conversation the owner had on mobile.

### A.8 Missed-message sync

`syncMissedMessages()` (`whatsapp-service.js:1209-1334`) runs automatically 4s after every `ready`, and can be triggered by `POST /api/whatsapp/sync-missed`. It:

1. Resolves the owner workspace, then finds the newest `messages.timestamp` for that workspace (any lead) and converts it to Unix seconds; defaults to 24 hours ago when the workspace has no messages.
2. Iterates `client.getChats()`, skipping groups and non-ingestable chats, and skipping any chat whose `lastMessage.timestamp <= sinceSec`.
3. Fetches up to 100 messages per chat, keeps only `!m.fromMe && m.timestamp > sinceSec`, finds-or-creates the lead with the same phone-matching strategy, and inserts each message (deduping on `wa_message_id`).
4. Emits `missed_sync_complete` with `{totalImported, leadsCreated}`.

**Named gaps (this is PARTIAL, not SHIPPED):**
* **Media is not downloaded during sync.** Rows are inserted with `media_type` set but `media_url` NULL (`whatsapp-service.js:1302-1305`). A photo received while the server was down is permanently a `[Image]` placeholder.
* **Leads created by sync do not get `platform_account_id`** (`whatsapp-service.js:1276-1279`), unlike the live path. Per-account attribution is silently lost for anything imported after downtime.
* **The watermark is workspace-wide, not per-chat.** One busy chat advances `sinceSec` past quiet chats' unread messages.
* **No `new_message` frames and no `notify()` rows per synced message** — only the aggregate `missed_sync_complete`. The bell never learns about catch-up messages.
* **`_maybeAutoAnalyze` is not called** for leads created by sync.

### A.9 Auto-reply rules

`checkAutoReply(userId, lead, body)` (`whatsapp-service.js:1336-1361`) loads `SELECT * FROM auto_reply_rules WHERE user_id = ? AND is_active = 1`, parses `keywords` as a JSON array (falling back to treating the raw column as a single keyword), lowercases both sides, and matches by `match_type` (`'exact'` → equality, anything else → `includes`). On the first match it waits 1500ms, sends, saves the outgoing row, bumps `total_messages`, and `break`s.

CRUD lives at `GET/POST/PUT/DELETE /api/auto-reply[/:id]` (`server.js:2765` onward) and writes/reads with `req.workspaceOwnerId`.

**Gaps.** `auto_reply_rules` (`server.js:459-469`) has **no `workspace_id` column** — it is scoped only by `user_id`. Worse, the writer uses `req.workspaceOwnerId` (the `workspace_members` row with `role='super_admin'`) while the reader uses `_resolveOwner()`'s "earliest-created user in the workspace". These are normally the same person but are not guaranteed to be, and when they diverge auto-reply silently stops matching. There is no loop guard beyond `break`, no per-lead cooldown, no business-hours gate, and no entitlement check — even though `auto_reply` is `false` on the Free and Creator plans (`server.js:5445` and the equivalent in `entitlements.js`).

### A.10 Groups

`createGroup(name, phones, description)` (`whatsapp-service.js:964-1004`) resolves each phone through `_resolveParticipants` (`whatsapp-service.js:936-960`, which *does* use `getNumberId` and reports per-number skip reasons), calls `client.createGroup`, optionally sets the description, and best-effort fetches an invite code to build `https://chat.whatsapp.com/<code>`. `setGroupSubject`, `setGroupDescription`, `setGroupPicture` follow.

The HTTP surface is `POST /api/whatsapp/groups` (`server.js:5620`) — body `{name, description?, lead_ids[], account_id?}`, capped at 256 leads, filtering to leads in the caller's workspace with a plausible phone or a JID — and `PATCH /api/whatsapp/groups/:groupId` (`server.js:5694`) for name/description/icon. Results are mirrored into a `whatsapp_groups` table that is created lazily inside the request handler (`server.js:5664-5675`), columns: `id, workspace_id, group_id, platform_account_id, name, description, invite_link, created_by, created_at`, `UNIQUE(workspace_id, group_id)`.

**This is create-and-forget.** There is no `GET /api/whatsapp/groups`, so the persisted rows are never listed back to the user; the invite link is shown once in the create response and then only findable in the database. Inbound group messages are dropped at `whatsapp-service.js:303`, so there is no group inbox, no group broadcast send, and no group membership management. Classification: **PARTIAL** — creation and rename work end to end; everything after creation does not exist.

### A.11 Multi-account

`WhatsAppManager` proxies every operation with an optional `accountId`. Account slots are created through `POST /api/platform-accounts` (`server.js:5010`), which enforces a hard cap of 5 per platform plus the plan limit via `pricing.canCreate(db, workspaceId, 'whatsapp_accounts')` (Creator 1 / Studio 2 / Studio+ 5 / Enterprise unlimited, `entitlements.js:98-114`), then calls `whatsappService.addAccount(id, slot_index)` to boot a session immediately. Deleting the row calls `removeAccount`.

`listReadyAccounts()` (`whatsapp-service.js:1559-1580`) enumerates connected instances with `{accountId, key, phoneNumber, account_name, nickname, slot_index}` for the group-creation account picker.

**The routing hole.** `getReadyService(accountId)` (`whatsapp-service.js:1464-1475`) falls through: try the requested account, then the legacy instance, then **any ready instance in the whole process**. Every outbound call site in `server.js` passes no `accountId` at all — `server.js:1896` (lead reply), `server.js:3185` (`/api/whatsapp/send`), `server.js:4984` (vertical action), and the `sendClientMessage` seams injected into Media Studio (`server.js:6341`), Booking/Print Store (`server.js:6464`) and Contracts Studio (`server.js:6498`). If workspace A's number is disconnected and workspace B's is live, **workspace A's message is sent from workspace B's WhatsApp number.** This is the most serious defect in this section.

### A.12 HTTP surface

All routes are `auth`-guarded (JWT via `Authorization: Bearer` **or** `?token=`, `server.js:194`). None are behind a `MODULE_GATES` entry (`server.js:6222-6230` covers only media/cs/booking/store/payments), and none check the declared `manage_whatsapp` permission.

| Method | Path | Line | Notes |
|---|---|---|---|
| GET | `/api/whatsapp/status` | `server.js:3085` | Primary account = lowest `slot_index` (`resolveWorkspaceWaAccount`, `server.js:3081`) |
| GET | `/api/whatsapp/accounts/:id/status` | `server.js:3092` | Workspace-scoped by id |
| POST | `/api/whatsapp/accounts/:id/connect` | `server.js:3099` | Calls `reconnect(id)` **without options** |
| POST | `/api/whatsapp/accounts/:id/disconnect` | `server.js:3106` | |
| POST | `/api/whatsapp/reconnect` | `server.js:3120` | Responds first, reconnects after |
| POST | `/api/whatsapp/disconnect` | `server.js:3113` | |
| POST | `/api/whatsapp/sync-missed` | `server.js:3130` | Uses the account-scoped `syncMissedForAccount` |
| POST | `/api/whatsapp/send` | `server.js:3140` | `{phone, message}` — **no workspace scoping, no lead, no logging** |
| GET | `/api/whatsapp/ready-accounts` | `server.js:5602` | Filters to caller's workspace; legacy session always allowed through |
| POST | `/api/whatsapp/groups` | `server.js:5620` | |
| PATCH | `/api/whatsapp/groups/:groupId` | `server.js:5694` | multipart for icon |
| GET | `/api/leads/:leadId/messages` | `server.js:1844` | `?platform=` filter + `platform_counts` |
| POST | `/api/leads/:leadId/messages` | `server.js:1864` | Only `platform='whatsapp'` actually delivers; others persist as drafts (`delivered:false`) |
| POST | `/api/leads/:leadId/messages/voice` | `server.js:1893` | field `audio`, 16 MB cap; 502 on delivery failure with the file still saved |
| POST | `/api/leads/:leadId/messages/media` | `server.js:2473` | field `file`, 16 MB cap |
| POST | `/api/leads/:leadId/messages/sync` | `server.js:1937` | 5-minute per-lead cooldown via an in-memory `syncCooldowns` Map (`server.js:1226`) |
| GET/POST/PUT/DELETE | `/api/auto-reply[/:id]` | `server.js:2765`+ | |
| GET/POST/PUT/DELETE | `/api/platform-accounts[/:id]` | `server.js:4995`+ | |

### A.13 Data model touched by WhatsApp

| Table | Key columns | Notes |
|---|---|---|
| `leads` | `id`, `user_id`, `workspace_id`, `customer_name`, `customer_phone`, `wa_username`, `first_message`, `total_messages`, `status`, `platform_source`, `platform_account_id`, `last_message_at`, `is_deleted` | Base at `server.js:275`; the WhatsApp-relevant columns are all `ALTER`s (`server.js:662`, `:688`, `:704-705`) |
| `messages` | `id`, `lead_id`, `user_id`, `body`, `from_me`, `media_url`, `media_type`, `timestamp`, `wa_message_id`, `platform`, `platform_account_id` | Base at `server.js:338`; `wa_message_id`/`platform`/`platform_account_id` added at `server.js:696-699`. Indexes: `idx_messages_lead`, `idx_messages_wa_id`, `idx_messages_lead_ts` (`server.js:878`, `:897`, `:899`) |
| `platform_accounts` | `id`, `workspace_id`, `platform`, `account_name`, `nickname`, `account_handle`, `credentials`, `webhook_verify_token`, `status`, `slot_index` | `server.js:611`. **`status` is never written by the WhatsApp engine** — live status lives only in process memory |
| `auto_reply_rules` | `id`, `user_id`, `name`, `keywords` (JSON), `reply_message`, `is_active`, `match_type` | `server.js:459`. No `workspace_id` |
| `whatsapp_groups` | `id`, `workspace_id`, `group_id`, `platform_account_id`, `name`, `description`, `invite_link`, `created_by` | Created lazily at `server.js:5664` |
| `lead_channels` | `id`, `lead_id`, `workspace_id`, `platform`, `identifier`, `platform_account_id`, `display_name` | `server.js:768` — links one human's identities across platforms |

### A.14 Operational fragility — the honest assessment

A Puppeteer-driven WhatsApp integration is not an API integration. It is a robot pretending to be a browser pretending to be a phone. Concretely:

* **It is against WhatsApp's Terms of Service.** Any account paired this way can be banned without notice or appeal, and the ban falls on the *customer's personal number*, not on WappFlow. Nothing in the code or the UI warns the user of this.
* **It breaks on WhatsApp's schedule.** `whatsapp-web.js` reverse-engineers the web client's internal JS. A silent WhatsApp Web deployment can break sends, media, or pairing overnight, and the fix is upstream. The pinned range is `^1.34.7`.
* **Memory and CPU scale linearly with connected numbers.** `DEPLOYMENT.md:396` budgets ~500 MB per active session. Five numbers on one box is ~3.5 GB before the app itself.
* **State is on local disk and is not replicated.** Losing `/data/.wwebjs_auth` means every tenant re-scans a QR. There is no backup path in the code.
* **A single process serves all tenants.** One wedged Chromium can starve the event loop for everyone; the codebase's own comments (`whatsapp-service.js:709-713`, `:737-738`, `:804-808`) document three separate incidents where exactly that happened.
* **Recovery is manual past three attempts.** After `reconnect_failed` a human must click Connect.
* **No delivery guarantees.** No acks, no retries, no outbound queue. `DEPLOYMENT.md:3` advertises an "outbound message queue"; there is no such thing in the code (a dead `outbound_message_queue` table is a known finding from a prior audit).

---

## Part B — Internal Comms (`backend/comms.js`, 617 lines + chat routes in `server.js`)

### B.1 Shape

The base tables (`chat_channels`, `chat_messages`, `chat_reactions`) and the CRUD routes under `/api/chat/*` live in `server.js` and predate `comms.js`. `comms.js` mounts at `server.js:6430` and adds everything else, additively, under `/api/comms/*`. It returns `{afterMessage, mintLivekitToken, broadcastToChannel, canSee, channelMemberIds}`; `server.js` stores that as `commsApi` (`server.js:1037`) and delegates authorization (`canSeeChannel`, `server.js:1028`) and channel fan-out (`broadcastToChannel`, `server.js:1017`) to it.

Three default public channels — `general`, `leads`, `random` — are auto-created on first listing (`server.js:3282-3288`).

### B.2 Data model

| Table | Owner | Key columns |
|---|---|---|
| `chat_channels` | `server.js:481` | `id`, `workspace_id`, `name`, `description`, `is_private`, `created_by` |
| `chat_messages` | `server.js:491` | `id`, `channel_id`, `user_id`, `sender_name`, `body`, `media_url`, `media_type`, `reply_to`, `is_edited` |
| `chat_reactions` | `server.js:505` | `id`, `message_id`, `user_id`, `emoji`, `UNIQUE(message_id,user_id,emoji)` |
| `chat_members` | `comms.js:52` | `(channel_id, user_id)` PK, `last_read_at`, `muted`, `joined_at` |
| `chat_pins` | `comms.js:58` | `id`, `channel_id`, `message_id`, `pinned_by`, `UNIQUE(channel_id,message_id)` |
| `chat_mentions` | `comms.js:63` | `id`, `message_id`, `channel_id`, `user_id`, `author_id`, `read_at` |
| `project_rooms` | `comms.js:68` | `id`, `workspace_id`, `entity_type`, `entity_id`, `channel_id`, `UNIQUE(workspace_id,entity_type,entity_id)` |
| `user_presence` | `comms.js:73` | `(workspace_id, user_id)` PK, `state` ∈ `online|away|dnd` |
| `call_sessions` | `comms.js:79` | `id`, `workspace_id`, `channel_id`, `room`, `started_by`, `started_at`, `ended_at`, `duration_s` |
| `call_events` | `comms.js:84` | `id`, `call_id`, `user_id`, `name`, `type` ∈ `started|joined|left|screenshare|raise_hand|lower_hand|ended` |

Channel ids encode their kind: DMs are `dm_<sha1(workspaceId + ':' + sorted user pair)[0:24]>` (`comms.js:234-235`); rooms are `room_<type>_<entityId>` (`comms.js:580`); ordinary channels are UUIDs.

### B.3 Authorization and fan-out

`canSee(channelId, userId, workspaceId)` (`comms.js:141-146`): the channel must belong to the caller's workspace; public channels are visible to all members; private channels require a `chat_members` row.

`channelMemberIds` (`comms.js:101-105`) resolves public channels to *all* `workspace_members` and private/DM/room channels to their explicit members. `broadcastToChannel` (`comms.js:115-123`) fans a frame to exactly those users — and on any error **drops the frame rather than falling back to a workspace-wide send**, with the comment "Losing a live update is recoverable; leaking a private message is not." The code carries an explicit note (`comms.js:107-114`) that private-channel and DM bodies used to be written to every workspace member's SSE stream and hidden only by client-side filtering.

A one-time boot backfill (`server.js:6434-6460`) reconstructs membership for legacy private channels from `created_by` plus everyone who ever posted in them.

### B.4 `afterMessage` — the hook that makes chat feel live

`server.js:3361` (text) and `server.js:3382` (media) insert the row and then call `commsApi.afterMessage(message, mentions)` (`comms.js:150-224`), which:

1. Fans `chat_message` to the channel's members.
2. If the channel id matches `^room_([a-z]+)_(.+)$`, resolves the entity to its lead (`lead` → itself; `project`/`contract`/`booking` carry `lead_id`; `gallery` → `ms_projects` → `lead_id`) and writes an `activity_timeline` row of type `room_message`, so team discussion shows up on the customer's timeline.
3. Persists a `chat_mentions` row per mentioned user, pushes `chat_mention`, sends a Web Push, and writes a `notifications` row — all suppressed when the recipient's presence is `dnd`. `@channel`, `@everyone` and `@here` expand to full channel membership (`comms.js:179-181`).
4. For a threaded reply, notifies the root author with `chat_thread_reply` + push + notification, unless they were already mentioned or are the sender.

**Mention resolution is client-side and fragile.** `app/chat/page.js:564-567` scans the typed plain text for `@<member display name>` with a regex and posts the resulting `user_id[]` as `mentions`. The server trusts that array verbatim — so a caller can post arbitrary user ids and generate mention rows/pushes for anyone in the workspace, and a name containing regex-hostile characters or a nickname mismatch silently fails to mention.

### B.5 `/api/comms/*` surface

| Method | Path | Line | Purpose |
|---|---|---|---|
| POST | `/api/comms/dm/:userId` | `comms.js:228` | Find-or-create a 1:1 DM channel |
| GET | `/api/comms/dms` | `comms.js:247` | My DMs with counterpart + last message |
| POST | `/api/comms/channels/:id/read` | `comms.js:264` | Stamp `last_read_at`, clear that channel's mentions |
| GET | `/api/comms/unread` | `comms.js:275` | `{unread: {channelId: n}, mentions: n}` |
| GET | `/api/comms/mentions` | `comms.js:294` | Last 50 mentions (mentions inbox) |
| POST/DELETE | `/api/comms/messages/:id/pin` | `comms.js:308`/`:317` | Pin/unpin |
| GET | `/api/comms/channels/:id/pins` | `comms.js:325` | |
| GET | `/api/comms/messages/:id/thread` | `comms.js:339` | `{root, replies}` via `reply_to` |
| PUT | `/api/comms/messages/:id` | `comms.js:349` | Edit own message, sets `is_edited` |
| GET | `/api/comms/search` | `comms.js:363` | `LIKE` search across visible channels, escaped, LIMIT 50 |
| GET | `/api/comms/presence` | `comms.js:382` | Online = live SSE connection AND not away/dnd |
| POST | `/api/comms/presence/state` | `comms.js:394` | Set `online|away|dnd` |
| GET | `/api/comms/messages/:id/receipts` | `comms.js:405` | Derived from members' `last_read_at` — no extra writes |
| POST | `/api/comms/typing` | `comms.js:414` | Ephemeral `chat_typing` frame |
| POST | `/api/comms/livekit/token` | `comms.js:424` | Mint a LiveKit JWT; `503 {configured:false}` when unset |
| GET | `/api/comms/livekit/config` | `comms.js:441` | Capability probe |
| POST | `/api/comms/calls/start` | `comms.js:460` | Create-or-rejoin a `call_sessions` row; first start rings members |
| POST | `/api/comms/calls/:id/event` | `comms.js:497` | Allowlisted event types only |
| POST | `/api/comms/calls/:id/end` | `comms.js:512` | Duration, timeline, missed-call pings |
| GET | `/api/comms/calls/:id` | `comms.js:538` | Detail + derived roster + raised hands |
| GET | `/api/comms/channels/:id/active-call` | `comms.js:555` | |
| POST/GET | `/api/comms/rooms/:type/:id` | `comms.js:583`/`:601` | Project rooms; `type` ∈ `lead\|project\|gallery\|contract\|booking` (`comms.js:568-574`) |

Legacy chat routes: `GET/POST /api/chat/channels` (`server.js:3296`/`:3315`), `DELETE /api/chat/channels/:id` (`server.js:3332`), `GET/POST /api/chat/channels/:channelId/messages` (`server.js:3341`/`:3361`), `POST .../messages/media` (`server.js:3382`), `DELETE /api/chat/messages/:id` (`server.js:3400`), `POST /api/chat/messages/:id/react` (`server.js:3414`).

### B.6 The video story — LiveKit, not Jitsi

**This is where the repo docs are stale and the code is the truth.** `DESKTOP-FINAL-VISION.md:33` and `:48` describe Comms as "Web-only, async, public-Jitsi" and list "rip Jitsi out" as pending work. That is out of date — later lines in the same file (`:135`, `:346`) record the migration as done, and the code confirms it: **there is no Jitsi anywhere in the codebase.** `HuddleModal.js` is built on `livekit-client` (declared in `wappflow-web/package.json` at `^2.19.2`), and `comms.js:25-37` hand-rolls the LiveKit access token rather than adding the `livekit-server-sdk` dependency:

```js
const payload = { iss: LIVEKIT_API_KEY, sub: identity, nbf: now, exp: now + 6*3600,
  name: name || identity,
  video: { room, roomJoin: true, canPublish, canSubscribe, canPublishData: true } };
return jwt.sign(payload, LIVEKIT_API_SECRET, { algorithm: 'HS256' });
```

Rooms are namespaced per workspace: `ws_<workspaceId>_<rawRoom>`, sanitised to `[A-Za-z0-9_-]` and truncated to 96 chars (`comms.js:432`). Identity is the user id. Token TTL is 6 hours.

Config is three environment variables — `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (`comms.js:19-21`) — and when any is missing the token route returns `503 {configured:false}` and the client shows "Calls aren't enabled yet." `LIVEKIT-SETUP.md` is the deployment runbook (Docker `livekit/livekit-server`, host networking, TCP 7880/7881 + UDP 50000–50200, a wss reverse proxy). **These three variables are absent from both `backend/.env.example` and the `DEPLOYMENT.md` environment table**, and `LIVEKIT-SETUP.md` targets a Hetzner box while `DEPLOYMENT.md` describes the current host as OVH. Whether LiveKit is actually running in production is **UNKNOWN from the code alone** — nothing in the repo pins the deployed env.

### B.7 Real-time transport and event names

One SSE endpoint serves everything: `GET /api/events` (`server.js:951`), authenticated by `?token=<jwt>` because `EventSource` cannot set headers. `sseClients` is a `Map<userId, res[]>`; `broadcastToUser` (`server.js:978`) writes `data: {...payload, type}` with **no `event:` line** — the frames are unnamed, so `addEventListener('lead_created', …)` receives nothing and consumers must use `onmessage` plus a switch on `data.type`. The frontend enforces this in one place (`components/shell/realtime.js:73-84`). Note that `type` is spread **last** so a payload carrying its own `type` cannot rename the event.

| Event | Emitted by | Consumed by |
|---|---|---|
| `whatsapp_status` | `whatsapp-service.js:64` | `app/whatsapp/page.js:31` |
| `lead_created`, `lead_updated` | `whatsapp-service.js:390`, `:663` | dashboard / leads list |
| `new_message` | `whatsapp-service.js:480` | `components/FloatingChat.js:69`, lead detail |
| `missed_sync_complete` | `whatsapp-service.js:1323` | **nothing** |
| `notification` | `server.js:1082-1083` | notification bell |
| `chat_message`, `chat_edit`, `chat_delete`, `chat_reaction`, `chat_typing`, `chat_presence`, `chat_pin`, `chat_unpin`, `chat_mention`, `chat_thread_reply` | `comms.js` / `server.js` chat routes | `app/chat/page.js:423-425` |
| `call_invite`, `call_event`, `call_missed` | `comms.js:477`, `:484`, `:505`, `:521`, `:529` | **nothing** |

---

## Part C — The frontend surfaces

### `app/whatsapp/page.js` (323 lines) — the connection screen

A single-account status page for the workspace's **primary** number (lowest `slot_index`). It polls `GET /api/whatsapp/status` every 20 s as a safety net and refetches immediately on a `whatsapp_status` SSE frame (`app/whatsapp/page.js:25`, `:31`). It renders one of four states: QR (with a five-step "Linked Devices" walkthrough), Connected (shows `+<phoneNumber>`, offers Disconnect), Error/Disconnected (offers Reconnect), Initializing. Three static marketing cards at the bottom claim "Auto Lead Capture", "Real-time Sync" and "24/7 Active".

**Gap:** the page has no way to *create* a WhatsApp account slot. If the workspace has no `platform_accounts` row, `/status` returns `{status:'disconnected'}` and the Reconnect button 404s with "No WhatsApp account for this workspace". Slot creation exists only in Settings. Classification: **PARTIAL**.

### Settings → connections (`app/settings/page.js:1886`+, `WhatsAppAccountCard`)

The real multi-account console: list accounts per platform, add one (gated by plan limit and a 5-per-platform cap), rename inline, delete, and per-card Connect / Refresh QR / Reset / Disconnect with a 5-second status poll and an inline QR image.

**Bug:** the card calls `POST /api/whatsapp/accounts/:id/connect?force=true` (`app/settings/page.js:1917`) but the route (`server.js:3144`) calls `whatsappService.reconnect(req.params.id)` with **no options object**, so `force` is dropped. The "Refresh QR" and "Reset" buttons therefore hit the idempotency guards in `reconnect()` (`whatsapp-service.js:509-516`) and do nothing when the session is in the exact state the user is trying to escape.

### `app/chat/page.js` (1260 lines) — Team Chat

A dense Slack clone. Sidebar: presence selector (`online`/`away`/`dnd`), channel search, channel list with unread badges, a DM section with a member picker and online dots. Main pane: channel header with message search, pins panel, and **Huddle** / **Video call** buttons; a date-grouped message list; per-message hover actions (react, reply, open thread, pin, edit own, delete own); a right-hand thread drawer.

The composer is a `contentEditable` with an execCommand formatting toolbar (bold/italic/underline/strike/lists/quote/code), an emoji picker with ~280 emoji across 7 categories, @-mention autocomplete, paste-as-plain-text, file upload, and MediaRecorder voice notes uploaded through the media route. Outgoing HTML passes a strict allowlist sanitiser (`app/chat/page.js:46-79`: 18 tags, all attributes stripped except `http(s)`/`mailto` `href`, forced `target=_blank rel=noreferrer noopener`); incoming bodies are rendered with `dangerouslySetInnerHTML` after the same sanitiser, with a legacy `*bold*` markdown fallback.

Real-time comes from a single subscription to ten event types (`app/chat/page.js:423-482`). A `pollRef` and `lastMsgIdRef` survive from the pre-SSE polling implementation; `pollRef` is now unused.

**The huddle room-name mismatch (bug).** `startHuddle` (`app/chat/page.js:728-732`) opens `HuddleModal` with `roomName = "huddle_" + activeChannel.id`, which the server namespaces to `ws_<wsId>_huddle_<channelId>`. In parallel it calls `POST /api/comms/calls/start`, which stores `room = channelId` (`comms.js:469`) and rings other members with that value. Since nothing in the frontend consumes `call_invite`, the mismatch is currently invisible — but the invite payload advertises a room nobody joins.

### `components/FloatingChat.js` (346 lines) — the customer-conversation FAB

A persistent floating WhatsApp panel mounted at shell level for every CRM page (`components/shell/modules.js:28`). Green FAB → lead picker (recent 5, searchable across all leads) → a 340×520 chat window with WhatsApp-styled bubbles, emoji picker, file attach, and Enter-to-send. The active lead is persisted in `localStorage` under `wf_floating_chat_lead` and restored on mount; any page can open it with `window.dispatchEvent(new CustomEvent('wf:open-chat', {detail: lead}))` (`components/FloatingChat.js:342-346`).

It subscribes to `new_message` and refetches when `data.lead_id === activeLead.id` (`components/FloatingChat.js:69-71`). The source comment records two prior bugs fixed here: it used to open a *second* EventSource on top of the page's, and it compared `data.leadId` against a backend that sends `lead_id`, so incoming replies never appeared.

It has no per-platform selector — it always posts on the default (`whatsapp`) — and re-fetches the entire message list after every send rather than appending.

### `components/HuddleModal.js` (236 lines) — the call UI

Mints a token, lazily `import('livekit-client')` (keeping it out of the main bundle), connects, and attaches tracks **imperatively** into a tiles container to survive React reconciliation. Controls: mic, camera, screenshare, raise hand (broadcast over LiveKit's data channel as `{kind:'hand', raised, identity}`), participant roster, leave. Phases: `idle | connecting | live | error | unconfigured`; `unconfigured` renders "Calls aren't enabled yet — an admin needs to configure LiveKit (see LIVEKIT-SETUP.md)."

It never calls `commsAPI.callEvent(...)`, so `joined`, `left`, `screenshare` and `raise_hand` **never reach the server**. The consequence is that `GET /api/comms/calls/:id` always reports a roster of one (only the starter's implicit `joined` from `calls/start`), and every non-starter is flagged as a **missed call** when the call ends (`comms.js:526-531`) even if they were in the room the whole time.

### `components/RoomPanel.js` (111 lines) — contextual team rooms

Dropped into `app/leads/[id]/page.js:2440`, `app/studio/[id]/page.js:569` and `app/contracts/[id]/page.js:170`. Find-or-creates the entity's room, shows the last 50 messages, sends with optimistic append, and offers a Call button. It **polls every 6 seconds** rather than subscribing to SSE, even though `chat_message` frames already reach it. Its call button opens `HuddleModal` with `roomName = channelId` and never calls `calls/start`, so a room call rings nobody.

---

## Maturity ledger

| Capability | Status | The named gap |
|---|---|---|
| QR pairing + session lifecycle | **SHIPPED** | — |
| Inbound message → lead ingestion | **SHIPPED** | — |
| Newsletter/broadcast/channel exclusion | **SHIPPED** | — |
| Inbound media capture (image/video/file/voice) | **SHIPPED** | — |
| Outbound text / media / voice | **SHIPPED** | No delivery acks; voice sent as plain audio, not PTT |
| Multi-account (N numbers per workspace) | **PARTIAL** | `getReadyService` falls through to *any* ready instance across tenants; no call site passes `accountId` |
| Per-lead history sync (`/messages/sync`) | **PARTIAL** | Uses `getNumberId()`, the hanging call the send path avoids; 5-min cooldown is per-process memory |
| Missed-message sync | **PARTIAL** | No media, no `platform_account_id`, workspace-wide watermark, no per-message notifications |
| Auto-reply rules | **PARTIAL** | No `workspace_id`; reader/writer user-id mismatch; no loop guard or cooldown; plan flag unenforced |
| WhatsApp groups | **PARTIAL** | Create + rename only; no list endpoint, no group inbox, no broadcast |
| Messages sent from the owner's own phone | **NOT BUILT** | No `message_create` listener |
| Delivery/read receipts on customer messages | **NOT BUILT** | No `message_ack` listener |
| Outbound message queue | **SOLD-NOT-BUILT** | Advertised in `DEPLOYMENT.md:3`; no implementation |
| Non-WhatsApp send (Instagram/Facebook/Website) | **STUB** | `server.js:1875` — only `whatsapp` delivers; everything else persists a draft with `delivered:false` |
| `manage_whatsapp` role permission | **STUB** | Declared at `server.js:185-188`, never read anywhere |
| Team channels + messages + reactions | **SHIPPED** | — |
| DMs, threads, pins, edit, search, unread, receipts, typing, presence | **SHIPPED** | — |
| @mentions | **PARTIAL** | Client-side name-regex resolution; server trusts the supplied id array |
| Project rooms | **PARTIAL** | Polls instead of subscribing; no membership management; no room list |
| LiveKit voice/video/screenshare | **PARTIAL** | Backend + client complete and degrade cleanly; env vars undocumented, deployment unverified |
| Call lifecycle / roster / missed calls | **PARTIAL** | `callEvent` never called by any client → roster always 1, everyone marked missed |
| Incoming-call UI | **SOLD-NOT-BUILT** | `call_invite` / `call_event` / `call_missed` are emitted and consumed by nothing |
| Mentions inbox | **STUB** | `GET /api/comms/mentions` exists and is wrapped in `lib/api.js`; no UI calls it |
| Channel mute | **STUB** | `chat_members.muted` column exists; nothing reads or writes it |

---

## Bugs, security weaknesses, data-integrity risks and architectural smells

*(read-only observations — nothing here was changed)*

**Security / multi-tenancy**

1. **Cross-tenant WhatsApp send.** `getReadyService()` (`whatsapp-service.js:1464-1475`) falls back to *any* ready instance; no call site passes an `accountId`. Workspace A's messages can go out over workspace B's number. Highest-severity item in this section.
2. **`POST /api/whatsapp/send` is an unscoped send primitive** (`server.js:3140`). Any authenticated user of any workspace can send arbitrary text to an arbitrary phone number. No lead binding, no ownership check, no `messages` row, no audit entry.
3. **`DELETE /api/chat/channels/:id` deletes messages before authorizing** (`server.js:3332-3338`): `DELETE FROM chat_messages WHERE channel_id = ?` runs with no `canSeeChannel` and no workspace clause. Any authenticated user who knows or guesses a channel id can wipe **another tenant's** channel history. The channel row itself is protected by `created_by = ?`, which makes the outcome worse — the messages are gone and the channel remains.
4. **`DELETE /api/comms/messages/:id/pin`** (`comms.js:317-324`) deletes by `message_id` with no `canSee` check.
5. **`/uploads` is unauthenticated static** (`server.js:116-120`) with `Access-Control-Allow-Origin: *`. Every customer photo, document and voice note received over WhatsApp is world-readable at a guessable path (`/uploads/images/img-<epoch-ms>.jpg`, `/uploads/voices/voice-<epoch-ms>.ogg`). Filenames carry no random component.
6. **JWT accepted from the query string** (`server.js:194`) for every route, not just SSE. Tokens end up in access logs, proxy logs and `Referer` headers.
7. **`mentions` is caller-supplied and untrusted** (`server.js:3370` → `comms.js:178`). A crafted request can fabricate mention rows and push notifications for any workspace member.
8. **`manage_whatsapp` is never enforced** — any workspace member can pair, disconnect or send from the studio's WhatsApp number.
9. **LiveKit tokens are HS256-signed with `LIVEKIT_API_SECRET`**, valid 6 hours, and carry `canPublish`/`canSubscribe`/`canPublishData` unconditionally. A leaked secret mints tokens for any room. Room namespacing correctly prevents cross-workspace collisions; there is no per-channel authorization on the token route beyond "is authenticated" — a member can mint a token for a room string of their choosing, including a private channel they are not a member of.

**Data integrity**

10. **Duplicate inbound message inflates `total_messages`.** The lead upsert transaction increments the counter (`whatsapp-service.js:363`) *before* the `wa_message_id` duplicate check (`whatsapp-service.js:458-461`), which `return`s without rolling back.
11. **Filename collisions.** Both inbound media (`whatsapp-service.js:416`) and outbound voice (`server.js:150-165`) name files from `Date.now()` alone and share `uploads/voices`. Two files in the same millisecond overwrite each other.
12. **`platform_accounts.status` is never written by the engine.** Live connection state exists only in process memory, so a restart makes the DB's view of "connected" meaningless and any reporting built on that column is wrong.
13. **Media dropped by the missed-message sync** (`whatsapp-service.js:1302-1305`) is unrecoverable — the placeholder body is all that survives.
14. **`syncCooldowns`** (`server.js:1226`) is an unbounded in-memory `Map` keyed by lead id with no eviction. It grows for the life of the process.
15. **Auto-reply owner mismatch:** rules are written under `req.workspaceOwnerId` but read under `_resolveOwner()`'s earliest-created user. When those differ, rules silently never fire.
16. **Inbound leads bypass plan limits.** `pricing.canCreate(db, ws, 'leads')` is checked only on the manual `POST /api/leads` route (`server.js:2100`); WhatsApp ingestion inserts directly. Lead caps are unenforceable for the product's primary acquisition channel.
17. **`auto_reply` is a paid feature flag with no gate.** `MODULE_GATES` (`server.js:6222-6230`) covers media/cs/booking/store/payments only; `/api/whatsapp/*`, `/api/chat/*` and `/api/comms/*` are ungated despite `auto_reply` and `team_collaboration` being `false` on lower plans.

**Correctness**

18. **`?force=true` is dropped** by `POST /api/whatsapp/accounts/:id/connect` (`server.js:3144`), defeating the Refresh QR / Reset buttons.
19. **Huddle room mismatch** between `HuddleModal` (`ws_<ws>_huddle_<channelId>`) and `call_sessions.room` (`<channelId>`) — `app/chat/page.js:730` vs `comms.js:469`.
20. **Everyone is a missed call.** `HuddleModal` never posts `joined`, so `comms.js:526-531` flags every invited member as missed on every call.
21. **`RoomPanel` calls open a room nobody is invited to** — it never calls `calls/start` (`components/RoomPanel.js:107`).
22. **Busy-wait loop on Windows.** `_cleanLocks` spins `while (Date.now() < end) {}` for a full second (`whatsapp-service.js:156-157`), blocking the event loop.

**Architectural smells**

23. **Two message models with one name.** `messages` (customer) and `chat_messages` (team) share nothing, including the timestamp column name (`timestamp` vs `created_at`).
24. **`server.js` owns the chat tables and the legacy routes; `comms.js` owns the semantics.** Authorization is delegated back through a mutable module-level `commsApi` binding (`server.js:1037`) with a "if comms somehow has not mounted" fallback path that should be impossible.
25. **A DDL statement inside a request handler** — `whatsapp_groups` is `CREATE TABLE IF NOT EXISTS`-ed on every group creation (`server.js:5664`).
26. **The whole WhatsApp engine is a per-process singleton with no persisted state machine**, so the system cannot be restarted without a visible outage per tenant and cannot be scaled at all.
27. **`RoomPanel` polls at 6 s** while every other surface is SSE-driven — a leftover from the pre-Phase-5 transport.

---

## Where the repo docs disagree with the code

* `DESKTOP-FINAL-VISION.md:33` / `:48` describe Comms as "public-Jitsi" and list ripping Jitsi out as pending. **Stale.** There is no Jitsi in the codebase; `HuddleModal.js` is pure `livekit-client` and `comms.js` mints LiveKit tokens. Later lines in the same document (`:135`, `:346`) agree with the code.
* `DEPLOYMENT.md:3` advertises "an outbound message queue". **No such thing exists** in the WhatsApp path — sends are synchronous and unqueued.
* `DEPLOYMENT.md:634` instructs the user to "Visit `/settings/connections`". **That route does not exist**; `wappflow-web/src/app/settings/` is a single `page.js` with in-page tabs.
* `DEPLOYMENT.md`'s environment table contains no `LIVEKIT_*` rows, and `backend/.env.example` omits them entirely, even though `comms.js` requires all three for calls to work at all. `LIVEKIT-SETUP.md` documents them but targets a Hetzner host that `DEPLOYMENT.md` says has been replaced by OVH.

---

## Unknowns

* **UNKNOWN: whether LiveKit is actually deployed and configured in production.** The code degrades correctly when it is not (`503 {configured:false}` → hidden call buttons), and no file in the repo pins the live environment. `DESKTOP-FINAL-VISION.md:346` claims "DEPLOYED to prod (LiveKit live on Hetzner)" while `DEPLOYMENT.md` says prod moved to OVH; these cannot both be current.
* **UNKNOWN: whether `ffmpeg` is present on the production host.** It is invoked by path (`whatsapp-service.js:765`) and declared nowhere — not in `package.json`, not in `nixpacks.toml`, not in `DEPLOYMENT.md`'s dependency list. Outbound voice notes silently fall back to the untranscoded original if it is missing, so the failure is invisible until a recipient cannot play a file.
* **UNKNOWN: the exact `whatsapp-web.js` version resolved in production.** `package.json` pins `^1.34.7`; the resolved version in `package-lock.json` was not read.
* **UNKNOWN: real-world reconnect success rate and Chromium memory profile.** No telemetry, metrics or structured logs exist for the WhatsApp engine — only `console.log` with emoji prefixes (`DEPLOYMENT.md:723-724` documents grepping for them).
* **UNKNOWN: whether any workspace currently runs more than one WhatsApp number.** The multi-account code paths (staggered boot, per-account profiles, account picker) are written but their production exercise cannot be determined from the repository.
* **Note on line numbers (re-pinned 2026-08-24).** Every `whatsapp-service.js` and `server.js` citation in this
  section has been re-verified against `whatsapp-service.js` at **1,582 lines** and `server.js` at **6,595 lines**.
  The section was first written against a 1,257-line snapshot of `whatsapp-service.js`; the 325 lines added since
  pushed citations out of true by roughly +20 lines in the first third of the file, growing to +325 inside
  `WhatsAppManager` (which now starts at `:1364`, with `WhatsAppService` spanning `:8-1361`). `comms.js`
  citations are unchanged (617 lines, matching the original read).
