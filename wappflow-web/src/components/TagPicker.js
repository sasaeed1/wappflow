'use client';

import { useState, useRef, useEffect } from 'react';
import { Tag, Plus, X, Check } from 'lucide-react';
import { tagsAPI } from '../lib/api';

// Tiny pill shown anywhere on a lead
export function TagChip({ tag, onRemove, size = 'md' }) {
  const sm = size === 'sm';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: sm ? 3 : 4,
      padding: sm ? '2px 7px' : '3px 10px',
      borderRadius: 20,
      background: tag.color + '22',
      border: `1.5px solid ${tag.color}55`,
      color: tag.color,
      fontSize: sm ? 10 : 11,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      lineHeight: 1.4,
    }}>
      <span style={{ width: sm ? 5 : 6, height: sm ? 5 : 6, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
      {tag.name}
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove(tag.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: tag.color, opacity: 0.7, marginLeft: 1 }}>
          <X style={{ width: sm ? 9 : 10, height: sm ? 9 : 10 }} />
        </button>
      )}
    </span>
  );
}

// Floating popover to assign / remove tags on a lead
export function TagPicker({ leadId, assignedTags = [], allTags = [], onToggle, className }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = (e) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(!open);
  };

  const assignedIds = new Set(assignedTags.map(t => t.id));

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 20,
          border: '1.5px dashed #d1d5db',
          background: open ? '#f3f4f6' : 'transparent',
          color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1'; }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#9ca3af'; } }}
      >
        <Tag style={{ width: 10, height: 10 }} />
        {assignedTags.length === 0 ? 'Add tag' : 'Tags'}
        <Plus style={{ width: 9, height: 9 }} />
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            zIndex: 9999,
            background: 'var(--surface)',
            border: '1.5px solid #e5e7eb',
            borderRadius: 14,
            boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
            minWidth: 210,
            overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>Assign Tags</span>
          </div>
          {allTags.length === 0 ? (
            <div style={{ padding: '16px 14px', fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>
              No tags yet — create them in Settings
            </div>
          ) : (
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {allTags.map(tag => {
                const active = assignedIds.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => { onToggle(tag, active); }}
                    style={{
                      width: '100%', padding: '9px 14px', border: 'none',
                      background: active ? tag.color + '18' : 'white',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f9fafb'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = active ? tag.color + '18' : 'white'; }}
                  >
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'left' }}>{tag.name}</span>
                    {active && <Check style={{ width: 13, height: 13, color: tag.color }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

