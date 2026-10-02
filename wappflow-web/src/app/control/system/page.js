'use client';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ccApi, fmtBytes, fmtAgo, fmtNum } from '@/lib/ccApi';
import { Card, Pill } from '@/components/control/ControlShell';
import { Btn, H3, Muted, Row } from '@/components/control/kit';

// System Health: the server WappFlow runs on, the database, backups and every
// scheduled job. Green = fine, amber = look soon, red = act now.
const TONE = { ok: 'green', warn: 'amber', critical: 'red', unknown: 'neutral' };
const WORD = { ok: 'Healthy', warn: 'Needs attention', critical: 'Action needed', unknown: 'Unknown' };
const dur = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };

export default function SystemHealth() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => { ccApi.system().then((r) => { setD(r.data); setErr(''); }).catch((e) => setErr(e.response?.data?.error || 'Could not read system status')); }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (err) return <Card><div style={{ color: '#f87171' }}>{err}</div></Card>;
  if (!d) return <Muted>Checking the server…</Muted>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>System Health</h1>
        <Pill tone={TONE[d.overall]}>{WORD[d.overall]}</Pill>
        <span style={{ flex: 1 }} />
        <Muted style={{ fontSize: 12 }}>updates every 30 s</Muted>
        <Btn subtle onClick={load}><RefreshCw size={14} /> Refresh</Btn>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
        {d.checks.map((c) => (
          <Card key={c.key} style={{ borderColor: c.level === 'critical' ? '#f8717155' : c.level === 'warn' ? '#fbbf2455' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim,#666)' }}>{c.label}</span>
              <Pill tone={TONE[c.level]}>{c.level}</Pill>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>{c.value}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
        <Card>
          <H3>Scheduled jobs</H3>
          {d.jobs.map((j) => (
            <Row key={j.key}>
              <span style={{ minWidth: 0 }}>{j.label}{j.error ? <div style={{ fontSize: 12, color: '#f87171' }}>{j.error}</div> : null}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}>{j.last_run ? fmtAgo(j.last_run) : 'not run yet'}</span>
                <Pill tone={TONE[j.level]}>{j.level === 'unknown' ? '—' : j.ok ? 'ok' : 'failed'}</Pill>
              </span>
            </Row>
          ))}
        </Card>
        <Card>
          <H3>Backups</H3>
          {d.backup ? <>
            <Row><span>Newest</span><span style={{ fontSize: 12.5 }}>{fmtAgo(d.backup.at)} · {fmtBytes(d.backup.size)}</span></Row>
            <Row><span>File</span><span style={{ fontSize: 12, color: 'var(--text-dim,#666)', overflowWrap: 'anywhere', textAlign: 'right' }}>{d.backup.file}</span></Row>
          </> : <Muted>No backup files found. Check that the nightly backup job is scheduled on the server (backend/backup.js).</Muted>}
          {!d.backup_dir_configured && <Muted style={{ fontSize: 12, marginTop: 8 }}>Using the default backup folder inside the data directory. Set BACKUP_DIR to keep backups on a separate disk.</Muted>}
        </Card>
        <Card>
          <H3>Server</H3>
          <Row><span>Host</span><span style={{ fontSize: 12.5 }}>{d.host.hostname}</span></Row>
          <Row><span>System</span><span style={{ fontSize: 12.5 }}>{d.host.platform}</span></Row>
          <Row><span>Node</span><span style={{ fontSize: 12.5 }}>{d.host.node}</span></Row>
          <Row><span>Server up for</span><span style={{ fontSize: 12.5 }}>{dur(d.host.uptime_s)}</span></Row>
          <Row><span>App up for</span><span style={{ fontSize: 12.5 }}>{dur(d.process.uptime_s)}</span></Row>
          <Row><span>App memory</span><span style={{ fontSize: 12.5 }}>{fmtBytes(d.process.rss)}</span></Row>
          <Row><span>Memory</span><span style={{ fontSize: 12.5 }}>{fmtBytes(d.memory.used)} of {fmtBytes(d.memory.total)}</span></Row>
          {d.disk && <Row><span>Disk</span><span style={{ fontSize: 12.5 }}>{fmtBytes(d.disk.used)} of {fmtBytes(d.disk.total)} · {fmtBytes(d.disk.free)} free</span></Row>}
        </Card>
        <Card>
          <H3>Database & channels</H3>
          <Row><span>Database</span><span style={{ fontSize: 12.5 }}>{fmtBytes(d.database.size)}</span></Row>
          <Row><span>Write-ahead log</span><span style={{ fontSize: 12.5 }}>{fmtBytes(d.database.wal)}</span></Row>
          {d.whatsapp && <Row><span>WhatsApp numbers connected</span><span style={{ fontSize: 12.5 }}>{fmtNum(d.whatsapp.connected)} of {fmtNum(d.whatsapp.total)}</span></Row>}
        </Card>
      </div>
    </div>
  );
}
