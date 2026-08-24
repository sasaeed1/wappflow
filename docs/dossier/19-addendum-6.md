## 19.6 Addendum 6 — What a Deploy Actually Costs: the 12·N-Second WhatsApp Blackout

### 19.6.1 Why this section exists

Two facts already appear in this dossier, in different sections, and neither points at the other.

* §04 describes the WhatsApp boot path: at process start, `loadAccounts()` selects **every** WhatsApp account row in the database — across all tenants — and starts each one **staggered 12 seconds apart**.
* §17.7 describes the operational reality of the WhatsApp engine: one headless Chromium per connected number, an unofficial library that breaks whenever WhatsApp ships a change, and a "permanent maintenance tax" of continuous upstream breakage.

Joining them produces the single most important operational number in this business, and it is written down nowhere: **shipping any backend change takes every customer's WhatsApp offline, and the last number in the queue stays offline for roughly 12 × N seconds**, where N is the number of WhatsApp account rows in the whole database. There is no drain, no blue-green, no per-tenant restart, and no way to deploy a backend fix without paying this cost in full.

This matters beyond the outage itself. It caps how often the team can deploy. Deploy frequency caps how fast they can respond to the upstream breakage §17.7 warns is permanent. The cost of a fix and the frequency of needing one are coupled, and the coupling is invisible in the current docs.

Everything below is read off the executables. Where `DEPLOYMENT.md` disagrees, the code wins and the disagreement is named.

---

### 19.6.2 The deploy script, step by step

The production deploy is a single shell script at the repo root, run by hand on the server (`deploy.sh:6` — "Run from the repo root: `bash deploy.sh`"). It has seven visible steps:

| # | Line | What it does | Live impact |
|---|---|---|---|
| 1 | `deploy.sh:16-17` | `git checkout --` on `package-lock.json` ×2 and `wappflow-web/tsconfig.json` to clear build-artifact churn | none |
| 2 | `deploy.sh:19-20` | `git pull` | **Replaces `backend/*.js` on disk under the running process** (see §19.6.8) |
| 3 | `deploy.sh:22-24` | Prints `df -h` and `free -h` | none |
| 4 | `deploy.sh:26-27` | `cd backend && npm install --omit=dev` | Rewrites `backend/node_modules` under the running process |
| 5 | `deploy.sh:29-38` | Full `npm install` in `wappflow-web`, then `NEXT_DIST=.next.staging npm run build` | CPU/RAM pressure on the same box that is running N Chromiums |
| 6 | `deploy.sh:40-45` | `rm -rf .next.old`; `mv .next .next.old`; `mv .next.staging .next` | Atomic **artifact** swap |
| 7 | `deploy.sh:47-49` | `pm2 restart wappflow-api wappflow-web --update-env`; `pm2 save` | **The blackout starts here** |

Step 6 is the script's headline safety property, and its header comment states it precisely (`deploy.sh:3-5`): "A failed / OOM-killed frontend build can NEVER replace the live build." That is real and it works. But it protects the **artifact**, not **availability** — it guarantees a bad build never goes live, not that a good one goes live without downtime. Step 7 hard-restarts both processes regardless.

The asymmetry the reader needs: the frontend is stateless, so its restart costs a few seconds of 502s and nothing more. The backend is not stateless. It holds the SQLite handle, the SSE bus, and — the expensive part — N live headless Chromium browsers, each holding one customer's authenticated WhatsApp Web session. `DEPLOYMENT.md:38` states the constraint plainly: "The backend must be a **single instance** because WhatsApp Web sessions and the SQLite database live on disk." A single stateful instance cannot be reloaded without being restarted, and `pm2 restart` (not `pm2 reload`) is what the script uses.

---

### 19.6.3 What "restart" does to WhatsApp

The process boots. `server.js` runs top to bottom: schema creation, `safeAlter` migrations, index creation (`server.js:896-922`), boot backfills (`server.js:720`, `:733-743`, `:757-774`). At `server.js:1240` it constructs the manager and at **`server.js:1248`** it calls:

```js
console.log('🔄 Initializing WhatsApp...');
whatsappService.loadAccounts();
```

`loadAccounts()` is fifteen lines (`whatsapp-service.js:1380-1398`):

```js
const accounts = this.db.prepare(
  `SELECT * FROM platform_accounts WHERE platform = 'whatsapp' ORDER BY slot_index ASC`
).all();
accounts.forEach((account, i) => {
  setTimeout(() => {
    try { this._startAccount(account.id, account.slot_index); }
    catch (e) { console.error('⚠️ Staggered account start failed:', e.message); }
  }, i * 12000);
});
```

Five properties of that query and loop decide the shape of every deploy:

1. **No workspace filter.** One global queue across all tenants. A customer's downtime depends on how many *other* customers exist and where their rows sort.
2. **No status filter.** The `platform_accounts` table has a `status` column defaulting to `'disconnected'` (`server.js:639`), and it is not consulted. A row created by a trial user who never scanned a QR code, or a churned customer whose row was never deleted, still consumes a full 12-second slot and still launches a Chromium. **N is the row count, not the connected-number count.** Rows are only removed by an explicit `DELETE /api/platform-accounts/:id` (`server.js:5113-5124`); nothing prunes them on churn, downgrade, or non-payment.
3. **`ORDER BY slot_index ASC`, globally.** `slot_index` is only unique *within* a workspace — the code says so at `whatsapp-service.js:1410-1412`. Ordering by it across all tenants means every workspace's slot-0 number is scheduled before any workspace's slot-1 number. That is accidentally the fair ordering (primary numbers first), but it is not stated as intent anywhere, and within a slot tier the order is whatever SQLite returns — effectively arbitrary and not stable across deploys. **A given tenant cannot predict its position in the queue.**
4. **Fire-and-forget `setTimeout`.** The delays are computed once at boot. Nothing rebalances if an early account hangs; slot 40 fires at t+468s whether slot 3 succeeded or is still spinning.
5. **`i * 12000`, unconditional.** No cap, no batching, no concurrency ceiling. The window grows linearly and forever with customer count.

**The formula.** The last account's start is *triggered* at `12 × (N − 1)` seconds. It then has to actually reach `connected`, which is bounded above by the 60-second init watchdog (`whatsapp-service.js:546-563`). So the worst-case time-to-restored-service for the unluckiest tenant is `12(N − 1) + T_init`, with `T_init ≤ 60s` before the session is instead marked `error`.

| N (WhatsApp rows) | Last start triggered at | Realistic worst-case restore |
|---|---|---|
| 2 | 12 s | ~30–70 s |
| 5 | 48 s | ~1–2 min |
| 10 | 1 m 48 s | ~2–3 min |
| 25 | 4 m 48 s | ~5–6 min |
| 50 | 9 m 48 s | ~10–11 min |
| 100 | 19 m 48 s | ~20–21 min |
| 200 | 39 m 48 s | ~40–41 min |

**A hardware caveat that cuts the other way, and is just as important.** `DEPLOYMENT.md:395-396` recommends "2 vCPU, 2 GB RAM" and notes that each Chromium session "wants ~500 MB". On the recommended box, N ≈ 2. The 20-minute figure at N = 100 therefore assumes a machine roughly 25× the documented spec (~51 GB RAM by that formula), and no such machine is described anywhere in the repo. So the architecture is bounded from two directions at once: **RAM caps how many numbers one box can hold, and the 12-second stagger caps how fast it can bring them back.** Neither bound is mitigated, and there is no sharding, no second backend instance, and no way to have one — the single-instance constraint at `DEPLOYMENT.md:38` forbids it.

Plan limits set the per-customer multiplier: Creator 1, Studio 2, Studio+ 5, Enterprise unlimited (`entitlements.js:98`, `:103`, `:108`, `:114`), with a hard ceiling of 5 per platform per workspace enforced at `server.js:5060`. So N grows at roughly 1–5 rows per paying customer.

---

### 19.6.4 What is actually unavailable during the window

| Capability | State during the window | Where |
|---|---|---|
| Inbound WhatsApp messages | Not received. The `message` handler only exists on a live client (`whatsapp-service.js:299`). Recovery depends entirely on the missed-message sync — see §19.6.5 | `whatsapp-service.js:299-493` |
| Outbound send (lead reply) | `sendMessage` throws `'WhatsApp not connected'` when no instance is ready; the endpoint returns **HTTP 500** with that string as the error body | `whatsapp-service.js:1481-1485`, `server.js:1884-1908` |
| Outbound send (`POST /api/whatsapp/send`) | Same 500 | `server.js:3185-3192` |
| Voice notes / media send | Same guard, same failure | `whatsapp-service.js:728`, `:735` |
| Automated client messages (Media Studio, Booking, Print Store, Contracts) | Same — they use injected `sendMessage` seams | `server.js:6343`, `:6457`, `:6500` |
| Auto-replies | Not sent — `checkAutoReply` only runs from the inbound handler | `whatsapp-service.js:1334` |
| WhatsApp page status | `GET /api/whatsapp/status` returns `{ status: 'not_initialized', isReady: false }` for any account whose instance is not yet in the map | `whatsapp-service.js:1433-1437` |
| What the customer sees | A **red "Disconnected"** chip, and `isError === true`, which surfaces the retry CTA | `wappflow-web/src/app/whatsapp/page.js:80`, `:89` |
| Reminders | Any reminder due inside the restart gap is **silently lost forever** — the cron selects a two-minute window and nothing marks a reminder as fired (cross-ref §17) | `server.js:3999-4009` |
| SSE / real-time | All `/api/events` connections drop and the browser `EventSource` reconnects | `wappflow-web/src/components/shell/realtime.js:63` |

The customer-visible summary: for up to 12·N seconds after every deploy, a studio's WhatsApp page says **Disconnected in red**, their replies fail with a 500, and messages their clients send arrive nowhere.

---

### 19.6.5 The recovery path, and its two failure modes

When a session finally reaches `ready`, the handler schedules a catch-up (`whatsapp-service.js:260-275`):

```js
// Auto-sync any messages missed during downtime (wait 4s for connection to stabilise)
setTimeout(() => this.syncMissedMessages(), 4000);
```

`syncMissedMessages()` (`whatsapp-service.js:1209-1328`) reads the newest message timestamp for the owning workspace, converts it to epoch seconds, then scrapes the WhatsApp Web page's in-memory chat models for inbound messages newer than that watermark (`_collectMissedFromPage`, `whatsapp-service.js:1130-1206`), de-duplicating on `messages.wa_message_id`.

This is the **only** thing standing between a deploy and permanent message loss. Two problems:

**(a) It is one day old, and §17.7 says it had never worked.** The commit is dated 2026-08-24 and titled, verbatim, *"Fix missed-message sync, which had never once succeeded"* (`git log`). Everything the current code does — page-context scraping, backwards paging, the `NON_CONTENT_TYPES` filter, the `keyOf` id extraction — is a same-day rewrite. It is **PARTIAL**: the implementation is thorough and plainly written by someone who understood the failure, but it has one day of production exposure. Every deploy before 2026-08-24 lost every message that arrived during its window, with no record that it happened.

**(b) The watermark is per-workspace, not per-account.** The lookup joins `messages → leads` filtered by `workspace_id` only (`whatsapp-service.js:1216-1222`), and it does not filter `from_me`. Two consequences for a workspace with two numbers, which is the default Studio plan: whichever account becomes ready first imports up to "now" and advances the shared watermark, so the second account's sync computes `sinceSec ≈ now` and imports nothing — its own missed messages are silently skipped. An outbound message sent from the dashboard also advances the watermark past inbound messages that were never imported. The `messages` table does carry `platform_account_id` (written at `whatsapp-service.js:1302-1306`), so the per-account watermark is available; the query simply does not use it.

There is also **no boot-time retry**. If `client.initialize()` rejects — plausible when N Chromiums are launching on a memory-constrained box — the handler is explicit (`whatsapp-service.js:495-500`):

```js
this.status = 'error';
this.isReady = false;
// No auto-retry — user clicks "Reconnect WhatsApp" button which calls reconnect()
```

The exponential backoff at `whatsapp-service.js:569-589` (10s → 30s → 90s, then permanent `reconnect_failed`) is wired to the `disconnected` event and to heartbeat failure — **not** to the boot path. So a tenant whose session fails to come up during a deploy is offline until a human notices and clicks a button. That is the exact failure the 12-second stagger exists to prevent, which makes the stagger load-bearing rather than cosmetic.

One genuinely positive side effect, for honesty: `reconnectAttempts` is per-instance and starts at 0 in a fresh process, so a number that had exhausted its three retries and parked in `reconnect_failed` gets a free retry on every deploy.

---

### 19.6.6 Why the 12 seconds cannot simply be lowered — and why the number is still wrong

The comment above the loop states the rationale (`whatsapp-service.js:1384-1387`):

> Launching every account's Chromium at the same instant thrashes CPU/RAM and trips "browser is already running" races where a slow-to-start browser collides with a watchdog-triggered re-init. Spacing each launch ~12s apart lets every session reach QR/ready before the next.

The first half is well-evidenced. `_cleanLocks()` (`whatsapp-service.js:134-208`) exists solely to clean up after those races — killing Chromium processes whose `--user-data-dir` exactly matches this session's profile and deleting `SingletonLock` / `SingletonCookie` / `SingletonSocket` / `.lock` / `lockfile`. Its own comment calls it "the single most important reliability primitive." Cutting the stagger to zero re-creates the failure that primitive was written for, and per §19.6.5 a failed boot start is never retried.

The second half is **contradicted by the code's own constants**. 12 seconds does not let a session "reach QR/ready before the next" — the init watchdog budgets **60 seconds** for exactly that transition before declaring failure (`whatsapp-service.js:546-563`). At 12-second spacing, up to five Chromiums can legitimately be in `initializing` at once. So the stagger is simultaneously **too long for availability** (it is the entire blackout) and **too short for its stated purpose** (it does not serialize what it claims to serialize). Nothing in the repo records how 12 was chosen or measures whether it is enough. There is no boot log line reporting total time-to-all-connected; the only per-account evidence is scattered `console.log` lines.

---

### 19.6.7 The compounding problem: deploy frequency vs. upstream breakage

§17.7 warns that WhatsApp breakage from upstream is "a permanent maintenance tax, not a backlog item." The git history supports it: on **2026-08-24 alone**, 25 commits landed, four of them WhatsApp repairs — *"Fix missed-message sync, which had never once succeeded"*, *"Voice notes: stop sending a format WhatsApp always rejects"*, *"Stop asking WhatsApp for a chat model it can no longer build"*, *"Stop reporting a group edit as done when WhatsApp refused it."*

Each of those fixes reaches customers only through `deploy.sh`, and therefore only by taking every customer's WhatsApp offline for up to 12·N seconds. The loop closes badly: the component most likely to break is the one whose repair is most expensive to ship, and the cost scales with exactly the thing the business is trying to grow.

`DEPLOYMENT.md` makes the trap explicit without noticing it. Its documented remedy for *one* stuck account (`DEPLOYMENT.md:771-776`) is:

```bash
rm -rf /data/.wwebjs_auth/session-<account-slot>
pm2 restart wappflow-api
```

The prescribed fix for a single tenant's broken session is a restart that blacks out **every** tenant. (That snippet is also stale on its own terms: profiles are named `session-acct-<accountId>` — `whatsapp-service.js:1414` — not `session-<account-slot>`. The slot-based naming was the collision bug the account-id keying was introduced to fix.) Its maintenance section (`DEPLOYMENT.md:756-763`) lists the manual deploy sequence ending in `pm2 restart wappflow-api wappflow-web` and says nothing about WhatsApp downtime at all.

---

### 19.6.8 Things that make the window worse

**`execSync` on the event loop, N times per boot.** `_cleanLocks()` runs synchronously inside `initialize()` and shells out on the main thread: `pgrep -af …` with a 5-second timeout (`whatsapp-service.js:174`), `kill -9` per PID (`:189`), and a literal `execSync('sleep 0.5')` (`:192`); the Windows branch even spins a busy-wait loop (`:157`). Every one of the N staggered starts therefore freezes the entire API — HTTP, SSE, and SQLite writes — for at least half a second, and up to several seconds if `pgrep` is slow. The file itself knows better: the comment at `whatsapp-service.js:754` reads "never use execSync in a request path, it blocks the" event loop. The boot path was not held to the same rule.

**A panicking customer defeats the stagger.** During the window a tenant sees the red Disconnected state and a retry button. Clicking it calls `POST /api/whatsapp/reconnect` (`server.js:3167-3175`) → `WhatsAppManager.reconnect(accountId)`, which finds no instance in the map and calls `_startAccount` **immediately** (`whatsapp-service.js:1445-1454`), jumping the queue. `_startAccount` is idempotent within a process (`whatsapp-service.js:1409`), so the later scheduled timer becomes a no-op — but the launch itself is now concurrent with whatever the stagger was carefully spacing. With several impatient customers, the deploy degenerates into precisely the simultaneous-launch thrash the 12 seconds exists to prevent.

**The cross-tenant send hole is maximally live during this window.** §04 documents it: `getReadyService(accountId)` (now at `whatsapp-service.js:1464-1476`; §04's citation of `:1139-1150` predates a subsequent revision of the file) falls through to *any* ready instance in the process, and no `server.js` call site passes an `accountId`. That fallback only fires when the requested account is not ready — which is the *definition* of the deploy window. During those 12·N seconds most accounts are not ready and a few are, so this is the period in which workspace A's message is most likely to be delivered from workspace B's WhatsApp number. The deploy does not create the bug, but it maximizes the exposure, on a schedule.

**A mixed-version execution window.** `git pull` (`deploy.sh:20`) and `npm install --omit=dev` (`deploy.sh:27`) rewrite `backend/*.js` and `backend/node_modules` while the old process is still serving traffic, and the restart does not happen until after the frontend build — typically minutes later. Most backend requires are resolved at boot, but at least one is lazy: `whatsapp-service.js:636` does `require('./ai-engine')` inside `_maybeAutoAnalyze`, called on lead creation. An inbound message in that window on an auto-analyze workspace loads the **new** `ai-engine.js` into the **old** process. The window is narrow and the blast radius small, but it is real mixed-version execution and nothing guards it.

**No graceful shutdown at all.** `grep` for `SIGTERM`/`SIGINT` across `backend/` returns nothing; the only process handlers are `unhandledRejection` and `uncaughtException` (`server.js:26-31`), both of which deliberately keep the process alive. So `pm2 restart` kills Node with no chance to `destroy()` the N Chromium browsers, no chance to flush anything, and no chance to tell connected clients why. Orphaned Chromiums and stale `SingletonLock` files are cleaned up *after the fact*, on the next boot, by `_cleanLocks()` — which is why that function is load-bearing and why it is on the event loop.

---

### 19.6.9 What does not exist

Searching the repository for `blue-green`, `zero-downtime`, `drain`, and `graceful` returns only Media Studio job-queue drains and unrelated prose. Specifically, **none of the following exist anywhere in the codebase or the docs**:

* Any second backend instance, load balancer, or connection drain. The single-instance constraint (`DEPLOYMENT.md:38`) rules it out by construction.
* Any way to restart or hot-reload one tenant's WhatsApp session without restarting the process. The per-account `connect`/`disconnect`/`reconnect` endpoints (`server.js:3144-3165`) restart a *session*, not the code — they cannot deploy a fix.
* Any pre-deploy notice, maintenance banner, or status page. Customers discover the outage by seeing a red chip.
* Any post-deploy verification that all N sessions came back. `DEPLOY-CHECKS.md` is a careful 5-section manual checklist covering the membership backfill, chat authorization, real-time, notifications and search — and it contains **no item for WhatsApp reconnection**.
* Any metric, log line, or DB row recording blackout duration or per-account time-to-ready.
* Any queueing of outbound sends attempted while disconnected. `outbound_message_queue` exists as a table and is documented in `DEPLOYMENT.md`, but §17/`wappflow-findings` records it as dead — the send path throws rather than enqueues (`whatsapp-service.js:1483`).

---

### 19.6.10 Maturity classification

| Thing | Verdict | Named gap |
|---|---|---|
| `deploy.sh` as a deploy mechanism | **SHIPPED** | Works, is idempotent, and its atomic `.next` swap genuinely prevents a bad build going live |
| Backend deploy without customer impact | **SOLD-NOT-BUILT** | No drain, no blue-green, no per-tenant restart. Every backend deploy is a full WhatsApp outage; nothing in the product or docs acknowledges it |
| Staggered WhatsApp boot | **PARTIAL** | Prevents launch thrash, but 12 s is unjustified against the code's own 60 s watchdog, uncapped, and applied to dead rows as well as live ones |
| Missed-message recovery after a restart | **PARTIAL** | One day old (2026-08-24); per-workspace watermark silently skips the second account in a multi-number workspace |
| Post-deploy WhatsApp verification | **STUB** | `DEPLOY-CHECKS.md` exists and is thorough about everything except the component most likely to break |
| Graceful shutdown | **SOLD-NOT-BUILT** | No signal handler exists; N Chromiums are killed mid-flight every deploy |
| Outbound send during downtime | **STUB** | Throws a 500; the queue table that would fix it is dead code |

---

### 19.6.11 Bugs, risks and smells found while researching this

1. **`loadAccounts` starts disconnected and abandoned accounts.** No `status` filter at `whatsapp-service.js:1382`. Churned and never-scanned rows each burn a 12-second slot and launch a Chromium, inflating the blackout for paying customers and wasting ~500 MB apiece. *Data-integrity adjacent:* nothing prunes `platform_accounts` on churn or downgrade.
2. **Per-workspace missed-message watermark.** `whatsapp-service.js:1216-1222` filters on `workspace_id` and ignores both `platform_account_id` and `from_me`. In a two-number workspace the second account to become ready imports nothing. **Message loss, silent, no error surfaced.**
3. **`execSync` on the event loop in the boot path.** `whatsapp-service.js:174`, `:189`, `:192` (and the busy-wait at `:157`) stall the whole API once per account start, contradicting the file's own rule at `:754`.
4. **No boot-time init retry.** `whatsapp-service.js:495-500` leaves a failed start permanently in `error` with no reschedule; the backoff at `:569-589` never covers this path. A tenant can stay offline indefinitely after a deploy with no alert.
5. **Customer-triggered stagger bypass.** `whatsapp-service.js:1445-1454` starts an account immediately on manual reconnect, defeating the spacing precisely when spacing matters most.
6. **Cross-tenant send fallback peaks during deploys.** `whatsapp-service.js:1464-1476` plus zero `accountId`-passing call sites. Already documented in §04 as the section's most serious defect; this addendum adds that the deploy window is its highest-probability trigger.
7. **Unstable queue order.** `ORDER BY slot_index ASC` across tenants is not a total order; ties resolve arbitrarily, so a tenant's blackout duration varies deploy to deploy with nothing controlling it.
8. **Mixed-version window.** `deploy.sh:20`/`:27` mutate the running process's source tree and `node_modules` minutes before the restart; the lazy `require('./ai-engine')` at `whatsapp-service.js:636` can cross the version boundary.
9. **Reminder loss on every restart.** `server.js:3999-4009` selects a two-minute window and never marks a reminder as fired; a restart inside that window drops it permanently. Already in §17 — noted here because **every deploy triggers it deterministically**, which §17 does not say.
10. **Stale runbook path.** `DEPLOYMENT.md:773` tells operators to `rm -rf /data/.wwebjs_auth/session-<account-slot>`; the code writes `session-acct-<accountId>` (`whatsapp-service.js:1414`). Following the doc deletes nothing, or the wrong thing.
11. **The documented single-tenant remedy is a global outage.** `DEPLOYMENT.md:774` prescribes `pm2 restart wappflow-api` to fix one broken session.

---

### 19.6.12 What could not be determined

* **UNKNOWN: N in production.** The number of `platform_accounts` rows with `platform='whatsapp'` on the live host cannot be read from the repository. §04 already records that it is unknown whether *any* workspace runs more than one number. Every duration in §19.6.3 is therefore a formula applied to a hypothetical N, not a measurement.
* **UNKNOWN: real time-to-`ready` per session.** Bounded above by the 60-second watchdog, but no telemetry, log line, or benchmark records the actual distribution. The `+ T_init` term in the formula is a bound, not a number.
* **UNKNOWN: the live host's actual RAM/CPU.** `DEPLOYMENT.md:395` recommends 2 vCPU / 2 GB, and memory notes record the live host as an OVH box at `/var/www/wappflow`, but the repository contains no evidence of its specification. Whether the box could even hold N = 50 Chromiums is undetermined.
* **UNKNOWN: real deploy frequency.** 25 commits landed on 2026-08-24, but commits are not deploys — `deploy.sh` is run manually and leaves no artifact in the repo. How many of those 25 became separate restarts, versus one batched deploy, cannot be recovered from the code.
* **UNKNOWN: whether customers have ever noticed.** No status page, no incident log, no support-ticket record exists in the repository.
