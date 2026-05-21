'use client';

import { useRouter } from 'next/navigation';
import { Lock, Zap, Sparkles, ArrowRight, CheckCircle2, X } from 'lucide-react';
import { useState } from 'react';

/**
 * Plan-lock UI primitives. All visible, all clickable to upgrade.
 *
 * Components:
 *   <LockTooltip feature="..." requiredPlan="Growth">  → wraps anything, shows hover banner
 *   <LockBadge requiredPlan="Growth" inline />          → standalone "🔒 Growth" pill
 *   <LockedOverlay feature="..." requiredPlan="Growth" />→ full-card lock overlay
 *   <UpgradeCta planName="Growth" />                    → standalone upgrade button
 *   <PlanLockStyles />                                   → shared CSS (mount once near root)
 */

// ── Hover wrapper ──────────────────────────────────────────────────────────────
export function LockTooltip({ feature, requiredPlan = 'Growth', children, className = '', style = {} }) {
  return (
    <span className={`pl-tt ${className}`} style={style}>
      {children}
      <span className="pl-tt-bubble">
        <Lock size={12} />
        <span><strong>{feature}</strong> · Upgrade to {requiredPlan} to unlock</span>
      </span>
    </span>
  );
}

// ── Standalone "🔒 Growth" pill ────────────────────────────────────────────────
export function LockBadge({ requiredPlan = 'Growth', size = 'md', inline = false }) {
  return (
    <span className={`pl-badge pl-badge-${size} ${inline ? 'pl-badge-inline' : ''}`}>
      <Lock size={size === 'sm' ? 10 : 12} />
      {requiredPlan}
    </span>
  );
}

// ── Full overlay that replaces a section/tab ───────────────────────────────────
// Renders a centered locked card explaining what's missing + upgrade CTA.
export function LockedOverlay({
  feature,
  requiredPlan = 'Growth',
  currentPlan = 'Free',
  description,
  perks = [],
  compact = false,
}) {
  const router = useRouter();
  return (
    <div className={`pl-overlay ${compact ? 'pl-overlay-compact' : ''}`}>
      <div className="pl-overlay-bg" aria-hidden />
      <div className="pl-overlay-card">
        <div className="pl-overlay-icon">
          <Lock size={28} />
        </div>
        <div className="pl-overlay-tier">
          {requiredPlan} feature · you&apos;re on {currentPlan}
        </div>
        <h2 className="pl-overlay-title">{feature}</h2>
        {description && <p className="pl-overlay-desc">{description}</p>}
        {perks.length > 0 && (
          <ul className="pl-overlay-perks">
            {perks.map((p, i) => (
              <li key={i}>
                <CheckCircle2 size={14} />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}
        <button
          className="pl-overlay-cta"
          onClick={() => router.push('/settings?tab=workspace')}
        >
          <Sparkles size={14} /> Upgrade to {requiredPlan} <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Standalone upgrade button ─────────────────────────────────────────────────
export function UpgradeCta({ planName = 'Growth', size = 'md', label }) {
  const router = useRouter();
  return (
    <button
      className={`pl-cta pl-cta-${size}`}
      onClick={() => router.push('/settings?tab=workspace')}
    >
      <Sparkles size={size === 'sm' ? 12 : 14} />
      {label || `Upgrade to ${planName}`}
      <ArrowRight size={size === 'sm' ? 12 : 14} />
    </button>
  );
}

// ── Persistent top banner ─────────────────────────────────────────────────────
// Shown on Free / Starter plans. Dismissable for 24h via localStorage.
export function PlanBanner({ plan, planName, usage, limits, lockedCount = 0 }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(() => {
    try {
      const t = localStorage.getItem('wf_plan_banner_dismissed');
      if (!t) return false;
      return Date.now() - parseInt(t, 10) < 24 * 60 * 60 * 1000;
    } catch { return false; }
  });

  if (!plan || plan === 'growth' || plan === 'enterprise') return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('wf_plan_banner_dismissed', String(Date.now())); } catch {}
  };

  const leadsLimit = limits?.leads;
  const leadsUsed = usage?.leads || 0;
  const leadsPct = leadsLimit && leadsLimit > 0 ? Math.min(100, (leadsUsed / leadsLimit) * 100) : 0;
  const leadsCritical = leadsPct >= 80;

  return (
    <div className={`pl-banner ${plan === 'free' ? 'pl-banner-free' : 'pl-banner-starter'}`}>
      <div className="pl-banner-inner">
        <div className="pl-banner-icon">
          <Zap size={14} />
        </div>
        <div className="pl-banner-text">
          <span>You&apos;re on the <strong>{planName}</strong> plan.</span>
          {leadsLimit && leadsLimit > 0 && (
            <span className={`pl-banner-meter ${leadsCritical ? 'crit' : ''}`}>
              <span className="pl-banner-meter-track">
                <span className="pl-banner-meter-fill" style={{ width: leadsPct + '%' }} />
              </span>
              <span>{leadsUsed}/{leadsLimit} leads</span>
            </span>
          )}
          {lockedCount > 0 && (
            <span className="pl-banner-locked">{lockedCount} features locked</span>
          )}
        </div>
        <button className="pl-banner-cta" onClick={() => router.push('/settings?tab=workspace')}>
          <Sparkles size={13} /> Upgrade
        </button>
        <button className="pl-banner-x" onClick={handleDismiss} aria-label="Dismiss">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

// ── NavBar plan chip ──────────────────────────────────────────────────────────
export function PlanChip({ plan, planName, usage, limits, compact = false }) {
  const router = useRouter();
  if (!plan) return null;

  const tone = plan === 'free' ? 'free' : plan === 'starter' ? 'starter' : plan === 'growth' ? 'growth' : 'enterprise';
  const leadsLimit = limits?.leads;
  const leadsUsed = usage?.leads || 0;
  const showLeads = leadsLimit && leadsLimit > 0;

  return (
    <button
      className={`pl-chip pl-chip-${tone}`}
      onClick={() => router.push('/settings?tab=workspace')}
      title={plan === 'free' || plan === 'starter' ? 'Click to upgrade' : 'View plan'}
    >
      {(plan === 'free' || plan === 'starter') && <Lock size={11} />}
      {plan === 'growth' && <Sparkles size={11} />}
      {plan === 'enterprise' && <Zap size={11} />}
      <span>{planName}</span>
      {!compact && showLeads && <span className="pl-chip-sep">·</span>}
      {!compact && showLeads && <span>{leadsUsed}/{leadsLimit}</span>}
    </button>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
export function PlanLockStyles() {
  return (
    <style>{`
      /* ── Tooltip wrapper ── */
      .pl-tt { position: relative; display: inline-flex; align-items: center; }
      .pl-tt-bubble {
        position: absolute;
        top: 100%; left: 50%;
        transform: translate(-50%, 8px);
        white-space: nowrap;
        padding: 7px 12px;
        background: #14161f;
        border: 1px solid rgba(168,85,247,0.4);
        color: #f3f4f6;
        font-size: 12px;
        font-weight: 500;
        border-radius: 8px;
        box-shadow: 0 12px 28px rgba(0,0,0,0.4), 0 0 0 1px rgba(168,85,247,0.15);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s, transform 0.15s;
        z-index: 9999;
        display: inline-flex; align-items: center; gap: 6px;
      }
      .pl-tt-bubble svg { color: #c084fc; flex-shrink: 0; }
      .pl-tt-bubble::before {
        content: ''; position: absolute;
        bottom: 100%; left: 50%; transform: translateX(-50%);
        border: 5px solid transparent;
        border-bottom-color: rgba(168,85,247,0.4);
      }
      .pl-tt:hover .pl-tt-bubble {
        opacity: 1;
        transform: translate(-50%, 4px);
      }

      /* ── Standalone badge ── */
      .pl-badge {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 3px 8px;
        background: linear-gradient(135deg, rgba(245,158,11,0.15), rgba(168,85,247,0.15));
        border: 1px solid rgba(245,158,11,0.35);
        color: #fde68a;
        font-size: 10.5px; font-weight: 700;
        border-radius: 999px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        flex-shrink: 0;
      }
      .pl-badge-sm { font-size: 9.5px; padding: 2px 7px; }
      .pl-badge-inline { margin-left: 6px; vertical-align: middle; }

      /* ── Full-card overlay ── */
      .pl-overlay {
        position: relative;
        min-height: 380px;
        padding: 60px 32px;
        display: flex; align-items: center; justify-content: center;
        background: linear-gradient(180deg, rgba(245,158,11,0.04), rgba(168,85,247,0.06) 60%, rgba(99,102,241,0.04));
        border: 1.5px dashed rgba(245,158,11,0.30);
        border-radius: 18px;
        overflow: hidden;
      }
      .pl-overlay-compact { min-height: 240px; padding: 36px 24px; }
      .pl-overlay-bg {
        position: absolute; inset: 0;
        background:
          radial-gradient(ellipse 500px 300px at 30% 20%, rgba(245,158,11,0.10), transparent 60%),
          radial-gradient(ellipse 500px 300px at 70% 80%, rgba(168,85,247,0.10), transparent 60%);
        pointer-events: none;
      }
      .pl-overlay-card {
        position: relative; z-index: 1;
        max-width: 460px;
        text-align: center;
      }
      .pl-overlay-icon {
        display: inline-flex;
        width: 64px; height: 64px;
        border-radius: 18px;
        background: linear-gradient(135deg, #f59e0b, #a855f7);
        color: #fff;
        align-items: center; justify-content: center;
        margin-bottom: 18px;
        box-shadow: 0 12px 32px rgba(168,85,247,0.4);
      }
      .pl-overlay-tier {
        display: inline-block;
        padding: 4px 12px;
        background: rgba(245,158,11,0.10);
        border: 1px solid rgba(245,158,11,0.30);
        color: #fbbf24;
        font-size: 11px; font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-radius: 999px;
        margin-bottom: 14px;
      }
      .pl-overlay-title {
        font-size: 26px; font-weight: 800;
        color: var(--text, #f3f4f6);
        margin: 0 0 10px;
        letter-spacing: -0.02em;
      }
      .pl-overlay-desc {
        font-size: 14.5px; line-height: 1.55;
        color: var(--text-dim, #b5bac9);
        margin: 0 0 20px;
      }
      .pl-overlay-perks {
        list-style: none; padding: 0;
        margin: 0 0 24px;
        display: flex; flex-direction: column; gap: 8px;
        text-align: left;
        max-width: 340px;
        margin-left: auto; margin-right: auto;
      }
      .pl-overlay-perks li {
        display: flex; align-items: flex-start; gap: 8px;
        font-size: 13.5px;
        color: var(--text-dim, #b5bac9);
      }
      .pl-overlay-perks svg { color: #34d399; flex-shrink: 0; margin-top: 2px; }
      .pl-overlay-cta {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 12px 22px;
        background: linear-gradient(135deg, #f59e0b, #a855f7);
        color: #fff; border: none;
        border-radius: 11px;
        font-size: 14px; font-weight: 700;
        cursor: pointer;
        font-family: inherit;
        box-shadow: 0 10px 28px rgba(168,85,247,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
        transition: transform 0.15s, box-shadow 0.15s;
      }
      .pl-overlay-cta:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 36px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.25);
      }

      /* ── Standalone CTA button ── */
      .pl-cta {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 16px;
        background: linear-gradient(135deg, #f59e0b, #a855f7);
        color: #fff; border: none;
        border-radius: 9px;
        font-size: 13px; font-weight: 700;
        cursor: pointer;
        font-family: inherit;
        box-shadow: 0 6px 18px rgba(168,85,247,0.35);
        transition: all 0.15s;
      }
      .pl-cta:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(168,85,247,0.5); }
      .pl-cta-sm { padding: 6px 12px; font-size: 11.5px; }
      .pl-cta-lg { padding: 12px 22px; font-size: 14.5px; }

      /* ── Persistent top banner ── */
      .pl-banner {
        position: sticky;
        top: 0;
        z-index: 50;
        width: 100%;
        background: linear-gradient(90deg, #1f1432 0%, #2b1a3d 50%, #1f1432 100%);
        border-bottom: 1px solid rgba(168,85,247,0.3);
        color: #f3f4f6;
        font-family: inherit;
        box-shadow: 0 1px 0 rgba(168,85,247,0.15);
      }
      .pl-banner-free   { border-bottom-color: rgba(245,158,11,0.35); }
      .pl-banner-starter { border-bottom-color: rgba(99,102,241,0.35); }
      .pl-banner-inner {
        max-width: 1400px;
        margin: 0 auto;
        padding: 8px 20px;
        display: flex; align-items: center; gap: 14px;
      }
      .pl-banner-icon {
        width: 26px; height: 26px;
        border-radius: 7px;
        background: linear-gradient(135deg, #f59e0b, #a855f7);
        color: #fff;
        display: grid; place-items: center;
        flex-shrink: 0;
      }
      .pl-banner-text {
        flex: 1;
        display: flex; align-items: center; gap: 14px;
        font-size: 13px;
        color: #e7eaf3;
        flex-wrap: wrap;
      }
      .pl-banner-text strong { color: #fff; font-weight: 700; }
      .pl-banner-meter { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: #b5bac9; }
      .pl-banner-meter-track {
        display: inline-block;
        width: 80px; height: 6px;
        background: rgba(255,255,255,0.1);
        border-radius: 999px;
        overflow: hidden;
      }
      .pl-banner-meter-fill {
        display: block; height: 100%;
        background: linear-gradient(90deg, #818cf8, #c084fc);
        transition: width 0.3s;
      }
      .pl-banner-meter.crit .pl-banner-meter-fill { background: linear-gradient(90deg, #f59e0b, #ef4444); }
      .pl-banner-meter.crit { color: #fca5a5; font-weight: 600; }
      .pl-banner-locked {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 8px;
        background: rgba(245,158,11,0.15);
        border: 1px solid rgba(245,158,11,0.30);
        color: #fde68a;
        font-size: 11px; font-weight: 700;
        border-radius: 999px;
      }
      .pl-banner-cta {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 6px 14px;
        background: linear-gradient(135deg, #f59e0b, #a855f7);
        color: #fff; border: none;
        border-radius: 8px;
        font-size: 12.5px; font-weight: 700;
        cursor: pointer;
        font-family: inherit;
        box-shadow: 0 4px 12px rgba(168,85,247,0.35);
        white-space: nowrap;
      }
      .pl-banner-cta:hover { transform: translateY(-1px); }
      .pl-banner-x {
        width: 26px; height: 26px;
        background: transparent;
        border: 1px solid rgba(255,255,255,0.1);
        color: #9ca3af;
        border-radius: 7px;
        cursor: pointer;
        display: grid; place-items: center;
        flex-shrink: 0;
      }
      .pl-banner-x:hover { background: rgba(255,255,255,0.06); color: #f3f4f6; }

      @media (max-width: 700px) {
        .pl-banner-meter-track { display: none; }
        .pl-banner-locked { display: none; }
      }

      /* ── NavBar plan chip ── */
      .pl-chip {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 5px 11px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.10);
        color: var(--text, #f3f4f6);
        font-size: 11.5px; font-weight: 700;
        border-radius: 999px;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .pl-chip:hover { transform: translateY(-1px); }
      .pl-chip-sep { opacity: 0.4; }
      .pl-chip-free {
        background: rgba(245,158,11,0.10);
        border-color: rgba(245,158,11,0.35);
        color: #fde68a;
      }
      .pl-chip-starter {
        background: rgba(99,102,241,0.10);
        border-color: rgba(99,102,241,0.35);
        color: #c7d2fe;
      }
      .pl-chip-growth {
        background: linear-gradient(135deg, rgba(168,85,247,0.15), rgba(99,102,241,0.15));
        border-color: rgba(168,85,247,0.35);
        color: #d8b4fe;
      }
      .pl-chip-enterprise {
        background: linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.15));
        border-color: rgba(34,197,94,0.35);
        color: #6ee7b7;
      }
    `}</style>
  );
}
