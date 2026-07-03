'use client';

import { useRouter } from 'next/navigation';
import { Lock, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { usePlan, planLabel, nextPlanLabel, UPGRADE_ROUTE } from '@/lib/plan';

/**
 * Plan-lock UI primitives. All visible, all clickable to upgrade.
 * Tier vocabulary comes from lib/plan.js (PLAN_META — mirrors backend/entitlements.js);
 * defaults derive from the live plan context, so no dead-tier strings can render.
 *
 * Components:
 *   <LockTooltip feature="..." requiredPlan="Studio">  → wraps anything, shows hover banner
 *   <LockBadge requiredPlan="Studio" inline />          → standalone "🔒 Studio" pill
 *   <LockedOverlay feature="..." requiredPlan="Studio" />→ full-card lock overlay
 *   <UpgradeCta planName="Studio" />                    → standalone upgrade button
 *   <PlanLockStyles />                                   → shared CSS (mount once near root)
 */

// ── Hover wrapper ──────────────────────────────────────────────────────────────
export function LockTooltip({ feature, requiredPlan, children, className = '', style = {} }) {
  const { plan } = usePlan();
  requiredPlan = requiredPlan || nextPlanLabel(plan);
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

// ── Standalone "🔒 Studio" pill ────────────────────────────────────────────────
export function LockBadge({ requiredPlan, size = 'md', inline = false }) {
  const { plan } = usePlan();
  requiredPlan = requiredPlan || nextPlanLabel(plan);
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
  requiredPlan,
  currentPlan,
  description,
  perks = [],
  compact = false,
}) {
  const router = useRouter();
  const { plan, planName } = usePlan();
  requiredPlan = requiredPlan || nextPlanLabel(plan);
  currentPlan = currentPlan || planName || planLabel(plan);
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
          onClick={() => router.push(UPGRADE_ROUTE)}
        >
          <Sparkles size={14} /> Upgrade to {requiredPlan} <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Standalone upgrade button ─────────────────────────────────────────────────
export function UpgradeCta({ planName, size = 'md', label }) {
  const router = useRouter();
  const { plan } = usePlan();
  planName = planName || nextPlanLabel(plan);
  return (
    <button
      className={`pl-cta pl-cta-${size}`}
      onClick={() => router.push(UPGRADE_ROUTE)}
    >
      <Sparkles size={size === 'sm' ? 12 : 14} />
      {label || `Upgrade to ${planName}`}
      <ArrowRight size={size === 'sm' ? 12 : 14} />
    </button>
  );
}

// (PlanBanner and PlanChip were deleted 2026-07-01 — Foundation Sprint dead-code-purge.
//  They were never imported anywhere and were keyed to the retired free/starter/growth
//  tiers. Recoverable from git history; a future in-nav plan widget should be built
//  against the live usePlan() context.)

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

    `}</style>
  );
}
