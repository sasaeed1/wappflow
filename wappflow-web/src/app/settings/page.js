'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Building2, Globe, Mail, Phone, MapPin, DollarSign,
  Image, Save, Tag, MessageSquare, Plus, Edit2, Trash2, X, CheckCircle,
  Settings, Zap, Users, FileText, Bell, BellOff, Bot, ChevronRight,
  Upload, Eye, EyeOff, RefreshCw, Sparkles, Shield, Hash, Clock,
  ToggleLeft, ToggleRight, AlertCircle, Info, Palette, Lock,
  MessageCircle, Camera, Globe as GlobeIcon, MonitorSmartphone,
  Link, Unlink, Copy, Wifi, WifiOff, Layers, QrCode, Key,
  Plug, Calendar, Video, Volume2, Play
} from 'lucide-react';
import { settingsAPI, presetsAPI, tagsAPI, emailTemplatesAPI, autoReplyAPI, teamAPI, workspaceAPI, authAPI, platformAccountsAPI, aiAPI, integrationsAPI, lostReasonsAPI, auditAPI, BASE_URL } from '../../lib/api';
import { Send as SendIcon } from 'lucide-react';
import { useConfirm } from '@/lib/confirm';
import { toast } from '@/components/ui/Toast';
import { Field, Input as UIInput } from '@/components/ui/Field';
import { useSound, SOUND_KINDS } from '@/lib/sounds';
import { usePlan, nextPlanLabel, formatMoney } from '@/lib/plan';
import { LockedOverlay, LockBadge, LockTooltip, UpgradeCta } from '@/components/PlanLock';
import InstallAppCard from '@/components/InstallAppCard';

// Map of settings tab → required feature flag + required plan name.
// If the user's plan doesn't have the feature, the tab is shown locked.
const TAB_GATING = {
  autoreply:         { feature: 'automations',     plan: 'Studio', perks: ['Keyword-triggered auto-responses', 'Multi-step drip sequences', 'Save your team from typing the same reply 100×'] },
  integrations:      { feature: 'google_calendar', plan: 'Studio', perks: ['Google Meet + Calendar scheduling', 'Calendly link sharing', 'One-click meetings from any lead'] },
};
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

const PALETTE = ['#ef4444','#f97316','#f59e0b','#22c55e','#06b6d4','#3b82f6','#6366f1','#a855f7','#ec4899','#64748b'];

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
];

const TABS = [
  { id: 'connections', label: 'Connections', icon: Layers, color: '#6366f1' },
  { id: 'plan', label: 'Plan & Billing', icon: Zap, color: '#8b5cf6' },
  { id: 'appearance', label: 'Appearance', icon: Palette, color: '#6366f1' },
  { id: 'company', label: 'Company Profile', icon: Building2, color: '#6366f1' },
  { id: 'currency', label: 'Currency & Billing', icon: DollarSign, color: '#10b981' },
  { id: 'presets', label: 'Message Presets', icon: MessageSquare, color: '#06b6d4' },
  { id: 'email', label: 'Email Templates', icon: Mail, color: '#f59e0b' },
  { id: 'email_sending', label: 'Email Sending', icon: SendIcon, color: '#10b981' },
  { id: 'email_receiving', label: 'Email Receiving', icon: Mail, color: '#06b6d4' },
  { id: 'autoreply', label: 'Auto-Reply Rules', icon: Bot, color: '#8b5cf6' },
  { id: 'tags', label: 'Tags', icon: Tag, color: '#ec4899' },
  { id: 'lost-reasons', label: 'Lost Reasons', icon: AlertCircle, color: '#ef4444' },
  { id: 'notifications', label: 'Notifications', icon: Bell, color: '#ef4444' },
  { id: 'integrations', label: 'Integrations', icon: Plug, color: '#22c55e' },
  { id: 'workspace', label: 'Workspace', icon: Users, color: '#8b5cf6' },
  { id: 'data', label: 'Data & Privacy', icon: Shield, color: '#0ea5e9' },
  { id: 'ai_command', label: 'AI Command', icon: Sparkles, color: '#8b5cf6' },
  { id: 'password', label: 'Change Password', icon: Lock, color: '#ef4444' },
];

function SectionCard({ icon: Icon, title, subtitle, color, children }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 20, border: '1.5px solid var(--border)',
      padding: 28, boxShadow: 'var(--shadow)', marginBottom: 24
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: color + '18'
        }}>
          <Icon size={22} color={color} />
        </div>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{title}</h2>
          {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, marginTop: 2 }}>{subtitle}</p>}
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>{children}</div>
    </div>
  );
}

// Thin adapter over the Field system — dozens of tabs use this prop shape (Batch D).
function Input({ label, value, onChange, placeholder, type = 'text', hint }) {
  return (
    <Field label={label} hint={hint} style={{ marginBottom: 18 }}>
      <UIInput type={type} value={value || ''} onChange={onChange} placeholder={placeholder} />
    </Field>
  );
}

// ── Company Profile Tab ───────────────────────────────────────────────────────
function CompanyTab({ company, setCompany, onSave, saving }) {
  const logoRef = useRef();
  const [uploading, setUploading] = useState(false);

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await settingsAPI.uploadLogo(fd);
      setCompany(prev => ({ ...prev, company_logo: res.data.logo_url }));
    } catch (err) {
      console.error(err);
    } finally { setUploading(false); }
  };

  return (
    <div>
      <SectionCard icon={Building2} title="Company Information" subtitle="This appears on invoices and customer communications" color="#6366f1">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, padding: 20, background: 'rgba(99,102,241,0.06)', borderRadius: 14, border: '1.5px dashed #c7d2fe' }}>
          <div style={{
            width: 80, height: 80, borderRadius: 16, background: 'rgba(99,102,241,0.12)', border: '2px solid #e0e7ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0
          }}>
            {company.company_logo
              ? <img src={`${BASE_URL}${company.company_logo}`} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <Building2 size={32} color="#a5b4fc" />}
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Company Logo</p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>PNG or JPG, max 5MB. Appears on invoices & documents.</p>
            <button onClick={() => logoRef.current?.click()} disabled={uploading} style={{
              padding: '8px 18px', borderRadius: 10, border: '1.5px solid #6366f1',
              background: 'var(--surface)', color: '#6366f1', fontWeight: 700, cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6
            }}>
              {uploading ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}
              {uploading ? 'Uploading...' : company.company_logo ? 'Change Logo' : 'Upload Logo'}
            </button>
            <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
          </div>
        </div>

        <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <Input label="Company Name" value={company.company_name} onChange={e => setCompany(p => ({ ...p, company_name: e.target.value }))} placeholder="Acme Corporation" />
          <Input label="Business Email" value={company.company_email} onChange={e => setCompany(p => ({ ...p, company_email: e.target.value }))} placeholder="hello@company.com" type="email" />
          <Input label="Phone Number" value={company.company_phone} onChange={e => setCompany(p => ({ ...p, company_phone: e.target.value }))} placeholder="+1 234 567 8900" />
          <Input label="Website" value={company.company_website} onChange={e => setCompany(p => ({ ...p, company_website: e.target.value }))} placeholder="https://yourcompany.com" />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 7 }}>Business Address</label>
          <textarea
            value={company.company_address || ''} rows={3}
            onChange={e => setCompany(p => ({ ...p, company_address: e.target.value }))}
            placeholder="123 Business Street, City, State, Country"
            style={{ width: '100%', padding: '11px 15px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 7 }}>Email Signature</label>
          <textarea
            value={company.email_signature || ''} rows={4}
            onChange={e => setCompany(p => ({ ...p, email_signature: e.target.value }))}
            placeholder="Best regards,&#10;Your Name&#10;Company | Phone | Website"
            style={{ width: '100%', padding: '11px 15px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        <button onClick={onSave} disabled={saving} style={{
          padding: '12px 28px', borderRadius: 12, border: 'none',
          background: saving ? '#9ca3af' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
          color: 'white', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14,
          display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(99,102,241,0.35)'
        }}>
          <Save size={15} /> {saving ? 'Saving...' : 'Save Company Profile'}
        </button>
      </SectionCard>
    </div>
  );
}

// ── Currency Tab ──────────────────────────────────────────────────────────────
function CurrencyTab({ company, setCompany, onSave, saving }) {
  return (
    <div>
      <SectionCard icon={DollarSign} title="Currency & Billing Settings" subtitle="Configure your default currency and invoice numbering" color="#10b981">
        <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 7 }}>Currency</label>
            <select aria-label="Currency"
              value={company.currency || 'USD'}
              onChange={e => {
                const cur = CURRENCIES.find(c => c.code === e.target.value);
                setCompany(p => ({ ...p, currency: cur.code, currency_symbol: cur.symbol }));
              }}
              style={{ width: '100%', padding: '11px 15px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', color: 'var(--text)', background: 'var(--surface)', boxSizing: 'border-box' }}
            >
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.symbol})</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 7 }}>Currency Symbol</label>
            <input aria-label="Currency Symbol"
              value={company.currency_symbol || '$'}
              onChange={e => setCompany(p => ({ ...p, currency_symbol: e.target.value }))}
              style={{ width: '100%', padding: '11px 15px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 7 }}>Symbol Position</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {[{ v: 'before', label: 'Before ($100)' }, { v: 'after', label: 'After (100$)' }].map(opt => (
                <button key={opt.v} onClick={() => setCompany(p => ({ ...p, currency_position: opt.v }))}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 11, border: `2px solid ${company.currency_position === opt.v ? '#10b981' : 'var(--border)'}`,
                    background: company.currency_position === opt.v ? 'rgba(16,185,129,0.10)' : 'var(--surface)',
                    color: company.currency_position === opt.v ? '#059669' : '#6b7280',
                    fontWeight: 700, cursor: 'pointer', fontSize: 13
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--surface2)', margin: '8px 0 20px' }} />
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Invoice Settings</p>
        <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <Input label="Invoice Prefix" value={company.invoice_prefix} onChange={e => setCompany(p => ({ ...p, invoice_prefix: e.target.value }))} placeholder="INV" hint="e.g. INV-0001" />
          <Input label="Tax Name" value={company.tax_name} onChange={e => setCompany(p => ({ ...p, tax_name: e.target.value }))} placeholder="GST / VAT / Tax" />
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 7 }}>Default Tax Rate (%)</label>
            <input aria-label="Default Tax Rate (%)"
              type="number" min="0" max="100" step="0.1"
              value={company.tax_rate || 0}
              onChange={e => setCompany(p => ({ ...p, tax_rate: parseFloat(e.target.value) || 0 }))}
              style={{ width: '100%', padding: '11px 15px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Preview */}
        <div style={{ padding: 16, background: 'rgba(16,185,129,0.10)', borderRadius: 12, border: '1.5px solid #bbf7d0', marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 6 }}>Preview</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: '#15803d' }}>
            {company.currency_position === 'after'
              ? `1,234.00${company.currency_symbol || '$'}`
              : `${company.currency_symbol || '$'}1,234.00`}
            <span style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginLeft: 8 }}>{company.currency || 'USD'}</span>
          </p>
        </div>

        <button onClick={onSave} disabled={saving} style={{
          padding: '12px 28px', borderRadius: 12, border: 'none',
          background: saving ? '#9ca3af' : 'linear-gradient(135deg, #10b981, #059669)',
          color: 'white', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14,
          display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(16,185,129,0.3)'
        }}>
          <Save size={15} /> {saving ? 'Saving...' : 'Save Currency Settings'}
        </button>
      </SectionCard>
    </div>
  );
}

// ── Presets Tab ───────────────────────────────────────────────────────────────
function PresetsTab({ showToast }) {
  const confirm = useConfirm();
  const [presets, setPresets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', body: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchPresets(); }, []);
  const fetchPresets = async () => {
    const res = await presetsAPI.getAll();
    setPresets(res.data.presets || []);
  };

  const openNew = () => { setEditing(null); setForm({ title: '', body: '' }); setShowForm(true); };
  const openEdit = (p) => { setEditing(p); setForm({ title: p.title, body: p.body }); setShowForm(true); };

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      if (editing) { await presetsAPI.update(editing.id, form); showToast('Preset updated!'); }
      else { await presetsAPI.create(form); showToast('Preset created!'); }
      await fetchPresets();
      setShowForm(false);
    } catch { showToast('Error saving preset', 'error'); } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    const ok = await confirm({ title: 'Delete this preset?', message: 'The preset will be removed permanently.', confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    await presetsAPI.delete(id);
    showToast('Preset deleted.');
    fetchPresets();
  };

  return (
    <SectionCard icon={MessageSquare} title="Message Presets" subtitle="Quick-reply templates available in every lead chat" color="#06b6d4">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {!showForm && (
          <button onClick={openNew} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
            background: 'linear-gradient(135deg, #06b6d4, #0891b2)', border: 'none',
            borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer'
          }}>
            <Plus size={15} /> New Preset
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ background: 'rgba(6,182,212,0.08)', border: '2px solid #06b6d4', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <Input label="Preset Title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Follow Up, Welcome, Pricing..." />
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 7 }}>Message Body</label>
            <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={4}
              placeholder="Hi {name}, thanks for reaching out!..." style={{ width: '100%', padding: '11px 15px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Tip: Use *bold*, _italic_ for WhatsApp formatting.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 20px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Create Preset'}
            </button>
          </div>
        </div>
      )}

      {presets.length === 0 && !showForm ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
          <MessageSquare size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
          <p style={{ fontWeight: 700, marginBottom: 4 }}>No presets yet</p>
          <p style={{ fontSize: 13 }}>Create your first message template above.</p>
        </div>
      ) : (
        presets.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(6,182,212,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MessageSquare size={15} color="#06b6d4" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{p.title}</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{p.body}</p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => openEdit(p)} style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Edit</button>
              <button onClick={() => handleDelete(p.id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #fecaca', background: 'var(--danger-bg)', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        ))
      )}
    </SectionCard>
  );
}

// ── Lost Reasons Tab ──────────────────────────────────────────────────────────
function LostReasonsTab({ showToast }) {
  const confirm = useConfirm();
  const [reasons, setReasons] = useState([]);
  const [newReason, setNewReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchReasons(); }, []);
  const fetchReasons = async () => {
    try { const res = await lostReasonsAPI.getAll(); setReasons(res.data.reasons || []); }
    catch { setReasons([]); }
  };

  const handleAdd = async () => {
    const text = newReason.trim();
    if (!text) return;
    setSaving(true);
    try {
      await lostReasonsAPI.create(text);
      setNewReason('');
      await fetchReasons();
      showToast('Lost reason added!');
    } catch { showToast('Error adding reason', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    const ok = await confirm({ title: 'Delete this reason?', message: 'It will no longer appear when marking leads as lost.', confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    await lostReasonsAPI.delete(id);
    showToast('Reason deleted.');
    fetchReasons();
  };

  return (
    <SectionCard icon={AlertCircle} title="Lost Reasons" subtitle="Predefined reasons shown when a lead is marked as Closed - Lost" color="#ef4444">
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <input value={newReason} onChange={e => setNewReason(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="e.g. Too expensive, Went with competitor, No budget…"
          style={{ flex: 1, padding: '11px 15px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        <button onClick={handleAdd} disabled={saving || !newReason.trim()} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
          background: newReason.trim() ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'var(--surface2)',
          border: 'none', borderRadius: 10, color: newReason.trim() ? 'white' : 'var(--text-dim)',
          fontSize: 13, fontWeight: 700, cursor: newReason.trim() ? 'pointer' : 'default', flexShrink: 0,
        }}>
          <Plus size={15} /> {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
      {reasons.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
          <AlertCircle size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
          <p style={{ fontWeight: 700, marginBottom: 4 }}>No lost reasons yet</p>
          <p style={{ fontSize: 13 }}>Add reasons above — they&apos;ll appear when you close a lead as lost.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reasons.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertCircle size={14} color="#ef4444" />
              </div>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{r.reason}</span>
              <button onClick={() => handleDelete(r.id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Email Templates Tab ───────────────────────────────────────────────────────
function EmailTemplatesTab({ showToast }) {
  const confirm = useConfirm();
  const [templates, setTemplates] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', subject: '', body: '', delay_days: 0, trigger_event: 'manual' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchTemplates(); }, []);
  const fetchTemplates = async () => {
    const res = await emailTemplatesAPI.getAll();
    setTemplates(res.data.templates || []);
  };

  const openNew = () => { setEditing(null); setForm({ name: '', subject: '', body: '', delay_days: 0, trigger_event: 'manual' }); setShowForm(true); };
  const openEdit = (t) => { setEditing(t); setForm({ name: t.name, subject: t.subject, body: t.body, delay_days: t.delay_days, trigger_event: t.trigger_event }); setShowForm(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) { await emailTemplatesAPI.update(editing.id, form); showToast('Template updated!'); }
      else { await emailTemplatesAPI.create(form); showToast('Template created!'); }
      fetchTemplates(); setShowForm(false);
    } catch { showToast('Error saving template', 'error'); } finally { setSaving(false); }
  };

  const TRIGGERS = [
    { v: 'manual', l: 'Manual Only' },
    { v: 'on_contacted', l: 'When Contacted' },
    { v: 'on_interested', l: 'When Interested' },
    { v: 'on_negotiating', l: 'When Negotiating' },
    { v: 'on_won', l: 'When Won' },
  ];

  return (
    <SectionCard icon={Mail} title="Email Follow-up Templates" subtitle="Create reusable email templates for automated follow-up workflows" color="#f59e0b">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {!showForm && (
          <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={15} /> New Template
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ background: 'var(--warning-bg)', border: '2px solid var(--warning-border)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Input label="Template Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Follow-up Day 1" />
            <Input label="Email Subject" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Following up on your inquiry" />
          </div>
          <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 7 }}>Trigger Event</label>
              <select aria-label="Trigger Event" value={form.trigger_event} onChange={e => setForm(p => ({ ...p, trigger_event: e.target.value }))}
                style={{ width: '100%', padding: '11px 15px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', background: 'var(--surface)', boxSizing: 'border-box' }}>
                {TRIGGERS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 7 }}>Send After (days)</label>
              <input aria-label="Send After (days)" type="number" min="0" value={form.delay_days} onChange={e => setForm(p => ({ ...p, delay_days: parseInt(e.target.value) || 0 }))}
                style={{ width: '100%', padding: '11px 15px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 7 }}>Email Body</label>
            <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={6}
              placeholder="Dear {name},&#10;&#10;I wanted to follow up on your recent inquiry..." style={{ width: '100%', padding: '11px 15px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Variables: {'{name}'}, {'{phone}'}, {'{email}'}, {'{company}'}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 20px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Create Template'}
            </button>
          </div>
        </div>
      )}

      {templates.length === 0 && !showForm ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
          <Mail size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
          <p style={{ fontWeight: 700 }}>No email templates yet</p>
        </div>
      ) : (
        templates.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Mail size={15} color="#f59e0b" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t.name}</p>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.18)', color: 'var(--warning-text)' }}>{t.trigger_event}</span>
                {t.delay_days > 0 && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>+{t.delay_days}d</span>}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Subject: {t.subject}</p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => openEdit(t)} style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Edit</button>
              <button onClick={async () => { const ok = await confirm({ title: 'Delete this template?', confirmLabel: 'Delete', tone: 'danger' }); if (!ok) return; await emailTemplatesAPI.delete(t.id); showToast('Deleted'); fetchTemplates(); }}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #fecaca', background: 'var(--danger-bg)', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        ))
      )}
    </SectionCard>
  );
}

// ── Auto-Reply Tab ────────────────────────────────────────────────────────────
function AutoReplyTab({ showToast }) {
  const confirm = useConfirm();
  const [rules, setRules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', keywords: '', reply_message: '', match_type: 'contains' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchRules(); }, []);
  const fetchRules = async () => {
    const res = await autoReplyAPI.getAll();
    setRules(res.data.rules || []);
  };

  const openNew = () => { setEditing(null); setForm({ name: '', keywords: '', reply_message: '', match_type: 'contains' }); setShowForm(true); };
  const openEdit = (r) => {
    setEditing(r);
    const kws = (() => { try { return JSON.parse(r.keywords).join(', '); } catch { return r.keywords; } })();
    setForm({ name: r.name, keywords: kws, reply_message: r.reply_message, match_type: r.match_type });
    setShowForm(true);
  };

  const handleSave = async () => {
    const kwArray = form.keywords.split(',').map(k => k.trim()).filter(Boolean);
    const data = { ...form, keywords: kwArray };
    setSaving(true);
    try {
      if (editing) { await autoReplyAPI.update(editing.id, data); showToast('Rule updated!'); }
      else { await autoReplyAPI.create(data); showToast('Rule created!'); }
      fetchRules(); setShowForm(false);
    } catch { showToast('Error', 'error'); } finally { setSaving(false); }
  };

  const toggleRule = async (rule) => {
    const kws = (() => { try { return JSON.parse(rule.keywords); } catch { return [rule.keywords]; } })();
    await autoReplyAPI.update(rule.id, { ...rule, keywords: kws, is_active: !rule.is_active });
    fetchRules();
  };

  return (
    <SectionCard icon={Bot} title="Auto-Reply Rules" subtitle="Automatically reply to incoming messages based on keywords" color="#8b5cf6">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {!showForm && (
          <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', border: 'none', borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={15} /> New Rule
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ background: 'rgba(139,92,246,0.10)', border: '2px solid #8b5cf6', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <Input label="Rule Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Greeting Reply, Price Inquiry..." />
          <Input label="Keywords (comma separated)" value={form.keywords} onChange={e => setForm(p => ({ ...p, keywords: e.target.value }))} placeholder="hello, hi, hey, good morning" hint="Separate multiple keywords with commas" />
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 7 }}>Match Type</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {[{ v: 'contains', l: 'Contains keyword' }, { v: 'exact', l: 'Exact match' }].map(opt => (
                <button key={opt.v} onClick={() => setForm(p => ({ ...p, match_type: opt.v }))} style={{
                  flex: 1, padding: '9px', borderRadius: 10, border: `2px solid ${form.match_type === opt.v ? '#8b5cf6' : 'var(--border)'}`,
                  background: form.match_type === opt.v ? 'rgba(139,92,246,0.10)' : 'var(--surface)',
                  color: form.match_type === opt.v ? '#7c3aed' : '#6b7280', fontWeight: 700, cursor: 'pointer', fontSize: 13
                }}>{opt.l}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 7 }}>Auto Reply Message</label>
            <textarea value={form.reply_message} onChange={e => setForm(p => ({ ...p, reply_message: e.target.value }))} rows={4}
              placeholder="Thanks for reaching out! We'll get back to you shortly..." style={{ width: '100%', padding: '11px 15px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 20px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Create Rule'}
            </button>
          </div>
        </div>
      )}

      {rules.map(r => {
        const kws = (() => { try { return JSON.parse(r.keywords); } catch { return [r.keywords]; } })();
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 0', borderBottom: '1px solid #f3f4f6' }}>
            <button onClick={() => toggleRule(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, marginTop: 2 }}>
              {r.is_active ? <ToggleRight size={28} color="#8b5cf6" /> : <ToggleLeft size={28} color="#d1d5db" />}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{r.name}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                {kws.map((kw, i) => <span key={i} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#f3e8ff', color: '#7c3aed' }}>{kw}</span>)}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.reply_message}</p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => openEdit(r)} style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Edit</button>
              <button onClick={async () => { const ok = await confirm({ title: 'Delete this rule?', confirmLabel: 'Delete', tone: 'danger' }); if (!ok) return; await autoReplyAPI.delete(r.id); fetchRules(); }}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #fecaca', background: 'var(--danger-bg)', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        );
      })}
      {rules.length === 0 && !showForm && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
          <Bot size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
          <p style={{ fontWeight: 700 }}>No auto-reply rules yet</p>
        </div>
      )}
    </SectionCard>
  );
}

// ── Tags Tab ──────────────────────────────────────────────────────────────────
function TagsTab({ showToast }) {
  const confirm = useConfirm();
  const [tags, setTags] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', color: PALETTE[0] });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchTags(); }, []);
  const fetchTags = async () => { const res = await tagsAPI.getAll(); setTags(res.data.tags || []); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) { await tagsAPI.update(editing.id, form); showToast('Tag updated!'); }
      else { await tagsAPI.create(form); showToast('Tag created!'); }
      fetchTags(); setShowForm(false);
    } catch { showToast('Error', 'error'); } finally { setSaving(false); }
  };

  return (
    <SectionCard icon={Tag} title="Lead Tags" subtitle="Color-coded labels you can assign to any lead" color="#ec4899">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {!showForm && (
          <button onClick={() => { setEditing(null); setForm({ name: '', color: PALETTE[0] }); setShowForm(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'linear-gradient(135deg, #ec4899, #db2777)', border: 'none', borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={15} /> New Tag
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ background: 'rgba(236,72,153,0.10)', border: '2px solid #ec4899', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <Input label="Tag Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Hot Lead, VIP, Follow Up..." />
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 10 }}>Color</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            {PALETTE.map(c => (
              <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                aria-label={`Colour ${c}`} aria-pressed={form.color === c} style={{
                width: 30, height: 30, borderRadius: '50%', background: c, cursor: 'pointer',
                border: `3px solid ${form.color === c ? '#111827' : 'transparent'}`,
                boxShadow: form.color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none',
              }} />
            ))}
            <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
              style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', marginRight: 8 }}>Preview:</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, background: form.color + '22', border: `1.5px solid ${form.color}55`, color: form.color, fontSize: 12, fontWeight: 700 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: form.color }} />{form.name || 'Tag name'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 20px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #ec4899, #db2777)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Create Tag'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {tags.map(tag => (
          <div key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 24, background: tag.color + '18', border: `1.5px solid ${tag.color}44` }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: tag.color }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: tag.color }}>{tag.name}</span>
            <button aria-label="Edit" onClick={() => { setEditing(tag); setForm({ name: tag.name, color: tag.color }); setShowForm(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: tag.color, opacity: 0.7, display: 'flex' }}><Edit2 size={12} /></button>
            <button aria-label="Delete" onClick={async () => { const ok = await confirm({ title: 'Delete this tag?', message: 'Leads currently tagged will lose it.', confirmLabel: 'Delete', tone: 'danger' }); if (!ok) return; await tagsAPI.delete(tag.id); fetchTags(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.6, display: 'flex' }}><Trash2 size={12} /></button>
          </div>
        ))}
        {tags.length === 0 && !showForm && <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>No tags yet. Create one above.</p>}
      </div>
    </SectionCard>
  );
}

// ── Notifications Tab ─────────────────────────────────────────────────────────
function NotificationsTab({ showToast }) {
  const sound = useSound();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifTypes, setNotifTypes] = useState(() => {
    if (typeof window === 'undefined') return { newLead: true, newMessage: true, reminders: true };
    try {
      const stored = JSON.parse(localStorage.getItem('wf_notif_types') || '{}');
      return { newLead: stored.newLead !== false, newMessage: stored.newMessage !== false, reminders: stored.reminders !== false };
    } catch { return { newLead: true, newMessage: true, reminders: true }; }
  });

  const toggleNotifType = (key) => {
    setNotifTypes(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('wf_notif_types', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(ok);
    if (ok) {
      setPermission(Notification.permission);
      navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription().then(sub => setSubscribed(!!sub))).catch(() => {});
    }
  }, []);

  const urlBase64ToUint8Array = (b64) => {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const b = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(b);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') { showToast('Permission denied', 'error'); return; }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const token = localStorage.getItem('token');
      const keyRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/api/push/vapid-key`);
      const { publicKey } = await keyRes.json();

      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(sub.toJSON()),
      });
      setSubscribed(true);
      showToast('Push notifications enabled!');
    } catch (e) { showToast('Failed: ' + e.message, 'error'); } finally { setLoading(false); }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const token = localStorage.getItem('token');
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/api/push/unsubscribe`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      showToast('Push notifications disabled');
    } catch (e) { showToast('Error: ' + e.message, 'error'); } finally { setLoading(false); }
  };

  const handleTest = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/api/push/test`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }
      });
      showToast('Test notification sent!');
    } catch { showToast('Test failed', 'error'); }
  };

  return (
    <SectionCard title="Push Notifications" icon={Bell} color="#ef4444">
      {!supported ? (
        <div style={{ padding: '24px', background: 'rgba(239,68,68,0.12)', borderRadius: 12, border: '1.5px solid #fecaca' }}>
          <p style={{ fontSize: 14, color: '#dc2626', fontWeight: 600, margin: 0 }}>
            ⚠️ Push notifications are not supported in this browser.
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '6px 0 0' }}>Try Chrome, Firefox, or Edge for push notification support.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Install the app. Sits above notifications on purpose: on a phone,
              installing is what makes push notifications actually useful — a
              browser tab the user closed does not deliver anything. The banner
              on mobile is one-shot and dismissible, so this is the permanent
              home for the action. */}
          <InstallAppCard />

          {/* Status card */}
          <div style={{ background: subscribed ? 'rgba(16,185,129,0.10)' : 'var(--surface2)', border: `1.5px solid ${subscribed ? '#a7f3d0' : 'var(--border)'}`, borderRadius: 14, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: subscribed ? '#10b981' : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {subscribed ? <Bell size={20} color="white" /> : <BellOff size={20} color="white" />}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>
                {subscribed ? 'Notifications Active' : 'Notifications Off'}
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                {subscribed
                  ? 'You\'ll receive push notifications for new leads and messages.'
                  : 'Enable to get notified about new leads and messages even when the tab is in the background.'}
              </p>
            </div>
            {subscribed
              ? <button onClick={handleUnsubscribe} disabled={loading} style={{ padding: '8px 16px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text)' }}>Disable</button>
              : <button onClick={handleSubscribe} disabled={loading || permission === 'denied'} style={{ padding: '8px 16px', background: permission === 'denied' ? 'var(--border)' : 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: permission === 'denied' ? 'not-allowed' : 'pointer', color: permission === 'denied' ? '#9ca3af' : 'white' }}>
                {loading ? 'Enabling...' : 'Enable'}
              </button>
            }
          </div>

          {permission === 'denied' && (
            <div style={{ background: 'var(--warning-bg)', border: '1.5px solid var(--warning-border)', borderRadius: 12, padding: '12px 16px' }}>
              <p style={{ fontSize: 13, color: 'var(--warning-text)', margin: 0, fontWeight: 600 }}>⚠️ Notifications blocked in browser settings. Click the lock icon in your address bar to allow notifications.</p>
            </div>
          )}

          {/* Notification types */}
          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            {[
              { label: '👤 New Lead', desc: 'When a new WhatsApp contact creates a lead', key: 'newLead' },
              { label: '💬 New Message', desc: 'When a lead sends you a message', key: 'newMessage' },
              { label: '⏰ Reminders', desc: 'When a reminder is due', key: 'reminders' },
            ].map((item, i, arr) => {
              const active = notifTypes[item.key];
              return (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>{item.label}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>{item.desc}</p>
                  </div>
                  <button
                    onClick={() => toggleNotifType(item.key)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    title={active ? 'Disable' : 'Enable'}
                  >
                    <div style={{ width: 36, height: 20, borderRadius: 10, background: active ? '#10b981' : 'var(--border)', position: 'relative', transition: 'background 0.2s' }}>
                      <div style={{ position: 'absolute', top: 2, left: active ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--surface)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Test button */}
          {subscribed && (
            <button onClick={handleTest} style={{ padding: '10px 18px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
              <Bell size={14} /> Send Test Notification
            </button>
          )}
        </div>
      )}

      {/* ───────── Sound preferences ───────── */}
      <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Volume2 size={16} color="#a855f7" />
          <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Notification sounds</h3>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 16px' }}>Each event has its own tone. Click the play icon to preview. Adjust master volume below.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          {SOUND_KINDS.map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <button onClick={() => sound.preview(k.id)} title="Preview sound"
                style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <Play size={13} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{k.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{k.desc}</div>
              </div>
              <button onClick={() => sound.setPref(k.id, !sound.prefs[k.id])}
                style={{ width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', background: sound.prefs[k.id] ? '#22c55e' : '#374151', position: 'relative', transition: 'background 0.15s', padding: 0 }}>
                <span style={{ position: 'absolute', top: 2, left: sound.prefs[k.id] ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
              </button>
            </div>
          ))}
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>Master volume</label>
          <input aria-label="Master volume" type="range" min={0} max={1} step={0.05} value={sound.volume} onChange={(e) => sound.setVolume(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#818cf8' }} />
        </div>
      </div>
    </SectionCard>
  );
}

// ════════════════════════════════════════════════════════════
//  INTEGRATIONS TAB — Google Calendar + Calendly
// ════════════════════════════════════════════════════════════

function PlanLockBadge({ feature, requiredPlan, currentPlan }) {
  return (
    <div style={{
      marginTop: 12,
      padding: '10px 14px',
      background: 'linear-gradient(135deg, rgba(245,158,11,0.10), rgba(168,85,247,0.08))',
      border: '1px solid rgba(245,158,11,0.30)',
      borderRadius: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 13,
      color: '#fde68a',
    }}>
      <Lock size={14} />
      <span style={{ flex: 1 }}>
        <strong>{feature}</strong> is part of the {requiredPlan} plan. You&apos;re on {currentPlan}.
      </span>
      <a href="/settings?tab=plan" style={{ color: '#fbbf24', fontWeight: 700, textDecoration: 'none' }}>Upgrade →</a>
    </div>
  );
}

function IntegrationsTab({ showToast }) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || 'placeholder'}>
      <IntegrationsContent showToast={showToast} />
    </GoogleOAuthProvider>
  );
}

function IntegrationsContent({ showToast }) {
  const confirm = useConfirm();
  const plan = usePlan();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [calendlyDraft, setCalendlyDraft] = useState('');

  const gCalUnlocked = plan.hasFeature('google_calendar');
  const calendlyUnlocked = plan.hasFeature('calendly');

  useEffect(() => { reload(); }, []);

  async function reload() {
    setLoading(true);
    try {
      const r = await integrationsAPI.status();
      setStatus(r.data);
      setCalendlyDraft(r.data?.calendly?.url || '');
    } catch (e) {
      showToast('Failed to load integrations', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Google Calendar — auth-code popup flow
  const googleLogin = useGoogleLogin({
    flow: 'auth-code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    onSuccess: async (codeResponse) => {
      setBusy(true);
      try {
        await integrationsAPI.connectGoogleCalendar(codeResponse.code);
        showToast('Google Calendar connected');
        reload();
      } catch (e) {
        await confirm({
          title: 'Connection failed',
          message: e.response?.data?.error || e.message,
          alertOnly: true,
          tone: 'danger',
        });
      } finally {
        setBusy(false);
      }
    },
    onError: () => showToast('Google authorization cancelled', 'error'),
  });

  async function handleDisconnectGoogle() {
    const ok = await confirm({
      title: 'Disconnect Google Calendar?',
      message: 'You won’t be able to create Google Meet events from the CRM until you reconnect.',
      confirmLabel: 'Disconnect',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await integrationsAPI.disconnectGoogleCalendar();
      showToast('Google Calendar disconnected');
      reload();
    } catch (e) {
      showToast('Failed to disconnect', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveCalendly() {
    setBusy(true);
    try {
      await integrationsAPI.saveCalendly(calendlyDraft || null);
      showToast(calendlyDraft ? 'Calendly URL saved' : 'Calendly URL cleared');
      reload();
    } catch (e) {
      const err = e.response?.data?.error || 'Save failed';
      showToast(err, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <SectionCard icon={Plug} title="Integrations" color="#22c55e"><div style={{ padding: 14, color: 'var(--text-muted)' }}>Loading…</div></SectionCard>;
  }

  const g = status?.googleCalendar || {};
  const c = status?.calendly || {};

  return (
    <SectionCard icon={Plug} title="Integrations" subtitle="Connect external services" color="#22c55e">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* ───────── Google Calendar ───────── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(99,102,241,0.12)', color: '#818cf8', display: 'grid', placeItems: 'center', border: '1px solid rgba(99,102,241,0.25)' }}>
              <Calendar size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Google Calendar</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Create Google Meet events with one click from any lead.
              </div>
            </div>
            {g.connected && (
              <span style={{ padding: '4px 10px', background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                ● Connected
              </span>
            )}
          </div>

          {!g.configured && (
            <div style={{ padding: '12px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, color: '#fde68a', fontSize: 13, marginTop: 14 }}>
              Server is missing <code>GOOGLE_CLIENT_SECRET</code>. Set it in the backend <code>.env</code> and restart.
            </div>
          )}

          {!gCalUnlocked && (
            <PlanLockBadge feature="Google Calendar" requiredPlan="Studio" currentPlan={plan.planName || 'Creator'} />
          )}

          {g.connected ? (
            <div style={{ marginTop: 14, padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>{g.email || 'Connected account'}</div>
                {g.connected_at && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Connected {new Date(g.connected_at).toLocaleString()}</div>
                )}
              </div>
              <button onClick={handleDisconnectGoogle} disabled={busy}
                style={{ padding: '9px 16px', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Unlink size={14} /> Disconnect
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <button onClick={() => googleLogin()} disabled={busy || !g.configured || !GOOGLE_CLIENT_ID || !gCalUnlocked}
                style={{ padding: '11px 18px', background: gCalUnlocked ? 'linear-gradient(135deg, #6366f1, #a855f7)' : 'rgba(255,255,255,0.06)', color: gCalUnlocked ? '#fff' : 'var(--text-muted)', border: gCalUnlocked ? 'none' : '1px solid var(--border)', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: (busy || !g.configured || !gCalUnlocked) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: gCalUnlocked ? '0 6px 16px rgba(99,102,241,0.35)' : 'none', opacity: (busy || !g.configured || !gCalUnlocked) ? 0.55 : 1 }}>
                {gCalUnlocked ? <Link size={14} /> : <Lock size={14} />}
                {gCalUnlocked ? 'Connect Google Calendar' : 'Upgrade to unlock'}
              </button>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                You’ll grant the <code>calendar.events</code> scope. We only create events you trigger from the CRM.
              </div>
            </div>
          )}
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* ───────── Calendly ───────── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(34,197,94,0.12)', color: '#34d399', display: 'grid', placeItems: 'center', border: '1px solid rgba(34,197,94,0.25)' }}>
              <Calendar size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Calendly</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Send your Calendly link to leads to let them self-book.
              </div>
            </div>
            {c.configured && (
              <span style={{ padding: '4px 10px', background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                ● Configured
              </span>
            )}
          </div>

          {!calendlyUnlocked && (
            <PlanLockBadge feature="Calendly" requiredPlan="Studio" currentPlan={plan.planName || 'Creator'} />
          )}

          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="url"
              value={calendlyDraft}
              onChange={(e) => setCalendlyDraft(e.target.value)}
              placeholder="https://calendly.com/your-handle/30min"
              disabled={!calendlyUnlocked}
              style={{ flex: 1, minWidth: 240, padding: '11px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', fontSize: 13.5, outline: 'none', opacity: calendlyUnlocked ? 1 : 0.5, cursor: calendlyUnlocked ? 'text' : 'not-allowed' }}
            />
            <button onClick={handleSaveCalendly} disabled={busy || !calendlyUnlocked}
              style={{ padding: '11px 18px', background: calendlyUnlocked ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.06)', color: calendlyUnlocked ? '#fff' : 'var(--text-muted)', border: calendlyUnlocked ? 'none' : '1px solid var(--border)', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: (busy || !calendlyUnlocked) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: calendlyUnlocked ? '0 6px 16px rgba(16,185,129,0.3)' : 'none', opacity: calendlyUnlocked ? 1 : 0.55 }}>
              {calendlyUnlocked ? <Save size={14} /> : <Lock size={14} />}
              {calendlyUnlocked ? (c.configured ? 'Update' : 'Save') : 'Locked'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Find this URL on your Calendly account page. The CRM will offer this link as a one-click “Send Calendly” on every lead.
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ════════════════════════════════════════════════════════════
//  WORKSPACE TAB
// ════════════════════════════════════════════════════════════

const ROLE_INFO = {
  super_admin: { label: 'Super Admin', color: '#f59e0b' },
  admin:       { label: 'Admin',       color: '#6366f1' },
  manager:     { label: 'Manager',     color: '#06b6d4' },
  user:        { label: 'User',        color: '#10b981' },
};

function DataPrivacyTab({ showToast }) {
  const [exporting, setExporting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    auditAPI.getLogs({ limit: 100 }).then(r => setLogs(r.data.logs || [])).catch(() => {}).finally(() => setLoadingLogs(false));
  }, []);

  const doExport = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(workspaceAPI.exportUrl(), { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error('failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `wappflow-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      showToast('Your data export has downloaded');
    } catch { showToast('Export failed — try again', 'error'); } finally { setExporting(false); }
  };

  const fmtAction = (a) => (a || '').replace(/_/g, ' ');
  const fmtWhen = (t) => { try { return new Date(t).toLocaleString(); } catch { return t; } };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionCard icon={Shield} title="Export your data" subtitle="Download everything in this workspace as a portable JSON file — leads, conversations, invoices, contracts, bookings, gallery metadata and the audit trail." color="#0ea5e9">
        <button onClick={doExport} disabled={exporting}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 12, border: 'none', cursor: exporting ? 'default' : 'pointer', background: exporting ? 'var(--surface2)' : 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: exporting ? 'var(--text-dim)' : '#fff', fontSize: 13.5, fontWeight: 700 }}>
          <FileText size={16} /> {exporting ? 'Preparing…' : 'Export all data (JSON)'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 10 }}>Your data is yours. Export anytime — no lock-in.</p>
      </SectionCard>

      <SectionCard icon={Clock} title="Audit log" subtitle="A record of important actions taken in this workspace." color="#8b5cf6">
        {loadingLogs ? (
          <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</p>
        ) : logs.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>No activity recorded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 380, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
            {logs.map((l, i) => (
              <div key={l.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < logs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 9px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--text)', textTransform: 'capitalize', flexShrink: 0 }}>{fmtAction(l.action)}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.entity_type}{l.entity_id ? ` · ${String(l.entity_id).slice(0, 8)}` : ''} {l.user_email ? `— ${l.user_email}` : ''}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-dim)', flexShrink: 0 }}>{fmtWhen(l.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Plan & Billing tab — current plan, live usage, and upgrade options ──────
function PlanBillingTab({ showToast }) {
  const plan = usePlan();
  const q = plan.quota || {};
  const all = plan.allPlans || [];
  const founding = plan.founding || null;
  const curKey = plan.plan;

  // Currency comes from the price row the API returned, never from a default —
  // otherwise this tab quotes one currency while the pricing page quotes another.
  const money = (n, p) => formatMoney(n, p?.currency);
  const fmtReset = (s) => { try { return new Date(String(s).replace(' ', 'T') + 'Z').toLocaleDateString(); } catch { return ''; } };
  const levelColor = (lvl) => lvl === 'reached' ? '#ef4444' : (lvl === 'critical' || lvl === 'warn') ? '#f59e0b' : '#10b981';

  const METRICS = [
    { k: 'leads', label: 'New leads', unit: '' },
    { k: 'users', label: 'Team members', unit: '' },
    { k: 'whatsapp_accounts', label: 'WhatsApp accounts', unit: '' },
    { k: 'storage_gb', label: 'Storage', unit: ' GB' },
    { k: 'contract_sends', label: 'Contract sends', unit: '' },
  ];

  const pill = (c) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, color: c, background: c + '1f', border: `1px solid ${c}55`, borderRadius: 999, padding: '3px 10px', textTransform: 'uppercase', letterSpacing: '0.04em' });
  const usageCard = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' };

  return (
    <div>
      <SectionCard icon={Zap} title="Your Plan" subtitle="Your current plan and what's included" color="#8b5cf6">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)' }}>{plan.planName || '—'}</div>
          {founding && founding.open && <span style={pill('#f59e0b')}>Founding 100 · {founding.remaining} left</span>}
          {plan.isEnterprise && <span style={pill('#10b981')}>Unlimited</span>}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '10px 0 0' }}>
          Limits apply per workspace and reset monthly where noted. Need a change? Contact us to upgrade or for a custom Enterprise plan.
        </p>
      </SectionCard>

      <SectionCard icon={RefreshCw} title="Usage" subtitle="Used, remaining, and reset date for this billing period" color="#6366f1">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
          {METRICS.map(m => {
            const u = q[m.k] || { used: 0, limit: -1, level: 'unlimited', pct: 0, remaining: -1, reset_date: null, monthly: false };
            const unlimited = u.limit === -1;
            return (
              <div key={m.k} style={usageCard}>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 700 }}>{m.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
                  {u.used}{m.unit}{' '}
                  <span style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 600 }}>/ {unlimited ? '∞' : `${u.limit}${m.unit}`}</span>
                </div>
                {!unlimited && (
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--surface)', marginTop: 9, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: Math.min(100, u.pct) + '%', background: levelColor(u.level), transition: 'width .3s' }} />
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: u.level === 'reached' ? '#ef4444' : 'var(--text-dim)', marginTop: 7 }}>
                  {unlimited ? 'Unlimited' : `${u.remaining}${m.unit} remaining`}
                  {u.monthly && u.reset_date ? ` · resets ${fmtReset(u.reset_date)}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard icon={Sparkles} title="Plans" subtitle="Compare and upgrade — Studio is our most popular" color="#10b981">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          {all.map(p => {
            const isCur = p.key === curKey;
            const featured = p.key === 'studio';
            return (
              <div key={p.key} style={{
                position: 'relative', border: `1.5px solid ${isCur ? '#8b5cf6' : featured ? 'rgba(139,92,246,0.45)' : 'var(--border)'}`,
                borderRadius: 14, padding: '16px 16px', background: featured ? 'rgba(139,92,246,0.06)' : 'var(--surface2)',
              }}>
                {featured && <div style={{ ...pill('#8b5cf6'), position: 'absolute', top: -10, left: 14 }}>Most popular</div>}
                <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)', marginTop: featured ? 4 : 0 }}>{p.name}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', marginTop: 6 }}>
                  {p.price != null ? money(p.price, p) : 'Custom'}
                  {p.price != null && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>/mo</span>}
                </div>
                {p.founding_price != null && founding?.open && (
                  <div style={{ fontSize: 12, color: '#d97706', marginTop: 2, fontWeight: 600 }}>Founding 100: {money(p.founding_price, p)}/mo</div>
                )}
                {isCur ? (
                  <div style={{ marginTop: 12, padding: '8px', textAlign: 'center', borderRadius: 9, background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 12.5, fontWeight: 700, border: '1px solid var(--border)' }}>✓ Current plan</div>
                ) : (
                  <button
                    onClick={() => {
                      if (p.key === 'enterprise') { window.location.href = 'mailto:sales@wappflow.app'; return; }
                      showToast?.(`Contact us to switch to ${p.name}. Self-serve checkout is coming soon.`, 'info');
                    }}
                    style={{ marginTop: 12, width: '100%', padding: '9px', borderRadius: 9, border: featured ? 'none' : '1.5px solid var(--border)', background: featured ? 'linear-gradient(135deg,#8b5cf6,#6366f1)' : 'var(--surface)', color: featured ? '#fff' : 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {p.key === 'enterprise' ? 'Talk to sales' : `Upgrade to ${p.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

function WorkspaceTab({ showToast, router }) {
  const [workspace, setWorkspace] = useState(null);
  const [members, setMembers] = useState([]);
  const [currentRole, setCurrentRole] = useState('super_admin');
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [wsName, setWsName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    workspaceAPI.get().then(res => {
      setWorkspace(res.data.workspace);
      setWsName(res.data.workspace?.name || '');
      setMembers(res.data.members || []);
      setCurrentRole(res.data.currentUserRole || 'super_admin');
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSaveName = async () => {
    if (!wsName.trim()) return;
    setSaving(true);
    try {
      await workspaceAPI.update({ name: wsName });
      setWorkspace(prev => ({ ...prev, name: wsName }));
      // Update localStorage
      const ws = JSON.parse(localStorage.getItem('workspace') || '{}');
      localStorage.setItem('workspace', JSON.stringify({ ...ws, name: wsName }));
      setEditingName(false);
      showToast('Workspace name updated!');
    } catch { showToast('Error updating name', 'error'); } finally { setSaving(false); }
  };

  if (loading) return <div style={{ color: 'var(--text-dim)', padding: 40, textAlign: 'center' }}>Loading workspace...</div>;

  const canEdit = ['super_admin', 'admin'].includes(currentRole);
  const myInfo = ROLE_INFO[currentRole] || ROLE_INFO.user;

  return (
    <div>
      {/* Current role banner */}
      <SectionCard icon={Shield} title="Your Role" subtitle="Your access level in this workspace" color={myInfo.color}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: myInfo.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={24} color={myInfo.color} />
          </div>
          <div>
            <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', margin: '0 0 2px' }}>{myInfo.label}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              {currentRole === 'super_admin' && 'Full access to everything — workspace creator'}
              {currentRole === 'admin' && 'Manage team, leads, settings, reports & invoices'}
              {currentRole === 'manager' && 'Manage leads & reports · No team or global settings'}
              {currentRole === 'user' && 'Access assigned leads only'}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Workspace name */}
      <SectionCard icon={Settings} title="Workspace Settings" subtitle="General workspace configuration" color="#6366f1">
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 8 }}>Workspace Name</label>
          {editingName ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input aria-label="Workspace Name" value={wsName} onChange={e => setWsName(e.target.value)} autoFocus
                style={{ flex: 1, padding: '11px 14px', border: '1.5px solid #6366f1', borderRadius: 11, fontSize: 14, outline: 'none', color: 'var(--text)', boxSizing: 'border-box' }}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
              />
              <button onClick={handleSaveName} disabled={saving} style={{ padding: '11px 18px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditingName(false)} style={{ padding: '11px 14px', borderRadius: 11, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{workspace?.name}</p>
              {canEdit && (
                <button onClick={() => setEditingName(true)} style={{ padding: '6px 12px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Edit2 size={12} /> Edit
                </button>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Members quick view */}
      <SectionCard icon={Users} title="Team Members" subtitle={`${members.length} member${members.length !== 1 ? 's' : ''} in this workspace`} color="#8b5cf6">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {members.slice(0, 5).map(m => {
            const ri = ROLE_INFO[m.role] || ROLE_INFO.user;
            const name = m.full_name || m.name || m.email || m.invite_email || 'Unknown';
            const email = m.email || m.invite_email || '';
            const isPending = m.invite_status === 'pending';
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: isPending ? 'var(--surface2)' : ri.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: ri.color, flexShrink: 0 }}>
                  {isPending ? <Clock size={14} color="#9ca3af" /> : name[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{name} {isPending && <span style={{ fontSize: 11, color: '#f97316', fontWeight: 600 }}>(pending)</span>}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{email}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: ri.color + '18', color: ri.color, flexShrink: 0 }}>{ri.label}</span>
              </div>
            );
          })}
          {members.length > 5 && <p style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', margin: 0 }}>+{members.length - 5} more members</p>}
        </div>
        <button onClick={() => router.push('/team')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 12, border: '1.5px solid #6366f1', background: 'rgba(99,102,241,0.12)', color: '#6366f1', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          <Users size={15} /> Manage Team & Permissions →
        </button>
      </SectionCard>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//  CHANGE PASSWORD TAB
// ════════════════════════════════════════════════════════════

function PasswordTab({ showToast }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.new_password.length < 6) { showToast('New password must be at least 6 characters', 'error'); return; }
    if (form.new_password !== form.confirm_password) { showToast('New passwords do not match', 'error'); return; }
    setSaving(true);
    try {
      await authAPI.changePassword({ current_password: form.current_password, new_password: form.new_password });
      showToast('Password changed successfully!');
      setForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to change password', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>Change Password</h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28 }}>
        Update your account password. You'll need your current password to confirm.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Field label="Current Password" required>
          <div style={{ position: 'relative' }}>
            <UIInput
              type={showCurrent ? 'text' : 'password'}
              value={form.current_password}
              onChange={e => setForm(f => ({ ...f, current_password: e.target.value }))}
              placeholder="Enter current password"
              required
              style={{ paddingRight: 44 }}
            />
            <button type="button" onClick={() => setShowCurrent(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <div>
          <Field label="New Password" required>
            <div style={{ position: 'relative' }}>
              <UIInput
                type={showNew ? 'text' : 'password'}
                value={form.new_password}
                onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
                placeholder="At least 6 characters"
                required
                style={{ paddingRight: 44 }}
              />
              <button type="button" onClick={() => setShowNew(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          {form.new_password.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: form.new_password.length >= [6, 8, 10, 12][i] ? ['#ef4444','#f97316','#f59e0b','#10b981'][i] : 'var(--border)', transition: 'background 0.2s' }} />
              ))}
              <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4, whiteSpace: 'nowrap' }}>
                {form.new_password.length < 6 ? 'Too short' : form.new_password.length < 8 ? 'Weak' : form.new_password.length < 10 ? 'Fair' : form.new_password.length < 12 ? 'Good' : 'Strong'}
              </span>
            </div>
          )}
        </div>

        <div>
          <Field
            label="Confirm New Password"
            required
            error={form.confirm_password && form.confirm_password !== form.new_password ? 'Passwords do not match' : null}
          >
            <UIInput
              type="password"
              value={form.confirm_password}
              onChange={e => setForm(f => ({ ...f, confirm_password: e.target.value }))}
              placeholder="Repeat new password"
              required
            />
          </Field>
          {form.confirm_password && form.confirm_password === form.new_password && form.new_password.length >= 6 && (
            <p style={{ fontSize: 12, color: '#10b981', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle size={12} /> Passwords match
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving || !form.current_password || !form.new_password || form.new_password !== form.confirm_password}
          style={{ padding: '12px 28px', background: saving || !form.current_password || !form.new_password || form.new_password !== form.confirm_password ? 'var(--border)' : 'linear-gradient(135deg, #6366f1, #4f46e5)', color: saving || !form.current_password || !form.new_password || form.new_password !== form.confirm_password ? 'var(--text-muted)' : 'white', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', transition: 'all 0.2s' }}>
          <Lock size={15} />
          {saving ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  CONNECTIONS TAB
// ════════════════════════════════════════════════════════════

const PLATFORM_DEFS = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    color: '#25d366',
    icon: MessageCircle,
    description: 'Every incoming WhatsApp message automatically becomes a lead.',
    type: 'qr',
    instructions: [
      { step: 1, text: 'Make sure your WappFlow server is running and accessible.' },
      { step: 2, text: 'Click "Connect" below to generate a QR code.' },
      { step: 3, text: 'Open WhatsApp on your phone → tap ⋮ (three dots) or Settings → Linked Devices → Link a Device.' },
      { step: 4, text: 'Scan the QR code shown on screen. Once scanned, your account will connect in seconds.' },
      { step: 5, text: 'All new WhatsApp messages will automatically create leads in WappFlow.' },
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    color: '#e1306c',
    icon: Camera,
    description: 'Receive Instagram DMs as leads via the Meta Messenger API.',
    type: 'meta',
    fields: [
      { key: 'app_id',       label: 'App ID',             placeholder: 'Meta App ID', hint: 'From Meta Developer Console → App ID' },
      { key: 'app_secret',   label: 'App Secret',         placeholder: 'Meta App Secret', secret: true },
      { key: 'access_token', label: 'Page Access Token',  placeholder: 'Long-lived page token', secret: true, hint: 'Generate from Meta Business Suite → System Users' },
      { key: 'page_id',      label: 'Instagram Account ID', placeholder: 'e.g. 17841400000000000' },
    ],
    instructions: [
      { step: 1, text: 'Go to developers.facebook.com and create a new App (type: Business).' },
      { step: 2, text: 'Add the "Instagram" product to your app from the left sidebar.' },
      { step: 3, text: 'Your App ID is shown at the top of Settings → Basic. App Secret is right below it (click "Show").' },
      { step: 4, text: 'In Business Manager (business.facebook.com) → System Users → Create a System User. Then click "Add Assets" and grant your Instagram page. Generate a token with instagram_basic, instagram_manage_messages, and pages_messaging permissions.' },
      { step: 5, text: 'Your Instagram Account ID can be found in the Instagram app: Profile → Edit Profile → scroll down, or use the Graph API: GET /me?fields=id&access_token=YOUR_TOKEN.' },
      { step: 6, text: 'In your Meta App → Instagram → Webhooks → click "Configure". Use the Callback URL and Verify Token shown below. Subscribe to the "messages" field.' },
      { step: 7, text: 'Save your credentials here. You can save with partial credentials — come back later to complete the setup.' },
    ],
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877f2',
    icon: MonitorSmartphone,
    description: 'Receive Facebook Messenger conversations as leads.',
    type: 'meta',
    fields: [
      { key: 'app_id',       label: 'App ID',             placeholder: 'Meta App ID', hint: 'From Meta Developer Console → App ID' },
      { key: 'app_secret',   label: 'App Secret',         placeholder: 'Meta App Secret', secret: true },
      { key: 'access_token', label: 'Page Access Token',  placeholder: 'Long-lived page token', secret: true },
      { key: 'page_id',      label: 'Facebook Page ID',   placeholder: 'e.g. 123456789' },
    ],
    instructions: [
      { step: 1, text: 'Go to developers.facebook.com and create a new App (type: Business).' },
      { step: 2, text: 'Add the "Messenger" product to your app from the left sidebar.' },
      { step: 3, text: 'Your App ID is shown at the top of Settings → Basic. App Secret is right below it (click "Show").' },
      { step: 4, text: 'In Messenger API Settings → Generate Token, select your Facebook Page and copy the Page Access Token.' },
      { step: 5, text: 'Your Facebook Page ID can be found on your Page → About section, or in the URL when viewing your page in Business Manager.' },
      { step: 6, text: 'In your Meta App → Messenger → Webhooks → Edit Callback URL. Use the Callback URL and Verify Token shown below. Subscribe to "messages" and "messaging_postbacks".' },
      { step: 7, text: 'Save your credentials here. You can save with partial credentials — come back later to complete the setup.' },
    ],
  },
  {
    id: 'website',
    label: 'Website',
    color: '#6366f1',
    icon: GlobeIcon,
    description: 'Capture leads from your website via embed widget, webhook, or Formspree.',
    type: 'widget',
    instructions: {
      widget: [
        { step: 1, text: 'Copy the embed code shown below.' },
        { step: 2, text: 'Paste it just before the closing </body> tag on every page where you want the widget.' },
        { step: 3, text: 'A floating "Contact Us" button will appear in the bottom-right corner of your website.' },
        { step: 4, text: 'When visitors submit the form, a new lead instantly appears in WappFlow.' },
        { step: 5, text: 'Customize the button color and title using data-color and data-title attributes.' },
      ],
      webhook: [
        { step: 1, text: 'Copy the Webhook URL shown below.' },
        { step: 2, text: 'In your website\'s form POST handler, send a JSON request to that URL.' },
        { step: 3, text: 'Required JSON fields: name (string), phone (string). Optional: email, message.' },
        { step: 4, text: 'Example: fetch(WEBHOOK_URL, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name, phone, email, message }) })' },
        { step: 5, text: 'No authentication needed — the unique token in the URL authenticates the submission.' },
      ],
      formspree: [
        { step: 1, text: 'Create an account at formspree.io and create a new form on your website.' },
        { step: 2, text: 'In Formspree dashboard → your form → Integrations → Webhooks → "Add a webhook".' },
        { step: 3, text: 'Paste the Webhook URL shown below as the webhook destination. Select "JSON" format.' },
        { step: 4, text: 'Formspree will forward every form submission to WappFlow. Make sure your Formspree form has a "name" or "full_name" field and optionally "phone", "email", "message".' },
        { step: 5, text: 'Test by submitting your Formspree form — the lead should appear in WappFlow within seconds.' },
      ],
    },
  },
];

function ConnectionsTab({ showToast }) {
  const confirm = useConfirm();
  const plan = usePlan();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePlatform, setActivePlatform] = useState('whatsapp');
  const [editingAccount, setEditingAccount] = useState(null);
  const [creating, setCreating] = useState(false);

  // Plan-derived limits for each platform.
  // A platform is "locked" if the limit is 0 (Free/Starter for IG/FB/Web).
  const platformLimit = (pid) => plan.limits[`${pid === 'website' ? 'website_forms' : pid + '_accounts'}`];
  const platformLocked = (pid) => {
    const l = platformLimit(pid);
    return l === 0;
  };
  const platformAtLimit = (pid) => {
    const l = platformLimit(pid);
    if (l === -1 || l == null) return false;
    const used = accounts.filter(a => a.platform === pid).length;
    return used >= l;
  };

  useEffect(() => { loadAccounts(); }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await platformAccountsAPI.getAll();
      setAccounts(res.data.accounts || []);
    } catch {} finally { setLoading(false); }
  };

  const handleAddAccount = async (platform) => {
    setCreating(true);
    try {
      const existing = accounts.filter(a => a.platform === platform);
      if (existing.length >= 5) { showToast('Maximum 5 accounts per platform', 'error'); return; }
      const res = await platformAccountsAPI.create({ platform, account_name: `Account ${existing.length + 1}`, slot_index: existing.length });
      setAccounts(prev => [...prev, res.data.account]);
      setEditingAccount(res.data.account.id);
      showToast('Account slot created');
    } catch (e) { showToast(e.response?.data?.error || 'Failed to create account', 'error'); } finally { setCreating(false); }
  };

  const handleSaveAccount = async (id, data) => {
    try {
      const res = await platformAccountsAPI.update(id, data);
      setAccounts(prev => prev.map(a => a.id === id ? res.data.account : a));
      setEditingAccount(null);
      showToast('Account saved');
    } catch (e) { showToast(e.response?.data?.error || 'Failed to save', 'error'); }
  };

  const handleDeleteAccount = async (id) => {
    const ok = await confirm({
      title: 'Disconnect this account?',
      message: 'You will lose the channel\'s session. New messages won\'t flow into the CRM until you reconnect.',
      confirmLabel: 'Disconnect',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await platformAccountsAPI.delete(id);
      setAccounts(prev => prev.filter(a => a.id !== id));
      if (editingAccount === id) setEditingAccount(null);
      showToast('Account removed');
    } catch { showToast('Failed to delete', 'error'); }
  };

  const platformAccounts = accounts.filter(a => a.platform === activePlatform);
  const activeDef = PLATFORM_DEFS.find(p => p.id === activePlatform);

  return (
    <div>
      {/* Platform tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {PLATFORM_DEFS.map(p => {
          const Icon = p.icon;
          const count = accounts.filter(a => a.platform === p.id && a.status === 'connected').length;
          const active = activePlatform === p.id;
          const locked = platformLocked(p.id);
          return (
            <button key={p.id} onClick={() => setActivePlatform(p.id)} style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '10px 18px',
              borderRadius: 12, border: `2px solid ${active ? p.color : 'var(--border)'}`,
              background: active ? p.color + '12' : 'var(--surface)',
              color: active ? p.color : 'var(--text-muted)',
              fontWeight: active ? 700 : 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
              opacity: locked ? 0.6 : 1,
              position: 'relative',
            }}>
              <Icon size={15} />
              {p.label}
              {count > 0 && !locked && (
                <span style={{ fontSize: 10, background: p.color, color: 'white', padding: '1px 6px', borderRadius: 8, fontWeight: 800 }}>{count}</span>
              )}
              {locked && <LockBadge requiredPlan="Studio" size="sm" />}
            </button>
          );
        })}
      </div>

      {/* Platform section */}
      {activeDef && platformLocked(activeDef.id) ? (
        <LockedOverlay
          feature={`${activeDef.label} integration`}
          requiredPlan="Studio"
          currentPlan={plan.planName || 'Creator'}
          description={`${activeDef.label} is a multi-channel feature available on the Studio plan and above. Unify all your customer conversations in one inbox.`}
          perks={[
            'Unified inbox across WhatsApp + IG + FB + Website',
            'Auto-create leads from every channel',
            'AI-scored across all platforms',
            'Multi-account per platform',
          ]}
        />
      ) : activeDef && (
        <SectionCard icon={activeDef.icon} title={`${activeDef.label} Connections`} subtitle={activeDef.description} color={activeDef.color}>
          {/* Plan usage indicator (shown for limited plans) */}
          {(() => {
            const limit = platformLimit(activeDef.id);
            if (limit === -1 || limit == null) return null;
            const used = platformAccounts.length;
            const atLimit = used >= limit;
            return (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: atLimit ? 'rgba(245,158,11,0.08)' : 'rgba(99,102,241,0.06)', border: `1px solid ${atLimit ? 'rgba(245,158,11,0.3)' : 'rgba(99,102,241,0.25)'}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: atLimit ? '#fde68a' : 'var(--text-dim)', fontWeight: 600 }}>
                  {atLimit ? '⚠ ' : ''}You&apos;ve used <strong style={{ color: 'var(--text)' }}>{used} of {limit}</strong> {activeDef.label} account{limit === 1 ? '' : 's'} on the {plan.planName || 'Creator'} plan.
                </div>
                {atLimit && plan.plan !== 'enterprise' && (
                  <UpgradeCta planName={nextPlanLabel(plan.plan)} size="sm" label="Upgrade for more" />
                )}
              </div>
            );
          })()}

          {loading ? (
            <div style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Loading accounts...</div>
          ) : platformAccounts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: activeDef.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <activeDef.icon size={26} color={activeDef.color} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No {activeDef.label} accounts yet</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                {activeDef.id === 'whatsapp' ? `Link up to ${platformLimit(activeDef.id) === -1 ? '5' : platformLimit(activeDef.id)} WhatsApp number${platformLimit(activeDef.id) === 1 ? '' : 's'}. Each gets its own QR code.` : `Add up to ${platformLimit(activeDef.id)} accounts to capture leads from ${activeDef.label}`}
              </p>
              <button onClick={() => handleAddAccount(activeDef.id)} disabled={creating || platformAtLimit(activeDef.id)} style={{ padding: '10px 22px', background: platformAtLimit(activeDef.id) ? 'rgba(255,255,255,0.06)' : activeDef.color, color: platformAtLimit(activeDef.id) ? 'var(--text-muted)' : 'white', border: platformAtLimit(activeDef.id) ? '1px solid var(--border)' : 'none', borderRadius: 11, fontWeight: 700, fontSize: 13, cursor: platformAtLimit(activeDef.id) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                {platformAtLimit(activeDef.id) ? <Lock size={14} /> : <Plus size={14} />}
                {platformAtLimit(activeDef.id) ? 'Plan limit reached' : `Add ${activeDef.label} Account`}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {platformAccounts.map(account => (
                activeDef.id === 'whatsapp'
                  ? <WhatsAppAccountCard key={account.id} account={account} showToast={showToast} onDelete={() => handleDeleteAccount(account.id)} onNameSave={(name) => handleSaveAccount(account.id, { account_name: name })} />
                  : <PlatformAccountCard
                      key={account.id}
                      account={account}
                      def={activeDef}
                      isEditing={editingAccount === account.id}
                      onEdit={() => setEditingAccount(account.id)}
                      onCancel={() => setEditingAccount(null)}
                      onSave={(data) => handleSaveAccount(account.id, data)}
                      onDelete={() => handleDeleteAccount(account.id)}
                      showToast={showToast}
                    />
              ))}
              {(() => {
                const limit = platformLimit(activeDef.id);
                const atLimit = limit !== -1 && limit != null && platformAccounts.length >= limit;
                if (atLimit) {
                  return (
                    <div style={{ padding: '14px 18px', border: '2px dashed rgba(245,158,11,0.35)', borderRadius: 12, background: 'rgba(245,158,11,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: '#fde68a', fontWeight: 600 }}>
                        <Lock size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
                        Plan limit — you can add up to {limit} {activeDef.label} account{limit === 1 ? '' : 's'} on {plan.planName}.
                      </span>
                      {plan.plan !== 'enterprise' && <UpgradeCta planName={nextPlanLabel(plan.plan)} size="sm" />}
                    </div>
                  );
                }
                return platformAccounts.length < 5 ? (
                  <button onClick={() => handleAddAccount(activeDef.id)} disabled={creating} style={{ padding: '10px', border: `2px dashed ${activeDef.color}40`, borderRadius: 12, background: 'transparent', color: activeDef.color, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all 0.15s' }}>
                    <Plus size={14} /> Add Another Account ({platformAccounts.length}/{limit === -1 ? '5' : limit})
                  </button>
                ) : null;
              })()}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}

function WhatsAppAccountCard({ account, showToast, onDelete, onNameSave }) {
  const [status, setStatus] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(account.account_name);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    let lastQR = null;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/whatsapp/accounts/${account.id}/status`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const data = await res.json();
        // Only update state if something meaningful changed (avoid re-rendering the large QR image every 3s)
        setStatus(prev => {
          if (prev?.status === data.status && prev?.isReady === data.isReady && prev?.qrCode === data.qrCode) return prev;
          return data;
        });
      } catch {}
    };
    fetchStatus();
    // Poll slower (5s) — QR refreshes every ~20s so 5s is more than enough
    const iv = setInterval(fetchStatus, 5000);
    return () => clearInterval(iv);
  }, [account.id]);

  const handleReconnect = async (force = false) => {
    setReconnecting(true);
    try {
      const token = localStorage.getItem('token');
      const url = `${BASE_URL}/api/whatsapp/accounts/${account.id}/connect${force ? '?force=true' : ''}`;
      await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch {} finally { setReconnecting(false); }
  };

  const handleDisconnect = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${BASE_URL}/api/whatsapp/accounts/${account.id}/disconnect`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch {}
  };

  const handleSaveName = async () => {
    if (!nameVal.trim()) return;
    setSavingName(true);
    try {
      await onNameSave(nameVal.trim());
      setEditingName(false);
    } catch {} finally { setSavingName(false); }
  };

  const isConnected = status?.isReady;
  const isError = !status || ['disconnected', 'error', 'auth_failed', 'not_initialized', 'reconnect_failed'].includes(status?.status);
  const isInitializing = status?.status === 'initializing';
  const isQR = status?.qrCode || status?.status === 'qr_ready';
  // Stuck-init detector: if init has been running >40s with no QR yet, give user a manual reset option
  const isStuckInit = isInitializing && (status?.initAgeSeconds || 0) > 40;

  return (
    <div style={{ border: `1.5px solid ${isConnected ? '#10b98130' : 'var(--border)'}`, borderRadius: 16, overflow: 'hidden', background: isConnected ? 'rgba(16,185,129,0.10)' : 'var(--surface2)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: isConnected ? '#10b98120' : 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isConnected ? <Wifi size={18} color="#10b981" /> : isError ? <WifiOff size={18} color="#ef4444" /> : <RefreshCw size={18} color="#f59e0b" style={{ animation: 'spin 1.5s linear infinite' }} />}
          </div>
          <div>
            {editingName ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input value={nameVal} onChange={e => setNameVal(e.target.value)} autoFocus
                  style={{ padding: '5px 10px', border: '1.5px solid #25d366', borderRadius: 8, fontSize: 13, outline: 'none', color: 'var(--text)', background: 'var(--surface)', width: 160 }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                />
                <button onClick={handleSaveName} disabled={savingName} style={{ padding: '5px 10px', background: '#25d366', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {savingName ? '...' : 'Save'}
                </button>
                <button onClick={() => setEditingName(false)} style={{ padding: '5px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{account.account_name}</p>
                <button aria-label="Edit" onClick={() => setEditingName(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}><Edit2 size={12} /></button>
              </div>
            )}
            <p style={{ fontSize: 12, color: isConnected ? '#10b981' : isError ? '#ef4444' : '#f59e0b', margin: 0, fontWeight: 600 }}>
              {isConnected ? `Connected — +${status.phoneNumber}`
                : isError ? 'Disconnected'
                : isQR ? 'Waiting for you to scan the QR'
                : isStuckInit ? `Taking longer than usual (${status.initAgeSeconds}s)`
                : 'Connecting…'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Disconnected/errored → "Connect" (force=true since there's nothing running) */}
          {isError && (
            <button onClick={() => handleReconnect(true)} disabled={reconnecting} style={{ padding: '7px 14px', background: '#25d366', color: 'white', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={13} style={reconnecting ? { animation: 'spin 1s linear infinite' } : {}} />
              {reconnecting ? 'Connecting…' : 'Connect'}
            </button>
          )}
          {/* QR is showing → "Refresh QR" (force=true tears down + regenerates) */}
          {isQR && (
            <button onClick={() => handleReconnect(true)} disabled={reconnecting} style={{ padding: '7px 14px', background: 'transparent', border: '1.5px solid #25d366', color: '#25d366', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={13} style={reconnecting ? { animation: 'spin 1s linear infinite' } : {}} />
              {reconnecting ? 'Refreshing…' : 'Refresh QR'}
            </button>
          )}
          {/* Stuck initializing → offer a reset (force kills any zombie Chrome and starts fresh) */}
          {isStuckInit && (
            <button onClick={() => handleReconnect(true)} disabled={reconnecting} style={{ padding: '7px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={13} style={reconnecting ? { animation: 'spin 1s linear infinite' } : {}} />
              Reset
            </button>
          )}
          {isConnected && (
            <button onClick={handleDisconnect} style={{ padding: '7px 14px', background: 'transparent', border: '1.5px solid #ef4444', color: '#ef4444', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              Disconnect
            </button>
          )}
          <button aria-label="Delete" onClick={onDelete} style={{ padding: '7px 10px', background: 'transparent', border: '1.5px solid #ef444430', color: '#ef4444', borderRadius: 9, fontSize: 12, cursor: 'pointer', display: 'flex' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* QR Code */}
      {isQR && (
        <div style={{ textAlign: 'center', padding: '16px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          {status?.qrCode ? (
            /* Inner box stays white so the QR code can be scanned reliably */
            <div style={{ display: 'inline-block', padding: 10, background: '#ffffff', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.10)', marginBottom: 10 }}>
              <img src={status.qrCode} alt="WhatsApp QR" style={{ width: 180, height: 180, display: 'block' }} />
            </div>
          ) : (
            <div style={{ width: 180, height: 180, background: 'var(--surface2)', borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <RefreshCw size={28} color="#25d366" style={{ animation: 'spin 1.5s linear infinite' }} />
            </div>
          )}
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Scan with WhatsApp → Linked Devices → Link a Device</p>
        </div>
      )}

      {/* Connected features */}
      {isConnected && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
          {[
            { label: 'Auto Lead Capture', desc: 'Every message creates a lead' },
            { label: 'Real-time Sync', desc: 'Instant delivery' },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle size={13} color="#10b981" />
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{f.label}</p>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Setup guide */}
      <details style={{ borderTop: '1px solid var(--border)' }}>
        <summary style={{ fontSize: 12, fontWeight: 700, color: '#25d366', cursor: 'pointer', userSelect: 'none', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 6 }}>
          📖 How to connect WhatsApp
        </summary>
        <div style={{ padding: '0 18px 14px' }}>
          {[
            'Open WhatsApp on your phone.',
            'Tap ⋮ (Android) or Settings (iPhone) → Linked Devices → Link a Device.',
            'Point your camera at the QR code shown above.',
            'Once scanned, this account connects automatically.',
            'All incoming messages create leads in WappFlow in real-time.',
          ].map((text, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#25d36620', color: '#25d366', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{text}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function PlatformAccountCard({ account, def, isEditing, onEdit, onCancel, onSave, onDelete, showToast }) {
  const [form, setForm] = useState({ account_name: account.account_name, website_type: account.credentials?.website_type || 'widget', ...(account.credentials || {}) });
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState({});
  const [copied, setCopied] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);

  const credKeys = def.fields?.map(f => f.key) || [];
  const filledKeys = credKeys.filter(k => account.credentials?.[k]);
  const isConnected = def.type === 'widget' || (filledKeys.length === credKeys.length && credKeys.length > 0);
  const isPartial = !isConnected && filledKeys.length > 0;

  const webhookUrl = `${BASE_URL}/api/webhooks/${def.id}`;
  const verifyToken = account.webhook_verify_token || '';
  const widgetToken = account.webhook_verify_token || '';
  const frontendUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const widgetSnippet = `<script src="${frontendUrl}/widget.js" data-form="${widgetToken}" data-api="${BASE_URL}" data-title="${account.account_name}"></script>`;

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const { account_name, ...credFields } = form;
    await onSave({ account_name, credentials: credFields });
    setSaving(false);
  };

  return (
    <div style={{ border: `1.5px solid ${isEditing ? def.color + '50' : 'var(--border)'}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: isEditing ? def.color + '08' : 'transparent' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: def.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <def.icon size={17} color={def.color} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{account.account_name}</p>
          <p style={{ fontSize: 11, color: isConnected ? '#10b981' : isPartial ? '#f59e0b' : 'var(--text-muted)', margin: 0, fontWeight: isConnected || isPartial ? 600 : 400 }}>
            {def.type === 'widget' ? 'Embed form ready' : isConnected ? 'Connected' : isPartial ? `Partial setup (${filledKeys.length}/${credKeys.length} fields)` : 'Credentials required'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isEditing && (
            <button onClick={onEdit} style={{ padding: '6px 12px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Edit2 size={12} /> Edit
            </button>
          )}
          <button aria-label="Delete" onClick={onDelete} style={{ padding: '6px 10px', borderRadius: 9, border: '1.5px solid #ef444430', background: 'transparent', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Instructions accordion */}
      {def.instructions && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowInstructions(s => !s)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 12, fontWeight: 700 }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Info size={13} /> Setup Guide
            </span>
            <ChevronRight size={13} style={{ transform: showInstructions ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          {showInstructions && (
            <div style={{ padding: '0 18px 14px', background: 'rgba(99,102,241,0.04)' }}>
              {(Array.isArray(def.instructions) ? def.instructions : (def.instructions[form.website_type || 'widget'] || def.instructions.widget)).map(item => (
                <div key={item.step} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#6366f1', color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{item.step}</span>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>{item.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {isEditing && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>
          <div style={{ marginTop: 16, marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Account Name</label>
            <input value={form.account_name || ''} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))} placeholder="e.g. Main Business Account"
              style={{ width: '100%', padding: '10px 13px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }}
            />
          </div>

          {/* Website type selector */}
          {def.id === 'website' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>Integration Type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { value: 'widget', label: '🔲 Embed Widget', desc: 'Floating form button' },
                  { value: 'webhook', label: '🔗 Custom Webhook', desc: 'Your own form' },
                  { value: 'formspree', label: '📋 Formspree', desc: 'Forward from Formspree' },
                ].map(opt => (
                  <button key={opt.value} type="button" onClick={() => setForm(f => ({ ...f, website_type: opt.value }))}
                    style={{ flex: 1, padding: '10px 8px', borderRadius: 10, border: `2px solid ${form.website_type === opt.value ? def.color : 'var(--border)'}`, background: form.website_type === opt.value ? def.color + '10' : 'var(--surface2)', cursor: 'pointer', textAlign: 'center' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: form.website_type === opt.value ? def.color : 'var(--text)', margin: '0 0 2px' }}>{opt.label}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Credential fields for meta platforms */}
          {def.fields?.map(field => (
            <div key={field.key} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>{field.label}</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={field.secret && !showSecrets[field.key] ? 'password' : 'text'}
                  value={form[field.key] || ''}
                  onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  style={{ width: '100%', padding: `10px ${field.secret ? '40px' : '13px'} 10px 13px`, border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }}
                />
                {field.secret && (
                  <button type="button" onClick={() => setShowSecrets(p => ({ ...p, [field.key]: !p[field.key] }))} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    {showSecrets[field.key] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
              {field.hint && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{field.hint}</p>}
            </div>
          ))}

          {/* Webhook info for meta platforms */}
          {def.type === 'meta' && (
            <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Meta Webhook Configuration</p>
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 6px', fontWeight: 600 }}>CALLBACK URL</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{ flex: 1, fontSize: 11, background: 'var(--surface)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{webhookUrl}</code>
                  <button onClick={() => handleCopy(webhookUrl, 'webhook')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 11, color: copied === 'webhook' ? '#10b981' : 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Copy size={11} /> {copied === 'webhook' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 6px', fontWeight: 600 }}>VERIFY TOKEN</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{ flex: 1, fontSize: 11, background: 'var(--surface)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{verifyToken}</code>
                  <button onClick={() => handleCopy(verifyToken, 'verify')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 11, color: copied === 'verify' ? '#10b981' : 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Copy size={11} /> {copied === 'verify' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
                Add these in your Meta App Dashboard → Webhooks. Subscribe to <strong>messages</strong> and <strong>messaging_postbacks</strong> events.
              </p>
            </div>
          )}

          {/* Widget snippet for website */}
          {def.type === 'widget' && (
            <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
              {(form.website_type || 'widget') === 'widget' && (
                <>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Embed Code</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Paste this snippet just before the <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>&lt;/body&gt;</code> tag:</p>
                  <div style={{ position: 'relative' }}>
                    <code style={{ display: 'block', fontSize: 11, background: 'var(--surface)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--text)', wordBreak: 'break-all', lineHeight: 1.6 }}>
                      {widgetSnippet}
                    </code>
                    <button onClick={() => handleCopy(widgetSnippet, 'widget')} style={{ position: 'absolute', top: 8, right: 8, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 11, color: copied === 'widget' ? '#10b981' : 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Copy size={11} /> {copied === 'widget' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 0' }}>Form submissions will appear as leads from <strong>Website</strong> in your CRM.</p>
                </>
              )}
              {((form.website_type || 'widget') === 'webhook' || (form.website_type || 'widget') === 'formspree') && (
                <>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Webhook URL</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    {(form.website_type || 'widget') === 'formspree' ? 'Add this URL as a webhook in your Formspree form settings:' : 'POST form submissions as JSON to this URL:'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                    <code style={{ flex: 1, fontSize: 11, background: 'var(--surface)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`${BASE_URL}/api/website-form/${widgetToken}/submit`}</code>
                    <button onClick={() => handleCopy(`${BASE_URL}/api/website-form/${widgetToken}/submit`, 'whook')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 11, color: copied === 'whook' ? '#10b981' : 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Copy size={11} /> {copied === 'whook' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  {(form.website_type || 'widget') === 'webhook' && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>POST JSON with: <code style={{ background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>name</code>, <code style={{ background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>phone</code>, <code style={{ background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>email</code>, <code style={{ background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>message</code></p>
                  )}
                  {(form.website_type || 'widget') === 'formspree' && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Formspree will POST submissions here. Make sure your form has <code style={{ background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>name</code> and <code style={{ background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>phone</code> fields.</p>
                  )}
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '10px 22px', background: def.color, color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Save size={13} /> {saving ? 'Saving...' : 'Save Account'}
            </button>
            <button onClick={onCancel} style={{ padding: '10px 16px', background: 'transparent', border: '1.5px solid var(--border)', borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer', color: 'var(--text-muted)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

//  MAIN SETTINGS PAGE
// ════════════════════════════════════════════════════════════

export default function SettingsPage() {
  const router = useRouter();
  const plan = usePlan();
  const [activeTab, setActiveTab] = useState('connections');
  const [company, setCompany] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Resolve whether the active tab is gated on the current plan.
  const activeGate = TAB_GATING[activeTab];
  const activeTabLocked = activeGate && !plan.hasFeature(activeGate.feature);
  const activeTabMeta = TABS.find(t => t.id === activeTab);

  useEffect(() => {
    if (!localStorage.getItem('token')) { router.push('/login'); return; }
    fetchCompany();
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('tab');
    if (requested) {
      // Legacy aliases + validation against TABS so an unknown ?tab= never renders a
      // blank panel (the old ?tab=billing bug). 'billing' → the real 'plan' tab.
      const TAB_ALIASES = { billing: 'plan' };
      const resolved = TAB_ALIASES[requested] || requested;
      setActiveTab(TABS.some(t => t.id === resolved) ? resolved : 'connections');
    }
  }, []);

  // Reset scroll to the top whenever the tab changes — otherwise switching from a
  // long tab to a short one (e.g. Data & Privacy) lands you in dead space.
  useEffect(() => { if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); }, [activeTab]);

  const fetchCompany = async () => {
    try {
      const res = await settingsAPI.getCompany();
      setCompany(res.data.company || {});
    } catch { } finally { setLoading(false); }
  };

  // Thin adapter over the shared Toast engine — every tab receives this as a prop.
  const showToast = (msg, type = 'success') => {
    if (type === 'error') toast.error(msg);
    else if (type === 'info') toast.info(msg);
    else toast.success(msg);
  };

  const handleSaveCompany = async () => {
    setSaving(true);
    try {
      await settingsAPI.updateCompany(company);
      showToast('Settings saved successfully!');
    } catch { showToast('Error saving settings', 'error'); } finally { setSaving(false); }
  };

  return (
    <>
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @keyframes slideIn { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>




      <div className="r-col" style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px', display: 'flex', gap: 24 }}>

        {/* Sidebar */}
        <div className="r-full" style={{ width: 220, flexShrink: 0 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1.5px solid var(--border)', padding: 10, boxShadow: 'var(--shadow)', position: 'sticky', top: 24 }}>
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              const gate = TAB_GATING[tab.id];
              const locked = gate && !plan.hasFeature(gate.feature);
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  borderRadius: 12, border: 'none', background: active ? tab.color + '18' : 'transparent',
                  color: active ? tab.color : (locked ? 'var(--text-muted)' : 'var(--text-muted)'), fontWeight: active ? 700 : 600, fontSize: 13,
                  cursor: 'pointer', textAlign: 'left', marginBottom: 2, transition: 'all 0.15s',
                  opacity: locked ? 0.7 : 1,
                  position: 'relative',
                }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--surface2)'; if (!locked) e.currentTarget.style.color = 'var(--text)'; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; } }}>
                  <tab.icon size={16} />
                  <span style={{ flex: 1 }}>{tab.label}</span>
                  {locked && <LockBadge requiredPlan={gate.plan} size="sm" />}
                </button>
              );
            })}

            <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />

            <button onClick={() => router.push('/team')} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 12, border: 'none', background: 'transparent',
              color: 'var(--text-muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer', textAlign: 'left', marginBottom: 2
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
              <Users size={16} /> Team & Workspace
            </button>

            <button onClick={() => router.push('/reports')} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 12, border: 'none', background: 'transparent',
              color: 'var(--text-muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer', textAlign: 'left'
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
              <FileText size={16} /> Reports
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Loading settings...</div>
          ) : activeTabLocked ? (
            <LockedOverlay
              feature={activeTabMeta?.label || 'This feature'}
              requiredPlan={activeGate.plan}
              currentPlan={plan.planName || 'Creator'}
              description={`${activeTabMeta?.label} is available on the ${activeGate.plan} plan and above. Upgrade to unlock this and other team-grade features.`}
              perks={activeGate.perks}
            />
          ) : (
            <>
              {activeTab === 'connections' && <ConnectionsTab showToast={showToast} />}
              {activeTab === 'plan' && <PlanBillingTab showToast={showToast} />}
              {activeTab === 'appearance' && <AppearanceTab showToast={showToast} />}
              {activeTab === 'company' && <CompanyTab company={company} setCompany={setCompany} onSave={handleSaveCompany} saving={saving} />}
              {activeTab === 'currency' && <CurrencyTab company={company} setCompany={setCompany} onSave={handleSaveCompany} saving={saving} />}
              {activeTab === 'presets' && <PresetsTab showToast={showToast} />}
              {activeTab === 'email' && <EmailTemplatesTab showToast={showToast} />}
              {activeTab === 'email_sending' && <EmailSendingTab showToast={showToast} />}
              {activeTab === 'email_receiving' && <EmailReceivingTab showToast={showToast} />}
              {activeTab === 'autoreply' && <AutoReplyTab showToast={showToast} />}
              {activeTab === 'tags' && <TagsTab showToast={showToast} />}
              {activeTab === 'lost-reasons' && <LostReasonsTab showToast={showToast} />}
              {activeTab === 'notifications' && <NotificationsTab showToast={showToast} />}
              {activeTab === 'integrations' && <IntegrationsTab showToast={showToast} />}
              {activeTab === 'workspace' && <WorkspaceTab showToast={showToast} router={router} />}
              {activeTab === 'data' && <DataPrivacyTab showToast={showToast} />}
              {activeTab === 'ai_command' && <AICommandTab showToast={showToast} />}
              {activeTab === 'password' && <PasswordTab showToast={showToast} />}
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════
//  EMAIL SENDING (SMTP) TAB
// ════════════════════════════════════════════════════════════
function SettingsField({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0' }}>{hint}</p>}
    </div>
  );
}

function EmailSendingTab({ showToast }) {
  const [form, setForm] = useState({ smtp_host: '', smtp_port: '587', smtp_secure: false, smtp_user: '', smtp_pass: '', from_name: '', from_email: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => { fetchSmtp(); }, []);

  const fetchSmtp = async () => {
    setLoading(true);
    try {
      const res = await settingsAPI.getEmailSmtp();
      const s = res.data.smtp || {};
      setForm({
        smtp_host: s.smtp_host || '',
        smtp_port: String(s.smtp_port || 587),
        smtp_secure: !!s.smtp_secure,
        smtp_user: s.smtp_user || '',
        smtp_pass: s.smtp_pass || '',
        from_name: s.from_name || '',
        from_email: s.from_email || '',
      });
    } catch { } finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsAPI.updateEmailSmtp({ ...form, smtp_port: parseInt(form.smtp_port) || 587 });
      showToast('SMTP settings saved!');
    } catch (e) { showToast(e.response?.data?.error || 'Save failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await settingsAPI.testEmailSmtp();
      showToast('✅ Test email sent! Check your inbox.');
    } catch (e) { showToast(e.response?.data?.error || 'Test failed', 'error'); }
    finally { setTesting(false); }
  };


  if (loading) return <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 60, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>;

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SendIcon size={20} color="white" />
        </div>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Email Sending (SMTP)</h2>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Configure your SMTP server to send emails from lead profiles</p>
        </div>
      </div>

      {/* Quick preset buttons */}
      <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Quick Presets</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Gmail', host: 'smtp.gmail.com', port: '587', secure: false },
            { label: 'Outlook / Office 365', host: 'smtp.office365.com', port: '587', secure: false },
            { label: 'Yahoo', host: 'smtp.mail.yahoo.com', port: '465', secure: true },
            { label: 'Zoho', host: 'smtp.zoho.com', port: '587', secure: false },
            { label: 'SendGrid', host: 'smtp.sendgrid.net', port: '587', secure: false },
          ].map(p => (
            <button key={p.label} onClick={() => setForm(f => ({ ...f, smtp_host: p.host, smtp_port: p.port, smtp_secure: p.secure }))}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='#6366f1'; e.currentTarget.style.color='#6366f1'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='#374151'; }}
            >{p.label}</button>
          ))}
        </div>
      </div>

      <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        <div style={{ paddingRight: 16 }}>
          <SettingsField label="SMTP Host" hint="e.g. smtp.gmail.com">
            <input value={form.smtp_host} onChange={e => setForm(f => ({ ...f, smtp_host: e.target.value }))} placeholder="smtp.gmail.com"
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }} />
          </SettingsField>
          <SettingsField label="SMTP Username / Email" hint="Usually your email address">
            <input value={form.smtp_user} onChange={e => setForm(f => ({ ...f, smtp_user: e.target.value }))} placeholder="you@gmail.com"
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }} />
          </SettingsField>
          <SettingsField label="From Name">
            <input value={form.from_name} onChange={e => setForm(f => ({ ...f, from_name: e.target.value }))} placeholder="Your Business Name"
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }} />
          </SettingsField>
        </div>
        <div style={{ paddingLeft: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SettingsField label="Port" hint="Usually 587 or 465">
              <input type="number" value={form.smtp_port} onChange={e => setForm(f => ({ ...f, smtp_port: e.target.value }))} placeholder="587"
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }} />
            </SettingsField>
            <SettingsField label="Encryption">
              <div style={{ display: 'flex', gap: 8 }}>
                {[['TLS (587)', false], ['SSL (465)', true]].map(([label, val]) => (
                  <button key={label} onClick={() => setForm(f => ({ ...f, smtp_secure: val }))} style={{
                    flex: 1, padding: '10px 4px', borderRadius: 10, border: `1.5px solid ${form.smtp_secure===val ? '#6366f1' : 'var(--border)'}`,
                    background: form.smtp_secure===val ? 'rgba(99,102,241,0.12)' : 'var(--surface)', color: form.smtp_secure===val ? '#6366f1' : '#6b7280', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}>{label}</button>
                ))}
              </div>
            </SettingsField>
          </div>
          <SettingsField label="SMTP Password / App Password" hint="For Gmail: use an App Password">
            <div style={{ position: 'relative' }}>
              <input type={showPass ? 'text' : 'password'} value={form.smtp_pass} onChange={e => setForm(f => ({ ...f, smtp_pass: e.target.value }))} placeholder="App password"
                style={{ width: '100%', padding: '10px 40px 10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }} />
              <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </SettingsField>
          <SettingsField label="From Email Address" hint="Email address recipients will see">
            <input value={form.from_email} onChange={e => setForm(f => ({ ...f, from_email: e.target.value }))} placeholder="noreply@yourbusiness.com"
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }} />
          </SettingsField>
        </div>
      </div>

      <div style={{ background: 'var(--warning-bg)', border: '1.5px solid var(--warning-border)', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: 'var(--warning-text)', margin: 0, fontWeight: 600 }}>
          💡 <strong>Gmail tip:</strong> Enable 2FA and generate an App Password at myaccount.google.com/apppasswords. Use that as your password here.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={handleTest} disabled={testing || !form.smtp_host} style={{
          padding: '11px 20px', border: `1.5px solid ${form.smtp_host ? '#a7f3d0' : 'var(--border)'}`, borderRadius: 11,
          background: form.smtp_host ? 'rgba(16,185,129,0.10)' : 'var(--surface2)', color: form.smtp_host ? '#059669' : '#9ca3af',
          fontSize: 14, fontWeight: 700, cursor: form.smtp_host ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          {testing ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(5,150,105,0.3)', borderTopColor: '#059669', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Sending…</> : <><SendIcon size={14} /> Send Test Email</>}
        </button>
        <button onClick={handleSave} disabled={saving} style={{
          padding: '11px 24px', background: saving ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
          border: 'none', borderRadius: 11, color: 'white', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          {saving ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Saving…</> : <><Save size={14} /> Save Settings</>}
        </button>
      </div>
    </div>
  );
}
// ════════════════════════════════════════════════════════════
//  EMAIL RECEIVING (IMAP) TAB
// ════════════════════════════════════════════════════════════
function EmailReceivingTab({ showToast }) {
  const API = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
  const token = () => typeof window !== 'undefined' ? localStorage.getItem('token') : '';

  const [form, setForm] = useState({
    imap_host: '', imap_port: '993', imap_secure: true,
    imap_user: '', imap_pass: '', is_enabled: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, msg }

  useEffect(() => { fetchImap(); }, []);

  const fetchImap = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/settings/email-imap`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      const s = data.imap || {};
      setForm({
        imap_host: s.imap_host || '',
        imap_port: String(s.imap_port || 993),
        imap_secure: s.imap_secure !== 0,
        imap_user: s.imap_user || '',
        imap_pass: s.imap_pass || '',
        is_enabled: !!s.is_enabled,
      });
    } catch { } finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/settings/email-imap`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ...form, imap_port: parseInt(form.imap_port) || 993 }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('IMAP settings saved!');
    } catch (e) { showToast(e.message || 'Save failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch(`${API}/api/settings/email-imap/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTestResult({ ok: true, msg: 'Connected successfully! ✅' });
    } catch (e) {
      setTestResult({ ok: false, msg: e.message });
    } finally { setTesting(false); }
  };

  if (loading) return <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 60, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>;

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #06b6d4, #0891b2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mail size={20} color="white" />
        </div>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Email Receiving (IMAP)</h2>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Automatically pull replies from your inbox into lead profiles</p>
        </div>
      </div>

      {/* Enable toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: form.is_enabled ? 'rgba(16,185,129,0.1)' : 'var(--surface)', borderRadius: 14, border: `1.5px solid ${form.is_enabled ? 'rgba(16,185,129,0.4)' : 'var(--border)'}`, marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>Enable Email Receiving</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>When enabled, WappFlow checks your inbox every 2 minutes for new replies</p>
        </div>
        <button onClick={() => setForm(f => ({ ...f, is_enabled: !f.is_enabled }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {form.is_enabled
            ? <ToggleRight size={40} color="#10b981" />
            : <ToggleLeft size={40} color="#d1d5db" />}
        </button>
      </div>

      {/* Step-by-step guide */}
      <div style={{ background: 'rgba(6,182,212,0.08)', border: '1.5px solid rgba(6,182,212,0.25)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', margin: '0 0 12px' }}>📋 Gmail Setup Guide (3 steps)</p>
        {[
          { step: '1', title: 'Enable 2-Step Verification', desc: 'Go to myaccount.google.com → Security → 2-Step Verification → Turn On' },
          { step: '2', title: 'Create an App Password', desc: 'Go to myaccount.google.com → Security → App Passwords → Create → Name it "WappFlow" → Copy the 16-character password' },
          { step: '3', title: 'Enable IMAP in Gmail', desc: 'Go to Gmail → Settings (gear) → See all settings → Forwarding and POP/IMAP → Enable IMAP → Save' },
        ].map(s => (
          <div key={s.step} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: 'white', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.step}</div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>{s.title}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick presets */}
      <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Quick Presets</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Gmail', host: 'imap.gmail.com', port: '993', secure: true },
            { label: 'Outlook', host: 'outlook.office365.com', port: '993', secure: true },
            { label: 'Yahoo', host: 'imap.mail.yahoo.com', port: '993', secure: true },
            { label: 'Zoho', host: 'imap.zoho.com', port: '993', secure: true },
          ].map(p => (
            <button key={p.label} onClick={() => setForm(f => ({ ...f, imap_host: p.host, imap_port: p.port, imap_secure: p.secure }))}
              style={{ padding: '6px 16px', borderRadius: 20, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='#06b6d4'; e.currentTarget.style.color='#06b6d4'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='#374151'; }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fields */}
      <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        <div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>IMAP Host</label>
            <input value={form.imap_host} onChange={e => setForm(f => ({ ...f, imap_host: e.target.value }))} placeholder="imap.gmail.com"
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Email Address</label>
            <input value={form.imap_user} onChange={e => setForm(f => ({ ...f, imap_user: e.target.value }))} placeholder="you@gmail.com"
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }} />
          </div>
        </div>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Port</label>
              <input type="number" value={form.imap_port} onChange={e => setForm(f => ({ ...f, imap_port: e.target.value }))} placeholder="993"
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Encryption</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['SSL', true], ['None', false]].map(([label, val]) => (
                  <button key={label} onClick={() => setForm(f => ({ ...f, imap_secure: val }))} style={{
                    flex: 1, padding: '10px 4px', borderRadius: 10, border: `1.5px solid ${form.imap_secure===val ? '#06b6d4' : 'var(--border)'}`,
                    background: form.imap_secure===val ? 'rgba(6,182,212,0.10)' : 'var(--surface)', color: form.imap_secure===val ? '#0891b2' : '#6b7280',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}>{label}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>App Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPass ? 'text' : 'password'} value={form.imap_pass} onChange={e => setForm(f => ({ ...f, imap_pass: e.target.value }))} placeholder="16-character app password"
                style={{ width: '100%', padding: '10px 40px 10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }} />
              <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0' }}>Use an App Password, not your regular Gmail password</p>
          </div>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div style={{ padding: '12px 16px', borderRadius: 12, marginBottom: 16, background: testResult.ok ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.12)', border: `1.5px solid ${testResult.ok ? '#a7f3d0' : '#fecaca'}` }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: testResult.ok ? '#059669' : '#dc2626', margin: 0 }}>{testResult.msg}</p>
        </div>
      )}

      {/* How it works */}
      <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 8px', textTransform: 'uppercase' }}>How it works</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          WappFlow checks your inbox every <strong>2 minutes</strong> for new emails. When a reply arrives from an email address that matches a lead's email field, it's automatically saved to that lead's profile under the Emails tab. Make sure your leads have their email addresses filled in for matching to work.
        </p>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={handleTest} disabled={testing || !form.imap_host || !form.imap_user} style={{
          padding: '11px 20px', border: `1.5px solid ${form.imap_host ? '#bae6fd' : 'var(--border)'}`, borderRadius: 11,
          background: form.imap_host ? '#f0f9ff' : 'var(--surface2)', color: form.imap_host ? '#0891b2' : '#9ca3af',
          fontSize: 14, fontWeight: 700, cursor: form.imap_host ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          {testing ? 'Testing…' : '🔌 Test Connection'}
        </button>
        <button onClick={handleSave} disabled={saving} style={{
          padding: '11px 24px', background: saving ? '#a5b4fc' : 'linear-gradient(135deg, #06b6d4, #0891b2)',
          border: 'none', borderRadius: 11, color: 'white', fontSize: 14, fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8
        }}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
// ════════════════════════════════════════════════════════════
//  APPEARANCE TAB
// ════════════════════════════════════════════════════════════
function AppearanceTab({ showToast }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('theme') || 'dark';
    return 'dark';
  });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
    showToast(next === 'light' ? 'Switched to Light Mode' : 'Switched to Dark Mode');
  };

  const isDark = theme === 'dark';

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 20, border: '1.5px solid var(--border)', padding: 28, boxShadow: 'var(--shadow)', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#6366f118' }}>
          <Palette size={22} color="#6366f1" />
        </div>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Appearance</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, marginTop: 2 }}>Choose your preferred color scheme</p>
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Dark mode card */}
          <button
            onClick={() => { if (isDark) return; toggleTheme(); }}
            style={{
              padding: 20, borderRadius: 16, border: `2px solid ${isDark ? '#6366f1' : 'var(--border)'}`,
              background: isDark ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
              cursor: isDark ? 'default' : 'pointer', textAlign: 'left',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ width: 44, height: 30, borderRadius: 8, background: '#0f1117', border: '1px solid #2a2d3e', marginBottom: 12, display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1' }} />
              <div style={{ flex: 1, height: 2, background: '#2a2d3e', borderRadius: 1 }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Dark Mode</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Easy on the eyes, great for night use</p>
            {isDark && (
              <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', fontSize: 11, fontWeight: 700 }}>
                <CheckCircle size={11} /> Active
              </div>
            )}
          </button>

          {/* Light mode card */}
          <button
            onClick={() => { if (!isDark) return; toggleTheme(); }}
            style={{
              padding: 20, borderRadius: 16, border: `2px solid ${!isDark ? '#6366f1' : 'var(--border)'}`,
              background: !isDark ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
              cursor: !isDark ? 'default' : 'pointer', textAlign: 'left',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ width: 44, height: 30, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', marginBottom: 12, display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1' }} />
              <div style={{ flex: 1, height: 2, background: '#e2e8f0', borderRadius: 1 }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Light Mode</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Clean and bright for daytime use</p>
            {!isDark && (
              <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.2)', color: '#6366f1', fontSize: 11, fontWeight: 700 }}>
                <CheckCircle size={11} /> Active
              </div>
            )}
          </button>
        </div>

        <div style={{ marginTop: 20, padding: '14px 18px', background: 'var(--accent-light)', borderRadius: 12, border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>
              Current: {isDark ? '🌙 Dark Mode' : '☀️ Light Mode'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Click a card above or use the toggle</p>
          </div>
          <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {isDark
              ? <ToggleRight size={44} color="#6366f1" />
              : <ToggleLeft size={44} color="#6366f1" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function AICommandTab({ showToast }) {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('wf_ai_command_enabled') !== 'false';
  });
  const [profile, setProfile] = useState({
    business_description: '', tone: 'professional', language: 'English',
    signature: '', dos: '', donts: '', auto_analyze: 0
  });
  const [providerInfo, setProviderInfo] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    aiAPI.getProfile().then(r => { if (r.data?.profile) setProfile(p => ({ ...p, ...r.data.profile })); }).catch(() => {});
    aiAPI.status().then(r => setProviderInfo(r.data)).catch(() => {});
  }, []);

  const toggle = () => {
    const newVal = !enabled;
    setEnabled(newVal);
    localStorage.setItem('wf_ai_command_enabled', String(newVal));
    showToast(newVal ? 'AI Command Center enabled!' : 'AI Command Center disabled');
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await aiAPI.updateProfile(profile);
      showToast('AI profile saved');
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed to save profile', 'error');
    } finally { setSavingProfile(false); }
  };

  const TONES = ['professional', 'friendly', 'casual', 'formal', 'empathetic', 'concise'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header card */}
      <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1.5px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={20} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>AI Command Center</h2>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Shape how the AI assistant behaves across this workspace</p>
          </div>
          {providerInfo?.provider && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', color: '#4338ca' }}>
              Provider: {providerInfo.provider}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: enabled ? 'rgba(16,185,129,0.10)' : 'var(--surface2)', borderRadius: 14, border: `1.5px solid ${enabled ? 'rgba(16,185,129,0.3)' : 'var(--border)'}` }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>Show AI Assistant Button</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>The ✨ floating button in the bottom right corner</p>
          </div>
          <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {enabled ? <ToggleRight size={44} color="#10b981" /> : <ToggleLeft size={44} color="#d1d5db" />}
          </button>
        </div>
      </div>

      {/* Workspace AI profile */}
      <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1.5px solid var(--border)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>Workspace AI Profile</h3>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 24px' }}>
          These settings are added as context to every AI request — replies, summaries, and analysis will follow your business voice.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Business Description</label>
            <textarea
              value={profile.business_description || ''}
              onChange={e => setProfile(p => ({ ...p, business_description: e.target.value }))}
              rows={3}
              placeholder="e.g. We're a Pakistan-based real estate brokerage focused on Bahria Town and DHA. We help clients buy, sell, and rent residential plots and homes."
              style={{ width: '100%', padding: '11px 14px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }}
            />
          </div>

          <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Tone</label>
              <select aria-label="Tone"
                value={profile.tone || 'professional'}
                onChange={e => setProfile(p => ({ ...p, tone: e.target.value }))}
                style={{ width: '100%', padding: '11px 14px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }}
              >
                {TONES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Language</label>
              <input
                value={profile.language || ''}
                onChange={e => setProfile(p => ({ ...p, language: e.target.value }))}
                placeholder="English / Urdu / Spanish..."
                style={{ width: '100%', padding: '11px 14px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Do's — things the AI should always do</label>
            <textarea
              value={profile.dos || ''}
              onChange={e => setProfile(p => ({ ...p, dos: e.target.value }))}
              rows={3}
              placeholder="• Always confirm location before quoting&#10;• Mention our 0% commission for repeat clients&#10;• Offer site visits when interest is shown"
              style={{ width: '100%', padding: '11px 14px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Don'ts — things the AI must avoid</label>
            <textarea
              value={profile.donts || ''}
              onChange={e => setProfile(p => ({ ...p, donts: e.target.value }))}
              rows={3}
              placeholder="• Never promise exact prices without seeing the property&#10;• Don't share competitor names&#10;• Avoid slang or emojis with corporate clients"
              style={{ width: '100%', padding: '11px 14px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Signature</label>
            <input
              value={profile.signature || ''}
              onChange={e => setProfile(p => ({ ...p, signature: e.target.value }))}
              placeholder="e.g. Best regards, Sales Team"
              style={{ width: '100%', padding: '11px 14px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 12 }}>
            <input
              id="auto-analyze"
              type="checkbox"
              checked={!!profile.auto_analyze}
              onChange={e => setProfile(p => ({ ...p, auto_analyze: e.target.checked ? 1 : 0 }))}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <label htmlFor="auto-analyze" style={{ fontSize: 13, color: 'var(--text)', cursor: 'pointer', flex: 1 }}>
              <span style={{ fontWeight: 700 }}>Auto-analyze new leads</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Run AI analysis automatically when a new lead's first message arrives. <strong>Never auto-sends replies</strong> — only updates score / sentiment / urgency.</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              onClick={saveProfile}
              disabled={savingProfile}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 11, border: 'none', background: savingProfile ? 'var(--border)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: 'white', fontWeight: 700, cursor: savingProfile ? 'wait' : 'pointer', fontSize: 14 }}
            >
              <Save size={15} /> {savingProfile ? 'Saving…' : 'Save AI Profile'}
            </button>
          </div>
        </div>
      </div>

      {/* Examples */}
      <div style={{ background: 'rgba(99,102,241,0.06)', borderRadius: 16, padding: 20, border: '1.5px solid rgba(99,102,241,0.18)' }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: '#6366f1', margin: '0 0 12px' }}>💡 What you can ask the AI assistant</p>
        {[
          'Show hot leads', 'Summarize today', 'Find Ali', 'Show won deals',
          'Show my reminders', 'Show new leads', 'Show workspace stats', 'Show negotiating leads'
        ].map(ex => (
          <div key={ex} style={{ display: 'inline-block', margin: '4px 6px 4px 0', padding: '5px 12px', background: 'var(--surface)', borderRadius: 20, border: '1.5px solid rgba(99,102,241,0.3)', fontSize: 12, fontWeight: 600, color: '#6366f1' }}>
            "{ex}"
          </div>
        ))}
      </div>
    </div>
  );
}
