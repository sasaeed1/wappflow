'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { fetchPublicPortfolio } from '../../../lib/api';
import PortfolioCanvas from '../portfolio-view';

export default function PublicPortfolioPage() {
  const { handle } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | missing

  useEffect(() => {
    let on = true;
    fetchPublicPortfolio(handle)
      .then((d) => { if (on) { setData(d); setState('ok'); document.title = `${d.title || 'Portfolio'}`; } })
      .catch((e) => { if (on) setState(e.message === 'not_found' ? 'missing' : 'error'); });
    return () => { on = false; };
  }, [handle]);

  if (state === 'loading') {
    return <div style={shell}><div style={{ width: 26, height: 26, border: '2px solid rgba(0,0,0,0.15)', borderTopColor: '#000', borderRadius: '50%', animation: 'pfspin 0.9s linear infinite' }} /><style>{`@keyframes pfspin{to{transform:rotate(360deg)}}`}</style></div>;
  }
  if (state !== 'ok') {
    return (
      <div style={{ ...shell, flexDirection: 'column', gap: 10, textAlign: 'center', padding: 24 }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 28, margin: 0 }}>Portfolio not found</h1>
        <p style={{ color: '#777', fontSize: 14, margin: 0 }}>This portfolio may be private or the link may be incorrect.</p>
      </div>
    );
  }
  return <PortfolioCanvas portfolio={data} items={data.items || []} />;
}

const shell = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3efe7', color: '#1a1714' };
