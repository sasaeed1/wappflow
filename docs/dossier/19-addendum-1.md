## Addendum 1 — Backup, restore and disaster recovery

### Why this needs its own section

Section 17.8 of this dossier disposes of backups in two sentences: a shell cron in `DEPLOYMENT.md`,
plus "UNKNOWN whether that cron is installed." That framing is too generous, and it is also slightly
unfair to the script. The truth is more specific and more actionable, and an analyst pricing an SLA,
underwriting insurance, selling to an enterprise buyer, or diligencing an acquisition cannot work from
"unknown."

The stakes are unusual for a CRM. WappFlow does not merely hold contact records. It is the custodian of
**other people's wedding photographs** (Media Studio originals, `ms_assets`), of **legally executed
contracts with drawn signatures and IP/user-agent evidence trails** (`cs_documents`, `cs_signers`,
`cs_events`), and of **the entire WhatsApp conversation history** between a studio and its clients. A
photographer whose shoot originals are gone has lost a wedding that cannot be reshot. That is a
liability event, not a support ticket.

This addendum documents what the backup procedure actually covers, what the restore procedure actually
restores, and what the real Recovery Point Objective (RPO — how much data you lose) and Recovery Time
Objective (RTO — how long you are down) are. Everything below is read out of the code and the committed
deployment guide; where they disagree, the code wins.

---

### 1. The real persistence inventory

The backend resolves two identical constants at boot — `DATA_DIR` (`backend/server.js:38`, used for the
database) and `DATA_ROOT` (`backend/server.js:61`, used for the upload tree) — both defaulting to `/data`
when `NODE_ENV=production`. Section 14 covers this seam. What matters here is the **complete** list of
what lives under it, because the deployment guide's own list is incomplete.

| Path under `/data` | Written by | Referenced from the DB by | Regenerable? |
|---|---|---|---|
| `wappflow.db` (+ `-wal`, `-shm`) | `server.js:41` | — | **No** |
| `uploads/images`, `uploads/videos`, `uploads/voices`, `uploads/files` | `whatsapp-service.js:415-450` (inbound WhatsApp media) | `messages.media_url` | **No** |
| `uploads/avatars/*` | `server.js:1542` | `users.profile_picture` | No (cosmetic) |
| `uploads/logos/*` | `server.js:1621` | `company_settings.company_logo` | No (cosmetic) |
| `uploads/<file>` (bare root) | `server.js:2510` (outbound lead media), `server.js:3433` (team-chat attachments), `server.js:4341` (AI knowledge-base documents) | `messages.media_url`, `chat_messages.media_url` | **No** |
| `uploads/media/<basename>` | `media-studio.js:615-631` | `ms_assets.storage_key` | **No — these are the client originals** |
| `uploads/media/variants/<id>-{thumb,web,poster}.jpg`, `<id>-proxy.mp4` | `media-worker.js:248-254, 692, 708` | `ms_assets.variants` JSON | Yes, from originals |
| `uploads/media/edits/<id>-r<rev>-{full,web,thumb}.jpg` | `media-worker.js:447-457` | `ms_assets.variants.full_edit` | Yes, from originals + stored edit params |
| `uploads/media/wm-<id>.jpg` (watermarked) | `media-studio.js:705-710` | `ms_assets.variants.watermarked` | Yes |
| `uploads/media/exports/<exportId>.zip` | `media-worker.js:517-545` | `ms_exports.storage_key` | Only if originals survive |
| `uploads/media/exports/album-<albumId>.pdf` | `media-worker.js:585-587` | `ms_albums.pdf_storage_key` | Only if originals survive |
| `uploads/media/exports/<exportId>.mp4` (rendered reels) | `media-worker.js:800-802` | `ms_video_exports` | Only if source media survives |
| `uploads/media/luts/custom/*` | `media-studio.js:2181-2182` | `ms_luts.storage_key` | **No** (customer-uploaded colour grades) |
| `uploads/media/tmp/*` | `media-worker.js:56-57` | — | Yes (scratch) |
| `uploads/cs/*` — client-uploaded contract attachments, workspace letterheads, and `signed-<docId>.pdf` | `contracts-studio.js:120-129, 404, 435, 836, 856` | `cs_documents.settings` JSON (`upload.url`, `signed_pdf`), `cs_settings.letterhead_url` | **No** |
| `.wwebjs_auth/session-acct-<accountId>/` | `whatsapp-service.js:226` via `LocalAuth` | `platform_accounts` rows (`whatsapp-service.js:1381`) | Only by re-scanning a QR on every tenant's phone |

Two clarifications the code forces:

* **Drawn signatures are not files.** `cs_signers.signature_data` (`contracts-studio.js:164`) stores the
  signature as a `data:image/...;base64` string *inside the database* (`contracts-studio.js:1044-1051`),
  which the PDF generator decodes at render time (`contracts-studio.js:422`). So signatures survive a
  database-only restore; the executed PDF under `uploads/cs/` does not.
* **`uploads/audit/`** exists in the working tree but is produced by `backend/_audit_setup.js:72`, a local
  scratch helper explicitly `.gitignore`d at repo root. It is not production state.

---

### 2. The documented backup, read literally

`DEPLOYMENT.md:666-706` (§12) opens with a "**What must persist** (the backend writes here, losing it =
losing data)" tree at `:668-684`. That tree lists `uploads/{voices,images,videos,files,logos,avatars}`
and **omits `uploads/media/` and `uploads/cs/` entirely** — the whole of Media Studio and the whole of
Contracts Studio. It is a tree that was accurate before those two modules existed and was never revised.

The script itself (`DEPLOYMENT.md:690-704`, installed as `/etc/cron.daily/wappflow-backup`) is better than
the tree above it. Verbatim behaviour:

1. `set -e`
2. `sqlite3 /data/wappflow.db ".backup $DEST/wappflow-$TODAY.db"` — a genuine SQLite online-backup-API
   snapshot, which **is** internally consistent against a live WAL database. This part is correct.
3. `tar czf $DEST/uploads-$TODAY.tar.gz -C /data uploads` — this tars the **whole** `uploads` tree, so it
   does in fact capture `media/` and `cs/`. **§17.8 of this dossier understates the script here.**
4. `find $DEST -type f -mtime +14 -delete` — 14-day retention.
5. `DEST=/var/backups/wappflow`.

What the script does **not** do:

* **It never touches `.wwebjs_auth/`.** The deployment guide's own "losing it = losing data" tree lists
  `.wwebjs_auth/session-*/` at `:682-683`, and then the backup below it silently excludes it.
* **It is not atomic across the two artefacts.** The DB is snapshotted at T0 and the uploads tar is written
  from T0+seconds to T0+minutes. The harmless direction is a file created after T0 (an orphan in the tar,
  wasted bytes). The harmful direction is a file **deleted** between T0 and the tar — the restored DB has a
  live `ms_assets` row whose file is absent from both the tar and the disk. `media-studio.js:950` runs
  `purgeExpiredTrash()` unconditionally on every boot, hard-deleting rows *and* unlinking files
  (`media-studio.js:920-932`), so deletions during the window are a real event, not a hypothetical.
* **`DEST` is on the same machine as `/data`.** There is no off-host copy anywhere in the repository. Host
  loss, volume loss, or ransomware takes the primary and the backup together.
* **Nothing verifies a backup.** No checksum, no `PRAGMA integrity_check`, no test restore, no size floor,
  no success notification. `set -e` means a failure aborts silently into cron's mail spool.
* **`sqlite3` — the CLI — may not exist on the host.** `backend/package.json` depends on `better-sqlite3`,
  a native Node module that ships no CLI. `DEPLOYMENT.md:403-416` installs `curl git build-essential nginx
  ufw`, Node 20, Chromium libs, ffmpeg and pm2 — **not** `sqlite3`. The guide later assumes the binary
  exists (`DEPLOYMENT.md:842-843`), but never installs it. If it is absent, `set -e` aborts at step 2 and
  **the uploads tar is never written either** — a total, silent backup failure.
* **`deploy.sh` takes no pre-deploy snapshot.** It pulls, installs, builds and `pm2 restart`s
  (`deploy.sh:17-49`). Every boot re-runs the whole schema installer, including guarded `ALTER`s and
  `entitlements.js:203-212`, which `DELETE FROM plans / plan_limits / plan_features / plan_prices` and
  reseed whenever the current default plan key is absent. A schema change ships with no rollback point.

The only other backup mechanism mentioned anywhere is one line at `DEPLOYMENT.md:706`: "For Railway: enable
Volume Backups." Production is not on Railway.

---

### 3. The documented restore, and why it does not restore the product

`DEPLOYMENT.md:708-717` is four commands: `pm2 stop`, `cp` the `.db` back, `rm` the `-wal`/`-shm`
sidecars, `pm2 start`. It **never untars `uploads-$TODAY.tar.gz`** and never mentions `.wwebjs_auth`.

Following the documented procedure exactly yields a database full of asset rows pointing at files that are
not there. The application has no idea. Concretely:

* **The API reports success.** `shapeAsset()` (`media-studio.js:363-372`) composes `url` and `thumb_url`
  from the `variants` JSON or `publicUrl(storage_key)` with **no existence check**. Gallery and project
  endpoints return HTTP 200 with a full asset list; the browser then 404s on each image individually. A
  studio owner sees a grid of broken thumbnails and a working UI insisting the photos are there.
* **Re-exporting silently produces a truncated deliverable.** The export worker skips missing files —
  `if (!fs.existsSync(abs)) continue;` (`media-worker.js:528`) — then records `file_count` from what it
  actually added (`media-worker.js:533-535`) and marks the export `ready`. A client download that should
  contain 800 photos succeeds with 0.
* **Album PDFs render grey rectangles.** `media-worker.js:605` returns from the slot on a missing file,
  leaving the `#eef0f3` placeholder painted at `:599`. The PDF completes and is marked `pdf_status='ready'`.
* **Signed contract PDFs vanish, but the evidence survives.** `cs_documents.settings.signed_pdf`
  (`contracts-studio.js:1068`) points into `uploads/cs/`; the file is gone. The signature image, typed
  name, consent flag, IP, user-agent, timestamp and hash (`contracts-studio.js:1044-1056`) are all in the
  DB, so the PDF is in principle regenerable — but nothing in the codebase offers a regenerate action.
* **Storage analytics over-report.** `cc-storage.js:23-30` sums `ms_assets.storage_size` from the database,
  so the Command Center would confidently show terabytes that no longer exist on disk.
* **Team-chat attachments break across a hostname change.** `server.js:3433` stores
  `${BASE_URL}/uploads/<file>` — an **absolute** URL — into `chat_messages.media_url`. Restoring onto a new
  host leaves every historical chat attachment pointing at the old origin. Every other upload path stores a
  relative `/uploads/...` and is unaffected.

Even a *correct* restore (DB + untarred uploads) still omits the WhatsApp session store.

---

### 4. WhatsApp: the re-pair tax

`WhatsAppManager.loadAccounts()` (`whatsapp-service.js:1380-1392`) reads `platform_accounts WHERE platform
= 'whatsapp'` and starts one Chromium-backed `WhatsAppService` per row, keyed by `session-acct-<accountId>`
(`whatsapp-service.js:1408-1417`) under `LocalAuth({ dataPath: '/data/.wwebjs_auth' })`
(`whatsapp-service.js:226`). Note that this path is hardcoded and does **not** honour `DATA_DIR`, unlike
inbound media at `whatsapp-service.js:415` — a discrepancy §14 already flags.

Consequences for DR:

* Without `.wwebjs_auth`, the restored `platform_accounts` rows are orphaned credentials. **Every tenant
  must physically pick up their phone and scan a QR code** before a single message sends or arrives. For a
  multi-tenant host this is not a runbook step; it is a coordinated customer-support campaign.
* Startup is deliberately staggered 12 seconds per account (`whatsapp-service.js:1387-1391`) to avoid
  Chromium thrash. Even with sessions intact, RTO for the messaging spine is at least `12 × N` seconds
  plus per-session initialisation.
* Message *history* is in the database and survives. Continuity of the linked device does not.

Related state that is neither backed up nor under `/data`: `.wwebjs_cache/` (listed in
`backend/.gitignore`), which `whatsapp-web.js` writes relative to the process working directory because no
`webVersionCache` is configured in `whatsapp-service.js:225-241`. It is regenerable cache, so this is a
tidiness issue rather than a data one.

---

### 5. What the RPO and RTO actually are

| Asset class | RPO (data lost) | RTO (time down) | Basis |
|---|---|---|---|
| Database | up to ~24 h | minutes | `/etc/cron.daily` runs once daily; restore is a `cp` |
| Uploads (all modules) | up to ~24 h | **effectively ∞ as documented** | tar exists (`DEPLOYMENT.md:701`); restore procedure never extracts it |
| WhatsApp sessions | **total loss, always** | hours-to-days, gated on customers | not in the backup at all |
| Host / disk loss | **total loss of everything** | — | `DEST=/var/backups` is on the same machine |
| `.env` (incl. `JWT_SECRET`) | **total loss** | minutes, if the secret is recorded elsewhere | `backend/.gitignore` excludes `.env`; the backup script never touches it. A new `JWT_SECRET` invalidates every session — recoverable, but every user is logged out |
| nginx config, pm2 process list, TLS certs | **total loss** | hours | outside `/data`; not in any backup |

Retention is 14 days with no long-term or monthly tier, so a corruption discovered on day 15 is
unrecoverable. Note the interaction with the daily purge cron at `server.js:4039-4050`, which sweeps every
registered soft-delete bin past its 90-day window (`soft-delete.js:23`) — and, for media, unlinks the files
too. A record deleted 90 days ago is purged permanently and its last live copy expired from backups 76 days
earlier.

---

### 6. Mitigations that exist in the code — and why none of them help today

**The storage abstraction is real but not deployable.** `backend/storage/index.js:15-30` selects a provider
from `STORAGE_PROVIDER`, and `backend/storage/providers/r2.js` implements Cloudflare R2 over the AWS SDK
v3. Moving originals to R2 would give genuine off-host, replicated durability. Three blockers:

1. **`@aws-sdk/client-s3` is not a dependency.** It is absent from `backend/package.json` entirely — not in
   `dependencies`, not in `optionalDependencies` — and absent from `node_modules`. `r2.js:10` try-requires
   it and returns `null` on failure, so `storage/index.js:22-25` logs a warning and **silently falls back
   to local disk**. As shipped, `STORAGE_PROVIDER=r2` does nothing.
2. **Only Media Studio uses the abstraction.** `require('./storage')` appears in `media-studio.js:259`,
   `media-worker.js:91` and `server.js:6563`. Contracts (`contracts-studio.js:404` writes with raw `fs`),
   inbound WhatsApp media (`whatsapp-service.js:448`), avatars, logos, voice notes and knowledge documents
   all bypass it. R2 would cover one module.
3. **None of `DATA_DIR`, `STORAGE_PROVIDER` or `R2_*` appear in the deployment guide's environment table**
   (`DEPLOYMENT.md:311-330`), so an operator following the documentation would never find the lever.

**The workspace JSON export is a portability feature, not a backup.** `GET /api/workspace/export`
(`server.js:3016-3045`) emits leads, notes, reminders, contact history, messages, invoices, tags, bookings
and *summary* rows for contracts, media projects and galleries. It exports **no files**, and it exports
contracts and media as id/title/status only — no blocks, no signatures, no asset rows. Useful for GDPR
portability; useless for recovery.

**Soft-delete bins are not backups.** `soft-delete.js` gives 90-day recoverability for user error
(`soft-delete.js:23`), which is a different failure mode from media loss and is itself erased by the purge
cron.

---

### 7. Maturity classification

| Capability | Status | Named gap |
|---|---|---|
| Database backup | **PARTIAL** | Correct `.backup` snapshot, but daily, unverified, same-host, 14-day, and dependent on an uninstalled `sqlite3` CLI |
| Uploads backup | **PARTIAL** | The tar is correct and complete; the guide's own inventory omits two modules and the restore never extracts it |
| Restore procedure | **STUB** | Documented at `DEPLOYMENT.md:708-717`; restores only the `.db`, producing a silently broken product |
| WhatsApp session backup | **SOLD-NOT-BUILT** | `DEPLOYMENT.md:682-683` declares the session store critical; nothing backs it up |
| Off-site / off-host copy | **SOLD-NOT-BUILT** | No implementation anywhere in the repo |
| Backup verification / restore drill | **SOLD-NOT-BUILT** | No checksum, no test restore, no alert |
| Point-in-time recovery | **SOLD-NOT-BUILT** | No WAL archiving; no `wal_checkpoint` call exists in the codebase |
| Provider-level durability (R2) | **PARTIAL** | Code is complete and tested (`backend/test-storage.js`); SDK not installed, one module wired, undocumented |
| Command Center "backups" monitoring | **SOLD-NOT-BUILT** | `COMMAND-CENTER-SPEC.md` §20 promises it; §13 of this dossier confirms no page and no endpoint |

---

### 8. Bugs, risks and smells found while researching this

1. **The restore procedure is wrong, not merely incomplete** (`DEPLOYMENT.md:708-717`). An operator
   following it in an outage will believe they have recovered. Highest-severity item in this addendum.
2. **`set -e` turns a missing `sqlite3` binary into a total silent backup failure** — the uploads tar is
   never reached. The failure surface is cron mail nobody reads.
3. **The application cannot detect a DB/file mismatch.** No route calls `storage.fileExists()` on read;
   `media-studio.js:566` is the only existence check, and it guards a presigned-upload completion. There is
   no integrity sweep, no "N assets missing files" health metric.
4. **Silent truncation on export** (`media-worker.js:528`, `:605`) — missing sources are skipped and the
   export is still marked `ready`. Under normal operation this masks disk problems; after a partial restore
   it ships a corrupt deliverable to a paying client.
5. **`chat_messages.media_url` bakes `BASE_URL` into stored rows** (`server.js:3433`), breaking on any host
   or domain change. Inconsistent with every other upload path.
6. **`purgeExpiredTrash()` runs unconditionally at boot** (`media-studio.js:950`), hard-deleting rows and
   unlinking files with no dry-run, no audit gate and no backup precondition.
7. **`entitlements.js:203-212` deletes and reseeds the entire plan catalogue** whenever the default plan key
   is missing — a boot-time destructive write to billing configuration, with no snapshot taken by
   `deploy.sh`.
8. **The backup contains everything in plaintext.** No encryption at rest exists anywhere in the codebase
   (no `createCipheriv`, no `ENCRYPTION_KEY`). `/var/backups/wappflow/*.db` is a world-readable-by-root copy
   of bcrypt password hashes, `google_calendar_refresh_token` (`server.js:865`), gallery capability tokens
   (`ms_gallery_access.access_token`, `media-studio.js:1314-1320`), every client's contact details and every drawn
   signature. The backup directory has a materially larger blast radius than the app.
9. **`.wwebjs_auth` ignores `DATA_DIR`** (`whatsapp-service.js:139, 226` vs `:415`), so a
   `DATA_DIR`-relocated deployment scatters state across two roots — and any backup written against
   `DATA_DIR` would miss the sessions by construction.

---

### 9. What could not be determined

* **UNKNOWN: whether `/etc/cron.daily/wappflow-backup` is installed on the production host.** It exists
  only as a fenced code block in `DEPLOYMENT.md`; there is no copy of it in the repository, no installer
  in `deploy.sh`, and no host access from here.
* **UNKNOWN: whether `sqlite3` (the CLI) is installed on production.** The guide neither installs it nor
  flags the dependency.
* **UNKNOWN: whether `/data` and `/var` are separate block devices on the OVH host.** They are certainly
  on the same machine, so host loss is total regardless; disk-level independence would only mitigate a
  single-volume failure.
* **UNKNOWN: whether any restore has ever been performed or rehearsed.** No runbook artefact, no drill log,
  no `scripts/verify-*` harness covers restore.
* **UNKNOWN: current production data volume** (`ms_assets` count / total `storage_size`), which would set
  the real tar duration and therefore the width of the non-atomic window. The dev tree's `uploads/` is
  empty apart from `uploads/audit/` fixtures.
* **UNKNOWN: whether Railway Volume Backups were ever enabled historically**, and whether any artefact from
  that era still exists. Production has since moved to OVH.
