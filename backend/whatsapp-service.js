const { Client, LocalAuth, MessageMedia, GroupChat, PrivateChat } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const { execSync, execFile } = require('child_process');
const qrcode = require('qrcode');
const { describeWaError, isPageContextGone } = require('./wa-errors');

// Write a downloaded WhatsApp media payload to disk and return the URL the app
// serves it from (`/uploads/<subdir>/<file>`, matching the express.static mount
// in server.js), or null if there was nothing to write.
//
// This exists because the media download used to live inline in the live message
// handler only. The two SYNC importers wrote `media_type` but no `media_url`, so
// an imported photo rendered as the literal text "[Image]" — and since the live
// handler skips anything whose wa_message_id it has already seen, the media-less
// row could never be repaired afterwards. Both importers now call this too.
function persistWaMedia(media, mediaType) {
  if (!media || !media.data) return null;
  const uploadsBase = path.join(
    process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : __dirname),
    'uploads'
  );
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8); // history imports land in the same millisecond
  const mime = media.mimetype || '';
  let subDir, filename;

  if (mediaType === 'voice') {
    const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'mp4' : mime.includes('mpeg') ? 'mp3' : 'ogg';
    subDir = 'voices';
    filename = `voice-${ts}-${rand}.${ext}`;
  } else if (mediaType === 'image') {
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
    subDir = 'images';
    filename = `img-${ts}-${rand}.${ext}`;
  } else if (mediaType === 'video') {
    const ext = mime.includes('webm') ? 'webm' : 'mp4';
    subDir = 'videos';
    filename = `video-${ts}-${rand}.${ext}`;
  } else {
    const origName = media.filename || `file-${ts}`;
    const ext = origName.includes('.') ? origName.split('.').pop() : 'bin';
    const safeName = origName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    subDir = 'files';
    filename = `${ts}-${rand}-${safeName}`;
    if (!filename.includes('.')) filename += `.${ext}`;
  }

  const dir = path.join(uploadsBase, subDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), Buffer.from(media.data, 'base64'));
  return `/uploads/${subDir}/${filename}`;
}

// The media kind we store, derived from whatsapp-web.js's message type.
function waMediaType(type) {
  if (type === 'ptt' || type === 'audio') return 'voice';
  if (type === 'image' || type === 'sticker') return 'image';
  if (type === 'video') return 'video';
  return 'media';
}

class WhatsAppService {
  constructor(db, broadcastToUser, accountId = null, sessionName = undefined, broadcastToWorkspace = null, notify = null) {
    this.db = db;
    this.broadcastToUser = broadcastToUser || (() => {});
    // Phase 5: inbound WhatsApp activity used to reach the workspace OWNER only,
    // so a teammate's dashboard never moved when a message arrived. Everything
    // here is workspace-visible data, so it fans out to the workspace.
    this.broadcastToWorkspace = broadcastToWorkspace || null;
    // WhatsApp is the busiest lead source and was the only one writing NO feed row,
    // so the bell counted leads it could never mark as read.
    this.notify = notify || (() => {});
    this.accountId = accountId;  // platform_accounts.id for this session
    this.sessionName = sessionName; // LocalAuth clientId (undefined = legacy session)
    this.client = null;
    this.qrCode = null;
    this.qrTimestamp = null; // ms epoch when QR was last refreshed
    this._status = 'disconnected';  // backing field for the status accessor below
    this.isReady = false;
    this.phoneNumber = null;
    this.processedMessages = new Set();
    // Reliability — auto-reconnect & heartbeat
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.heartbeatFailCount = 0;
    this.userLoggedOut = false; // set true on intentional logout — prevents auto-reconnect loops
    // Init watchdog — if status stays in `initializing` too long, surface as `error`
    this.initWatchdogTimer = null;
    this.initStartedAt = null;
    this.browserPid = null; // tracked puppeteer chrome PID, set in initialize()
  }

  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ── Resolve the owning workspace for THIS WhatsApp account ──
  // Multi-tenant correctness: an inbound message must create its lead in the
  // workspace whose connected account received it — NOT "the oldest user".
  // Returns { id, workspace_id } (a user row), or null.
  // Connection status is an ACCESSOR so that every transition pushes a frame.
  // Nothing ever broadcast these, which is the only reason the WhatsApp page
  // polled /status every 2 seconds and settings every 5 — forever, on every
  // open tab. Assignments elsewhere in this file are unchanged; they now emit.
  get status() { return this._status; }
  set status(next) {
    const prev = this._status;
    this._status = next;
    if (prev === undefined || prev === next || !this.broadcastToWorkspace) return;
    try {
      const user = this._resolveOwner();
      if (user && user.workspace_id) {
        this.broadcastToWorkspace(user.workspace_id, 'whatsapp_status', {
          account_id: this.accountId || null,
          status: next,
          phone: this.phoneNumber || null,
          has_qr: !!this.qrCode,
        });
      }
    } catch { /* status push is best-effort; never break the session */ }
  }

  // Fan an inbound-WhatsApp event to the whole workspace when we can, falling
  // back to the resolved owner if no workspace broadcaster was injected.
  _emit(user, type, data) {
    if (!user) return;
    if (this.broadcastToWorkspace && user.workspace_id) return this.broadcastToWorkspace(user.workspace_id, type, data);
    this.broadcastToUser(user.id, type, data);
  }

  // WhatsApp JID kinds we must never turn into leads.
  //   @newsletter  → Channels (one-way broadcast feeds you follow)
  //   status@broadcast / @broadcast → Status updates and broadcast lists
  // Channels were being ingested as leads: every channel you follow became a
  // customer, and its posts became their messages.
  static isIngestableChat(jid, chat) {
    const id = String(jid || '');
    if (!id) return false;
    if (id.includes('@newsletter')) return false;
    if (id.includes('broadcast')) return false;
    // Newer whatsapp-web.js exposes these directly; trust them when present.
    if (chat && (chat.isChannel === true || chat.isNewsletter === true || chat.isBroadcast === true)) return false;
    return true;
  }

  // WhatsApp Web's message key used to expose `_serialized`; current builds ship it
  // under a minified name instead (`$1` today, something else after the next deploy),
  // so `id._serialized` silently reads undefined and every wa_message_id lands NULL —
  // which quietly disables duplicate detection. Read the field when it's there, then
  // fall back to any own value already in serialized form, then rebuild it from parts.
  static waMessageKey(id) {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (typeof id._serialized === 'string' && id._serialized) return id._serialized;
    for (const value of Object.values(id)) {
      if (typeof value === 'string' && /^(true|false)_[^_]+_.+/.test(value)) return value;
    }
    if (id.id && id.remote) {
      const remote = typeof id.remote === 'string' ? id.remote : (id.remote._serialized || '');
      if (remote) return `${!!id.fromMe}_${remote}_${id.id}${id.participant ? `_${id.participant}` : ''}`;
    }
    return null;
  }

  _resolveOwner() {
    if (this.accountId) {
      try {
        const acct = this.db.prepare('SELECT workspace_id FROM platform_accounts WHERE id = ?').get(this.accountId);
        if (acct && acct.workspace_id) {
          const owner = this.db.prepare(
            'SELECT id, workspace_id FROM users WHERE workspace_id = ? ORDER BY created_at ASC LIMIT 1'
          ).get(acct.workspace_id);
          if (owner) return owner;
        }
      } catch (e) { console.log('⚠️ _resolveOwner lookup failed:', e.message); }
    }
    // Legacy session (no accountId). Attributing to "the oldest user" is only
    // correct in a single-tenant install — the moment a second workspace exists,
    // that rule files EVERY inbound message into the first signup's CRM,
    // whichever number actually received it. Refuse instead of guessing wrong.
    const workspaces = this.db.prepare('SELECT id FROM workspaces LIMIT 2').all();
    if (workspaces.length > 1) {
      if (!this._warnedNoOwner) {
        this._warnedNoOwner = true;
        console.error(
          '❌ WhatsApp session has no platform_account and this install has multiple workspaces — ' +
          'refusing to attribute inbound messages, which would file them under the wrong studio. ' +
          'Connect this number through Settings so it gets a platform_accounts row.'
        );
      }
      return null;
    }
    return this.db.prepare(
      `SELECT u.id, u.workspace_id FROM users u WHERE u.workspace_id IS NOT NULL ORDER BY u.created_at ASC LIMIT 1`
    ).get() || null;
  }

  // ── Kill orphaned Chromium processes using our profile, then remove lock files ──
  // This is the single most important reliability primitive — when a previous Chrome
  // session lingers (Singleton lock held, zombie process), the next initialize() will
  // hang forever in 'initializing'. We aggressively clear that state here.
  _cleanLocks() {
    const authBase2 = process.env.NODE_ENV === 'production' ? '/data/.wwebjs_auth' : './.wwebjs_auth';
    const sessionDir = this.sessionName ? `session-${this.sessionName}` : 'session';
    const profilePath = `${authBase2}/${sessionDir}`;

    // Windows: kill orphaned Chromium processes via wmic/taskkill (legacy session only)
    if (process.platform === 'win32' && !this.sessionName) {
      try {
        const out = execSync(
          `wmic process where "name='chrome.exe' and commandline like '%wwebjs_auth%'" get processid /format:value 2>nul`,
          { shell: 'cmd.exe', timeout: 6000 }
        ).toString();
        const pids = [...out.matchAll(/ProcessId=(\d+)/gi)].map(m => m[1]);
        if (pids.length > 0) {
          console.log(`🔫 Killing ${pids.length} orphaned Chromium process(es): ${pids.join(', ')}`);
          for (const pid of pids) {
            try { execSync(`taskkill /F /T /PID ${pid}`, { shell: 'cmd.exe', timeout: 3000 }); } catch {}
          }
          const end = Date.now() + 1000;
          while (Date.now() < end) {}
          console.log('✅ Orphaned Chromium processes killed');
        }
      } catch (e) {
        console.log('⚠️ Could not check for orphaned Chrome processes:', e.message);
      }
    }

    // Linux: find any chromium/chrome processes whose --user-data-dir matches OUR profile
    // (so we don't kill other sessions' Chromes). Uses pgrep -af.
    if (process.platform !== 'win32') {
      try {
        // pgrep gives candidate PIDs, but its substring match is unsafe here:
        // 'session' is a PREFIX of 'session-wf-1', so cleaning the legacy/slot-0
        // session would otherwise kill every other account's Chromium too.
        // So we re-read each candidate's /proc/PID/cmdline and keep ONLY the
        // processes whose --user-data-dir arg EXACTLY equals our profile.
        const out = execSync(`pgrep -af "user-data-dir=${profilePath}" || true`, { timeout: 5000 }).toString();
        const candidates = out.split('\n').map(l => l.trim()).filter(Boolean)
          .map(l => l.split(/\s+/)[0]).filter(Boolean);
        const pids = [];
        for (const pid of candidates) {
          try {
            const args = fs.readFileSync(`/proc/${pid}/cmdline`).toString().split('\0');
            if (args.includes(`--user-data-dir=${profilePath}`)) pids.push(pid);
          } catch { /* process already gone or unreadable — skip */ }
        }
        // Also include the tracked browserPid if it's not already in the list
        if (this.browserPid && !pids.includes(String(this.browserPid))) pids.push(String(this.browserPid));
        if (pids.length > 0) {
          console.log(`🔫 Killing ${pids.length} lingering Chromium PID(s) for ${sessionDir}: ${pids.join(', ')}`);
          for (const pid of pids) {
            try { execSync(`kill -9 ${pid} 2>/dev/null || true`, { timeout: 2000 }); } catch {}
          }
          // Give kernel a moment to reap the processes before we touch the profile dir
          execSync('sleep 0.5');
        }
      } catch (e) {
        console.log('⚠️ Linux Chromium cleanup skipped:', e.message);
      }
      this.browserPid = null;
    }

    // Remove lock files (covers Singleton* on all platforms + Linux-specific .lock)
    for (const p of [
      `${profilePath}/SingletonLock`,
      `${profilePath}/SingletonCookie`,
      `${profilePath}/SingletonSocket`,
      `${profilePath}/.lock`,
      `${profilePath}/lockfile`,
    ]) {
      try { if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`🔓 Removed stale lock: ${p}`); } } catch {}
    }
  }

  // ── Start a fresh WhatsApp client ──
  // NEVER destroys an existing client — caller must call reconnect() if one is running
  initialize() {
    this.status = 'initializing';
    this.isReady = false;
    this.qrCode = null;
    this.qrTimestamp = null;
    this.initStartedAt = Date.now();
    this._startInitWatchdog();

    this._cleanLocks();

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: process.env.NODE_ENV === 'production' ? '/data/.wwebjs_auth' : './.wwebjs_auth',
        ...(this.sessionName ? { clientId: this.sessionName } : {}),
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    this.client.on('qr', async (qr) => {
      console.log('📱 QR Code received! Scan with WhatsApp mobile app.');
      this.status = 'qr_ready';
      this._stopInitWatchdog(); // QR appeared — initialize succeeded
      try {
        this.qrCode = await qrcode.toDataURL(qr);
        this.qrTimestamp = Date.now();
        // Try to capture the browser PID once we have a live client (Linux only)
        if (process.platform !== 'win32' && this.client && this.client.pupBrowser) {
          try { this.browserPid = this.client.pupBrowser.process()?.pid || null; } catch {}
        }
        console.log('✅ QR Code generated successfully');
      } catch (err) {
        console.error('❌ QR Code generation failed:', err);
      }
    });

    this.client.on('ready', () => {
      console.log('✅ WhatsApp Client is ready!');
      this.isReady = true;
      this.status = 'connected';
      this.qrCode = null;
      this.qrTimestamp = null;
      this._stopInitWatchdog();
      this.phoneNumber = this.client.info.wid.user;
      this.reconnectAttempts = 0; // reset backoff counter on successful connect
      this.heartbeatFailCount = 0;
      this.userLoggedOut = false;
      console.log(`📞 Connected as: ${this.phoneNumber}`);
      this._startHeartbeat();
      // Auto-sync any messages missed during downtime (wait 4s for connection to stabilise)
      setTimeout(() => this.syncMissedMessages(), 4000);
    });

    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp authenticated successfully');
      this.status = 'authenticated';
    });

    this.client.on('auth_failure', (msg) => {
      console.error('❌ Authentication failed:', msg);
      this.status = 'auth_failed';
      this.isReady = false;
    });

    this.client.on('disconnected', (reason) => {
      console.log('⚠️ WhatsApp disconnected:', reason);
      this.status = 'disconnected';
      this.isReady = false;
      this.qrCode = null;
      this._stopHeartbeat();
      // Skip auto-reconnect when user logged out from the phone (LOGOUT/NAVIGATION) — that's intentional
      const isIntentional = this.userLoggedOut || /LOGOUT|NAVIGATION/i.test(String(reason));
      if (!isIntentional) this._scheduleReconnect();
    });

    // ── INCOMING MESSAGE ──
    this.client.on('message', async (message) => {
      try {
        // Groups are handled by the Groups feature, not the lead pipeline.
        if (message.from.includes('@g.us')) return;
        if (!WhatsAppService.isIngestableChat(message.from)) return;
        // Only skip if truly empty AND not a media message
        if (!message.hasMedia && (!message.body || message.body.trim() === '')) return;

        // Falling back to the raw `message.id` OBJECT here made this Set useless — every
        // object is a distinct key, so nothing was ever recognised as already processed.
        const messageId = WhatsAppService.waMessageKey(message.id) || JSON.stringify(message.id);
        if (this.processedMessages.has(messageId)) return;
        this.processedMessages.add(messageId);
        if (this.processedMessages.size > 1000) {
          this.processedMessages = new Set(Array.from(this.processedMessages).slice(-1000));
        }

        const contact = await message.getContact();
        // WhatsApp usernames: the library exposes this under different names as the
        // feature rolls out, and not at all on older builds. Read whichever is
        // present rather than pinning one, and store it as a SECOND identifier —
        // the number stays authoritative until WhatsApp says otherwise.
        const waUsername = (contact && (contact.username || contact.handle || contact.pushname_username)) || null;
        let customerPhone;
        if (message.from.endsWith('@lid')) {
          if (contact.id?._serialized && !contact.id._serialized.includes('@lid')) {
            customerPhone = '+' + contact.id.user;
          } else if (contact.number && contact.number.length <= 15 && /^\d+$/.test(contact.number)) {
            customerPhone = '+' + contact.number;
          } else {
            customerPhone = message.from;
          }
        } else {
          customerPhone = '+' + message.from.split('@')[0];
        }
        const customerName = contact.pushname || contact.name || customerPhone;

        const msgType = message.type; // 'chat', 'ptt', 'audio', 'image', 'video', 'document', etc.
        console.log(`📨 New message from ${customerPhone} [${msgType}]: ${message.body || '[media]'}`);

        // Attribute the lead to the workspace that owns THIS connected account.
        const user = this._resolveOwner();
        if (!user) { console.log('⚠️ No user with workspace found'); return; }

        const workspaceId = user.workspace_id;
        const stripSQL = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone,' ',''),'+',''),'-',''),'(',''),')',''),'.','')`;
        const normPhone = customerPhone.replace(/\D/g, '');
        const firstMsg = message.body || (message.hasMedia ? '[Media]' : '');

        // Atomic lookup-or-create — prevents duplicate leads when two messages from the same
        // phone race through the message handler simultaneously. better-sqlite3 transactions
        // serialize on the connection, so concurrent calls queue rather than both inserting.
        let leadCreated = false;
        const upsertLead = this.db.transaction(() => {
          let l = this.db.prepare(
            `SELECT * FROM leads WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND ${stripSQL} = ?`
          ).get(workspaceId, normPhone);
          if (!l && normPhone.length >= 10) {
            l = this.db.prepare(
              `SELECT * FROM leads WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND ${stripSQL} LIKE ?`
            ).get(workspaceId, `%${normPhone.slice(-10)}`);
          }
          if (l) {
            this.db.prepare(`UPDATE leads SET total_messages = total_messages + 1, last_message_at = CURRENT_TIMESTAMP,
              wa_username = COALESCE(?, wa_username) WHERE id = ?`).run(waUsername, l.id);
            if (waUsername && !l.wa_username) l.wa_username = waUsername;
            return l;
          }
          const leadId = this.generateId();
          this.db.prepare(
            `INSERT INTO leads (id, user_id, workspace_id, customer_name, customer_phone, wa_username, first_message, total_messages, status, platform_source, platform_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'New', 'whatsapp', ?)`
          ).run(leadId, user.id, workspaceId, customerName, customerPhone, waUsername, firstMsg, this.accountId || null);
          leadCreated = true;
          return this.db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
        });
        let lead = upsertLead();

        if (leadCreated) {
          console.log(`🆕 Created new lead: ${customerName}`);
          // A real feed row, so the bell has something it can actually show and
          // mark as read — identity included rather than a bare "Unknown".
          try {
            this.notify(user.workspace_id, {
              type: 'lead',
              title: `New WhatsApp lead: ${lead.customer_name || lead.wa_username || lead.customer_phone}`,
              body: (message.body || '[media]').slice(0, 140),
              url: `/leads/${lead.id}`,
              icon: '💬',
            });
          } catch {}
          this._emit(user, 'lead_created', { lead });
          this._maybeAutoAnalyze(lead, workspaceId);
        }

        const msgId = this.generateId();
        const waId = WhatsAppService.waMessageKey(message.id);
        try {
          // Determine media type properly
          let mediaType = null;
          let mediaUrl = null;
          if (message.hasMedia) {
            if (msgType === 'ptt' || msgType === 'audio') {
              mediaType = 'voice';
            } else if (msgType === 'image') {
              mediaType = 'image';
            } else if (msgType === 'video') {
              mediaType = 'video';
            } else {
              mediaType = 'media';
            }

            // Same downloader as both sync importers. It must be this one and not
            // message.downloadMedia(): on this account the library call fails for
            // live messages too — a brand-new voice note failed with the minified
            // "r" while the in-page path recovered 31 of 31 historical files.
            this._mediaFailuresThisRun = 0;
            mediaUrl = await this._downloadMediaFor(message, waId, mediaType);
            if (mediaUrl) console.log(`📎 Media saved [${mediaType}]: ${mediaUrl}`);
          }

          if (waId) {
            const dup = this.db.prepare('SELECT id, media_url FROM messages WHERE wa_message_id = ?').get(waId);
            if (dup) {
              // A sync importer may have inserted this row first without media. We
              // have just downloaded the real file, so upgrade the row rather than
              // dropping what we fetched — otherwise the photo is lost for good and
              // the thread keeps showing "[Image]".
              if (mediaUrl && !dup.media_url) {
                this.db.prepare(
                  'UPDATE messages SET media_url = ?, media_type = COALESCE(media_type, ?) WHERE id = ?'
                ).run(mediaUrl, mediaType, dup.id);
                console.log(`📎 Backfilled media on existing message ${dup.id}`);
              }
              return;
            }
          }
          const fallbackBody = mediaType === 'voice' ? '[Voice Note]'
            : mediaType === 'image' ? '[Image]'
            : mediaType === 'video' ? '[Video]'
            : mediaType === 'media' ? '[File]'
            : '[Media]';
          this.db.prepare(
            `INSERT INTO messages (id, lead_id, user_id, body, from_me, media_type, media_url, timestamp, wa_message_id, platform, platform_account_id) VALUES (?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, ?, 'whatsapp', ?)`
          ).run(msgId, lead.id, user.id, message.body || fallbackBody, mediaType, mediaUrl, waId, this.accountId || null);
        } catch (e) {
          console.log('⚠️ Could not save message:', e.message);
        }

        // Retrieve the saved message to include correct media_type/media_url in broadcast
        let savedMsg;
        try { savedMsg = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId); } catch {}
        // Identity travels WITH the event. It used to carry only lead_id, so every
        // live notification read "New message from Unknown" — the consumer had
        // nothing else to show.
        this._emit(user, 'new_message', {
          lead_id: lead.id,
          customer_name: lead.customer_name || null,
          customer_phone: lead.customer_phone || null,
          wa_username: lead.wa_username || null,
          message: savedMsg || { id: msgId, body: message.body || '[Media]', from_me: 0, lead_id: lead.id }
        });

        this.checkAutoReply(user.id, lead, message.body || '');

      } catch (error) {
        console.error('❌ Error processing message:', error);
      }
    });

    this.client.initialize().catch((err) => {
      console.error('❌ WhatsApp initialize error:', err.message);
      this.status = 'error';
      this.isReady = false;
      // No auto-retry — user clicks "Reconnect WhatsApp" button which calls reconnect()
    });
  }

  // ── Properly destroy old client then start fresh ──
  // Idempotent: if we're already in a healthy "waiting for QR" state with a fresh
  // QR (< 45s old), this is a no-op — re-tearing-down the running Chrome is the
  // exact bug that traps the next init in 'initializing' forever.
  async reconnect({ force = false } = {}) {
    // Idempotency guard — don't touch a working QR session
    if (!force && this.status === 'qr_ready' && this.qrCode && this.qrTimestamp && (Date.now() - this.qrTimestamp < 45000)) {
      console.log('↩️  reconnect() called but QR session is healthy — no-op');
      return;
    }
    if (!force && this.status === 'initializing' && this.initStartedAt && (Date.now() - this.initStartedAt < 20000)) {
      console.log('↩️  reconnect() called but init already in progress — no-op');
      return;
    }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this._stopHeartbeat();
    this._stopInitWatchdog();
    if (this.client) {
      console.log('🔌 Tearing down existing client for reconnect...');
      const old = this.client;
      const oldPid = (() => {
        try { return old.pupBrowser?.process()?.pid || null; } catch { return null; }
      })();
      this.client = null;
      this.status = 'initializing';
      this.isReady = false;
      this.qrCode = null;
      this.qrTimestamp = null;
      try { old.removeAllListeners(); } catch {}  // prevents disconnected event from running
      try { await old.destroy(); } catch {}
      // Force-kill the browser PID if puppeteer didn't reap it cleanly (Linux)
      if (oldPid && process.platform !== 'win32') {
        try { process.kill(oldPid, 'SIGKILL'); console.log(`🔫 Force-killed lingering Chrome PID ${oldPid}`); } catch {}
      }
      // Give Chrome 3s to fully exit before starting a new instance (was 1.5s — too short under load)
      await new Promise(r => setTimeout(r, 3000));
    }
    this.initialize();
  }

  // ── Init watchdog ──
  // If the client can't reach qr_ready or connected within 60s, mark status as
  // 'error' so the user can retry. Prevents the "stuck on Connecting forever" UX.
  _startInitWatchdog() {
    this._stopInitWatchdog();
    this.initWatchdogTimer = setTimeout(() => {
      if (this.status === 'initializing') {
        console.error('⏰ Init watchdog: still initializing after 60s — marking as error');
        this.status = 'error';
        this.isReady = false;
        this.qrCode = null;
        // Tear down so next /connect can start fresh
        if (this.client) {
          const old = this.client;
          this.client = null;
          try { old.removeAllListeners(); } catch {}
          try { old.destroy().catch(() => {}); } catch {}
        }
      }
    }, 60000);
  }

  _stopInitWatchdog() {
    if (this.initWatchdogTimer) { clearTimeout(this.initWatchdogTimer); this.initWatchdogTimer = null; }
  }

  // ── Auto-reconnect with exponential backoff ──
  // Called on unexpected disconnects. Caps at maxReconnectAttempts to avoid Puppeteer thrashing.
  _scheduleReconnect() {
    if (this.reconnectTimer) return; // already scheduled
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`⚠️ Auto-reconnect gave up after ${this.reconnectAttempts} attempts — manual reconnect required`);
      this.status = 'reconnect_failed';
      return;
    }
    const delays = [10000, 30000, 90000]; // 10s, 30s, 90s
    const delay = delays[this.reconnectAttempts] || 90000;
    this.reconnectAttempts++;
    console.log(`🔄 Scheduling auto-reconnect #${this.reconnectAttempts} in ${delay / 1000}s`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnect().catch(err => {
        console.error(`❌ Auto-reconnect #${this.reconnectAttempts} failed:`, err.message);
        this._scheduleReconnect();
      });
    }, delay);
  }

  // ── Heartbeat — periodically verify client is still responding ──
  // 3 consecutive failures triggers a reconnect attempt.
  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      if (!this.client || !this.isReady) return;
      try {
        const state = await Promise.race([
          this.client.getState(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('heartbeat timeout')), 8000)),
        ]);
        if (state === 'CONNECTED') {
          this.heartbeatFailCount = 0;
        } else {
          this.heartbeatFailCount++;
          console.log(`💓 Heartbeat returned state=${state} (fail ${this.heartbeatFailCount}/3)`);
        }
      } catch (e) {
        this.heartbeatFailCount++;
        console.log(`💓 Heartbeat failed (${this.heartbeatFailCount}/3): ${e.message}`);
      }
      if (this.heartbeatFailCount >= 3) {
        console.log('⚠️ Heartbeat threshold exceeded — triggering reconnect');
        this.heartbeatFailCount = 0;
        this.isReady = false;
        this.status = 'unhealthy';
        this._stopHeartbeat();
        this._scheduleReconnect();
      }
    }, 60000); // every 60s
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  // ── Auto-analyze a freshly-created lead if the workspace AI profile opts in ──
  // Lazy-requires ai-engine to avoid circular imports. Silent on any failure.
  _maybeAutoAnalyze(lead, workspaceId) {
    if (!lead || !workspaceId) return;
    setTimeout(async () => {
      try {
        const profile = this.db.prepare('SELECT auto_analyze FROM workspace_ai_profile WHERE workspace_id = ?').get(workspaceId);
        if (!profile || !profile.auto_analyze) return;

        const aiEngine = require('./ai-engine');
        const messages = this.db.prepare('SELECT * FROM messages WHERE lead_id = ? ORDER BY timestamp ASC LIMIT 30').all(lead.id);
        // Need at least one message to analyze meaningfully
        if (messages.length === 0) return;

        const memories = this.db.prepare(`SELECT memory_type, key, value FROM ai_memories WHERE workspace_id = ? ORDER BY confidence DESC LIMIT 30`).all(workspaceId);
        const fullProfile = this.db.prepare(`SELECT * FROM workspace_ai_profile WHERE workspace_id = ?`).get(workspaceId);
        const context = aiEngine.formatMemoryContext(memories) + aiEngine.formatProfileContext(fullProfile);

        const analysis = await aiEngine.analyzeLeadIntelligence(messages, lead, context);
        this.db.prepare(`UPDATE leads SET
          lead_score = COALESCE(?, lead_score),
          sentiment = ?,
          urgency = ?,
          intent_category = ?,
          ai_last_analyzed_at = CURRENT_TIMESTAMP
          WHERE id = ?`).run(
          analysis.lead_score ?? null,
          analysis.sentiment || null,
          analysis.urgency || null,
          analysis.intent_category || null,
          lead.id
        );
        console.log(`✨ Auto-analyzed new lead ${lead.id} → score=${analysis.lead_score}, urgency=${analysis.urgency}`);
        // Push updated lead so UI shows intelligence badges without manual refresh
        const updated = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(lead.id);
        const user = this.db.prepare(`SELECT u.id FROM users u WHERE u.workspace_id = ? LIMIT 1`).get(workspaceId);
        if (user && updated) this._emit(user, 'lead_updated', { lead: updated });
      } catch (e) {
        console.log('⚠️ Auto-analyze skipped:', e.message);
      }
    }, 5000); // 5s grace — let the user see the lead appear first
  }

  getStatus() {
    return {
      status: this.status,
      isReady: this.isReady,
      qrCode: this.qrCode,
      qrTimestamp: this.qrTimestamp,
      qrAgeSeconds: this.qrTimestamp ? Math.floor((Date.now() - this.qrTimestamp) / 1000) : null,
      phoneNumber: this.phoneNumber,
      initAgeSeconds: this.initStartedAt && this.status === 'initializing'
        ? Math.floor((Date.now() - this.initStartedAt) / 1000)
        : null,
    };
  }

  async disconnect() {
    this.userLoggedOut = true; // prevents auto-reconnect from firing
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this._stopHeartbeat();
    this._stopInitWatchdog();
    if (this.client) {
      const old = this.client;
      const oldPid = (() => {
        try { return old.pupBrowser?.process()?.pid || null; } catch { return null; }
      })();
      this.client = null;
      try { old.removeAllListeners(); } catch {}
      try { await old.destroy(); } catch {}
      if (oldPid && process.platform !== 'win32') {
        try { process.kill(oldPid, 'SIGKILL'); } catch {}
      }
      this.isReady = false;
      this.status = 'disconnected';
      this.qrCode = null;
      this.qrTimestamp = null;
      this.phoneNumber = null;
      console.log('🔌 WhatsApp disconnected');
    }
  }

  // Resolve a phone/JID to a whatsapp-web.js chat id WITHOUT calling
  // getNumberId(). getNumberId queries WhatsApp's servers from inside the
  // browser page and intermittently hangs ("Runtime.callFunctionOn timed out"),
  // which wedges the whole request. For a normal number the chat id is simply
  // `<digits>@c.us` — construct it directly. Already-formed JIDs pass through.
  _resolveChatId(phone) {
    const p = String(phone || '').trim();
    if (p.includes('@lid') || p.includes('@c.us') || p.includes('@s.whatsapp.net') || p.includes('@g.us')) {
      return p;
    }
    return `${p.replace(/\D/g, '')}@c.us`;
  }

  async sendMessage(phone, message) {
    if (!this.isReady) throw new Error('WhatsApp client is not ready');
    await this.client.sendMessage(this._resolveChatId(phone), message);
  }

  async sendMedia(phone, filePath, mimetype, filename, caption = '') {
    if (!this.isReady) throw new Error('WhatsApp client is not ready');
    const data = fs.readFileSync(filePath).toString('base64');
    const media = new MessageMedia(mimetype, data, filename);
    await this.client.sendMessage(this._resolveChatId(phone), media, caption ? { caption } : {});
  }

  async sendVoiceNote(phone, filePath, mimetype) {
    if (!this.isReady) throw new Error('WhatsApp client is not ready');

    // WhatsApp Web accepts only a handful of audio containers. Anything else is
    // rejected inside the page by WAWebPrepRawMedia.prepRawMedia with
    // `InvalidMediaCheckRepairFailedType` — which crosses the puppeteer boundary as
    // the unreadable "t: t", because WhatsApp's error classes are minified and
    // puppeteer cannot serialize them. Browsers record voice notes as webm/opus,
    // which is NOT accepted, so the ffmpeg transcode below is load-bearing rather
    // than cosmetic. ogg/opus, mp4/aac and mp3 were each verified against the live
    // WhatsApp Web page; webm/opus was verified to fail.
    const SENDABLE_AUDIO = {
      ogg: 'audio/ogg; codecs=opus',
      oga: 'audio/ogg; codecs=opus',
      m4a: 'audio/mp4',
      mp4: 'audio/mp4',
      mp3: 'audio/mpeg',
    };

    // Transcode browser-recorded webm/opus → ogg/opus with ffmpeg.
    // ASYNC (execFile) — never use execSync in a request path, it blocks the
    // entire Node event loop and freezes every other API call.
    let sendPath = filePath;
    let transcodeError = null;
    // The upload's extension is derived from its mimetype (see voiceUpload in
    // server.js), so the extension alone decides whether a transcode is needed.
    const srcExt = (filePath.split('.').pop() || '').toLowerCase();
    if (!SENDABLE_AUDIO[srcExt]) {
      const oggPath = filePath.replace(/\.[^.]+$/, '') + '-conv.ogg';
      try {
        await new Promise((resolve, reject) => {
          execFile('ffmpeg',
            ['-y', '-i', filePath, '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', oggPath],
            { timeout: 25000 },
            (err) => (err ? reject(err) : resolve()));
        });
        if (fs.existsSync(oggPath) && fs.statSync(oggPath).size > 0) {
          sendPath = oggPath;
        } else {
          transcodeError = new Error('ffmpeg produced no output');
        }
      } catch (e) {
        transcodeError = e;
      }
      if (transcodeError) console.log('⚠️ Voice transcode (ffmpeg) failed:', transcodeError.message);
    }

    // Never hand WhatsApp a container it is going to reject. This used to fall
    // through and "send the original" webm, which could not succeed — it only
    // turned a missing ffmpeg into an unreadable page-boundary error.
    const ext = (sendPath.split('.').pop() || '').toLowerCase();
    const mime = SENDABLE_AUDIO[ext];
    if (!mime) {
      const why = transcodeError
        ? (transcodeError.code === 'ENOENT'
            ? 'ffmpeg is not installed on this server'
            : `ffmpeg failed: ${transcodeError.message}`)
        : `nothing converted the .${ext || 'unknown'} recording`;
      throw new Error(
        `Voice note could not be converted to a format WhatsApp accepts (${why}). ` +
        `WhatsApp rejects .${ext || 'unknown'} audio — install ffmpeg (apt install -y ffmpeg) and retry.`);
    }

    const filename = `voice.${ext === 'oga' ? 'ogg' : ext}`;
    const data = fs.readFileSync(sendPath).toString('base64');
    const media = new MessageMedia(mime, data, filename);

    // Resolve the chat target directly — no getNumberId() (it hangs).
    const target = this._resolveChatId(phone);

    // Send as a plain audio message. We deliberately do NOT pass
    // sendAudioAsVoice:true — the PTT path on this whatsapp-web.js version
    // wedges the WhatsApp Web page, which then breaks every other send
    // (text included) on the account. A plain audio attachment delivers
    // reliably and still plays for the recipient.
    try {
      await this.client.sendMessage(target, media);
    } catch (e) {
      const real = await this._describeMediaFailure(mime, data, filename);
      throw new Error(`WhatsApp rejected the voice note${real ? `: ${real}` : ` (${e.message || e})`}`);
    }
  }

  // Ask the page why a media send failed. whatsapp-web.js does the send inside
  // page.evaluate, and WhatsApp's own error classes are minified, so everything
  // puppeteer can tell us is "t: t". The only way to read one is to catch it
  // INSIDE the page and return it as data — which is what this does, by replaying
  // the media-prep step that a media send fails on. Best effort: null if it can't
  // reproduce the failure, so the caller falls back to the original error.
  async _describeMediaFailure(mimetype, data, filename) {
    try {
      const page = this.client && this.client.pupPage;
      if (!page) return null;
      return await page.evaluate(async (media) => {
        try {
          const file = window.WWebJS.mediaInfoToFile(media);
          const opaque = await window.require('WAWebMediaOpaqueData').createFromData(file, media.mimetype);
          await window.require('WAWebPrepRawMedia').prepRawMedia(opaque, {}).waitForPrep();
          return null; // Media prep is fine — the send failed further along.
        } catch (err) {
          if (!err || typeof err !== 'object') return String(err);
          return err.message ? `${err.name || 'Error'}: ${err.message}` : (err.name || String(err));
        }
      }, { mimetype, data, filename });
    } catch { return null; }
  }

  // ── Chat lookup that survives WhatsApp's key rename ──────────────────────────
  //
  // `client.getChatById()` cannot be used against current WhatsApp Web builds. It
  // asks the page for a chat *model*, and whatsapp-web.js builds that model in
  // `getChatModel()` by reading `chat.lastReceivedKey._serialized` — a field
  // WhatsApp no longer publishes, since the message key now ships under a minified
  // name (`$1` today, something else after the next deploy). The read yields
  // undefined, undefined is handed to `Msg.getMessagesById([undefined])`, and
  // IndexedDB rejects it with `DataError: Failed to execute 'get' on
  // 'IDBObjectStore': No key or key range specified`. Every chat that has ever
  // received a message is affected — 439 of 690 on the production account.
  //
  // Nothing we do with a chat needs that model. fetchMessages(), setSubject(),
  // setDescription(), setPicture() and getInviteCode() each reach back into the
  // page with `chat.id._serialized` and nothing else. So read the Chat collection
  // directly — the same door the missed-message sync uses — return only the fields
  // the structures actually read, and build the structure on this side.
  //
  // Returns null when the chat does not exist, and throws when the lookup itself
  // failed, so callers can tell "no such chat" from "the lookup is broken".
  async _getChat(chatId) {
    const page = this.client && this.client.pupPage;
    if (!page || (typeof page.isClosed === 'function' && page.isClosed())) {
      throw new Error('WhatsApp page context unavailable — session still starting or restarting');
    }

    const result = await page.evaluate(async (id) => {
      // Wids still carry `_serialized`, but the message-key rename is a standing
      // warning that these fields move; toString() is the stable fallback.
      const widString = (wid) => {
        if (!wid) return null;
        if (typeof wid === 'string') return wid;
        if (typeof wid._serialized === 'string' && wid._serialized) return wid._serialized;
        try {
          const text = wid.toString();
          return text && text !== '[object Object]' ? text : null;
        } catch { return null; }
      };

      let chat = null;
      try {
        const wid = window.require('WAWebWidFactory').createWid(id);
        chat = window.require('WAWebCollections').Chat.get(wid);
        if (!chat) {
          // A chat we have never opened is not in the collection yet. Same fallback
          // the library's own getChat() uses.
          const opened = await window.require('WAWebFindChatAction').findOrCreateLatestChat(wid);
          chat = (opened && opened.chat) || null;
        }
      } catch (e) {
        // A throw from in here reaches Node as a minified class name and nothing
        // else, so report the failure as data while the detail still exists.
        return { error: `${(e && e.name) || 'Error'}: ${(e && e.message) || 'chat lookup failed'}` };
      }
      if (!chat) return { chat: null };

      const serialized = widString(chat.id);
      if (!serialized) return { error: 'chat found but its id could not be read' };
      const metadata = chat.groupMetadata;

      return {
        chat: {
          id: { _serialized: serialized, user: chat.id.user, server: chat.id.server },
          formattedTitle: chat.formattedTitle || chat.name || null,
          isGroup: !!metadata || serialized.endsWith('@g.us'),
          isReadOnly: !!(metadata && metadata.announce),
          t: chat.t || null,
          unreadCount: chat.unreadCount || 0,
          archive: !!chat.archive,
          pin: chat.pin || 0,
          isMuted: !!(chat.mute && chat.mute.expiration !== 0),
          muteExpiration: (chat.mute && chat.mute.expiration) || 0,
          // Only what the group operations read. Participants are left out on
          // purpose: the library remaps their @lid ids to phone numbers while
          // building a model, and a half-migrated list is worse than none.
          groupMetadata: metadata ? {
            desc: metadata.desc || null,
            owner: widString(metadata.owner),
            creation: metadata.creation || null,
            announce: !!metadata.announce,
            restrict: !!metadata.restrict,
          } : undefined,
        },
      };
    }, chatId);

    if (result && result.error) throw new Error(`WhatsApp could not open chat ${chatId} — ${result.error}`);
    const data = result && result.chat;
    if (!data) return null;
    return data.isGroup ? new GroupChat(this.client, data) : new PrivateChat(this.client, data);
  }

  // ── Group creation & editing ─────────────────────────────────
  // Resolve a mix of E.164 phones and @lid JIDs to whatsapp-web.js participant IDs.
  // Returns { participants, skipped } so the caller can tell the user which numbers were unreachable.
  async _resolveParticipants(phones) {
    const participants = [];
    const skipped = [];
    for (const raw of phones || []) {
      const p = String(raw || '').trim();
      if (!p) { skipped.push({ phone: p, reason: 'empty' }); continue; }
      try {
        if (p.includes('@lid') || p.includes('@c.us') || p.includes('@s.whatsapp.net')) {
          participants.push(p);
          continue;
        }
        const cleanPhone = p.replace(/\D/g, '');
        if (cleanPhone.length < 7 || cleanPhone.length > 15) {
          skipped.push({ phone: p, reason: 'not a phone number' });
          continue;
        }
        const numberId = await this.client.getNumberId(cleanPhone);
        if (!numberId) { skipped.push({ phone: p, reason: 'not on WhatsApp' }); continue; }
        participants.push(numberId._serialized);
      } catch (e) {
        skipped.push({ phone: p, reason: e.message || 'lookup failed' });
      }
    }
    return { participants, skipped };
  }

  // Create a WhatsApp group with the given name and member phones.
  // Returns { groupId, inviteLink, skipped }.
  async createGroup(name, phones, description) {
    if (!this.isReady) throw new Error('WhatsApp client is not ready');
    if (!name || typeof name !== 'string') throw new Error('Group name required');
    const { participants, skipped } = await this._resolveParticipants(phones);
    if (participants.length === 0) throw new Error('No valid WhatsApp participants — all numbers skipped: ' + JSON.stringify(skipped));

    const result = await this.client.createGroup(name, participants);
    // whatsapp-web.js returns { gid, missingParticipants } on newer versions; fall back to raw chatId
    const groupId = (typeof result === 'string') ? result : (result?.gid?._serialized || result?.gid || result?._serialized);
    if (!groupId) throw new Error('Group creation succeeded but no group id returned');

    // One lookup serves both of the follow-up steps.
    let chat = null;
    try {
      chat = await this._getChat(groupId);
    } catch (e) {
      console.log(`⚠️ Group ${groupId} was created but could not be read back:\n${describeWaError(e)}`);
    }
    const group = chat && chat.isGroup ? chat : null;

    // Optional description — set via the group chat's setDescription
    if (description && group) {
      try {
        await group.setDescription(description);
      } catch (e) { console.log(`⚠️ Could not set group description:\n${describeWaError(e)}`); }
    }

    // Try to fetch an invite code so the user can share the link if they want
    let inviteLink = null;
    if (group && typeof group.getInviteCode === 'function') {
      try {
        const code = await group.getInviteCode();
        if (code) inviteLink = `https://chat.whatsapp.com/${code}`;
      } catch (e) {
        // Still best-effort — the group exists either way — but say why in the log.
        console.log(`⚠️ Could not read the invite link for ${groupId}:\n${describeWaError(e)}`);
      }
    }

    return { groupId, inviteLink, addedCount: participants.length, skipped };
  }

  // Look up a group chat, refusing anything that is not one.
  async _getGroupChat(groupId) {
    const chat = await this._getChat(groupId);
    if (!chat || !chat.isGroup) throw new Error('Not a group chat');
    return chat;
  }

  // The three edits below fail in two different ways, and only one of them is a throw.
  //
  // (1) The page throws, and by the time the throw reaches Node its message is a
  //     minified class name. Log the full description here, and give the caller the
  //     one line worth showing.
  // (2) whatsapp-web.js does NOT throw when WhatsApp *refuses* the edit. GroupChat's
  //     setSubject/setDescription/setPicture catch ServerStatusCodeError inside the
  //     page and return `false` — the usual cause being that the account is not a
  //     group admin, or the group has "only admins can edit group info" enabled.
  //     Returning that silently is how a PATCH reported success while WhatsApp
  //     changed nothing, and wrote the new name into our mirror on top of it. The
  //     check is a strict `=== false`, so a library version that returns nothing on
  //     success is not misread as a refusal.
  async _editGroup(groupId, what, apply) {
    if (!this.isReady) throw new Error('WhatsApp client is not ready');
    const chat = await this._getGroupChat(groupId);
    let result;
    try {
      result = await apply(chat);
    } catch (e) {
      const detail = describeWaError(e);
      console.log(`⚠️ Could not ${what} for ${groupId}:\n${detail}`);
      throw new Error(`Could not ${what} — ${detail.split('\n')[0]}`);
    }
    if (result === false) {
      console.log(`⚠️ WhatsApp refused to ${what} for ${groupId} — the account is probably not a group admin`);
      throw Object.assign(
        new Error(`Could not ${what} — WhatsApp refused it, so this account may not be a group admin`),
        { notPermitted: true },
      );
    }
    return result;
  }

  async setGroupSubject(groupId, name) {
    await this._editGroup(groupId, 'rename the group', chat => chat.setSubject(name));
  }

  async setGroupDescription(groupId, description) {
    await this._editGroup(groupId, 'set the group description', chat => chat.setDescription(description));
  }

  async setGroupPicture(groupId, filePath, mimetype) {
    if (!this.isReady) throw new Error('WhatsApp client is not ready');
    // Read the upload before touching WhatsApp so a bad file fails as a bad file.
    const data = fs.readFileSync(filePath).toString('base64');
    const media = new MessageMedia(mimetype || 'image/jpeg', data, 'group.jpg');
    await this._editGroup(groupId, 'set the group picture', chat => chat.setPicture(media));
  }

  saveOutgoingMessage(leadId, userId, body) {
    try {
      this.db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, from_me, timestamp, platform, platform_account_id) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, 'whatsapp', ?)`)
        .run(this.generateId(), leadId, userId, body, this.accountId || null);
    } catch (e) {
      console.log('⚠️ Could not save outgoing message:', e.message);
    }
  }

  // Download one message's media, with a re-hydration retry.
  //
  // Message objects from chat.fetchMessages() can come back "thin": whatsapp-web.js
  // builds them from whatever the page's message store holds, and for older entries
  // that can be missing the media keys downloadMedia() needs. The throw crosses the
  // puppeteer boundary as a minified FBLOGGER object, so Node sees `e.message === 'r'`
  // and nothing else — see wa-errors.js. getMessageById() re-reads the message from
  // the store with its full payload, which is usually enough to make the second
  // attempt succeed.
  //
  // Returns a media URL, or null when the media is genuinely unavailable (WhatsApp
  // expires media server-side, so old threads legitimately have unrecoverable files).
  async _downloadMediaFor(message, waKey, mediaType) {
    // In-page FIRST, deliberately. Measured on this account: the library's own
    // Message.downloadMedia() failed on all 49 media messages across two threads,
    // while doing the same work inside the page succeeded on 31 of 31. Trying the
    // library path first meant two guaranteed-failed attempts per file, which is
    // what pushed a 31-file sync past 45 seconds.
    if (waKey) {
      try {
        const res = await this._downloadMediaInPage(waKey);
        if (res && res.ok) {
          const url = persistWaMedia(
            { data: res.data, mimetype: res.mimetype, filename: res.filename },
            mediaType
          );
          if (url) return url;
        } else if (res) {
          this._lastMediaReason = res;
        }
      } catch (e) {
        this._lastMediaError = e;
      }
    }

    // Fall back to the library, in case a future WhatsApp Web build breaks the
    // in-page shape above but leaves whatsapp-web.js working.
    const attempt = async (msg) => persistWaMedia(await msg.downloadMedia(), mediaType);
    try {
      const url = await attempt(message);
      if (url) return url;
    } catch (e) {
      this._lastMediaError = e;
    }

    // Log ONE readable diagnosis per sync rather than a wall of ": r".
    if (!this._mediaFailuresThisRun) this._mediaFailuresThisRun = 0;
    this._mediaFailuresThisRun++;
    if (this._mediaFailuresThisRun === 1) {
      if (this._lastMediaReason) {
        const r = this._lastMediaReason;
        console.log(`⚠️ Media download failed [${mediaType}] — in-page reason: ${r.reason}` +
          `${r.stage ? ` (mediaStage=${r.stage})` : ''}${r.status ? ` status=${r.status}` : ''}` +
          `${r.detail ? ` — ${r.detail}` : ''}`);
      } else if (this._lastMediaError) {
        console.log(`⚠️ Media download failed [${mediaType}] — first failure this run:\n${describeWaError(this._lastMediaError)}`);
      }
    }
    return null;
  }

  // Replicates whatsapp-web.js's Message.downloadMedia, but every failure path
  // returns serializable data instead of throwing across the puppeteer boundary.
  // Keep in step with node_modules/whatsapp-web.js/src/structures/Message.js.
  async _downloadMediaInPage(waKey) {
    if (!this.client?.pupPage) return { ok: false, reason: 'no-page' };
    return this.client.pupPage.evaluate(async (msgId) => {
      const say = (e) => {
        if (!e) return '';
        if (typeof e === 'string') return e.slice(0, 300);
        const bits = [];
        for (const k of ['name', 'message', 'status', 'code', 'errorName', 'reason']) {
          try { if (e[k] != null && typeof e[k] !== 'function') bits.push(`${k}=${String(e[k]).slice(0, 120)}`); } catch {}
        }
        return bits.join(' ');
      };
      try {
        const C = window.require('WAWebCollections');
        const msg = C.Msg.get(msgId) || (await C.Msg.getMessagesById([msgId]))?.messages?.[0];
        if (!msg) return { ok: false, reason: 'message-not-in-store' };
        if (!msg.mediaData) return { ok: false, reason: 'no-mediaData' };

        const stage0 = msg.mediaData.mediaStage;
        if (stage0 === 'REUPLOADING') return { ok: false, reason: 'reuploading', stage: stage0 };

        if (stage0 !== 'RESOLVED') {
          try {
            await msg.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 });
          } catch (e) {
            return { ok: false, reason: 'resolve-threw', stage: stage0, detail: say(e) };
          }
        }
        const stage = msg.mediaData.mediaStage;
        if (String(stage).includes('ERROR') || stage === 'FETCHING') {
          return { ok: false, reason: 'unresolvable-stage', stage };
        }

        const mockQpl = { addAnnotations() { return this; }, addPoint() { return this; } };
        let decrypted;
        try {
          decrypted = await window.require('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({
            directPath: msg.directPath,
            encFilehash: msg.encFilehash,
            filehash: msg.filehash,
            mediaKey: msg.mediaKey,
            mediaKeyTimestamp: msg.mediaKeyTimestamp,
            type: msg.type,
            signal: new AbortController().signal,
            downloadQpl: mockQpl,
          });
        } catch (e) {
          return {
            ok: false, reason: 'download-threw', stage,
            status: e && e.status, detail: say(e),
            hasKey: !!msg.mediaKey, hasPath: !!msg.directPath,
          };
        }

        const data = await window.WWebJS.arrayBufferToBase64Async(decrypted);
        return { ok: true, data, mimetype: msg.mimetype, filename: msg.filename, filesize: msg.size };
      } catch (e) {
        return { ok: false, reason: 'outer-threw', detail: say(e) };
      }
    }, waKey);
  }

  async fetchHistory(phone, limit = 200) {
    if (!this.isReady) throw new Error('WhatsApp not connected');
    let chatId;
    if (phone && phone.includes('@')) {
      chatId = phone;
    } else {
      const cleanPhone = (phone || '').replace(/\D/g, '');
      if (!cleanPhone) throw new Error('Invalid phone number');
      const numberId = await this.client.getNumberId(cleanPhone);
      if (!numberId) throw new Error(`${cleanPhone} is not on WhatsApp`);
      chatId = numberId._serialized;
    }
    let chat;
    try {
      chat = await this._getChat(chatId);
    } catch (e) {
      // This catch used to swallow the getChatModel DataError and blame the contact
      // for never having messaged us, which sent people hunting through WhatsApp for
      // a problem that lives in this process.
      const detail = describeWaError(e);
      console.log(`⚠️ Could not open chat ${chatId} to read history:\n${detail}`);
      throw new Error(`Could not open the WhatsApp chat for ${phone} — ${detail.split('\n')[0]}`);
    }
    if (!chat) throw new Error('Chat not found — the contact may not have messaged this WhatsApp number yet');
    const messages = await chat.fetchMessages({ limit });
    const mediaCount = messages.filter(m => m.hasMedia).length;
    console.log(`📜 Fetched ${messages.length} historical messages for ${phone} (${mediaCount} with media)`);

    // Which of these do we not already have? Downloading media is the expensive
    // part of this call, so only pay it for messages that are actually about to
    // be inserted — re-opening a lead must not re-download the whole thread.
    let known = new Set();
    try {
      const ids = messages.map(m => WhatsAppService.waMessageKey(m.id)).filter(Boolean);
      if (ids.length) {
        const rows = this.db.prepare(
          `SELECT wa_message_id FROM messages WHERE media_url IS NOT NULL AND wa_message_id IN (${ids.map(() => '?').join(',')})`
        ).all(...ids);
        known = new Set(rows.map(r => r.wa_message_id));
      }
    } catch { /* no db handle or column — fall through and just download */ }

    this._mediaFailuresThisRun = 0;
    const out = [];
    for (const m of messages) {
      const waKey = WhatsAppService.waMessageKey(m.id);
      const mediaType = m.hasMedia ? waMediaType(m.type) : null;
      let mediaUrl = null;

      // Without this the row lands with media_type but no media_url, and the
      // thread renders the literal "[Image]" instead of the photo.
      if (m.hasMedia && !known.has(waKey)) {
        mediaUrl = await this._downloadMediaFor(m, waKey, mediaType);
      }

      out.push({
        wa_id: waKey,
        body: m.body || (m.hasMedia ? '[Media]' : ''),
        from_me: m.fromMe ? 1 : 0,
        ts: m.timestamp,
        media_type: mediaType,
        media_url: mediaUrl,
      });
    }
    const withMedia = out.filter(o => o.media_url).length;
    const failed = this._mediaFailuresThisRun || 0;
    if (withMedia || failed) {
      console.log(`📎 History media: ${withMedia} downloaded, ${failed} unavailable`);
    }
    return out;
  }

  // Read the chats that saw inbound activity since `sinceSec`, straight out of the page.
  //
  // This deliberately does NOT use client.getChats(). That call runs every chat through
  // whatsapp-web.js's getChatModel(), which reads `chat.lastReceivedKey._serialized` —
  // a field current WhatsApp Web builds no longer expose — and passes the resulting
  // `undefined` to an IndexedDB lookup, which throws DataError. Because getChats() is a
  // Promise.all over every chat, one bad chat rejects the lot, and on this account 439
  // of 690 chats hit it, so the sync could never get past its first line. Reading the
  // Chat collection directly needs none of that machinery.
  async _collectMissedFromPage(sinceSec, maxPerChat = 100) {
    const page = this.client && this.client.pupPage;
    if (!page || (typeof page.isClosed === 'function' && page.isClosed())) {
      throw new Error('WhatsApp page context unavailable — session still starting or restarting');
    }
    return page.evaluate(async (since, perChat) => {
      const collections = window.require('WAWebCollections');
      let loader = null;
      try { loader = window.require('WAWebChatLoadMessages'); } catch { /* older build — in-memory only */ }

      // Same rename story as waMessageKey() on the Node side, except in here the key is
      // still a live object, so its own toString() is the reliable answer.
      const keyOf = (id) => {
        if (!id) return null;
        if (typeof id._serialized === 'string' && id._serialized) return id._serialized;
        try {
          const serialized = id.toString();
          return serialized && serialized !== '[object Object]' ? serialized : null;
        } catch { return null; }
      };

      // Bookkeeping rows WhatsApp keeps alongside real messages. `isNotification` does
      // not cover all of them on the raw models, and importing a call record or an
      // encryption notice would invent a lead out of something the customer never sent.
      const NON_CONTENT_TYPES = new Set([
        'e2e_notification', 'notification', 'notification_template', 'call_log',
        'gp2', 'broadcast_notification', 'protocol', 'ciphertext', 'revoked',
      ]);

      const all = collections.Chat.getModelsArray();
      const chats = [];
      const skipped = [];

      for (const chat of all) {
        let jid = null;
        try {
          jid = chat.id && chat.id._serialized;
          if (!jid) continue;
          // Groups belong to the Groups feature, not the lead pipeline.
          if (chat.groupMetadata || jid.endsWith('@g.us')) continue;
          // `t` is the chat's last-activity stamp — available without building a model.
          if (!chat.t || chat.t <= since) continue;

          let msgs = chat.msgs ? chat.msgs.getModelsArray() : [];
          // Only page backwards while the oldest message in hand is still inside our
          // window, i.e. while there might be more of the missed run further back.
          let loads = 0;
          while (loader && msgs.length && msgs[0].t > since && msgs.length < perChat && loads < 5) {
            const earlier = await loader.loadEarlierMsgs({ chat });
            if (!earlier || !earlier.length) break;
            msgs = chat.msgs.getModelsArray();
            loads++;
          }

          const messages = [];
          for (const m of msgs) {
            if (m.isNotification) continue;
            if (NON_CONTENT_TYPES.has(m.type)) continue;
            if (m.id ? m.id.fromMe : m.fromMe) continue;
            if (!m.t || m.t <= since) continue;
            messages.push({
              waId: keyOf(m.id),
              body: m.body || m.caption || '',
              ts: m.t,
              type: m.type || 'chat',
              // How whatsapp-web.js itself decides a message carries media.
              hasMedia: !!(m.mediaKey && m.directPath),
            });
          }
          if (!messages.length) continue;
          messages.sort((a, b) => a.ts - b.ts);

          chats.push({
            id: jid,
            name: chat.formattedTitle || chat.name || null,
            isChannel: !!chat.isNewsletter,
            isBroadcast: !!chat.isBroadcast,
            messages: messages.slice(-perChat),
          });
        } catch (e) {
          // One unreadable chat must not cost us the other 689.
          skipped.push({ id: jid || 'unknown', reason: (e && (e.name || e.message)) || 'unknown' });
        }
      }
      return { chats, skipped, scanned: all.length };
    }, sinceSec, maxPerChat);
  }

  // ── Auto-import leads & messages missed while WhatsApp was disconnected ──
  async syncMissedMessages() {
    if (!this.isReady) return;
    try {
      // Get the workspace that owns THIS connected account (not "the oldest user").
      const user = this._resolveOwner();
      if (!user) return;

      // Find last imported message timestamp (stored as SQLite datetime text)
      const lastRow = this.db.prepare(
        `SELECT timestamp FROM messages m
         JOIN leads l ON l.id = m.lead_id
         WHERE l.workspace_id = ?
         ORDER BY m.timestamp DESC LIMIT 1`
      ).get(user.workspace_id);

      // Convert to Unix epoch seconds; default to 24 h ago if no messages exist
      let sinceSec;
      if (lastRow?.timestamp) {
        sinceSec = Math.floor(new Date(lastRow.timestamp.replace(' ', 'T') + 'Z').getTime() / 1000);
      } else {
        sinceSec = Math.floor(Date.now() / 1000) - 86400;
      }

      const sinceDate = new Date(sinceSec * 1000).toISOString();
      console.log(`🔄 Syncing missed messages since ${sinceDate}...`);

      const { chats, skipped, scanned } = await this._collectMissedFromPage(sinceSec);
      if (skipped.length) {
        const sample = skipped.slice(0, 3).map(s => `${s.id} (${s.reason})`).join(', ');
        console.log(`⚠️ ${skipped.length}/${scanned} chats unreadable during sync: ${sample}${skipped.length > 3 ? ' …' : ''}`);
      }

      const stripSQL = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone,' ',''),'+',''),'-',''),'(',''),')',''),'.','')`;
      let totalImported = 0;
      let leadsCreated = 0;

      for (const chat of chats) {
        try {
          const jid = chat.id;
          if (!WhatsAppService.isIngestableChat(jid, chat)) continue;

          // Resolve phone number from JID
          let customerPhone;
          if (jid.endsWith('@lid')) {
            customerPhone = jid;
          } else {
            customerPhone = '+' + jid.split('@')[0];
          }
          const normPhone = customerPhone.replace(/\D/g, '');

          // Already filtered to inbound messages newer than our last import.
          const newMsgs = chat.messages;
          if (newMsgs.length === 0) continue;

          // Find or create lead
          let lead = this.db.prepare(
            `SELECT * FROM leads WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND ${stripSQL} = ?`
          ).get(user.workspace_id, normPhone);
          if (!lead && normPhone.length >= 10) {
            lead = this.db.prepare(
              `SELECT * FROM leads WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND ${stripSQL} LIKE ?`
            ).get(user.workspace_id, `%${normPhone.slice(-10)}`);
          }
          if (!lead) {
            const leadId = this.generateId();
            const name = chat.name || customerPhone;
            this.db.prepare(
              `INSERT INTO leads (id, user_id, workspace_id, customer_name, customer_phone, first_message, total_messages, status, platform_source)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'New', 'whatsapp')`
            ).run(leadId, user.id, user.workspace_id, name, customerPhone, newMsgs[0].body || '[Media]', newMsgs.length);
            lead = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
            leadsCreated++;
            this._emit(user, 'lead_created', { lead });
            console.log(`🆕 Missed lead created: ${name}`);
          }

          // Insert missing messages (skip duplicates via wa_message_id)
          let msgCount = 0;
          for (const m of newMsgs) {
            const waId = m.waId;
            if (waId) {
              const dup = this.db.prepare('SELECT id FROM messages WHERE wa_message_id = ?').get(waId);
              if (dup) continue;
            }
            const ts = new Date(m.ts * 1000).toISOString().replace('T', ' ').slice(0, 19);
            let mediaType = null;
            let bodyFallback = '[Media]';
            if (m.hasMedia) {
              if (m.type === 'ptt' || m.type === 'audio') { mediaType = 'voice'; bodyFallback = '[Voice Note]'; }
              else if (m.type === 'image' || m.type === 'sticker') { mediaType = 'image'; bodyFallback = '[Image]'; }
              else if (m.type === 'video') { mediaType = 'video'; bodyFallback = '[Video]'; }
              else { mediaType = 'media'; bodyFallback = '[File]'; }
            }

            // _collectMissedFromPage can only hand back a serializable `hasMedia`
            // flag from the browser context, so the actual file has to be fetched
            // here in Node. Without this the row gets media_type but no media_url
            // and the thread shows "[Image]" where the photo should be.
            let mediaUrl = null;
            if (mediaType && waId) {
              try {
                const full = await this.client.getMessageById(waId);
                if (full) mediaUrl = persistWaMedia(await full.downloadMedia(), mediaType);
              } catch (e) {
                console.log(`⚠️ Missed-sync media download failed [${mediaType}]: ${e.message}`);
              }
            }

            this.db.prepare(
              `INSERT INTO messages (id, lead_id, user_id, body, from_me, media_type, media_url, timestamp, wa_message_id, platform, platform_account_id)
               VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 'whatsapp', ?)`
            ).run(this.generateId(), lead.id, user.id, m.body || bodyFallback, mediaType, mediaUrl, ts, waId, this.accountId || null);
            msgCount++;
          }

          if (msgCount > 0) {
            this.db.prepare(
              `UPDATE leads SET total_messages = total_messages + ?, last_message_at = CURRENT_TIMESTAMP WHERE id = ?`
            ).run(msgCount, lead.id);
            totalImported += msgCount;
          }
        } catch (chatErr) {
          // Skip chats that fail individually — don't abort the whole sync
          console.log(`⚠️ Skipping chat ${chat.id} during sync:\n${describeWaError(chatErr)}`);
        }
      }

      if (totalImported > 0 || leadsCreated > 0) {
        console.log(`✅ Missed-message sync complete: ${totalImported} messages + ${leadsCreated} new leads imported`);
        this._emit(user, 'missed_sync_complete', { totalImported, leadsCreated });
      } else {
        console.log('✅ Missed-message sync: nothing new to import');
      }
    } catch (e) {
      // `e.message` alone used to print a single minified character here.
      const context = isPageContextGone(e)
        ? ' (WhatsApp page went away mid-sync — session restarting, retry expected on next ready)'
        : '';
      console.error(`❌ Missed-message sync error${context}:\n${describeWaError(e)}`);
    }
  }

  checkAutoReply(userId, lead, messageBody) {
    try {
      const rules = this.db.prepare(`SELECT * FROM auto_reply_rules WHERE user_id = ? AND is_active = 1`).all(userId);
      for (const rule of rules) {
        let keywords = [];
        try { keywords = JSON.parse(rule.keywords); } catch { keywords = [rule.keywords]; }
        const body = (messageBody || '').toLowerCase();
        const matched = keywords.some(kw => {
          const k = (kw || '').toLowerCase();
          return rule.match_type === 'exact' ? body === k : body.includes(k);
        });
        if (matched) {
          setTimeout(async () => {
            try {
              await this.sendMessage(lead.customer_phone, rule.reply_message);
              this.saveOutgoingMessage(lead.id, userId, rule.reply_message);
              this.db.prepare(`UPDATE leads SET total_messages = total_messages + 1, last_message_at = CURRENT_TIMESTAMP WHERE id = ?`).run(lead.id);
              console.log(`🤖 Auto-reply sent to ${lead.customer_phone}`);
            } catch (e) { console.log('⚠️ Auto-reply failed:', e.message); }
          }, 1500);
          break;
        }
      }
    } catch (e) { console.log('⚠️ Auto-reply check error:', e.message); }
  }
}

// ── Multi-account WhatsApp manager ─────────────────────────────────────────────
class WhatsAppManager {
  constructor(db, broadcastToUser, broadcastToWorkspace = null, notify = null) {
    this.db = db;
    this.broadcastToUser = broadcastToUser;
    this.broadcastToWorkspace = broadcastToWorkspace;
    this.notify = notify;
    this.instances = new Map(); // accountId -> WhatsAppService
  }

  _generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  loadAccounts() {
    const accounts = this.db.prepare(
      `SELECT * FROM platform_accounts WHERE platform = 'whatsapp' ORDER BY slot_index ASC`
    ).all();
    // Stagger startup. Launching every account's Chromium at the same instant
    // thrashes CPU/RAM and trips "browser is already running" races where a
    // slow-to-start browser collides with a watchdog-triggered re-init. Spacing
    // each launch ~12s apart lets every session reach QR/ready before the next.
    accounts.forEach((account, i) => {
      setTimeout(() => {
        try { this._startAccount(account.id, account.slot_index); }
        catch (e) { console.error('⚠️ Staggered account start failed:', e.message); }
      }, i * 12000);
    });
    // If no DB accounts exist, start legacy session (backward compat)
    if (accounts.length === 0) {
      this._startLegacy();
    }
  }

  _startLegacy() {
    if (this.instances.has('__legacy__')) return this.instances.get('__legacy__');
    const service = new WhatsAppService(this.db, this.broadcastToUser, null, undefined, this.broadcastToWorkspace, this.notify);
    this.instances.set('__legacy__', service);
    service.initialize();
    return service;
  }

  _startAccount(accountId, slotIndex) {
    if (this.instances.has(accountId)) return this.instances.get(accountId);
    // Key the WhatsApp session by the globally-unique account id. slot_index is
    // only unique WITHIN a workspace — two different workspaces' "slot 0"
    // accounts would otherwise both resolve to the legacy `session` dir and
    // collide on Chromium ("browser is already running for .../session").
    // Each account now gets its own isolated `session-acct-<id>` profile.
    const sessionName = `acct-${accountId}`;
    const service = new WhatsAppService(this.db, this.broadcastToUser, accountId, sessionName, this.broadcastToWorkspace, this.notify);
    this.instances.set(accountId, service);
    service.initialize();
    return service;
  }

  addAccount(accountId, slotIndex) {
    return this._startAccount(accountId, slotIndex);
  }

  async removeAccount(accountId) {
    const service = this.instances.get(accountId);
    if (service) {
      await service.disconnect().catch(() => {});
      this.instances.delete(accountId);
    }
  }

  getStatus(accountId) {
    const key = accountId || '__legacy__';
    const service = this.instances.get(key);
    return service ? service.getStatus() : { status: 'not_initialized', isReady: false };
  }

  // Backward compat: first account's status
  getLegacyStatus() {
    if (this.instances.has('__legacy__')) return this.instances.get('__legacy__').getStatus();
    const first = this.instances.values().next().value;
    return first ? first.getStatus() : { status: 'disconnected', isReady: false };
  }

  async reconnect(accountId, opts = {}) {
    const key = accountId || '__legacy__';
    const service = this.instances.get(key);
    if (service) {
      await service.reconnect(opts);
    } else if (accountId) {
      const account = this.db.prepare('SELECT * FROM platform_accounts WHERE id = ?').get(accountId);
      if (account) this._startAccount(accountId, account.slot_index);
    }
  }

  async disconnect(accountId) {
    const key = accountId || '__legacy__';
    const service = this.instances.get(key);
    if (service) await service.disconnect().catch(() => {});
  }

  // Which workspace owns a running instance. '__legacy__' predates
  // platform_accounts and belongs to the only workspace that can exist in a
  // single-tenant install; with more than one workspace it belongs to nobody and
  // must never be handed out.
  _workspaceOfInstance(key) {
    if (key === '__legacy__') {
      const rows = this.db.prepare('SELECT id FROM workspaces LIMIT 2').all();
      return rows.length === 1 ? rows[0].id : null;
    }
    if (!this._wsCache) this._wsCache = new Map();
    if (this._wsCache.has(key)) return this._wsCache.get(key);
    let ws = null;
    try {
      const row = this.db.prepare('SELECT workspace_id FROM platform_accounts WHERE id = ?').get(key);
      ws = row ? row.workspace_id : null;
    } catch { ws = null; }
    this._wsCache.set(key, ws);
    return ws;
  }

  /**
   * Resolve the WhatsApp client a request may use — WITHIN ITS OWN WORKSPACE.
   *
   * This used to fall back to "the first ready instance" with no tenancy check
   * at all, so when one workspace's client was not ready its messages went out
   * over ANOTHER WORKSPACE'S WHATSAPP NUMBER. That is exactly what happened in
   * production: a second studio signed up, connected her own number, sent a
   * message from her account, and it was delivered from the first studio's
   * number — putting her conversation in a stranger's phone.
   *
   * There is no safe cross-workspace fallback. A caller that cannot be resolved
   * inside its own workspace gets null, and the operation fails loudly.
   *
   * `workspaceId` is required for anything user-triggered. It is optional only
   * for system callers (startup sweeps) that legitimately iterate every account.
   */
  getReadyService(accountId = null, workspaceId = null) {
    const usable = (key, svc) => {
      if (!svc?.isReady) return false;
      if (!workspaceId) return true; // system caller — see doc comment
      return this._workspaceOfInstance(key) === workspaceId;
    };

    if (accountId) {
      const s = this.instances.get(accountId);
      if (usable(accountId, s)) return s;
      // An explicit account that is not ours is a hard no — never silently
      // substitute a different one.
      if (s && workspaceId && this._workspaceOfInstance(accountId) !== workspaceId) return null;
    }

    const legacy = this.instances.get('__legacy__');
    if (usable('__legacy__', legacy)) return legacy;

    for (const [key, service] of this.instances.entries()) {
      if (usable(key, service)) return service;
    }
    return null;
  }

  // Is ANY client ready? Callers that care about a specific workspace must pass
  // it; the bare getter is only meaningful for system/status use.
  get isReady() {
    return !!this.getReadyService();
  }

  isReadyForWorkspace(workspaceId) {
    return !!this.getReadyService(null, workspaceId);
  }

  // Every send below is workspace-scoped. `notConnected()` deliberately says the
  // workspace has no connected number rather than "WhatsApp not connected",
  // because the old message was true globally while being false for the caller.
  _requireService(accountId, workspaceId) {
    const service = this.getReadyService(accountId, workspaceId);
    if (!service) {
      throw new Error(workspaceId
        ? 'No WhatsApp number is connected for this workspace'
        : 'WhatsApp not connected');
    }
    return service;
  }

  async sendMessage(phone, message, accountId = null, workspaceId = null) {
    return this._requireService(accountId, workspaceId).sendMessage(phone, message);
  }

  saveOutgoingMessage(leadId, userId, body, workspaceId = null) {
    const service = this.getReadyService(null, workspaceId);
    if (service) {
      service.saveOutgoingMessage(leadId, userId, body);
    } else {
      // No client for this workspace — still record what we sent, but never
      // borrow another workspace's instance to do it.
      try {
        const id = this._generateId();
        this.db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, from_me, timestamp, platform) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, 'whatsapp')`).run(id, leadId, userId, body);
      } catch {}
    }
  }

  async sendVoiceNote(phone, filePath, mimetype, accountId = null, workspaceId = null) {
    return this._requireService(accountId, workspaceId).sendVoiceNote(phone, filePath, mimetype);
  }

  async fetchHistory(phone, limit = 200, accountId = null, workspaceId = null) {
    return this._requireService(accountId, workspaceId).fetchHistory(phone, limit);
  }

  async sendMedia(phone, filePath, mimetype, filename, caption = '', accountId = null, workspaceId = null) {
    return this._requireService(accountId, workspaceId).sendMedia(phone, filePath, mimetype, filename, caption);
  }

  async syncMissedMessages() {
    const promises = [];
    for (const service of this.instances.values()) {
      if (service.isReady) promises.push(service.syncMissedMessages().catch(() => {}));
    }
    await Promise.all(promises);
  }

  // Scoped sync for a single account (mirrors the per-account reconnect/disconnect proxies).
  // Used by the workspace-scoped /api/whatsapp/sync-missed route so a sync never reaches
  // another tenant's instance.
  async syncMissedForAccount(accountId) {
    const service = this.instances.get(accountId);
    if (service?.isReady) await service.syncMissedMessages().catch(() => {});
  }

  // ── Group proxies ──────────────────────────────────────────
  async createGroup(name, phones, description, accountId = null, workspaceId = null) {
    const service = this._requireService(accountId, workspaceId);
    return service.createGroup(name, phones, description);
  }

  async setGroupSubject(groupId, name, accountId = null, workspaceId = null) {
    const service = this._requireService(accountId, workspaceId);
    return service.setGroupSubject(groupId, name);
  }

  async setGroupDescription(groupId, description, accountId = null, workspaceId = null) {
    const service = this._requireService(accountId, workspaceId);
    return service.setGroupDescription(groupId, description);
  }

  async setGroupPicture(groupId, filePath, mimetype, accountId = null, workspaceId = null) {
    const service = this._requireService(accountId, workspaceId);
    return service.setGroupPicture(groupId, filePath, mimetype);
  }

  // List which WhatsApp accounts are currently usable for sending (so the UI can offer a picker)
  listReadyAccounts() {
    const out = [];
    for (const [key, svc] of this.instances.entries()) {
      if (!svc.isReady) continue;
      // Try to get DB row for nickname + slot info; key may be 'accountId' or '__legacy__'
      let accountId = key === '__legacy__' ? null : key;
      let row = null;
      if (accountId) {
        try { row = this.db.prepare(`SELECT id, account_name, nickname, slot_index, platform FROM platform_accounts WHERE id = ?`).get(accountId); } catch {}
      }
      out.push({
        accountId,
        key,
        phoneNumber: svc.phoneNumber || null,
        account_name: row?.account_name || (key === '__legacy__' ? 'Default WA' : 'WhatsApp'),
        nickname: row?.nickname || null,
        slot_index: row?.slot_index ?? null,
      });
    }
    return out;
  }
}

// persistWaMedia/waMediaType are exported for the media regression test.
module.exports = { WhatsAppService, WhatsAppManager, persistWaMedia, waMediaType };
