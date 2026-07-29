'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Users, TrendingUp, TrendingDown, Trophy, DollarSign, MessageSquare, MessageCircle, Plus, LogOut,
  Bell, Search, Phone, Trash2, Zap, LayoutGrid, List,
  ChevronRight, X, Settings, Clock, CheckCircle, AlertCircle,
  ArrowUpRight, Activity, Target, Star, Upload, FileText,
  BarChart2, HelpCircle, UserCheck, Download, RefreshCw,
  Volume2, VolumeX, Wifi, WifiOff,
  Camera, Globe as GlobeIcon, MonitorSmartphone, Layers
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { leadsAPI, analyticsAPI, tagsAPI, displayPhone, PLATFORM_COLORS, BASE_URL, platformAccountsAPI, settingsAPI } from '../../lib/api';
import { isLeadUnread } from '../../lib/unread';
import AddLeadModal from '../../components/AddLeadModal';
import { TagChip, TagPicker } from '../../components/TagPicker';
import NavBar from '../../components/NavBar';
import { useSound } from '@/lib/sounds';

const COLUMNS = [
  { id: 'New',           label: 'New',        color: '#6366f1', light: 'rgba(99,102,241,0.2)' },
  { id: 'Contacted',     label: 'Contacted',  color: '#06b6d4', light: 'rgba(6,182,212,0.2)' },
  { id: 'Interested',    label: 'Interested', color: '#f59e0b', light: 'rgba(245,158,11,0.2)' },
  { id: 'Negotiating',   label: 'Negotiating',color: '#f97316', light: 'rgba(249,115,22,0.2)' },
  { id: 'Closed - Won',  label: '🏆 Won',     color: '#10b981', light: 'rgba(16,185,129,0.2)' },
  { id: 'Closed - Lost', label: '❌ Lost',    color: '#ef4444', light: 'rgba(239,68,68,0.2)' },
];

const STATUS_COLORS = {
  'New':           { dot: '#6366f1', bg: 'rgba(99,102,241,0.15)',  text: '#818cf8' },
  'Contacted':     { dot: '#06b6d4', bg: 'rgba(6,182,212,0.15)',   text: '#22d3ee' },
  'Interested':    { dot: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24' },
  'Negotiating':   { dot: '#f97316', bg: 'rgba(249,115,22,0.15)',  text: '#fb923c' },
  'Closed - Won':  { dot: '#10b981', bg: 'rgba(16,185,129,0.15)',  text: '#34d399' },
  'Closed - Lost': { dot: '#ef4444', bg: 'rgba(239,68,68,0.15)',   text: '#f87171' },
};

// ── Web Audio helpers ─────────────────────────────────────────────────────────
function playNewLeadSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Two-tone ascending chime
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i * 0.12 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.4);
    });
  } catch {}
}

function playNewMessageSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Single soft ping
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.45);
  } catch {}
}

// ── CSV Parser (handles quoted fields, commas inside quotes) ──────────────────
function parseCSV(text) {
  const rows = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  for (const line of lines) {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells.map(c => c.trim()));
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] || ''; });
    return obj;
  });
}

// ── Bulk Upload Modal ─────────────────────────────────────────────────────────
function BulkUploadModal({ isOpen, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { rows, count }
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const reset = () => { setFile(null); setPreview(null); setResult(null); setError(''); };

  const handleFile = async (f) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a .csv file');
      return;
    }
    setFile(f);
    setError('');
    try {
      const text = await f.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setError('CSV is empty or has no data rows');
        return;
      }
      setPreview({ rows, count: rows.length });
    } catch (e) {
      setError('Failed to parse CSV: ' + e.message);
    }
  };

  const handleUpload = async () => {
    if (!preview?.rows) return;
    setUploading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/leads/bulk-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ leads: preview.rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      // Backend returns { created, skipped, total } — normalize
      setResult({ imported: data.created ?? data.imported ?? 0, skipped: data.skipped ?? 0, total: data.total ?? preview.count });
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const a = document.createElement('a');
    a.href = '/leads-template.csv';
    a.download = 'leads-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="r-modal" style={{ background: 'var(--surface)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 520, boxShadow: '0 32px 80px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Bulk Upload Leads</h2>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '4px 0 0' }}>Import leads from a CSV file</p>
          </div>
          <button onClick={() => { reset(); onClose(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* Download template button */}
        {!result && (
          <button onClick={downloadTemplate}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 16px', background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', border: '1.5px solid #6ee7b7', borderRadius: 12, fontSize: 13, fontWeight: 700, color: '#047857', cursor: 'pointer', marginBottom: 16, transition: 'all 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
            <Download style={{ width: 16, height: 16 }} /> Download example template (leads-template.csv)
          </button>
        )}

        {/* CSV format hint */}
        {!result && (
          <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            <p style={{ fontWeight: 700, color: 'var(--text)', margin: '0 0 6px', fontSize: 13 }}>📋 Expected columns</p>
            <code style={{ background: 'var(--surface2)', padding: '6px 10px', borderRadius: 6, fontSize: 11, display: 'block', marginBottom: 8, color: 'var(--text-muted)', overflowX: 'auto' }}>
              customer_name, customer_phone, email, status, address, date_of_birth, lead_source, estimated_value
            </code>
            <p style={{ margin: '4px 0 0', fontSize: 11.5 }}>
              <strong style={{ color: '#dc2626' }}>customer_name</strong> &amp; <strong style={{ color: '#dc2626' }}>customer_phone</strong> required · others optional · duplicates skipped automatically
            </p>
          </div>
        )}

        {result ? (
          <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
            <CheckCircle style={{ width: 44, height: 44, color: '#10b981', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: '0 0 6px' }}>Import Complete!</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ background: 'rgba(16,185,129,0.15)', padding: '10px 20px', borderRadius: 12 }}>
                <p style={{ fontSize: 22, fontWeight: 900, color: '#10b981', margin: 0 }}>{result.imported}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Imported</p>
              </div>
              <div style={{ background: 'rgba(239,68,68,0.15)', padding: '10px 20px', borderRadius: 12 }}>
                <p style={{ fontSize: 22, fontWeight: 900, color: '#ef4444', margin: 0 }}>{result.skipped}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Skipped</p>
              </div>
            </div>
            <button onClick={() => { reset(); onDone(); onClose(); }} style={{ padding: '10px 28px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Drop zone */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
              style={{
                border: `2px dashed ${file ? '#6366f1' : 'var(--border)'}`,
                borderRadius: 14, padding: '24px 20px', textAlign: 'center',
                cursor: 'pointer', marginBottom: 14, background: file ? 'rgba(99,102,241,0.15)' : 'var(--surface2)',
                transition: 'all 0.2s'
              }}
            >
              <Upload style={{ width: 28, height: 28, color: file ? '#6366f1' : '#9ca3af', margin: '0 auto 8px' }} />
              {file ? (
                <>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#6366f1', margin: '0 0 2px' }}>{file.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
                    {(file.size / 1024).toFixed(1)} KB · {preview ? `${preview.count} row${preview.count === 1 ? '' : 's'} parsed` : 'parsing…'}
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 2px' }}>Drop CSV file here</p>
                  <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>or click to browse</p>
                </>
              )}
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { reset(); onClose(); }} style={{ flex: 1, padding: '10px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', background: 'var(--surface)', color: 'var(--text)' }}>
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!preview || uploading}
                style={{ flex: 2, padding: '10px', background: preview && !uploading ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'var(--border)', color: preview && !uploading ? 'white' : '#9ca3af', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: preview && !uploading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {uploading ? (
                  <>
                    <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Importing {preview?.count || 0}…
                  </>
                ) : (
                  <><Upload style={{ width: 15, height: 15 }} /> Import {preview?.count || 0} leads</>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Lead Card ─────────────────────────────────────────────────────────────────
function LeadCard({ lead, index, onClick, allTags, onTagToggle, isNew, sym = '$' }) {
  const sc = STATUS_COLORS[lead.status] || STATUS_COLORS['New'];
  const tags = lead.tags || [];
  return (
    <Draggable draggableId={lead.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(lead.id)}
          className="mb-2 cursor-pointer group"
          style={{ ...provided.draggableProps.style }}
        >
          <div style={{
            background: 'var(--surface)',
            border: `1.5px solid ${snapshot.isDragging ? sc.dot : isNew ? sc.dot : 'var(--border)'}`,
            borderRadius: 14, padding: '12px 13px',
            boxShadow: snapshot.isDragging
              ? `0 16px 48px rgba(0,0,0,0.18), 0 0 0 2px ${sc.dot}30`
              : isNew ? `0 0 0 2px ${sc.dot}30, 0 4px 12px ${sc.dot}20`
              : '0 1px 3px rgba(0,0,0,0.06)',
            transition: 'all 0.15s ease',
            animation: isNew ? 'fadeSlideIn 0.4s ease' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  background: `linear-gradient(135deg, ${sc.dot}, ${sc.dot}88)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 900, color: 'white',
                  boxShadow: `0 3px 8px ${sc.dot}44`
                }}>
                  {lead.customer_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {lead.customer_name || 'Unknown'}
                  </span>
                  {isNew && <span style={{ fontSize: 10, fontWeight: 700, color: sc.dot, background: sc.bg, padding: '1px 6px', borderRadius: 8 }}>NEW</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {isLeadUnread(lead) && (
                  <div className="wf-unread-bell" title="New / unread messages" style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageSquare style={{ width: 12, height: 12 }} color="#ef4444" />
                  </div>
                )}
                <ChevronRight style={{ width: 14, height: 14, color: 'var(--border)', opacity: 0 }} className="group-hover:opacity-100" />
              </div>
            </div>

            {/* Platform · account chip — always visible so the source is unambiguous */}
            {(() => {
              const platform = (lead.platform_source || 'whatsapp').toLowerCase();
              const pColor = PLATFORM_COLORS[platform] || '#6b7280';
              const acctName = lead.account_display_name || lead.account_nickname || lead.account_name;
              const platName = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', website: 'Website' }[platform] || platform;
              return (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: pColor + '18', color: pColor, fontSize: 10, fontWeight: 700, marginBottom: 6, maxWidth: '100%' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: pColor, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {platName}{acctName ? ` · ${acctName}` : ''}
                  </span>
                </div>
              );
            })()}

            {lead.customer_phone && (() => {
              const display = displayPhone(lead.customer_phone, lead.platform_source);
              if (!display || display === 'No phone') return null;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                  <Phone style={{ width: 10, height: 10, color: 'var(--text-dim)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</span>
                </div>
              );
            })()}

            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }} onClick={e => e.stopPropagation()}>
                {tags.map(tag => <TagChip key={tag.id} tag={tag} size="sm" />)}
              </div>
            )}

            {/* AI intelligence badges — only shown after analysis has run */}
            {(lead.sentiment || lead.urgency || (lead.lead_score && lead.lead_score > 0)) && (() => {
              const SENT = {
                positive: { emoji: '😊', color: '#10b981' },
                neutral:  { emoji: '😐', color: '#6b7280' },
                negative: { emoji: '😟', color: '#f59e0b' },
                frustrated: { emoji: '😠', color: '#ef4444' },
              };
              const URG = {
                low:      { color: '#10b981', label: 'low' },
                medium:   { color: '#f59e0b', label: 'med' },
                high:     { color: '#f97316', label: 'high' },
                critical: { color: '#ef4444', label: '🔥 critical' },
              };
              const s = SENT[lead.sentiment];
              const u = URG[lead.urgency];
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {lead.lead_score > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>
                      ✨ {lead.lead_score}/10
                    </span>
                  )}
                  {s && (
                    <span title={`Sentiment: ${lead.sentiment}`} style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 20, background: s.color + '18', color: s.color }}>
                      {s.emoji}
                    </span>
                  )}
                  {u && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: u.color + '18', color: u.color }}>
                      {u.label}
                    </span>
                  )}
                </div>
              );
            })()}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <MessageSquare style={{ width: 11, height: 11, color: 'var(--text-dim)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{lead.total_messages}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                {(lead.actual_sale || lead.estimated_value) && (
                  <span style={{ fontSize: 12, fontWeight: 800, color: sc.dot }}>
                    {sym} {(lead.actual_sale || lead.estimated_value)?.toLocaleString()}
                  </span>
                )}
                {allTags.length > 0 && (
                  <TagPicker leadId={lead.id} assignedTags={tags} allTags={allTags} onToggle={(tag, isAssigned) => onTagToggle(lead.id, tag, isAssigned)} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanColumn({ column, leads, onLeadClick, allTags, onTagToggle, newLeadIds, sym = '$' }) {
  // (root gets r-kanban-col so columns stay a usable width and the board scrolls sideways on phones)
  return (
    <div className="r-kanban-col" style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'sticky', top: 117, zIndex: 30, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '6px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: column.color, boxShadow: `0 0 6px ${column.color}66` }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{column.label}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: column.light, color: column.color }}>
          {leads.length}
        </span>
      </div>
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.droppableProps} style={{
            minHeight: 400, flex: 1, borderRadius: 16, padding: 10,
            background: snapshot.isDraggingOver ? column.light : 'var(--surface)',
            border: `2px solid ${snapshot.isDraggingOver ? column.color : 'var(--border)'}`,
            borderTop: `3px solid ${column.color}`,
            boxShadow: snapshot.isDraggingOver ? `0 0 0 3px ${column.color}22` : '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'all 0.2s ease',
          }}>
            {leads.map((lead, index) => (
              <LeadCard key={lead.id} lead={lead} index={index} onClick={onLeadClick} allTags={allTags} onTagToggle={onTagToggle} isNew={newLeadIds.has(lead.id)} sym={sym} />
            ))}
            {provided.placeholder}
            {leads.length === 0 && !snapshot.isDraggingOver && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 80, color: 'var(--border)', fontSize: 12, gap: 4 }}>
                <div style={{ width: 24, height: 24, borderRadius: 8, border: '1.5px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Plus style={{ width: 12, height: 12 }} />
                </div>
                Drop here
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}

// ── Notification Panel ────────────────────────────────────────────────────────
function NotificationPanel({ leads, reminders, liveEvents, onClose, onMarkAllRead, onClearLive }) {
  const now = new Date();
  const dismissedKey = 'wf_dismissed_notifications';
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(dismissedKey) || '[]')); } catch { return new Set(); }
  });

  const todayLeads = leads.filter(l => {
    const d = new Date(l.created_at);
    return d.toDateString() === now.toDateString();
  });

  const urgentReminders = reminders.filter(r => {
    if (r.is_completed) return false;
    const due = new Date(r.due_date || r.reminder_date);
    const diffH = (due - now) / 36e5;
    return diffH <= 24;
  });

  const items = [
    // Live SSE events at the top
    ...liveEvents.map(e => ({
      id: `live-${e.id}`,
      type: e.type,
      title: e.type === 'lead_created' ? `New lead: ${e.data?.customer_name || 'Unknown'}` : `New message from ${e.data?.customer_name || 'Unknown'}`,
      sub: e.time ? new Date(e.time).toLocaleTimeString() : 'Just now',
      color: e.type === 'lead_created' ? '#6366f1' : '#10b981',
      bg: e.type === 'lead_created' ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)',
      href: e.data?.lead_id ? `/leads/${e.data.lead_id}` : null,
      isLive: true,
    })),
    ...todayLeads.map(l => ({ id: `lead-${l.id}`, type: 'lead', title: `New lead: ${l.customer_name || 'Unknown'}`, sub: `Came in today · ${displayPhone(l.customer_phone, l.platform_source)}`, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', href: `/leads/${l.id}` })),
    ...urgentReminders.map(r => {
      const due = new Date(r.due_date || r.reminder_date);
      const overdue = due < now;
      return { id: `rem-${r.id}`, type: 'reminder', title: r.title || r.message || 'Reminder', sub: overdue ? `Overdue — ${due.toLocaleString()}` : `Due ${due.toLocaleString()}`, color: overdue ? '#ef4444' : '#f59e0b', bg: overdue ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.10)', href: null };
    }),
  ].filter(item => !dismissed.has(item.id));

  const dismiss = (id) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    localStorage.setItem(dismissedKey, JSON.stringify([...next]));
  };

  return (
    <div style={{
      position: 'absolute', top: '110%', right: 0,
      width: 360, background: 'var(--surface)', border: '1.5px solid var(--border)',
      borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.14)', zIndex: 100, overflow: 'hidden'
    }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell style={{ width: 15, height: 15, color: 'var(--text)' }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Notifications</span>
          {items.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 10, background: '#ef4444', color: 'white' }}>{items.length}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {liveEvents.length > 0 && (
            <button onClick={onClearLive} style={{ fontSize: 11, color: '#10b981', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear live</button>
          )}
          {items.length > 0 && (
            <button onClick={onMarkAllRead} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Mark all read</button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <CheckCircle style={{ width: 32, height: 32, color: '#10b981', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>All caught up!</p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>No new leads or urgent reminders</p>
          </div>
        ) : items.map(item => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 18px',
            borderBottom: '1px solid var(--border)',
            background: item.isLive ? `${item.bg}99` : 'var(--surface)',
          }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
              {item.type === 'lead' || item.type === 'lead_created'
                ? <Users style={{ width: 15, height: 15, color: item.color }} />
                : item.type === 'new_message'
                ? <MessageSquare style={{ width: 15, height: 15, color: item.color }} />
                : <Clock style={{ width: 15, height: 15, color: item.color }} />
              }
              {item.isLive && <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, background: '#ef4444', borderRadius: '50%', border: '1.5px solid white' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
              <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{item.sub}</p>
            </div>
            <button onClick={() => dismiss(item.id)} title="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--border)', flexShrink: 0, padding: 4 }}>
              <X style={{ width: 13, height: 13 }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SSE Status indicator ──────────────────────────────────────────────────────
function SSEStatus({ connected }) {
  return (
    <div title={connected ? 'Live updates active' : 'Reconnecting...'} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: connected ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.12)', border: `1.5px solid ${connected ? '#a7f3d0' : '#fecaca'}`, borderRadius: 20, fontSize: 11, fontWeight: 700, color: connected ? '#059669' : '#ef4444' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#10b981' : '#ef4444', animation: connected ? 'pulse 2s infinite' : 'none' }} />
      {connected ? 'Live' : 'Reconnecting'}
    </div>
  );
}

// ── Custom bar tooltip ────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, sym = '$' }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '8px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', fontSize: 12 }}>
      <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.fill, margin: '2px 0', fontWeight: 600 }}>
          {p.name}: {p.dataKey === 'revenue' ? `${sym} ${p.value.toLocaleString()}` : p.value}
        </p>
      ))}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { play: playSound } = useSound();
  const notifRef = useRef(null);
  const sseRef = useRef(null);
  const sseRetryRef = useRef(null);
  const soundEnabledRef = useRef(true);

  const [user, setUser] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [leads, setLeads] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(null);
  // Use the workspace's configured currency symbol everywhere money is shown
  // (was hardcoded "Rs" — inconsistent with invoices/reports/lead pages).
  const sym = company?.currency_symbol || '$';
  const [viewMode, setViewMode] = useState('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [notifBadge, setNotifBadge] = useState(0);
  const [allTags, setAllTags] = useState([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [liveEvents, setLiveEvents] = useState([]);
  const [newLeadIds, setNewLeadIds] = useState(new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toast, setToast] = useState(null); // { message, color, icon }
  const [platformFilter, setPlatformFilter] = useState('all');

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToast = useCallback((message, color = '#6366f1', icon = '🔔') => {
    setToast({ message, color, icon });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── SSE Connection ──────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    if (sseRef.current) sseRef.current.close();

    const es = new EventSource(`${BASE_URL}/api/events?token=${token}`);
    sseRef.current = es;

    es.onopen = () => {
      setSseConnected(true);
      if (sseRetryRef.current) { clearTimeout(sseRetryRef.current); sseRetryRef.current = null; }
    };

    // The server emits UNNAMED SSE frames (`data: {type, ...}`) — so we route on
    // data.type via onmessage. (Named addEventListener handlers never fired, since
    // there's no `event:` line; this is the same pattern FloatingChat already uses.)
    es.onmessage = (e) => {
      let data; try { data = JSON.parse(e.data); } catch { return; }
      switch (data.type) {
        case 'lead_created':
        case 'new_lead': {
          const lead = data.lead || data;
          const lid = lead.lead_id || lead.id || data.lead_id || data.id;
          setLiveEvents(prev => [{ id: Date.now(), type: 'lead_created', data, time: new Date().toISOString() }, ...prev].slice(0, 20));
          setNotifBadge(prev => prev + 1);
          if (soundEnabledRef.current) playSound('newLead');
          showToast(`New lead: ${lead.customer_name || data.customer_name || 'Unknown'}`, '#6366f1', '👤');
          if (lid) {
            setNewLeadIds(prev => new Set([...prev, lid]));
            setTimeout(() => setNewLeadIds(prev => { const n = new Set(prev); n.delete(lid); return n; }), 8000);
          }
          fetchLeads();
          break;
        }
        case 'new_message': {
          setLiveEvents(prev => [{ id: Date.now(), type: 'new_message', data, time: new Date().toISOString() }, ...prev].slice(0, 20));
          setNotifBadge(prev => prev + 1);
          if (soundEnabledRef.current) playSound(data.platform === 'whatsapp' || !data.platform ? 'whatsapp' : 'system');
          showToast(`New message from ${data.customer_name || 'Unknown'}`, '#10b981', '💬');
          setAllLeads(prev => prev.map(l => l.id === (data.lead_id || data.id) ? { ...l, total_messages: (l.total_messages || 0) + 1 } : l));
          break;
        }
        case 'lead_updated': {
          const updated = data.lead || data;
          if (!updated?.id) return;
          setAllLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
          break;
        }
        case 'missed_sync_complete': {
          if (data.totalImported > 0 || data.leadsCreated > 0) {
            const parts = [];
            if (data.leadsCreated > 0) parts.push(`${data.leadsCreated} new lead${data.leadsCreated > 1 ? 's' : ''}`);
            if (data.totalImported > 0) parts.push(`${data.totalImported} message${data.totalImported > 1 ? 's' : ''}`);
            showToast(`📥 Catch-up sync: imported ${parts.join(' & ')} from downtime`, '#f59e0b', '📥');
            fetchLeads();
          }
          break;
        }
        default: break; // connected / notification / lead_deleted / etc.
      }
    };

    es.onerror = () => {
      setSseConnected(false);
      es.close();
      // Retry after 5 seconds
      sseRetryRef.current = setTimeout(connectSSE, 5000);
    };
  }, []);

  // ── Fetch leads only (for SSE-triggered refresh) ──────────────────────────
  const fetchLeads = useCallback(async () => {
    try {
      const res = await leadsAPI.getAll(null);
      const data = Array.isArray(res.data.leads) ? res.data.leads : [];
      setAllLeads(data);
      setLeads(data);
    } catch {}
  }, []);

  // ── Fetch everything ──────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [leadsRes, analyticsRes, tagsRes] = await Promise.all([
        leadsAPI.getAll(null),
        analyticsAPI.get(),
        tagsAPI.getAll().catch(() => ({ data: { tags: [] } }))
      ]);
      const leadsData = Array.isArray(leadsRes.data.leads) ? leadsRes.data.leads : [];
      setAllLeads(leadsData);
      setLeads(leadsData);
      setAnalytics(analyticsRes.data);
      setAllTags(tagsRes.data.tags || []);

      const reminderPromises = leadsData.slice(0, 30).map(lead =>
        leadsAPI.getById(lead.id).then(r => r.data.reminders || []).catch(() => [])
      );
      const allReminders = (await Promise.all(reminderPromises)).flat();
      setReminders(allReminders);

      const dismissedKey = 'wf_dismissed_notifications';
      const dismissed = new Set(JSON.parse(localStorage.getItem(dismissedKey) || '[]'));
      const now = new Date();
      const todayLeads = leadsData.filter(l => new Date(l.created_at).toDateString() === now.toDateString());
      const urgentRem = allReminders.filter(r => {
        if (r.is_completed) return false;
        const due = new Date(r.due_date || r.reminder_date);
        return (due - now) / 36e5 <= 24;
      });
      const total = [...todayLeads.map(l => `lead-${l.id}`), ...urgentRem.map(r => `rem-${r.id}`)].filter(id => !dismissed.has(id)).length;
      setNotifBadge(total + liveEvents.length);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [liveEvents.length]);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) { router.push('/login'); return; }
    setUser(JSON.parse(userData));
    fetchAll();
    settingsAPI.getCompany().then(r => setCompany(r.data.company || {})).catch(() => {});
    connectSSE();

    return () => {
      if (sseRef.current) sseRef.current.close();
      if (sseRetryRef.current) clearTimeout(sseRetryRef.current);
    };
  }, []);

  // Keep soundEnabledRef in sync
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  useEffect(() => {
    let filtered = allLeads;
    if (platformFilter !== 'all') {
      filtered = filtered.filter(l => (l.platform_source || 'whatsapp') === platformFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(l =>
        l.customer_name?.toLowerCase().includes(q) ||
        l.customer_phone?.includes(q) ||
        l.status?.toLowerCase().includes(q)
      );
    }
    setLeads(filtered);
  }, [searchQuery, allLeads, platformFilter]);

  useEffect(() => {
    const handler = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = () => {
    const dismissedKey = 'wf_dismissed_notifications';
    const now = new Date();
    const todayLeads = allLeads.filter(l => new Date(l.created_at).toDateString() === now.toDateString());
    const urgentRem = reminders.filter(r => {
      if (r.is_completed) return false;
      const due = new Date(r.due_date || r.reminder_date);
      return (due - now) / 36e5 <= 24;
    });
    const all = [...todayLeads.map(l => `lead-${l.id}`), ...urgentRem.map(r => `rem-${r.id}`)];
    localStorage.setItem(dismissedKey, JSON.stringify(all));
    setLiveEvents([]);
    setNotifBadge(0);
    setShowNotifications(false);
  };

  const getLeadsByStatus = (status) => leads.filter(l => l.status === status);

  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const newStatus = destination.droppableId;
    setAllLeads(prev => prev.map(l => l.id === draggableId ? { ...l, status: newStatus } : l));
    try { await leadsAPI.updateStatus(draggableId, { status: newStatus }); }
    catch (e) { console.error(e); fetchAll(); }
  };

  const handleTagToggle = async (leadId, tag, isAssigned) => {
    try {
      if (isAssigned) { await tagsAPI.remove(leadId, tag.id); }
      else { await tagsAPI.assign(leadId, tag.id); }
      const update = leads => leads.map(l => l.id !== leadId ? l : {
        ...l,
        tags: isAssigned ? (l.tags || []).filter(t => t.id !== tag.id) : [...(l.tags || []), tag]
      });
      setAllLeads(update);
      setLeads(update);
    } catch (e) { console.error(e); }
  };

  const handleLogout = () => {
    if (sseRef.current) sseRef.current.close();
    localStorage.clear();
    router.push('/login');
  };

  const barData = COLUMNS.map(col => ({
    status: col.id === 'Closed - Won' ? 'Won' : col.id === 'Closed - Lost' ? 'Lost' : col.id,
    count: getLeadsByStatus(col.id).length,
    revenue: getLeadsByStatus(col.id).reduce((s, l) => s + (l.actual_sale || l.estimated_value || 0), 0),
    color: col.color,
  }));

  const pieData = COLUMNS.map(col => ({
    name: col.id === 'Closed - Won' ? 'Won' : col.id === 'Closed - Lost' ? 'Lost' : col.id,
    value: getLeadsByStatus(col.id).length,
    color: col.color,
  })).filter(d => d.value > 0);

  const recentLeads = [...allLeads].sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at)).slice(0, 5);

  const totalBadge = notifBadge + liveEvents.length;

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="text-center">
        <div style={{ width: 44, height: 44, border: '3px solid var(--border)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: 14 }}>Loading WappFlow...</p>
      </div>
    </div>
  );

  return (
    <NavBar>
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 999,
          background: 'var(--surface)', border: `2px solid ${toast.color}40`,
          borderLeft: `4px solid ${toast.color}`,
          borderRadius: 14, padding: '12px 18px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideUp 0.3s ease',
          maxWidth: 320,
        }}>
          <span style={{ fontSize: 20 }}>{toast.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', marginLeft: 4 }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      )}

      {/* ── DASHBOARD SUB-HEADER (page-specific actions) ── */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 60, zIndex: 40 }}>
        <div className="r-toolbar" style={{ maxWidth: 1600, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', height: 56, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LayoutGrid size={14} color="white" />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Dashboard</span>
            <SSEStatus connected={sseConnected} />
          </div>

          {/* Search */}
          <div style={{ flex: 1, maxWidth: 380, position: 'relative', minWidth: 200 }}>
            <Search style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-dim)' }} />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search leads…"
              style={{ width: '100%', padding: '8px 12px 8px 34px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
              style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${soundEnabled ? '#a7f3d0' : 'var(--border)'}`, background: soundEnabled ? 'rgba(16,185,129,0.10)' : 'var(--surface2)', color: soundEnabled ? '#059669' : '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {soundEnabled ? <Volume2 style={{ width: 14, height: 14 }} /> : <VolumeX style={{ width: 14, height: 14 }} />}
            </button>
            <button onClick={() => setShowBulkUpload(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: 'rgba(16,185,129,0.12)', border: '1.5px solid #bbf7d0', borderRadius: 9, color: '#16a34a', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Upload style={{ width: 14, height: 14 }} /> Import CSV
            </button>
            <button onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', borderRadius: 9, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}>
              <Plus style={{ width: 15, height: 15 }} /> New Lead
            </button>
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <main style={{ maxWidth: 1600, margin: '0 auto', padding: '20px' }}>

        {/* ── STAT CARDS ── */}
        <div className="dash-stats-3 r-stack" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Total Leads',  value: analytics?.total_leads || 0,                              icon: Users,        color: '#6366f1', bg: 'rgba(99,102,241,0.12)', trend: '+' + (analytics?.leads_today || 0) + ' today' },
            { label: 'Conversion',   value: `${analytics?.conversion_rate || 0}%`,                    icon: Target,       color: '#10b981', bg: 'rgba(16,185,129,0.10)', trend: 'Won / Total' },
            { label: 'New Today',    value: analytics?.leads_today || 0,                               icon: Activity,     color: '#06b6d4', bg: 'rgba(6,182,212,0.10)', trend: 'Incoming leads' },
          ].map(({ label, value, icon: Icon, color, bg, trend }) => (
            <div key={label} style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon style={{ width: 18, height: 18, color }} />
                </div>
                <span style={{ fontSize: 11, color: sseConnected ? '#10b981' : '#f59e0b', fontWeight: 700, background: sseConnected ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', padding: '3px 8px', borderRadius: 20 }}>
                  {sseConnected ? 'Live' : 'Offline'}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
              <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)', margin: '0 0 4px' }}>{value}</p>
              <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{trend}</p>
            </div>
          ))}
        </div>

        {/* ── REVENUE INSIGHTS ── */}
        {(() => {
          const wonRevenue = allLeads.filter(l => l.status === 'Closed - Won').reduce((s, l) => s + (parseFloat(l.actual_sale) || parseFloat(l.estimated_value) || 0), 0);
          const projectedRevenue = allLeads.filter(l => !['Closed - Won', 'Closed - Lost'].includes(l.status)).reduce((s, l) => s + (parseFloat(l.estimated_value) || 0), 0);
          const lostRevenue = allLeads.filter(l => l.status === 'Closed - Lost').reduce((s, l) => s + (parseFloat(l.estimated_value) || 0), 0);
          const totalForecast = wonRevenue + projectedRevenue + lostRevenue;
          const wonPct = totalForecast ? (wonRevenue / totalForecast) * 100 : 0;
          const projPct = totalForecast ? (projectedRevenue / totalForecast) * 100 : 0;
          const lostPct = totalForecast ? (lostRevenue / totalForecast) * 100 : 0;
          const fmt = (n) => sym + ' ' + Math.round(n).toLocaleString();

          // Build 6-month revenue trend (won deals by month)
          const now = new Date();
          const months = [];
          for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({
              key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
              label: d.toLocaleDateString('en-US', { month: 'short' }),
              won: 0, projected: 0, lost: 0,
            });
          }
          allLeads.forEach(l => {
            const dateField = l.closed_at || l.last_message_at || l.created_at;
            if (!dateField) return;
            const d = new Date(dateField);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const m = months.find(x => x.key === key);
            if (!m) return;
            const value = parseFloat(l.actual_sale) || parseFloat(l.estimated_value) || 0;
            if (l.status === 'Closed - Won') m.won += value;
            else if (l.status === 'Closed - Lost') m.lost += value;
            else m.projected += value;
          });

          return (
            <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '22px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Revenue Insights</h3>
                  <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '2px 0 0' }}>Won · Projected · Lost — computed live from your pipeline</p>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                  Total forecast: <strong style={{ color: 'var(--text)' }}>{fmt(totalForecast)}</strong>
                </span>
              </div>

              {/* 3 metric cards */}
              <div className="r-stack-tablet" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Won Revenue', value: wonRevenue, sub: `${allLeads.filter(l => l.status === 'Closed - Won').length} deals closed`, color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: Trophy },
                  { label: 'Projected Revenue', value: projectedRevenue, sub: `${allLeads.filter(l => !['Closed - Won', 'Closed - Lost'].includes(l.status)).length} open leads`, color: '#6366f1', bg: 'rgba(99,102,241,0.1)', icon: TrendingUp },
                  { label: 'Lost Revenue', value: lostRevenue, sub: `${allLeads.filter(l => l.status === 'Closed - Lost').length} deals lost`, color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: TrendingDown },
                ].map(({ label, value, sub, color, bg, icon: Icon }) => (
                  <div key={label} style={{ border: `1.5px solid ${color}30`, background: bg, borderRadius: 14, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 6px ${color}33` }}>
                        <Icon style={{ width: 14, height: 14, color }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</span>
                    </div>
                    <p style={{ fontSize: 22, fontWeight: 900, color, margin: '4px 0 2px' }}>{fmt(value)}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{sub}</p>
                  </div>
                ))}
              </div>

              {/* Stacked bar */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
                  <span>Forecast composition</span><span>100%</span>
                </div>
                <div style={{ height: 12, background: 'var(--surface2)', borderRadius: 8, display: 'flex', overflow: 'hidden' }}>
                  {wonPct > 0 && <div style={{ width: `${wonPct}%`, background: 'linear-gradient(90deg, #10b981, #059669)', transition: 'width 0.4s' }} title={`Won: ${fmt(wonRevenue)} (${wonPct.toFixed(0)}%)`} />}
                  {projPct > 0 && <div style={{ width: `${projPct}%`, background: 'linear-gradient(90deg, #6366f1, #4f46e5)', transition: 'width 0.4s' }} title={`Projected: ${fmt(projectedRevenue)} (${projPct.toFixed(0)}%)`} />}
                  {lostPct > 0 && <div style={{ width: `${lostPct}%`, background: 'linear-gradient(90deg, #ef4444, #dc2626)', transition: 'width 0.4s' }} title={`Lost: ${fmt(lostRevenue)} (${lostPct.toFixed(0)}%)`} />}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                  {[['#10b981', 'Won', wonPct], ['#6366f1', 'Projected', projPct], ['#ef4444', 'Lost', lostPct]].map(([c, lbl, pct]) => (
                    <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} /> {lbl} {(+pct).toFixed(0)}%
                    </span>
                  ))}
                </div>
              </div>

              {/* 6-month trend */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Last 6 months — won revenue</p>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={months} barSize={14}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                      formatter={(value, name) => [fmt(value), name.charAt(0).toUpperCase() + name.slice(1)]}
                    />
                    <Bar dataKey="won" stackId="rev" fill="#10b981" name="won" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="projected" stackId="rev" fill="#6366f1" name="projected" />
                    <Bar dataKey="lost" stackId="rev" fill="#ef4444" name="lost" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })()}

        {/* ── ANALYTICS ROW ── */}
        <div className="dash-main r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 280px', gap: 14, marginBottom: 20 }}>

          {/* Bar chart — leads per stage */}
          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '22px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Leads by Stage</h3>
                <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '2px 0 0' }}>Live pipeline distribution</p>
              </div>
              <button onClick={() => router.push('/reports')} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                Full Reports <ArrowUpRight style={{ width: 12, height: 12 }} />
              </button>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData} barSize={20}>
                <XAxis dataKey="status" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<CustomTooltip sym={sym} />} />
                <Bar dataKey="count" name="Leads" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Recent activity */}
          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '22px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Recent Activity</h3>
                <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '2px 0 0' }}>Last active leads</p>
              </div>
              <button onClick={() => router.push('/leads-list')} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                View all <ArrowUpRight style={{ width: 12, height: 12 }} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentLeads.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: '20px 0' }}>No leads yet</p>
              ) : recentLeads.map(lead => {
                const sc = STATUS_COLORS[lead.status] || STATUS_COLORS['New'];
                return (
                  <div key={lead.id} onClick={() => router.push(`/leads/${lead.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 8px', borderRadius: 8 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg, ${sc.dot}, ${sc.dot}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: 'white', flexShrink: 0 }}>
                      {lead.customer_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.customer_name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{new Date(lead.last_message_at).toLocaleDateString()}</p>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: sc.bg, color: sc.text, whiteSpace: 'nowrap' }}>{lead.status}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pipeline summary */}
          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '22px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: '0 0 16px' }}>Pipeline</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {COLUMNS.map(col => {
                const count = getLeadsByStatus(col.id).length;
                const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
                return (
                  <div key={col.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{col.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: col.color }}>{count}</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 10 }}>
                      <div style={{ height: 5, width: `${pct}%`, background: col.color, borderRadius: 10, transition: 'width 0.6s ease', boxShadow: pct > 0 ? `0 0 6px ${col.color}66` : 'none' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── PLATFORM FILTER ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginRight: 4 }}>Platform:</span>
          {[
            { id: 'all',       label: 'All Platforms', color: '#6366f1', icon: Layers },
            { id: 'whatsapp',  label: 'WhatsApp',      color: '#25d366', icon: MessageCircle },
            { id: 'instagram', label: 'Instagram',     color: '#e1306c', icon: Camera },
            { id: 'facebook',  label: 'Facebook',      color: '#1877f2', icon: MonitorSmartphone },
            { id: 'website',   label: 'Website',       color: '#6366f1', icon: GlobeIcon },
          ].map(({ id, label, color, icon: Icon }) => {
            const count = id === 'all' ? allLeads.length : allLeads.filter(l => (l.platform_source || 'whatsapp') === id).length;
            const isActive = platformFilter === id;
            return (
              <button key={id} onClick={() => setPlatformFilter(id)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px',
                borderRadius: 20, border: `1.5px solid ${isActive ? color : 'var(--border)'}`,
                background: isActive ? color + '15' : 'var(--surface)',
                color: isActive ? color : 'var(--text-muted)',
                fontSize: 12, fontWeight: isActive ? 700 : 600, cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <Icon style={{ width: 13, height: 13 }} />
                {label}
                {count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10, background: isActive ? color + '25' : 'var(--surface2)', color: isActive ? color : 'var(--text-muted)' }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          {platformFilter !== 'all' && (
            <button onClick={() => setPlatformFilter('all')} style={{ padding: '6px 10px', borderRadius: 20, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <X style={{ width: 11, height: 11 }} /> Clear
            </button>
          )}
        </div>

        {/* ── PIPELINE / LIST HEADER ── */}
        <div className="r-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Pipeline Board</h2>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', padding: '2px 10px', borderRadius: 20 }}>{leads.length} leads</span>
            {platformFilter !== 'all' && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)' }}>
                {['whatsapp','instagram','facebook','website'].find(p=>p===platformFilter) && platformFilter.charAt(0).toUpperCase() + platformFilter.slice(1)} only
              </span>
            )}
            {searchQuery && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>· "{searchQuery}"</span>}
            {liveEvents.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', padding: '2px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
                {liveEvents.length} live update{liveEvents.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={fetchAll} title="Refresh" style={{ width: 34, height: 34, borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = '#6366f1'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = '#6b7280'; }}
            >
              <RefreshCw style={{ width: 14, height: 14 }} />
            </button>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 10, padding: 4 }}>
              {[{ mode: 'kanban', icon: LayoutGrid, label: 'Kanban' }, { mode: 'list', icon: List, label: 'List' }].map(({ mode, icon: Icon, label }) => (
                <button key={mode} onClick={() => setViewMode(mode)} style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                  background: viewMode === mode ? 'var(--surface)' : 'transparent',
                  border: viewMode === mode ? '1.5px solid var(--border)' : '1.5px solid transparent',
                  borderRadius: 8, color: viewMode === mode ? '#6366f1' : '#9ca3af',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s'
                }}>
                  <Icon style={{ width: 14, height: 14 }} /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── KANBAN ── */}
        {viewMode === 'kanban' && (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="r-kanban" style={{ display: 'flex', gap: 12, paddingBottom: 20, alignItems: 'stretch' }}>
              {COLUMNS.map(col => (
                <KanbanColumn key={col.id} column={col} leads={getLeadsByStatus(col.id)} onLeadClick={id => router.push(`/leads/${id}`)} allTags={allTags} onTagToggle={handleTagToggle} newLeadIds={newLeadIds} sym={sym} />
              ))}
            </div>
          </DragDropContext>
        )}

        {/* ── LIST ── */}
        {viewMode === 'list' && (
          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            {leads.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dim)' }}>
                <MessageSquare style={{ width: 36, height: 36, margin: '0 auto 12px', opacity: 0.3 }} />
                <p style={{ fontSize: 14, fontWeight: 600 }}>No leads found</p>
              </div>
            ) : leads.map((lead, i) => {
              const sc = STATUS_COLORS[lead.status] || STATUS_COLORS['New'];
              const isNew = newLeadIds.has(lead.id);
              return (
                <div key={lead.id} onClick={() => router.push(`/leads/${lead.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px', borderBottom: i < leads.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.1s', background: isNew ? `${sc.bg}` : 'var(--surface)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = isNew ? sc.bg : 'var(--surface)'}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: `linear-gradient(135deg, ${sc.dot}, ${sc.dot}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: 'white' }}>
                    {lead.customer_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{lead.customer_name || 'Unknown'}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.text }}>{lead.status}</span>
                      {(() => {
                        const platform = (lead.platform_source || 'whatsapp').toLowerCase();
                        const pColor = PLATFORM_COLORS[platform] || '#6b7280';
                        const acctName = lead.account_display_name || lead.account_nickname || lead.account_name;
                        const platName = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', website: 'Website' }[platform] || platform;
                        return (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: pColor + '18', color: pColor, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: pColor }} />
                            {platName}{acctName ? ` · ${acctName}` : ''}
                          </span>
                        );
                      })()}
                      {isNew && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>NEW</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 2 }}>
                      {(() => {
                        const display = displayPhone(lead.customer_phone, lead.platform_source);
                        return display && display !== 'No phone'
                          ? <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{display}</span>
                          : null;
                      })()}
                      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{lead.total_messages} msgs</span>
                    </div>
                  </div>
                  {(lead.actual_sale || lead.estimated_value) && (
                    <span style={{ fontSize: 14, fontWeight: 800, color: sc.dot, flexShrink: 0 }}>
                      {sym} {(lead.actual_sale || lead.estimated_value)?.toLocaleString()}
                    </span>
                  )}
                  {isLeadUnread(lead) && (
                    <div className="wf-unread-bell" title="New / unread messages" style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <MessageSquare style={{ width: 12, height: 12 }} color="#ef4444" />
                    </div>
                  )}
                  <ChevronRight style={{ width: 16, height: 16, color: 'var(--border)', flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        )}

        {/* Trash link */}
        <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center' }}>
          <button onClick={() => router.push('/trash')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'white'; }}
          >
            <Trash2 style={{ width: 13, height: 13 }} /> Trash & Deleted Leads
          </button>
        </div>
      </main>

      <AddLeadModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onLeadAdded={() => { fetchAll(); setShowAddModal(false); }} />
      <BulkUploadModal isOpen={showBulkUpload} onClose={() => setShowBulkUpload(false)} onDone={fetchAll} />

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeSlideIn { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes notifPop { 0% { transform: scale(1); } 50% { transform: scale(1.4); } 100% { transform: scale(1); } }
      `}</style>
    </div>
    </NavBar>
  );
}
