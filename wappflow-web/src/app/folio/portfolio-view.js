'use client';
/* eslint-disable @next/next/no-img-element -- portfolio media are dynamic /uploads URLs */

import { useState, useEffect } from 'react';
import { mediaUrl } from '../../lib/api';
import './portfolio.css';

const igUrl = (h) => (/^https?:\/\//.test(h) ? h : `https://instagram.com/${String(h).replace('@', '')}`);
const extUrl = (u) => (/^https?:\/\//.test(u) ? u : `https://${u}`);

// One renderer, ten identities. The public page and the editor preview both use
// this — the look is driven entirely by `pf.theme` → `.pf-theme-<name>` in CSS.
export default function PortfolioCanvas({ portfolio, items = [], preview = false }) {
  const [lb, setLb] = useState(null);
  const pf = portfolio || {};
  const s = pf.settings || {};
  const cover = pf.cover_url || (items.find((i) => i.kind === 'photo')?.full_url) || items[0]?.url || null;
  const styleVars = s.accent ? { '--pf-accent': s.accent } : undefined;
  const hasContact = s.email || s.phone || s.instagram || s.website;

  useEffect(() => {
    if (lb == null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLb(null);
      else if (e.key === 'ArrowRight') setLb((i) => Math.min(items.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setLb((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lb, items.length]);

  return (
    <div className={`pf-root pf-theme-${pf.theme || 'atelier'}`} style={styleVars}>
      <header className="pf-hero">
        {cover ? <img className="pf-hero-bg" src={mediaUrl(cover)} alt="" /> : <div className="pf-hero-bg pf-hero-fallback" />}
        <div className="pf-hero-veil" />
        <div className="pf-hero-inner">
          {pf.avatar_url && <img className="pf-avatar" src={mediaUrl(pf.avatar_url)} alt="" />}
          <p className="pf-eyebrow">{s.kicker || 'Portfolio'}</p>
          <h1 className="pf-title">{pf.title || 'Untitled Studio'}</h1>
          {pf.tagline && <p className="pf-tagline">{pf.tagline}</p>}
        </div>
        <span className="pf-scrollcue" aria-hidden />
      </header>

      {pf.bio && (
        <section className="pf-about">
          <span className="pf-about-label">About</span>
          <p className="pf-about-text">{pf.bio}</p>
        </section>
      )}

      <section className="pf-work">
        {items.length === 0 ? (
          <div className="pf-empty">{preview ? 'Your selected work will appear here — add some from the left.' : 'Coming soon.'}</div>
        ) : (
          <div className="pf-grid">
            {items.map((it, i) => (
              <figure key={it.id || i} className={`pf-item${it.featured ? ' is-featured' : ''}`} onClick={() => setLb(i)}>
                <div className="pf-item-media">
                  {it.kind === 'video'
                    ? <><img src={mediaUrl(it.poster_url || it.url)} alt={it.title || ''} loading="lazy" /><span className="pf-play" aria-hidden /></>
                    : <img src={mediaUrl(it.url || it.full_url)} alt={it.title || ''} loading="lazy" />}
                </div>
                {(it.title || it.caption) && (
                  <figcaption className="pf-cap">{it.title && <strong>{it.title}</strong>}{it.caption && <span>{it.caption}</span>}</figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </section>

      <footer className="pf-foot">
        <div className="pf-foot-name">{pf.title || 'Studio'}</div>
        {hasContact && (
          <div className="pf-foot-links">
            {s.email && <a href={`mailto:${s.email}`}>Email</a>}
            {s.phone && <a href={`tel:${s.phone}`}>Call</a>}
            {s.instagram && <a href={igUrl(s.instagram)} target="_blank" rel="noreferrer">Instagram</a>}
            {s.website && <a href={extUrl(s.website)} target="_blank" rel="noreferrer">Website</a>}
          </div>
        )}
        <div className="pf-foot-mark">Made with WappFlow Studio</div>
      </footer>

      {lb != null && items[lb] && (
        <div className="pf-lightbox" onClick={() => setLb(null)}>
          {items[lb].kind === 'video'
            ? <video src={mediaUrl(items[lb].video_url || items[lb].full_url || items[lb].url)} poster={items[lb].poster_url ? mediaUrl(items[lb].poster_url) : undefined} controls autoPlay onClick={(e) => e.stopPropagation()} />
            : <img src={mediaUrl(items[lb].full_url || items[lb].url)} alt="" onClick={(e) => e.stopPropagation()} />}
          <button className="pf-lb-x" onClick={(e) => { e.stopPropagation(); setLb(null); }}>✕</button>
          {lb > 0 && <button className="pf-lb-nav pf-lb-prev" onClick={(e) => { e.stopPropagation(); setLb(lb - 1); }}>‹</button>}
          {lb < items.length - 1 && <button className="pf-lb-nav pf-lb-next" onClick={(e) => { e.stopPropagation(); setLb(lb + 1); }}>›</button>}
        </div>
      )}
    </div>
  );
}

// Human labels + a representative palette for each theme (used by the editor's picker).
export const PORTFOLIO_THEME_META = {
  atelier:   { label: 'Atelier',   note: 'Warm minimal · serif',        swatch: ['#f3efe7', '#1a1714', '#b07d52'] },
  noir:      { label: 'Noir',      note: 'Black · high-contrast',       swatch: ['#0a0a0b', '#f5f5f3', '#e0e0e0'] },
  editorial: { label: 'Editorial', note: 'Magazine · asymmetric',       swatch: ['#faf7f1', '#211d18', '#bb4430'] },
  gallery:   { label: 'Gallery',   note: 'Museum white · flush grid',   swatch: ['#ffffff', '#111111', '#111111'] },
  film:      { label: 'Film',      note: 'Cinematic · grain · amber',   swatch: ['#0c0b0a', '#efe7d8', '#d89a4e'] },
  brut:      { label: 'Brutalist', note: 'Mono · raw · bordered',       swatch: ['#f4f4f0', '#0a0a0a', '#1f43ff'] },
  luxe:      { label: 'Luxe',      note: 'Emerald · gold · refined',    swatch: ['#0e221c', '#f3ead3', '#c8a35b'] },
  vivid:     { label: 'Vivid',     note: 'Gradient · bold type',        swatch: ['#160b2e', '#ffffff', '#ff4d6d'] },
  mono:      { label: 'Mono',      note: 'Pure black & white',          swatch: ['#ffffff', '#000000', '#000000'] },
  frame:     { label: 'Frame',     note: 'Framed prints · soft',        swatch: ['#ece7df', '#26211b', '#8a7b66'] },
};
