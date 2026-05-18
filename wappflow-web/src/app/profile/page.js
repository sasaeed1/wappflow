'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../../components/NavBar';
import { profileAPI, BASE_URL } from '../../lib/api';
import {
  User, Mail, Phone, FileText, Camera, Save,
  ChevronLeft, Shield, Building2, Check, AlertCircle
} from 'lucide-react';

const ROLE_COLORS = {
  super_admin: '#f59e0b',
  admin: '#6366f1',
  manager: '#06b6d4',
  user: '#10b981',
};
const ROLE_LABELS = {
  super_admin: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  user: 'User',
};

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ full_name: '', phone: '', bio: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await profileAPI.get();
      const u = res.data.user;
      setProfile(u);
      setForm({ full_name: u.full_name || '', phone: u.phone || '', bio: u.bio || '' });
      if (u.profile_picture) setAvatarPreview(null); // use server url
    } catch (e) {
      showToast('Failed to load profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await profileAPI.update(form);
      const u = res.data.user;
      setProfile(prev => ({ ...prev, ...u }));
      // Update localStorage user cache
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, full_name: u.full_name }));
      showToast('Profile saved!');
    } catch (e) {
      showToast('Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);

    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await profileAPI.uploadAvatar(fd);
      const url = res.data.profile_picture;
      setProfile(prev => ({ ...prev, profile_picture: url }));
      setAvatarPreview(null); // switch back to server url
      // Update stored user
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, profile_picture: url }));
      showToast('Profile picture updated!');
    } catch (e) {
      showToast('Failed to upload picture', 'error');
      setAvatarPreview(null);
    } finally {
      setAvatarUploading(false);
    }
  };

  const avatarSrc = avatarPreview
    || (profile?.profile_picture ? (profile.profile_picture.startsWith('http') ? profile.profile_picture : `${BASE_URL}${profile.profile_picture}`) : null);

  const initials = (profile?.full_name || profile?.email || 'U')[0].toUpperCase();

  if (loading) {
    return (
      <NavBar>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>Loading profile…</p>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </NavBar>
    );
  }

  return (
    <NavBar>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: 80, right: 24, zIndex: 9999,
            background: toast.type === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.10)',
            border: `1.5px solid ${toast.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
            color: toast.type === 'error' ? '#b91c1c' : '#15803d',
            padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            animation: 'slideIn 0.2s ease'
          }}>
            {toast.type === 'error' ? <AlertCircle size={15} /> : <Check size={15} />}
            {toast.msg}
          </div>
        )}

        {/* Back button + header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button
            onClick={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 10, border: '1.5px solid #e5e7eb', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>My Profile</h1>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Manage your personal information</p>
          </div>
        </div>

        {/* Avatar + read-only info card */}
        <div style={{ background: 'var(--surface)', border: '1.5px solid #f3f4f6', borderRadius: 20, padding: 28, marginBottom: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            {/* Avatar */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 88, height: 88, borderRadius: '50%',
                background: avatarSrc ? 'transparent' : 'linear-gradient(135deg, #6366f1, #06b6d4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, fontWeight: 900, color: 'white',
                overflow: 'hidden', border: '3px solid #e5e7eb',
                boxShadow: '0 4px 16px rgba(99,102,241,0.2)'
              }}>
                {avatarSrc
                  ? <img src={avatarSrc} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials
                }
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                style={{
                  position: 'absolute', bottom: 2, right: 2,
                  width: 28, height: 28, borderRadius: '50%',
                  background: '#6366f1', border: '2px solid white',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', boxShadow: '0 2px 8px rgba(99,102,241,0.4)'
                }}
                title="Change photo"
              >
                {avatarUploading
                  ? <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  : <Camera size={13} />
                }
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            </div>

            {/* Read-only identity */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                  {profile?.full_name || profile?.business_name || 'User'}
                </h2>
                {profile?.role && (
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
                    background: (ROLE_COLORS[profile.role] || '#6366f1') + '18',
                    color: ROLE_COLORS[profile.role] || '#6366f1',
                    border: `1px solid ${(ROLE_COLORS[profile.role] || '#6366f1')}30`
                  }}>
                    <Shield size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                    {ROLE_LABELS[profile.role] || profile.role}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13 }}>
                  <Mail size={13} />
                  <span>{profile?.email}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>read-only</span>
                </div>
                {profile?.workspace_name && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13 }}>
                    <Building2 size={13} />
                    <span>{profile.workspace_name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Member since */}
            <div style={{ textAlign: 'right', color: 'var(--text-dim)', fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Member since</div>
              <div>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</div>
            </div>
          </div>
        </div>

        {/* Editable fields */}
        <div style={{ background: 'var(--surface)', border: '1.5px solid #f3f4f6', borderRadius: 20, padding: 28, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={16} color="#6366f1" />
            Personal Information
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Full Name */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <User size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="text"
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Your full name"
                  style={{ width: '100%', padding: '11px 12px 11px 36px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = '#6366f1'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>
                Phone Number
              </label>
              <div style={{ position: 'relative' }}>
                <Phone size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 234 567 8900"
                  style={{ width: '100%', padding: '11px 12px 11px 36px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = '#6366f1'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>
          </div>

          {/* Email (read-only) */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                style={{ width: '100%', padding: '11px 12px 11px 36px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, color: 'var(--text-dim)', background: 'var(--surface2)', boxSizing: 'border-box', cursor: 'not-allowed' }}
              />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface2)', padding: '2px 7px', borderRadius: 5, fontWeight: 600 }}>
                Read-only
              </span>
            </div>
          </div>

          {/* Bio */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>
              Bio
            </label>
            <div style={{ position: 'relative' }}>
              <FileText size={14} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-dim)' }} />
              <textarea
                value={form.bio}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="Tell your team a little about yourself…"
                rows={3}
                style={{ width: '100%', padding: '11px 12px 11px 36px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, color: 'var(--text)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                onFocus={e => e.target.style.borderColor = '#6366f1'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
          </div>

          {/* Save button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '11px 28px',
                background: saving ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: 'white', border: 'none', borderRadius: 11,
                fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: '0 6px 16px rgba(99,102,241,0.3)'
              }}
            >
              {saving
                ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Saving…</>
                : <><Save size={15} /> Save Changes</>
              }
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </NavBar>
  );
}
