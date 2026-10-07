'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { pipelinesAPI } from '@/lib/api';
import { useConfirm } from '@/lib/confirm';
import { toast } from '@/components/ui/Toast';

// Manage pipelines (PROP-006): add a board, rename it, relabel its stages, or
// delete it (its leads move back to the default board — nothing is lost).
export default function PipelinesDialog({ open, onClose, data, onChanged }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);   // pipeline being edited (copy)
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const stages = data?.stages || [];

  useEffect(() => { if (open) { setEditing(null); setNewName(''); } }, [open]);

  const fail = (e, f) => toast.error(e?.response?.data?.error || f);
  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try { await pipelinesAPI.create({ name: newName.trim() }); setNewName(''); toast.success('Pipeline added'); onChanged?.(); }
    catch (e) { fail(e, 'Could not add the pipeline'); }
    setBusy(false);
  };
  const save = async () => {
    setBusy(true);
    try { await pipelinesAPI.update(editing.id, { name: editing.name, stage_labels: editing.stage_labels }); setEditing(null); toast.success('Saved'); onChanged?.(); }
    catch (e) { fail(e, 'Could not save'); }
    setBusy(false);
  };
  const remove = async (p) => {
    const ok = await confirm({ title: `Delete “${p.name}”?`, message: `Its ${p.lead_count} lead${p.lead_count === 1 ? '' : 's'} will move to your default pipeline. Nothing is deleted.`, confirmLabel: 'Delete pipeline', tone: 'danger' });
    if (!ok) return;
    try { await pipelinesAPI.remove(p.id); toast.success('Pipeline deleted'); onChanged?.(); }
    catch (e) { fail(e, 'Could not delete'); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit “${editing.name || 'pipeline'}”` : 'Pipelines'} size="md"
      description={editing ? 'Rename the board and, if you like, give its stages your own names. Leads, reports and automations keep working the same.' : 'Keep separate boards for different kinds of work, for example weddings and corporate, or rentals and sales.'}
      footer={editing
        ? <><Button onClick={() => setEditing(null)}>Back</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>
        : <Button onClick={onClose}>Done</Button>}>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Name" required>
            <Input value={editing.name} maxLength={60} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </Field>
          <p style={{ fontSize: 12.5, fontWeight: 700, margin: '6px 0 0', color: 'var(--text-muted)' }}>Stage names</p>
          {stages.map((s) => (
            <Field key={s} label={s}>
              <Input value={editing.stage_labels?.[s] || ''} maxLength={40} placeholder={s}
                onChange={(e) => setEditing({ ...editing, stage_labels: { ...(editing.stage_labels || {}), [s]: e.target.value } })} />
            </Field>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(data?.pipelines || []).map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{p.name}{p.is_default && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}> · default</span>}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.lead_count} lead{p.lead_count === 1 ? '' : 's'}</div>
              </div>
              <Button size="sm" onClick={() => setEditing({ ...p, stage_labels: { ...(p.stage_labels || {}) } })}>Edit</Button>
              {!p.is_default && <Button size="sm" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}><Trash2 size={14} /></Button>}
            </div>
          ))}
          {data?.can_add ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Input aria-label="New pipeline name" value={newName} maxLength={60} placeholder="New pipeline, e.g. Corporate events"
                onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
              <Button variant="primary" loading={busy} disabled={!newName.trim()} onClick={add}><Plus size={14} /> Add</Button>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0' }}>More than one pipeline is available on Studio and above. <a href="/settings?tab=plan" style={{ color: 'var(--accent)', fontWeight: 600 }}>See plans</a></p>
          )}
        </div>
      )}
    </Modal>
  );
}
