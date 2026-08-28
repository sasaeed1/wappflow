'use client';
/* eslint-disable @next/next/no-img-element -- client photographs are dynamic /uploads URLs */

// Shared chrome for the pages a CLIENT sees: print shop, booking, portal.
//
// The gallery set the language (dark ground, Fraunces, one gold accent) and
// these mount the same tokens rather than each hand-rolling a palette. A client
// moving from their gallery to the shop to the booking page should never feel
// they have changed company — which is exactly what three separate grey pages
// with white cards achieved.

import { useState, useEffect } from 'react';
import { mediaUrl } from '@/lib/api';
import '../../app/public-theme.css';

/** The page ground. Everything client-facing goes inside one of these. */
export function PublicShell({ children }) {
  return <div className="pub">{children}</div>;
}

/**
 * Hero with an optional ambient wash made from the client's own photographs.
 *
 * The wash is deliberately the only decoration on these pages. Stock gradients
 * and abstract shapes are what a template looks like; a studio's page should be
 * decorated by the studio's work, and when there is no work to show it simply
 * renders nothing rather than inventing something.
 */
export function PublicHero({ kicker, title, sub, photos, children }) {
  return (
    <header className="pub-hero">
      <AmbientWash photos={photos} />
      <div className="pub-hero-inner">
        {children}
        {kicker && <p className="pub-kicker">{kicker}</p>}
        <h1 className="pub-h1">{title}</h1>
        {sub && <p className="pub-sub">{sub}</p>}
      </div>
    </header>
  );
}

export function AmbientWash({ photos }) {
  const picks = (photos || []).filter(Boolean).slice(0, 3);
  if (!picks.length) return null;
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {picks.map((p, i) => (
        <img key={p.id || p.thumb || i} src={mediaUrl(p.thumb || p.web || p)} alt="" loading="lazy"
          style={{
            position: 'absolute', width: '46%', minWidth: 320, aspectRatio: '1 / 1', objectFit: 'cover',
            left: `${i * 34 - 8}%`, top: i % 2 ? '-24%' : '-38%',
            filter: 'blur(72px) saturate(1.25)', opacity: 0.34, transform: 'scale(1.25)',
          }} />
      ))}
      {/* The wash has to sink behind the type or nothing over it is readable. */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% 0%, rgba(11,11,15,0.35), var(--pub-bg) 72%)' }} />
    </div>
  );
}

export function PublicStep({ n, title, hint }) {
  return (
    <div className="pub-step">
      <span className="pub-step-n">{n}</span>
      <h2 className="pub-h2">{title}</h2>
      {hint && <span className="pub-dim" style={{ fontSize: 12 }}>{hint}</span>}
    </div>
  );
}

export function PublicField({ label, required, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="pub-label">{label}{required && <span className="pub-req"> *</span>}</span>
      {children}
    </label>
  );
}

export function PublicLoading() {
  return (
    <PublicShell>
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}><div className="pub-spin" /></div>
    </PublicShell>
  );
}

/** One honest dead end, used by every surface so they fail the same way. */
export function PublicUnavailable({ title = 'Not available', message = 'This link is incorrect, or it has been withdrawn.' }) {
  return (
    <PublicShell>
      <div style={{ textAlign: 'center', padding: '22vh 24px' }}>
        <h1 className="pub-h1" style={{ fontSize: 30 }}>{title}</h1>
        <p className="pub-muted" style={{ marginTop: 10, fontSize: 14.5 }}>{message}</p>
      </div>
    </PublicShell>
  );
}

/**
 * Client-side-only render gate.
 *
 * These pages read tokens from the URL and fetch on mount, so their first paint
 * has nothing in it. Rendering the spinner on the server and the content on the
 * client is a hydration mismatch waiting to happen; this makes the boundary
 * explicit.
 */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
