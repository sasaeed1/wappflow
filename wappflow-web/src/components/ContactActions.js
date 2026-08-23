'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileSignature, Camera, Link2, Check, Loader2 } from 'lucide-react';
import Dropdown, { MenuItem } from '@/components/ui/Dropdown';
import { csAPI, mediaAPI, clientPortalAPI } from '@/lib/api';

// ContactActions — turn the contact you are looking at into the next thing.
//
// Phase 7. Lead and client pages were dead ends: the backend has always accepted
// a lead_id when creating a contract, a shoot or a portal link, but no screen
// offered it. To start a contract for the person on screen you had to leave,
// open Contracts, create a document, then hunt for the client in a picker — and
// most people simply did not, which is how the modules drifted apart into
// separate products sharing a login.
//
// Everything here creates the record ALREADY LINKED to this contact and then
// navigates to it, so the link cannot be forgotten halfway through.

export default function ContactActions({ lead, onDone }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [portal, setPortal] = useState(null);
  const [err, setErr] = useState('');

  if (!lead?.id) return null;
  const who = lead.customer_name || lead.wa_username || lead.customer_phone || 'Client';

  const newContract = async (close) => {
    setBusy('contract'); setErr('');
    try {
      const r = await csAPI.create({ lead_id: lead.id, title: `Agreement — ${who}`, type: 'contract' });
      const id = r.data?.document?.id || r.data?.id;
      close();
      if (id) router.push(`/contracts/${id}`);
      else router.push('/contracts');
      onDone?.();
    } catch (e) {
      setErr(e?.response?.data?.error || 'Could not create the contract.');
    } finally { setBusy(''); }
  };

  const newShoot = async (close) => {
    setBusy('shoot'); setErr('');
    try {
      const r = await mediaAPI.createProject({ lead_id: lead.id, title: `${who} — shoot` });
      const id = r.data?.project?.id || r.data?.id;
      close();
      if (id) router.push(`/studio/${id}`);
      else router.push('/studio');
      onDone?.();
    } catch (e) {
      setErr(e?.response?.data?.error || 'Could not create the shoot.');
    } finally { setBusy(''); }
  };

  const portalLink = async () => {
    setBusy('portal'); setErr('');
    try {
      const r = await clientPortalAPI.link(lead.id);
      // The server builds this from FRONTEND_URL, which falls back to ''. A bare
      // /client/<token> is useless the moment it is pasted into WhatsApp, so make
      // it absolute here rather than trusting the deployment to be configured.
      let url = r.data?.url || '';
      if (url && !/^https?:/i.test(url) && typeof window !== 'undefined') {
        url = window.location.origin + (url.startsWith('/') ? url : '/' + url);
      }
      setPortal(url || null);
      // Copying is the point of the action — the link is useless in a dropdown.
      if (url) { try { await navigator.clipboard.writeText(url); } catch {} }
      onDone?.();
    } catch (e) {
      setErr(e?.response?.data?.error || 'Could not create the portal link.');
    } finally { setBusy(''); }
  };

  return (
    <Dropdown
      label="Create for this contact"
      width={260}
      trigger={(p) => (
        <button
          {...p}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            borderRadius: 10, border: '1.5px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)',
            fontWeight: 600, cursor: 'pointer', fontSize: 13,
          }}
        >
          <Plus size={14} /> Create
        </button>
      )}
    >
      {(close) => (
        <>
          <div style={{ padding: '6px 11px 8px', fontSize: 11, color: 'var(--text-muted)' }}>
            Linked to {who}
          </div>
          <MenuItem icon={busy === 'contract' ? Loader2 : FileSignature} onClick={() => newContract(close)}>
            New contract
          </MenuItem>
          <MenuItem icon={busy === 'shoot' ? Loader2 : Camera} onClick={() => newShoot(close)}>
            New shoot
          </MenuItem>
          <MenuItem icon={busy === 'portal' ? Loader2 : (portal ? Check : Link2)} onClick={portalLink}>
            {portal ? 'Portal link copied' : 'Client portal link'}
          </MenuItem>
          {portal && (
            <div style={{ padding: '4px 11px 8px', fontSize: 10.5, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
              {portal}
            </div>
          )}
          {err && (
            <div role="alert" style={{ padding: '6px 11px', fontSize: 11.5, color: 'var(--danger-fg,#b91c1c)' }}>
              {err}
            </div>
          )}
        </>
      )}
    </Dropdown>
  );
}
