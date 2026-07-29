'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, TrendingUp, DollarSign, Users, Target,
  Clock, Award, BarChart2, PieChart as PieIcon, Activity,
  Download, RefreshCw, Calendar, ChevronDown, ArrowUpRight,
  ArrowDownRight, Minus, AlertCircle, CheckCircle, XCircle,
  Camera, Globe as GlobeIcon, MonitorSmartphone, Layers, MessageCircle
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, FunnelChart, Funnel, LabelList
} from 'recharts';
import { analyticsAPI } from '../../lib/api';
import NavBar from '../../components/NavBar';
import { usePlan } from '@/lib/plan';
import { LockedOverlay } from '@/components/PlanLock';

const COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#f97316', '#ec4899'];

const STATUS_ORDER = ['New', 'Contacted', 'Interested', 'Negotiating', 'Closed - Won', 'Closed - Lost'];
const STATUS_COLORS = {
  'New': '#6366f1', 'Contacted': '#06b6d4', 'Interested': '#f59e0b',
  'Negotiating': '#f97316', 'Closed - Won': '#10b981', 'Closed - Lost': '#ef4444'
};

function StatCard({ icon: Icon, label, value, sub, color, trend, trendVal }) {
  const up = trend === 'up';
  const neutral = trend === 'neutral';
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1.5px solid var(--border)', padding: '22px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={22} color={color} />
        </div>
        {trend && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: neutral ? 'var(--surface2)' : up ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.12)' }}>
            {neutral ? <Minus size={13} color="var(--text-dim)" /> : up ? <ArrowUpRight size={13} color="#10b981" /> : <ArrowDownRight size={13} color="#ef4444" />}
            <span style={{ fontSize: 12, fontWeight: 700, color: neutral ? 'var(--text-dim)' : up ? '#10b981' : '#ef4444' }}>{trendVal}</span>
          </div>
        )}
      </div>
      <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>{value}</p>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</p>
      {sub && <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label, prefix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '10px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ fontSize: 14, fontWeight: 700, color: p.color || 'var(--text)' }}>{prefix}{p.value?.toLocaleString()}</p>
      ))}
    </div>
  );
};

// Convert array-of-objects to CSV string and trigger download
function exportToCSV(filename, headers, rows) {
  const escape = (v) => {
    const str = v == null ? '' : String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const csv = [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const router = useRouter();
  const plan = usePlan();
  const reportsLocked = !plan.loading && !plan.hasFeature('reports') && !plan.hasFeature('analytics');
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [period, setPeriod] = useState('30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (!localStorage.getItem('token')) { router.push('/login'); return; }
    fetchAll();
  }, [period, customStart, customEnd]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = (customStart && customEnd) ? { start_date: customStart, end_date: customEnd } : { period };
      const [r, a] = await Promise.all([
        analyticsAPI.getReports(params),
        analyticsAPI.get()
      ]);
      setData(r.data);
      setAnalytics(a.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // Quick presets that switch back from custom range
  const setPreset = (p) => {
    setCustomStart(''); setCustomEnd(''); setShowCustom(false); setPeriod(p);
  };

  const dateRangeLabel = (customStart && customEnd)
    ? `${customStart} → ${customEnd}`
    : period === '7' ? 'Last 7 days'
    : period === '30' ? 'Last 30 days'
    : period === '90' ? 'Last 90 days'
    : period === '365' ? 'Last year'
    : `Last ${period} days`;

  const handleExportCSV = () => {
    if (!data) return;
    const ts = new Date().toISOString().slice(0, 10);
    const range = (customStart && customEnd) ? `${customStart}_to_${customEnd}` : `last-${period}d`;

    // Build a multi-section export
    const sections = [];

    // Pipeline section
    sections.push(['PIPELINE BREAKDOWN']);
    sections.push(['Status', 'Count', 'Value']);
    (data.pipeline || []).forEach(p => sections.push([p.status, p.count, p.value || 0]));
    sections.push([]);

    // Leads over time
    sections.push(['LEADS OVER TIME']);
    sections.push(['Date', 'Count']);
    (data.leadsOverTime || []).forEach(d => sections.push([d.date, d.count]));
    sections.push([]);

    // Revenue over time
    sections.push(['REVENUE OVER TIME']);
    sections.push(['Date', 'Revenue']);
    (data.revenueOverTime || []).forEach(d => sections.push([d.date, d.revenue || 0]));
    sections.push([]);

    // Lead sources
    sections.push(['LEAD SOURCES']);
    sections.push(['Source', 'Count']);
    (data.sources || []).forEach(s => sections.push([s.source, s.count]));
    sections.push([]);

    // Team performance
    sections.push(['TEAM PERFORMANCE']);
    sections.push(['Member', 'Total Leads', 'Won', 'Lost', 'Revenue']);
    (data.agentPerf || []).forEach(a => sections.push([a.name, a.total_leads, a.won, a.lost, a.revenue || 0]));
    sections.push([]);

    // Lost reasons
    if (data.lostReasons?.length) {
      sections.push(['LOST DEAL REASONS']);
      sections.push(['Reason', 'Count']);
      data.lostReasons.forEach(r => sections.push([r.lost_reason, r.count]));
    }

    // Header row at top with metadata
    const meta = [
      ['WappFlow Report Export'],
      ['Date Range:', dateRangeLabel],
      ['Generated:', new Date().toLocaleString()],
      [],
    ];
    const allRows = [...meta, ...sections];

    // Use exportToCSV with empty headers and pre-built rows
    const csv = allRows.map(r => r.map(v => {
      const str = v == null ? '' : String(v);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wappflow-report-${range}-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sym = data?.currencySymbol || analytics?.currency_symbol || '$';

  // Fill missing dates for leads over time
  const fillDates = (arr, days) => {
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const found = arr?.find(x => x.date === dateStr);
      result.push({ date: dateStr.slice(5), count: found?.count || 0, revenue: found?.revenue || 0 });
    }
    return result;
  };

  const leadsChart = data ? fillDates(data.leadsOverTime, parseInt(period)) : [];
  const revenueChart = data ? fillDates(data.revenueOverTime, parseInt(period)) : [];

  const pipelineData = data?.pipeline?.map(p => ({
    name: p.status,
    count: p.count,
    value: p.value,
    color: STATUS_COLORS[p.status] || '#6366f1'
  })) || [];

  const avgResponse = data?.avgResponseMinutes || 0;
  const avgResponseDisplay = avgResponse < 60
    ? `${Math.round(avgResponse)}m`
    : avgResponse < 1440
    ? `${Math.round(avgResponse / 60)}h ${Math.round(avgResponse % 60)}m`
    : `${Math.round(avgResponse / 1440)}d`;

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'team', label: 'Team Performance' },
  ];

  if (reportsLocked) {
    return (
      <NavBar>
        <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 24px' }}>
          <div style={{ maxWidth: 720, margin: '40px auto' }}>
            <LockedOverlay
              feature="Reports & Analytics"
              requiredPlan="Studio"
              currentPlan={plan.planName || 'Creator'}
              description="Get the data behind every conversation — revenue trends, conversion funnels, per-rep performance, lead source breakdowns."
              perks={[
                'Revenue trend line chart (daily/weekly/monthly)',
                'Lead status distribution pie chart',
                'Conversion funnel visualization',
                'Per-rep performance breakdown',
                'CSV export of all raw data',
                'Advanced analytics on Growth+',
              ]}
            />
          </div>
        </div>
      </NavBar>
    );
  }

  return (
    <NavBar>
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Page sub-header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 60, zIndex: 40 }}>
        <div className="r-toolbar" style={{ maxWidth: 1300, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', height: 52, gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart2 size={14} color="white" />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Reports & Analytics</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
            {[{ v: '7', l: '7D' }, { v: '30', l: '30D' }, { v: '90', l: '90D' }, { v: '365', l: '1Y' }].map(p => {
              const active = !customStart && !customEnd && period === p.v;
              return (
                <button key={p.v} onClick={() => setPreset(p.v)} style={{ padding: '5px 12px', borderRadius: 8, border: `2px solid ${active ? '#6366f1' : 'var(--border)'}`, background: active ? 'rgba(99,102,241,0.12)' : 'var(--surface)', color: active ? '#6366f1' : 'var(--text-muted)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{p.l}</button>
              );
            })}
            <button
              onClick={() => setShowCustom(s => !s)}
              style={{ padding: '5px 12px', borderRadius: 8, border: `2px solid ${(customStart && customEnd) ? '#6366f1' : 'var(--border)'}`, background: (customStart && customEnd) ? 'rgba(99,102,241,0.12)' : 'var(--surface)', color: (customStart && customEnd) ? '#6366f1' : 'var(--text-muted)', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Calendar size={12} /> {(customStart && customEnd) ? `${customStart.slice(5)}—${customEnd.slice(5)}` : 'Custom'}
            </button>

            {/* Custom date range popover */}
            {showCustom && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.12)', zIndex: 60, minWidth: 280 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 12px' }}>Custom date range</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Start</label>
                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} max={customEnd || undefined}
                      style={{ width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>End</label>
                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} min={customStart || undefined} max={new Date().toISOString().slice(0, 10)}
                      style={{ width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {[
                    { l: 'This week', days: 7 },
                    { l: 'This month', days: 30 },
                    { l: 'This quarter', days: 90 },
                    { l: 'This year', days: 365 },
                  ].map(p => (
                    <button key={p.l} onClick={() => {
                      const end = new Date(); const start = new Date(); start.setDate(start.getDate() - p.days);
                      setCustomStart(start.toISOString().slice(0, 10));
                      setCustomEnd(end.toISOString().slice(0, 10));
                    }} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#6366f1', background: 'rgba(99,102,241,0.12)', border: '1px solid #c7d2fe', borderRadius: 8, cursor: 'pointer' }}>{p.l}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                  <button onClick={() => { setCustomStart(''); setCustomEnd(''); setShowCustom(false); }}
                    style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>Clear</button>
                  <button onClick={() => setShowCustom(false)}
                    style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, color: 'white', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Apply</button>
                </div>
              </div>
            )}
          </div>
          <button onClick={handleExportCSV} disabled={!data} style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #a7f3d0', background: data ? 'rgba(16,185,129,0.10)' : 'var(--surface2)', color: data ? '#059669' : 'var(--text-dim)', cursor: data ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: 12 }}>
            <Download size={13} /> Export CSV
          </button>
          <button onClick={fetchAll} style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600, fontSize: 12 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: tab === t.id ? 700 : 600, fontSize: 13, color: tab === t.id ? '#6366f1' : '#6b7280', borderBottom: `3px solid ${tab === t.id ? '#6366f1' : 'transparent'}` }}>{t.label}</button>
          ))}
        </div>
      </div>

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '28px 24px' }}>
        {loading ? (
          <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 80, textAlign: 'center' }}>
            <RefreshCw size={32} color="var(--text-dim)" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-dim)' }}>Loading analytics...</p>
          </div>
        ) : (
          <>
            {/* ── OVERVIEW TAB ── */}
            {tab === 'overview' && (
              <div>
                {/* KPI Cards */}
                <div className="r-stack-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                  <StatCard icon={Users} label="Total Leads" value={analytics?.total_leads || 0} color="#6366f1"
                    trend={analytics?.this_month_leads > analytics?.last_month_leads ? 'up' : analytics?.this_month_leads < analytics?.last_month_leads ? 'down' : 'neutral'}
                    trendVal={`${analytics?.this_month_leads || 0} this month`} />
                  <StatCard icon={DollarSign} label="Total Revenue" value={`${sym}${(analytics?.total_sales || 0).toLocaleString()}`} color="#10b981"
                    sub={`${sym}${(analytics?.avg_deal_size || 0).toLocaleString()} avg deal`} />
                  <StatCard icon={Target} label="Conversion Rate" value={`${analytics?.conversion_rate || 0}%`} color="#f59e0b"
                    sub={`${analytics?.closed_won || 0} deals won`} />
                  <StatCard icon={Clock} label="Avg Response Time" value={avgResponseDisplay || '—'} color="#8b5cf6"
                    sub="Time to first reply" />
                </div>

                {/* Charts row */}
                <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 24 }}>
                  {/* Leads over time */}
                  <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1.5px solid var(--border)', padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 20 }}>Leads Over Time</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={leadsChart}>
                        <defs>
                          <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5} fill="url(#leadGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Lead Sources */}
                  <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1.5px solid var(--border)', padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 20 }}>Lead Sources</p>
                    {data?.sources?.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <Pie data={data.sources} dataKey="count" nameKey="source" cx="50%" cy="50%" innerRadius={45} outerRadius={70}>
                              {data.sources.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v) => [v, 'Leads']} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                          {data.sources.slice(0, 4).map((s, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length] }} />
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.source}</span>
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{s.count}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--border)' }}>
                        <p>No source data yet</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Platform breakdown */}
                {(() => {
                  const PLAT_META = {
                    whatsapp: { label: 'WhatsApp', color: '#25d366' },
                    instagram: { label: 'Instagram', color: '#e1306c' },
                    facebook: { label: 'Facebook', color: '#1877f2' },
                    website: { label: 'Website', color: '#6366f1' },
                  };
                  const platData = data?.platforms || [];
                  if (platData.length === 0) return null;
                  const total = platData.reduce((s, p) => s + (p.count || 0), 0);
                  return (
                    <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1.5px solid var(--border)', padding: '22px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginTop: 16 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: '0 0 16px' }}>Leads by Platform</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {platData.map(p => {
                          const meta = PLAT_META[p.platform] || { label: p.platform, color: '#9ca3af' };
                          const pct = total > 0 ? Math.round((p.count / total) * 100) : 0;
                          return (
                            <div key={p.platform}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{meta.label}</span>
                                </div>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pct}%</span>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: meta.color }}>{p.count}</span>
                                </div>
                              </div>
                              <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 6 }}>
                                <div style={{ height: 6, width: `${pct}%`, background: meta.color, borderRadius: 6, transition: 'width 0.5s ease', boxShadow: pct > 0 ? `0 0 6px ${meta.color}55` : 'none' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Lost Reasons */}
                {data?.lostReasons?.length > 0 && (
                  <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1.5px solid var(--border)', padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 20 }}>Lost Deal Reasons</p>
                    <div className="r-stack-tablet" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      {data.lostReasons.map((r, i) => (
                        <div key={i} style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.12)', border: '1.5px solid #fecaca' }}>
                          <p style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', marginBottom: 4 }}>{r.count}</p>
                          <p style={{ fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>{r.lost_reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── PIPELINE TAB ── */}
            {tab === 'pipeline' && (
              <div>
                {/* Funnel */}
                <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1.5px solid var(--border)', padding: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 24 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 24 }}>Pipeline Funnel</p>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {STATUS_ORDER.map(status => {
                      const item = data?.pipeline?.find(p => p.status === status);
                      const total = analytics?.total_leads || 1;
                      const pct = item ? Math.round((item.count / total) * 100) : 0;
                      const color = STATUS_COLORS[status];
                      return (
                        <div key={status} style={{ flex: 1, minWidth: 140, padding: '18px 20px', borderRadius: 14, background: color + '0e', border: `2px solid ${color}30` }}>
                          <p style={{ fontSize: 26, fontWeight: 900, color, marginBottom: 4 }}>{item?.count || 0}</p>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{status}</p>
                          <div style={{ height: 6, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 3, background: color, width: `${pct}%`, transition: 'width 0.5s' }} />
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{pct}% of total</p>
                          {item?.value > 0 && <p style={{ fontSize: 12, fontWeight: 700, color, marginTop: 4 }}>{sym}{Math.round(item.value).toLocaleString()}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bar chart */}
                <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1.5px solid var(--border)', padding: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 24 }}>Leads by Stage</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={pipelineData} barSize={40}>
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                        {pipelineData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ── REVENUE TAB ── */}
            {tab === 'revenue' && (
              <div>
                <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1.5px solid var(--border)', padding: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 24 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 24 }}>Revenue Over Time</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={revenueChart}>
                      <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${sym}${v}`} />
                      <Tooltip content={<CustomTooltip prefix={sym} />} />
                      <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#revGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="r-stack-tablet" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  <StatCard icon={DollarSign} label="Total Revenue" value={`${sym}${(analytics?.total_sales || 0).toLocaleString()}`} color="#10b981" />
                  <StatCard icon={Award} label="Avg Deal Size" value={`${sym}${(analytics?.avg_deal_size || 0).toLocaleString()}`} color="#6366f1" />
                  <StatCard icon={Target} label="Deals Won" value={analytics?.closed_won || 0} color="#f59e0b" sub={`${analytics?.conversion_rate || 0}% conversion`} />
                </div>
              </div>
            )}

            {/* ── TEAM PERFORMANCE TAB ── */}
            {tab === 'team' && (
              <div>
                <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1.5px solid var(--border)', padding: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 24 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 20 }}>Agent Performance</p>
                  {data?.agentPerf?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {data.agentPerf.map((agent, i) => {
                        const convRate = agent.total_leads > 0 ? Math.round((agent.won / agent.total_leads) * 100) : 0;
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderRadius: 14, background: 'var(--surface2)', border: '1.5px solid var(--border)' }}>
                            <div style={{ width: 44, height: 44, borderRadius: 14, background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]}, ${COLORS[(i+1) % COLORS.length]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: 'white', flexShrink: 0 }}>
                              {agent.name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{agent.name}</p>
                              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Leads: <strong style={{ color: 'var(--text)' }}>{agent.total_leads}</strong></span>
                                <span style={{ fontSize: 13, color: '#10b981' }}>Won: <strong>{agent.won}</strong></span>
                                <span style={{ fontSize: 13, color: '#ef4444' }}>Lost: <strong>{agent.lost}</strong></span>
                                <span style={{ fontSize: 13, color: '#6366f1' }}>Revenue: <strong>{sym}{(agent.revenue || 0).toLocaleString()}</strong></span>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <p style={{ fontSize: 24, fontWeight: 900, color: convRate >= 50 ? '#10b981' : convRate >= 25 ? '#f59e0b' : '#ef4444' }}>{convRate}%</p>
                              <p style={{ fontSize: 11, color: 'var(--text-dim)' }}>Conversion</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dim)' }}>
                      <Users size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                      <p style={{ fontWeight: 700 }}>No team members assigned to leads yet</p>
                      <p style={{ fontSize: 13 }}>Add team members in Settings and assign them to leads.</p>
                    </div>
                  )}
                </div>

                {/* Response time */}
                <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1.5px solid var(--border)', padding: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 16 }}>SLA & Response Time</p>
                  <div className="r-stack-tablet" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    <div style={{ padding: '20px 24px', borderRadius: 14, background: 'rgba(16,185,129,0.10)', border: '1.5px solid #bbf7d0' }}>
                      <p style={{ fontSize: 30, fontWeight: 900, color: '#10b981', marginBottom: 4 }}>{avgResponseDisplay || '—'}</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Avg First Response</p>
                    </div>
                    <div style={{ padding: '20px 24px', borderRadius: 14, background: 'rgba(59,130,246,0.10)', border: '1.5px solid #bfdbfe' }}>
                      <p style={{ fontSize: 30, fontWeight: 900, color: '#3b82f6', marginBottom: 4 }}>{analytics?.leads_today || 0}</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>Leads Today</p>
                    </div>
                    <div style={{ padding: '20px 24px', borderRadius: 14, background: 'var(--warning-bg)', border: '1.5px solid var(--warning-border)' }}>
                      <p style={{ fontSize: 30, fontWeight: 900, color: '#f59e0b', marginBottom: 4 }}>{analytics?.this_month_leads || 0}</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning-text)' }}>This Month</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <style>{`
      `}</style>
    </div>
    </NavBar>
  );
}
