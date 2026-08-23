const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const { execSync, execFile } = require('child_process');
const qrcode = require('qrcode');

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
    // Legacy session (no accountId) — fall back to the first user's workspace.
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

        const messageId = message.id._serialized || message.id;
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
        const waId = message.id?._serialized || null;
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

            // Download and save all media types
            try {
              const media = await message.downloadMedia();
              if (media && media.data) {
                const uploadsBase = path.join(process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : __dirname), 'uploads');
                const ts = Date.now();
                let subDir, filename;
                if (mediaType === 'voice') {
                  const ext = media.mimetype?.includes('ogg') ? 'ogg'
                            : media.mimetype?.includes('mp4') ? 'mp4'
                            : media.mimetype?.includes('mpeg') ? 'mp3'
                            : 'ogg';
                  subDir = 'voices';
                  filename = `voice-${ts}.${ext}`;
                } else if (mediaType === 'image') {
                  const ext = media.mimetype?.includes('png') ? 'png'
                            : media.mimetype?.includes('webp') ? 'webp'
                            : media.mimetype?.includes('gif') ? 'gif'
                            : 'jpg';
                  subDir = 'images';
                  filename = `img-${ts}.${ext}`;
                } else if (mediaType === 'video') {
                  const ext = media.mimetype?.includes('mp4') ? 'mp4'
                            : media.mimetype?.includes('webm') ? 'webm'
                            : 'mp4';
                  subDir = 'videos';
                  filename = `video-${ts}.${ext}`;
                } else {
                  // document / sticker / other
                  const origName = media.filename || `file-${ts}`;
                  const ext = origName.includes('.') ? origName.split('.').pop() : 'bin';
                  const safeName = origName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
                  subDir = 'files';
                  filename = `${ts}-${safeName}`;
                  if (!filename.includes('.')) filename += `.${ext}`;
                }
                const dir = path.join(uploadsBase, subDir);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, filename), Buffer.from(media.data, 'base64'));
                mediaUrl = `/uploads/${subDir}/${filename}`;
                console.log(`📎 Media saved [${mediaType}]: ${filename}`);
              }
            } catch (dlErr) {
              console.log(`⚠️ Could not download media [${mediaType}]:`, dlErr.message);
            }
          }

          if (waId) {
            const dup = this.db.prepare('SELECT id FROM messages WHERE wa_message_id = ?').get(waId);
            if (dup) return;
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

    // Optional description — set via the group chat's setDescription
    if (description) {
      try {
        const chat = await this.client.getChatById(groupId);
        if (chat && chat.isGroup) await chat.setDescription(description);
      } catch (e) { console.log('⚠️ Could not set group description:', e.message); }
    }

    // Try to fetch an invite code so the user can share the link if they want
    let inviteLink = null;
    try {
      const chat = await this.client.getChatById(groupId);
      if (chat && chat.isGroup && typeof chat.getInviteCode === 'function') {
        const code = await chat.getInviteCode();
        if (code) inviteLink = `https://chat.whatsapp.com/${code}`;
      }
    } catch (e) { /* invite-link is best-effort */ }

    return { groupId, inviteLink, addedCount: participants.length, skipped };
  }

  async setGroupSubject(groupId, name) {
    if (!this.isReady) throw new Error('WhatsApp client is not ready');
    const chat = await this.client.getChatById(groupId);
    if (!chat || !chat.isGroup) throw new Error('Not a group chat');
    await chat.setSubject(name);
  }

  async setGroupDescription(groupId, description) {
    if (!this.isReady) throw new Error('WhatsApp client is not ready');
    const chat = await this.client.getChatById(groupId);
    if (!chat || !chat.isGroup) throw new Error('Not a group chat');
    await chat.setDescription(description);
  }

  async setGroupPicture(groupId, filePath, mimetype) {
    if (!this.isReady) throw new Error('WhatsApp client is not ready');
    const chat = await this.client.getChatById(groupId);
    if (!chat || !chat.isGroup) throw new Error('Not a group chat');
    const data = fs.readFileSync(filePath).toString('base64');
    const media = new MessageMedia(mimetype || 'image/jpeg', data, 'group.jpg');
    await chat.setPicture(media);
  }

  saveOutgoingMessage(leadId, userId, body) {
    try {
      this.db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, from_me, timestamp, platform, platform_account_id) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, 'whatsapp', ?)`)
        .run(this.generateId(), leadId, userId, body, this.accountId || null);
    } catch (e) {
      console.log('⚠️ Could not save outgoing message:', e.message);
    }
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
    try { chat = await this.client.getChatById(chatId); } catch {
      throw new Error('Chat not found — the contact may not have messaged this WhatsApp number yet');
    }
    const messages = await chat.fetchMessages({ limit });
    console.log(`📜 Fetched ${messages.length} historical messages for ${phone}`);
    return messages.map(m => ({
      wa_id: m.id?._serialized || null,
      body: m.body || (m.hasMedia ? '[Media]' : ''),
      from_me: m.fromMe ? 1 : 0,
      ts: m.timestamp,
      media_type: m.hasMedia
        ? (m.type === 'image' || m.type === 'sticker' ? 'image'
          : (m.type === 'ptt' || m.type === 'audio') ? 'voice'
          : 'media')
        : null,
    }));
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

      const chats = await this.client.getChats();
      const stripSQL = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone,' ',''),'+',''),'-',''),'(',''),')',''),'.','')`;
      let totalImported = 0;
      let leadsCreated = 0;

      for (const chat of chats) {
        try {
          if (chat.isGroup) continue;
          if (!WhatsAppService.isIngestableChat(chat.id && chat.id._serialized, chat)) continue;
          // Skip chats with no activity since our last import
          if (!chat.lastMessage || chat.lastMessage.timestamp <= sinceSec) continue;

          // Resolve phone number from JID
          const jid = chat.id._serialized;
          let customerPhone;
          if (jid.endsWith('@lid')) {
            customerPhone = jid;
          } else {
            customerPhone = '+' + jid.split('@')[0];
          }
          const normPhone = customerPhone.replace(/\D/g, '');

          // Fetch messages for this chat
          const allMsgs = await chat.fetchMessages({ limit: 100 });
          // Only inbound messages newer than our last import
          const newMsgs = allMsgs.filter(m => !m.fromMe && m.timestamp > sinceSec);
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
            const waId = m.id?._serialized || null;
            if (waId) {
              const dup = this.db.prepare('SELECT id FROM messages WHERE wa_message_id = ?').get(waId);
              if (dup) continue;
            }
            const ts = new Date(m.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19);
            let mediaType = null;
            let bodyFallback = '[Media]';
            if (m.hasMedia) {
              if (m.type === 'ptt' || m.type === 'audio') { mediaType = 'voice'; bodyFallback = '[Voice Note]'; }
              else if (m.type === 'image' || m.type === 'sticker') { mediaType = 'image'; bodyFallback = '[Image]'; }
              else if (m.type === 'video') { mediaType = 'video'; bodyFallback = '[Video]'; }
              else { mediaType = 'media'; bodyFallback = '[File]'; }
            }
            this.db.prepare(
              `INSERT INTO messages (id, lead_id, user_id, body, from_me, media_type, timestamp, wa_message_id, platform, platform_account_id)
               VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'whatsapp', ?)`
            ).run(this.generateId(), lead.id, user.id, m.body || bodyFallback, mediaType, ts, waId, this.accountId || null);
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
          console.log(`⚠️ Skipping chat during sync: ${chatErr.message}`);
        }
      }

      if (totalImported > 0 || leadsCreated > 0) {
        console.log(`✅ Missed-message sync complete: ${totalImported} messages + ${leadsCreated} new leads imported`);
        this._emit(user, 'missed_sync_complete', { totalImported, leadsCreated });
      } else {
        console.log('✅ Missed-message sync: nothing new to import');
      }
    } catch (e) {
      console.error('❌ Missed-message sync error:', e.message);
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

  getReadyService(accountId = null) {
    if (accountId) {
      const s = this.instances.get(accountId);
      if (s?.isReady) return s;
    }
    const legacy = this.instances.get('__legacy__');
    if (legacy?.isReady) return legacy;
    for (const service of this.instances.values()) {
      if (service.isReady) return service;
    }
    return null;
  }

  get isReady() {
    return !!this.getReadyService();
  }

  async sendMessage(phone, message, accountId = null) {
    const service = this.getReadyService(accountId);
    if (!service) throw new Error('WhatsApp not connected');
    return service.sendMessage(phone, message);
  }

  saveOutgoingMessage(leadId, userId, body) {
    const service = this.getReadyService() || this.instances.values().next().value;
    if (service) {
      service.saveOutgoingMessage(leadId, userId, body);
    } else {
      try {
        const id = this._generateId();
        this.db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, from_me, timestamp, platform) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, 'whatsapp')`).run(id, leadId, userId, body);
      } catch {}
    }
  }

  async sendVoiceNote(phone, filePath, mimetype, accountId = null) {
    const service = this.getReadyService(accountId);
    if (!service) throw new Error('WhatsApp not connected');
    return service.sendVoiceNote(phone, filePath, mimetype);
  }

  async fetchHistory(phone, limit = 200, accountId = null) {
    const service = this.getReadyService(accountId);
    if (!service) throw new Error('WhatsApp not connected');
    return service.fetchHistory(phone, limit);
  }

  async sendMedia(phone, filePath, mimetype, filename, caption = '', accountId = null) {
    const service = this.getReadyService(accountId);
    if (!service) throw new Error('WhatsApp not connected');
    return service.sendMedia(phone, filePath, mimetype, filename, caption);
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
  async createGroup(name, phones, description, accountId = null) {
    const service = this.getReadyService(accountId);
    if (!service) throw new Error('WhatsApp not connected');
    return service.createGroup(name, phones, description);
  }

  async setGroupSubject(groupId, name, accountId = null) {
    const service = this.getReadyService(accountId);
    if (!service) throw new Error('WhatsApp not connected');
    return service.setGroupSubject(groupId, name);
  }

  async setGroupDescription(groupId, description, accountId = null) {
    const service = this.getReadyService(accountId);
    if (!service) throw new Error('WhatsApp not connected');
    return service.setGroupDescription(groupId, description);
  }

  async setGroupPicture(groupId, filePath, mimetype, accountId = null) {
    const service = this.getReadyService(accountId);
    if (!service) throw new Error('WhatsApp not connected');
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

module.exports = { WhatsAppService, WhatsAppManager };
