'use client';

import { useState } from 'react';
import { User, Phone, DollarSign, MessageSquare, Tag } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { LEAD_STATUS_KEYS, leadStatusMeta } from '@/lib/leadStatus';

// Batch C migration: was the app's only Tailwind modal — a hardcoded #0f1117 dark slab
// that ignored light mode and had no focus trap/Escape/aria. Now a Modal-primitive
// adopter with token-driven fields; status options come from the lead-status registry
// (single source of keys, D3) instead of a duplicated hardcoded list.

const label = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
  letterSpacing: '0.5px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
};
const field = {
  width: '100%', padding: '10px 14px', background: 'var(--surface2)',
  border: '1.5px solid var(--border)', borderRadius: 'var(--radius)',
  color: 'var(--text)', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box',
};

export default function AddLeadModal({ isOpen, onClose, onLeadAdded }) {
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    status: 'New',
    estimated_value: '',
    first_message: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.customer_phone) { setError('Phone number is required'); return; }
    setLoading(true);
    try {
      const { leadsAPI } = await import('../lib/api');
      await leadsAPI.create({
        ...formData,
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : null
      });
      setFormData({ customer_name: '', customer_phone: '', status: 'New', estimated_value: '', first_message: '' });
      if (onLeadAdded) onLeadAdded();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create lead');
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
          </div>
        )}

        <div>
          <label style={label}><User size={13} /> Customer Name</label>
          <input
            type="text"
            data-autofocus
            value={formData.customer_name}
            onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
            placeholder="Ahmed Khan"
            style={field}
          />
        </div>

        <div>
          <label style={label}><Phone size={13} /> Phone Number *</label>
          <input
            type="tel"
            value={formData.customer_phone}
            onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
            placeholder="+92 300 1234567"
            required
            style={field}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={label}><Tag size={13} /> Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              style={field}
            >
              {LEAD_STATUS_KEYS.map((key) => (
                <option key={key} value={key}>{leadStatusMeta(key).label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}><DollarSign size={13} /> Value (Rs)</label>
            <input
              type="number"
              value={formData.estimated_value}
              onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
              placeholder="25,000"
              style={field}
            />
          </div>
        </div>

        <div>
          <label style={label}><MessageSquare size={13} /> First Message</label>
          <textarea
            value={formData.first_message}
            onChange={(e) => setFormData({ ...formData, first_message: e.target.value })}
            placeholder="Hi! I'm interested in your products..."
            rows={3}
            style={{ ...field, resize: 'none', lineHeight: 1.5 }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading}>Create Lead</Button>
        </div>
      </form>
    </Modal>
  );
}
