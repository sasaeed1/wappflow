"""Render the workflow inventory JSON into a complete WappFlow feature-set spec (markdown)."""
import json, sys, io

SRC = sys.argv[1]
OUT = sys.argv[2]

d = json.load(open(SRC, encoding='utf-8'))
res = d.get('result', d)
inv = res.get('inventory', [])
sweep = res.get('sweep')

L = []
def w(s=''): L.append(s)

w('# WappFlow — Complete Feature Set')
w()
w('> Auto-generated from a full source-code inventory of the WappFlow codebase '
  '(backend Express + better-sqlite3, web Next.js, desktop Electron). One section per module: '
  'overview, every feature, every API route, data model, rules/constraints, automations, AI behaviors, integrations. '
  'Generated 2026-06-27.')
w()

# Table of contents
w('## Modules')
for i, m in enumerate(inv, 1):
    name = m.get('module', f'Module {i}')
    w(f'{i}. {name}')
if sweep:
    w(f'{len(inv)+1}. Coverage sweep (all modules / routes / jobs / crons / events)')
w()
w('---')
w()

def render_module(m, idx):
    w(f'## {idx}. {m.get("module","(module)")}')
    w()
    ov = m.get('overview')
    if ov:
        w(ov); w()
    feats = m.get('features', [])
    if feats:
        w('### Features')
        for f in feats:
            w(f'- **{f.get("name","").strip()}** — {f.get("detail","").strip()}')
        w()
    routes = m.get('routes', [])
    if routes:
        w(f'### API endpoints ({len(routes)})')
        for r in routes:
            method = (r.get('method','') or '').strip().upper()
            path = (r.get('path','') or '').strip()
            purpose = (r.get('purpose','') or '').strip()
            w(f'- `{method} {path}` — {purpose}')
        w()
    dm = m.get('data_model', [])
    if dm:
        w('### Data model')
        for t in dm:
            kc = t.get('key_columns')
            kc = f' — _cols:_ {kc.strip()}' if kc else ''
            w(f'- **{t.get("name","").strip()}** — {t.get("purpose","").strip()}{kc}')
        w()
    rules = m.get('rules', [])
    if rules:
        w('### Rules, constraints & guarantees')
        for r in rules:
            w(f'- {r.strip()}')
        w()
    autos = m.get('automations', [])
    if autos:
        w('### Automations (crons / jobs / triggers / auto-behaviors)')
        for a in autos:
            w(f'- {a.strip()}')
        w()
    ai = m.get('ai_behaviors', [])
    if ai:
        w('### AI behaviors')
        for a in ai:
            w(f'- {a.strip()}')
        w()
    integ = m.get('integrations', [])
    if integ:
        w('### Integrations')
        for i in integ:
            w(f'- {i.strip()}')
        w()
    w('---'); w()

for i, m in enumerate(inv, 1):
    render_module(m, i)

if sweep:
    render_module(sweep, len(inv)+1)

text = '\n'.join(L)
with io.open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(text)

# stats (ascii-safe)
nfeat = sum(len(m.get('features',[])) for m in inv) + (len(sweep.get('features',[])) if sweep else 0)
nroute = sum(len(m.get('routes',[])) for m in inv) + (len(sweep.get('routes',[])) if sweep else 0)
ntab = sum(len(m.get('data_model',[])) for m in inv)
print('modules: %d | features: %d | routes: %d | tables: %d | chars: %d'
      % (len(inv) + (1 if sweep else 0), nfeat, nroute, ntab, len(text)))
