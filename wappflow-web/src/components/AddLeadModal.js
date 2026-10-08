'use client';

import { useState, useEffect } from 'react';
import { User, Phone, DollarSign, MessageSquare, Tag, Instagram, Facebook } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Field, Input, Textarea, Select } from '@/components/ui/Field';
import { LEAD_STATUS_KEYS, leadStatusMeta } from '@/lib/leadStatus';

// Batch C migration: was the app's only Tailwind modal — a hardcoded #0f1117 dark slab
// that ignored light mode and had no focus trap/Escape/aria. Now a Modal-primitive
// adopter; status options come from the lead-status registry (single source of keys,
// D3). Batch D: fields moved onto the Field system (label/required/aria wiring).

export default function AddLeadModal({ isOpen, onClose, onLeadAdded, pipelineId = null }) {
  const EMPTY = { customer_name: '', customer_phone: '', instagram: '', facebook: '', status: 'New', estimated_value: '', first_message: '' };
  const [formData, setFormData] = useState(EMPTY);
  // The studio's own currency (the label was hard-coded to "Rs").
  const [sym, setSym] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    import('../lib/api').then(({ settingsAPI }) => settingsAPI.getCompany()).then((r) => setSym(r.data?.company?.currency_symbol || '')).catch(() => {});
  }, [isOpen]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // The API tells us WHICH lead the phone number already belongs to; the modal used
  // to throw that away and show a dead-end error (audit crm-leads-3).
  const [duplicateId, setDuplicateId] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setDuplicateId(null);
    // Any one way to reach them is enough: WhatsApp, Instagram or Facebook.
    if (!formData.customer_phone.trim() && !formData.instagram.trim() && !formData.facebook.trim()) {
      setError('Add a WhatsApp number, an Instagram username or a Facebook name, so you can reach this contact.');
      return;
    }
    setLoading(true);
    try {
      const { leadsAPI } = await import('../lib/api');
      await leadsAPI.create({
        ...formData,
        ...(pipelineId ? { pipeline_id: pipelineId } : {}),
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : null
      });
      setFormData(EMPTY);
      if (onLeadAdded) onLeadAdded();
      onClose();
    } catch (err) {
      const d = err.response?.data || {};
      setError(d.error || (err.response ? 'We couldn’t save this contact. Please try again.' : 'We couldn’t reach WappFlow. Check your internet connection and try again.'));
      // A duplicate is not a failure — it means the contact is already here.
      if (d.existing_id) setDuplicateId(d.existing_id);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="New Lead"
      description="Add a contact to your pipeline"
      size="sm"
      style={{ maxWidth: 512 }}
      dismissable={!loading}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div style={{ padding: '10px 13px', background: 'var(--danger-bg)', border: '1.5px solid var(--danger-border)', borderRadius: 'var(--radius)', color: 'var(--danger-fg)', fontSize: 12.5 }}>
            {error}
            {duplicateId && (
              <a href={`/leads/${duplicateId}`}
                 style={{ display: 'inline-block', marginTop: 8, fontWeight: 700, color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Open that contact instead →
              </a>
            )}
          </div>
        )}

        <Field label={<><User size={13} /> Customer Name</>}>
          <Input
            type="text"
            data-autofocus
            value={formData.customer_name}
            onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
            placeholder="Ahmed Khan"
          />
        </Field>

        <fieldset style={{ border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px 14px', margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <legend style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', padding: '0 6px' }}>How can you reach them? <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>Add at least one</span></legend>
          <Field label={<><Phone size={13} /> WhatsApp number</>} hint="With the country code, e.g. +44 7700 900123">
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={formData.customer_phone}
              onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
              placeholder="+1 415 555 0123"
            />
          </Field>
          <Field label={<><Instagram size={13} /> Instagram username</>} hint="Their @username or profile link">
            <Input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={formData.instagram}
              onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
              placeholder="@their.username"
            />
          </Field>
          <Field label={<><Facebook size={13} /> Facebook</>} hint="Their profile link, or their name as shown on Facebook">
            <Input
              type="text"
              value={formData.facebook}
              onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
              placeholder="facebook.com/their.name"
            />
          </Field>
        </fieldset>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={<><Tag size={13} /> Status</>}>
            <Select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              {LEAD_STATUS_KEYS.map((key) => (
                <option key={key} value={key}>{leadStatusMeta(key).label}</option>
              ))}
            </Select>
          </Field>
          <Field label={<><DollarSign size={13} /> Value{sym ? ` (${sym})` : ''}</>}>
            <Input
              type="number"
              value={formData.estimated_value}
              onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
              placeholder="2,500"
            />
          </Field>
        </div>

        <Field label={<><MessageSquare size={13} /> First Message</>}>
          <Textarea
            value={formData.first_message}
            onChange={(e) => setFormData({ ...formData, first_message: e.target.value })}
            placeholder="Hi! I'm interested in your products..."
            rows={3}
            style={{ resize: 'none' }}
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading}>Create Lead</Button>
        </div>
      </form>
    </Modal>
  );
}
