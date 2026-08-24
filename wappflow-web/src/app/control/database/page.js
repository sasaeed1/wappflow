'use client';
import { useEffect, useState, useCallback } from 'react';
import { ccApi, ccAuth, fmtNum } from '@/lib/ccApi';
import { Card, Pill } from '@/components/control/ControlShell';
import { clickable } from '@/lib/a11y';

export default function Database() {
  // ── Explorer state ──
  const [tables, setTables] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // ── SQL console state ──
  const [sql, setSql] = useState('SELECT * FROM workspaces LIMIT 20');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [sqlError, setSqlError] = useState('');
  const [elevatedToken, setElevatedToken] = useState(null);

  const loadTables = useCallback(() => {
    ccApi.dbTables().then((r) => setTables(r.data.tables || [])).catch(() => setTables([]));
  }, []);
  useEffect(() => { loadTables(); }, [loadTables]);

  const openTable = useCallback((name, off = 0) => {
    setSelected(name); setOffset(off); setLoadingDetail(true);
    ccApi.dbTable(name, { limit, offset: off })
      .then((r) => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, []);

  // Runs the query. Pass an explicit token when retrying right after step-up
  // (state updates are async, so we can't rely on elevatedToken yet).
  const runQuery = async (tokenOverride) => {
    if (!sql.trim()) return;
    setRunning(true); setSqlError(''); setResult(null);
    try {
      const r = await ccApi.sqlQuery(sql, tokenOverride || elevatedToken);
      setResult(r.data);
    } catch (e) {
      const data = e.response?.data;
      if (e.response?.status === 403 && data?.need_step_up) {
        const pw = window.prompt('Step-up required. Re-enter your password to run founder-level SQL:');
        if (!pw) { setRunning(false); return; }
        try {
          const su = await ccAuth.stepUp(pw);
          const token = su.data.token;
          setElevatedToken(token);
          setRunning(false);
          return runQuery(token); // retry with the fresh elevated token
        } catch (se) {
          setSqlError(se.response?.data?.error || 'Step-up failed');
        }
      } else {
        setSqlError(data?.error || 'Query failed');
      }
    }
    setRunning(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Database</h1>
        <span style={{ color: 'var(--text-dim,#666)', fontSize: 13 }}>{fmtNum(tables.length)} tables · read-only</span>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* LEFT — table list */}
        <Card style={{ padding: 0, width: 240, flexShrink: 0, maxHeight: 560, overflow: 'auto' }}>
          <div style={{ padding: '11px 14px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--text-dim,#666)', borderBottom: '1px solid var(--border,#1e1e26)' }}>Tables</div>
          {!tables.length && <div style={{ padding: 14, fontSize: 13, color: 'var(--text-dim,#666)' }}>No tables.</div>}
          {tables.map((t) => {
            const active = selected === t.name;
            return (
              <div key={t.name} {...clickable(() => openTable(t.name, 0))}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '9px 14px', cursor: 'pointer', fontSize: 13,
                  background: active ? 'color-mix(in srgb, var(--accent,#6366f1) 14%, transparent)' : 'transparent',
                  color: active ? 'var(--accent,#818cf8)' : 'var(--text,#e8e8ea)', borderBottom: '1px solid var(--border,#1e1e26)' }}>
                <span style={{ fontWeight: active ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim,#666)', flexShrink: 0 }}>{fmtNum(t.rowCount)}</span>
              </div>
            );
          })}
        </Card>

        {/* RIGHT — table detail */}
        <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!selected && (
            <Card><div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>Select a table to inspect its columns, indexes, and sample rows.</div></Card>
          )}

          {selected && (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border,#1e1e26)', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{selected}</span>
                {detail && <span style={{ fontSize: 12.5, color: 'var(--text-dim,#666)' }}>{fmtNum(detail.rowCount)} rows</span>}
              </div>

              {loadingDetail && <div style={{ padding: 18, fontSize: 13, color: 'var(--text-dim,#666)' }}>Loading…</div>}

              {!loadingDetail && detail && (
                <div>
                  {/* Columns */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border,#1e1e26)' }}>
                    <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--text-dim,#666)', marginBottom: 8 }}>Columns</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {detail.columns.map((c) => (
                        <span key={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 9px', borderRadius: 8, border: '1px solid var(--border,#1e1e26)', background: 'var(--bg,#0a0a0f)' }}>
                          <span style={{ fontWeight: 600 }}>{c.name}</span>
                          <span style={{ color: 'var(--text-dim,#666)' }}>{c.type || '—'}</span>
                          {c.pk && <Pill tone="purple">PK</Pill>}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Indexes */}
                  {!!detail.indexes.length && (
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border,#1e1e26)' }}>
                      <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--text-dim,#666)', marginBottom: 8 }}>Indexes</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {detail.indexes.map((ix) => (
                          <Pill key={ix.name} tone={ix.unique ? 'blue' : 'neutral'}>{ix.name}{ix.unique ? ' · unique' : ''}</Pill>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sample rows */}
                  <div style={{ overflow: 'auto', maxHeight: 360 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--text-dim,#666)', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4 }}>
                          {detail.columns.map((c) => (
                            <th key={c.name} style={{ padding: '9px 12px', borderBottom: '1px solid var(--border,#1e1e26)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--surface,#14141b)' }}>{c.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {!detail.rows.length && <tr><td colSpan={detail.columns.length || 1} style={{ padding: 16, color: 'var(--text-dim,#666)' }}>No rows.</td></tr>}
                        {detail.rows.map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border,#1e1e26)' }}>
                            {detail.columns.map((c) => <td key={c.name} style={cell}>{fmtCell(row[c.name])}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {detail.rowCount > limit && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: 12, borderTop: '1px solid var(--border,#1e1e26)' }}>
                      <button disabled={offset === 0} onClick={() => openTable(selected, Math.max(0, offset - limit))} style={pgBtn}>← Prev</button>
                      <span style={{ alignSelf: 'center', fontSize: 12.5, color: 'var(--text-dim,#666)' }}>{offset + 1}–{Math.min(offset + limit, detail.rowCount)} of {fmtNum(detail.rowCount)}</span>
                      <button disabled={offset + limit >= detail.rowCount} onClick={() => openTable(selected, offset + limit)} style={pgBtn}>Next →</button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* SQL CONSOLE */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>SQL Console</span>
          <Pill tone="amber">read-only</Pill>
          {elevatedToken && <Pill tone="green">elevated</Pill>}
          <span style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}>
            Only SELECT / WITH / EXPLAIN / PRAGMA run here — writes are blocked at the database level and every query is audited.
          </span>
        </div>

        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
          rows={5}
          placeholder="SELECT * FROM workspaces LIMIT 20"
          style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--border,#1e1e26)',
            background: 'var(--bg,#0a0a0f)', color: 'var(--text,#e8e8ea)', fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', resize: 'vertical', lineHeight: 1.5 }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button disabled={running} onClick={() => runQuery()} style={runBtn}>{running ? 'Running…' : 'Run (founder · audited)'}</button>
          {result?.truncated && <span style={{ fontSize: 12, color: '#fbbf24' }}>Results truncated to 1000 rows.</span>}
        </div>

        {sqlError && (
          <div style={{ padding: '10px 13px', borderRadius: 9, background: '#f8717115', border: '1px solid #f8717140', color: '#f87171', fontSize: 12.5, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap' }}>
            {sqlError}
          </div>
        )}

        {result && (
          <div style={{ border: '1px solid var(--border,#1e1e26)', borderRadius: 10, overflow: 'auto', maxHeight: 420 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-dim,#666)', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4 }}>
                  {result.columns.map((c) => (
                    <th key={c} style={{ padding: '9px 12px', borderBottom: '1px solid var(--border,#1e1e26)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--surface,#14141b)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!result.rows.length && <tr><td colSpan={result.columns.length || 1} style={{ padding: 16, color: 'var(--text-dim,#666)' }}>Query returned no rows.</td></tr>}
                {result.rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border,#1e1e26)' }}>
                    {result.columns.map((c) => <td key={c} style={cell}>{fmtCell(row[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function fmtCell(v) {
  if (v === null || v === undefined) return <span style={{ color: 'var(--text-dim,#666)' }}>null</span>;
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return s.length > 200 ? s.slice(0, 200) + '…' : s;
}

const cell = { padding: '8px 12px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const pgBtn = { padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)', color: 'var(--text,#e8e8ea)', fontSize: 13, cursor: 'pointer' };
const runBtn = { padding: '9px 16px', borderRadius: 9, border: '1px solid #818cf855', background: '#818cf81a', color: '#818cf8', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
