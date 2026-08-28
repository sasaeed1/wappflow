'use client';
/* eslint-disable @next/next/no-img-element -- contract media are user URLs */

import {
  Type, Heading1, Image as ImageIcon, Images, Video, Table, Package, Plus,
  ListChecks, HelpCircle, GitCommitVertical, Quote, Minus, Megaphone, MousePointerClick,
  Code, LayoutTemplate, PenLine, CheckSquare, SquarePen,
} from 'lucide-react';
import { mediaUrl } from '../../lib/api';
import { clickable } from '@/lib/a11y';

// Every block type in the spec. `group` drives the inserter sections.
export const BLOCK_TYPES = [
  { type: 'heading', label: 'Heading', icon: Heading1, group: 'Basic' },
  { type: 'text', label: 'Text', icon: Type, group: 'Basic' },
  { type: 'callout', label: 'Callout', icon: Megaphone, group: 'Basic' },
  { type: 'divider', label: 'Divider', icon: Minus, group: 'Basic' },
  { type: 'button', label: 'Button', icon: MousePointerClick, group: 'Basic' },
  { type: 'image', label: 'Image', icon: ImageIcon, group: 'Media' },
  { type: 'gallery', label: 'Gallery', icon: Images, group: 'Media' },
  { type: 'video', label: 'Video', icon: Video, group: 'Media' },
  { type: 'embed', label: 'Embed', icon: Code, group: 'Media' },
  { type: 'pricing_table', label: 'Pricing table', icon: Table, group: 'Pricing' },
  { type: 'package', label: 'Packages', icon: Package, group: 'Pricing' },
  { type: 'addons', label: 'Optional add-ons', icon: Plus, group: 'Pricing' },
  { type: 'timeline', label: 'Timeline', icon: GitCommitVertical, group: 'Content' },
  { type: 'checklist', label: 'Checklist', icon: ListChecks, group: 'Content' },
  { type: 'faq', label: 'FAQ', icon: HelpCircle, group: 'Content' },
  { type: 'testimonial', label: 'Testimonial', icon: Quote, group: 'Content' },
  { type: 'custom_section', label: 'Custom section', icon: LayoutTemplate, group: 'Content' },
  // A field the SIGNER fills in, placed where it belongs in the document.
  // The old 'signature' block below is decorative — it draws a dashed box that
  // says the client signs somewhere else. This one is the thing they sign.
  { type: 'field', label: 'Fillable field', icon: SquarePen, group: 'Action' },
  { type: 'signature', label: 'Signature (decorative)', icon: PenLine, group: 'Action' },
  { type: 'approval', label: 'Approval', icon: CheckSquare, group: 'Action' },
];

const csSelect = {
  padding: '5px 9px', borderRadius: 8, border: '1px solid var(--cs-line)',
  background: 'var(--cs-surface)', color: 'var(--cs-ink)', fontSize: 12.5, fontFamily: 'inherit',
};

// Changing the KIND retitles the field, but only when the label is still the one
// we generated — a label the user typed is theirs and must survive the switch.
const FIELD_DEFAULT_LABELS = { signature: 'Signature', initials: 'Initials', date: 'Date', text: 'Your answer', checkbox: 'I agree' };
function defaultFieldLabel(nextKind, currentLabel, prevKind) {
  const wasGenerated = !currentLabel || currentLabel === FIELD_DEFAULT_LABELS[prevKind];
  return wasGenerated ? FIELD_DEFAULT_LABELS[nextKind] : currentLabel;
}

export function defaultData(type) {
  switch (type) {
    case 'heading': return { text: 'Heading', level: 1 };
    case 'text': return { text: '' };
    case 'callout': return { emoji: '💡', text: 'Something worth highlighting.' };
    case 'divider': return {};
    case 'button': return { label: 'Get started', url: '' };
    case 'image': return { url: '', caption: '' };
    case 'gallery': return { urls: [] };
    case 'video': return { url: '' };
    case 'embed': return { url: '' };
    case 'pricing_table': return { currency: '$', rows: [{ name: 'Service', desc: '', price: '0' }] };
    case 'package': return { currency: '$', selectable: true, packages: [{ name: 'Standard', price: '1000', features: ['Feature one', 'Feature two'], featured: false }] };
    case 'addons': return { currency: '$', items: [{ label: 'Rush delivery', price: '200', on: false }] };
    case 'timeline': return { items: [{ title: 'Kickoff', desc: 'Week 1' }] };
    case 'checklist': return { items: [{ text: 'Deliverable' }] };
    case 'faq': return { items: [{ q: 'Question?', a: 'Answer.' }] };
    case 'testimonial': return { quote: 'They were incredible to work with.', author: 'Happy client' };
    case 'custom_section': return { title: 'Section title', text: '' };
    // Required by default: an optional signature is almost always a mistake,
    // and the cost of the default being wrong is one click. Mirrors
    // backend/contract-fields.js, which is the authority.
    case 'field': return { kind: 'signature', role: 'client', label: 'Signature', required: true };
    case 'signature': return { label: 'Signature' };
    case 'approval': return { label: 'Do you approve this proposal?' };
    default: return {};
  }
}

// auto-sizing inline editors (field-sizing is supported in the target Chrome)
const TA = ({ v, on, ph, style }) => <textarea value={v || ''} onChange={e => on(e.target.value)} placeholder={ph} rows={1} style={{ width: '100%', border: 'none', background: 'transparent', resize: 'none', font: 'inherit', color: 'inherit', outline: 'none', fieldSizing: 'content', ...style }} />;
const IN = ({ v, on, ph, style }) => <input value={v || ''} onChange={e => on(e.target.value)} placeholder={ph} style={{ border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', outline: 'none', ...style }} />;
const money = (c, n) => `${c || '$'}${(Number(n) || 0).toLocaleString()}`;

// One renderer for edit (builder) AND view (portal). `onChange(data)` only in edit.
// `selected` (view-mode) lets the portal mark chosen packages/add-ons.
export function BlockView({ block, editing = false, onChange = () => {}, selected, onSelect = () => {} }) {
  const d = block.data || {};
  const set = (patch) => onChange({ ...d, ...patch });
  const heading = (text) => editing
    ? <TA v={text} on={t => set({ text: t })} ph="Heading" style={{ fontFamily: 'var(--cs-font-d)', fontWeight: 'var(--cs-display-wt)', letterSpacing: 'var(--cs-display-track)', fontSize: d.level === 2 ? 'clamp(20px,3vw,28px)' : 'clamp(26px,4.4vw,44px)', lineHeight: 1.1, color: 'var(--cs-ink)' }} />
    : <h2 className="cs-h" style={{ fontSize: d.level === 2 ? 'clamp(20px,3vw,28px)' : 'clamp(26px,4.4vw,44px)' }}>{text}</h2>;

  switch (block.type) {
    case 'heading': return heading(d.text);
    case 'custom_section':
      return (
        <div>
          {heading(d.title)}
          <div style={{ marginTop: 10 }}>{editing
            ? <TA v={d.text} on={t => set({ text: t })} ph="Write…" style={{ fontSize: 15.5, lineHeight: 1.7, color: 'var(--cs-ink-2)' }} />
            : <p className="cs-p" style={{ whiteSpace: 'pre-wrap' }}>{d.text}</p>}</div>
        </div>
      );
    case 'text':
      return editing
        ? <TA v={d.text} on={t => set({ text: t })} ph="Write something…" style={{ fontSize: 15.5, lineHeight: 1.7, color: 'var(--cs-ink-2)' }} />
        : <p className="cs-p" style={{ whiteSpace: 'pre-wrap' }}>{d.text}</p>;
    case 'callout':
      return (
        <div style={{ display: 'flex', gap: 12, padding: '16px 18px', borderRadius: 'var(--cs-radius)', background: 'var(--cs-surface)', border: '1px solid var(--cs-line)' }}>
          {editing ? <IN v={d.emoji} on={t => set({ emoji: t })} style={{ width: 28, fontSize: 20 }} /> : <span style={{ fontSize: 20 }}>{d.emoji}</span>}
          <div style={{ flex: 1 }}>{editing ? <TA v={d.text} on={t => set({ text: t })} ph="Callout…" style={{ fontSize: 14.5, color: 'var(--cs-ink)' }} /> : <p style={{ margin: 0, fontSize: 14.5, color: 'var(--cs-ink)', whiteSpace: 'pre-wrap' }}>{d.text}</p>}</div>
        </div>
      );
    case 'divider': return <hr className="cs-rule" />;
    case 'button':
      return (
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '12px 24px', borderRadius: 999, background: 'var(--cs-accent)', color: 'var(--cs-on-accent)', fontWeight: 700, fontSize: 14.5 }}>
            {editing ? <IN v={d.label} on={t => set({ label: t })} ph="Button" style={{ textAlign: 'center', color: 'var(--cs-on-accent)' }} /> : (d.label || 'Button')}
          </span>
          {editing && <IN v={d.url} on={t => set({ url: t })} ph="https://… (link)" style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--cs-ink-2)', width: '100%' }} />}
        </div>
      );
    case 'image':
      return (
        <figure style={{ margin: 0 }}>
          {d.url ? <img src={mediaUrl(d.url)} alt={d.caption || ''} style={{ width: '100%', borderRadius: 'var(--cs-radius)', display: 'block' }} />
            : editing ? <div style={{ padding: 28, border: '1px dashed var(--cs-line)', borderRadius: 'var(--cs-radius)', textAlign: 'center', color: 'var(--cs-ink-2)', fontSize: 13 }}>Paste an image URL below</div> : null}
          {editing && <IN v={d.url} on={t => set({ url: t })} ph="Image URL" style={{ display: 'block', width: '100%', marginTop: 8, fontSize: 12.5, color: 'var(--cs-ink-2)' }} />}
          {(d.caption || editing) && (editing ? <IN v={d.caption} on={t => set({ caption: t })} ph="Caption (optional)" style={{ display: 'block', width: '100%', marginTop: 6, fontSize: 12.5, color: 'var(--cs-ink-2)', textAlign: 'center' }} /> : <figcaption style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--cs-ink-2)', marginTop: 8 }}>{d.caption}</figcaption>)}
        </figure>
      );
    case 'gallery': {
      const urls = d.urls || [];
      return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 8 }}>
            {urls.filter(Boolean).map((u, i) => <img key={i} src={mediaUrl(u)} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10 }} />)}
          </div>
          {editing && <TA v={urls.join('\n')} on={t => set({ urls: t.split('\n').map(s => s.trim()) })} ph="One image URL per line" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--cs-ink-2)', border: '1px dashed var(--cs-line)', borderRadius: 8, padding: 8 }} />}
        </div>
      );
    }
    case 'video':
    case 'embed':
      return (
        <div>
          {d.url ? <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 'var(--cs-radius)', overflow: 'hidden', background: '#000' }}><iframe src={toEmbed(d.url)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} allowFullScreen /></div>
            : editing ? <div style={{ padding: 28, border: '1px dashed var(--cs-line)', borderRadius: 'var(--cs-radius)', textAlign: 'center', color: 'var(--cs-ink-2)', fontSize: 13 }}>Paste a {block.type === 'video' ? 'video' : 'embed'} URL below</div> : null}
          {editing && <IN v={d.url} on={t => set({ url: t })} ph={block.type === 'video' ? 'YouTube/Vimeo/MP4 URL' : 'Embed URL'} style={{ display: 'block', width: '100%', marginTop: 8, fontSize: 12.5, color: 'var(--cs-ink-2)' }} />}
        </div>
      );
    case 'pricing_table': {
      const rows = d.rows || [];
      const total = rows.reduce((s, r) => s + (Number(r.price) || 0), 0);
      return (
        <div style={{ border: '1px solid var(--cs-line)', borderRadius: 'var(--cs-radius)', overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--cs-line)' }}>
              <div style={{ flex: 1 }}>
                {editing ? <IN v={r.name} on={t => editRow(rows, i, { name: t }, set)} ph="Item" style={{ fontWeight: 700, color: 'var(--cs-ink)', width: '100%' }} /> : <div style={{ fontWeight: 700, color: 'var(--cs-ink)' }}>{r.name}</div>}
                {editing ? <IN v={r.desc} on={t => editRow(rows, i, { desc: t }, set)} ph="Description" style={{ fontSize: 13, color: 'var(--cs-ink-2)', width: '100%' }} /> : (r.desc && <div style={{ fontSize: 13, color: 'var(--cs-ink-2)' }}>{r.desc}</div>)}
              </div>
              {editing ? <IN v={r.price} on={t => editRow(rows, i, { price: t }, set)} ph="0" style={{ width: 80, textAlign: 'right', fontWeight: 700, color: 'var(--cs-ink)' }} /> : <div style={{ fontWeight: 700, color: 'var(--cs-ink)' }}>{money(d.currency, r.price)}</div>}
              {editing && <button onClick={() => set({ rows: rows.filter((_, x) => x !== i) })} style={miniX}>×</button>}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--cs-surface)', fontWeight: 800, color: 'var(--cs-ink)' }}>
            <span>Total</span><span>{money(d.currency, total)}</span>
          </div>
          {editing && <button onClick={() => set({ rows: [...rows, { name: 'Service', desc: '', price: '0' }] })} style={addRow}>+ Add row</button>}
        </div>
      );
    }
    case 'package': {
      const pks = d.packages || [];
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${pks.length > 2 ? 200 : 240}px, 1fr))`, gap: 12 }}>
          {pks.map((p, i) => {
            const isSel = selected === i;
            return (
              <div key={i} {...clickable(() => !editing && d.selectable && onSelect(i))}
                style={{ position: 'relative', border: `2px solid ${isSel ? 'var(--cs-accent)' : 'var(--cs-line)'}`, borderRadius: 'var(--cs-radius)', padding: 18, background: p.featured ? 'var(--cs-surface)' : 'transparent', cursor: (!editing && d.selectable) ? 'pointer' : 'default', transition: 'border-color .15s, transform .15s' }}>
                {p.featured && <span style={{ position: 'absolute', top: -10, left: 16, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cs-on-accent)', background: 'var(--cs-accent)', padding: '3px 9px', borderRadius: 999 }}>Popular</span>}
                {editing ? <IN v={p.name} on={t => editRow(pks, i, { name: t }, x => set({ packages: x }))} ph="Package" style={{ fontWeight: 800, fontSize: 17, color: 'var(--cs-ink)', width: '100%' }} /> : <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--cs-ink)' }}>{p.name}</div>}
                <div style={{ margin: '8px 0 12px', fontFamily: 'var(--cs-font-d)', fontWeight: 'var(--cs-display-wt)', fontSize: 28, color: 'var(--cs-ink)' }}>
                  {editing ? <>{d.currency}<IN v={p.price} on={t => editRow(pks, i, { price: t }, x => set({ packages: x }))} ph="0" style={{ width: 90, color: 'var(--cs-ink)' }} /></> : money(d.currency, p.price)}
                </div>
                {editing
                  ? <TA v={(p.features || []).join('\n')} on={t => editRow(pks, i, { features: t.split('\n') }, x => set({ packages: x }))} ph="One feature per line" style={{ fontSize: 13.5, color: 'var(--cs-ink-2)' }} />
                  : <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>{(p.features || []).filter(Boolean).map((f, x) => <li key={x} style={{ fontSize: 13.5, color: 'var(--cs-ink-2)', display: 'flex', gap: 7 }}><span style={{ color: 'var(--cs-accent)' }}>✓</span>{f}</li>)}</ul>}
                {editing && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                    <label style={{ fontSize: 11.5, color: 'var(--cs-ink-2)', display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={!!p.featured} onChange={e => editRow(pks, i, { featured: e.target.checked }, x => set({ packages: x }))} /> Popular</label>
                    <button onClick={() => set({ packages: pks.filter((_, x) => x !== i) })} style={miniX}>×</button>
                  </div>
                )}
                {!editing && d.selectable && <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: isSel ? 'var(--cs-accent)' : 'var(--cs-ink-2)' }}>{isSel ? '✓ Selected' : 'Select'}</div>}
              </div>
            );
          })}
          {editing && <button onClick={() => set({ packages: [...pks, { name: 'Package', price: '0', features: [''], featured: false }] })} style={{ ...addRow, border: '1px dashed var(--cs-line)', borderRadius: 'var(--cs-radius)' }}>+ Package</button>}
        </div>
      );
    }
    case 'addons': {
      const items = d.items || [];
      const isOn = (i) => editing ? !!items[i].on : (selected instanceof Set ? selected.has(i) : !!items[i].on);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it, i) => (
            <div key={i} {...clickable(() => !editing && onSelect(i))}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: `1px solid ${isOn(i) && !editing ? 'var(--cs-accent)' : 'var(--cs-line)'}`, borderRadius: 'var(--cs-radius)', cursor: editing ? 'default' : 'pointer' }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${isOn(i) ? 'var(--cs-accent)' : 'var(--cs-line)'}`, background: isOn(i) ? 'var(--cs-accent)' : 'transparent', color: 'var(--cs-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>{isOn(i) ? '✓' : ''}</span>
              {editing ? <IN v={it.label} on={t => editRow(items, i, { label: t }, x => set({ items: x }))} ph="Add-on" style={{ flex: 1, color: 'var(--cs-ink)' }} /> : <span style={{ flex: 1, color: 'var(--cs-ink)' }}>{it.label}</span>}
              {editing ? <IN v={it.price} on={t => editRow(items, i, { price: t }, x => set({ items: x }))} ph="0" style={{ width: 70, textAlign: 'right', color: 'var(--cs-ink)' }} /> : <span style={{ fontWeight: 700, color: 'var(--cs-ink)' }}>+{money(d.currency, it.price)}</span>}
              {editing && <button onClick={() => set({ items: items.filter((_, x) => x !== i) })} style={miniX}>×</button>}
            </div>
          ))}
          {editing && <button onClick={() => set({ items: [...items, { label: 'Add-on', price: '0', on: false }] })} style={addRow}>+ Add-on</button>}
        </div>
      );
    }
    case 'timeline': {
      const items = d.items || [];
      return (
        <div style={{ borderLeft: '2px solid var(--cs-line)', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {items.map((it, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: -25, top: 4, width: 10, height: 10, borderRadius: 999, background: 'var(--cs-accent)' }} />
              {editing ? <IN v={it.title} on={t => editRow(items, i, { title: t }, x => set({ items: x }))} ph="Milestone" style={{ fontWeight: 700, color: 'var(--cs-ink)', width: '100%' }} /> : <div style={{ fontWeight: 700, color: 'var(--cs-ink)' }}>{it.title}</div>}
              {editing ? <IN v={it.desc} on={t => editRow(items, i, { desc: t }, x => set({ items: x }))} ph="Detail" style={{ fontSize: 13.5, color: 'var(--cs-ink-2)', width: '100%' }} /> : (it.desc && <div style={{ fontSize: 13.5, color: 'var(--cs-ink-2)' }}>{it.desc}</div>)}
              {editing && <button onClick={() => set({ items: items.filter((_, x) => x !== i) })} style={{ ...miniX, position: 'absolute', right: 0, top: 0 }}>×</button>}
            </div>
          ))}
          {editing && <button onClick={() => set({ items: [...items, { title: 'Milestone', desc: '' }] })} style={addRow}>+ Step</button>}
        </div>
      );
    }
    case 'checklist': {
      const items = d.items || [];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--cs-accent)' }}>✓</span>
              {editing ? <IN v={it.text} on={t => editRow(items, i, { text: t }, x => set({ items: x }))} ph="Item" style={{ flex: 1, color: 'var(--cs-ink)' }} /> : <span style={{ color: 'var(--cs-ink)' }}>{it.text}</span>}
              {editing && <button onClick={() => set({ items: items.filter((_, x) => x !== i) })} style={miniX}>×</button>}
            </div>
          ))}
          {editing && <button onClick={() => set({ items: [...items, { text: '' }] })} style={addRow}>+ Item</button>}
        </div>
      );
    }
    case 'faq': {
      const items = d.items || [];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((it, i) => (
            <div key={i} style={{ borderBottom: '1px solid var(--cs-line)', paddingBottom: 12 }}>
              {editing ? <IN v={it.q} on={t => editRow(items, i, { q: t }, x => set({ items: x }))} ph="Question" style={{ fontWeight: 700, color: 'var(--cs-ink)', width: '100%' }} /> : <div style={{ fontWeight: 700, color: 'var(--cs-ink)' }}>{it.q}</div>}
              {editing ? <TA v={it.a} on={t => editRow(items, i, { a: t }, x => set({ items: x }))} ph="Answer" style={{ fontSize: 14, color: 'var(--cs-ink-2)', marginTop: 4 }} /> : <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--cs-ink-2)', whiteSpace: 'pre-wrap' }}>{it.a}</p>}
              {editing && <button onClick={() => set({ items: items.filter((_, x) => x !== i) })} style={miniX}>× remove</button>}
            </div>
          ))}
          {editing && <button onClick={() => set({ items: [...items, { q: 'Question?', a: '' }] })} style={addRow}>+ Q&amp;A</button>}
        </div>
      );
    }
    case 'testimonial':
      return (
        <blockquote style={{ margin: 0, padding: '20px 24px', borderLeft: '3px solid var(--cs-accent)', background: 'var(--cs-surface)', borderRadius: '0 var(--cs-radius) var(--cs-radius) 0' }}>
          {editing ? <TA v={d.quote} on={t => set({ quote: t })} ph="Quote…" style={{ fontFamily: 'var(--cs-font-d)', fontSize: 18, color: 'var(--cs-ink)', fontStyle: 'italic' }} /> : <p style={{ margin: 0, fontFamily: 'var(--cs-font-d)', fontSize: 18, color: 'var(--cs-ink)', fontStyle: 'italic' }}>“{d.quote}”</p>}
          {editing ? <IN v={d.author} on={t => set({ author: t })} ph="— Author" style={{ marginTop: 8, fontSize: 13, color: 'var(--cs-ink-2)' }} /> : <footer style={{ marginTop: 8, fontSize: 13, color: 'var(--cs-ink-2)' }}>— {d.author}</footer>}
        </blockquote>
      );
    // A field the signer actually fills. In the STUDIO it renders as its own
    // configuration (what kind, who for, is it required); in the client's copy
    // the viewer replaces it with a real input — see app/d/[token].
    case 'field': {
      const KINDS = [
        ['signature', 'Signature'], ['initials', 'Initials'], ['date', 'Date'],
        ['text', 'Text answer'], ['checkbox', 'Checkbox'],
      ];
      const ROLES = [['client', 'Client'], ['company', 'You'], ['witness', 'Witness'], ['cosigner', 'Co-signer']];
      const kindLabel = (KINDS.find(k => k[0] === (d.kind || 'signature')) || KINDS[0])[1];
      const roleLabel = (ROLES.find(r => r[0] === (d.role || 'client')) || ROLES[0])[1];
      if (!editing) {
        return (
          <div style={{ border: '1.5px dashed var(--cs-accent)', borderRadius: 'var(--cs-radius)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, background: 'color-mix(in srgb, var(--cs-accent) 6%, transparent)' }}>
            <PenLine size={18} style={{ color: 'var(--cs-accent)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--cs-ink)' }}>
                {d.label || 'Field'}{d.required ? <span style={{ color: 'var(--cs-accent)' }}> *</span> : null}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--cs-ink-2)' }}>{kindLabel} · {roleLabel} fills this in</div>
            </div>
          </div>
        );
      }
      return (
        <div style={{ border: '1.5px dashed var(--cs-accent)', borderRadius: 'var(--cs-radius)', padding: 16, background: 'var(--cs-surface)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <select value={d.kind || 'signature'} onChange={e => set({ kind: e.target.value, label: defaultFieldLabel(e.target.value, d.label, d.kind) })}
                    style={csSelect}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={d.role || 'client'} onChange={e => set({ role: e.target.value })} style={csSelect}>
              {ROLES.map(([v, l]) => <option key={v} value={v}>for {l}</option>)}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--cs-ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={d.required !== false} onChange={e => set({ required: e.target.checked })} />
              Required
            </label>
          </div>
          <IN v={d.label} on={t => set({ label: t })} ph="Label the signer sees" style={{ color: 'var(--cs-ink)', fontWeight: 700, width: '100%' }} />
          <div style={{ fontSize: 12, color: 'var(--cs-ink-2)', marginTop: 6 }}>
            {d.required !== false
              ? 'They cannot sign until this is filled in.'
              : 'Optional — they can leave this blank.'}
          </div>
        </div>
      );
    }
    case 'signature':
      return (
        <div style={{ border: '1.5px dashed var(--cs-accent)', borderRadius: 'var(--cs-radius)', padding: 22, display: 'flex', alignItems: 'center', gap: 14, background: 'var(--cs-surface)' }}>
          <PenLine size={22} style={{ color: 'var(--cs-accent)' }} />
          <div>
            <div style={{ fontWeight: 700, color: 'var(--cs-ink)' }}>{editing ? <IN v={d.label} on={t => set({ label: t })} ph="Signature" style={{ color: 'var(--cs-ink)', fontWeight: 700 }} /> : (d.label || 'Signature')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--cs-ink-2)' }}>The client signs here in the portal.</div>
          </div>
        </div>
      );
    case 'approval':
      return (
        <div style={{ border: '1px solid var(--cs-line)', borderRadius: 'var(--cs-radius)', padding: 20, textAlign: 'center' }}>
          <div style={{ fontWeight: 700, color: 'var(--cs-ink)', marginBottom: 12 }}>{editing ? <IN v={d.label} on={t => set({ label: t })} ph="Approval prompt" style={{ color: 'var(--cs-ink)', fontWeight: 700, textAlign: 'center', width: '100%' }} /> : (d.label || 'Do you approve?')}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <span style={{ padding: '9px 20px', borderRadius: 999, background: 'var(--cs-accent)', color: 'var(--cs-on-accent)', fontWeight: 700, fontSize: 13.5 }}>Approve</span>
            <span style={{ padding: '9px 20px', borderRadius: 999, border: '1px solid var(--cs-line)', color: 'var(--cs-ink-2)', fontWeight: 600, fontSize: 13.5 }}>Decline</span>
          </div>
        </div>
      );
    default:
      return <div style={{ color: 'var(--cs-ink-2)', fontSize: 13 }}>Unknown block: {block.type}</div>;
  }
}

function editRow(arr, i, patch, set) { set(arr.map((r, x) => (x === i ? { ...r, ...patch } : r))); }
function toEmbed(url) {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return url;
}
const miniX = { width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--cs-ink-2)', cursor: 'pointer', fontSize: 16, flexShrink: 0 };
const addRow = { width: '100%', padding: '10px', border: 'none', background: 'transparent', color: 'var(--cs-ink-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center' };

// Letterhead banner + uploaded PDF/image — shared by the builder preview & portal.
export function DocFrame({ letterhead, upload }) {
  if (!letterhead && !upload) return null;
  return (
    <>
      {letterhead && <img src={mediaUrl(letterhead)} alt="" style={{ width: '100%', display: 'block', borderRadius: 'var(--cs-radius)', marginBottom: 4 }} />}
      {upload && (/pdf/i.test(upload.mime || upload.url) ? (
        <object data={mediaUrl(upload.url)} type="application/pdf" style={{ width: '100%', height: '78vh', borderRadius: 'var(--cs-radius)', border: '1px solid var(--cs-line)' }}>
          <a href={mediaUrl(upload.url)} target="_blank" rel="noreferrer" style={{ color: 'var(--cs-accent)' }}>Open {upload.filename || 'document'}</a>
        </object>
      ) : (
        <img src={mediaUrl(upload.url)} alt={upload.filename || ''} style={{ width: '100%', display: 'block', borderRadius: 'var(--cs-radius)', border: '1px solid var(--cs-line)' }} />
      ))}
    </>
  );
}

// Compute live totals from package selection + add-ons (used by builder + portal).
export function computeTotals(blocks, selection = {}) {
  let total = 0; let currency = '$';
  blocks.forEach((b, idx) => {
    const d = b.data || {};
    if (b.type === 'pricing_table') { currency = d.currency || currency; (d.rows || []).forEach(r => { total += Number(r.price) || 0; }); }
    if (b.type === 'package') { currency = d.currency || currency; const sel = selection[idx]; const p = (d.packages || [])[sel != null ? sel : (d.packages || []).findIndex(x => x.featured)]; if (p) total += Number(p.price) || 0; }
    if (b.type === 'addons') { currency = d.currency || currency; (d.items || []).forEach((it, i) => { const on = selection[`${idx}:${i}`] != null ? selection[`${idx}:${i}`] : it.on; if (on) total += Number(it.price) || 0; }); }
  });
  return { currency, total };
}
