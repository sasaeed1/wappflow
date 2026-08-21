// ════════════════════════════════════════════════════════════
//  SEED DUMMY LEADS
// ════════════════════════════════════════════════════════════
// Usage:  node seed-leads.js          # adds 14 leads to the first workspace
//         node seed-leads.js --clean  # also wipe existing dummy leads first
//
// Inserts varied leads across all 4 platforms with platform accounts,
// AI intelligence fields, and a few sample messages each so the dashboard,
// leads list, and lead profile all show realistic data immediately.

const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : __dirname;
const db = new Database(path.join(DATA_DIR, 'wappflow.db'));
db.pragma('journal_mode = WAL');

const cleanFirst = process.argv.includes('--clean');

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Find first user + workspace ────────────────────────────────
const user = db.prepare(
  `SELECT id, workspace_id, email FROM users WHERE workspace_id IS NOT NULL ORDER BY created_at ASC LIMIT 1`
).get();

if (!user) {
  console.error('❌ No user with workspace_id found. Sign up first, then re-run.');
  process.exit(1);
}
console.log(`✅ Seeding into workspace ${user.workspace_id} (owner: ${user.email})`);

// ── Apply any missing schema columns the seed depends on ──────
// This mirrors the safeAlter calls in server.js. Run the seed BEFORE starting
// the server for the first time and these would be missing.
function safeAlter(sql) {
  try { db.exec(sql); } catch { /* column already exists */ }
}
safeAlter(`ALTER TABLE platform_accounts ADD COLUMN nickname TEXT`);
safeAlter(`ALTER TABLE leads ADD COLUMN workspace_id TEXT`);
safeAlter(`ALTER TABLE leads ADD COLUMN email TEXT`);
safeAlter(`ALTER TABLE leads ADD COLUMN platform_source TEXT DEFAULT 'whatsapp'`);
safeAlter(`ALTER TABLE leads ADD COLUMN platform_account_id TEXT`);
safeAlter(`ALTER TABLE leads ADD COLUMN lead_score INTEGER DEFAULT 0`);
safeAlter(`ALTER TABLE leads ADD COLUMN sentiment TEXT`);
safeAlter(`ALTER TABLE leads ADD COLUMN urgency TEXT`);
safeAlter(`ALTER TABLE leads ADD COLUMN intent_category TEXT`);
safeAlter(`ALTER TABLE leads ADD COLUMN ai_last_analyzed_at TIMESTAMP`);
safeAlter(`ALTER TABLE leads ADD COLUMN is_deleted INTEGER DEFAULT 0`);
// lead_channels is owned by server.js (single canonical DDL). This script used
// to re-CREATE it so it could run standalone, which meant a second copy of the
// schema that would silently drift the moment the real one changed — the same
// defect class as the old ms_albums clash. Seeding demo leads into a database
// the server has never booted against is meaningless anyway, so assert instead.
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='lead_channels'").get()) {
  console.error('lead_channels is missing — boot the server once so it creates the schema, then re-run this seeder.');
  process.exit(1);
}

// ── Optional cleanup of previous dummy data ────────────────────
if (cleanFirst) {
  // Order matters: child rows first
  try { db.prepare(`DELETE FROM lead_channels WHERE lead_id IN (SELECT id FROM leads WHERE workspace_id = ? AND first_message LIKE '[SEED]%')`).run(user.workspace_id); } catch {}
  try { db.prepare(`DELETE FROM messages WHERE lead_id IN (SELECT id FROM leads WHERE workspace_id = ? AND first_message LIKE '[SEED]%')`).run(user.workspace_id); } catch {}
  try { db.prepare(`DELETE FROM lead_tags WHERE lead_id IN (SELECT id FROM leads WHERE workspace_id = ? AND first_message LIKE '[SEED]%')`).run(user.workspace_id); } catch {}
  const dummyLeads = db.prepare(`DELETE FROM leads WHERE workspace_id = ? AND first_message LIKE '[SEED]%'`);
  const r = dummyLeads.run(user.workspace_id);
  console.log(`🧹 Removed ${r.changes} previous seeded leads`);
  try { db.prepare(`DELETE FROM platform_accounts WHERE workspace_id = ? AND nickname LIKE 'Seed:%'`).run(user.workspace_id); } catch {}
}

// ── Seed platform accounts with nicknames so the "WhatsApp · Admissions" chip renders ──
const accountSeed = [
  { platform: 'whatsapp',  account_name: 'Sales WA',         nickname: 'Seed: Sales Team',      slot_index: 0 },
  { platform: 'whatsapp',  account_name: 'Support WA',       nickname: 'Seed: Support Team',    slot_index: 1 },
  { platform: 'instagram', account_name: '@brand_official',  nickname: 'Seed: Brand IG',        slot_index: 0 },
  { platform: 'facebook',  account_name: 'Acme Inc',         nickname: 'Seed: Acme FB Page',    slot_index: 0 },
];

const insertAccount = db.prepare(`
  INSERT INTO platform_accounts (id, workspace_id, platform, account_name, nickname, slot_index, status)
  VALUES (?, ?, ?, ?, ?, ?, 'connected')
`);
const accounts = {};
for (const a of accountSeed) {
  // Skip if a "Seed:" account for this platform/slot already exists
  const existing = db.prepare(`SELECT id FROM platform_accounts WHERE workspace_id = ? AND platform = ? AND slot_index = ? AND nickname LIKE 'Seed:%'`)
    .get(user.workspace_id, a.platform, a.slot_index);
  if (existing) {
    accounts[`${a.platform}-${a.slot_index}`] = existing.id;
    continue;
  }
  const id = generateId();
  insertAccount.run(id, user.workspace_id, a.platform, a.account_name, a.nickname, a.slot_index);
  accounts[`${a.platform}-${a.slot_index}`] = id;
}
console.log(`✅ Platform accounts ready: ${Object.keys(accounts).length}`);

// ── Lead templates — realistic spread across platform / status / intelligence ──
const STATUSES = ['New', 'Contacted', 'Interested', 'Negotiating', 'Closed - Won', 'Closed - Lost'];
const SENTIMENTS = ['positive', 'neutral', 'negative', 'frustrated'];
const URGENCIES = ['low', 'medium', 'high', 'critical'];

const leadTemplates = [
  // WhatsApp (real phone numbers)
  { name: 'Ahmed Ali',         phone: '+923001234567', platform: 'whatsapp',  slot: 0, status: 'New',          msgs: ['Hi, are you available?', 'I need a 5-marla plot in Bahria Town'], est: 8500000, score: 7, sentiment: 'positive',   urgency: 'medium', intent: 'product_inquiry' },
  { name: 'Sara Khan',         phone: '+923215567890', platform: 'whatsapp',  slot: 0, status: 'Interested',   msgs: ['Can you send pricing?', 'Looking for a 10-marla home'], est: 22000000, score: 8, sentiment: 'positive',   urgency: 'high', intent: 'pricing_inquiry' },
  { name: 'Bilal Hussain',     phone: '+923331122334', platform: 'whatsapp',  slot: 1, status: 'Negotiating',  msgs: ['That price is too high', 'Can you do 18M?'], est: 19000000, score: 9, sentiment: 'neutral',    urgency: 'high', intent: 'pricing_inquiry' },
  { name: 'Ayesha Tariq',      phone: '+923009988776', platform: 'whatsapp',  slot: 1, status: 'Contacted',    msgs: ['Hello, saw your ad', 'When can I visit?'], est: 0, score: 5, sentiment: 'positive',   urgency: 'low', intent: 'appointment_booking' },
  { name: 'Hassan Raza',       phone: '+923214455667', platform: 'whatsapp',  slot: 0, status: 'Closed - Won', msgs: ['Deal closed, thanks!'], est: 0, sale: 14500000, score: 10, sentiment: 'positive', urgency: 'low', intent: 'follow_up' },
  { name: 'Fatima Sheikh',     phone: '+923009876543', platform: 'whatsapp',  slot: 0, status: 'Closed - Lost', msgs: ['Going with another agent'], est: 12000000, score: 2, sentiment: 'negative', urgency: 'low', intent: 'not_interested' },

  // Instagram (platform IDs - these should display as "Instagram user" thanks to displayPhone fix)
  { name: 'Marketing Inquiry', phone: '17893456789012', platform: 'instagram', slot: 0, status: 'New',          msgs: ['Hi! Saw your reels', 'Do you have studios available?'], est: 5500000, score: 6, sentiment: 'positive', urgency: 'medium', intent: 'product_inquiry' },
  { name: 'Zara M.',           phone: '18234567890123', platform: 'instagram', slot: 0, status: 'Interested',   msgs: ['DMing about the 2BR listing', 'Price?'], est: 7800000, score: 7, sentiment: 'positive', urgency: 'high', intent: 'pricing_inquiry' },
  { name: 'Brand Collab Lead', phone: '19345678901234', platform: 'instagram', slot: 0, status: 'Contacted',    msgs: ['Interested in partnership'], est: 0, score: 4, sentiment: 'neutral', urgency: 'low', intent: 'general_inquiry' },

  // Facebook (also platform IDs)
  { name: 'Imran K.',          phone: '114387880816838', platform: 'facebook', slot: 0, status: 'New',          msgs: ['Asked about commercial space'], est: 35000000, score: 8, sentiment: 'positive', urgency: 'high', intent: 'product_inquiry' },
  { name: 'Nadia Page Visitor', phone: '215489732144908', platform: 'facebook', slot: 0, status: 'Interested',   msgs: ['Saw your page', 'When can we meet?'], est: 4200000, score: 6, sentiment: 'positive', urgency: 'medium', intent: 'appointment_booking' },
  { name: 'Frustrated Buyer',  phone: '318492734598234', platform: 'facebook', slot: 0, status: 'Contacted',    msgs: ['Been waiting 3 days for response', 'This is ridiculous'], est: 9500000, score: 4, sentiment: 'frustrated', urgency: 'critical', intent: 'complaint' },

  // Website (mixed identifiers)
  { name: 'Form Submission #1', phone: 'web-form-001',   platform: 'website',  slot: 0, status: 'New',          msgs: ['Submitted contact form from /pricing'], est: 0, score: 5, sentiment: 'neutral', urgency: 'medium', intent: 'general_inquiry' },
  { name: 'Live Chat Visitor', phone: 'web-chat-7842',  platform: 'website',   slot: 0, status: 'Negotiating',  msgs: ['Chatted on landing page', 'Wants enterprise plan'], est: 480000, score: 9, sentiment: 'positive', urgency: 'high', intent: 'pricing_inquiry' },
];

// ── Insert leads + messages ────────────────────────────────────
// Pre-compute ISO timestamps in JS so SQLite doesn't have to parse multi-modifier strings.
// We pass plain TEXT values; SQLite stores them as-is and DATETIME() reads them fine.
function offsetIso(daysAgo, extraHoursAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAgo);
  d.setHours(d.getHours() + extraHoursAgo);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

const insertLead = db.prepare(`
  INSERT INTO leads (
    id, user_id, workspace_id, customer_name, customer_phone, email,
    first_message, total_messages, status, platform_source, platform_account_id,
    estimated_value, actual_sale, lead_score, sentiment, urgency, intent_category,
    ai_last_analyzed_at, created_at, last_message_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Ensure messages.platform exists before inserting
safeAlter(`ALTER TABLE messages ADD COLUMN platform TEXT DEFAULT 'whatsapp'`);
safeAlter(`ALTER TABLE messages ADD COLUMN platform_account_id TEXT`);

const insertMsg = db.prepare(`
  INSERT INTO messages (id, lead_id, user_id, body, from_me, timestamp, platform, platform_account_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// Optional: insert a tag or two so cards have variety.
// Tags table is keyed by user_id (the workspace owner), not workspace_id.
const ensureTag = (name, color) => {
  const existing = db.prepare(`SELECT id FROM tags WHERE user_id = ? AND name = ?`).get(user.id, name);
  if (existing) return existing.id;
  const id = generateId();
  try {
    db.prepare(`INSERT INTO tags (id, user_id, name, color) VALUES (?, ?, ?, ?)`)
      .run(id, user.id, name, color);
    return id;
  } catch (e) {
    console.log(`⚠️  Could not create tag "${name}":`, e.message);
    return null;
  }
};
const tagHot = ensureTag('Hot 🔥', '#ef4444');
const tagCold = ensureTag('Cold', '#06b6d4');
const tagVIP = ensureTag('VIP', '#8b5cf6');

const insertLeadTag = (leadId, tagId) => {
  try {
    db.prepare(`INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)`).run(leadId, tagId);
  } catch {}
};

let createdCount = 0;
const insertAll = db.transaction(() => {
  leadTemplates.forEach((t, idx) => {
    const leadId = generateId();
    const platformAccountId = accounts[`${t.platform}-${t.slot}`] || null;
    // Stagger created_at and last_message_at so the dashboard shows a realistic timeline
    const daysAgo = -(idx + 1);             // 1, 2, 3, ... days ago
    const msgOffset = -(Math.floor(idx / 3));// most recent message a few hours after creation

    const createdIso = offsetIso(daysAgo);
    const lastIso = offsetIso(daysAgo, -Math.floor(Math.random() * 12));
    insertLead.run(
      leadId,
      user.id,
      user.workspace_id,
      t.name,
      t.phone,
      t.platform === 'website' ? `${t.name.replace(/\s+/g, '.').toLowerCase()}@example.com` : null,
      `[SEED] ${t.msgs[0]}`,
      t.msgs.length,
      t.status,
      t.platform,
      platformAccountId,
      t.est || 0,
      t.sale || 0,
      t.score || 0,
      t.sentiment || null,
      t.urgency || null,
      t.intent || null,
      offsetIso(0),  // ai_last_analyzed_at = now
      createdIso,
      lastIso
    );

    // Sample messages — alternate customer/staff, walking backwards in time from the lead's last_message_at
    t.msgs.forEach((body, i) => {
      const msgIso = offsetIso(daysAgo, (i - t.msgs.length) * 2); // earlier msgs further back
      insertMsg.run(
        generateId(),
        leadId,
        user.id,
        body,
        i % 2 === 1 ? 1 : 0,
        msgIso,
        t.platform,
        platformAccountId
      );
    });

    // Tags
    if (t.score >= 8 && tagHot) insertLeadTag(leadId, tagHot);
    if (t.score <= 4 && tagCold) insertLeadTag(leadId, tagCold);
    if ((t.est || 0) >= 20000000 && tagVIP) insertLeadTag(leadId, tagVIP);

    // Give a few leads multi-platform connected channels so the unlock logic is testable
    if (idx < 3) {
      // First three leads get extra Instagram and Facebook connections wired
      try {
        const extras = [
          { platform: 'instagram', identifier: `@${t.name.split(' ')[0].toLowerCase()}_dm` },
          { platform: 'facebook',  identifier: `fb-${t.name.split(' ')[0].toLowerCase()}-${idx}` },
        ];
        for (const ex of extras) {
          if (ex.platform === t.platform) continue;
          db.prepare(`INSERT OR IGNORE INTO lead_channels (id, lead_id, workspace_id, platform, identifier, added_by) VALUES (?, ?, ?, ?, ?, 'seed')`)
            .run(generateId(), leadId, user.workspace_id, ex.platform, ex.identifier);
        }
      } catch (e) { /* lead_channels may not exist yet on very old DBs — non-fatal */ }
    }

    createdCount++;
  });
});

try {
  insertAll();
  console.log(`✅ Inserted ${createdCount} dummy leads across WhatsApp / Instagram / Facebook / Website`);
  console.log(`   • 6 WhatsApp leads (real phone numbers)`);
  console.log(`   • 3 Instagram leads (platform IDs — should show as "Instagram user")`);
  console.log(`   • 3 Facebook leads (platform IDs — should show as "Facebook user")`);
  console.log(`   • 2 Website leads`);
  console.log(`   • All have score / sentiment / urgency populated so badges render`);
  console.log(`   • Hot/Cold/VIP tags applied where appropriate`);
  console.log('');
  console.log('Refresh your dashboard to see them.');
  console.log('To wipe and reseed: node seed-leads.js --clean');
} catch (e) {
  console.error('❌ Seed failed:', e.message);
  process.exit(1);
}

db.close();
