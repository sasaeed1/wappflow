'use client';
import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, KeyRound, Copy, Check } from 'lucide-react';
import { ccApi, ccAuth, fmtAgo } from '@/lib/ccApi';
import { Card, Pill, useCc } from '@/components/control/ControlShell';
import { FormDialog, Btn, H3, Muted, Row, selectStyle } from '@/components/control/kit';
import { useConfirm } from '@/lib/confirm';

// Admins & Security. Every admin: their own 2FA status, recovery codes, password,
// recent sign-ins. With manage_admins: the team — invite, roles, disable, reset.
const ROLE_INFO = {
  founder: 'Everything, including billing, SQL, messages and admins',
  ops: 'Customers, flags, overrides, support, bulk actions',
  finance: 'Plans and billing',
  support: 'Support tickets and read-only customer sessions',
  cs: 'Support and customer overrides',
  readonly: 'Can look, can’t change anything',
};

export default function Admins() {
  const { can, admin } = useCc();
  const confirm = useConfirm();
  const [me, setMe] = useState(null);
  const [activity, setActivity] = useState([]);
  const [team, setTeam] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [dlg, setDlg] = useState(null);
  const [secret, setSecret] = useState(null); // { title, lines[] } shown once
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    ccAuth.me().then((r) => setMe(r.data)).catch(() => {});
    ccApi.myActivity().then((r) => setActivity(r.data.activity)).catch(() => {});
    if (can('manage_admins')) ccApi.admins().then((r) => setTeam(r.data)).catch(() => setTeam(null));
    ccApi.impersonations().then((r) => setSessions(r.data.sessions)).catch(() => {});
  }, [can]);
  useEffect(() => { load(); }, [load]);

  const showOnce = (title, lines) => { setSecret({ title, lines }); setCopied(false); };
  const act = async (fn) => {
    try { await fn(); load(); }
    catch (e) { if (!e.response?.data?.need_step_up) await confirm({ title: 'That didn’t work', message: e.response?.data?.error || 'Try again', alertOnly: true, tone: 'danger' }); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Admins & Security</h1>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
        <Card>
          <H3>Your account</H3>
          <Row><span>Signed in as</span><span style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{admin?.email}</span></Row>
          <Row><span>Role</span><Pill tone="blue">{admin?.role}</Pill></Row>
          <Row><span>Two-step verification</span>{me?.mfa_enabled ? <Pill tone="green">on</Pill> : <Pill tone="red">off</Pill>}</Row>
          <Row><span>Recovery codes left</span><span style={{ fontWeight: 700, color: me && me.recovery_codes_left < 3 ? '#fbbf24' : undefined }}>{me?.recovery_codes_left ?? '—'}</span></Row>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <Btn onClick={() => setDlg('codes')}><KeyRound size={14} /> New recovery codes</Btn>
            <Btn subtle onClick={() => setDlg('password')}>Change password</Btn>
          </div>
        </Card>
        <Card>
          <H3>Your recent security activity</H3>
          {!activity.length && <Muted>Nothing yet.</Muted>}
          {activity.slice(0, 10).map((a, i) => (
            <Row key={i}><span>{a.action.replace(/^admin_/, '').replace(/_/g, ' ')}</span><span style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}>{a.ip || ''} · {fmtAgo(a.created_at)}</span></Row>
          ))}
        </Card>
      </div>

      <Card>
        <H3>Open customer sessions</H3>
        {!sessions.length && <Muted>No one is signed in as a customer right now.</Muted>}
        {sessions.map((s) => (
          <Row key={s.id}>
            <span>{s.admin_email} → <strong>{s.workspace_name || s.workspace_id}</strong> <Pill tone={s.mode === 'write' ? 'red' : 'purple'}>{s.mode}</Pill></span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}>{fmtAgo(s.started_at)}</span>
              <Btn color="#f87171" subtle onClick={() => act(() => ccApi.endImpersonation(s.id))}>End</Btn></span>
          </Row>
        ))}
      </Card>

      {can('manage_admins') && team && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 6px' }}><H3 right={<Btn onClick={() => setDlg('invite')}>+ Invite admin</Btn>}>Admin team</H3></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-dim,#666)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .4 }}>
                {['Admin', 'Role', '2FA', 'Status', 'Last sign-in', ''].map((h) => <th key={h} style={{ padding: '10px 14px' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {team.admins.map((a) => {
                  const self = a.id === admin?.id;
                  return (
                    <tr key={a.id} style={{ borderTop: '1px solid var(--border,#1e1e26)' }}>
                      <td style={td}><div style={{ fontWeight: 600 }}>{a.name || a.email}</div><div style={{ fontSize: 11.5, color: 'var(--text-dim,#666)' }}>{a.email}{self ? ' · you' : ''}</div></td>
                      <td style={td}>
                        <select aria-label={`Role for ${a.email}`} value={a.role} disabled={self} style={selectStyle}
                          onChange={async (e) => { const role = e.target.value; if (await confirm({ title: `Make ${a.email} ${role}?`, message: ROLE_INFO[role], confirmLabel: 'Change role' })) act(() => ccApi.updateAdmin(a.id, { role })); }}>
                          {team.roles.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td style={td}>{a.mfa_enabled ? <Pill tone="green">on</Pill> : <Pill tone="amber">pending</Pill>}</td>
                      <td style={td}><Pill tone={a.status === 'active' ? 'green' : 'neutral'}>{a.status}</Pill></td>
                      <td style={{ ...td, color: 'var(--text-dim,#666)' }}>{a.last_login_at ? fmtAgo(a.last_login_at) : 'never'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {!self && <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button style={linkBtn} onClick={async () => { if (await confirm({ title: 'Reset two-step verification?', message: `${a.email} sets it up again at their next sign-in. Their sessions end now.`, confirmLabel: 'Reset 2FA', tone: 'danger' })) act(() => ccApi.resetAdmin2fa(a.id)); }}>Reset 2FA</button>
                          <button style={linkBtn} onClick={async () => { if (await confirm({ title: 'Reset password?', message: 'A new temporary password is created and shown once.', confirmLabel: 'Reset password', tone: 'danger' })) act(async () => { const r = await ccApi.resetAdminPassword(a.id); showOnce(`Temporary password for ${a.email}`, [r.data.temporary_password]); }); }}>Reset password</button>
                          <button style={linkBtn} onClick={() => act(() => ccApi.signOutAdmin(a.id))}>Sign out</button>
                          <button style={{ ...linkBtn, color: a.status === 'active' ? '#f87171' : '#34d399' }} onClick={async () => {
                            const next = a.status === 'active' ? 'disabled' : 'active';
                            if (await confirm({ title: next === 'disabled' ? `Disable ${a.email}?` : `Re-enable ${a.email}?`, confirmLabel: next === 'disabled' ? 'Disable' : 'Enable', tone: next === 'disabled' ? 'danger' : undefined })) act(() => ccApi.updateAdmin(a.id, { status: next }));
                          }}>{a.status === 'active' ? 'Disable' : 'Enable'}</button>
                        </span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 18px 16px', display: 'grid', gap: 4 }}>
            {Object.entries(ROLE_INFO).map(([r, t]) => <div key={r} style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}><strong style={{ color: 'var(--text-muted,#9a9aa5)' }}>{r}</strong> — {t}</div>)}
          </div>
        </Card>
      )}

      <FormDialog open={dlg === 'invite'} title="Invite an admin" description="They get a temporary password (shown once) and set up two-step verification at their first sign-in."
        initial={{ email: '', name: '', role: 'support' }}
        fields={[
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'name', label: 'Name', placeholder: 'Optional' },
          { name: 'role', label: 'Role', type: 'select', options: Object.keys(ROLE_INFO).map((r) => [r, `${r} — ${ROLE_INFO[r]}`]) },
        ]} submitLabel="Invite" onClose={() => setDlg(null)}
        onSubmit={async (v) => { const r = await ccApi.inviteAdmin(v); setDlg(null); load(); showOnce(`Temporary password for ${v.email}`, [r.data.temporary_password, 'Sign in at /control/login']); }} />
      <FormDialog open={dlg === 'codes'} title="New recovery codes" description="Your old codes stop working. Enter a code from your authenticator app to confirm."
        fields={[{ name: 'code', label: 'Authenticator code', required: true, placeholder: '123456' }]} submitLabel="Create codes" onClose={() => setDlg(null)}
        onSubmit={async (v) => { const r = await ccAuth.newRecoveryCodes(v.code.trim()); setDlg(null); load(); showOnce('Your new recovery codes', r.data.recovery_codes); }} />
      <FormDialog open={dlg === 'password'} title="Change your password" description="At least 12 characters. You’ll be signed out everywhere and sign in again."
        fields={[{ name: 'current', label: 'Current password', type: 'password', required: true }, { name: 'next', label: 'New password', type: 'password', required: true }]}
        submitLabel="Change password" onClose={() => setDlg(null)}
        onSubmit={async (v) => { await ccApi.changeMyPassword(v.current, v.next); localStorage.removeItem('cc_token'); window.location.href = '/control/login'; }} />

      {secret && (
        <div role="dialog" aria-modal="true" aria-label={secret.title} data-dismiss onClick={(e) => { if (e.target === e.currentTarget) setSecret(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', zIndex: 200, padding: 16 }}>
          <Card style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 8 }}><ShieldCheck size={16} /> {secret.title}</div>
            <Muted style={{ marginBottom: 10 }}>Shown only once. Copy it somewhere safe now.</Muted>
            <div style={{ display: 'grid', gridTemplateColumns: secret.lines.length > 2 ? 'repeat(2, minmax(0,1fr))' : '1fr', gap: 6, padding: 12, borderRadius: 10, background: 'var(--bg,#0a0a0f)', border: '1px solid var(--border,#1e1e26)', fontFamily: 'ui-monospace, monospace', fontSize: 14, overflowWrap: 'anywhere' }}>
              {secret.lines.map((l) => <span key={l}>{l}</span>)}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Btn subtle onClick={async () => { try { await navigator.clipboard.writeText(secret.lines.join('\n')); setCopied(true); } catch {} }}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</Btn>
              <Btn onClick={() => setSecret(null)}>Done</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

const td = { padding: '11px 14px', verticalAlign: 'top' };
const linkBtn = { background: 'none', border: 'none', color: 'var(--accent,#818cf8)', cursor: 'pointer', fontSize: 12.5, padding: '2px 4px' };
