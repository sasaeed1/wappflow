require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const webpush = require('web-push');
const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');
const aiEngine = require('./ai-engine');

// VAPID keys (generate once, store in env for production)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BPismtnocRKwNB_MlJqoFdWIG5vKNGhw89sH0nut1Ms7mS2Jlod5htjjgL53Wd_X8emuODWC5a1P1Hy52oUqAv0';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '5FnXMUgUbQhTv4IelAJdA_y5SpeM344CJUIRQ9_oRiE';
webpush.setVapidDetails('mailto:admin@wappflow.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ── Global error guards — keep the server alive even if a promise rejects ──
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️  Unhandled Rejection (server kept alive):', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️  Uncaught Exception (server kept alive):', err.message);
});

const app = express();
// Behind the nginx reverse proxy — trust the first proxy hop so req.ip resolves
// to the real client IP (from X-Forwarded-For). Without this, express-rate-limit
// keys every request to the proxy IP and buckets ALL users into one shared limit,
// and emits ERR_ERL_UNEXPECTED_X_FORWARDED_FOR validation errors.
app.set('trust proxy', 1);
const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : require('path').join(__dirname);
const db = new Database(require('path').join(DATA_DIR, 'wappflow.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Upload directories
// Persistent data directories (Railway volume: /data, local: __dirname)
const DATA_ROOT = process.env.NODE_ENV === 'production' ? '/data' : __dirname;
['/data', DATA_ROOT, path.join(DATA_ROOT, 'uploads'), path.join(DATA_ROOT, 'uploads', 'logos'), path.join(DATA_ROOT, 'uploads', 'voices'), path.join(DATA_ROOT, 'uploads', 'avatars'), path.join(DATA_ROOT, 'uploads', 'images'), path.join(DATA_ROOT, 'uploads', 'videos'), path.join(DATA_ROOT, 'uploads', 'files')].forEach(d => {
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
});
const uploadsDir = path.join(DATA_ROOT, 'uploads');
const logosDir   = path.join(DATA_ROOT, 'uploads', 'logos');
const voicesDir  = path.join(DATA_ROOT, 'uploads', 'voices');
const avatarsDir = path.join(DATA_ROOT, 'uploads', 'avatars');

// Security middleware. Disable CSP (we use inline styles heavily) and set CORP to
// cross-origin so the Next.js dev frontend on :3000 can load /uploads/* images
// served from this API on :3001. Without this, helmet sends CORP=same-origin and
// browsers block all cross-origin image/media subresource requests.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
}));

// Rate limiter — per real client IP (trust proxy is set above).
// 3000 req / 15 min comfortably covers a heavy CRM user (status polling, SSE,
// dashboard refreshes) while still blocking genuine abuse. Static /uploads is
// exempt so an image-heavy chat doesn't trip the limit. A 429 returns a JSON
// { error } body so the frontend can surface a clear message instead of a
// generic failure.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/uploads/'),
  message: { error: 'Too many requests — please wait a minute and try again.' },
});
app.use(limiter);

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
// Static uploads — add an explicit Access-Control-Allow-Origin so cross-origin <img> tags work.
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(uploadsDir));

// Multer — general files. Sanitize the original filename so URLs work without encoding.
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const safe = (file.originalname || 'file')
        .normalize('NFKD').replace(/[^\w.\-]/g, '_')
        .slice(0, 100);
      cb(null, `${Date.now()}-${safe}`);
    }
  }),
  limits: { fileSize: 16 * 1024 * 1024 }
});

// Multer — logo uploads
const logoUpload = multer({
  storage: multer.diskStorage({
    destination: logosDir,
    filename: (req, file, cb) => cb(null, `logo-${req.userId || Date.now()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// Multer — voice notes — preserve real extension so WhatsApp can decode correctly
const voiceUpload = multer({
  storage: multer.diskStorage({
    destination: voicesDir,
    filename: (req, file, cb) => {
      const mt = (file.mimetype || '').toLowerCase();
      const ext = mt.includes('ogg') ? 'ogg'
                : mt.includes('webm') ? 'webm'
                : mt.includes('mp4') || mt.includes('m4a') ? 'm4a'
                : mt.includes('mpeg') || mt.includes('mp3') ? 'mp3'
                : (file.originalname && file.originalname.includes('.')) ? file.originalname.split('.').pop()
                : 'ogg';
      cb(null, `voice-${Date.now()}.${ext}`);
    }
  }),
  limits: { fileSize: 16 * 1024 * 1024 }
});

// Multer — avatar / profile picture uploads
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: avatarsDir,
    filename: (req, file, cb) => cb(null, `avatar-${req.userId || Date.now()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: { view_all_leads: true, create_lead: true, edit_lead: true, delete_lead: true, view_reports: true, manage_settings: true, manage_team: true, manage_invoices: true, manage_whatsapp: true },
  admin:       { view_all_leads: true, create_lead: true, edit_lead: true, delete_lead: true, view_reports: true, manage_settings: true, manage_team: true, manage_invoices: true, manage_whatsapp: false },
  manager:     { view_all_leads: true, create_lead: true, edit_lead: true, delete_lead: false, view_reports: true, manage_settings: false, manage_team: false, manage_invoices: true, manage_whatsapp: false },
  user:        { view_all_leads: false, create_lead: true, edit_lead: true, delete_lead: false, view_reports: false, manage_settings: false, manage_team: false, manage_invoices: false, manage_whatsapp: false },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PLAN TIERS — single source of truth for limits and feature flags
// ═══════════════════════════════════════════════════════════════════════════════
// limits: -1 means unlimited. Frontend reads via GET /api/workspace/plan-info.
const PLAN_DEFS = {
  free: {
    name: 'Free',
    price: 0,
    limits: {
      leads: 50,
      team_members: 1,
      whatsapp_accounts: 1,
      instagram_accounts: 0,
      facebook_accounts: 0,
      website_forms: 0,
    },
    features: {
      ai_replies: 'limited',
      email_integration: false,
      shared_inbox: false,
      internal_notes: false,
      analytics: false,
      automations: false,
      google_calendar: false,
      calendly: false,
      multi_channel_inbox: false,
      huddle: false,
      reports: false,
    },
  },
  starter: {
    name: 'Starter',
    price: 19,
    limits: {
      leads: 300,
      team_members: 2,
      whatsapp_accounts: 1,
      instagram_accounts: 0,
      facebook_accounts: 0,
      website_forms: 0,
    },
    features: {
      ai_replies: true,
      email_integration: true,
      shared_inbox: true,
      internal_notes: true,
      analytics: 'basic',
      voice_notes: true,
      automations: false,
      google_calendar: false,
      calendly: false,
      multi_channel_inbox: false,
      huddle: false,
      reports: false,
    },
  },
  growth: {
    name: 'Growth',
    price: 49,
    most_popular: true,
    limits: {
      leads: -1,
      team_members: 5,
      whatsapp_accounts: 3,
      instagram_accounts: 3,
      facebook_accounts: 3,
      website_forms: 3,
    },
    features: {
      ai_replies: true,
      email_integration: true,
      shared_inbox: true,
      internal_notes: true,
      analytics: true,
      voice_notes: true,
      automations: true,
      google_calendar: true,
      calendly: true,
      multi_channel_inbox: true,
      huddle: true,
      reports: true,
    },
  },
  enterprise: {
    name: 'Enterprise',
    price: null,
    limits: {
      leads: -1,
      team_members: -1,
      whatsapp_accounts: -1,
      instagram_accounts: -1,
      facebook_accounts: -1,
      website_forms: -1,
    },
    features: {
      ai_replies: true,
      email_integration: true,
      shared_inbox: true,
      internal_notes: true,
      analytics: true,
      voice_notes: true,
      automations: true,
      google_calendar: true,
      calendly: true,
      multi_channel_inbox: true,
      huddle: true,
      reports: true,
      api_access: true,
      white_label: true,
      sso: true,
      custom_integrations: true,
      byok_ai: true,
      dedicated_support: true,
    },
  },
};

function getWorkspacePlan(workspaceId) {
  let row = db.prepare(`SELECT * FROM workspace_plan WHERE workspace_id = ?`).get(workspaceId);
  if (!row) {
    db.prepare(`INSERT INTO workspace_plan (workspace_id, plan) VALUES (?, 'free')`).run(workspaceId);
    row = db.prepare(`SELECT * FROM workspace_plan WHERE workspace_id = ?`).get(workspaceId);
  }
  return row;
}

function getPlanInfo(workspaceId) {
  const row = getWorkspacePlan(workspaceId);
  const def = PLAN_DEFS[row.plan] || PLAN_DEFS.free;
  return { tier: row.plan, ...def, raw: row };
}

function getWorkspaceUsage(workspaceId) {
  const safeCount = (sql) => {
    try { return db.prepare(sql).get(workspaceId).n; } catch { return 0; }
  };
  return {
    leads: safeCount('SELECT COUNT(*) as n FROM leads WHERE workspace_id = ? AND (is_deleted IS NULL OR is_deleted = 0)'),
    team_members: safeCount("SELECT COUNT(*) as n FROM workspace_members WHERE workspace_id = ? AND (invite_status = 'active' OR invite_status IS NULL)"),
    whatsapp_accounts: safeCount("SELECT COUNT(*) as n FROM platform_accounts WHERE workspace_id = ? AND platform = 'whatsapp'"),
    instagram_accounts: safeCount("SELECT COUNT(*) as n FROM platform_accounts WHERE workspace_id = ? AND platform = 'instagram'"),
    facebook_accounts: safeCount("SELECT COUNT(*) as n FROM platform_accounts WHERE workspace_id = ? AND platform = 'facebook'"),
    website_forms: safeCount("SELECT COUNT(*) as n FROM platform_accounts WHERE workspace_id = ? AND platform = 'website'"),
  };
}

// Returns { ok: true } or { ok: false, code: 'limit_exceeded', limit, usage, plan, message }
function checkLimit(workspaceId, limitKey) {
  const info = getPlanInfo(workspaceId);
  const limit = info.limits[limitKey];
  if (limit === -1 || limit == null) return { ok: true };
  const usage = getWorkspaceUsage(workspaceId);
  const current = usage[limitKey] || 0;
  if (current >= limit) {
    const human = limitKey.replace(/_/g, ' ');
    return {
      ok: false,
      code: 'limit_exceeded',
      limit,
      usage: current,
      plan: info.tier,
      message: `Your ${info.name} plan allows ${limit} ${human}. Upgrade to add more.`,
    };
  }
  return { ok: true };
}

function checkFeature(workspaceId, featureKey) {
  const info = getPlanInfo(workspaceId);
  const v = info.features[featureKey];
  return { ok: !!v, plan: info.tier, planName: info.name, value: v };
}

// Auth Middleware — accepts token from Authorization header OR query string (for SSE/EventSource which can't set headers)
const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token;
    if (!token) throw new Error();
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;

    // Workspace context
    const user = db.prepare('SELECT workspace_id, business_name, full_name FROM users WHERE id = ?').get(decoded.userId);
    const workspaceId = user?.workspace_id || decoded.userId;
    req.workspaceId = workspaceId;
    req.senderName = user?.full_name || user?.business_name || 'Team Member';

    // Get role from workspace_members
    const member = db.prepare('SELECT role, permissions FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, decoded.userId);
    req.userRole = member?.role || 'super_admin';
    req.userPermissions = member?.permissions ? JSON.parse(member.permissions) : DEFAULT_ROLE_PERMISSIONS[req.userRole] || {};

    // Workspace owner's user_id (super_admin) — used for shared data (tags, presets, settings)
    const ownerRow = db.prepare("SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin' LIMIT 1").get(workspaceId);
    req.workspaceOwnerId = ownerRow?.user_id || decoded.userId;

    next();
  } catch {
    res.status(401).json({ error: 'Please authenticate' });
  }
};

// ════════════════════════════════════════════════════════════
//  DATABASE SCHEMA
// ════════════════════════════════════════════════════════════

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    business_name TEXT,
    role TEXT DEFAULT 'owner',
    workspace_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    status TEXT DEFAULT 'New',
    first_message TEXT,
    total_messages INTEGER DEFAULT 0,
    estimated_value REAL,
    actual_sale REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    due_date TIMESTAMP NOT NULL,
    completed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS message_presets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS lead_tags (
    lead_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (lead_id, tag_id),
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    body TEXT,
    from_me INTEGER DEFAULT 0,
    media_url TEXT,
    media_type TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id)
  );

  CREATE TABLE IF NOT EXISTS company_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    company_name TEXT,
    company_logo TEXT,
    company_address TEXT,
    company_email TEXT,
    company_phone TEXT,
    company_website TEXT,
    currency TEXT DEFAULT 'USD',
    currency_symbol TEXT DEFAULT '$',
    currency_position TEXT DEFAULT 'before',
    invoice_prefix TEXT DEFAULT 'INV',
    invoice_counter INTEGER DEFAULT 1000,
    tax_name TEXT DEFAULT 'Tax',
    tax_rate REAL DEFAULT 0,
    email_signature TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'agent',
    status TEXT DEFAULT 'active',
    invite_token TEXT,
    user_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    lead_id TEXT,
    invoice_number TEXT NOT NULL,
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    items TEXT NOT NULL DEFAULT '[]',
    subtotal REAL DEFAULT 0,
    tax_rate REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    total REAL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    currency_symbol TEXT DEFAULT '$',
    status TEXT DEFAULT 'draft',
    due_date TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (lead_id) REFERENCES leads(id)
  );

  CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    delay_days INTEGER DEFAULT 0,
    trigger_event TEXT DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS email_workflows (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    template_name TEXT,
    template_subject TEXT,
    status TEXT DEFAULT 'pending',
    scheduled_at TIMESTAMP,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (lead_id) REFERENCES leads(id)
  );

  CREATE TABLE IF NOT EXISTS contact_history (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS auto_reply_rules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    keywords TEXT NOT NULL,
    reply_message TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    match_type TEXT DEFAULT 'contains',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS chat_channels (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_private INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    body TEXT,
    media_url TEXT,
    media_type TEXT,
    reply_to TEXT,
    is_edited INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES chat_channels(id)
  );

  CREATE TABLE IF NOT EXISTS chat_reactions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workspace_members (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    permissions TEXT,
    invite_email TEXT,
    invite_token TEXT UNIQUE,
    invite_status TEXT DEFAULT 'active',
    full_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
  );

  CREATE TABLE IF NOT EXISTS workspace_role_permissions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    role TEXT NOT NULL,
    permissions TEXT NOT NULL DEFAULT '{}',
    UNIQUE(workspace_id, role),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
  );

  CREATE TABLE IF NOT EXISTS email_smtp_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    smtp_host TEXT,
    smtp_port INTEGER DEFAULT 587,
    smtp_secure INTEGER DEFAULT 0,
    smtp_user TEXT,
    smtp_pass TEXT,
    from_name TEXT,
    from_email TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS lead_emails (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'sent',
    from_email TEXT,
    to_email TEXT,
    subject TEXT,
    body TEXT,
    status TEXT DEFAULT 'sent',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id)
  );

CREATE TABLE IF NOT EXISTS email_imap_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  imap_host TEXT,
  imap_port INTEGER DEFAULT 993,
  imap_secure INTEGER DEFAULT 1,
  imap_user TEXT,
  imap_pass TEXT,
  is_enabled INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ai_memories (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    confidence INTEGER DEFAULT 80,
    source TEXT DEFAULT 'manual',
    document_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    document_name TEXT NOT NULL,
    file_path TEXT,
    file_type TEXT,
    extracted_text TEXT,
    memory_count INTEGER DEFAULT 0,
    processed INTEGER DEFAULT 0,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS platform_accounts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    account_name TEXT NOT NULL DEFAULT 'Account 1',
    account_handle TEXT,
    credentials TEXT DEFAULT '{}',
    webhook_verify_token TEXT,
    status TEXT DEFAULT 'disconnected',
    slot_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
  );
  `);

// ── Safe ALTER TABLE (ignore duplicate column errors) ──
function safeAlter(sql) {
  try { db.exec(sql); } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
}

safeAlter('ALTER TABLE leads ADD COLUMN is_deleted INTEGER DEFAULT 0');
safeAlter('ALTER TABLE leads ADD COLUMN deleted_at TIMESTAMP');
safeAlter('ALTER TABLE leads ADD COLUMN closed_at TIMESTAMP');
safeAlter('ALTER TABLE leads ADD COLUMN lost_reason TEXT');
safeAlter('ALTER TABLE leads ADD COLUMN last_contacted_at TIMESTAMP');
safeAlter('ALTER TABLE leads ADD COLUMN date_of_birth TEXT');
safeAlter('ALTER TABLE leads ADD COLUMN address TEXT');
safeAlter('ALTER TABLE leads ADD COLUMN email TEXT');
safeAlter('ALTER TABLE leads ADD COLUMN assigned_to TEXT');
safeAlter('ALTER TABLE leads ADD COLUMN lead_source TEXT');
safeAlter('ALTER TABLE leads ADD COLUMN lead_score INTEGER DEFAULT 0');
safeAlter('ALTER TABLE leads ADD COLUMN sentiment TEXT');         // positive | neutral | negative | frustrated
safeAlter('ALTER TABLE leads ADD COLUMN urgency TEXT');           // low | medium | high | critical
safeAlter('ALTER TABLE leads ADD COLUMN intent_category TEXT');   // pricing_inquiry | product_inquiry | ...
safeAlter('ALTER TABLE leads ADD COLUMN ai_last_analyzed_at TIMESTAMP');
db.exec(`CREATE TABLE IF NOT EXISTS workspace_ai_profile (
  workspace_id TEXT PRIMARY KEY,
  business_description TEXT,
  tone TEXT DEFAULT 'professional',
  language TEXT DEFAULT 'English',
  signature TEXT,
  dos TEXT,
  donts TEXT,
  auto_analyze INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);
safeAlter('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "owner"');
safeAlter('ALTER TABLE users ADD COLUMN workspace_id TEXT');
safeAlter('ALTER TABLE reminders ADD COLUMN reminder_date TIMESTAMP');
safeAlter('ALTER TABLE reminders ADD COLUMN message TEXT');
safeAlter('ALTER TABLE reminders ADD COLUMN is_completed INTEGER DEFAULT 0');
safeAlter('ALTER TABLE leads ADD COLUMN workspace_id TEXT');
safeAlter('ALTER TABLE users ADD COLUMN full_name TEXT');
safeAlter('ALTER TABLE users ADD COLUMN profile_picture TEXT');
safeAlter('ALTER TABLE users ADD COLUMN phone TEXT');
safeAlter('ALTER TABLE users ADD COLUMN bio TEXT');
safeAlter('ALTER TABLE users ADD COLUMN google_id TEXT');
safeAlter('ALTER TABLE messages ADD COLUMN media_url TEXT');
safeAlter('ALTER TABLE messages ADD COLUMN media_type TEXT');
safeAlter('ALTER TABLE messages ADD COLUMN wa_message_id TEXT');
// Multi-platform message routing: which platform this message lives on, and which connected account it used.
safeAlter('ALTER TABLE messages ADD COLUMN platform TEXT DEFAULT "whatsapp"');
safeAlter('ALTER TABLE messages ADD COLUMN platform_account_id TEXT');
// Backfill: pre-existing messages with NULL platform default to whatsapp (since that was the only channel before).
try { db.prepare('UPDATE messages SET platform = ? WHERE platform IS NULL').run('whatsapp'); } catch {}
safeAlter('ALTER TABLE knowledge_documents ADD COLUMN workspace_id TEXT');
safeAlter('ALTER TABLE ai_memories ADD COLUMN document_id TEXT');
safeAlter('ALTER TABLE leads ADD COLUMN platform_account_id TEXT');
safeAlter('ALTER TABLE leads ADD COLUMN platform_source TEXT');
safeAlter('ALTER TABLE platform_accounts ADD COLUMN nickname TEXT');
safeAlter('ALTER TABLE platform_accounts ADD COLUMN account_handle TEXT');
safeAlter('ALTER TABLE platform_accounts ADD COLUMN slot_index INTEGER DEFAULT 0');

// ── Lost-reason presets (item 5) — workspace-defined reasons for Closed-Lost leads.
db.exec(`
  CREATE TABLE IF NOT EXISTS lost_reasons (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Personal productivity panel (item 23) — per-user tasks + quick notes (Keep).
db.exec(`
  CREATE TABLE IF NOT EXISTS user_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workspace_id TEXT,
    title TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    due_date TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS quick_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workspace_id TEXT,
    content TEXT,
    color TEXT DEFAULT 'yellow',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Reminders schema drift fix: older DBs created the table BEFORE these columns existed.
// CREATE TABLE IF NOT EXISTS is a no-op when the table already exists, so add the columns explicitly.
safeAlter("ALTER TABLE reminders ADD COLUMN title TEXT");
safeAlter("ALTER TABLE reminders ADD COLUMN due_date TIMESTAMP");
safeAlter("ALTER TABLE reminders ADD COLUMN completed INTEGER DEFAULT 0");
try { db.prepare("UPDATE reminders SET title = COALESCE(title, message), due_date = COALESCE(due_date, reminder_date), completed = COALESCE(completed, is_completed, 0)").run(); } catch {}

// ── Phase-1 multi-channel tables. Idempotent CREATE IF NOT EXISTS so they're safe to keep.
db.exec(`
  CREATE TABLE IF NOT EXISTS lead_channels (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    workspace_id TEXT,
    platform TEXT NOT NULL,
    identifier TEXT NOT NULL,
    platform_account_id TEXT,
    display_name TEXT,
    added_by TEXT DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lead_id, platform, identifier)
  );

  CREATE TABLE IF NOT EXISTS lead_relations (
    id TEXT PRIMARY KEY,
    lead_id_a TEXT NOT NULL,
    lead_id_b TEXT NOT NULL,
    relation_type TEXT DEFAULT 'linked',
    merged_into TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lead_id_a, lead_id_b)
  );

  CREATE TABLE IF NOT EXISTS activity_timeline (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    workspace_id TEXT,
    user_id TEXT,
    actor_name TEXT,
    activity_type TEXT NOT NULL,
    platform TEXT,
    platform_account_id TEXT,
    account_nickname TEXT,
    title TEXT,
    body TEXT,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workspace_plan (
    workspace_id TEXT PRIMARY KEY,
    plan TEXT DEFAULT 'starter',
    features TEXT,
    limits TEXT,
    trial_ends_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS outbound_message_queue (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    lead_id TEXT,
    platform TEXT,
    platform_account_id TEXT,
    message_type TEXT,
    payload TEXT,
    status TEXT DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    next_retry_at TIMESTAMP,
    sent_at TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    event_id TEXT NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, event_id)
  );

  CREATE TABLE IF NOT EXISTS workspace_integrations (
    workspace_id TEXT PRIMARY KEY,
    calendly_url TEXT,
    google_calendar_refresh_token TEXT,
    google_calendar_email TEXT,
    google_calendar_connected_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    user_id TEXT,
    provider TEXT DEFAULT 'google',
    title TEXT,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    meet_link TEXT,
    event_id TEXT,
    html_link TEXT,
    notes TEXT,
    status TEXT DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Migrate password_hash → password for databases created with old schema ──
safeAlter('ALTER TABLE users ADD COLUMN password TEXT');
try {
  const migrated = db.prepare(`UPDATE users SET password = password_hash WHERE password IS NULL AND password_hash IS NOT NULL`).run();
  if (migrated.changes > 0) console.log(`✅ Migrated ${migrated.changes} user password(s) from password_hash → password`);
} catch (e) { /* password_hash column may not exist on fresh DBs — that's fine */ }

// ── Workspace migration: create workspace for each existing user ──
try {
  const usersWithoutWs = db.prepare("SELECT * FROM users WHERE workspace_id IS NULL OR workspace_id = ''").all();
  if (usersWithoutWs.length > 0) {
    const insertWs = db.prepare("INSERT OR IGNORE INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)");
    const insertMember = db.prepare("INSERT OR IGNORE INTO workspace_members (id, workspace_id, user_id, role, full_name, invite_status) VALUES (?, ?, ?, 'super_admin', ?, 'active')");
    const updateUser = db.prepare("UPDATE users SET workspace_id = ? WHERE id = ?");
    const migrate = db.transaction(() => {
      usersWithoutWs.forEach(user => {
        const wsId = user.id; // use user.id as workspace id for backward compat
        insertWs.run(wsId, user.business_name || 'My Workspace', user.id);
        insertMember.run(generateId(), wsId, user.id, user.business_name || user.email);
        updateUser.run(wsId, user.id);
      });
    });
    migrate();
    console.log(`✅ Created workspaces for ${usersWithoutWs.length} existing user(s)`);
  }
  // Migrate leads: set workspace_id = user_id for existing records
  const leadsMigrated = db.prepare("UPDATE leads SET workspace_id = user_id WHERE workspace_id IS NULL").run();
  if (leadsMigrated.changes > 0) console.log(`✅ Migrated workspace_id on ${leadsMigrated.changes} lead(s)`);
} catch (e) { console.error('Workspace migration error:', e.message); }

console.log('✅ Database schema ready');

// ════════════════════════════════════════════════════════════
//  SSE — SERVER-SENT EVENTS
// ════════════════════════════════════════════════════════════

const sseClients = new Map(); // userId -> res[]

app.get('/api/events', auth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  const userId = req.userId;
  if (!sseClients.has(userId)) sseClients.set(userId, []);
  sseClients.get(userId).push(res);

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const clients = sseClients.get(userId) || [];
    const idx = clients.indexOf(res);
    if (idx > -1) clients.splice(idx, 1);
  });
});

function broadcastToUser(userId, type, data) {
  const clients = sseClients.get(userId) || [];
  const payload = `data: ${JSON.stringify({ type, ...data })}\n\n`;
  clients.forEach(r => { try { r.write(payload); } catch {} });
}

function broadcastToWorkspace(workspaceId, type, data) {
  // Get all user_ids in this workspace
  const members = db.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id IS NOT NULL').all(workspaceId);
  members.forEach(m => broadcastToUser(m.user_id, type, data));
}

// Send Web Push notification to all subscriptions for a user
async function sendPushToUser(userId, title, body, data = {}) {
  try {
    const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
    const payload = JSON.stringify({ title, body, data, icon: '/icon.png', badge: '/badge.png' });
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (e) {
        if (e.statusCode === 410) {
          // Subscription expired, remove it
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        }
      }
    }
  } catch (e) { console.error('Push error:', e.message); }
}

// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Phone normalisation helpers ──────────────────────────────────────────────
// Strip every non-digit character so "+92 310 154 7564" and "+923101547564" both
// become "923101547564" and can be compared reliably.
function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

// Find an active (non-deleted) lead in a workspace by phone number, tolerating
// spaces, dashes, country-code variants, etc.
// Strategy:
//   1. Exact digit-only match  (handles spacing / formatting differences)
//   2. Last-10-digit suffix match  (handles +92 vs 0 country-code swap)
function findLeadByPhone(workspaceId, phone) {
  const norm = normalizePhone(phone);
  if (!norm) return null;

  const stripSQL = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    customer_phone,' ',''),'+',''),'-',''),'(',''),')',''),'.','')`;
  const base = `SELECT * FROM leads WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`;

  // 1. Exact digits match
  let lead = db.prepare(`${base} AND ${stripSQL} = ?`).get(workspaceId, norm);
  if (lead) return lead;

  // 2. Suffix match on last 10 digits (country-code tolerant)
  if (norm.length >= 10) {
    const suffix = norm.slice(-10);
    lead = db.prepare(`${base} AND ${stripSQL} LIKE ?`).get(workspaceId, `%${suffix}`);
  }
  return lead || null;
}

// Enrich one lead with platform-account info so the UI can render
// a "WhatsApp · <nickname>" chip without an extra round-trip per lead.
function attachAccountInfo(lead) {
  if (!lead || !lead.platform_account_id) return lead;
  try {
    const acc = db.prepare('SELECT account_name, nickname FROM platform_accounts WHERE id = ?').get(lead.platform_account_id);
    if (acc) {
      lead.account_nickname = acc.nickname || null;
      lead.account_name = acc.account_name || null;
      lead.account_display_name = acc.nickname || acc.account_name || null;
    }
  } catch {}
  return lead;
}

function attachTags(leads) {
  return leads.map(lead => {
    const enriched = {
      ...lead,
      tags: db.prepare(`
        SELECT t.id, t.name, t.color FROM tags t
        JOIN lead_tags lt ON t.id = lt.tag_id
        WHERE lt.lead_id = ? ORDER BY t.name
      `).all(lead.id)
    };
    return attachAccountInfo(enriched);
  });
}

function getCurrencySymbol(userId) {
  const cs = db.prepare('SELECT currency_symbol FROM company_settings WHERE user_id = ?').get(userId);
  return cs?.currency_symbol || '$';
}

function logAudit(workspaceId, userId, action, entityType, entityId, details) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, workspace_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(generateId(), workspaceId, userId, action, entityType, entityId, JSON.stringify(details));
  } catch {}
}

function addContactHistory(leadId, userId, type, description, metadata = null) {
  try {
    db.prepare(`
      INSERT INTO contact_history (id, lead_id, user_id, type, description, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(generateId(), leadId, userId, type, description, metadata ? JSON.stringify(metadata) : null);
  } catch {}
}

// ════════════════════════════════════════════════════════════
//  WHATSAPP SERVICE
// ════════════════════════════════════════════════════════════

const { WhatsAppService, WhatsAppManager } = require('./whatsapp-service');
const whatsappService = new WhatsAppManager(db, broadcastToUser);

// Rate-limit map for lead message sync — prevents flooding Puppeteer with
// repeated fetchHistory calls when a user opens the same lead multiple times.
// Key: leadId, Value: timestamp of last sync
const syncCooldowns = new Map();
console.log('🔄 Initializing WhatsApp...');
whatsappService.loadAccounts();

// ════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, businessName } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and include an uppercase letter and a special character.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = generateId();
    const workspaceId = generateId();

    // Create workspace first
    db.prepare(`INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)`)
      .run(workspaceId, businessName || 'My Workspace', userId);

    // Create user with workspace_id
    db.prepare(`INSERT INTO users (id, email, password, business_name, role, workspace_id) VALUES (?, ?, ?, ?, 'owner', ?)`)
      .run(userId, email, hashedPassword, businessName, workspaceId);

    // Register as super_admin in workspace
    db.prepare(`INSERT INTO workspace_members (id, workspace_id, user_id, role, full_name, invite_status) VALUES (?, ?, ?, 'super_admin', ?, 'active')`)
      .run(generateId(), workspaceId, userId, businessName);

    // Default company settings
    db.prepare(`INSERT OR IGNORE INTO company_settings (id, user_id, company_name) VALUES (?, ?, ?)`)
      .run(generateId(), userId, businessName);

    const token = jwt.sign({ userId }, JWT_SECRET);
    res.status(201).json({
      token,
      user: { id: userId, email, business_name: businessName, role: 'super_admin', workspace_id: workspaceId },
      workspace: { id: workspaceId, name: businessName }
    });
  } catch (error) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    const workspace = db.prepare('SELECT id, name FROM workspaces WHERE id = ?').get(user.workspace_id);
    const memberRow = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(user.workspace_id || user.id, user.id);
    const role = memberRow?.role || 'super_admin';
    res.json({ token, user: { id: user.id, email: user.email, business_name: user.business_name, role, workspace_id: user.workspace_id }, workspace });
  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

// PUT /api/auth/password — change own password (requires current password)
app.put('/api/auth/password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'current_password and new_password are required' });
    if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const storedHash = user.password || user.password_hash;
    const isMatch = await bcrypt.compare(current_password, storedHash);
    if (!isMatch) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(newHash, req.userId);
    logAudit(req.workspaceId, req.userId, 'change_password', 'user', req.userId, {});
    res.json({ message: 'Password changed successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', auth, (req, res) => {
  try {
    const user = db.prepare('SELECT id, email, business_name, role, workspace_id FROM users WHERE id = ?').get(req.userId);
    const cs = db.prepare('SELECT * FROM company_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    const workspace = db.prepare('SELECT id, name FROM workspaces WHERE id = ?').get(req.workspaceId);
    const memberInfo = db.prepare('SELECT role, full_name FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(req.workspaceId, req.userId);
    res.json({ user: { ...user, role: req.userRole }, company: cs, workspace, memberRole: memberInfo?.role });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/invite-info/:token — get info about an invite without auth
app.get('/api/auth/invite-info/:token', (req, res) => {
  try {
    const member = db.prepare('SELECT wm.*, w.name as workspace_name FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id WHERE wm.invite_token = ? AND wm.invite_status = ?').get(req.params.token, 'pending');
    if (!member) return res.status(404).json({ error: 'Invalid or expired invite' });
    res.json({ email: member.invite_email, workspace_name: member.workspace_name, role: member.role });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/accept-invite — set password and activate account
app.post('/api/auth/accept-invite', async (req, res) => {
  try {
    const { token, password, full_name } = req.body;
    const member = db.prepare('SELECT * FROM workspace_members WHERE invite_token = ? AND invite_status = ?').get(token, 'pending');
    if (!member) return res.status(404).json({ error: 'Invalid or expired invite' });

    if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and include an uppercase letter and a special character.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    let userId = member.user_id;

    if (!userId) {
      // Create new user
      userId = generateId();
      db.prepare(`INSERT INTO users (id, email, password, business_name, role, workspace_id, full_name) VALUES (?, ?, ?, ?, 'member', ?, ?)`)
        .run(userId, member.invite_email, hashedPassword, full_name || member.invite_email, member.workspace_id, full_name);
    } else {
      // Update existing user password
      db.prepare('UPDATE users SET password = ?, full_name = ? WHERE id = ?').run(hashedPassword, full_name, userId);
    }

    // Activate workspace member
    db.prepare('UPDATE workspace_members SET user_id = ?, full_name = ?, invite_status = ?, invite_token = NULL WHERE id = ?')
      .run(userId, full_name || member.invite_email, 'active', member.id);
    db.prepare('UPDATE users SET workspace_id = ? WHERE id = ?').run(member.workspace_id, userId);

    const token2 = jwt.sign({ userId }, JWT_SECRET);
    const workspace = db.prepare('SELECT id, name FROM workspaces WHERE id = ?').get(member.workspace_id);
    res.json({ token: token2, user: { id: userId, email: member.invite_email, role: member.role, workspace_id: member.workspace_id }, workspace });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/google — sign in or sign up with Google ID token
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, businessName } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential required' });

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if user already exists (by google_id or email)
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId)
              || db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (user) {
      // Update google_id and profile picture if first Google login
      if (!user.google_id) {
        db.prepare('UPDATE users SET google_id = ?, profile_picture = COALESCE(profile_picture, ?) WHERE id = ?')
          .run(googleId, picture || null, user.id);
      }
      if (!user.workspace_id) {
        // Create workspace for legacy user
        const wsId = user.id;
        db.prepare('INSERT OR IGNORE INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)').run(wsId, user.business_name || 'My Workspace', user.id);
        db.prepare('INSERT OR IGNORE INTO workspace_members (id, workspace_id, user_id, role, full_name, invite_status) VALUES (?, ?, ?, \'super_admin\', ?, \'active\')')
          .run(generateId(), wsId, user.id, user.full_name || user.business_name || name);
        db.prepare('UPDATE users SET workspace_id = ? WHERE id = ?').run(wsId, user.id);
        user.workspace_id = wsId;
      }
    } else {
      // New user — create account + workspace
      const userId = generateId();
      const workspaceId = generateId();
      const wsName = businessName || name || email.split('@')[0];
      // Google users get a dummy hashed password they'll never use
      const dummyPwd = await bcrypt.hash(generateId(), 10);

      db.prepare('INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)').run(workspaceId, wsName, userId);
      db.prepare(`INSERT INTO users (id, email, password, business_name, role, workspace_id, full_name, google_id, profile_picture) VALUES (?, ?, ?, ?, 'owner', ?, ?, ?, ?)`)
        .run(userId, email, dummyPwd, wsName, workspaceId, name || '', googleId, picture || null);
      db.prepare(`INSERT INTO workspace_members (id, workspace_id, user_id, role, full_name, invite_status) VALUES (?, ?, ?, 'super_admin', ?, 'active')`)
        .run(generateId(), workspaceId, userId, name || wsName);
      db.prepare('INSERT OR IGNORE INTO company_settings (id, user_id, company_name) VALUES (?, ?, ?)').run(generateId(), userId, wsName);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    const workspace = db.prepare('SELECT id, name FROM workspaces WHERE id = ?').get(user.workspace_id);
    const memberRow = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(user.workspace_id, user.id);
    const role = memberRow?.role || 'super_admin';
    res.json({
      token,
      user: { id: user.id, email: user.email, business_name: user.business_name, full_name: user.full_name, role, workspace_id: user.workspace_id, profile_picture: user.profile_picture },
      workspace,
    });
  } catch (e) {
    console.error('Google auth error:', e.message);
    res.status(400).json({ error: 'Google authentication failed' });
  }
});

// ════════════════════════════════════════════════════════════
//  PROFILE ROUTES
// ════════════════════════════════════════════════════════════

// GET /api/profile — current user's profile
app.get('/api/profile', auth, (req, res) => {
  try {
    const user = db.prepare('SELECT id, email, business_name, full_name, phone, bio, profile_picture, created_at FROM users WHERE id = ?').get(req.userId);
    const member = db.prepare('SELECT role, full_name FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(req.workspaceId, req.userId);
    const workspace = db.prepare('SELECT id, name FROM workspaces WHERE id = ?').get(req.workspaceId);
    res.json({ user: { ...user, role: member?.role || 'super_admin', workspace_name: workspace?.name }, workspace });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/profile — update current user's profile fields
app.put('/api/profile', auth, (req, res) => {
  try {
    const { full_name, phone, bio } = req.body;
    db.prepare('UPDATE users SET full_name = ?, phone = ?, bio = ? WHERE id = ?')
      .run(full_name || null, phone || null, bio || null, req.userId);
    // Also update full_name in workspace_members
    if (full_name) {
      db.prepare('UPDATE workspace_members SET full_name = ? WHERE workspace_id = ? AND user_id = ?')
        .run(full_name, req.workspaceId, req.userId);
    }
    const user = db.prepare('SELECT id, email, business_name, full_name, phone, bio, profile_picture, created_at FROM users WHERE id = ?').get(req.userId);
    const member = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(req.workspaceId, req.userId);
    res.json({ user: { ...user, role: member?.role || 'super_admin' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/profile/avatar — upload profile picture
app.post('/api/profile/avatar', auth, (req, res, next) => {
  // Rename file to use userId
  req.userId = req.userId; // ensure userId set before multer runs filename cb
  next();
}, avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/avatars/${req.file.filename}`;
    db.prepare('UPDATE users SET profile_picture = ? WHERE id = ?').run(url, req.userId);
    res.json({ profile_picture: url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  COMPANY SETTINGS ROUTES
// ════════════════════════════════════════════════════════════

app.get('/api/settings/company', auth, (req, res) => {
  try {
    let cs = db.prepare('SELECT * FROM company_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    if (!cs) {
      const user = db.prepare('SELECT business_name FROM users WHERE id = ?').get(req.workspaceOwnerId);
      db.prepare(`INSERT INTO company_settings (id, user_id, company_name) VALUES (?, ?, ?)`)
        .run(generateId(), req.workspaceOwnerId, user?.business_name || '');
      cs = db.prepare('SELECT * FROM company_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    }
    res.json({ company: cs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings/company', auth, (req, res) => {
  try {
    const {
      company_name, company_address, company_email, company_phone,
      company_website, currency, currency_symbol, currency_position,
      invoice_prefix, tax_name, tax_rate, email_signature
    } = req.body;

    db.prepare(`
      INSERT INTO company_settings (id, user_id, company_name, company_address, company_email, company_phone,
        company_website, currency, currency_symbol, currency_position, invoice_prefix, tax_name, tax_rate, email_signature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        company_name = excluded.company_name,
        company_address = excluded.company_address,
        company_email = excluded.company_email,
        company_phone = excluded.company_phone,
        company_website = excluded.company_website,
        currency = excluded.currency,
        currency_symbol = excluded.currency_symbol,
        currency_position = excluded.currency_position,
        invoice_prefix = excluded.invoice_prefix,
        tax_name = excluded.tax_name,
        tax_rate = excluded.tax_rate,
        email_signature = excluded.email_signature
    `).run(
      generateId(), req.workspaceOwnerId, company_name, company_address, company_email,
      company_phone, company_website, currency, currency_symbol, currency_position,
      invoice_prefix, tax_name, tax_rate, email_signature
    );

    logAudit(req.workspaceId, req.userId, 'update_company_settings', 'company', req.workspaceOwnerId, req.body);
    const cs = db.prepare('SELECT * FROM company_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    res.json({ company: cs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upload company logo
app.post('/api/settings/logo', auth, (req, res) => {
  const doUpload = (req2, res2) => {
    // Rebuild multer with correct userId
    const logoUploadFn = multer({
      storage: multer.diskStorage({
        destination: logosDir,
        filename: (req3, file, cb) => cb(null, `logo-${req2.userId}${path.extname(file.originalname)}`)
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req3, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only images allowed'));
      }
    }).single('logo');

    logoUploadFn(req2, res2, (err) => {
      if (err) return res2.status(400).json({ error: err.message });
      if (!req2.file) return res2.status(400).json({ error: 'No file' });
      const logoUrl = `/uploads/logos/${req2.file.filename}`;
      db.prepare(`
        INSERT INTO company_settings (id, user_id, company_logo) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET company_logo = excluded.company_logo
      `).run(generateId(), req2.userId, logoUrl);
      res2.json({ logo_url: logoUrl });
    });
  };
  doUpload(req, res);
});

// ════════════════════════════════════════════════════════════
//  TEAM MEMBER ROUTES
// ════════════════════════════════════════════════════════════

app.get('/api/team', auth, (req, res) => {
  try {
    // Return workspace members as team members for backward compat
    const members = db.prepare(`
      SELECT wm.id, wm.user_id, wm.role, wm.full_name as name,
             COALESCE(wm.invite_email, u.email) as email,
             wm.invite_status as status, wm.invite_token, wm.created_at
      FROM workspace_members wm
      LEFT JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ?
      ORDER BY CASE wm.role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, wm.created_at ASC
    `).all(req.workspaceId);
    // Also include legacy team_members for backward compat
    const legacyMembers = db.prepare('SELECT * FROM team_members WHERE workspace_id = ?').all(req.workspaceOwnerId);
    res.json({ members, legacyMembers });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/team', auth, (req, res) => {
  try {
    const { name, email, role } = req.body;
    const id = generateId();
    const invite_token = generateId();
    db.prepare(`
      INSERT INTO team_members (id, workspace_id, name, email, role, invite_token)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.userId, name, email, role || 'agent', invite_token);
    const member = db.prepare('SELECT * FROM team_members WHERE id = ?').get(id);
    logAudit(req.userId, req.userId, 'add_team_member', 'team_member', id, { name, email, role });
    res.status(201).json({ member });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/team/:id', auth, (req, res) => {
  try {
    const { name, email, role, status } = req.body;
    db.prepare(`
      UPDATE team_members SET name = ?, email = ?, role = ?, status = ?
      WHERE id = ? AND workspace_id = ?
    `).run(name, email, role, status, req.params.id, req.userId);
    const member = db.prepare('SELECT * FROM team_members WHERE id = ?').get(req.params.id);
    res.json({ member });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/team/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM team_members WHERE id = ? AND workspace_id = ?').run(req.params.id, req.userId);
    res.json({ message: 'Member removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk assign leads
app.post('/api/leads/bulk-assign', auth, (req, res) => {
  try {
    const { lead_ids, assigned_to } = req.body;
    if (!Array.isArray(lead_ids) || lead_ids.length === 0)
      return res.status(400).json({ error: 'lead_ids required' });
    const stmt = db.prepare('UPDATE leads SET assigned_to = ? WHERE id = ? AND workspace_id = ?');
    const updateMany = db.transaction((ids) => ids.forEach(id => stmt.run(assigned_to, id, req.workspaceId)));
    updateMany(lead_ids);
    res.json({ updated: lead_ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Round-robin assign
app.post('/api/leads/round-robin', auth, (req, res) => {
  try {
    const { lead_ids, user_ids } = req.body;
    // If caller provided specific user_ids, use those; otherwise use all active members
    let members;
    if (Array.isArray(user_ids) && user_ids.length > 0) {
      // Validate all provided user_ids are actually members of this workspace
      const placeholders = user_ids.map(() => '?').join(',');
      members = db.prepare(
        `SELECT user_id as id FROM workspace_members WHERE workspace_id = ? AND user_id IN (${placeholders}) AND invite_status = 'active'`
      ).all(req.workspaceId, ...user_ids);
    } else {
      members = db.prepare(`SELECT user_id as id FROM workspace_members WHERE workspace_id = ? AND user_id IS NOT NULL AND invite_status = 'active'`).all(req.workspaceId);
    }
    if (members.length === 0) return res.status(400).json({ error: 'No active team members selected' });
    const stmt = db.prepare('UPDATE leads SET assigned_to = ? WHERE id = ? AND workspace_id = ?');
    const doRR = db.transaction((ids) => {
      ids.forEach((id, i) => stmt.run(members[i % members.length].id, id, req.workspaceId));
    });
    doRR(lead_ids);
    res.json({ updated: lead_ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  LEAD ROUTES
// ════════════════════════════════════════════════════════════

app.get('/api/leads', auth, (req, res) => {
  try {
    const { status, assigned_to, source, platform, account_id } = req.query;
    let query = 'SELECT * FROM leads WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)';
    const params = [req.workspaceId];
    // 'user' role can only see assigned leads
    if (req.userRole === 'user') { query += ' AND assigned_to = ?'; params.push(req.userId); }
    if (status && status !== 'all') { query += ' AND status = ?'; params.push(status); }
    if (assigned_to) { query += ' AND assigned_to = ?'; params.push(assigned_to); }
    if (source) { query += ' AND lead_source = ?'; params.push(source); }
    if (platform && platform !== 'all') { query += ' AND platform_source = ?'; params.push(platform); }
    if (account_id) { query += ' AND platform_account_id = ?'; params.push(account_id); }
    query += ' ORDER BY last_message_at DESC';
    const leads = attachTags(db.prepare(query).all(...params));

    // Attach assignee name from workspace_members
    const members = db.prepare('SELECT user_id, full_name FROM workspace_members WHERE workspace_id = ? AND user_id IS NOT NULL').all(req.workspaceId);
    const memberMap = Object.fromEntries(members.map(m => [m.user_id, m.full_name]));
    // Also from team_members for backward compat
    const teamMembers = db.prepare('SELECT id, name FROM team_members WHERE workspace_id = ?').all(req.workspaceOwnerId);
    teamMembers.forEach(m => { if (!memberMap[m.id]) memberMap[m.id] = m.name; });
    // Attach platform account nickname/name so the UI can show "WhatsApp · Admissions" etc.
    const accounts = db.prepare(`SELECT id, account_name, nickname, platform FROM platform_accounts WHERE workspace_id = ?`).all(req.workspaceId);
    const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));
    const enriched = leads.map(l => {
      const acc = l.platform_account_id ? accountMap[l.platform_account_id] : null;
      return {
        ...l,
        assigned_name: memberMap[l.assigned_to] || null,
        account_nickname: acc?.nickname || null,
        account_name: acc?.account_name || null,
        account_display_name: acc?.nickname || acc?.account_name || null,
      };
    });
    res.json({ leads: enriched });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leads/trash', auth, (req, res) => {
  try {
    const leads = db.prepare(`SELECT * FROM leads WHERE workspace_id = ? AND is_deleted = 1 ORDER BY deleted_at DESC`).all(req.workspaceId);
    res.json({ leads });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk upload leads via JSON (from CSV parse on frontend)
app.post('/api/leads/bulk-upload', auth, (req, res) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads) || leads.length === 0)
      return res.status(400).json({ error: 'No leads provided' });

    // Plan enforcement — block upload if current usage + new leads would exceed limit
    const info = getPlanInfo(req.workspaceId);
    const limit = info.limits.leads;
    if (limit !== -1) {
      const currentCount = db.prepare('SELECT COUNT(*) as n FROM leads WHERE workspace_id = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(req.workspaceId).n;
      if (currentCount + leads.length > limit) {
        const remaining = Math.max(0, limit - currentCount);
        return res.status(403).json({
          error: `Your ${info.name} plan allows ${limit} leads. You have ${currentCount} and tried to add ${leads.length}. ${remaining} slots remaining. Upgrade to Growth for unlimited leads.`,
          code: 'plan_limit',
        });
      }
    }

    let created = 0, skipped = 0;
    const insertLead = db.transaction((leadsArr) => {
      leadsArr.forEach(l => {
        const phone = (l.customer_phone || l.phone || '').toString().trim();
        if (!phone) { skipped++; return; }
        // Duplicate check — normalise digits so "+92 310 154 7564" == "+923101547564"
        if (findLeadByPhone(req.workspaceId, phone)) { skipped++; return; }
        db.prepare(`
          INSERT INTO leads (id, user_id, workspace_id, customer_name, customer_phone, status, email, address, date_of_birth, lead_source, estimated_value)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          generateId(), req.userId, req.workspaceId,
          l.customer_name || l.name || 'Unknown',
          phone,
          l.status || 'New',
          l.email || null,
          l.address || null,
          l.date_of_birth || null,
          l.lead_source || l.source || null,
          parseFloat(l.estimated_value) || null
        );
        created++;
      });
    });
    insertLead(leads);

    logAudit(req.workspaceId, req.userId, 'bulk_upload_leads', 'lead', null, { created, skipped });
    res.json({ created, skipped, total: leads.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Messages — BEFORE /:id
app.get('/api/leads/:leadId/messages', auth, (req, res) => {
  try {
    // Optionally filter by ?platform=whatsapp|instagram|facebook|website
    const platform = (req.query.platform || '').toLowerCase();
    let messages;
    if (platform && platform !== 'all') {
      messages = db.prepare(`SELECT * FROM messages WHERE lead_id = ? AND (platform = ? OR (platform IS NULL AND ? = 'whatsapp')) ORDER BY timestamp ASC`)
        .all(req.params.leadId, platform, platform);
    } else {
      messages = db.prepare(`SELECT * FROM messages WHERE lead_id = ? ORDER BY timestamp ASC`).all(req.params.leadId);
    }
    // Per-platform counts so the UI can show notification dots without an extra request
    const counts = db.prepare(`SELECT COALESCE(platform, 'whatsapp') AS platform, COUNT(*) AS c FROM messages WHERE lead_id = ? GROUP BY COALESCE(platform, 'whatsapp')`)
      .all(req.params.leadId);
    const platform_counts = counts.reduce((acc, r) => { acc[r.platform] = r.c; return acc; }, {});
    res.json({ messages, platform_counts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads/:leadId/messages', auth, async (req, res) => {
  try {
    const { body, platform } = req.body;
    const { leadId } = req.params;
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(leadId, req.workspaceId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const targetPlatform = (platform || 'whatsapp').toLowerCase();

    // Only WhatsApp has a real outbound send wired today. Other platforms persist the message
    // locally so the user sees their draft in the chat history, but flag that delivery is pending.
    let delivered = false;
    if (targetPlatform === 'whatsapp') {
      await whatsappService.sendMessage(lead.customer_phone, body);
      delivered = true;
    }

    const msgId = generateId();
    db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, from_me, timestamp, platform) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?)`)
      .run(msgId, leadId, req.userId, body, targetPlatform);
    db.prepare(`UPDATE leads SET total_messages = total_messages + 1, last_message_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
    addContactHistory(leadId, req.userId, 'message', `Sent ${targetPlatform} message: ${body.substring(0, 80)}${body.length > 80 ? '…' : ''}`);

    res.json({ message: 'Sent', delivered, platform: targetPlatform });
  } catch (e) { res.status(500).json({ error: e.message || e.toString() }); }
});

// Send voice note. Multer errors are handled inline (they're middleware errors,
// not caught by the inner try/catch), so we always send a JSON body.
app.post('/api/leads/:leadId/messages/voice', auth, (req, res) => {
  voiceUpload.single('audio')(req, res, async (mErr) => {
    if (mErr) {
      console.error('Voice upload (multer) failed:', mErr);
      const msg = mErr.message || mErr.code || 'Audio upload failed';
      return res.status(400).json({ error: `Upload error: ${msg}` });
    }
    try {
      const { leadId } = req.params;
      const platform = ((req.body && req.body.platform) || 'whatsapp').toLowerCase();
      const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(leadId, req.workspaceId);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      if (!req.file) return res.status(400).json({ error: 'No audio file uploaded — check the field name is "audio"' });

      const mediaUrl = `/uploads/voices/${req.file.filename}`;
      let delivered = false;

      if (platform === 'whatsapp') {
        try {
          await whatsappService.sendVoiceNote(lead.customer_phone, req.file.path, req.file.mimetype);
          delivered = true;
        } catch (sendErr) {
          console.error('Voice send via WhatsApp failed:', sendErr);
          const detail = sendErr.message || String(sendErr) || 'WhatsApp delivery failed';
          // Don't 500 — the file IS saved. Tell the client what went wrong with delivery.
          return res.status(502).json({ error: `WhatsApp send failed: ${detail}`, media_url: mediaUrl });
        }
      }

      const msgId = generateId();
      db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, from_me, media_url, media_type, timestamp, platform) VALUES (?, ?, ?, ?, 1, ?, 'voice', CURRENT_TIMESTAMP, ?)`)
        .run(msgId, leadId, req.userId, '[Voice Note]', mediaUrl, platform);
      db.prepare(`UPDATE leads SET total_messages = total_messages + 1, last_message_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
      res.json({ message: delivered ? 'Voice sent' : 'Voice saved as draft', media_url: mediaUrl, delivered, platform });
    } catch (e) {
      console.error('Voice route error:', e);
      const msg = (e instanceof Error) ? e.message : (typeof e === 'string' ? e : JSON.stringify(e));
      res.status(500).json({ error: msg || 'Unknown error sending voice note' });
    }
  });
});

// Sync WhatsApp message history for a lead
app.post('/api/leads/:leadId/messages/sync', auth, async (req, res) => {
  try {
    const { leadId } = req.params;
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(leadId, req.workspaceId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Rate-limit: skip if this lead was synced in the last 5 minutes
    // This prevents flooding Puppeteer when users open the same lead repeatedly
    const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
    const lastSync = syncCooldowns.get(leadId);
    if (lastSync && Date.now() - lastSync < SYNC_COOLDOWN_MS) {
      return res.json({ imported: 0, total: 0, skipped: true, reason: 'cooldown' });
    }
    syncCooldowns.set(leadId, Date.now());

    const history = await whatsappService.fetchHistory(lead.customer_phone, 200);

    let imported = 0;
    const doSync = db.transaction((msgs) => {
      for (const m of msgs) {
        // Skip if already stored by WA message ID
        if (m.wa_id) {
          const dup = db.prepare('SELECT id FROM messages WHERE wa_message_id = ?').get(m.wa_id);
          if (dup) continue;
        }
        db.prepare(
          `INSERT INTO messages (id, lead_id, user_id, body, from_me, media_type, timestamp, wa_message_id)
           VALUES (?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'), ?)`
        ).run(generateId(), leadId, lead.user_id, m.body, m.from_me, m.media_type, String(m.ts), m.wa_id || null);
        imported++;
      }
    });
    doSync(history);

    if (imported > 0) {
      const cnt = db.prepare('SELECT COUNT(*) as c FROM messages WHERE lead_id = ?').get(leadId).c;
      db.prepare('UPDATE leads SET total_messages = ? WHERE id = ?').run(cnt, leadId);
    }
    res.json({ imported, total: history.length });
  } catch (e) {
    const msg = (e instanceof Error) ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// Contact history
app.get('/api/leads/:leadId/history', auth, (req, res) => {
  try {
    const history = db.prepare(`
      SELECT ch.*, u.business_name as user_name
      FROM contact_history ch
      LEFT JOIN users u ON u.id = ch.user_id
      WHERE ch.lead_id = ? ORDER BY ch.created_at DESC
    `).all(req.params.leadId);
    res.json({ history });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Lead invoices
app.get('/api/leads/:leadId/invoices', auth, (req, res) => {
  try {
    const invoices = db.prepare(`SELECT * FROM invoices WHERE lead_id = ? AND user_id = ? ORDER BY created_at DESC`).all(req.params.leadId, req.workspaceOwnerId);
    res.json({ invoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Email workflows for lead
app.get('/api/leads/:leadId/email-workflows', auth, (req, res) => {
  try {
    const workflows = db.prepare(`
      SELECT ew.*, et.subject, et.body as template_body
      FROM email_workflows ew
      LEFT JOIN email_templates et ON et.id = ew.template_id
      WHERE ew.lead_id = ? AND ew.user_id = ?
      ORDER BY ew.created_at DESC
    `).all(req.params.leadId, req.workspaceOwnerId);
    res.json({ workflows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads/:leadId/email-workflows', auth, (req, res) => {
  try {
    const { template_id, scheduled_at } = req.body;
    const { leadId } = req.params;
    const template = db.prepare('SELECT * FROM email_templates WHERE id = ? AND user_id = ?').get(template_id, req.workspaceOwnerId);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const id = generateId();
    db.prepare(`
      INSERT INTO email_workflows (id, user_id, lead_id, template_id, template_name, template_subject, status, scheduled_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, req.workspaceOwnerId, leadId, template_id, template.name, template.subject, scheduled_at || new Date().toISOString());
    addContactHistory(leadId, req.userId, 'email', `Email workflow started: ${template.name}`);
    const wf = db.prepare('SELECT * FROM email_workflows WHERE id = ?').get(id);
    res.status(201).json({ workflow: wf });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/email-workflows/:id/status', auth, (req, res) => {
  try {
    const { status } = req.body;
    db.prepare(`UPDATE email_workflows SET status = ?, sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END WHERE id = ? AND user_id = ?`)
      .run(status, status, req.params.id, req.workspaceOwnerId);
    const wf = db.prepare('SELECT * FROM email_workflows WHERE id = ?').get(req.params.id);
    res.json({ workflow: wf });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leads/:id', auth, (req, res) => {
  try {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Core queries — always present
    const notes    = db.prepare('SELECT * FROM notes WHERE lead_id = ? ORDER BY created_at DESC').all(req.params.id);
    const reminders = db.prepare('SELECT * FROM reminders WHERE lead_id = ? ORDER BY created_at DESC').all(req.params.id);

    let tags = [];
    try {
      tags = db.prepare(`
        SELECT t.id, t.name, t.color FROM tags t
        JOIN lead_tags lt ON t.id = lt.tag_id WHERE lt.lead_id = ?
      `).all(req.params.id);
    } catch {}

    // Optional queries — silently fall back if tables don't exist yet
    let history = [];
    try { history = db.prepare('SELECT * FROM contact_history WHERE lead_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id); } catch {}

    let invoices = [];
    try { invoices = db.prepare('SELECT * FROM invoices WHERE lead_id = ? AND user_id = ? ORDER BY created_at DESC').all(req.params.id, req.workspaceOwnerId).map(parseInvoice); } catch {}

    let emailWorkflows = [];
    try { emailWorkflows = db.prepare('SELECT * FROM email_workflows WHERE lead_id = ? AND user_id = ? ORDER BY created_at DESC').all(req.params.id, req.workspaceOwnerId); } catch {}

    let assignee = null;
    try {
      if (lead.assigned_to) {
        assignee = db.prepare('SELECT id, name, email, role FROM team_members WHERE id = ?').get(lead.assigned_to);
      }
    } catch {}

    res.json({ lead: attachAccountInfo({ ...lead, tags }), notes, reminders, history, invoices, emailWorkflows, assignee });
  } catch (e) {
    console.error('GET /api/leads/:id error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/leads', auth, (req, res) => {
  try {
    // Plan enforcement — leads limit (Free: 50, Starter: 300, Growth/Enterprise: unlimited)
    const limitCheck = checkLimit(req.workspaceId, 'leads');
    if (!limitCheck.ok) return res.status(403).json({ error: limitCheck.message, code: 'plan_limit', ...limitCheck });

    const { customer_name, customer_phone, status, first_message, estimated_value, email, address, date_of_birth, lead_source } = req.body;

    // Duplicate check — digit-normalised so "+92 310 154 7564" matches "+923101547564"
    if (customer_phone) {
      const existing = findLeadByPhone(req.workspaceId, customer_phone);
      if (existing) return res.status(400).json({ error: 'A lead with this phone number already exists', existing_id: existing.id });
    }

    const leadId = generateId();
    db.prepare(`
      INSERT INTO leads (id, user_id, workspace_id, customer_name, customer_phone, status, first_message, estimated_value, email, address, date_of_birth, lead_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(leadId, req.userId, req.workspaceId, customer_name, customer_phone, status || 'New', first_message, estimated_value, email, address, date_of_birth, lead_source);

    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
    addContactHistory(leadId, req.userId, 'created', 'Lead created');
    broadcastToWorkspace(req.workspaceId, 'lead_created', { lead });
    sendPushToUser(req.userId, '👤 New Lead', `${lead.customer_name || 'Unknown'} just came in`, { url: `/leads/${leadId}` });
    res.status(201).json(lead);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/leads/:id', auth, (req, res) => {
  try {
    const allowed = ['customer_name', 'customer_phone', 'status', 'estimated_value', 'actual_sale',
      'email', 'address', 'date_of_birth', 'lead_source', 'assigned_to', 'lead_score'];
    const fields = [], params = [];
    allowed.forEach(f => {
      if (req.body[f] !== undefined) { fields.push(`${f} = ?`); params.push(req.body[f]); }
    });
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id, req.workspaceId);
    db.prepare(`UPDATE leads SET ${fields.join(', ')} WHERE id = ? AND workspace_id = ?`).run(...params);

    // History entries for key changes
    if (req.body.assigned_to !== undefined) {
      const member = db.prepare('SELECT full_name FROM workspace_members WHERE user_id = ? AND workspace_id = ?').get(req.body.assigned_to, req.workspaceId);
      addContactHistory(req.params.id, req.userId, 'assignment', `Lead assigned to ${member?.full_name || 'team member'}`);
    }

    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    broadcastToWorkspace(req.workspaceId, 'lead_updated', { lead });
    res.json(lead);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/leads/:id/status', auth, (req, res) => {
  try {
    const { status, actual_sale, lost_reason } = req.body;
    const { id } = req.params;
    let query = 'UPDATE leads SET status = ?';
    const params = [status];
    if (status === 'Closed - Won' || status === 'Closed - Lost') {
      query += ', closed_at = CURRENT_TIMESTAMP';
      if (status === 'Closed - Won' && actual_sale) { query += ', actual_sale = ?'; params.push(actual_sale); }
      if (status === 'Closed - Lost' && lost_reason) { query += ', lost_reason = ?'; params.push(lost_reason); }
    }
    if (['Contacted', 'Interested', 'Negotiating'].includes(status)) {
      query += ', last_contacted_at = CURRENT_TIMESTAMP';
    }
    query += ' WHERE id = ? AND workspace_id = ?';
    params.push(id, req.workspaceId);
    db.prepare(query).run(...params);
    addContactHistory(id, req.userId, 'status_change', `Status changed to ${status}${lost_reason ? ` — ${lost_reason}` : ''}`);
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    broadcastToWorkspace(req.workspaceId, 'lead_updated', { lead });
    logAudit(req.workspaceId, req.userId, 'status_change', 'lead', id, { status, lost_reason });
    res.json(lead);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/leads/:id', auth, (req, res) => {
  try {
    const result = db.prepare(`UPDATE leads SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?`).run(req.params.id, req.workspaceId);
    if (result.changes === 0) return res.status(404).json({ error: 'Lead not found' });
    broadcastToWorkspace(req.workspaceId, 'lead_deleted', { id: req.params.id });
    res.json({ message: 'Moved to trash' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads/:id/restore', auth, (req, res) => {
  try {
    db.prepare(`UPDATE leads SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND workspace_id = ?`).run(req.params.id, req.workspaceId);
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    res.json(lead);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/leads/:id/permanent', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM notes WHERE lead_id = ?').run(req.params.id);
    db.prepare('DELETE FROM reminders WHERE lead_id = ?').run(req.params.id);
    db.prepare('DELETE FROM messages WHERE lead_id = ?').run(req.params.id);
    db.prepare('DELETE FROM contact_history WHERE lead_id = ?').run(req.params.id);
    db.prepare('DELETE FROM invoices WHERE lead_id = ?').run(req.params.id);
    db.prepare('DELETE FROM leads WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId);
    res.json({ message: 'Permanently deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/leads/trash/cleanup', auth, (req, res) => {
  try {
    const result = db.prepare(`DELETE FROM leads WHERE workspace_id = ? AND is_deleted = 1 AND deleted_at < datetime('now', '-90 days')`).run(req.workspaceId);
    res.json({ message: 'Cleanup done', deleted: result.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/leads/trash/empty — permanently delete EVERY trashed lead (item 25)
app.delete('/api/leads/trash/empty', auth, (req, res) => {
  try {
    const ids = db.prepare('SELECT id FROM leads WHERE workspace_id = ? AND is_deleted = 1').all(req.workspaceId).map(r => r.id);
    let removed = 0;
    const purge = db.transaction((leadIds) => {
      for (const lid of leadIds) {
        db.prepare('DELETE FROM notes WHERE lead_id = ?').run(lid);
        db.prepare('DELETE FROM reminders WHERE lead_id = ?').run(lid);
        db.prepare('DELETE FROM messages WHERE lead_id = ?').run(lid);
        db.prepare('DELETE FROM contact_history WHERE lead_id = ?').run(lid);
        db.prepare('DELETE FROM invoices WHERE lead_id = ?').run(lid);
        removed += db.prepare('DELETE FROM leads WHERE id = ? AND workspace_id = ?').run(lid, req.workspaceId).changes;
      }
    });
    purge(ids);
    res.json({ message: 'Trash emptied', deleted: removed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Lost-reason presets (item 5) ──────────────────────────────────────────────
app.get('/api/lost-reasons', auth, (req, res) => {
  try {
    const reasons = db.prepare('SELECT * FROM lost_reasons WHERE workspace_id = ? ORDER BY created_at ASC').all(req.workspaceId);
    res.json({ reasons });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/lost-reasons', auth, (req, res) => {
  try {
    const reason = (req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Reason text is required' });
    const id = generateId();
    db.prepare('INSERT INTO lost_reasons (id, workspace_id, reason) VALUES (?, ?, ?)').run(id, req.workspaceId, reason);
    res.status(201).json(db.prepare('SELECT * FROM lost_reasons WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/lost-reasons/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM lost_reasons WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Personal tasks — side panel (item 23) ─────────────────────────────────────
app.get('/api/my/tasks', auth, (req, res) => {
  try {
    res.json({ tasks: db.prepare('SELECT * FROM user_tasks WHERE user_id = ? ORDER BY done ASC, created_at DESC').all(req.userId) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/my/tasks', auth, (req, res) => {
  try {
    const title = (req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Task title is required' });
    const id = generateId();
    db.prepare('INSERT INTO user_tasks (id, user_id, workspace_id, title, due_date) VALUES (?, ?, ?, ?, ?)')
      .run(id, req.userId, req.workspaceId, title, req.body.due_date || null);
    res.status(201).json(db.prepare('SELECT * FROM user_tasks WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/my/tasks/:id', auth, (req, res) => {
  try {
    const t = db.prepare('SELECT * FROM user_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!t) return res.status(404).json({ error: 'Task not found' });
    db.prepare('UPDATE user_tasks SET title = ?, done = ?, due_date = ? WHERE id = ? AND user_id = ?').run(
      req.body.title != null ? req.body.title : t.title,
      req.body.done != null ? (req.body.done ? 1 : 0) : t.done,
      req.body.due_date !== undefined ? req.body.due_date : t.due_date,
      req.params.id, req.userId);
    res.json(db.prepare('SELECT * FROM user_tasks WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/my/tasks/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM user_tasks WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Personal quick notes / Keep — side panel (item 23) ────────────────────────
app.get('/api/my/notes', auth, (req, res) => {
  try {
    res.json({ notes: db.prepare('SELECT * FROM quick_notes WHERE user_id = ? ORDER BY updated_at DESC').all(req.userId) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/my/notes', auth, (req, res) => {
  try {
    const id = generateId();
    db.prepare('INSERT INTO quick_notes (id, user_id, workspace_id, content, color) VALUES (?, ?, ?, ?, ?)')
      .run(id, req.userId, req.workspaceId, req.body.content || '', req.body.color || 'yellow');
    res.status(201).json(db.prepare('SELECT * FROM quick_notes WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/my/notes/:id', auth, (req, res) => {
  try {
    const n = db.prepare('SELECT * FROM quick_notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!n) return res.status(404).json({ error: 'Note not found' });
    db.prepare('UPDATE quick_notes SET content = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(
      req.body.content != null ? req.body.content : n.content,
      req.body.color != null ? req.body.color : n.color,
      req.params.id, req.userId);
    res.json(db.prepare('SELECT * FROM quick_notes WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/my/notes/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM quick_notes WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  NOTES & REMINDERS
// ════════════════════════════════════════════════════════════

app.get('/api/leads/:leadId/notes', auth, (req, res) => {
  try {
    const notes = db.prepare('SELECT * FROM notes WHERE lead_id = ? ORDER BY created_at DESC').all(req.params.leadId);
    res.json({ notes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads/:leadId/notes', auth, (req, res) => {
  try {
    const { content } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO notes (id, lead_id, user_id, content) VALUES (?, ?, ?, ?)').run(id, req.params.leadId, req.userId, content);
    addContactHistory(req.params.leadId, req.userId, 'note', `Note added: ${content.substring(0, 80)}${content.length > 80 ? '…' : ''}`);
    res.status(201).json(db.prepare('SELECT * FROM notes WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notes/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leads/:leadId/reminders', auth, (req, res) => {
  try {
    const reminders = db.prepare('SELECT * FROM reminders WHERE lead_id = ? ORDER BY reminder_date ASC, due_date ASC').all(req.params.leadId);
    res.json({ reminders });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads/:leadId/reminders', auth, (req, res) => {
  try {
    const { reminder_date, message, title } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO reminders (id, lead_id, user_id, reminder_date, message, title, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.params.leadId, req.userId, reminder_date, message, title || message, reminder_date);
    addContactHistory(req.params.leadId, req.userId, 'reminder', `Reminder set: ${title || message}`);
    res.status(201).json(db.prepare('SELECT * FROM reminders WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/reminders/upcoming — all upcoming reminders for the user (due within 48h)
app.get('/api/reminders/upcoming', auth, (req, res) => {
  try {
    const reminders = db.prepare(`
      SELECT r.*, l.customer_name, l.customer_phone
      FROM reminders r
      LEFT JOIN leads l ON r.lead_id = l.id
      WHERE r.user_id = ? AND r.is_completed = 0
      ORDER BY COALESCE(r.due_date, r.reminder_date) ASC
      LIMIT 50
    `).all(req.userId);
    res.json({ reminders });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/reminders/:id/toggle', auth, (req, res) => {
  try {
    const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id);
    if (!reminder) return res.status(404).json({ error: 'Not found' });
    const newVal = reminder.is_completed ? 0 : 1;
    db.prepare('UPDATE reminders SET is_completed = ?, completed = ? WHERE id = ?').run(newVal, newVal, req.params.id);
    res.json(db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  MEDIA SEND
// ════════════════════════════════════════════════════════════

app.post('/api/leads/:leadId/messages/media', auth, (req, res) => {
  upload.single('file')(req, res, async (mErr) => {
    if (mErr) {
      console.error('Media upload (multer) failed:', mErr);
      const msg = mErr.message || mErr.code || 'File upload failed';
      return res.status(400).json({ error: `Upload error: ${msg}` });
    }
    try {
      const { leadId } = req.params;
      const caption = req.body.caption || '';
      const platform = ((req.body && req.body.platform) || 'whatsapp').toLowerCase();
      const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(leadId, req.workspaceId);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      if (!req.file) return res.status(400).json({ error: 'No file' });

      const mediaUrl = `/uploads/${req.file.filename}`;
      const mediaType = req.file.mimetype.startsWith('image/') ? 'image'
        : req.file.mimetype.startsWith('video/') ? 'video'
        : req.file.mimetype.startsWith('audio/') ? 'audio' : 'document';

      let delivered = false;
      if (platform === 'whatsapp') {
        try {
          await whatsappService.sendMedia(lead.customer_phone, req.file.path, req.file.mimetype, req.file.originalname, caption);
          delivered = true;
        } catch (sendErr) {
          console.error('Media send via WhatsApp failed:', sendErr);
          const detail = sendErr.message || String(sendErr) || 'WhatsApp delivery failed';
          return res.status(502).json({ error: `WhatsApp send failed: ${detail}`, media_url: mediaUrl });
        }
      }

      db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, from_me, media_url, media_type, timestamp, platform) VALUES (?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, ?)`)
        .run(generateId(), leadId, req.userId, caption || `[${req.file.originalname}]`, mediaUrl, mediaType, platform);
      db.prepare('UPDATE leads SET total_messages = total_messages + 1, last_message_at = CURRENT_TIMESTAMP WHERE id = ?').run(leadId);
      res.json({ message: delivered ? 'Media sent' : 'Media saved as draft', media_url: mediaUrl, delivered, platform });
    } catch (e) {
      console.error('Media route error:', e);
      res.status(500).json({ error: e.message || 'Unknown error sending media' });
    }
  });
});

// ════════════════════════════════════════════════════════════
//  INVOICES
// ════════════════════════════════════════════════════════════

// Parse the JSON-stringified `items` field before sending to the client.
// SQLite stores it as a string; the frontend needs a real array.
function parseInvoice(inv) {
  if (!inv) return inv;
  try { inv.items = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []); } catch { inv.items = []; }
  return inv;
}

app.get('/api/invoices', auth, (req, res) => {
  try {
    const invoices = db.prepare('SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC').all(req.workspaceOwnerId).map(parseInvoice);
    res.json({ invoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/invoices/:id', auth, (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(req.params.id, req.workspaceOwnerId);
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    res.json({ invoice: parseInvoice(invoice) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/invoices', auth, (req, res) => {
  try {
    const { lead_id, customer_name, customer_email, customer_phone, customer_address,
      items, subtotal, tax_rate, tax_amount, discount, total, due_date, notes, status } = req.body;

    // Auto-generate invoice number
    const cs = db.prepare('SELECT invoice_prefix, invoice_counter, currency, currency_symbol FROM company_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    const prefix = cs?.invoice_prefix || 'INV';
    const counter = (cs?.invoice_counter || 1000) + 1;
    const invoiceNumber = `${prefix}-${counter}`;

    db.prepare(`
      UPDATE company_settings SET invoice_counter = ? WHERE user_id = ?
    `).run(counter, req.workspaceOwnerId);

    const id = generateId();
    db.prepare(`
      INSERT INTO invoices (id, user_id, lead_id, invoice_number, customer_name, customer_email, customer_phone,
        customer_address, items, subtotal, tax_rate, tax_amount, discount, total, currency, currency_symbol, due_date, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.workspaceOwnerId, lead_id, invoiceNumber, customer_name, customer_email, customer_phone,
      customer_address, JSON.stringify(items || []), subtotal, tax_rate, tax_amount, discount || 0,
      total, cs?.currency || 'USD', cs?.currency_symbol || '$', due_date, notes, status || 'draft');

    if (lead_id) {
      addContactHistory(lead_id, req.userId, 'invoice', `Invoice ${invoiceNumber} created — Total: ${cs?.currency_symbol || '$'}${total}`);
    }
    logAudit(req.workspaceId, req.userId, 'create_invoice', 'invoice', id, { invoiceNumber, total });

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    res.status(201).json({ invoice: parseInvoice(invoice) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/invoices/:id', auth, (req, res) => {
  try {
    const { customer_name, customer_email, customer_phone, customer_address,
      items, subtotal, tax_rate, tax_amount, discount, total, due_date, notes, status } = req.body;
    db.prepare(`
      UPDATE invoices SET customer_name=?, customer_email=?, customer_phone=?, customer_address=?,
        items=?, subtotal=?, tax_rate=?, tax_amount=?, discount=?, total=?, due_date=?, notes=?, status=?
      WHERE id=? AND user_id=?
    `).run(customer_name, customer_email, customer_phone, customer_address,
      JSON.stringify(items || []), subtotal, tax_rate, tax_amount, discount, total,
      due_date, notes, status, req.params.id, req.workspaceOwnerId);
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    res.json({ invoice: parseInvoice(invoice) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/invoices/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM invoices WHERE id = ? AND user_id = ?').run(req.params.id, req.workspaceOwnerId);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Premium invoice HTML (used for emailed invoices) ──────────────────────────
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildInvoiceHtml(inv, company, introMessage) {
  const accent = '#6366f1';
  const sym = (company && company.currency_symbol) || (inv && inv.currency_symbol) || '$';
  const money = (n) => sym + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d) => {
    if (!d) return '—';
    const s = String(d);
    const dt = new Date(s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  let items = inv && inv.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
  items = Array.isArray(items) ? items : [];

  const statusColors = { paid: '#10b981', pending: '#f59e0b', overdue: '#ef4444', draft: '#94a3b8' };
  const sc = statusColors[inv && inv.status] || statusColors.draft;
  const c = company || {};
  const logoBlock = c.company_logo
    ? `<img src="https://api.remoteops.co${escapeHtml(c.company_logo)}" alt="${escapeHtml(c.company_name || '')}" style="max-height:54px;max-width:210px;object-fit:contain;display:block;margin-bottom:10px" />`
    : `<div style="font-size:23px;font-weight:800;color:${accent};margin-bottom:10px">${escapeHtml(c.company_name || 'WappFlow')}</div>`;
  const companyLines = [
    c.company_logo ? c.company_name : '',
    c.company_address, c.company_email, c.company_phone, c.company_website,
  ].filter(Boolean).map(l => `<div style="font-size:12px;color:#64748b;line-height:1.7">${escapeHtml(l)}</div>`).join('');
  const itemRows = items.length ? items.map((it, i) => `
    <tr style="background:${i % 2 ? '#f8fafc' : '#ffffff'}">
      <td style="padding:11px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #eef2f6">${escapeHtml(it.description || '—')}</td>
      <td style="padding:11px 16px;font-size:13px;color:#475569;text-align:center;border-bottom:1px solid #eef2f6">${escapeHtml(it.qty || 1)}</td>
      <td style="padding:11px 16px;font-size:13px;color:#475569;text-align:right;border-bottom:1px solid #eef2f6">${money(it.rate)}</td>
      <td style="padding:11px 16px;font-size:13px;color:#1e293b;font-weight:700;text-align:right;border-bottom:1px solid #eef2f6">${money(it.amount != null ? it.amount : (it.qty || 1) * (it.rate || 0))}</td>
    </tr>`).join('') : `<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">No line items</td></tr>`;
  const taxLabel = (c.tax_name || 'Tax') + ((inv && inv.tax_rate) ? ` (${inv.tax_rate}%)` : '');

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Invoice ${escapeHtml((inv && (inv.invoice_number || inv.id)) || '')}</title></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:680px;margin:0 auto;padding:28px 16px">
  ${introMessage ? `<div style="background:#fff;border:1px solid #e6e9f0;border-radius:14px;padding:18px 22px;margin-bottom:18px;font-size:14px;color:#334155;line-height:1.6">${escapeHtml(introMessage).replace(/\n/g, '<br>')}</div>` : ''}
  <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6e9f0;box-shadow:0 8px 30px rgba(15,23,42,0.06)">
    <div style="height:6px;background:linear-gradient(90deg,${accent},#8b5cf6)"></div>
    <div style="padding:32px 34px">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:top">${logoBlock}${companyLines}</td>
        <td style="vertical-align:top;text-align:right">
          <div style="font-size:30px;font-weight:800;letter-spacing:1px;color:#0f172a">INVOICE</div>
          <div style="font-size:13px;color:#64748b;margin-top:6px"><strong style="color:#0f172a">${escapeHtml((inv && (inv.invoice_number || ('#' + inv.id))) || '')}</strong></div>
          <div style="font-size:12px;color:#64748b;margin-top:3px">Issued ${fmtDate(inv && inv.created_at)}</div>
          ${(inv && inv.due_date) ? `<div style="font-size:12px;color:#64748b;margin-top:2px">Due ${fmtDate(inv.due_date)}</div>` : ''}
          <div style="display:inline-block;margin-top:10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:4px 12px;border-radius:20px;background:${sc}22;color:${sc}">${escapeHtml((inv && inv.status) || 'draft')}</div>
        </td>
      </tr></table>
      <div style="margin-top:30px;padding:16px 18px;background:#f8fafc;border-radius:12px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:6px">Billed To</div>
        <div style="font-size:16px;font-weight:700;color:#0f172a">${escapeHtml((inv && inv.customer_name) || '—')}</div>
        ${(inv && inv.customer_email) ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${escapeHtml(inv.customer_email)}</div>` : ''}
        ${(inv && inv.customer_phone) ? `<div style="font-size:12px;color:#64748b;margin-top:1px">${escapeHtml(inv.customer_phone)}</div>` : ''}
        ${(inv && inv.customer_address) ? `<div style="font-size:12px;color:#64748b;margin-top:1px">${escapeHtml(inv.customer_address)}</div>` : ''}
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-collapse:collapse">
        <thead><tr style="background:#0f172a">
          <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#cbd5e1">Description</th>
          <th style="padding:10px 16px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#cbd5e1">Qty</th>
          <th style="padding:10px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#cbd5e1">Rate</th>
          <th style="padding:10px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#cbd5e1">Amount</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr>
        <td style="width:52%"></td>
        <td style="width:48%">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:6px 2px;font-size:13px;color:#64748b">Subtotal</td><td style="padding:6px 2px;font-size:13px;color:#1e293b;text-align:right">${money(inv && inv.subtotal)}</td></tr>
            ${(inv && inv.discount) ? `<tr><td style="padding:6px 2px;font-size:13px;color:#64748b">Discount</td><td style="padding:6px 2px;font-size:13px;color:#1e293b;text-align:right">-${money(inv.discount)}</td></tr>` : ''}
            <tr><td style="padding:6px 2px;font-size:13px;color:#64748b">${escapeHtml(taxLabel)}</td><td style="padding:6px 2px;font-size:13px;color:#1e293b;text-align:right">${money(inv && inv.tax_amount)}</td></tr>
          </table>
          <div style="margin-top:8px;background:${accent};border-radius:10px;padding:13px 18px">
            <table width="100%"><tr>
              <td style="font-size:13px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.5px">Total Due</td>
              <td style="font-size:21px;font-weight:800;color:#fff;text-align:right">${money(inv && inv.total)}</td>
            </tr></table>
          </div>
        </td>
      </tr></table>
      ${(inv && inv.notes) ? `<div style="margin-top:24px;padding:14px 18px;background:#f8fafc;border-left:3px solid ${accent};border-radius:6px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:4px">Notes</div><div style="font-size:13px;color:#475569;line-height:1.6">${escapeHtml(inv.notes).replace(/\n/g, '<br>')}</div></div>` : ''}
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #eef2f6;text-align:center">
        <div style="font-size:13px;font-weight:700;color:#0f172a">Thank you for your business</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">${escapeHtml(c.company_name || 'WappFlow')}${c.company_email ? ' · ' + escapeHtml(c.company_email) : ''}</div>
      </div>
    </div>
  </div>
</div>
</body></html>`;
}

// POST /api/invoices/:id/email — email a premium invoice to the customer (item 2)
app.post('/api/invoices/:id/email', auth, async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(req.params.id, req.workspaceOwnerId);
    if (!row) return res.status(404).json({ error: 'Invoice not found' });
    const inv = parseInvoice(row);
    const to = (req.body.to || inv.customer_email || '').trim();
    if (!to) return res.status(400).json({ error: 'No recipient email — add the customer email first.' });

    const smtpRow = db.prepare('SELECT * FROM email_smtp_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    if (!smtpRow || !smtpRow.smtp_host) return res.status(400).json({ error: 'SMTP not configured. Set up email sending in Settings → Email Sending.' });

    const company = db.prepare('SELECT * FROM company_settings WHERE user_id = ?').get(req.workspaceOwnerId) || {};
    const subject = (req.body.subject || '').trim() || `Invoice ${inv.invoice_number || ''} from ${company.company_name || 'WappFlow'}`.trim();
    const html = buildInvoiceHtml(inv, company, req.body.message);

    const transporter = nodemailer.createTransport({
      host: smtpRow.smtp_host, port: smtpRow.smtp_port, secure: !!smtpRow.smtp_secure,
      auth: { user: smtpRow.smtp_user, pass: smtpRow.smtp_pass }
    });
    const result = await transporter.sendMail({
      from: `"${smtpRow.from_name || company.company_name || 'WappFlow'}" <${smtpRow.from_email || smtpRow.smtp_user}>`,
      to, subject, html,
    });

    // A draft invoice that's been sent is now pending payment.
    db.prepare("UPDATE invoices SET status = 'pending' WHERE id = ? AND user_id = ? AND status = 'draft'")
      .run(inv.id, req.workspaceOwnerId);
    if (inv.lead_id) addContactHistory(inv.lead_id, req.userId, 'invoice', `Invoice ${inv.invoice_number} emailed to ${to}`);
    logAudit(req.workspaceId, req.userId, 'invoice_emailed', 'invoice', inv.id, { to });
    res.json({ message: 'Invoice sent', to, messageId: result.messageId });
  } catch (e) {
    console.error('Invoice email error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES
// ════════════════════════════════════════════════════════════

app.get('/api/email-templates', auth, (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM email_templates WHERE user_id = ? ORDER BY created_at DESC').all(req.workspaceOwnerId);
    res.json({ templates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email-templates', auth, (req, res) => {
  try {
    const { name, subject, body, delay_days, trigger_event } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO email_templates (id, user_id, name, subject, body, delay_days, trigger_event) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.workspaceOwnerId, name, subject, body, delay_days || 0, trigger_event || 'manual');
    res.status(201).json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/email-templates/:id', auth, (req, res) => {
  try {
    const { name, subject, body, delay_days, trigger_event } = req.body;
    db.prepare('UPDATE email_templates SET name=?, subject=?, body=?, delay_days=?, trigger_event=? WHERE id=? AND user_id=?')
      .run(name, subject, body, delay_days, trigger_event, req.params.id, req.workspaceOwnerId);
    res.json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/email-templates/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM email_templates WHERE id = ? AND user_id = ?').run(req.params.id, req.workspaceOwnerId);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  AUTO-REPLY RULES
// ════════════════════════════════════════════════════════════

app.get('/api/auto-reply', auth, (req, res) => {
  try {
    const rules = db.prepare('SELECT * FROM auto_reply_rules WHERE user_id = ? ORDER BY created_at DESC').all(req.workspaceOwnerId);
    res.json({ rules });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auto-reply', auth, (req, res) => {
  try {
    const { name, keywords, reply_message, match_type } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO auto_reply_rules (id, user_id, name, keywords, reply_message, match_type) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, req.workspaceOwnerId, name, JSON.stringify(keywords), reply_message, match_type || 'contains');
    res.status(201).json(db.prepare('SELECT * FROM auto_reply_rules WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/auto-reply/:id', auth, (req, res) => {
  try {
    const { name, keywords, reply_message, match_type, is_active } = req.body;
    db.prepare('UPDATE auto_reply_rules SET name=?, keywords=?, reply_message=?, match_type=?, is_active=? WHERE id=? AND user_id=?')
      .run(name, JSON.stringify(keywords), reply_message, match_type, is_active ? 1 : 0, req.params.id, req.workspaceOwnerId);
    res.json(db.prepare('SELECT * FROM auto_reply_rules WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/auto-reply/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM auto_reply_rules WHERE id = ? AND user_id = ?').run(req.params.id, req.workspaceOwnerId);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  ANALYTICS & REPORTS
// ════════════════════════════════════════════════════════════

app.get('/api/analytics', auth, (req, res) => {
  try {
    const wid = req.workspaceId;
    const cs = db.prepare('SELECT currency_symbol FROM company_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    const sym = cs?.currency_symbol || '$';

    const totalLeads = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE workspace_id=? AND (is_deleted=0 OR is_deleted IS NULL)`).get(wid).c;
    const leadsToday = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE workspace_id=? AND DATE(created_at)=DATE('now') AND (is_deleted=0 OR is_deleted IS NULL)`).get(wid).c;
    const totalSales = db.prepare(`SELECT SUM(actual_sale) as t FROM leads WHERE workspace_id=? AND actual_sale IS NOT NULL AND (is_deleted=0 OR is_deleted IS NULL)`).get(wid).t || 0;
    const closedWon = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE workspace_id=? AND status='Closed - Won' AND (is_deleted=0 OR is_deleted IS NULL)`).get(wid).c;
    const conversionRate = totalLeads > 0 ? Math.round((closedWon / totalLeads) * 100) : 0;
    const leadsByStatus = db.prepare(`SELECT status, COUNT(*) as count FROM leads WHERE workspace_id=? AND (is_deleted=0 OR is_deleted IS NULL) GROUP BY status`).all(wid);
    const avgDealSize = closedWon > 0 ? Math.round(totalSales / closedWon) : 0;

    // This month vs last month
    const thisMonth = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE workspace_id=? AND strftime('%Y-%m', created_at)=strftime('%Y-%m','now') AND (is_deleted=0 OR is_deleted IS NULL)`).get(wid).c;
    const lastMonth = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE workspace_id=? AND strftime('%Y-%m', created_at)=strftime('%Y-%m', 'now', '-1 month') AND (is_deleted=0 OR is_deleted IS NULL)`).get(wid).c;

    res.json({
      total_leads: totalLeads, leads_today: leadsToday, total_sales: totalSales,
      conversion_rate: conversionRate, leads_by_status: leadsByStatus, avg_deal_size: avgDealSize,
      currency_symbol: sym, this_month_leads: thisMonth, last_month_leads: lastMonth, closed_won: closedWon
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/overview', auth, (req, res) => {
  try {
    const wid = req.workspaceId;
    const { period = '30', start_date, end_date } = req.query;

    // Build date filter — custom range takes priority over period
    let leadsTimeFilter, revenueTimeFilter;
    if (start_date && end_date) {
      leadsTimeFilter = `DATE(created_at) BETWEEN DATE('${start_date}') AND DATE('${end_date}')`;
      revenueTimeFilter = `DATE(closed_at) BETWEEN DATE('${start_date}') AND DATE('${end_date}')`;
    } else {
      const days = parseInt(period);
      leadsTimeFilter = `DATE(created_at) >= DATE('now', '-${days} days')`;
      revenueTimeFilter = `DATE(closed_at) >= DATE('now', '-${days} days')`;
    }

    // Leads over time
    const leadsOverTime = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM leads WHERE workspace_id=? AND ${leadsTimeFilter} AND (is_deleted=0 OR is_deleted IS NULL)
      GROUP BY DATE(created_at) ORDER BY date ASC
    `).all(wid);

    // Revenue over time
    const revenueOverTime = db.prepare(`
      SELECT DATE(closed_at) as date, SUM(actual_sale) as revenue
      FROM leads WHERE workspace_id=? AND status='Closed - Won' AND closed_at IS NOT NULL AND ${revenueTimeFilter}
      GROUP BY DATE(closed_at) ORDER BY date ASC
    `).all(wid);

    // Pipeline funnel
    const pipeline = db.prepare(`
      SELECT status, COUNT(*) as count, SUM(COALESCE(estimated_value, 0)) as value
      FROM leads WHERE workspace_id=? AND (is_deleted=0 OR is_deleted IS NULL) GROUP BY status
    `).all(wid);

    // Lead sources
    const sources = db.prepare(`
      SELECT COALESCE(lead_source, 'Direct') as source, COUNT(*) as count
      FROM leads WHERE workspace_id=? AND (is_deleted=0 OR is_deleted IS NULL) GROUP BY lead_source ORDER BY count DESC
    `).all(wid);

    // Assignee performance
    const agentPerf = db.prepare(`
      SELECT wm.full_name as name, wm.user_id as id,
        COUNT(l.id) as total_leads,
        SUM(CASE WHEN l.status='Closed - Won' THEN 1 ELSE 0 END) as won,
        SUM(CASE WHEN l.status='Closed - Lost' THEN 1 ELSE 0 END) as lost,
        SUM(COALESCE(l.actual_sale, 0)) as revenue
      FROM workspace_members wm
      LEFT JOIN leads l ON l.assigned_to = wm.user_id AND (l.is_deleted=0 OR l.is_deleted IS NULL)
      WHERE wm.workspace_id=? AND wm.user_id IS NOT NULL
      GROUP BY wm.user_id ORDER BY won DESC
    `).all(wid);

    // Response time (avg time between lead creation and first outgoing message)
    // Only count positive values — negative means historical synced messages arrived before lead was created
    const responseTime = db.prepare(`
      SELECT AVG(diff) as avg_minutes FROM (
        SELECT CAST((julianday(m.timestamp) - julianday(l.created_at)) * 24 * 60 AS INTEGER) as diff
        FROM leads l
        JOIN messages m ON m.lead_id = l.id AND m.from_me = 1
        WHERE l.workspace_id=? AND (l.is_deleted=0 OR l.is_deleted IS NULL)
          AND m.id = (SELECT id FROM messages WHERE lead_id = l.id AND from_me = 1 ORDER BY timestamp ASC LIMIT 1)
          AND julianday(m.timestamp) > julianday(l.created_at)
      ) WHERE diff > 0
    `).get(wid);

    // Lost reasons
    const lostReasons = db.prepare(`
      SELECT lost_reason, COUNT(*) as count FROM leads
      WHERE workspace_id=? AND status='Closed - Lost' AND lost_reason IS NOT NULL
      GROUP BY lost_reason ORDER BY count DESC
    `).all(wid);

    // Platform breakdown
    const platforms = db.prepare(`
      SELECT COALESCE(platform_source, 'whatsapp') as platform, COUNT(*) as count
      FROM leads WHERE workspace_id=? AND (is_deleted=0 OR is_deleted IS NULL)
      GROUP BY COALESCE(platform_source, 'whatsapp') ORDER BY count DESC
    `).all(wid);

    const cs = db.prepare('SELECT currency_symbol FROM company_settings WHERE user_id = ?').get(req.workspaceOwnerId);

    res.json({
      leadsOverTime, revenueOverTime, pipeline, sources, agentPerf,
      avgResponseMinutes: responseTime?.avg_minutes || 0,
      lostReasons, platforms, currencySymbol: cs?.currency_symbol || '$'
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  AUDIT LOGS
// ════════════════════════════════════════════════════════════

app.get('/api/audit-logs', auth, (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const logs = db.prepare(`
      SELECT al.*, u.email as user_email, u.business_name as user_name
      FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
      WHERE al.workspace_id = ?
      ORDER BY al.created_at DESC LIMIT ? OFFSET ?
    `).all(req.workspaceId, parseInt(limit), parseInt(offset));
    const total = db.prepare('SELECT COUNT(*) as c FROM audit_logs WHERE workspace_id = ?').get(req.workspaceId).c;
    res.json({ logs, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  TAGS & PRESETS
// ════════════════════════════════════════════════════════════

app.get('/api/tags', auth, (req, res) => {
  try { res.json({ tags: db.prepare('SELECT * FROM tags WHERE user_id=? ORDER BY name').all(req.workspaceOwnerId) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/tags', auth, (req, res) => {
  try {
    const { name, color } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO tags (id, user_id, name, color) VALUES (?, ?, ?, ?)').run(id, req.workspaceOwnerId, name, color || '#6366f1');
    res.status(201).json(db.prepare('SELECT * FROM tags WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/tags/:id', auth, (req, res) => {
  try {
    const { name, color } = req.body;
    db.prepare('UPDATE tags SET name=?, color=? WHERE id=? AND user_id=?').run(name, color, req.params.id, req.workspaceOwnerId);
    res.json(db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/tags/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM lead_tags WHERE tag_id=?').run(req.params.id);
    db.prepare('DELETE FROM tags WHERE id=? AND user_id=?').run(req.params.id, req.workspaceOwnerId);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/leads/:leadId/tags/:tagId', auth, (req, res) => {
  try { db.prepare('INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)').run(req.params.leadId, req.params.tagId); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/leads/:leadId/tags/:tagId', auth, (req, res) => {
  try { db.prepare('DELETE FROM lead_tags WHERE lead_id=? AND tag_id=?').run(req.params.leadId, req.params.tagId); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/presets', auth, (req, res) => {
  try { res.json({ presets: db.prepare('SELECT * FROM message_presets WHERE user_id=? ORDER BY created_at DESC').all(req.workspaceOwnerId) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/presets', auth, (req, res) => {
  try {
    const { title, body } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO message_presets (id, user_id, title, body) VALUES (?, ?, ?, ?)').run(id, req.workspaceOwnerId, title, body);
    res.status(201).json(db.prepare('SELECT * FROM message_presets WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/presets/:id', auth, (req, res) => {
  try {
    const { title, body } = req.body;
    db.prepare('UPDATE message_presets SET title=?, body=? WHERE id=? AND user_id=?').run(title, body, req.params.id, req.workspaceOwnerId);
    res.json(db.prepare('SELECT * FROM message_presets WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/presets/:id', auth, (req, res) => {
  try { db.prepare('DELETE FROM message_presets WHERE id=? AND user_id=?').run(req.params.id, req.workspaceOwnerId); res.json({ message: 'Deleted' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  WHATSAPP ROUTES
// ════════════════════════════════════════════════════════════

app.get('/api/whatsapp/status', (req, res) => res.json(whatsappService.getLegacyStatus()));

// ── Per-account WhatsApp routes ──────────────────────────────────────────────
app.get('/api/whatsapp/accounts/:id/status', auth, (req, res) => {
  const account = db.prepare('SELECT * FROM platform_accounts WHERE id = ? AND workspace_id = ? AND platform = ?').get(req.params.id, req.workspaceId, 'whatsapp');
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const status = whatsappService.getStatus(req.params.id);
  res.json({ ...status, account_id: req.params.id, account_name: account.account_name });
});

app.post('/api/whatsapp/accounts/:id/connect', auth, async (req, res) => {
  const account = db.prepare('SELECT * FROM platform_accounts WHERE id = ? AND workspace_id = ? AND platform = ?').get(req.params.id, req.workspaceId, 'whatsapp');
  if (!account) return res.status(404).json({ error: 'Account not found' });
  // ?force=true tears down any running Chrome before re-init.
  // Default (no force) is idempotent — if a healthy QR session already exists, it's a no-op.
  // Use force when the user explicitly clicks "Refresh QR" or "Reset".
  const force = req.query.force === 'true' || req.body?.force === true;
  try { await whatsappService.reconnect(req.params.id, { force }); res.json({ ok: true, forced: force }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/whatsapp/accounts/:id/disconnect', auth, async (req, res) => {
  const account = db.prepare('SELECT * FROM platform_accounts WHERE id = ? AND workspace_id = ? AND platform = ?').get(req.params.id, req.workspaceId, 'whatsapp');
  if (!account) return res.status(404).json({ error: 'Account not found' });
  try { await whatsappService.disconnect(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
  try { await whatsappService.disconnect(); res.json({ message: 'Disconnected' }); }
  catch (e) { res.status(500).json({ error: 'Failed to disconnect' }); }
});

app.post('/api/whatsapp/reconnect', auth, async (req, res) => {
  try {
    const force = req.query.force === 'true' || req.body?.force === true;
    res.json({ message: 'Reconnecting...', forced: force }); // respond immediately
    await whatsappService.reconnect(null, { force });         // runs async after response
  } catch (e) { console.error('Reconnect error:', e.message); }
});

// Manually trigger missed-message sync (also runs automatically on every reconnect)
app.post('/api/whatsapp/sync-missed', auth, async (req, res) => {
  try {
    if (!whatsappService.isReady) return res.status(400).json({ error: 'WhatsApp not connected' });
    res.json({ message: 'Sync started...' });
    await whatsappService.syncMissedMessages();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/whatsapp/send', auth, async (req, res) => {
  try {
    const { phone, message } = req.body;
    await whatsappService.sendMessage(phone, message);
    res.json({ message: 'Sent' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  PUSH NOTIFICATION ROUTES
// ════════════════════════════════════════════════════════════

// GET /api/push/vapid-key  — returns public VAPID key
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe  — save a subscription
app.post('/api/push/subscribe', auth, (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'Invalid subscription' });
    const existing = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    if (!existing) {
      const id = require('crypto').randomUUID();
      db.prepare('INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)')
        .run(id, req.userId, endpoint, keys.p256dh, keys.auth);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/push/unsubscribe
app.delete('/api/push/unsubscribe', auth, (req, res) => {
  try {
    const { endpoint } = req.body;
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(req.userId, endpoint);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/push/test  — send a test push
app.post('/api/push/test', auth, async (req, res) => {
  try {
    await sendPushToUser(req.userId, '🔔 WappFlow', 'Push notifications are working!', { url: '/dashboard' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  INTERNAL CHAT ROUTES
// ════════════════════════════════════════════════════════════

// Get or create workspace for user (workspace_id = user_id for simplicity)
const getWorkspaceId = (userId) => {
  const user = db.prepare('SELECT workspace_id FROM users WHERE id = ?').get(userId);
  return user?.workspace_id || userId;
};

// Auto-create default channels for new workspaces
const ensureDefaultChannels = (workspaceId, userId) => {
  const existing = db.prepare('SELECT id FROM chat_channels WHERE workspace_id = ?').all(workspaceId);
  if (existing.length === 0) {
    const defaults = [
      { name: 'general', description: 'General team discussion' },
      { name: 'leads', description: 'Lead updates and discussions' },
      { name: 'random', description: 'Off-topic chat' },
    ];
    const insert = db.prepare('INSERT OR IGNORE INTO chat_channels (id, workspace_id, name, description, created_by) VALUES (?, ?, ?, ?, ?)');
    defaults.forEach(ch => insert.run(require('crypto').randomUUID(), workspaceId, ch.name, ch.description, userId));
  }
};

// GET /api/chat/channels
app.get('/api/chat/channels', auth, (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req.userId);
    ensureDefaultChannels(workspaceId, req.userId);
    const channels = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM chat_messages WHERE channel_id = c.id) as message_count,
        (SELECT body FROM chat_messages WHERE channel_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM chat_messages WHERE channel_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
      FROM chat_channels c WHERE c.workspace_id = ? ORDER BY c.name
    `).all(workspaceId);
    res.json({ channels });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/chat/channels
app.post('/api/chat/channels', auth, (req, res) => {
  try {
    const { name, description, is_private } = req.body;
    if (!name) return res.status(400).json({ error: 'Channel name required' });
    const workspaceId = getWorkspaceId(req.userId);
    const id = require('crypto').randomUUID();
    db.prepare('INSERT INTO chat_channels (id, workspace_id, name, description, is_private, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, workspaceId, name.toLowerCase().replace(/\s+/g, '-'), description || '', is_private ? 1 : 0, req.userId);
    const channel = db.prepare('SELECT * FROM chat_channels WHERE id = ?').get(id);
    res.json({ channel });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/chat/channels/:id
app.delete('/api/chat/channels/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM chat_messages WHERE channel_id = ?').run(req.params.id);
    db.prepare('DELETE FROM chat_channels WHERE id = ? AND created_by = ?').run(req.params.id, req.userId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/chat/channels/:id/messages
app.get('/api/chat/channels/:channelId/messages', auth, (req, res) => {
  try {
    const { limit = 50, before } = req.query;
    let query = 'SELECT m.*, (SELECT json_group_array(json_object(\'emoji\', r.emoji, \'user_id\', r.user_id)) FROM chat_reactions r WHERE r.message_id = m.id) as reactions FROM chat_messages m WHERE m.channel_id = ?';
    const params = [req.params.channelId];
    if (before) { query += ' AND m.created_at < ?'; params.push(before); }
    query += ' ORDER BY m.created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const messages = db.prepare(query).all(...params).reverse();
    // Parse reactions JSON
    messages.forEach(m => {
      try { m.reactions = JSON.parse(m.reactions || '[]'); } catch { m.reactions = []; }
    });
    res.json({ messages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/chat/channels/:channelId/messages
app.post('/api/chat/channels/:channelId/messages', auth, (req, res) => {
  try {
    const { body, reply_to } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Message body required' });
    const user = db.prepare('SELECT business_name, email FROM users WHERE id = ?').get(req.userId);
    const senderName = user?.business_name || user?.email || 'Unknown';
    const id = require('crypto').randomUUID();
    db.prepare('INSERT INTO chat_messages (id, channel_id, user_id, sender_name, body, reply_to) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, req.params.channelId, req.userId, senderName, body.trim(), reply_to || null);
    const message = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id);
    message.reactions = [];
    // Broadcast via SSE
    broadcastToUser(req.userId, 'chat_message', { channel_id: req.params.channelId, message });
    res.json({ message });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/chat/channels/:channelId/messages/media
app.post('/api/chat/channels/:channelId/messages/media', auth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const user = db.prepare('SELECT business_name, email FROM users WHERE id = ?').get(req.userId);
    const senderName = user?.business_name || user?.email || 'Unknown';
    const id = require('crypto').randomUUID();
    const mediaUrl = `${process.env.BASE_URL || 'http://localhost:3001'}/uploads/${req.file.filename}`;
    const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'file';
    db.prepare('INSERT INTO chat_messages (id, channel_id, user_id, sender_name, body, media_url, media_type) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.params.channelId, req.userId, senderName, req.file.originalname, mediaUrl, mediaType);
    const message = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id);
    message.reactions = [];
    res.json({ message });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/chat/messages/:id
app.delete('/api/chat/messages/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM chat_messages WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/chat/messages/:id/react
app.post('/api/chat/messages/:id/react', auth, (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'Emoji required' });
    const id = require('crypto').randomUUID();
    // Toggle: if exists, delete; else insert
    const existing = db.prepare('SELECT id FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').get(req.params.id, req.userId, emoji);
    if (existing) {
      db.prepare('DELETE FROM chat_reactions WHERE id = ?').run(existing.id);
    } else {
      db.prepare('INSERT INTO chat_reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)').run(id, req.params.id, req.userId, emoji);
    }
    const reactions = db.prepare('SELECT emoji, user_id FROM chat_reactions WHERE message_id = ?').all(req.params.id);
    res.json({ reactions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  WORKSPACE ROUTES
// ════════════════════════════════════════════════════════════

// GET /api/workspace — workspace info + current user's role
app.get('/api/workspace', auth, (req, res) => {
  try {
    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.workspaceId);
    const members = db.prepare(`
      SELECT wm.id, wm.user_id, wm.role, wm.full_name, wm.invite_email, wm.invite_status,
             u.email, u.business_name, u.created_at as user_created_at
      FROM workspace_members wm
      LEFT JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ?
      ORDER BY CASE wm.role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, wm.created_at ASC
    `).all(req.workspaceId);
    const rolePerms = db.prepare('SELECT role, permissions FROM workspace_role_permissions WHERE workspace_id = ?').all(req.workspaceId);
    const permMap = {};
    rolePerms.forEach(r => { try { permMap[r.role] = JSON.parse(r.permissions); } catch {} });
    res.json({ workspace, members, rolePermissions: permMap, currentUserRole: req.userRole });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/workspace — update workspace name
app.put('/api/workspace', auth, (req, res) => {
  try {
    if (!['super_admin', 'admin'].includes(req.userRole)) return res.status(403).json({ error: 'Insufficient permissions' });
    const { name } = req.body;
    db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, req.workspaceId);
    res.json({ workspace: db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.workspaceId) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/workspace/invite — invite user by email
app.post('/api/workspace/invite', auth, async (req, res) => {
  try {
    if (!['super_admin', 'admin'].includes(req.userRole)) return res.status(403).json({ error: 'Insufficient permissions' });

    // Plan enforcement — team_members limit
    const limitCheck = checkLimit(req.workspaceId, 'team_members');
    if (!limitCheck.ok) return res.status(403).json({ error: limitCheck.message, code: 'plan_limit', ...limitCheck });

    const { email, role, full_name } = req.body;
    if (!email || !role) return res.status(400).json({ error: 'Email and role required' });
    if (!['admin', 'manager', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    // Check if user already exists in this workspace
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    const existingMember = existingUser
      ? db.prepare('SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(req.workspaceId, existingUser.id)
      : null;
    if (existingMember) return res.status(400).json({ error: 'User already in workspace' });

    const invite_token = generateId() + generateId(); // long token
    const memberId = generateId();

    if (existingUser) {
      // Add existing user to workspace
      db.prepare(`INSERT INTO workspace_members (id, workspace_id, user_id, role, full_name, invite_email, invite_status) VALUES (?, ?, ?, ?, ?, ?, 'active')`)
        .run(memberId, req.workspaceId, existingUser.id, role, full_name || email, email);
      db.prepare('UPDATE users SET workspace_id = ? WHERE id = ?').run(req.workspaceId, existingUser.id);
    } else {
      // Create pending invite
      db.prepare(`INSERT INTO workspace_members (id, workspace_id, user_id, role, full_name, invite_email, invite_token, invite_status) VALUES (?, ?, NULL, ?, ?, ?, ?, 'pending')`)
        .run(memberId, req.workspaceId, role, full_name || '', email, invite_token);
    }

    const member = db.prepare('SELECT * FROM workspace_members WHERE id = ?').get(memberId);
    logAudit(req.workspaceId, req.userId, 'invite_member', 'workspace_member', memberId, { email, role });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const inviteLink = existingUser ? null : `${frontendUrl}/accept-invite?token=${invite_token}`;

    // ── Send invite email via workspace SMTP settings ──
    let emailSent = false;
    if (!existingUser && inviteLink) {
      try {
        const smtpRow = db.prepare('SELECT * FROM email_smtp_settings WHERE user_id = ?').get(req.workspaceOwnerId);
        const inviterUser = db.prepare('SELECT business_name, email FROM users WHERE id = ?').get(req.workspaceOwnerId);
        const workspace = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(req.workspaceId);
        const workspaceName = workspace?.name || inviterUser?.business_name || 'WappFlow';

        if (smtpRow && smtpRow.smtp_host && smtpRow.smtp_user && smtpRow.smtp_pass) {
          const transporter = nodemailer.createTransport({
            host: smtpRow.smtp_host,
            port: smtpRow.smtp_port || 587,
            secure: !!smtpRow.smtp_secure,
            auth: { user: smtpRow.smtp_user, pass: smtpRow.smtp_pass },
          });

          const roleLabels = { admin: 'Admin', manager: 'Manager', user: 'Team Member' };
          const roleLabel = roleLabels[role] || role;

          await transporter.sendMail({
            from: `"${workspaceName}" <${smtpRow.smtp_user}>`,
            to: email,
            subject: `You've been invited to join ${workspaceName} on WappFlow`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; background: #f8fafc; padding: 32px 16px;">
                <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.06);">
                  <div style="text-align: center; margin-bottom: 32px;">
                    <div style="display: inline-block; background: linear-gradient(135deg, #6366f1, #06b6d4); border-radius: 12px; padding: 12px 20px; margin-bottom: 16px;">
                      <span style="color: white; font-size: 20px; font-weight: 900; letter-spacing: -0.5px;">⚡ WappFlow</span>
                    </div>
                  </div>

                  <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 12px; text-align: center;">You're invited!</h1>
                  <p style="font-size: 16px; color: #475569; text-align: center; margin: 0 0 32px;">
                    <strong>${workspaceName}</strong> has invited you to join their workspace as <strong>${roleLabel}</strong>.
                  </p>

                  <div style="text-align: center; margin-bottom: 32px;">
                    <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; text-decoration: none; padding: 14px 40px; border-radius: 12px; font-size: 16px; font-weight: 700; letter-spacing: -0.2px;">
                      Accept Invitation →
                    </a>
                  </div>

                  <div style="background: #f8fafc; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
                    <p style="font-size: 12px; color: #94a3b8; margin: 0 0 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Or copy this link:</p>
                    <p style="font-size: 12px; color: #6366f1; margin: 0; word-break: break-all; font-family: monospace;">${inviteLink}</p>
                  </div>

                  <p style="font-size: 13px; color: #94a3b8; text-align: center; margin: 0;">
                    This link will let you create your account and set your password.<br/>
                    If you didn't expect this invitation, you can safely ignore this email.
                  </p>
                </div>
              </div>
            `,
          });
          emailSent = true;
          console.log(`📧 Invite email sent to ${email}`);
        } else {
          console.log(`⚠️ No SMTP configured — invite link generated but not emailed. Link: ${inviteLink}`);
        }
      } catch (emailErr) {
        console.error('⚠️ Failed to send invite email:', emailErr.message);
        // Don't fail the whole request if email fails — link still works
      }
    }

    res.status(201).json({ member, invite_link: inviteLink, email_sent: emailSent });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/workspace/members/:id — update member role/permissions
app.put('/api/workspace/members/:id', auth, (req, res) => {
  try {
    if (!['super_admin', 'admin'].includes(req.userRole)) return res.status(403).json({ error: 'Insufficient permissions' });
    const { role, permissions } = req.body;
    const member = db.prepare('SELECT * FROM workspace_members WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (member.role === 'super_admin' && req.userRole !== 'super_admin') return res.status(403).json({ error: 'Cannot modify super admin' });
    if (role === 'super_admin' && req.userRole !== 'super_admin') return res.status(403).json({ error: 'Cannot assign super admin' });

    db.prepare('UPDATE workspace_members SET role = ?, permissions = ? WHERE id = ?')
      .run(role || member.role, permissions ? JSON.stringify(permissions) : member.permissions, req.params.id);
    res.json({ member: db.prepare('SELECT * FROM workspace_members WHERE id = ?').get(req.params.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/workspace/members/:id — remove member
app.delete('/api/workspace/members/:id', auth, (req, res) => {
  try {
    if (!['super_admin', 'admin'].includes(req.userRole)) return res.status(403).json({ error: 'Insufficient permissions' });
    const member = db.prepare('SELECT * FROM workspace_members WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (member.role === 'super_admin') return res.status(403).json({ error: 'Cannot remove workspace owner' });
    if (member.user_id === req.userId) return res.status(400).json({ error: 'Cannot remove yourself' });
    db.prepare('DELETE FROM workspace_members WHERE id = ?').run(req.params.id);
    // Reset user's workspace to null if they're removed
    if (member.user_id) {
      db.prepare('UPDATE users SET workspace_id = NULL WHERE id = ?').run(member.user_id);
    }
    res.json({ message: 'Member removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/workspace/role-permissions — get workspace role permissions
app.get('/api/workspace/role-permissions', auth, (req, res) => {
  try {
    const saved = db.prepare('SELECT role, permissions FROM workspace_role_permissions WHERE workspace_id = ?').all(req.workspaceId);
    const result = { ...DEFAULT_ROLE_PERMISSIONS };
    saved.forEach(r => {
      try { result[r.role] = { ...DEFAULT_ROLE_PERMISSIONS[r.role], ...JSON.parse(r.permissions) }; } catch {}
    });
    res.json({ permissions: result, defaults: DEFAULT_ROLE_PERMISSIONS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/workspace/role-permissions — update role permissions
app.put('/api/workspace/role-permissions', auth, (req, res) => {
  try {
    if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Only workspace owner can modify role permissions' });
    const { role, permissions } = req.body;
    if (!role || !permissions) return res.status(400).json({ error: 'role and permissions required' });
    db.prepare(`
      INSERT INTO workspace_role_permissions (id, workspace_id, role, permissions) VALUES (?, ?, ?, ?)
      ON CONFLICT(workspace_id, role) DO UPDATE SET permissions = excluded.permissions
    `).run(generateId(), req.workspaceId, role, JSON.stringify(permissions));
    res.json({ message: 'Permissions updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  EMAIL SMTP SETTINGS
// ════════════════════════════════════════════════════════════

// GET /api/settings/email-smtp
app.get('/api/settings/email-smtp', auth, (req, res) => {
  try {
    let row = db.prepare('SELECT * FROM email_smtp_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    if (!row) row = { smtp_host: '', smtp_port: 587, smtp_secure: 0, smtp_user: '', smtp_pass: '', from_name: '', from_email: '' };
    res.json({ smtp: { ...row, smtp_pass: row.smtp_pass ? '••••••••' : '' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/settings/email-smtp
app.put('/api/settings/email-smtp', auth, (req, res) => {
  try {
    if (!['super_admin', 'admin'].includes(req.userRole)) return res.status(403).json({ error: 'Insufficient permissions' });
    const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email } = req.body;
    const existing = db.prepare('SELECT id, smtp_pass FROM email_smtp_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    // Keep existing password if not provided or masked
    const finalPass = (!smtp_pass || smtp_pass === '••••••••') ? (existing?.smtp_pass || '') : smtp_pass;
    if (existing) {
      db.prepare('UPDATE email_smtp_settings SET smtp_host=?, smtp_port=?, smtp_secure=?, smtp_user=?, smtp_pass=?, from_name=?, from_email=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?')
        .run(smtp_host||'', smtp_port||587, smtp_secure?1:0, smtp_user||'', finalPass, from_name||'', from_email||'', req.workspaceOwnerId);
    } else {
      db.prepare('INSERT INTO email_smtp_settings (id, user_id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(generateId(), req.workspaceOwnerId, smtp_host||'', smtp_port||587, smtp_secure?1:0, smtp_user||'', finalPass, from_name||'', from_email||'');
    }
    res.json({ message: 'SMTP settings saved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/settings/email-smtp/test — send a test email
app.post('/api/settings/email-smtp/test', auth, async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM email_smtp_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    if (!row || !row.smtp_host) return res.status(400).json({ error: 'SMTP not configured' });
    const transporter = nodemailer.createTransport({
      host: row.smtp_host, port: row.smtp_port, secure: !!row.smtp_secure,
      auth: { user: row.smtp_user, pass: row.smtp_pass }
    });
    await transporter.verify();
    const info = await transporter.sendMail({
      from: `"${row.from_name || 'WappFlow'}" <${row.from_email || row.smtp_user}>`,
      to: row.from_email || row.smtp_user,
      subject: 'WappFlow SMTP Test',
      text: 'Your SMTP settings are working correctly!',
      html: '<p>Your SMTP settings are working correctly! ✅</p>'
    });
    res.json({ message: 'Test email sent', info: info.messageId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  EMAIL IMAP SETTINGS (RECEIVING)
// ════════════════════════════════════════════════════════════

app.get('/api/settings/email-imap', auth, (req, res) => {
  try {
    let row = db.prepare('SELECT * FROM email_imap_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    if (!row) row = { imap_host: '', imap_port: 993, imap_secure: 1, imap_user: '', imap_pass: '', is_enabled: 0 };
    res.json({ imap: { ...row, imap_pass: row.imap_pass ? '••••••••' : '' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings/email-imap', auth, (req, res) => {
  try {
    if (!['super_admin', 'admin'].includes(req.userRole)) return res.status(403).json({ error: 'Insufficient permissions' });
    const { imap_host, imap_port, imap_secure, imap_user, imap_pass, is_enabled } = req.body;
    const existing = db.prepare('SELECT id, imap_pass FROM email_imap_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    const finalPass = (!imap_pass || imap_pass === '••••••••') ? (existing?.imap_pass || '') : imap_pass;
    if (existing) {
      db.prepare('UPDATE email_imap_settings SET imap_host=?, imap_port=?, imap_secure=?, imap_user=?, imap_pass=?, is_enabled=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?')
        .run(imap_host||'', imap_port||993, imap_secure?1:0, imap_user||'', finalPass, is_enabled?1:0, req.workspaceOwnerId);
    } else {
      db.prepare('INSERT INTO email_imap_settings (id, user_id, imap_host, imap_port, imap_secure, imap_user, imap_pass, is_enabled) VALUES (?,?,?,?,?,?,?,?)')
        .run(generateId(), req.workspaceOwnerId, imap_host||'', imap_port||993, imap_secure?1:0, imap_user||'', finalPass, is_enabled?1:0);
    }
    res.json({ message: 'IMAP settings saved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/settings/email-imap/test — test IMAP connection
app.post('/api/settings/email-imap/test', auth, async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM email_imap_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    if (!row || !row.imap_host) return res.status(400).json({ error: 'IMAP not configured' });
    const Imap = require('imap');
    const imap = new Imap({
      user: row.imap_user, password: row.imap_pass,
      host: row.imap_host, port: row.imap_port,
      tls: !!row.imap_secure, tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000, authTimeout: 8000,
    });
    await new Promise((resolve, reject) => {
      imap.once('ready', () => { imap.end(); resolve(); });
      imap.once('error', reject);
      imap.connect();
    });
    res.json({ message: 'Connection successful!' });
  } catch (e) { res.status(500).json({ error: 'Connection failed: ' + e.message }); }
});

// ════════════════════════════════════════════════════════════
//  LEAD EMAILS
// ════════════════════════════════════════════════════════════

// GET /api/leads/:id/emails
app.get('/api/leads/:id/emails', auth, (req, res) => {
  try {
    const emails = db.prepare('SELECT * FROM lead_emails WHERE lead_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json({ emails });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leads/:id/email — compose and send an email
app.post('/api/leads/:id/email', auth, async (req, res) => {
  try {
    const { to_email, subject, body } = req.body;
    if (!to_email || !subject || !body) return res.status(400).json({ error: 'to_email, subject, and body required' });

    const smtpRow = db.prepare('SELECT * FROM email_smtp_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    if (!smtpRow || !smtpRow.smtp_host) return res.status(400).json({ error: 'SMTP not configured. Please set up email sending in Settings → Email Sending.' });

    const transporter = nodemailer.createTransport({
      host: smtpRow.smtp_host, port: smtpRow.smtp_port, secure: !!smtpRow.smtp_secure,
      auth: { user: smtpRow.smtp_user, pass: smtpRow.smtp_pass }
    });

    const mailResult = await transporter.sendMail({
      from: `"${smtpRow.from_name || 'WappFlow'}" <${smtpRow.from_email || smtpRow.smtp_user}>`,
      to: to_email,
      subject,
      html: body.replace(/\n/g, '<br>'),
      text: body,
    });

    // Record the email
    const emailId = generateId();
    db.prepare('INSERT INTO lead_emails (id, lead_id, workspace_id, user_id, direction, from_email, to_email, subject, body, status) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(emailId, req.params.id, req.workspaceId, req.userId, 'sent', smtpRow.from_email || smtpRow.smtp_user, to_email, subject, body, 'sent');

    logAudit(req.workspaceId, req.userId, 'email_sent', 'lead', req.params.id, { to_email, subject });
    const email = db.prepare('SELECT * FROM lead_emails WHERE id = ?').get(emailId);
    res.json({ email, messageId: mailResult.messageId });
  } catch (e) {
    console.error('Email send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  EMAIL INBOUND (GMAIL IMAP POLLING)
// ════════════════════════════════════════════════════════════

const Imap = require('imap');
const { simpleParser } = require('mailparser');

let triggerEmailPoll = null; // Set by startEmailPoller; used for manual poll endpoint

// POST /api/settings/email-imap/poll-now — immediately run IMAP poll
app.post('/api/settings/email-imap/poll-now', auth, async (req, res) => {
  try {
    if (typeof triggerEmailPoll === 'function') {
      await triggerEmailPoll(req.workspaceOwnerId);
      res.json({ message: 'Poll triggered' });
    } else {
      res.status(503).json({ error: 'Email poller not ready' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function startEmailPoller() {
  const Imap = require('imap');
  const { simpleParser } = require('mailparser');

  async function pollWorkspace(config) {
    return new Promise((resolve) => {
      const imap = new Imap({
        user: config.imap_user,
        password: config.imap_pass,
        host: config.imap_host,
        port: config.imap_port || 993,
        tls: !!config.imap_secure,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 20000,
        authTimeout: 10000,
      });

      imap.once('ready', () => {
        imap.openBox('INBOX', false, (err) => {
          if (err) { imap.end(); return resolve(); }
          imap.search(['UNSEEN'], (err, results) => {
            if (err || !results || results.length === 0) { imap.end(); return resolve(); }
            console.log(`📧 [${config.imap_user}] Found ${results.length} new email(s)`);
            const fetch = imap.fetch(results, { bodies: '', markSeen: true });
            const promises = [];
            fetch.on('message', (msg) => {
              let buffer = '';
              msg.on('body', (stream) => {
                stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
                stream.once('end', () => {
                  promises.push(
                    simpleParser(buffer).then(parsed => {
                      const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase();
                      const subject = parsed.subject || '(no subject)';
                      const bodyText = parsed.text || parsed.html || '';
                      if (!fromEmail) return;

                      // Match lead by email within this workspace
                      const lead = db.prepare(`
                        SELECT * FROM leads
                        WHERE LOWER(email) = ? AND workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
                        LIMIT 1
                      `).get(fromEmail, config.workspace_id);

                      if (!lead) {
                        console.log(`📧 No lead found for: ${fromEmail}`);
                        return;
                      }

                      // Dedup: skip if we already stored an email from same address with same subject in last 10 min
                      const recentDup = db.prepare(`
                        SELECT id FROM lead_emails
                        WHERE lead_id = ? AND direction = 'received' AND from_email = ? AND subject = ?
                        AND created_at >= datetime('now', '-10 minutes')
                      `).get(lead.id, fromEmail, subject);
                      if (recentDup) {
                        console.log(`📧 Skipping duplicate email from ${fromEmail}: "${subject}"`);
                        return;
                      }

                      const emailId = generateId();
                      db.prepare(`
                        INSERT INTO lead_emails (id, lead_id, workspace_id, user_id, direction, from_email, to_email, subject, body, status)
                        VALUES (?, ?, ?, ?, 'received', ?, ?, ?, ?, 'received')
                      `).run(emailId, lead.id, lead.workspace_id, lead.user_id, fromEmail, config.imap_user, subject, bodyText);

                      addContactHistory(lead.id, lead.user_id, 'email', `Email received: ${subject}`);
                      broadcastToWorkspace(lead.workspace_id, 'email_received', {
                        lead_id: lead.id, from_email: fromEmail, subject,
                        preview: bodyText.substring(0, 100),
                      });
                      console.log(`📧 Saved email from ${fromEmail} → lead: ${lead.customer_name}`);
                    }).catch(e => console.error('Parse error:', e.message))
                  );
                });
              });
            });
            fetch.once('end', () => { Promise.all(promises).finally(() => imap.end()).then(resolve); });
          });
        });
      });

      imap.once('error', (e) => {
        console.error(`IMAP error [${config.imap_user}]:`, e.message);
        resolve();
      });

      imap.connect();
    });
  }

  async function pollAll(filterUserId) {
    try {
      // Get all workspaces with IMAP enabled (optionally filter to one user)
      let query = `
        SELECT i.*, u.workspace_id
        FROM email_imap_settings i
        JOIN users u ON u.id = i.user_id
        WHERE i.is_enabled = 1 AND i.imap_host != '' AND i.imap_user != '' AND i.imap_pass != ''
      `;
      const configs = filterUserId
        ? db.prepare(query + ' AND i.user_id = ?').all(filterUserId)
        : db.prepare(query).all();

      if (configs.length === 0) return;
      for (const config of configs) {
        await pollWorkspace(config);
      }
    } catch (e) { console.error('Poll error:', e.message); }
  }

  // Expose manual trigger for the /poll-now endpoint
  triggerEmailPoll = (userId) => pollAll(userId);

  // Remove old .env-based poller — now driven by DB
  pollAll();
  setInterval(pollAll, 2 * 60 * 1000);
  console.log('✅ Email poller started (DB-driven, checks every 2 minutes)');
}

startEmailPoller();

// ════════════════════════════════════════════════════════════
//  CRON JOBS
// ════════════════════════════════════════════════════════════

const cron = require('node-cron');

// Runs every minute — checks for due reminders and sends push notifications
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date().toISOString();
    const dueReminders = db.prepare(`
      SELECT r.*, l.customer_name, l.customer_phone, l.id as lead_id
      FROM reminders r
      LEFT JOIN leads l ON l.id = r.lead_id
      WHERE r.is_completed = 0
AND r.reminder_date <= ?
AND r.reminder_date >= datetime(?, '-2 minutes')
    `).all(now, now);

    for (const reminder of dueReminders) {
      // Send push notification to the user who set the reminder
      await sendPushToUser(
        reminder.user_id,
        '⏰ Reminder Due',
        `${reminder.title || reminder.message} — ${reminder.customer_name || 'Lead'}`,
        { url: `/leads/${reminder.lead_id}` }
      );

      // Broadcast via SSE so the frontend can show a toast
      broadcastToUser(reminder.user_id, 'reminder_due', {
        reminder_id: reminder.id,
        title: reminder.title || reminder.message,
        lead_id: reminder.lead_id,
        customer_name: reminder.customer_name,
      });

      console.log(`⏰ Reminder fired: ${reminder.title} for ${reminder.customer_name}`);
    }
  } catch (e) {
    console.error('Cron reminder error:', e.message);
  }
});

// Runs every day at midnight — cleans up 90-day old trash
cron.schedule('0 0 * * *', () => {
  try {
    const result = db.prepare(`
      DELETE FROM leads WHERE is_deleted = 1 AND deleted_at < datetime('now', '-90 days')
    `).run();
    if (result.changes > 0) console.log(`🗑️ Auto-cleanup: removed ${result.changes} expired trash leads`);
  } catch (e) {
    console.error('Cron cleanup error:', e.message);
  }
});

console.log('✅ Cron jobs started');

// ════════════════════════════════════════════════════════════
//  AI ASSISTANT (GEMINI)
// ════════════════════════════════════════════════════════════

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ── Auto lead analysis (item 16) ──────────────────────────────────────────────
// Every lead that lands gets an AI "mark" (score / sentiment / urgency) shortly
// after it arrives — without anyone opening it. Runs a small, rate-limit-friendly
// batch on a timer so it covers leads from every inbound channel.
let _autoAnalyzeRunning = false;
async function autoAnalyzePendingLeads() {
  if (_autoAnalyzeRunning) return;
  _autoAnalyzeRunning = true;
  try {
    const pending = db.prepare(`
      SELECT * FROM leads
      WHERE (is_deleted = 0 OR is_deleted IS NULL)
        AND total_messages > 0
        AND (ai_last_analyzed_at IS NULL
             OR (last_message_at IS NOT NULL AND ai_last_analyzed_at < last_message_at))
      ORDER BY last_message_at DESC
      LIMIT 4
    `).all();
    for (const lead of pending) {
      try {
        const messages = db.prepare('SELECT * FROM messages WHERE lead_id = ? ORDER BY timestamp ASC LIMIT 30').all(lead.id);
        if (!messages.length) {
          db.prepare('UPDATE leads SET ai_last_analyzed_at = CURRENT_TIMESTAMP WHERE id = ?').run(lead.id);
          continue;
        }
        const memoryContext = getMemoryContext(lead.workspace_id);
        const analysis = await aiEngine.analyzeLeadIntelligence(messages, lead, memoryContext);
        db.prepare(`UPDATE leads SET lead_score = COALESCE(?, lead_score), sentiment = ?, urgency = ?,
          intent_category = ?, ai_last_analyzed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
          analysis.lead_score ?? null, analysis.sentiment || null, analysis.urgency || null,
          analysis.intent_category || null, lead.id);
      } catch (e) {
        console.log(`auto-analyze: lead ${lead.id} skipped — ${e.message}`);
        // Mark it analyzed so the batch moves on; the next inbound message re-queues it.
        try { db.prepare('UPDATE leads SET ai_last_analyzed_at = CURRENT_TIMESTAMP WHERE id = ?').run(lead.id); } catch {}
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (e) {
    console.log('auto-analyze batch error:', e.message);
  } finally {
    _autoAnalyzeRunning = false;
  }
}
setInterval(autoAnalyzePendingLeads, 90 * 1000);
setTimeout(autoAnalyzePendingLeads, 15000);

async function callGemini(prompt, maxTokens = 2048) {
  // Delegates to the centralized AI engine — provider-aware (Cerebras / Groq /
  // OpenAI / Anthropic) with automatic rate-limit retry + backoff. The legacy
  // name is kept so existing callers don't need to change.
  return aiEngine.callLLM(prompt, { maxTokens });
}

// Strip markdown code fences and extract a JSON array or object from raw AI output
function extractJSON(raw, type = 'array') {
  if (!raw) return null;
  // Remove ```json ... ``` or ``` ... ``` fences
  let cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
  // For arrays: grab from first [ to its matching last ]
  if (type === 'array') {
    const start = cleaned.indexOf('[');
    const end   = cleaned.lastIndexOf(']');
    if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  } else {
    const start = cleaned.indexOf('{');
    const end   = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  }
  try { return JSON.parse(cleaned); } catch { return null; }
}

function buildConversationContext(messages, lead) {
  const msgText = messages.map(m =>
    `${m.from_me ? 'Staff' : 'Customer'} [${new Date(m.timestamp).toLocaleTimeString()}]: ${m.body || '[media]'}`
  ).join('\n');

  return `
Lead Name: ${lead.customer_name || 'Unknown'}
Lead Status: ${lead.status || 'New'}
Lead Phone: ${lead.customer_phone || ''}
Estimated Value: ${lead.estimated_value || 0}
Messages (${messages.length} total):
${msgText || 'No messages yet.'}
  `.trim();
}

// POST /api/leads/:id/ai/summary
app.post('/api/leads/:id/ai/summary', auth, async (req, res) => {
  try {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const messages = db.prepare('SELECT * FROM (SELECT * FROM messages WHERE lead_id = ? ORDER BY timestamp DESC LIMIT 40) ORDER BY timestamp ASC').all(req.params.id);

    const context = buildConversationContext(messages, lead);
    const memoryContext = getMemoryContext(req.workspaceId);
const prompt = `
You are an AI sales assistant for a WhatsApp CRM.
${memoryContext}
Analyze this conversation and provide a concise summary in 2-3 sentences.
Focus on: what the customer wants, their current status, and what action is needed next.
Respond in plain text only, no formatting.

${context}
    `.trim();

    const summary = await callGemini(prompt);
    
    // Save to contact history
    addContactHistory(req.params.id, req.userId, 'ai', 'AI Summary generated');
    
    res.json({ summary });
  } catch (e) {
    console.error('AI summary error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/leads/:id/ai/reply-suggestions
app.post('/api/leads/:id/ai/reply-suggestions', auth, async (req, res) => {
  try {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const messages = db.prepare('SELECT * FROM messages WHERE lead_id = ? ORDER BY timestamp ASC LIMIT 20').all(req.params.id);

    // Get business context
    const cs = db.prepare('SELECT company_name FROM company_settings WHERE user_id = ?').get(req.workspaceOwnerId);
    const presets = db.prepare('SELECT title, body FROM message_presets WHERE user_id = ? LIMIT 5').all(req.workspaceOwnerId);
    const presetsText = presets.map(p => `- ${p.title}: ${p.body}`).join('\n');

    const context = buildConversationContext(messages, lead);
    const memoryContext = getMemoryContext(req.workspaceId);
const prompt = `
You are an AI sales assistant for a WhatsApp CRM.
Business: ${cs?.company_name || 'Unknown Business'}
${memoryContext}
${presetsText ? `Existing message templates:\n${presetsText}` : ''}

Based on this conversation, suggest exactly 3 short WhatsApp reply options.
Each reply should be natural, professional, and ready to send.
Format your response as JSON array only, no explanation:
["reply 1", "reply 2", "reply 3"]

${context}
    `.trim();

    const raw = await callGemini(prompt);
    let suggestions = [];
    const parsed = extractJSON(raw, 'array');
    if (parsed && Array.isArray(parsed)) {
      suggestions = parsed;
    } else {
      // Fallback: split plain-text lines
      suggestions = raw.split('\n').map(l => l.replace(/^[\d.\-*\s"]+|["]+$/g, '').trim()).filter(l => l.length > 5).slice(0, 3);
    }

    res.json({ suggestions });
  } catch (e) {
    console.error('AI reply error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/leads/:id/ai/analyze — uses centralized ai-engine, persists sentiment/urgency/intent
app.post('/api/leads/:id/ai/analyze', auth, async (req, res) => {
  try {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const messages = db.prepare('SELECT * FROM messages WHERE lead_id = ? ORDER BY timestamp ASC LIMIT 30').all(req.params.id);

    const memories = db.prepare(`SELECT memory_type, key, value FROM ai_memories WHERE workspace_id = ? ORDER BY confidence DESC LIMIT 30`).all(req.workspaceId);
    const profile = db.prepare(`SELECT * FROM workspace_ai_profile WHERE workspace_id = ?`).get(req.workspaceId);
    const memoryContext = aiEngine.formatMemoryContext(memories) + aiEngine.formatProfileContext(profile);

    const analysis = await aiEngine.analyzeLeadIntelligence(messages, lead, memoryContext);

    // Persist intelligence fields on the lead
    db.prepare(`UPDATE leads SET
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
      req.params.id
    );

    res.json({ analysis });
  } catch (e) {
    console.error('AI analyze error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ai/sentiment — quick single-message sentiment classification
app.post('/api/ai/sentiment', auth, async (req, res) => {
  try {
    const { text } = req.body || {};
    const result = await aiEngine.detectSentiment(text);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/ai/rewrite — rewrite a message in a given tone (professional|friendly|casual|formal|empathetic)
// Falls back to the workspace's preferred tone if no tone supplied.
app.post('/api/ai/rewrite', auth, async (req, res) => {
  try {
    const { text, tone } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text required' });
    let resolvedTone = tone;
    if (!resolvedTone) {
      const prof = db.prepare(`SELECT tone FROM workspace_ai_profile WHERE workspace_id = ?`).get(req.workspaceId);
      resolvedTone = prof?.tone || 'professional';
    }
    const out = await aiEngine.rewriteMessage(text, resolvedTone);
    res.json({ text: out, tone: resolvedTone });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/ai/translate — translate text to a target language
app.post('/api/ai/translate', auth, async (req, res) => {
  try {
    const { text, target_lang } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text required' });
    const out = await aiEngine.translateMessage(text, target_lang || 'English');
    res.json({ text: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/ai/shorten — shorten a message while keeping meaning
app.post('/api/ai/shorten', auth, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text required' });
    const out = await aiEngine.shortenMessage(text);
    res.json({ text: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/ai/status — report which provider is active (for diagnostics / UI)
app.get('/api/ai/status', auth, (req, res) => {
  res.json({ provider: aiEngine.getActiveProvider() });
});

// GET /api/ai/profile — workspace AI command center settings
app.get('/api/ai/profile', auth, (req, res) => {
  try {
    let profile = db.prepare('SELECT * FROM workspace_ai_profile WHERE workspace_id = ?').get(req.workspaceId);
    if (!profile) {
      profile = { workspace_id: req.workspaceId, tone: 'professional', language: 'English', auto_analyze: 0 };
    }
    res.json({ profile });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/ai/profile — update workspace AI command center settings
app.put('/api/ai/profile', auth, (req, res) => {
  try {
    const { business_description, tone, language, signature, dos, donts, auto_analyze } = req.body || {};
    db.prepare(`INSERT INTO workspace_ai_profile
      (workspace_id, business_description, tone, language, signature, dos, donts, auto_analyze, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id) DO UPDATE SET
        business_description = excluded.business_description,
        tone = excluded.tone,
        language = excluded.language,
        signature = excluded.signature,
        dos = excluded.dos,
        donts = excluded.donts,
        auto_analyze = excluded.auto_analyze,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      req.workspaceId,
      business_description || null,
      tone || 'professional',
      language || 'English',
      signature || null,
      dos || null,
      donts || null,
      auto_analyze ? 1 : 0
    );
    const profile = db.prepare('SELECT * FROM workspace_ai_profile WHERE workspace_id = ?').get(req.workspaceId);
    res.json({ profile });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/ai/industry-detect — workspace-level industry detection
app.post('/api/ai/industry-detect', auth, async (req, res) => {
  try {
    // Get last 50 messages across all leads in workspace
    const messages = db.prepare(`
      SELECT m.body, m.from_me FROM messages m
      JOIN leads l ON l.id = m.lead_id
      WHERE l.workspace_id = ? AND m.body IS NOT NULL
      ORDER BY m.timestamp DESC LIMIT 50
    `).all(req.workspaceId);

    if (messages.length < 3) return res.json({ industry: 'Unknown', confidence: 0, reason: 'Not enough data yet' });

    const msgSample = messages.map(m => `${m.from_me ? 'Staff' : 'Customer'}: ${m.body}`).join('\n');

    const prompt = `
Analyze these WhatsApp business conversations and detect the industry.
Return JSON only:
{
  "industry": "industry name",
  "industry_key": "one of: training_institute, real_estate, clinic, agency, salon, logistics, ecommerce, general",
  "confidence": <number 0-100>,
  "reason": "one sentence explaining why",
  "common_topics": ["topic1", "topic2", "topic3"]
}

Conversations:
${msgSample}
    `.trim();

    const raw = await callGemini(prompt);
    const result = extractJSON(raw, 'object') || { industry: 'General Business', confidence: 50, reason: 'Could not determine industry' };

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ════════════════════════════════════════════════════════════
//  BUSINESS MEMORY & KNOWLEDGE BASE
// ════════════════════════════════════════════════════════════

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// Multer for knowledge documents
const knowledgeUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => cb(null, `knowledge-${Date.now()}-${file.originalname}`)
  }),
  limits: { fileSize: 20 * 1024 * 1024 }
});

// Helper: extract text from uploaded file
async function extractTextFromFile(filePath, mimeType, originalName) {
  try {
    const ext = path.extname(originalName).toLowerCase();
    if (ext === '.pdf' || mimeType === 'application/pdf') {
      const buffer = fs.readFileSync(filePath);
      const fn = typeof pdfParse === 'function' ? pdfParse : pdfParse.default;
      if (!fn) {
        // Fallback: read raw bytes and extract readable text
        const raw = buffer.toString('latin1');
        const matches = raw.match(/\(([^\)]{3,})\)/g) || [];
        return matches.map(m => m.slice(1, -1)).join(' ');
      }
      const data = await fn(buffer);
      return data.text || '';
    }
    if (ext === '.docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    }
    if (ext === '.txt' || mimeType === 'text/plain') {
      return fs.readFileSync(filePath, 'utf8');
    }
    return '';
  } catch (e) {
    console.error('Text extraction error:', e.message);
    return '';
  }
}

// Helper: extract memories from text using AI
// Dedup guard (item 24) — true when an equivalent memory already exists for the
// workspace, so re-crawling a site / re-uploading a doc / re-learning chats only
// ever adds genuinely new knowledge.
function memoryIsDuplicate(workspaceId, value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return true;
  try {
    return !!db.prepare('SELECT 1 FROM ai_memories WHERE workspace_id = ? AND lower(trim(value)) = ? LIMIT 1')
      .get(workspaceId, v.toLowerCase());
  } catch { return false; }
}

async function extractMemoriesFromText(text, workspaceId) {
  if (!text || text.length < 50) return [];
  const truncated = text.substring(0, 4000);
  const prompt = `
You are a business knowledge extractor. Extract structured facts from this business document.
Return a JSON array of memory objects. Each object must have:
- memory_type: one of "pricing", "service", "policy", "course", "product", "contact", "schedule", "faq", "other"
- key: short label (e.g. "Graphic Design Course Fee", "Refund Policy", "Office Hours")
- value: the actual information (e.g. "45,000 PKR", "No refunds after 7 days", "9 AM - 6 PM")
- confidence: number 0-100

Return JSON array only, no explanation, no markdown. Maximum 20 items.
If nothing useful found, return [].

Document text:
${truncated}
  `.trim();

  try {
    const raw = await callGemini(prompt, 2048);
    console.log('🧠 Raw AI response (first 300 chars):', raw.substring(0, 300));
    const memories = extractJSON(raw, 'array');
    if (!memories) {
      console.error('Memory extraction: could not parse JSON from AI response:', raw.substring(0, 300));
      return [];
    }
    console.log(`🧠 Extracted ${memories.length} memories`);
    return Array.isArray(memories) ? memories : [];
  } catch (e) {
    console.error('Memory extraction error:', e.message);
    return [];
  }
}

// Helper: extract memories from staff chat messages using AI (chat-tuned prompt)
async function extractMemoriesFromChats(messages) {
  if (!messages || messages.length < 5) return [];
  // Take up to 80 messages, truncate to 3500 chars total
  const sample = messages.slice(0, 80).map(m => m.body).join('\n');
  const truncated = sample.substring(0, 3500);
  const prompt = `
You are a business knowledge extractor analyzing WhatsApp staff replies.
Extract reusable business facts — things staff say repeatedly about pricing, services, policies, schedules, products, contact info, or FAQs.
Return a JSON array of memory objects. Each object must have:
- memory_type: one of "pricing", "service", "policy", "course", "product", "contact", "schedule", "faq", "other"
- key: short label (e.g. "Graphic Design Course Fee", "Office Hours", "Refund Policy")
- value: the actual information (e.g. "45,000 PKR for 3 months", "9 AM – 6 PM Mon–Sat", "No refunds after 7 days")
- confidence: number 0-100

Rules:
- Only extract clear, factual, reusable information — ignore casual greetings or filler
- Return JSON array ONLY — no explanation, no markdown, no code fences
- Maximum 20 items; if nothing useful found, return []

Staff messages:
${truncated}
  `.trim();

  try {
    const raw = await callGemini(prompt, 2048);
    console.log('💬 Raw chat-learn AI response (first 300 chars):', raw.substring(0, 300));
    const memories = extractJSON(raw, 'array');
    if (!memories) {
      console.error('Chat memory extraction: could not parse JSON:', raw.substring(0, 300));
      return [];
    }
    console.log(`💬 Extracted ${memories.length} memories from chats`);
    return Array.isArray(memories) ? memories : [];
  } catch (e) {
    console.error('Chat memory extraction error:', e.message);
    return [];
  }
}

// Helper: get workspace memories + AI profile as combined context string for AI prompts
function getMemoryContext(workspaceId) {
  try {
    const memories = db.prepare(`
      SELECT memory_type, key, value FROM ai_memories
      WHERE workspace_id = ? ORDER BY confidence DESC LIMIT 30
    `).all(workspaceId);
    const profile = db.prepare(`SELECT * FROM workspace_ai_profile WHERE workspace_id = ?`).get(workspaceId);
    const memText = memories.length
      ? '\nBusiness Knowledge:\n' + memories.map(m => `- ${m.key}: ${m.value}`).join('\n')
      : '';
    const profText = profile ? aiEngine.formatProfileContext(profile) : '';
    return memText + profText;
  } catch { return ''; }
}

// ── MEMORY ROUTES ──────────────────────────────────────────

// GET /api/memories — list all memories for workspace
app.get('/api/memories', auth, (req, res) => {
  try {
    const memories = db.prepare(`
      SELECT * FROM ai_memories WHERE workspace_id = ?
      ORDER BY memory_type, key ASC
    `).all(req.workspaceId);
    res.json({ memories });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/memories — manually add a memory
app.post('/api/memories', auth, (req, res) => {
  try {
    const { memory_type, key, value, confidence } = req.body;
    if (!key || !value) return res.status(400).json({ error: 'key and value required' });
    const id = generateId();
    db.prepare(`
      INSERT INTO ai_memories (id, workspace_id, memory_type, key, value, confidence, source)
      VALUES (?, ?, ?, ?, ?, ?, 'manual')
    `).run(id, req.workspaceId, memory_type || 'other', key, value, confidence || 90);
    res.status(201).json(db.prepare('SELECT * FROM ai_memories WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/memories/:id — update a memory
app.put('/api/memories/:id', auth, (req, res) => {
  try {
    const { memory_type, key, value, confidence } = req.body;
    db.prepare(`
      UPDATE ai_memories SET memory_type=?, key=?, value=?, confidence=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND workspace_id=?
    `).run(memory_type, key, value, confidence, req.params.id, req.workspaceId);
    res.json(db.prepare('SELECT * FROM ai_memories WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/memories/:id
app.delete('/api/memories/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM ai_memories WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── KNOWLEDGE DOCUMENT ROUTES ──────────────────────────────

// GET /api/knowledge — list all documents
app.get('/api/knowledge', auth, (req, res) => {
  try {
    const docs = db.prepare(`
      SELECT * FROM knowledge_documents WHERE workspace_id = ? ORDER BY uploaded_at DESC
    `).all(req.workspaceId);
    res.json({ documents: docs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/knowledge/upload — upload & process document
app.post('/api/knowledge/upload', auth, knowledgeUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const docId = generateId();
    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;

    // Save document record immediately
    db.prepare(`
      INSERT INTO knowledge_documents (id, workspace_id, document_name, file_path, file_type, processed)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(docId, req.workspaceId, fileName, filePath, mimeType);

    res.status(201).json({
      document: db.prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(docId),
      message: 'File uploaded, processing in background...'
    });

    // Process in background — don't block response
    setImmediate(async () => {
      try {
        const text = await extractTextFromFile(filePath, mimeType, fileName);
        const memories = await extractMemoriesFromText(text, req.workspaceId);

        // Save memories — skipping any that already exist (item 24 dedup)
        const insertMemory = db.prepare(`
          INSERT OR REPLACE INTO ai_memories (id, workspace_id, memory_type, key, value, confidence, source, document_id)
          VALUES (?, ?, ?, ?, ?, ?, 'document', ?)
        `);
        const insertAll = db.transaction((mems) => {
          let n = 0;
          mems.forEach(m => {
            if (m.key && m.value && !memoryIsDuplicate(req.workspaceId, m.value)) {
              insertMemory.run(generateId(), req.workspaceId, m.memory_type || 'other', m.key, m.value, m.confidence || 80, docId);
              n++;
            }
          });
          return n;
        });
        const inserted = insertAll(memories);

        // Save extracted text + the count of genuinely new memories
        db.prepare(`
          UPDATE knowledge_documents SET extracted_text=?, memory_count=?, processed=1 WHERE id=?
        `).run(text.substring(0, 10000), inserted, docId);

        console.log(`✅ Knowledge doc processed: ${fileName} → ${memories.length} memories extracted`);
      } catch (e) {
        console.error('Knowledge processing error:', e.message);
        db.prepare('UPDATE knowledge_documents SET processed = 2 WHERE id = ?').run(docId);
      }
    });

  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  WEBSITE CRAWLER — knowledge base learns from a whole site
// ════════════════════════════════════════════════════════════

const CRAWL_MAX_PAGES = 40;       // hard cap on pages per crawl
const CRAWL_MAX_DEPTH = 3;        // link-follow depth from the root
const CRAWL_FETCH_TIMEOUT = 12000;

// Normalize user input into a URL object (adds https:// if missing).
function _normalizeCrawlUrl(input) {
  let u = String(input || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const parsed = new URL(u);
    return /^https?:$/.test(parsed.protocol) ? parsed : null;
  } catch { return null; }
}

// Strip HTML down to readable text.
function _htmlToText(html) {
  let t = html || '';
  t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ')
       .replace(/<style[\s\S]*?<\/style>/gi, ' ')
       .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
       .replace(/<!--[\s\S]*?-->/g, ' ')
       .replace(/<head[\s\S]*?<\/head>/gi, ' ');
  t = t.replace(/<\/(p|div|li|h[1-6]|tr|section|article)\s*>/gi, '\n')
       .replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#0?39;/gi, "'")
       .replace(/&#x27;/gi, "'").replace(/&rsquo;|&lsquo;/gi, "'").replace(/&[a-z]+;/gi, ' ');
  return t.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

// Find same-domain, page-like links in an HTML document.
function _extractCrawlLinks(html, pageUrl, rootHost) {
  const links = new Set();
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = (m[1] || '').trim();
    if (!href || /^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    let abs;
    try { abs = new URL(href, pageUrl); } catch { continue; }
    if (!/^https?:$/.test(abs.protocol)) continue;
    if (abs.hostname.replace(/^www\./, '') !== rootHost) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|rar|mp4|mp3|avi|mov|css|js|ico|woff2?|ttf|xml)(\?|$)/i.test(abs.pathname)) continue;
    abs.hash = '';
    links.add(abs.toString());
  }
  return [...links];
}

// Fetch a single page; returns HTML string or null.
async function _fetchCrawlPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CRAWL_FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WappFlowBot/1.0)' },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('html')) return null;
    return await res.text();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// BFS-crawl a site and extract memories from each page.
async function crawlWebsiteForMemories(startUrl, workspaceId, docId) {
  const root = _normalizeCrawlUrl(startUrl);
  const rootHost = root.hostname.replace(/^www\./, '');
  const queue = [{ url: root.toString(), depth: 0 }];
  const visited = new Set();
  const seenKeys = new Set();
  const memories = [];
  let pagesProcessed = 0;

  const canon = (u) => u.replace(/#.*$/, '').replace(/\/+$/, '');

  while (queue.length && pagesProcessed < CRAWL_MAX_PAGES) {
    const { url, depth } = queue.shift();
    if (visited.has(canon(url))) continue;
    visited.add(canon(url));

    const html = await _fetchCrawlPage(url);
    if (!html) continue;
    pagesProcessed++;

    if (depth < CRAWL_MAX_DEPTH) {
      for (const link of _extractCrawlLinks(html, url, rootHost)) {
        if (!visited.has(canon(link))) queue.push({ url: link, depth: depth + 1 });
      }
    }

    const text = _htmlToText(html);
    if (text.length < 120) continue;

    let pageMems = [];
    try { pageMems = await extractMemoriesFromText(text, workspaceId); }
    catch (e) { console.log('⚠️ Crawl page extract failed:', e.message); }

    for (const mem of (pageMems || [])) {
      if (!mem || !mem.key || !mem.value) continue;
      const k = String(mem.key).toLowerCase().trim();
      if (seenKeys.has(k)) continue;          // dedupe across the whole crawl
      seenKeys.add(k);
      memories.push(mem);
    }

    try { db.prepare('UPDATE knowledge_documents SET memory_count = ? WHERE id = ?').run(memories.length, docId); } catch {}
    await new Promise(r => setTimeout(r, 200)); // gentle pacing
  }

  return { pagesProcessed, memories };
}

// POST /api/knowledge/crawl — crawl a website + its sub-pages for memories
app.post('/api/knowledge/crawl', auth, (req, res) => {
  try {
    const root = _normalizeCrawlUrl(req.body && req.body.url);
    if (!root) return res.status(400).json({ error: 'Enter a valid website URL (e.g. www.example.com)' });

    const docId = generateId();
    const domain = root.hostname.replace(/^www\./, '');
    db.prepare(`
      INSERT INTO knowledge_documents (id, workspace_id, document_name, file_path, file_type, processed)
      VALUES (?, ?, ?, ?, 'website', 0)
    `).run(docId, req.workspaceId, domain, root.toString());

    res.status(201).json({
      document: db.prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(docId),
      message: 'Crawl started — extracting knowledge in the background...'
    });

    // Crawl in the background — don't block the response.
    const workspaceId = req.workspaceId;
    setImmediate(async () => {
      try {
        const { pagesProcessed, memories } = await crawlWebsiteForMemories(root.toString(), workspaceId, docId);

        const insertMemory = db.prepare(`
          INSERT OR REPLACE INTO ai_memories (id, workspace_id, memory_type, key, value, confidence, source, document_id)
          VALUES (?, ?, ?, ?, ?, ?, 'website', ?)
        `);
        const insertAll = db.transaction((mems) => {
          let n = 0;
          mems.forEach(m => {
            if (m.key && m.value && !memoryIsDuplicate(workspaceId, m.value)) {
              insertMemory.run(generateId(), workspaceId, m.memory_type || 'other',
                String(m.key).slice(0, 200), String(m.value).slice(0, 2000), m.confidence || 75, docId);
              n++;
            }
          });
          return n;
        });
        const inserted = insertAll(memories);

        db.prepare('UPDATE knowledge_documents SET memory_count = ?, extracted_text = ?, processed = ? WHERE id = ?')
          .run(inserted, `Crawled ${pagesProcessed} page(s) from ${domain}`, pagesProcessed > 0 ? 1 : 2, docId);
        console.log(`✅ Website crawl done: ${domain} → ${pagesProcessed} pages, ${memories.length} memories`);
      } catch (e) {
        console.error('Website crawl error:', e.message);
        db.prepare('UPDATE knowledge_documents SET processed = 2 WHERE id = ?').run(docId);
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/knowledge/:id — delete document + its memories
app.delete('/api/knowledge/:id', auth, (req, res) => {
  try {
    const doc = db.prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    // Delete file safely
    try { if (doc.file_path && fs.existsSync(doc.file_path)) fs.unlinkSync(doc.file_path); } catch {}
    // Delete memories from this doc
    try { db.prepare('DELETE FROM ai_memories WHERE document_id = ?').run(req.params.id); } catch {}
    // Delete document record
    db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/knowledge/:id/memories — get memories from a specific document
app.get('/api/knowledge/:id/memories', auth, (req, res) => {
  try {
    const memories = db.prepare('SELECT * FROM ai_memories WHERE document_id = ? AND workspace_id = ?').all(req.params.id, req.workspaceId);
    res.json({ memories });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/knowledge/learn-from-messages — manually trigger learning from staff replies
app.post('/api/knowledge/learn-from-messages', auth, async (req, res) => {
  try {
    // Get last 100 outgoing staff messages for this workspace
    const messages = db.prepare(`
      SELECT m.body FROM messages m
      JOIN leads l ON l.id = m.lead_id
      WHERE l.workspace_id = ? AND m.from_me = 1 AND m.body IS NOT NULL AND length(m.body) > 20
      ORDER BY m.timestamp DESC LIMIT 100
    `).all(req.workspaceId);

    console.log(`💬 learn-from-messages: found ${messages.length} staff messages for workspace ${req.workspaceId}`);

    // Filter out media placeholders ([...]) and bare URLs — they contain no learnable knowledge
    const textMessages = messages.filter(m => {
      const b = (m.body || '').trim();
      if (/^\[.+\]$/.test(b)) return false;           // [filename.pdf], [image.png], etc.
      if (/^https?:\/\/\S+$/.test(b)) return false;   // bare URL with no surrounding text
      return true;
    });
    console.log(`💬 learn-from-messages: ${textMessages.length} usable text messages after filtering`);

    if (textMessages.length < 5) return res.json({
      learned: 0,
      message: textMessages.length === 0
        ? 'No text staff replies found yet — memories are learned from typed replies, not files or links'
        : `Only ${textMessages.length} text replies found — need at least 5 to learn from`
    });

    const memories = await extractMemoriesFromChats(textMessages);
    console.log(`💬 learn-from-messages: extractMemoriesFromChats returned`, memories);

    let learned = 0;
    const insertMemory = db.prepare(`
      INSERT OR IGNORE INTO ai_memories (id, workspace_id, memory_type, key, value, confidence, source)
      VALUES (?, ?, ?, ?, ?, ?, 'staff_replies')
    `);
    const insertAll = db.transaction((mems) => {
      mems.forEach(m => {
        if (m.key && m.value && !memoryIsDuplicate(req.workspaceId, m.value)) {
          insertMemory.run(generateId(), req.workspaceId, m.memory_type || 'other', m.key, m.value, m.confidence || 70);
          learned++;
        }
      });
    });
    insertAll(memories);
    console.log(`💬 learn-from-messages: inserted ${learned} memories`);

    res.json({ learned, message: `Extracted ${learned} memories from staff replies` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  AI COMMAND CENTER
// ════════════════════════════════════════════════════════════

app.post('/api/ai/command', auth, async (req, res) => {
  try {
    const { command } = req.body;
    if (!command?.trim()) return res.status(400).json({ error: 'Command required' });

    const wid = req.workspaceId;
    const memoryContext = getMemoryContext(wid);

    // Get workspace stats for context
    const stats = {
      total: db.prepare(`SELECT COUNT(*) as c FROM leads WHERE workspace_id=? AND (is_deleted=0 OR is_deleted IS NULL)`).get(wid).c,
      new: db.prepare(`SELECT COUNT(*) as c FROM leads WHERE workspace_id=? AND status='New' AND (is_deleted=0 OR is_deleted IS NULL)`).get(wid).c,
      hot: db.prepare(`SELECT COUNT(*) as c FROM leads WHERE workspace_id=? AND lead_score>=7 AND (is_deleted=0 OR is_deleted IS NULL)`).get(wid).c,
      won: db.prepare(`SELECT COUNT(*) as c FROM leads WHERE workspace_id=? AND status='Closed - Won' AND (is_deleted=0 OR is_deleted IS NULL)`).get(wid).c,
    };

    // Step 1: Classify intent
    const classifyPrompt = `
You are an AI command interpreter for a WhatsApp CRM system.
The user typed a natural language command. Classify it and extract parameters.

Available command types:
- show_leads: Show/filter/find leads (params: status, min_score, search_name, search_phone, limit)
- show_stats: Show dashboard statistics
- show_reminders: Show upcoming reminders
- summarize_today: Summarize today's activity
- find_lead: Find a specific lead by name or phone
- show_hot_leads: Show leads with high score or urgent temperature
- show_won_leads: Show closed/won leads
- show_lost_leads: Show closed/lost leads
- show_recent: Show most recently added leads
- unknown: Cannot understand the command

Return JSON only:
{
  "type": "command_type",
  "params": {},
  "friendly_description": "what you understood in plain English"
}

User command: "${command}"
    `.trim();

    const classifyRaw = await callGemini(classifyPrompt);
    let intent = {};
    try {
      const match = classifyRaw.match(/\{[\s\S]*\}/);
      intent = JSON.parse(match ? match[0] : classifyRaw);
    } catch {
      intent = { type: 'unknown', params: {}, friendly_description: command };
    }

    // Step 2: Execute based on intent
    let result = { type: intent.type, description: intent.friendly_description, data: null, message: '' };

    if (intent.type === 'show_leads' || intent.type === 'show_recent') {
      const limit = intent.params?.limit || 10;
      let query = `SELECT * FROM leads WHERE workspace_id=? AND (is_deleted=0 OR is_deleted IS NULL)`;
      const params = [wid];
      if (intent.params?.status) { query += ` AND status=?`; params.push(intent.params.status); }
      if (intent.params?.min_score) { query += ` AND lead_score>=?`; params.push(intent.params.min_score); }
      if (intent.params?.search_name) { query += ` AND customer_name LIKE ?`; params.push(`%${intent.params.search_name}%`); }
      query += ` ORDER BY last_message_at DESC LIMIT ?`;
      params.push(limit);
      const leads = db.prepare(query).all(...params);
      result.data = { leads };
      result.message = `Found ${leads.length} lead${leads.length !== 1 ? 's' : ''}`;
    }

    else if (intent.type === 'show_hot_leads') {
      const leads = db.prepare(`
        SELECT * FROM leads WHERE workspace_id=? AND (is_deleted=0 OR is_deleted IS NULL)
        AND (lead_score>=7 OR status='Negotiating' OR status='Interested')
        ORDER BY lead_score DESC, last_message_at DESC LIMIT 10
      `).all(wid);
      result.data = { leads };
      result.message = `Found ${leads.length} hot lead${leads.length !== 1 ? 's' : ''}`;
    }

    else if (intent.type === 'show_won_leads') {
      const leads = db.prepare(`SELECT * FROM leads WHERE workspace_id=? AND status='Closed - Won' ORDER BY closed_at DESC LIMIT 10`).all(wid);
      result.data = { leads };
      result.message = `Found ${leads.length} won deal${leads.length !== 1 ? 's' : ''}`;
    }

    else if (intent.type === 'show_lost_leads') {
      const leads = db.prepare(`SELECT * FROM leads WHERE workspace_id=? AND status='Closed - Lost' ORDER BY closed_at DESC LIMIT 10`).all(wid);
      result.data = { leads };
      result.message = `Found ${leads.length} lost deal${leads.length !== 1 ? 's' : ''}`;
    }

    else if (intent.type === 'find_lead') {
      const search = intent.params?.search_name || intent.params?.search_phone || '';
      const leads = db.prepare(`
        SELECT * FROM leads WHERE workspace_id=? AND (is_deleted=0 OR is_deleted IS NULL)
        AND (customer_name LIKE ? OR customer_phone LIKE ?)
        LIMIT 5
      `).all(wid, `%${search}%`, `%${search}%`);
      result.data = { leads };
      result.message = leads.length > 0 ? `Found ${leads.length} match${leads.length !== 1 ? 'es' : ''}` : 'No leads found';
    }

    else if (intent.type === 'show_stats') {
      // Generate AI summary of stats
      const aiSummary = await callGemini(`
        Summarize these CRM stats in 2 sentences, be friendly and insightful:
        Total leads: ${stats.total}, New: ${stats.new}, Hot leads: ${stats.hot}, Won deals: ${stats.won}
        ${memoryContext}
      `);
      result.data = { stats, summary: aiSummary };
      result.message = 'Here are your workspace stats';
    }

    else if (intent.type === 'show_reminders') {
      const reminders = db.prepare(`
        SELECT r.*, l.customer_name FROM reminders r
        LEFT JOIN leads l ON l.id = r.lead_id
        WHERE r.user_id=? AND r.is_completed=0
        ORDER BY COALESCE(r.reminder_date, r.due_date) ASC LIMIT 10
      `).all(req.userId);
      result.data = { reminders };
      result.message = `You have ${reminders.length} upcoming reminder${reminders.length !== 1 ? 's' : ''}`;
    }

    else if (intent.type === 'summarize_today') {
      const todayLeads = db.prepare(`SELECT * FROM leads WHERE workspace_id=? AND DATE(created_at)=DATE('now') AND (is_deleted=0 OR is_deleted IS NULL)`).all(wid);
      const todayMessages = db.prepare(`
        SELECT COUNT(*) as c FROM messages m JOIN leads l ON l.id=m.lead_id
        WHERE l.workspace_id=? AND DATE(m.timestamp)=DATE('now')
      `).get(wid).c;
      const summary = await callGemini(`
        Summarize today's CRM activity in 2-3 sentences:
        New leads today: ${todayLeads.length}
        Messages sent/received today: ${todayMessages}
        Lead names: ${todayLeads.map(l => l.customer_name).join(', ') || 'none'}
        ${memoryContext}
        Be friendly and actionable.
      `);
      result.data = { todayLeads, todayMessages, summary };
      result.message = "Here's your daily summary";
    }

    else {
      // Unknown — try to answer with AI using CRM context
      const aiAnswer = await callGemini(`
        You are an AI assistant for a WhatsApp CRM.
        ${memoryContext}
        CRM Stats: ${JSON.stringify(stats)}
        Answer this question or explain what you can do: "${command}"
        Keep it short and helpful.
      `);
      result.message = aiAnswer;
      result.type = 'ai_answer';
    }

    res.json(result);
  } catch (e) {
    console.error('AI command error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  VERTICAL INTELLIGENCE
// ════════════════════════════════════════════════════════════

const INDUSTRY_WORKFLOWS = {
  training_institute: {
    name: 'Training Institute',
    emoji: '🎓',
    color: '#6366f1',
    keywords: ['course', 'fee', 'admission', 'certificate', 'batch', 'class', 'enroll', 'training', 'diploma'],
    actions: [
      { id: 'send_brochure', label: 'Send Brochure', icon: '📄', message: 'Hi! Please find our course brochure attached. Let me know if you have any questions about our programs.' },
      { id: 'send_fee', label: 'Send Fee Structure', icon: '💰', message: 'Here is our fee structure for your reference. We offer flexible payment plans as well.' },
      { id: 'schedule_counseling', label: 'Schedule Counseling', icon: '📅', message: 'Would you like to schedule a free counseling session? We can discuss which course best suits your goals.' },
      { id: 'mark_enrolled', label: 'Mark as Enrolled', icon: '✅', message: 'Congratulations on your enrollment! Welcome to our institute. We will send you further details shortly.' },
      { id: 'batch_info', label: 'Send Batch Info', icon: '📆', message: 'Our next batch starts soon. Here are the timings and schedule details for your selected course.' },
      { id: 'follow_up', label: 'Follow Up', icon: '🔔', message: 'Hi! Just following up on your inquiry. Have you had a chance to review the information we sent?' },
    ],
    ai_context: 'This is a training institute. Focus on courses, fees, batches, admissions, and certifications.',
    suggested_status_flow: ['New', 'Contacted', 'Interested', 'Negotiating', 'Closed - Won'],
  },
  real_estate: {
    name: 'Real Estate',
    emoji: '🏠',
    color: '#10b981',
    keywords: ['plot', 'apartment', 'house', 'marla', 'kanal', 'possession', 'installment', 'location', 'property', 'bedroom'],
    actions: [
      { id: 'send_property', label: 'Send Property Details', icon: '🏠', message: 'Here are the property details you were interested in. Please let me know if you would like to schedule a visit.' },
      { id: 'ask_budget', label: 'Ask Budget', icon: '💰', message: 'To help you better, could you please share your budget range? This will help us find the perfect property for you.' },
      { id: 'schedule_visit', label: 'Schedule Site Visit', icon: '📅', message: 'Would you like to schedule a site visit? We can arrange a convenient time for you to view the property.' },
      { id: 'send_map', label: 'Send Location', icon: '📍', message: 'Here is the exact location and map of the property. It is situated in a prime area with easy access.' },
      { id: 'payment_plan', label: 'Send Payment Plan', icon: '📋', message: 'Here is our flexible payment plan for this property. We offer easy installment options.' },
      { id: 'follow_up', label: 'Follow Up', icon: '🔔', message: 'Hi! Just checking in to see if you have any questions about the property. We would love to help you find your dream home.' },
    ],
    ai_context: 'This is a real estate business. Focus on properties, budgets, locations, site visits, and payment plans.',
    suggested_status_flow: ['New', 'Contacted', 'Interested', 'Negotiating', 'Closed - Won'],
  },
  clinic: {
    name: 'Clinic / Healthcare',
    emoji: '🏥',
    color: '#ef4444',
    keywords: ['appointment', 'doctor', 'prescription', 'medicine', 'treatment', 'checkup', 'patient', 'clinic', 'hospital'],
    actions: [
      { id: 'book_appointment', label: 'Book Appointment', icon: '📅', message: 'I can help you book an appointment. Please share your preferred date and time, and we will confirm availability.' },
      { id: 'send_reminder', label: 'Send Appointment Reminder', icon: '⏰', message: 'This is a reminder for your upcoming appointment. Please arrive 10 minutes early and bring any previous reports.' },
      { id: 'schedule_followup', label: 'Schedule Follow-up', icon: '🔄', message: 'Your doctor recommends a follow-up visit. Would you like to schedule it at your earliest convenience?' },
      { id: 'send_directions', label: 'Send Clinic Location', icon: '📍', message: 'Here is our clinic address and directions. We are open 6 days a week for your convenience.' },
      { id: 'ask_symptoms', label: 'Ask About Symptoms', icon: '🩺', message: 'Could you please describe your symptoms or the nature of your visit? This will help us prepare for your appointment.' },
      { id: 'follow_up', label: 'Follow Up', icon: '🔔', message: 'Hi! Just following up to check how you are feeling after your last visit. Please do not hesitate to reach out if you need anything.' },
    ],
    ai_context: 'This is a healthcare clinic. Focus on appointments, doctors, treatments, and patient care.',
    suggested_status_flow: ['New', 'Contacted', 'Interested', 'Negotiating', 'Closed - Won'],
  },
  general: {
    name: 'General Business',
    emoji: '💼',
    color: '#6b7280',
    keywords: [],
    actions: [
      { id: 'follow_up', label: 'Follow Up', icon: '🔔', message: 'Hi! Just following up on our previous conversation. Please let me know if you have any questions.' },
      { id: 'send_info', label: 'Send Information', icon: '📄', message: 'Thank you for your interest. Here is the information you requested. Feel free to reach out for any clarifications.' },
      { id: 'schedule_meeting', label: 'Schedule Meeting', icon: '📅', message: 'Would you like to schedule a meeting to discuss your requirements in detail?' },
    ],
    ai_context: 'This is a general business.',
    suggested_status_flow: ['New', 'Contacted', 'Interested', 'Negotiating', 'Closed - Won'],
  },
};

// Detect industry from messages
function detectIndustryFromMessages(messages) {
  if (!messages || messages.length === 0) return { industry: 'general', confidence: 0 };
  const text = messages.map(m => m.body || '').join(' ').toLowerCase();
  let bestMatch = { industry: 'general', confidence: 0 };
  for (const [key, workflow] of Object.entries(INDUSTRY_WORKFLOWS)) {
    if (key === 'general') continue;
    const matches = workflow.keywords.filter(kw => text.includes(kw)).length;
    const confidence = Math.min(Math.round((matches / workflow.keywords.length) * 100), 99);
    if (confidence > bestMatch.confidence) {
      bestMatch = { industry: key, confidence };
    }
  }
  return bestMatch;
}

// GET /api/leads/:id/industry — detect industry for a lead
app.get('/api/leads/:id/industry', auth, async (req, res) => {
  try {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const messages = db.prepare('SELECT body FROM messages WHERE lead_id = ? ORDER BY timestamp ASC').all(req.params.id);

    // First try keyword detection
    const detected = detectIndustryFromMessages(messages);

    // If low confidence, try AI detection
    let industry = detected.industry;
    let confidence = detected.confidence;
    let source = 'keywords';

    if (confidence < 30 && messages.length > 2) {
      try {
        const msgSample = messages.slice(0, 20).map(m => m.body).join('\n');
        const prompt = `
Analyze these WhatsApp messages and detect the business industry.
Return JSON only:
{
  "industry": "one of: training_institute, real_estate, clinic, general",
  "confidence": <number 0-100>,
  "reason": "one sentence"
}
Messages:
${msgSample}
        `.trim();
        const raw = await callGemini(prompt);
        const match = raw.match(/\{[\s\S]*\}/);
        const aiResult = JSON.parse(match ? match[0] : raw);
        if (aiResult.confidence > confidence) {
          industry = aiResult.industry;
          confidence = aiResult.confidence;
          source = 'ai';
        }
      } catch {}
    }

    const workflow = INDUSTRY_WORKFLOWS[industry] || INDUSTRY_WORKFLOWS.general;
    res.json({ industry, confidence, source, workflow });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/workspace/industry — detect industry for entire workspace
app.get('/api/workspace/industry', auth, async (req, res) => {
  try {
    const messages = db.prepare(`
      SELECT m.body FROM messages m
      JOIN leads l ON l.id = m.lead_id
      WHERE l.workspace_id = ? AND m.body IS NOT NULL
      ORDER BY m.timestamp DESC LIMIT 100
    `).all(req.workspaceId);

    const detected = detectIndustryFromMessages(messages);
    const workflow = INDUSTRY_WORKFLOWS[detected.industry] || INDUSTRY_WORKFLOWS.general;
    res.json({ ...detected, workflow });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leads/:id/vertical-action — send a vertical action message
app.post('/api/leads/:id/vertical-action', auth, async (req, res) => {
  try {
    const { action_id, industry, custom_message } = req.body;
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const workflow = INDUSTRY_WORKFLOWS[industry] || INDUSTRY_WORKFLOWS.general;
    const action = workflow.actions.find(a => a.id === action_id);
    if (!action) return res.status(404).json({ error: 'Action not found' });

    const message = custom_message || action.message;

    // Send via WhatsApp
    await whatsappService.sendMessage(lead.customer_phone, message);
    whatsappService.saveOutgoingMessage(lead.id, req.userId, message);
    db.prepare('UPDATE leads SET total_messages = total_messages + 1, last_message_at = CURRENT_TIMESTAMP WHERE id = ?').run(lead.id);
    addContactHistory(lead.id, req.userId, 'message', `Vertical action: ${action.label}`);

    res.json({ message: 'Sent', action: action.label });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leads/:id/vertical-suggest — AI suggestions based on industry
app.post('/api/leads/:id/vertical-suggest', auth, async (req, res) => {
  try {
    const { industry } = req.body;
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const messages = db.prepare('SELECT * FROM messages WHERE lead_id = ? ORDER BY timestamp ASC LIMIT 20').all(req.params.id);
    const workflow = INDUSTRY_WORKFLOWS[industry] || INDUSTRY_WORKFLOWS.general;
    const memoryContext = getMemoryContext(req.workspaceId);

    const context = messages.map(m => `${m.from_me ? 'Staff' : 'Customer'}: ${m.body || '[media]'}`).join('\n');

    const prompt = `
You are an AI assistant for a ${workflow.name}.
${workflow.ai_context}
${memoryContext}

Based on this conversation, provide:
1. The single most important next action to take
2. A personalized message suggestion (ready to send)
3. The lead's likely buying stage

Return JSON only:
{
  "next_action": "specific action to take",
  "suggested_message": "ready to send WhatsApp message",
  "buying_stage": "one of: just_browsing, considering, ready_to_buy, urgent",
  "buying_stage_reason": "one sentence"
}

Conversation:
${context || 'No messages yet'}
Lead status: ${lead.status}
    `.trim();

    const raw = await callGemini(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    const suggestion = JSON.parse(match ? match[0] : raw);
    res.json({ suggestion, industry, workflow: { name: workflow.name, emoji: workflow.emoji, color: workflow.color } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  PLATFORM ACCOUNTS — CRUD
// ════════════════════════════════════════════════════════════

app.get('/api/platform-accounts', auth, (req, res) => {
  try {
    const { platform } = req.query;
    let query = 'SELECT * FROM platform_accounts WHERE workspace_id = ?';
    const params = [req.workspaceId];
    if (platform) { query += ' AND platform = ?'; params.push(platform); }
    query += ' ORDER BY platform, slot_index ASC';
    const accounts = db.prepare(query).all(...params).map(a => ({
      ...a,
      credentials: (() => { try { return JSON.parse(a.credentials || '{}'); } catch { return {}; } })()
    }));
    res.json({ accounts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/platform-accounts', auth, (req, res) => {
  try {
    const { platform, account_name } = req.body;
    if (!platform) return res.status(400).json({ error: 'platform required' });

    // Plan enforcement — check feature + per-channel limit
    const limitKey = `${platform}_accounts`;
    const limitCheck = checkLimit(req.workspaceId, limitKey);
    if (!limitCheck.ok) return res.status(403).json({ error: limitCheck.message, code: 'plan_limit', ...limitCheck });

    // Server-authoritatively assign the slot index — NEVER trust a client-supplied
    // value. A duplicate slot makes two WhatsApp accounts collide on the same
    // Chromium session dir ("browser is already running for session-wf-N").
    // Pick the lowest free slot 0..4 for this workspace+platform.
    const usedSlots = db.prepare('SELECT slot_index FROM platform_accounts WHERE workspace_id = ? AND platform = ?')
      .all(req.workspaceId, platform).map(r => r.slot_index);
    if (usedSlots.length >= 5) return res.status(400).json({ error: 'Maximum 5 accounts per platform' });
    let assignedSlot = 0;
    while (usedSlots.includes(assignedSlot)) assignedSlot++;

    const id = generateId();
    const verifyToken = generateId().replace(/-/g, '').slice(0, 24);
    db.prepare(`
      INSERT INTO platform_accounts (id, workspace_id, platform, account_name, webhook_verify_token, slot_index)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.workspaceId, platform, account_name || `Account ${assignedSlot + 1}`, verifyToken, assignedSlot);

    const account = db.prepare('SELECT * FROM platform_accounts WHERE id = ?').get(id);
    // Auto-start WhatsApp session when a whatsapp account slot is created
    if (platform === 'whatsapp') {
      whatsappService.addAccount(id, assignedSlot);
    }
    res.json({ account: { ...account, credentials: {} } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/platform-accounts/:id', auth, (req, res) => {
  try {
    const { account_name, account_handle, credentials, status } = req.body;
    const account = db.prepare('SELECT * FROM platform_accounts WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    db.prepare(`
      UPDATE platform_accounts SET
        account_name = COALESCE(?, account_name),
        account_handle = COALESCE(?, account_handle),
        credentials = COALESCE(?, credentials),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(
      account_name || null,
      account_handle || null,
      credentials ? JSON.stringify(credentials) : null,
      status || null,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM platform_accounts WHERE id = ?').get(req.params.id);
    res.json({ account: { ...updated, credentials: (() => { try { return JSON.parse(updated.credentials || '{}'); } catch { return {}; } })() } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/platform-accounts/:id', auth, (req, res) => {
  try {
    const account = db.prepare('SELECT * FROM platform_accounts WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    db.prepare('DELETE FROM platform_accounts WHERE id = ?').run(req.params.id);
    // Stop WhatsApp session if removing a whatsapp account
    if (account.platform === 'whatsapp') {
      whatsappService.removeAccount(req.params.id).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  INSTAGRAM WEBHOOK
// ════════════════════════════════════════════════════════════

app.get('/api/webhooks/instagram', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe') {
    const account = db.prepare("SELECT * FROM platform_accounts WHERE platform = 'instagram' AND webhook_verify_token = ?").get(token);
    if (account) return res.send(challenge);
  }
  res.sendStatus(403);
});

app.post('/api/webhooks/instagram', (req, res) => {
  try {
    const body = req.body;
    if (body.object !== 'instagram') return res.sendStatus(404);

    (body.entry || []).forEach(entry => {
      const pageId = entry.id;
      const account = db.prepare("SELECT * FROM platform_accounts WHERE platform = 'instagram' AND account_handle = ?").get(pageId)
        || db.prepare("SELECT * FROM platform_accounts WHERE platform = 'instagram' ORDER BY created_at ASC LIMIT 1").get();
      if (!account) return;

      (entry.messaging || []).forEach(event => {
        if (!event.message || event.message.is_echo) return;
        const senderId = event.sender.id;
        const text = event.message.text || '';
        const ts = event.timestamp ? new Date(event.timestamp) : new Date();

        let lead = db.prepare("SELECT * FROM leads WHERE workspace_id = ? AND customer_phone = ? AND (is_deleted = 0 OR is_deleted IS NULL)").get(account.workspace_id, senderId);
        if (!lead) {
          const leadId = generateId();
          db.prepare(`
            INSERT INTO leads (id, user_id, workspace_id, customer_name, customer_phone, status, first_message, total_messages, platform_source, platform_account_id, created_at, last_message_at)
            VALUES (?, ?, ?, ?, ?, 'New', ?, 1, 'instagram', ?, ?, ?)
          `).run(leadId, account.workspace_id, account.workspace_id, `Instagram User`, senderId, text.slice(0, 200), account.id, ts.toISOString(), ts.toISOString());
          lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);

          const wsClients = sseClients.get(account.workspace_id) || [];
          wsClients.forEach(c => { try { c.write(`data: ${JSON.stringify({ type: 'new_lead', lead })}\n\n`); } catch {} });
        }

        if (text) {
          db.prepare(`
            INSERT OR IGNORE INTO messages (id, lead_id, user_id, body, from_me, timestamp)
            VALUES (?, ?, ?, ?, 0, ?)
          `).run(generateId(), lead.id, account.workspace_id, text, ts.toISOString());
          db.prepare('UPDATE leads SET total_messages = total_messages + 1, last_message_at = ? WHERE id = ?').run(ts.toISOString(), lead.id);
        }
      });
    });

    res.json({ status: 'ok' });
  } catch (e) { console.error('Instagram webhook error:', e.message); res.sendStatus(500); }
});

// ════════════════════════════════════════════════════════════
//  FACEBOOK MESSENGER WEBHOOK
// ════════════════════════════════════════════════════════════

app.get('/api/webhooks/facebook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe') {
    const account = db.prepare("SELECT * FROM platform_accounts WHERE platform = 'facebook' AND webhook_verify_token = ?").get(token);
    if (account) return res.send(challenge);
  }
  res.sendStatus(403);
});

app.post('/api/webhooks/facebook', (req, res) => {
  try {
    const body = req.body;
    if (body.object !== 'page') return res.sendStatus(404);

    (body.entry || []).forEach(entry => {
      const pageId = entry.id;
      const account = db.prepare("SELECT * FROM platform_accounts WHERE platform = 'facebook' AND account_handle = ?").get(pageId)
        || db.prepare("SELECT * FROM platform_accounts WHERE platform = 'facebook' ORDER BY created_at ASC LIMIT 1").get();
      if (!account) return;

      (entry.messaging || []).forEach(event => {
        if (!event.message || event.message.is_echo) return;
        const senderId = event.sender.id;
        const text = event.message.text || '';
        const ts = event.timestamp ? new Date(event.timestamp) : new Date();

        let lead = db.prepare("SELECT * FROM leads WHERE workspace_id = ? AND customer_phone = ? AND (is_deleted = 0 OR is_deleted IS NULL)").get(account.workspace_id, senderId);
        if (!lead) {
          const leadId = generateId();
          db.prepare(`
            INSERT INTO leads (id, user_id, workspace_id, customer_name, customer_phone, status, first_message, total_messages, platform_source, platform_account_id, created_at, last_message_at)
            VALUES (?, ?, ?, ?, ?, 'New', ?, 1, 'facebook', ?, ?, ?)
          `).run(leadId, account.workspace_id, account.workspace_id, `Facebook User`, senderId, text.slice(0, 200), account.id, ts.toISOString(), ts.toISOString());
          lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);

          const wsClients = sseClients.get(account.workspace_id) || [];
          wsClients.forEach(c => { try { c.write(`data: ${JSON.stringify({ type: 'new_lead', lead })}\n\n`); } catch {} });
        }

        if (text) {
          db.prepare(`
            INSERT OR IGNORE INTO messages (id, lead_id, user_id, body, from_me, timestamp)
            VALUES (?, ?, ?, ?, 0, ?)
          `).run(generateId(), lead.id, account.workspace_id, text, ts.toISOString());
          db.prepare('UPDATE leads SET total_messages = total_messages + 1, last_message_at = ? WHERE id = ?').run(ts.toISOString(), lead.id);
        }
      });
    });

    res.json({ status: 'ok' });
  } catch (e) { console.error('Facebook webhook error:', e.message); res.sendStatus(500); }
});

// ════════════════════════════════════════════════════════════
//  WEBSITE FORM — PUBLIC SUBMISSION ENDPOINT
// ════════════════════════════════════════════════════════════

app.post('/api/website-form/:formToken/submit', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  try {
    const account = db.prepare("SELECT * FROM platform_accounts WHERE platform = 'website' AND webhook_verify_token = ?").get(req.params.formToken);
    if (!account) return res.status(404).json({ error: 'Form not found' });

    // Normalize field names — support both WappFlow widget format and Formspree format
    const body = req.body || {};
    const name = body.name || body.full_name || body._name || body.your_name || 'Website Visitor';
    const phone = body.phone || body.telephone || body.mobile || body.phone_number || null;
    const email = body.email || body._replyto || body.your_email || null;
    const message = body.message || body.comments || body.comment || body.msg || null;
    if (!name && !phone && !email) return res.status(400).json({ error: 'At least one contact field required' });

    const leadId = generateId();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO leads (id, user_id, workspace_id, customer_name, customer_phone, email, status, first_message, platform_source, platform_account_id, created_at, last_message_at)
      VALUES (?, ?, ?, ?, ?, ?, 'New', ?, 'website', ?, ?, ?)
    `).run(leadId, account.workspace_id, account.workspace_id, name, phone, email, message, account.id, now, now);

    if (message) {
      db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, from_me, timestamp) VALUES (?, ?, ?, ?, 0, ?)`).run(generateId(), leadId, account.workspace_id, message, now);
    }

    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
    const wsClients = sseClients.get(account.workspace_id) || [];
    wsClients.forEach(c => { try { c.write(`data: ${JSON.stringify({ type: 'new_lead', lead })}\n\n`); } catch {} });

    res.json({ ok: true, lead_id: leadId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.options('/api/website-form/:formToken/submit', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

// ════════════════════════════════════════════════════════════
//  CONNECTED CHANNELS / RELATIONS / TIMELINE
// ════════════════════════════════════════════════════════════

// GET /api/leads/:leadId/channels — list extra communication channels linked to a lead
app.get('/api/leads/:leadId/channels', auth, (req, res) => {
  try {
    const channels = db.prepare(`
      SELECT lc.*, pa.nickname AS account_nickname, pa.account_name
      FROM lead_channels lc
      LEFT JOIN platform_accounts pa ON pa.id = lc.platform_account_id
      WHERE lc.lead_id = ? ORDER BY lc.created_at ASC
    `).all(req.params.leadId);
    res.json({ channels });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads/:leadId/channels', auth, (req, res) => {
  try {
    const { platform, identifier, platform_account_id, display_name } = req.body || {};
    if (!platform || !identifier) return res.status(400).json({ error: 'platform and identifier required' });
    const id = generateId();
    db.prepare(`INSERT INTO lead_channels (id, lead_id, workspace_id, platform, identifier, platform_account_id, display_name) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, req.params.leadId, req.workspaceId, platform.toLowerCase(), identifier, platform_account_id || null, display_name || null);
    res.json({ channel: db.prepare('SELECT * FROM lead_channels WHERE id = ?').get(id) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'This channel is already linked to the lead' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/leads/:leadId/channels/:channelId', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM lead_channels WHERE id = ? AND lead_id = ?').run(req.params.channelId, req.params.leadId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leads/:leadId/related — heuristic suggestions + already-linked relations
app.get('/api/leads/:leadId/related', auth, (req, res) => {
  try {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(req.params.leadId, req.workspaceId);
    if (!lead) return res.json({ suggestions: [], linked: [] });

    // Linked = lead_relations rows where this lead is on either side
    const linked = db.prepare(`
      SELECT lr.id, lr.relation_type,
             CASE WHEN lr.lead_id_a = ? THEN lr.lead_id_b ELSE lr.lead_id_a END AS other_lead_id,
             l.customer_name, l.customer_phone, l.email, l.status, l.platform_source
      FROM lead_relations lr
      JOIN leads l ON l.id = CASE WHEN lr.lead_id_a = ? THEN lr.lead_id_b ELSE lr.lead_id_a END
      WHERE (lr.lead_id_a = ? OR lr.lead_id_b = ?)
        AND l.workspace_id = ?
    `).all(req.params.leadId, req.params.leadId, req.params.leadId, req.params.leadId, req.workspaceId);

    // Suggest matches by phone last-10-digits, email, or exact name (excluding self + already linked)
    const linkedIds = new Set(linked.map(r => r.other_lead_id));
    linkedIds.add(req.params.leadId);
    const stripSQL = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone,' ',''),'+',''),'-',''),'(',''),')',''),'.','')`;
    const phoneTail = (lead.customer_phone || '').replace(/\D/g, '').slice(-10);
    const suggestions = [];
    if (phoneTail.length >= 7) {
      const rows = db.prepare(`SELECT id, customer_name, customer_phone, email, status, platform_source FROM leads WHERE workspace_id = ? AND id != ? AND (is_deleted = 0 OR is_deleted IS NULL) AND ${stripSQL} LIKE ?`)
        .all(req.workspaceId, req.params.leadId, `%${phoneTail}`);
      for (const r of rows) if (!linkedIds.has(r.id)) suggestions.push({ ...r, match_reason: 'phone match' });
    }
    if (lead.email) {
      const rows = db.prepare(`SELECT id, customer_name, customer_phone, email, status, platform_source FROM leads WHERE workspace_id = ? AND id != ? AND email = ? AND (is_deleted = 0 OR is_deleted IS NULL)`)
        .all(req.workspaceId, req.params.leadId, lead.email);
      for (const r of rows) if (!linkedIds.has(r.id) && !suggestions.find(s => s.id === r.id)) suggestions.push({ ...r, match_reason: 'email match' });
    }
    if (lead.customer_name) {
      const rows = db.prepare(`SELECT id, customer_name, customer_phone, email, status, platform_source FROM leads WHERE workspace_id = ? AND id != ? AND LOWER(customer_name) = LOWER(?) AND (is_deleted = 0 OR is_deleted IS NULL)`)
        .all(req.workspaceId, req.params.leadId, lead.customer_name);
      for (const r of rows) if (!linkedIds.has(r.id) && !suggestions.find(s => s.id === r.id)) suggestions.push({ ...r, match_reason: 'name match' });
    }
    res.json({ suggestions: suggestions.slice(0, 10), linked });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/lead-relations', auth, (req, res) => {
  try {
    const { lead_id_a, lead_id_b, relation_type } = req.body || {};
    if (!lead_id_a || !lead_id_b || lead_id_a === lead_id_b) return res.status(400).json({ error: 'two different leads required' });
    // Canonical ordering so UNIQUE works regardless of which side initiated
    const [a, b] = [lead_id_a, lead_id_b].sort();
    const id = generateId();
    db.prepare(`INSERT INTO lead_relations (id, lead_id_a, lead_id_b, relation_type, created_by) VALUES (?, ?, ?, ?, ?)`)
      .run(id, a, b, relation_type || 'linked', req.userId);
    res.json({ relation: db.prepare('SELECT * FROM lead_relations WHERE id = ?').get(id) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'These leads are already linked' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/lead-relations/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM lead_relations WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leads/:leadId/timeline — unified activity feed
app.get('/api/leads/:leadId/timeline', auth, (req, res) => {
  try {
    const items = [];
    // 1) Native activity rows
    const acts = db.prepare(`SELECT * FROM activity_timeline WHERE lead_id = ? ORDER BY created_at ASC`).all(req.params.leadId);
    for (const a of acts) items.push({ ...a, source: 'activity' });
    // 2) Messages — fold in last 50
    const msgs = db.prepare(`SELECT id, lead_id, body, from_me, media_type, timestamp AS created_at, platform, platform_account_id FROM messages WHERE lead_id = ? ORDER BY timestamp DESC LIMIT 50`).all(req.params.leadId);
    for (const m of msgs) items.push({
      id: 'msg-' + m.id,
      activity_type: m.from_me ? 'message_out' : 'message_in',
      platform: m.platform || 'whatsapp',
      title: m.from_me ? 'Sent message' : 'Received message',
      body: m.body || (m.media_type ? `[${m.media_type}]` : ''),
      created_at: m.created_at,
      source: 'message',
    });
    // 3) Notes
    const notes = db.prepare(`SELECT * FROM notes WHERE lead_id = ? ORDER BY created_at DESC LIMIT 30`).all(req.params.leadId);
    for (const n of notes) items.push({ id: 'note-' + n.id, activity_type: 'note', title: 'Note added', body: n.content, created_at: n.created_at, source: 'note' });
    // 4) History
    try {
      const hist = db.prepare(`SELECT * FROM contact_history WHERE lead_id = ? ORDER BY created_at DESC LIMIT 30`).all(req.params.leadId);
      for (const h of hist) items.push({ id: 'hist-' + h.id, activity_type: h.type || 'status_change', title: h.description, created_at: h.created_at, source: 'history' });
    } catch {}
    items.sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
    res.json({ timeline: items.slice(0, 100) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET/PUT /api/workspace/plan — read or update the workspace plan tier
app.get('/api/workspace/plan', auth, (req, res) => {
  try {
    const plan = getWorkspacePlan(req.workspaceId);
    res.json({ plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/workspace/plan-info — full plan definition + current usage (used by frontend to render lock UI)
app.get('/api/workspace/plan-info', auth, (req, res) => {
  try {
    const info = getPlanInfo(req.workspaceId);
    const usage = getWorkspaceUsage(req.workspaceId);
    res.json({
      plan: info.tier,
      name: info.name,
      price: info.price,
      most_popular: !!info.most_popular,
      limits: info.limits,
      features: info.features,
      usage,
      // All plan tiers (for the pricing comparison UI)
      all_plans: Object.entries(PLAN_DEFS).map(([id, d]) => ({ id, ...d })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/workspace/plan', auth, (req, res) => {
  try {
    const { plan, features, limits, trial_ends_at } = req.body || {};
    db.prepare(`INSERT INTO workspace_plan (workspace_id, plan, features, limits, trial_ends_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id) DO UPDATE SET
        plan = excluded.plan, features = excluded.features, limits = excluded.limits, trial_ends_at = excluded.trial_ends_at, updated_at = CURRENT_TIMESTAMP
    `).run(req.workspaceId, plan || 'starter', features ? JSON.stringify(features) : null, limits ? JSON.stringify(limits) : null, trial_ends_at || null);
    res.json({ plan: db.prepare(`SELECT * FROM workspace_plan WHERE workspace_id = ?`).get(req.workspaceId) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/message-queue — outbound queue status
app.get('/api/message-queue', auth, (req, res) => {
  try {
    const items = db.prepare(`SELECT * FROM outbound_message_queue WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100`).all(req.workspaceId);
    res.json({ items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/message-queue/:id/retry', auth, (req, res) => {
  try {
    db.prepare(`UPDATE outbound_message_queue SET status = 'pending', retry_count = 0, next_retry_at = NULL, error_message = NULL WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  WHATSAPP GROUPS
// ════════════════════════════════════════════════════════════

// GET /api/whatsapp/ready-accounts — which WA accounts are connected and usable
// Used by the "Create Group" modal to pick a source number.
app.get('/api/whatsapp/ready-accounts', auth, (req, res) => {
  try {
    const accounts = (typeof whatsappService.listReadyAccounts === 'function')
      ? whatsappService.listReadyAccounts()
      : [];
    // Filter to accounts in this workspace (accountId is in platform_accounts.workspace_id)
    const filtered = accounts.filter(a => {
      if (!a.accountId) return true; // legacy session — no account row, always allow workspace owner
      const row = db.prepare(`SELECT workspace_id FROM platform_accounts WHERE id = ?`).get(a.accountId);
      return !row || row.workspace_id === req.workspaceId;
    });
    res.json({ accounts: filtered });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/whatsapp/groups — create a WhatsApp group from a list of lead ids
// Body: { name, description?, lead_ids: string[], account_id?: string }
// Returns: { group_id, invite_link, added_count, skipped }
app.post('/api/whatsapp/groups', auth, async (req, res) => {
  try {
    const { name, description, lead_ids, account_id } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      return res.status(400).json({ error: 'Group name required' });
    }
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({ error: 'At least one lead is required' });
    }
    if (lead_ids.length > 256) {
      return res.status(400).json({ error: 'WhatsApp limits groups to ~256 participants' });
    }

    // Fetch the leads, filter to workspace + WhatsApp-source + has a real phone number.
    // We let platform-account-mismatch through (a manager may be moving cross-account leads into a group).
    const placeholders = lead_ids.map(() => '?').join(',');
    const leads = db.prepare(`SELECT id, customer_name, customer_phone, platform_source FROM leads WHERE workspace_id = ? AND id IN (${placeholders}) AND (is_deleted = 0 OR is_deleted IS NULL)`)
      .all(req.workspaceId, ...lead_ids);

    const usableLeads = [];
    const ineligible = [];
    for (const l of leads) {
      const digits = String(l.customer_phone || '').replace(/\D/g, '');
      const hasJid = String(l.customer_phone || '').includes('@');
      // Real phone OR a WA JID — anything 7-15 digits OR contains '@'
      if (hasJid || (digits.length >= 7 && digits.length <= 15)) {
        usableLeads.push(l);
      } else {
        ineligible.push({ id: l.id, name: l.customer_name, reason: 'not a valid WhatsApp number (platform user id)' });
      }
    }

    if (usableLeads.length === 0) {
      return res.status(400).json({
        error: 'None of the selected leads have a valid WhatsApp number',
        ineligible,
      });
    }

    const phones = usableLeads.map(l => l.customer_phone);
    const result = await whatsappService.createGroup(name.trim(), phones, description || null, account_id || null);

    // Persist the group for future reference (sending broadcasts to it, naming it, etc.)
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS whatsapp_groups (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        platform_account_id TEXT,
        name TEXT,
        description TEXT,
        invite_link TEXT,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workspace_id, group_id)
      )`);
      db.prepare(`INSERT OR IGNORE INTO whatsapp_groups (id, workspace_id, group_id, platform_account_id, name, description, invite_link, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(generateId(), req.workspaceId, result.groupId, account_id || null, name.trim(), description || null, result.inviteLink || null, req.userId);
    } catch (e) { console.log('⚠️ Group persist warning:', e.message); }

    res.json({
      group_id: result.groupId,
      invite_link: result.inviteLink,
      added_count: result.addedCount,
      skipped: result.skipped,
      ineligible,
    });
  } catch (e) {
    console.error('Group creation error:', e);
    res.status(500).json({ error: e.message || 'Group creation failed' });
  }
});

// PATCH /api/whatsapp/groups/:groupId — update name, description (multipart for icon)
app.patch('/api/whatsapp/groups/:groupId', auth, (req, res) => {
  // Use multer dynamically so JSON requests don't need a file
  upload.single('icon')(req, res, async (mErr) => {
    if (mErr) return res.status(400).json({ error: 'Icon upload failed: ' + (mErr.message || mErr.code) });
    try {
      const groupId = req.params.groupId;
      const { name, description, account_id } = req.body || {};
      if (name) await whatsappService.setGroupSubject(groupId, String(name).trim(), account_id || null);
      if (typeof description === 'string') await whatsappService.setGroupDescription(groupId, description, account_id || null);
      if (req.file) await whatsappService.setGroupPicture(groupId, req.file.path, req.file.mimetype, account_id || null);

      // Update our local mirror
      try {
        if (name || typeof description === 'string') {
          db.prepare(`UPDATE whatsapp_groups SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE workspace_id = ? AND group_id = ?`)
            .run(name || null, typeof description === 'string' ? description : null, req.workspaceId, groupId);
        }
      } catch {}
      res.json({ success: true });
    } catch (e) {
      console.error('Group update error:', e);
      res.status(500).json({ error: e.message || 'Group update failed' });
    }
  });
});

// ════════════════════════════════════════════════════════════
//  BULK LEAD ACTIONS
// ════════════════════════════════════════════════════════════

// POST /api/leads/bulk-trash — soft-delete many leads in one call
app.post('/api/leads/bulk-trash', auth, (req, res) => {
  try {
    const { lead_ids } = req.body || {};
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({ error: 'lead_ids array required' });
    }
    const placeholders = lead_ids.map(() => '?').join(',');
    const result = db.prepare(`UPDATE leads SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id IN (${placeholders})`)
      .run(req.workspaceId, ...lead_ids);
    // Notify SSE listeners so dashboards update
    try { for (const id of lead_ids) broadcastToWorkspace(req.workspaceId, 'lead_deleted', { id }); } catch {}
    res.json({ moved: result.changes, message: `Moved ${result.changes} lead${result.changes === 1 ? '' : 's'} to trash` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  INTEGRATIONS — Calendly + Google Calendar
// ════════════════════════════════════════════════════════════

const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

// Helpers --------------------------------------------------------------------
function readIntegrations(workspaceId) {
  return db.prepare('SELECT * FROM workspace_integrations WHERE workspace_id = ?').get(workspaceId) || null;
}

function upsertIntegrations(workspaceId, patch) {
  const existing = readIntegrations(workspaceId);
  if (existing) {
    const cols = Object.keys(patch);
    if (!cols.length) return existing;
    const sets = cols.map(c => `${c} = ?`).join(', ');
    db.prepare(`UPDATE workspace_integrations SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?`)
      .run(...cols.map(c => patch[c]), workspaceId);
  } else {
    const cols = ['workspace_id', ...Object.keys(patch)];
    const placeholders = cols.map(() => '?').join(',');
    db.prepare(`INSERT INTO workspace_integrations (${cols.join(',')}) VALUES (${placeholders})`)
      .run(workspaceId, ...Object.keys(patch).map(c => patch[c]));
  }
  return readIntegrations(workspaceId);
}

async function googleExchangeAuthCode(code) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth not configured on server (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: 'postmessage', // popup flow
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Token exchange failed');
  }
  return data; // { access_token, refresh_token, expires_in, id_token, scope, token_type }
}

async function googleRefreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Refresh failed');
  return data.access_token;
}

async function googleCreateCalendarEvent(accessToken, { summary, description, startsAt, endsAt, attendees, timezone }) {
  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all';
  const body = {
    summary,
    description: description || '',
    start: { dateTime: new Date(startsAt).toISOString(), timeZone: timezone || 'UTC' },
    end:   { dateTime: new Date(endsAt).toISOString(),   timeZone: timezone || 'UTC' },
    conferenceData: {
      createRequest: {
        requestId: 'wf-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    attendees: (attendees || []).filter(a => a && a.email).map(a => ({ email: a.email, displayName: a.name || undefined })),
    reminders: { useDefault: true },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || 'Calendar event creation failed');
  return data;
}

// Routes ---------------------------------------------------------------------

// GET /api/integrations/status — show what's connected for this workspace
app.get('/api/integrations/status', auth, (req, res) => {
  try {
    const row = readIntegrations(req.workspaceId);
    res.json({
      calendly: {
        configured: !!row?.calendly_url,
        url: row?.calendly_url || null,
      },
      googleCalendar: {
        connected: !!row?.google_calendar_refresh_token,
        email: row?.google_calendar_email || null,
        connected_at: row?.google_calendar_connected_at || null,
        configured: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/integrations/calendly — save / update Calendly URL
app.put('/api/integrations/calendly', auth, (req, res) => {
  try {
    // Plan enforcement — Calendly is Growth+ only
    const feat = checkFeature(req.workspaceId, 'calendly');
    if (!feat.ok) return res.status(403).json({ error: `Calendly integration is not available on the ${feat.planName} plan. Upgrade to Growth.`, code: 'plan_feature' });

    const { url } = req.body || {};
    if (url && !/^https?:\/\/(?:www\.)?calendly\.com\//i.test(String(url).trim())) {
      return res.status(400).json({ error: 'URL must be a Calendly link (https://calendly.com/...)' });
    }
    upsertIntegrations(req.workspaceId, { calendly_url: url ? String(url).trim() : null });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/integrations/google-calendar/connect — exchange auth code for refresh token
app.post('/api/integrations/google-calendar/connect', auth, async (req, res) => {
  try {
    // Plan enforcement — Google Calendar is Growth+ only
    const feat = checkFeature(req.workspaceId, 'google_calendar');
    if (!feat.ok) return res.status(403).json({ error: `Google Calendar integration is not available on the ${feat.planName} plan. Upgrade to Growth.`, code: 'plan_feature' });

    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Authorization code required' });

    const tokens = await googleExchangeAuthCode(code);
    if (!tokens.refresh_token) {
      return res.status(400).json({
        error: 'No refresh token returned. Revoke WappFlow access from your Google Account settings and try again.',
      });
    }

    // Decode the id_token to get the user's email
    let email = null;
    try {
      if (tokens.id_token) {
        const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString('utf8'));
        email = payload.email;
      }
    } catch {}

    upsertIntegrations(req.workspaceId, {
      google_calendar_refresh_token: tokens.refresh_token,
      google_calendar_email: email,
      google_calendar_connected_at: new Date().toISOString(),
    });

    res.json({ ok: true, email });
  } catch (e) {
    console.error('Google Calendar connect error:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/integrations/google-calendar — disconnect
app.delete('/api/integrations/google-calendar', auth, (req, res) => {
  try {
    upsertIntegrations(req.workspaceId, {
      google_calendar_refresh_token: null,
      google_calendar_email: null,
      google_calendar_connected_at: null,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  MEETINGS — schedule + list per lead
// ════════════════════════════════════════════════════════════

// POST /api/leads/:leadId/meetings — create a meeting (Google Meet event)
app.post('/api/leads/:leadId/meetings', auth, async (req, res) => {
  try {
    const { leadId } = req.params;
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(leadId, req.workspaceId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { provider = 'google', title, starts_at, ends_at, notes, send_invite } = req.body || {};

    if (provider !== 'google') {
      return res.status(400).json({ error: 'Only Google Meet provider is implemented' });
    }

    const intg = readIntegrations(req.workspaceId);
    if (!intg?.google_calendar_refresh_token) {
      return res.status(400).json({ error: 'Google Calendar not connected. Connect it in Settings → Integrations.' });
    }

    const accessToken = await googleRefreshAccessToken(intg.google_calendar_refresh_token);

    const attendees = [];
    if (send_invite && lead.email) {
      attendees.push({ email: lead.email, name: lead.name });
    }

    const event = await googleCreateCalendarEvent(accessToken, {
      summary: title || `Meeting with ${lead.name || 'lead'}`,
      description: notes,
      startsAt: starts_at,
      endsAt: ends_at,
      attendees,
      timezone: 'UTC', // could store per-workspace tz
    });

    const meetLink = event.hangoutLink || (event.conferenceData?.entryPoints || []).find(e => e.entryPointType === 'video')?.uri || null;

    const meetingId = generateId();
    db.prepare(`INSERT INTO meetings (id, workspace_id, lead_id, user_id, provider, title, starts_at, ends_at, meet_link, event_id, html_link, notes, status)
                VALUES (?, ?, ?, ?, 'google', ?, ?, ?, ?, ?, ?, ?, 'scheduled')`)
      .run(meetingId, req.workspaceId, leadId, req.userId, title || null, starts_at, ends_at, meetLink, event.id, event.htmlLink || null, notes || null);

    // Log activity
    try {
      db.prepare(`INSERT INTO activity_timeline (id, lead_id, workspace_id, user_id, actor_name, activity_type, title, body, metadata)
                  VALUES (?, ?, ?, ?, ?, 'meeting_scheduled', ?, ?, ?)`)
        .run(generateId(), leadId, req.workspaceId, req.userId, req.senderName || 'Team Member',
             title || 'Meeting scheduled',
             meetLink ? `Google Meet link: ${meetLink}` : 'Calendar event created',
             JSON.stringify({ meeting_id: meetingId, event_id: event.id, html_link: event.htmlLink, meet_link: meetLink, starts_at, ends_at }));
    } catch {}

    res.json({
      id: meetingId,
      provider: 'google',
      title: title,
      starts_at,
      ends_at,
      meet_link: meetLink,
      event_id: event.id,
      html_link: event.htmlLink,
    });
  } catch (e) {
    console.error('Meeting create error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/leads/:leadId/meetings — list meetings for a lead
app.get('/api/leads/:leadId/meetings', auth, (req, res) => {
  try {
    const { leadId } = req.params;
    const rows = db.prepare('SELECT * FROM meetings WHERE workspace_id = ? AND lead_id = ? ORDER BY starts_at DESC')
      .all(req.workspaceId, leadId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  START SERVER
// ════════════════════════════════════════════════════════════

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => { console.error("Unhandled error:", err); res.status(500).json({ error: "Internal server error" }); });

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('🚀 Server running on port:', PORT);
  console.log('📦 Environment:', process.env.NODE_ENV || 'development');
  console.log('🌐 Frontend URL:', process.env.FRONTEND_URL || '*');
});
