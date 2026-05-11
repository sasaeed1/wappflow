const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const qrcode = require('qrcode');

class WhatsAppService {
  constructor(db, broadcastToUser) {
    this.db = db;
    this.broadcastToUser = broadcastToUser || (() => {});
    this.client = null;
    this.qrCode = null;
    this.status = 'disconnected';
    this.isReady = false;
    this.phoneNumber = null;
    this.processedMessages = new Set();

  }

  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ── Kill orphaned Chromium processes using our profile, then remove lock files ──
  _cleanLocks() {
    // Windows only: kill orphaned Chromium processes via wmic/taskkill
    if (process.platform === 'win32') {
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

    // Remove lock files
    const authBase2 = process.env.NODE_ENV === 'production' ? '/data/.wwebjs_auth' : './.wwebjs_auth';
    for (const p of [
      authBase2 + '/session/SingletonLock',
      authBase2 + '/session/SingletonCookie',
      authBase2 + '/session/SingletonSocket',
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

    this._cleanLocks();

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: process.env.NODE_ENV === 'production' ? '/data/.wwebjs_auth' : './.wwebjs_auth' }),
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
      try {
        this.qrCode = await qrcode.toDataURL(qr);
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
      this.phoneNumber = this.client.info.wid.user;
      console.log(`📞 Connected as: ${this.phoneNumber}`);
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
    });

    // ── INCOMING MESSAGE ──
    this.client.on('message', async (message) => {
      try {
        if (message.from.includes('@g.us') || message.from.includes('status@broadcast')) return;
        // Only skip if truly empty AND not a media message
        if (!message.hasMedia && (!message.body || message.body.trim() === '')) return;

        const messageId = message.id._serialized || message.id;
        if (this.processedMessages.has(messageId)) return;
        this.processedMessages.add(messageId);
        if (this.processedMessages.size > 1000) {
          this.processedMessages = new Set(Array.from(this.processedMessages).slice(-1000));
        }

        const contact = await message.getContact();
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

        const user = this.db.prepare(
          `SELECT u.id, u.workspace_id FROM users u WHERE u.workspace_id IS NOT NULL ORDER BY u.created_at ASC LIMIT 1`
        ).get();
        if (!user) { console.log('⚠️ No user with workspace found'); return; }

        const workspaceId = user.workspace_id;
        const stripSQL = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone,' ',''),'+',''),'-',''),'(',''),')',''),'.','')`;
        const normPhone = customerPhone.replace(/\D/g, '');
        let lead = this.db.prepare(
          `SELECT * FROM leads WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND ${stripSQL} = ?`
        ).get(workspaceId, normPhone);
        if (!lead && normPhone.length >= 10) {
          lead = this.db.prepare(
            `SELECT * FROM leads WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND ${stripSQL} LIKE ?`
          ).get(workspaceId, `%${normPhone.slice(-10)}`);
        }

        const firstMsg = message.body || (message.hasMedia ? '[Media]' : '');
        if (lead) {
          this.db.prepare(`UPDATE leads SET total_messages = total_messages + 1, last_message_at = CURRENT_TIMESTAMP WHERE id = ?`).run(lead.id);
        } else {
          const leadId = this.generateId();
          this.db.prepare(
            `INSERT INTO leads (id, user_id, workspace_id, customer_name, customer_phone, first_message, total_messages, status) VALUES (?, ?, ?, ?, ?, ?, 1, 'New')`
          ).run(leadId, user.id, workspaceId, customerName, customerPhone, firstMsg);
          lead = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
          console.log(`🆕 Created new lead: ${customerName}`);
          this.broadcastToUser(user.id, 'lead_created', { lead });
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

            // Download and save voice/audio messages so they can be played back
            if (mediaType === 'voice' || mediaType === 'audio') {
              try {
                const media = await message.downloadMedia();
                if (media && media.data) {
                  const ext = media.mimetype?.includes('ogg') ? 'ogg'
                            : media.mimetype?.includes('mp4') ? 'mp4'
                            : media.mimetype?.includes('mpeg') ? 'mp3'
                            : 'ogg';
                  const filename = `voice-${Date.now()}.${ext}`;
                  const voicesDir = path.join(process.env.NODE_ENV === 'production' ? '/data' : __dirname, 'uploads', 'voices');
                  if (!fs.existsSync(voicesDir)) fs.mkdirSync(voicesDir, { recursive: true });
                  const filePath = path.join(voicesDir, filename);
                  fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));
                  mediaUrl = `/uploads/voices/${filename}`;
                  console.log(`🎙️ Voice note saved: ${filename}`);
                }
              } catch (dlErr) {
                console.log('⚠️ Could not download voice note:', dlErr.message);
              }
            }
          }

          if (waId) {
            const dup = this.db.prepare('SELECT id FROM messages WHERE wa_message_id = ?').get(waId);
            if (dup) return;
          }
          this.db.prepare(
            `INSERT INTO messages (id, lead_id, user_id, body, from_me, media_type, media_url, timestamp, wa_message_id) VALUES (?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, ?)`
          ).run(msgId, lead.id, user.id, message.body || '[Voice Note]', mediaType, mediaUrl, waId);
        } catch (e) {
          console.log('⚠️ Could not save message:', e.message);
        }

        // Retrieve the saved message to include correct media_type/media_url in broadcast
        let savedMsg;
        try { savedMsg = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId); } catch {}
        this.broadcastToUser(user.id, 'new_message', {
          lead_id: lead.id,
          message: savedMsg || { id: msgId, body: message.body || '[Voice Note]', from_me: 0, lead_id: lead.id }
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
  async reconnect() {
    if (this.client) {
      console.log('🔌 Tearing down existing client for reconnect...');
      const old = this.client;
      this.client = null;
      this.status = 'initializing';
      this.isReady = false;
      this.qrCode = null;
      try { old.removeAllListeners(); } catch {}  // prevents disconnected event from running
      try { await old.destroy(); } catch {}
      // Give Chrome 1.5 s to fully exit before starting a new instance
      await new Promise(r => setTimeout(r, 1500));
    }
    this.initialize();
  }

  getStatus() {
    return {
      status: this.status,
      isReady: this.isReady,
      qrCode: this.qrCode,
      phoneNumber: this.phoneNumber
    };
  }

  async disconnect() {
    if (this.client) {
      const old = this.client;
      this.client = null;
      try { old.removeAllListeners(); } catch {}
      try { await old.destroy(); } catch {}
      this.isReady = false;
      this.status = 'disconnected';
      this.qrCode = null;
      this.phoneNumber = null;
      console.log('🔌 WhatsApp disconnected');
    }
  }

  async sendMessage(phone, message) {
    if (!this.isReady) throw new Error('WhatsApp client is not ready');
    if (phone.includes('@lid')) {
      const chat = await this.client.getChatById(phone);
      await chat.sendMessage(message);
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    const numberId = await this.client.getNumberId(cleanPhone);
    if (!numberId) throw new Error(`Number ${cleanPhone} is not registered on WhatsApp`);
    await this.client.sendMessage(numberId._serialized, message);
  }

  async sendMedia(phone, filePath, mimetype, filename, caption = '') {
    if (!this.isReady) throw new Error('WhatsApp client is not ready');
    const data = fs.readFileSync(filePath).toString('base64');
    const media = new MessageMedia(mimetype, data, filename);
    if (phone.includes('@lid')) {
      const chat = await this.client.getChatById(phone);
      await chat.sendMessage(media, { caption });
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    const numberId = await this.client.getNumberId(cleanPhone);
    if (!numberId) throw new Error(`Number ${cleanPhone} is not on WhatsApp`);
    await this.client.sendMessage(numberId._serialized, media, { caption });
  }

  async sendVoiceNote(phone, filePath, mimetype) {
    if (!this.isReady) throw new Error('WhatsApp client is not ready');
    const data = fs.readFileSync(filePath).toString('base64');
    const media = new MessageMedia('audio/ogg; codecs=opus', data, 'voice.ogg');
    if (phone.includes('@lid')) {
      const chat = await this.client.getChatById(phone);
      await chat.sendMessage(media, { sendAudioAsVoice: true });
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    const numberId = await this.client.getNumberId(cleanPhone);
    if (!numberId) throw new Error(`Number ${cleanPhone} is not on WhatsApp`);
    await this.client.sendMessage(numberId._serialized, media, { sendAudioAsVoice: true });
  }

  saveOutgoingMessage(leadId, userId, body) {
    try {
      this.db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, from_me, timestamp) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`)
        .run(this.generateId(), leadId, userId, body);
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
      // Get workspace owner
      const user = this.db.prepare(
        `SELECT u.id, u.workspace_id FROM users u WHERE u.workspace_id IS NOT NULL ORDER BY u.created_at ASC LIMIT 1`
      ).get();
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
              `INSERT INTO leads (id, user_id, workspace_id, customer_name, customer_phone, first_message, total_messages, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'New')`
            ).run(leadId, user.id, user.workspace_id, name, customerPhone, newMsgs[0].body || '[Media]', newMsgs.length);
            lead = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
            leadsCreated++;
            this.broadcastToUser(user.id, 'lead_created', { lead });
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
            const mediaType = m.hasMedia ? 'media' : null;
            this.db.prepare(
              `INSERT INTO messages (id, lead_id, user_id, body, from_me, media_type, timestamp, wa_message_id)
               VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
            ).run(this.generateId(), lead.id, user.id, m.body || '[Media]', mediaType, ts, waId);
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
        this.broadcastToUser(user.id, 'missed_sync_complete', { totalImported, leadsCreated });
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

module.exports = WhatsAppService;
