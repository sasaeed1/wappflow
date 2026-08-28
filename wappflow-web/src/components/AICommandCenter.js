'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, X, Send, Loader, Users, TrendingUp,
  Bell, BarChart2, Search, Zap, ChevronRight,
  Trophy, ThumbsDown, Star, Clock, MessageSquare
} from 'lucide-react';
import { clickable } from '@/lib/a11y';

const API = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
const authHeader = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') : ''}`
});

const STATUS_COLORS = {
  'New': '#6366f1', 'Contacted': '#06b6d4', 'Interested': '#f59e0b',
  'Negotiating': '#f97316', 'Closed - Won': '#10b981', 'Closed - Lost': '#ef4444',
};

const QUICK_COMMANDS = [
  { label: 'Hot leads', icon: '🔥', command: 'Show hot leads' },
  { label: 'New leads', icon: '✨', command: 'Show new leads' },
  { label: 'Today summary', icon: '📊', command: 'Summarize today' },
  { label: 'Won deals', icon: '🏆', command: 'Show won deals' },
  { label: 'Reminders', icon: '⏰', command: 'Show my reminders' },
  { label: 'Stats', icon: '📈', command: 'Show workspace stats' },
];

export default function AICommandCenter({ enabled = true }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  // Phase 5: Ctrl+K now belongs to the shell's command palette, which searches
  // records deterministically across every module. Two components binding the
  // same chord would just fight, so this keeps its FAB and its Escape handling
  // and gives up the shortcut.
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
    else { setCommand(''); setResult(null); }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleCommand = async (cmd) => {
    const text = cmd || command;
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/api/ai/command`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ command: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setHistory(prev => [{ command: text, result: data, time: new Date() }, ...prev.slice(0, 4)]);
      setCommand('');
    } catch (e) {
      setResult({ type: 'error', message: e.message });
    } finally { setLoading(false); }
  };

  if (!enabled) return null;

  return (
    <>
      {/* Floating Button */}
      <div className="wf-fab wf-fab-ai" style={{ position: 'fixed', bottom: 90, right: 24, zIndex: 998 }}>
        <button
          onClick={() => setOpen(v => !v)}
          title="AI Assistant — ask about your CRM"
          style={{
            width: 52, height: 52, borderRadius: 16,
            background: open ? 'rgba(99,102,241,0.95)' : 'rgba(99,102,241,0.75)',
            backdropFilter: 'blur(12px)',
            border: '1.5px solid rgba(255,255,255,0.2)',
            boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
            color: 'white', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease',
            transform: open ? 'scale(1.05)' : 'scale(1)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.95)'}
          onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'rgba(99,102,241,0.75)'; }}
        >
          {open ? <X size={20} /> : <Sparkles size={20} />}
        </button>

        {/* Tooltip */}
        {!open && (
          <div style={{
            position: 'absolute', right: 60, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(17,24,39,0.85)', backdropFilter: 'blur(8px)',
            color: 'white', fontSize: 11, fontWeight: 600, padding: '5px 10px',
            borderRadius: 8, whiteSpace: 'nowrap', pointerEvents: 'none',
            opacity: 0, transition: 'opacity 0.2s',
          }} className="ai-tooltip">
            AI Assistant
          </div>
        )}
      </div>

      {/* Command Panel */}
      {open && (
        <div className="r-panel" style={{
          position: 'fixed', bottom: 155, right: 24, zIndex: 999,
          // 70vh measured from 155px off the bottom needs 507px of window on a
          // 503px-tall viewport, so the panel pushed up under the fixed nav with
          // no gap. Measure the space that actually exists instead: everything
          // between the nav and the panel's own offset, less a real gutter.
          width: 'min(420px, calc(100vw - 32px))',
          maxHeight: 'min(70vh, calc(100vh - var(--shell-h, 58px) - 155px - 14px))',
          background: 'var(--glass)', backdropFilter: 'blur(20px)',
          border: '1.5px solid rgba(99,102,241,0.2)',
          borderRadius: 24, boxShadow: '0 32px 80px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column',
          animation: 'slideUp 0.2s ease',
          overflow: 'hidden',
        }} ref={panelRef}>

          {/* Header */}
          <div style={{
            padding: '16px 18px 12px',
            borderBottom: '1px solid var(--border)',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={16} color="white" />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: 0 }}>AI Command Center</p>
                <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>Ask anything about your CRM</p>
              </div>
              <button aria-label="Close" onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}>
                <X size={16} />
              </button>
            </div>

            {/* Input */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--surface)', borderRadius: 12, border: '1.5px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <Search size={14} color="#9ca3af" />
                <input
                  ref={inputRef}
                  value={command}
                  onChange={e => setCommand(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !loading) handleCommand(); }}
                  placeholder="Show hot leads, summarize today, find Ali..."
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', background: 'transparent' }}
                />
                {command && <button aria-label="Close" onClick={() => setCommand('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}><X size={12} /></button>}
              </div>
              <button onClick={() => handleCommand()} disabled={!command.trim() || loading}
                style={{ width: 40, height: 40, borderRadius: 12, border: 'none', background: command.trim() && !loading ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--border)', color: command.trim() && !loading ? 'white' : '#9ca3af', cursor: command.trim() && !loading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {loading ? <Loader size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={15} />}
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

            {/* Quick commands — show when no result */}
            {!result && !loading && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>Quick Commands</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  {QUICK_COMMANDS.map(qc => (
                    <button key={qc.command} onClick={() => handleCommand(qc.command)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#c4b5fd'; e.currentTarget.style.background = 'rgba(139,92,246,0.10)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}>
                      <span style={{ fontSize: 16 }}>{qc.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{qc.label}</span>
                    </button>
                  ))}
                </div>

                {/* Recent history */}
                {history.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Recent</p>
                    {history.slice(0, 3).map((h, i) => (
                      <button key={i} onClick={() => handleCommand(h.command)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', marginBottom: 4 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <Clock size={12} color="#9ca3af" />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.command}</span>
                        <ChevronRight size={12} color="#d1d5db" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <p style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 600 }}>Thinking...</p>
              </div>
            )}

            {/* Results */}
            {result && !loading && (
              <div>
                {/* Result header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0, flex: 1 }}>{result.message}</p>
                  <button onClick={() => setResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 11 }}>Clear</button>
                </div>

                {/* Error */}
                {result.type === 'error' && (
                  <div style={{ padding: '12px 14px', background: 'var(--danger-bg)', borderRadius: 12, border: '1.5px solid var(--danger-border)' }}>
                    <p style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>⚠️ {result.message}</p>
                  </div>
                )}

                {/* AI Answer */}
                {result.type === 'ai_answer' && (
                  <div style={{ padding: '14px 16px', background: 'rgba(99,102,241,0.10)', borderRadius: 14, border: '1.5px solid rgba(139,92,246,0.35)' }}>
                    <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.7 }}>{result.message}</p>
                  </div>
                )}

                {/* Stats */}
                {result.type === 'show_stats' && result.data && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {[
                        { label: 'Total Leads', value: result.data.stats.total, color: '#6366f1', icon: '👥' },
                        { label: 'New', value: result.data.stats.new, color: '#06b6d4', icon: '✨' },
                        { label: 'Hot Leads', value: result.data.stats.hot, color: '#ef4444', icon: '🔥' },
                        { label: 'Won Deals', value: result.data.stats.won, color: '#10b981', icon: '🏆' },
                      ].map(s => (
                        <div key={s.label} style={{ padding: '12px 14px', background: 'var(--surface)', borderRadius: 12, border: '1.5px solid var(--border)', textAlign: 'center' }}>
                          <p style={{ fontSize: 20, margin: '0 0 2px' }}>{s.icon}</p>
                          <p style={{ fontSize: 22, fontWeight: 900, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '3px 0 0' }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {result.data.summary && (
                      <div style={{ padding: '12px 14px', background: 'rgba(16,185,129,0.10)', borderRadius: 12, border: '1.5px solid rgba(16,185,129,0.35)' }}>
                        <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>{result.data.summary}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Leads list */}
                {result.data?.leads && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {result.data.leads.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)', background: 'var(--surface2)', borderRadius: 12 }}>
                        <p style={{ fontSize: 13, margin: 0 }}>No leads found</p>
                      </div>
                    ) : result.data.leads.map(lead => (
                      <div key={lead.id}
                        {...clickable(() => { router.push(`/leads/${lead.id}`); setOpen(false); })}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface)', borderRadius: 12, border: '1.5px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#c4b5fd'; e.currentTarget.style.background = 'rgba(139,92,246,0.10)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}>
                        <div style={{ width: 36, height: 36, borderRadius: 11, background: `linear-gradient(135deg, ${STATUS_COLORS[lead.status] || '#6366f1'}, ${STATUS_COLORS[lead.status] || '#6366f1'}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: 'white', flexShrink: 0 }}>
                          {lead.customer_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.customer_name || 'Unknown'}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: (STATUS_COLORS[lead.status] || '#6366f1') + '18', color: STATUS_COLORS[lead.status] || '#6366f1' }}>{lead.status}</span>
                            {lead.lead_score > 0 && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Score: {lead.lead_score}/10</span>}
                          </div>
                        </div>
                        <ChevronRight size={14} color="#d1d5db" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Reminders */}
                {result.data?.reminders && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {result.data.reminders.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)', background: 'var(--surface2)', borderRadius: 12 }}>
                        <p style={{ fontSize: 13, margin: 0 }}>No upcoming reminders</p>
                      </div>
                    ) : result.data.reminders.map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'rgba(139,92,246,0.10)', borderRadius: 12, border: '1.5px solid rgba(139,92,246,0.35)' }}>
                        <Bell size={14} color="#8b5cf6" style={{ marginTop: 2, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{r.title || r.message || 'Reminder'}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '3px 0 0' }}>{r.customer_name} · {new Date(r.reminder_date || r.due_date).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Today summary */}
                {result.type === 'summarize_today' && result.data?.summary && (
                  <div>
                    <div style={{ padding: '14px 16px', background: 'rgba(16,185,129,0.12)', borderRadius: 14, border: '1.5px solid rgba(16,185,129,0.35)', marginBottom: 12 }}>
                      <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.7 }}>{result.data.summary}</p>
                    </div>
                    {result.data.todayLeads?.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {result.data.todayLeads.map(lead => (
                          <div key={lead.id} {...clickable(() => { router.push(`/leads/${lead.id}`); setOpen(false); })}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface)', borderRadius: 10, border: '1.5px solid var(--border)', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#6366f1' }}>
                              {lead.customer_name?.[0]?.toUpperCase()}
                            </div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{lead.customer_name}</p>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: 'rgba(99,102,241,0.12)', color: '#6366f1', marginLeft: 'auto' }}>New today</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Try another */}
                <button onClick={() => setResult(null)} style={{ width: '100%', marginTop: 12, padding: '9px', borderRadius: 10, border: '1.5px dashed #e5e7eb', background: 'none', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#c4b5fd'; e.currentTarget.style.color = '#7c3aed'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = '#9ca3af'; }}>
                  ← Try another command
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface2)', flexShrink: 0 }}>
            <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0, textAlign: 'center' }}>
              Press <kbd style={{ background: 'var(--surface2)', border: '1px solid #e5e7eb', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontFamily: 'monospace' }}>Enter</kbd> to run · <kbd style={{ background: 'var(--surface2)', border: '1px solid #e5e7eb', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontFamily: 'monospace' }}>Esc</kbd> to close
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .ai-tooltip { opacity: 0; }
        button:hover .ai-tooltip { opacity: 1; }
      `}</style>
    </>
  );
}