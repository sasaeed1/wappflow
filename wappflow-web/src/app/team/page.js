'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, Plus, Mail, Shield, UserCheck, CheckCircle, AlertCircle, X,
  Crown, User, Clock, Activity, Search, Copy, Check, Send, Trash2,
  Edit2, RefreshCw, Settings, Lock, Unlock, ChevronDown, ChevronRight
} from 'lucide-react';
import { workspaceAPI, auditAPI } from '../../lib/api';
import NavBar from '../../components/NavBar';
import { useConfirm } from '@/lib/confirm';
import { usePlan } from '@/lib/plan';
import { LockedOverlay } from '@/components/PlanLock';
import Modal from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', color: '#f59e0b', icon: Crown,     desc: 'Full access · Workspace owner' },
  { value: 'admin',       label: 'Admin',       color: '#6366f1', icon: Shield,    desc: 'Manage team, leads & settings' },
  { value: 'manager',     label: 'Manager',     color: '#06b6d4', icon: UserCheck, desc: 'Leads & reports · No team/settings' },
  { value: 'user',        label: 'User',        color: '#10b981', icon: User,      desc: 'Assigned leads only' },
];

const PERM_LABELS = {
  view_all_leads:  'View all leads',
  create_lead:     'Create leads',
  edit_lead:       'Edit leads',
  delete_lead:     'Delete leads',
  view_reports:    'View reports',
  manage_settings: 'Manage settings',
  manage_team:     'Manage team',
  manage_invoices: 'Manage invoices',
  manage_whatsapp: 'WhatsApp settings',
};

// Default fallback permissions per role
const DEFAULTS = {
  super_admin: { view_all_leads:true,create_lead:true,edit_lead:true,delete_lead:true,view_reports:true,manage_settings:true,manage_team:true,manage_invoices:true,manage_whatsapp:true },
  admin:       { view_all_leads:true,create_lead:true,edit_lead:true,delete_lead:true,view_reports:true,manage_settings:true,manage_team:true,manage_invoices:true,manage_whatsapp:false },
  manager:     { view_all_leads:true,create_lead:true,edit_lead:true,delete_lead:false,view_reports:true,manage_settings:false,manage_team:false,manage_invoices:true,manage_whatsapp:false },
  user:        { view_all_leads:false,create_lead:true,edit_lead:true,delete_lead:false,view_reports:false,manage_settings:false,manage_team:false,manage_invoices:false,manage_whatsapp:false },
};

// ── Toggle Switch ────────────────────────────────────────────
function Toggle({ value, onChange, color = '#6366f1', disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        background: value ? color : 'var(--border)',
        transition: 'background 0.2s', position: 'relative', flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', width: 18, height: 18, background: 'var(--surface)', borderRadius: '50%',
        top: 3, left: value ? 23 : 3, transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)'
      }} />
    </button>
  );
}

// ── Invite Modal ─────────────────────────────────────────────
function InviteModal({ onSave, onClose }) {
  const [form, setForm] = useState({ email: '', role: 'user', full_name: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const handle = async () => {
    if (!form.email.trim()) return;
    setSaving(true);
    try {
      const res = await onSave(form);
      if (res?.invite_link) setResult(res);
      else onClose(true);
    } catch (e) {
      toast.error('Could not invite', { description: e.response?.data?.error || 'Failed to invite' });
    } finally { setSaving(false); }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(result.invite_link);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  if (result) return (
    <Modal open onClose={() => onClose(true)} labelledBy="invite-result-title" hideClose padded={false} size="sm" style={{ maxWidth: 460 }}>
      <div style={{ padding: 32 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:60, height:60, borderRadius:20, background:'rgba(16,185,129,0.15)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
            <CheckCircle size={28} color="#10b981" />
          </div>
          <h2 id="invite-result-title" style={{ fontSize:20, fontWeight:800, color:'var(--text)', margin:'0 0 8px' }}>
            {result.email_sent ? 'Invite sent!' : 'Invite link created!'}
          </h2>
          <p style={{ fontSize:14, color:'var(--text-muted)', margin:0 }}>
            {result.email_sent
              ? <>Invite email sent to <strong>{form.email}</strong>. They can click the link in their inbox to create their account.</>
              : <>Share this link with <strong>{form.email}</strong> — configure SMTP in Settings to send invites automatically.</>}
          </p>
        </div>

        {result.email_sent ? (
          <div style={{ background:'rgba(16,185,129,0.10)', border:'1.5px solid rgba(16,185,129,0.35)', borderRadius:12, padding:'14px 16px', marginBottom:16, textAlign:'center' }}>
            <p style={{ fontSize:13, fontWeight:700, color:'#10b981', margin:'0 0 4px' }}>✅ Email delivered to {form.email}</p>
            <p style={{ fontSize:12, color:'#34d399', margin:0 }}>They'll receive an invite with a direct link to set their password.</p>
          </div>
        ) : (
          <div style={{ background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:12, padding:'14px 16px', marginBottom:16 }}>
            <p style={{ fontSize:11, fontWeight:700, color:'var(--accent)', margin:'0 0 6px', textTransform:'uppercase', letterSpacing:'0.4px' }}>Invite Link</p>
            <p style={{ fontSize:12, color:'var(--text)', margin:0, wordBreak:'break-all', fontFamily:'monospace' }}>{result.invite_link}</p>
          </div>
        )}

        {!result.email_sent && (
          <button onClick={copyLink} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px', borderRadius:12, border:'1.5px solid rgba(99,102,241,0.35)', background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.12)', color: copied ? '#065f46' : '#6366f1', fontWeight:700, cursor:'pointer', fontSize:14, marginBottom:10, transition:'all 0.2s' }}>
            {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Invite Link</>}
          </button>
        )}
        <button onClick={() => onClose(true)} style={{ width:'100%', padding:'13px', border:'1.5px solid var(--border)', borderRadius:12, background:'var(--surface)', color:'var(--text)', fontWeight:700, cursor:'pointer', fontSize:14, marginTop: result.email_sent ? 0 : undefined }}>Done</button>
      </div>
    </Modal>
  );

  return (
    <Modal open onClose={() => onClose(false)} title="Invite Team Member" description="They'll get a link to set up their account" size="sm" style={{ maxWidth: 480 }}>
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.5px', display:'block', marginBottom:8 }}>Full Name</label>
          <input value={form.full_name} onChange={e => setForm(p => ({...p, full_name:e.target.value}))} placeholder="John Smith"
            style={{ width:'100%', padding:'11px 14px', border:'1.5px solid var(--border)', borderRadius:11, fontSize:14, outline:'none', boxSizing:'border-box' }} />
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.5px', display:'block', marginBottom:8 }}>Email Address</label>
          <input value={form.email} onChange={e => setForm(p => ({...p, email:e.target.value}))} placeholder="john@company.com" type="email" autoFocus
            style={{ width:'100%', padding:'11px 14px', border:'1.5px solid var(--border)', borderRadius:11, fontSize:14, outline:'none', boxSizing:'border-box' }} />
        </div>
        <div style={{ marginBottom:24 }}>
          <label style={{ fontSize:12, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.5px', display:'block', marginBottom:10 }}>Role</label>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {ROLES.filter(r => r.value !== 'super_admin').map(role => {
              const RI = role.icon; const sel = form.role === role.value;
              return (
                <button key={role.value} onClick={() => setForm(p=>({...p,role:role.value}))} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 14px', borderRadius:12, border:`2px solid ${sel?role.color:'var(--border)'}`, background:sel?role.color+'0d':'var(--surface)', cursor:'pointer', textAlign:'left' }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:role.color+'20', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <RI size={16} color={role.color} />
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:14, fontWeight:700, color:sel?role.color:'var(--text)', margin:0 }}>{role.label}</p>
                    <p style={{ fontSize:12, color:'var(--text-dim)', margin:0 }}>{role.desc}</p>
                  </div>
                  {sel && <CheckCircle size={16} color={role.color} />}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display:'flex', gap:12 }}>
          <button onClick={() => onClose(false)} style={{ flex:1, padding:'13px', border:'1.5px solid var(--border)', borderRadius:12, background:'var(--surface)', color:'var(--text-muted)', fontWeight:600, cursor:'pointer', fontSize:14 }}>Cancel</button>
          <button onClick={handle} disabled={saving||!form.email.trim()} style={{ flex:2, padding:'13px', border:'none', borderRadius:12, background:saving?'#9ca3af':'linear-gradient(135deg,#6366f1,#4f46e5)', color:'white', fontWeight:700, cursor:saving?'not-allowed':'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Send size={14} /> {saving ? 'Creating...' : 'Create Invite Link'}
          </button>
        </div>
    </Modal>
  );
}

// ── Role Change Modal ─────────────────────────────────────────
function RoleModal({ member, onSave, onClose }) {
  const [role, setRole] = useState(member.role);
  const [saving, setSaving] = useState(false);
  const handle = async () => {
    setSaving(true);
    try { await onSave(member.id, { role }); onClose(); }
    catch (e) { toast.error('Failed to update role', { description: e.response?.data?.error || 'Unknown error' }); }
    finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title="Change Role" description={member.full_name || member.email || member.invite_email} size="sm" style={{ maxWidth: 420 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:24 }}>
          {ROLES.filter(r => r.value !== 'super_admin').map(r => {
            const RI = r.icon; const sel = role === r.value;
            return (
              <button key={r.value} onClick={() => setRole(r.value)} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderRadius:12, border:`2px solid ${sel?r.color:'var(--border)'}`, background:sel?r.color+'0d':'var(--surface)', cursor:'pointer', textAlign:'left' }}>
                <RI size={16} color={r.color} />
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:13, fontWeight:700, color:sel?r.color:'var(--text)', margin:0 }}>{r.label}</p>
                  <p style={{ fontSize:11, color:'var(--text-dim)', margin:0 }}>{r.desc}</p>
                </div>
                {sel && <CheckCircle size={15} color={r.color} />}
              </button>
            );
          })}
        </div>
        <div style={{ display:'flex', gap:12 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', border:'1.5px solid var(--border)', borderRadius:12, background:'var(--surface)', color:'var(--text-muted)', fontWeight:600, cursor:'pointer', fontSize:14 }}>Cancel</button>
          <button onClick={handle} disabled={saving||role===member.role} style={{ flex:2, padding:'12px', border:'none', borderRadius:12, background:'linear-gradient(135deg,#6366f1,#4f46e5)', color:'white', fontWeight:700, cursor:saving?'not-allowed':'pointer', fontSize:14 }}>
            {saving ? 'Saving...' : 'Update Role'}
          </button>
        </div>
    </Modal>
  );
}

// ── Per-Member Permission Override Modal ─────────────────────
function MemberPermissionsModal({ member, roleDefaults, onSave, onClose }) {
  const roleDefs = roleDefaults[member.role] || DEFAULTS[member.role] || {};
  const existingOverrides = member.permissions ? (typeof member.permissions === 'string' ? JSON.parse(member.permissions) : member.permissions) : null;
  const [hasOverride, setHasOverride] = useState(!!existingOverrides);
  const [local, setLocal] = useState(existingOverrides || {...roleDefs});
  const [customKey, setCustomKey] = useState('');
  const [saving, setSaving] = useState(false);

  const roleInfo = ROLES.find(r => r.value === member.role) || ROLES[3];

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(member.id, { permissions: hasOverride ? local : null });
      onClose();
    } catch (e) { toast.error('Failed to update permissions', { description: e.response?.data?.error || 'Unknown error' }); }
    finally { setSaving(false); }
  };

  const addCustomPerm = () => {
    const key = customKey.trim().replace(/\s+/g, '_').toLowerCase();
    if (!key) return;
    setLocal(prev => ({...prev, [key]: false}));
    setCustomKey('');
  };

  const allKeys = [...new Set([...Object.keys(PERM_LABELS), ...Object.keys(local)])];

  return (
    <Modal open onClose={onClose} title="Custom Permissions"
      description={<>{member.full_name || member.email || member.invite_email} · <span style={{ color:roleInfo.color, fontWeight:600 }}>{roleInfo.label}</span></>}
      size="sm" style={{ maxWidth: 520 }}>

        {/* Override toggle */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', background:'rgba(99,102,241,0.06)', borderRadius:14, border:'1.5px solid rgba(99,102,241,0.35)', marginBottom:20 }}>
          <div>
            <p style={{ fontSize:14, fontWeight:700, color:'var(--text)', margin:0 }}>Custom permission override</p>
            <p style={{ fontSize:12, color:'var(--text-dim)', margin:0 }}>Override this member's permissions beyond their role defaults</p>
          </div>
          <Toggle value={hasOverride} onChange={v => { setHasOverride(v); if (v) setLocal({...roleDefs}); }} color="#6366f1" />
        </div>

        {hasOverride && (
          <>
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:20 }}>
              {allKeys.map(key => {
                const label = PERM_LABELS[key] || key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
                const isCustom = !PERM_LABELS[key];
                return (
                  <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'var(--surface2)', borderRadius:10, gap:12 }}>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:13, color:'var(--text)', fontWeight:600 }}>{label}</span>
                      {isCustom && <span style={{ fontSize:10, color:'#6366f1', fontWeight:700, marginLeft:6, background:'rgba(99,102,241,0.12)', padding:'1px 6px', borderRadius:4 }}>CUSTOM</span>}
                    </div>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <span style={{ fontSize:11, color: local[key] ? '#10b981' : '#ef4444', fontWeight:700 }}>{local[key] ? 'ON' : 'OFF'}</span>
                      <Toggle value={!!local[key]} onChange={v => setLocal(prev=>({...prev,[key]:v}))} color={roleInfo.color} />
                      {isCustom && (
                        <button onClick={() => setLocal(prev => { const n={...prev}; delete n[key]; return n; })} style={{ background:'none', border:'none', cursor:'pointer', color:'#ef4444', padding:2 }}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add custom permission */}
            <div style={{ background:'rgba(16,185,129,0.10)', border:'1.5px dashed #86efac', borderRadius:12, padding:16, marginBottom:20 }}>
              <p style={{ fontSize:12, fontWeight:700, color:'#166534', margin:'0 0 10px', textTransform:'uppercase', letterSpacing:'0.4px' }}>Add Custom Permission</p>
              <div style={{ display:'flex', gap:8 }}>
                <input value={customKey} onChange={e=>setCustomKey(e.target.value)} placeholder="e.g. export_data" onKeyDown={e=>e.key==='Enter'&&addCustomPerm()}
                  style={{ flex:1, padding:'9px 12px', border:'1.5px solid #86efac', borderRadius:10, fontSize:13, outline:'none', background:'var(--surface)', boxSizing:'border-box' }} />
                <button onClick={addCustomPerm} disabled={!customKey.trim()} style={{ padding:'9px 16px', borderRadius:10, border:'none', background:'#10b981', color:'white', fontWeight:700, cursor:'pointer', fontSize:13 }}>Add</button>
              </div>
            </div>
          </>
        )}

        <div style={{ display:'flex', gap:12 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', border:'1.5px solid var(--border)', borderRadius:12, background:'var(--surface)', color:'var(--text-muted)', fontWeight:600, cursor:'pointer', fontSize:14 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex:2, padding:'12px', border:'none', borderRadius:12, background:'linear-gradient(135deg,#6366f1,#4f46e5)', color:'white', fontWeight:700, cursor:saving?'not-allowed':'pointer', fontSize:14 }}>
            {saving ? 'Saving...' : hasOverride ? 'Save Custom Permissions' : 'Remove Override (use role defaults)'}
          </button>
        </div>
    </Modal>
  );
}

// ── Permissions Tab ─────────────────────────────────────────
function PermissionsTab({ permissions, onSaveRole, currentRole }) {
  const [local, setLocal] = useState(() => {
    const base = { ...DEFAULTS };
    Object.keys(permissions).forEach(role => {
      base[role] = { ...DEFAULTS[role], ...permissions[role] };
    });
    return base;
  });
  const [saving, setSaving] = useState(null);
  const [addingKey, setAddingKey] = useState(null); // role
  const [newKey, setNewKey] = useState('');

  const handleSave = async (role) => {
    setSaving(role);
    try {
      await onSaveRole(role, local[role]);
      toast.success(`${ROLES.find(r=>r.value===role)?.label || role} permissions saved`);
    } catch { toast.error('Error saving'); } finally { setSaving(null); }
  };

  const addCustomPerm = (role) => {
    const key = newKey.trim().replace(/\s+/g,'_').toLowerCase();
    if (!key) return;
    setLocal(prev=>({...prev,[role]:{...prev[role],[key]:false}}));
    setNewKey(''); setAddingKey(null);
  };

  const isOwner = currentRole === 'super_admin';
  const editableRoles = ['admin','manager','user'];

  return (
    <div>
      <div style={{ background: 'var(--warning-bg)', border: '1.5px solid var(--warning-border)', borderRadius:14, padding:'14px 18px', marginBottom:24, display:'flex', alignItems:'flex-start', gap:10 }}>
        <AlertCircle size={16} color="#d97706" style={{ flexShrink:0, marginTop:1 }} />
        <p style={{ fontSize:13, color: 'var(--warning-text)', margin:0 }}>
          <strong>Super Admin</strong> always has full access. Changes here apply to <em>all</em> members with that role unless overridden per-member. Click <strong>Save</strong> to apply.
          {!isOwner && <span style={{ color:'#d97706', marginLeft:6 }}>(Read-only — only Super Admins can edit)</span>}
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:20 }}>
        {editableRoles.map(role => {
          const ri = ROLES.find(r=>r.value===role);
          const RI = ri?.icon || User;
          const perms = local[role] || {};
          const allKeys = [...new Set([...Object.keys(PERM_LABELS), ...Object.keys(perms)])];

          return (
            <div key={role} style={{ background:'var(--surface)', borderRadius:20, border:'1.5px solid var(--border)', padding:24, boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:ri?.color+'18', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <RI size={18} color={ri?.color} />
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:15, fontWeight:800, color:'var(--text)', margin:0 }}>{ri?.label}</p>
                  <p style={{ fontSize:12, color:'var(--text-dim)', margin:0 }}>{ri?.desc}</p>
                </div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
                {allKeys.map(key => {
                  const label = PERM_LABELS[key] || key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
                  const isCustom = !PERM_LABELS[key];
                  return (
                    <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', borderRadius:8, background:'var(--surface2)', gap:8 }}>
                      <span style={{ fontSize:12, color:'var(--text)', fontWeight:500, flex:1 }}>{label}{isCustom && <span style={{ fontSize:9, color:'#6366f1', fontWeight:700, marginLeft:5, background:'rgba(99,102,241,0.12)', padding:'1px 5px', borderRadius:3 }}>CUSTOM</span>}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:10, color:perms[key]?'#10b981':'#9ca3af', fontWeight:700, minWidth:24 }}>{perms[key]?'ON':'OFF'}</span>
                        <Toggle value={!!perms[key]} onChange={v=>isOwner&&setLocal(prev=>({...prev,[role]:{...prev[role],[key]:v}}))} color={ri?.color} disabled={!isOwner} />
                        {isCustom && isOwner && (
                          <button onClick={()=>setLocal(prev=>{const n={...prev,[role]:{...prev[role]}};delete n[role][key];return n;})} style={{ background:'none',border:'none',cursor:'pointer',color:'#ef4444',padding:1 }}><X size={12}/></button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {isOwner && (
                <>
                  {addingKey === role ? (
                    <div style={{ display:'flex', gap:6, marginBottom:10 }}>
                      <input value={newKey} onChange={e=>setNewKey(e.target.value)} placeholder="custom_permission_key" autoFocus
                        onKeyDown={e=>{if(e.key==='Enter')addCustomPerm(role);if(e.key==='Escape'){setAddingKey(null);setNewKey('');}}}
                        style={{ flex:1, padding:'7px 10px', border:'1.5px solid #6366f1', borderRadius:8, fontSize:12, outline:'none', boxSizing:'border-box' }} />
                      <button onClick={()=>addCustomPerm(role)} style={{ padding:'7px 12px', borderRadius:8, border:'none', background:'#10b981', color:'white', fontWeight:700, cursor:'pointer', fontSize:12 }}>Add</button>
                      <button onClick={()=>{setAddingKey(null);setNewKey('');}} style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid var(--border)', background:'var(--surface)', color:'var(--text-muted)', cursor:'pointer', fontSize:12 }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={()=>setAddingKey(role)} style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:8, border:'1.5px dashed var(--border)', background:'transparent', color:'var(--text-dim)', cursor:'pointer', fontSize:12, fontWeight:600, marginBottom:10, width:'100%' }}>
                      <Plus size={12}/> Add custom permission
                    </button>
                  )}
                  <button onClick={()=>handleSave(role)} disabled={!!saving} style={{ width:'100%', padding:'10px', border:'none', borderRadius:10, background:saving===role?'#9ca3af':'linear-gradient(135deg,#6366f1,#4f46e5)', color:'white', fontWeight:700, cursor:saving?'not-allowed':'pointer', fontSize:13 }}>
                    {saving===role ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function TeamPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const plan = usePlan();
  const [workspace, setWorkspace] = useState(null);
  const [members, setMembers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [roleModal, setRoleModal] = useState(null);
  const [permModal, setPermModal] = useState(null);
  const [tab, setTab] = useState('members');
  const [search, setSearch] = useState('');
  const [currentRole, setCurrentRole] = useState('super_admin');

  useEffect(() => {
    if (!localStorage.getItem('token')) { router.push('/login'); return; }
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    // Use allSettled so one failure doesn't block others
    const [wsResult, logsResult, permResult] = await Promise.allSettled([
      workspaceAPI.get(),
      auditAPI.getLogs({ limit: 50 }),
      workspaceAPI.getRolePermissions(),
    ]);

    if (wsResult.status === 'fulfilled') {
      setWorkspace(wsResult.value.data.workspace);
      setMembers(wsResult.value.data.members || []);
      setCurrentRole(wsResult.value.data.currentUserRole || 'super_admin');
    } else {
      console.error('Workspace fetch failed:', wsResult.reason);
    }
    if (logsResult.status === 'fulfilled') setLogs(logsResult.value.data.logs || []);
    if (permResult.status === 'fulfilled') {
      const perms = permResult.value.data.permissions || {};
      setPermissions(perms);
    }
    setLoading(false);
  };

  const handleInvite = async (form) => {
    const res = await workspaceAPI.invite(form);
    toast.success('Invite created!');
    return res.data;
  };

  const handleInviteClose = (refresh) => {
    setShowInvite(false);
    if (refresh) fetchAll();
  };

  const handleRoleUpdate = async (id, data) => {
    await workspaceAPI.updateMember(id, data);
    toast.success('Role updated!');
    fetchAll();
  };

  const handlePermUpdate = async (id, data) => {
    await workspaceAPI.updateMember(id, data);
    toast.success('Permissions updated!');
    fetchAll();
  };

  const handleRemove = async (id) => {
    const ok = await confirm({
      title: 'Remove member?',
      message: 'They will lose access to this workspace immediately. They can be re-invited later.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await workspaceAPI.removeMember(id);
      toast.success('Member removed.');
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  };

  const handleSaveRolePermissions = async (role, perms) => {
    await workspaceAPI.updateRolePermissions(role, perms);
    setPermissions(prev => ({ ...prev, [role]: perms }));
  };

  const canManage = ['super_admin', 'admin'].includes(currentRole);
  const filtered = members.filter(m =>
    (m.full_name || m.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.email || m.invite_email || '').toLowerCase().includes(search.toLowerCase())
  );

  const getRoleInfo = (role) => ROLES.find(r => r.value === role) || ROLES[3];

  // Team collaboration is gated behind Growth+. Free + Starter users get a
  // full-screen lock with the upgrade CTA.
  const teamLocked = !plan.loading && !plan.hasFeature('team_collaboration');

  if (teamLocked) {
    return (
      <NavBar>
        <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 20px' }}>
          <LockedOverlay
            feature="Team management"
            requiredPlan="Studio"
            currentPlan={(plan.planName || 'Creator')}
            description="Invite teammates, assign roles, fine-tune per-user permissions, and see the audit log."
            perks={[
              'Up to 5 (Growth) or unlimited (Enterprise) team members',
              'Per-role permission matrix',
              'Shared inbox + internal notes',
              'Workspace audit log',
            ]}
          />
        </div>
      </NavBar>
    );
  }

  return (
    <NavBar>
    <div style={{ minHeight:'100vh', background:'var(--bg)', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      {showInvite && <InviteModal onSave={handleInvite} onClose={handleInviteClose} />}
      {roleModal && <RoleModal member={roleModal} onSave={handleRoleUpdate} onClose={()=>setRoleModal(null)} />}
      {permModal && <MemberPermissionsModal member={permModal} roleDefaults={permissions} onSave={handlePermUpdate} onClose={()=>setPermModal(null)} />}

      {/* Sub-header */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', position:'sticky', top:60, zIndex:40 }}>
        <div className="r-toolbar" style={{ maxWidth:1100, margin:'0 auto', padding:'0 24px', display:'flex', alignItems:'center', height:52, gap:16 }}>
          <div style={{ flex:1, display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Users size={14} color="white" />
            </div>
            <div>
              <span style={{ fontSize:15, fontWeight:800, color:'var(--text)' }}>{workspace?.name || 'Workspace'}</span>
              <span style={{ fontSize:12, color:'var(--text-dim)', marginLeft:8 }}>{members.length} member{members.length!==1?'s':''}</span>
            </div>
          </div>
          <button onClick={fetchAll} style={{ padding:'6px 12px', borderRadius:9, border:'1.5px solid var(--border)', background:'var(--surface)', color:'var(--text-muted)', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', gap:5 }}>
            <RefreshCw size={12} /> Refresh
          </button>
          {canManage && (() => {
            const limit = plan.limits?.team_members;
            const used = members.length;
            const atLimit = limit && limit !== -1 && used >= limit;
            if (atLimit) {
              return (
                <button onClick={() => router.push('/settings?tab=plan')}
                  title={`Plan limit: ${used}/${limit} team members`}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:10, border:'1.5px solid rgba(245,158,11,0.4)', background:'rgba(245,158,11,0.10)', color:'#fbbf24', fontWeight:700, cursor:'pointer', fontSize:13 }}>
                  <Lock size={14} /> {used}/{limit} · Upgrade for more
                </button>
              );
            }
            return (
              <button onClick={()=>setShowInvite(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#6366f1,#4f46e5)', color:'white', fontWeight:700, cursor:'pointer', fontSize:13, boxShadow:'0 4px 14px rgba(99,102,241,0.35)' }}>
                <Plus size={14} /> Invite Member
                {limit && limit !== -1 && <span style={{ opacity: 0.85, fontSize: 11, marginLeft: 4 }}>({used}/{limit})</span>}
              </button>
            );
          })()}
        </div>
        <div className="r-scroll-x" style={{ maxWidth:1100, margin:'0 auto', padding:'0 24px', display:'flex', gap:4 }}>
          {[{ id:'members', label:'Team Members' }, { id:'permissions', label:'Roles & Permissions' }, { id:'logs', label:'Activity Logs' }].map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:'8px 18px', border:'none', background:'none', cursor:'pointer', fontWeight:tab===t.id?700:600, fontSize:13, color:tab===t.id?'#6366f1':'#6b7280', borderBottom:`3px solid ${tab===t.id?'#6366f1':'transparent'}` }}>{t.label}</button>
          ))}
        </div>
      </div>

      <main style={{ maxWidth:1100, margin:'0 auto', padding:'28px 24px' }}>
        {loading ? (
          <div style={{ background:'var(--surface)', borderRadius:20, padding:60, textAlign:'center', color:'var(--text-dim)' }}>
            <RefreshCw size={28} style={{ margin:'0 auto 12px', display:'block', opacity:0.3 }} />
            Loading workspace...
          </div>
        ) : (
          <>
            {/* ── Members Tab ── */}
            {tab === 'members' && (
              <div>
                {/* Stats */}
                <div className="r-stack-2" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
                  {[
                    { label:'Total', value:members.length, color:'#6366f1', icon:Users },
                    { label:'Admins', value:members.filter(m=>['super_admin','admin'].includes(m.role)).length, color:'#f59e0b', icon:Shield },
                    { label:'Active', value:members.filter(m=>m.invite_status==='active').length, color:'#10b981', icon:UserCheck },
                    { label:'Pending', value:members.filter(m=>m.invite_status==='pending').length, color:'#f97316', icon:Clock },
                  ].map((s,i) => (
                    <div key={i} style={{ background:'var(--surface)', borderRadius:16, border:'1.5px solid var(--border)', padding:'18px 20px', boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                        <div style={{ width:34, height:34, borderRadius:10, background:s.color+'18', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <s.icon size={16} color={s.color} />
                        </div>
                        <p style={{ fontSize:24, fontWeight:900, color:'var(--text)', margin:0 }}>{s.value}</p>
                      </div>
                      <p style={{ fontSize:12, color:'var(--text-muted)', fontWeight:600, margin:0 }}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Search */}
                <div style={{ background:'var(--surface)', borderRadius:14, border:'1.5px solid var(--border)', padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10, maxWidth:380 }}>
                  <Search size={15} color="#9ca3af" />
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search members..."
                    style={{ border:'none', outline:'none', fontSize:14, color:'var(--text)', flex:1, background:'transparent' }} />
                </div>

                {/* Member cards */}
                {filtered.length === 0 ? (
                  <div style={{ background:'var(--surface)', borderRadius:20, border:'1.5px solid var(--border)', padding:60, textAlign:'center' }}>
                    <Users size={44} color="#d1d5db" style={{ margin:'0 auto 16px', display:'block' }} />
                    <p style={{ fontSize:16, fontWeight:700, color:'var(--text-dim)', marginBottom:8 }}>No team members yet</p>
                    {canManage && <button onClick={()=>setShowInvite(true)} style={{ marginTop:16, padding:'10px 24px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#6366f1,#4f46e5)', color:'white', fontWeight:700, cursor:'pointer', fontSize:14 }}>Invite Member</button>}
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {filtered.map(member => {
                      const ri = getRoleInfo(member.role);
                      const RI = ri.icon;
                      const isPending = member.invite_status === 'pending';
                      const hasCustomPerms = !!member.permissions;
                      const displayName = member.full_name || member.name || member.email || member.invite_email || 'Unknown';
                      const displayEmail = member.email || member.invite_email || '';
                      const isSelf = (() => { try { const u=JSON.parse(localStorage.getItem('user')||'{}'); return u.id===member.user_id; } catch { return false; } })();

                      return (
                        <div key={member.id} style={{ background:'var(--surface)', borderRadius:16, border:`1.5px solid ${isPending?'rgba(249,115,22,0.35)':'var(--border)'}`, padding:'18px 22px', boxShadow:'0 2px 6px rgba(0,0,0,0.04)', display:'flex', alignItems:'center', gap:16 }}>
                          <div style={{ width:46, height:46, borderRadius:14, flexShrink:0, background:isPending?'var(--surface2)':`linear-gradient(135deg,${ri.color}cc,${ri.color}66)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, fontWeight:900, color:isPending?'#9ca3af':'white', border:`2px solid ${isPending?'var(--border)':ri.color+'40'}` }}>
                            {isPending ? <Clock size={18} color="#9ca3af" /> : (displayName[0]?.toUpperCase()||'?')}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
                              <p style={{ fontSize:15, fontWeight:700, color:'var(--text)', margin:0 }}>
                                {displayName}
                                {isSelf && <span style={{ fontSize:11, color:'var(--text-dim)', fontWeight:600, marginLeft:6 }}>(you)</span>}
                              </p>
                              <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 9px', borderRadius:8, background:ri.color+'18', color:ri.color, fontSize:11, fontWeight:700 }}>
                                <RI size={10} /> {ri.label}
                              </span>
                              {isPending && <span style={{ padding:'2px 8px', borderRadius:6, background:'rgba(249,115,22,0.10)', color:'#c2410c', fontSize:11, fontWeight:700 }}>Pending invite</span>}
                              {hasCustomPerms && <span style={{ padding:'2px 8px', borderRadius:6, background:'rgba(99,102,241,0.12)', color:'#6366f1', fontSize:11, fontWeight:700, display:'inline-flex', alignItems:'center', gap:3 }}><Lock size={9}/>Custom perms</span>}
                            </div>
                            <p style={{ fontSize:13, color:'var(--text-muted)', margin:0, display:'flex', alignItems:'center', gap:5 }}>
                              <Mail size={12} /> {displayEmail}
                            </p>
                          </div>
                          {canManage && !isSelf && member.role !== 'super_admin' && (
                            <div className="r-actions" style={{ display:'flex', gap:6, flexShrink:0 }}>
                              <button onClick={()=>setRoleModal(member)} style={{ padding:'7px 12px', borderRadius:10, border:'1.5px solid var(--border)', background:'var(--surface)', color:'var(--text-muted)', cursor:'pointer', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                                <Edit2 size={12}/> Role
                              </button>
                              <button onClick={()=>setPermModal(member)} style={{ padding:'7px 12px', borderRadius:10, border:`1.5px solid ${hasCustomPerms?'rgba(99,102,241,0.35)':'var(--border)'}`, background:hasCustomPerms?'rgba(99,102,241,0.12)':'var(--surface)', color:hasCustomPerms?'#6366f1':'var(--text-muted)', cursor:'pointer', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                                <Lock size={12}/> Perms
                              </button>
                              <button onClick={()=>handleRemove(member.id)} style={{ padding:'7px 12px', borderRadius:10, border:'1.5px solid #fecaca', background: 'var(--danger-bg)', color: '#ef4444', cursor:'pointer', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                                <Trash2 size={12}/> Remove
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Permissions Tab ── */}
            {tab === 'permissions' && (
              <PermissionsTab permissions={permissions} onSaveRole={handleSaveRolePermissions} currentRole={currentRole} />
            )}

            {/* ── Logs Tab ── */}
            {tab === 'logs' && (
              <div style={{ background:'var(--surface)', borderRadius:20, border:'1.5px solid var(--border)', boxShadow:'0 2px 8px rgba(0,0,0,0.04)', overflow:'hidden' }}>
                <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
                  <Activity size={18} color="#6366f1" />
                  <p style={{ fontSize:15, fontWeight:800, color:'var(--text)', margin:0 }}>Activity Logs</p>
                  <span style={{ fontSize:12, color:'var(--text-dim)' }}>({logs.length} entries)</span>
                </div>
                {logs.length === 0 ? (
                  <div style={{ padding:60, textAlign:'center', color:'var(--text-dim)' }}>
                    <Activity size={40} style={{ margin:'0 auto 12px', display:'block', opacity:0.3 }} />
                    <p style={{ fontWeight:700 }}>No activity yet</p>
                  </div>
                ) : (
                  <div style={{ maxHeight:600, overflowY:'auto' }}>
                    {logs.map((log,i) => (
                      <div key={log.id||i} style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'14px 24px', borderBottom:'1px solid var(--border)' }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:'#6366f1', marginTop:6, flexShrink:0 }} />
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                            <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{log.user_name||log.user_email||'System'}</span>
                            <span style={{ fontSize:12, padding:'2px 8px', borderRadius:6, background:'var(--surface2)', color:'var(--text-muted)', fontWeight:600 }}>{log.action?.replace(/_/g,' ')}</span>
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                          <Clock size={11} color="#9ca3af" />
                          <span style={{ fontSize:11, color:'var(--text-dim)' }}>{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
    </NavBar>
  );
}
