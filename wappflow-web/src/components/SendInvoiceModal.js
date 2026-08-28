'use client';

// SendInvoiceModal — emailing an invoice, from wherever you are looking at one.
//
// This lived inside app/invoices/page.js, which meant the lead page could show
// you an invoice but not send it: the one place you are actually talking to the
// customer was the one place without a Send button. Copying it there would have
// produced a second version to drift out of step — the same mistake that let a
// sticker render as a picture on one code path and an attachment link on
// another. So it moves here and both pages mount the same component.
//
// Behaviour is unchanged from the invoices-page original.

import { useState } from 'react';
import { Mail, X } from 'lucide-react';
import { invoicesAPI } from '@/lib/api';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/Field';

export default function SendInvoiceModal({ invoice, company, onClose, onSent }) {
  const [to, setTo] = useState(invoice.customer_email || '');
  const [subject, setSubject] = useState(`Invoice ${invoice.invoice_number || ''} from ${company?.company_name || 'us'}`.trim());
  const [message, setMessage] = useState(
    `Hi ${invoice.customer_name || 'there'},\n\nPlease find your invoice below. Let me know if you have any questions.\n\nThank you!`
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // A field-level problem renders on the field; anything else renders in the banner.
  // Never both — two copies of one message (or a stale banner beside a fresh field
  // error) is worse than either alone.
  const RECIPIENT_ERROR = 'A recipient email is required.';
  const fieldError = error === RECIPIENT_ERROR ? error : null;
  const bannerError = error === RECIPIENT_ERROR ? null : error;

  const handleSend = async () => {
    if (!to.trim()) { setError(RECIPIENT_ERROR); return; }
    setSending(true);
    setError('');
    try {
      await invoicesAPI.sendEmail(invoice.id, { to: to.trim(), subject: subject.trim(), message });
      onSent();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not send the invoice.');
      setSending(false);
    }
  };

  return (
    <Modal open onClose={onClose} labelledBy="send-inv-title" hideClose padded={false} size="sm" style={{ maxWidth: 520 }} dismissable={!sending}>
        <div style={{ padding: '22px 26px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mail size={20} color="#6366f1" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 id="send-inv-title" style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Email Invoice</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>{invoice.invoice_number || `#${invoice.id}`} · A premium invoice will be sent.</p>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 10, padding: 7, cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={17} />
          </button>
        </div>
        <div style={{ padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {bannerError && (
            <div style={{ padding: '10px 13px', background: 'var(--danger-bg)', border: '1.5px solid var(--danger-border)', borderRadius: 10, color: 'var(--danger)', fontSize: 12.5 }}>{bannerError}</div>
          )}
          <Field label="Send to" required error={fieldError}>
            <Input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="customer@example.com" data-autofocus />
          </Field>
          <Field label="Subject">
            <Input value={subject} onChange={e => setSubject(e.target.value)} />
          </Field>
          <Field label="Message">
            <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} />
          </Field>
        </div>
        <div style={{ padding: '14px 26px 22px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button variant="primary" onClick={handleSend} loading={sending}>Send Invoice</Button>
        </div>
    </Modal>
  );
}
