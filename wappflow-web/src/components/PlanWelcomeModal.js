'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Lock, CheckCircle2, Sparkles, ArrowRight, Zap, Crown, TrendingUp } from 'lucide-react';
import { usePlan } from '@/lib/plan';

/**
 * PlanWelcomeModal — shown to users based on their plan tier.
 *
 *   Free     → every session, until dismissed (sessionStorage)
 *   Starter  → one-time, lifetime per device (localStorage)
 *   Growth   → one-time, lifetime per device (localStorage)
 *   Enterprise → no modal
 *
 * Triggered by a sessionStorage flag set during login/signup
 * ("wf_just_logged_in"). For Starter/Growth, also checks if user
 * has never seen the welcome for their tier.
 */

const PLAN_CONFIG = {
  free: {
    tone: 'free',
    icon: <Zap size={24} />,
    title: 'Welcome to WappFlow Free',
    subtitle: 'Test the platform with all the essentials. Upgrade anytime to unlock the full toolkit.',
    included: [
      '1 WhatsApp account',
      '1 user only',
      '50 lead limit',
      'Basic inbox',
      'Basic CRM pipeline',
      'Limited AI replies',
      'Basic contact management',
    ],
    locked: [
      'Email integration',
      'Instagram inbox',
      'Facebook inbox',
      'Website-to-CRM lead capture',
      'Automations',
      'Team collaboration',
      'Shared inbox',
      'Google Calendar integration',
      'Calendly integration',
      'Analytics',
      'Workflow builder',
      'Internal notes',
      'Multi-channel inbox',
    ],
    ctaLabel: 'View plans & upgrade',
    secondaryLabel: 'Continue on Free',
  },
  starter: {
    tone: 'starter',
    icon: <TrendingUp size={24} />,
    title: 'Welcome to Starter',
    subtitle: 'You now have email integration, AI replies, and shared team workflows. Here’s what’s unlocked — and what’s next.',
    included: [
      '1 WhatsApp account',
      'Email integration',
      'Up to 2 users',
      '300 lead limit',
      'AI assistant',
      'Shared inbox',
      'Internal notes',
      'Voice notes & media support',
      'Basic analytics',
      'Priority email support',
    ],
    locked: [
      'Instagram inbox',
      'Facebook inbox',
      'Website-to-CRM lead capture',
      'Workflow automations',
      'Google Calendar integration',
      'Calendly integration',
      'Advanced analytics',
      'Multi-channel inbox',
    ],
    ctaLabel: 'Got it, let’s go',
    secondaryLabel: null,
    upgradeHint: 'Outgrowing Starter? Growth unlocks the multi-channel inbox + automations.',
  },
  growth: {
    tone: 'growth',
    icon: <Crown size={24} />,
    title: 'Welcome to Growth',
    subtitle: 'You’ve unlocked the full WappFlow toolkit for scaling teams. Schedule, automate, and close.',
    included: [
      'Unified inbox (WhatsApp + Instagram + Facebook)',
      'Website-to-CRM lead capture',
      'Email integration',
      'Up to 5 team members',
      'Unlimited leads',
      'AI assistant & smart summaries',
      'Team collaboration & shared conversations',
      'Google Calendar & Calendly integrations',
      'Workflow automations',
      'Voice notes & media support',
      'Reports & analytics',
      'Internal notes & reminders',
      'Multi-pipeline support',
      'Priority support',
    ],
    locked: [],
    ctaLabel: 'Let’s start',
    secondaryLabel: null,
    upgradeHint: 'Need unlimited channels, SSO, or white-label? Enterprise is one call away.',
  },
};

export default function PlanWelcomeModal() {
  const router = useRouter();
  const plan = usePlan();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    if (!plan.plan || plan.loading) return;
    if (typeof window === 'undefined') return;

    const tier = plan.plan;
    if (tier === 'enterprise' || !PLAN_CONFIG[tier]) return;

    const justLoggedIn = sessionStorage.getItem('wf_just_logged_in') === '1';
    const seenKey = `wf_welcomed_${tier}`;
    const hasSeenBefore = localStorage.getItem(seenKey) === '1';

    let shouldShow = false;
    if (tier === 'free') {
      // Free: show on every fresh login (session-scoped). Cleared on dismiss.
      shouldShow = justLoggedIn;
    } else {
      // Starter/Growth: show ONCE per device (lifetime). Trigger:
      //   - just signed in for the first time on this device, OR
      //   - plan tier changed to a new paid tier (we can’t detect upgrade
      //     cleanly without backend events, so for now we trigger on first
      //     sign-in to that tier).
      if (!hasSeenBefore) shouldShow = true;
    }

    if (shouldShow) {
      setConfig(PLAN_CONFIG[tier]);
      setOpen(true);
      // Consume the "just logged in" flag so it doesn’t fire again on nav
      sessionStorage.removeItem('wf_just_logged_in');
    }
  }, [plan.plan, plan.loading]);

  const handleClose = () => {
    setOpen(false);
    if (!plan.plan) return;
    if (plan.plan !== 'free') {
      // Persist "seen" for paid tiers so it doesn’t come back
      try { localStorage.setItem(`wf_welcomed_${plan.plan}`, '1'); } catch {}
    }
  };

  const handleCta = () => {
    handleClose();
    if (plan.plan === 'free') {
      router.push('/settings?tab=workspace');
    }
  };

  if (!open || !config) return null;

  return (
    <div className="pwm-overlay" onClick={handleClose} role="dialog" aria-modal="true">
      <div className={`pwm-card pwm-tone-${config.tone}`} onClick={(e) => e.stopPropagation()}>
        <button className="pwm-close" onClick={handleClose} aria-label="Close">
          <X size={16} />
        </button>

        {/* Header */}
        <div className="pwm-head">
          <div className="pwm-icon">{config.icon}</div>
          <div className="pwm-tier-pill">
            {plan.planName} plan
          </div>
        </div>

        <h2 className="pwm-title">{config.title}</h2>
        <p className="pwm-sub">{config.subtitle}</p>

        {/* Two-column included/locked */}
        <div className="pwm-columns">
          <div className="pwm-col pwm-col-incl">
            <div className="pwm-col-head">
              <CheckCircle2 size={14} /> Included
            </div>
            <ul>
              {config.included.map((f, i) => (
                <li key={i}>
                  <CheckCircle2 size={13} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {config.locked.length > 0 && (
            <div className="pwm-col pwm-col-locked">
              <div className="pwm-col-head pwm-col-head-locked">
                <Lock size={14} /> Locked on {plan.planName}
              </div>
              <ul>
                {config.locked.map((f, i) => (
                  <li key={i}>
                    <Lock size={11} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {config.upgradeHint && (
          <div className="pwm-hint">
            <Sparkles size={13} />
            <span>{config.upgradeHint}</span>
          </div>
        )}

        {/* Actions */}
        <div className="pwm-actions">
          {config.secondaryLabel && (
            <button className="pwm-btn pwm-btn-ghost" onClick={handleClose}>
              {config.secondaryLabel}
            </button>
          )}
          <button className="pwm-btn pwm-btn-primary" onClick={handleCta}>
            <Sparkles size={14} />
            {config.ctaLabel}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <style>{`
        .pwm-overlay {
          position: fixed; inset: 0; z-index: 9990;
          background: rgba(0,0,0,0.65);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          animation: pwm-fade 0.2s ease-out;
          overflow-y: auto;
        }
        @keyframes pwm-fade { from { opacity: 0; } to { opacity: 1; } }

        .pwm-card {
          position: relative;
          width: 100%; max-width: 720px;
          background: #14161f;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 20px;
          padding: 36px 38px 32px;
          color: #f3f4f6;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          box-shadow: 0 40px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04);
          animation: pwm-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
          margin: auto;
        }
        @keyframes pwm-pop {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .pwm-tone-free::before, .pwm-tone-starter::before, .pwm-tone-growth::before {
          content: '';
          position: absolute; inset: 0;
          border-radius: 20px;
          pointer-events: none;
          opacity: 0.5;
        }
        .pwm-tone-free::before {
          background: radial-gradient(ellipse 400px 200px at 50% -10%, rgba(245,158,11,0.18), transparent 60%);
        }
        .pwm-tone-starter::before {
          background: radial-gradient(ellipse 400px 200px at 50% -10%, rgba(99,102,241,0.22), transparent 60%);
        }
        .pwm-tone-growth::before {
          background: radial-gradient(ellipse 400px 200px at 50% -10%, rgba(168,85,247,0.25), transparent 60%);
        }

        .pwm-close {
          position: absolute; top: 16px; right: 16px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          color: #9ca3af;
          width: 30px; height: 30px;
          border-radius: 8px;
          display: grid; place-items: center;
          cursor: pointer;
          z-index: 1;
        }
        .pwm-close:hover { background: rgba(255,255,255,0.1); color: #f3f4f6; }

        .pwm-head {
          position: relative;
          display: flex; align-items: center; gap: 14px;
          margin-bottom: 18px;
        }
        .pwm-icon {
          width: 52px; height: 52px;
          border-radius: 14px;
          display: grid; place-items: center;
          color: #fff;
        }
        .pwm-tone-free    .pwm-icon { background: linear-gradient(135deg, #f59e0b, #ef4444); box-shadow: 0 10px 26px rgba(245,158,11,0.4); }
        .pwm-tone-starter .pwm-icon { background: linear-gradient(135deg, #6366f1, #06b6d4); box-shadow: 0 10px 26px rgba(99,102,241,0.4); }
        .pwm-tone-growth  .pwm-icon { background: linear-gradient(135deg, #a855f7, #ec4899); box-shadow: 0 10px 26px rgba(168,85,247,0.4); }

        .pwm-tier-pill {
          display: inline-block;
          padding: 4px 12px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          color: #d1d5db;
          font-size: 11.5px; font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          border-radius: 999px;
        }

        .pwm-title {
          position: relative;
          font-size: 28px; font-weight: 800;
          color: #fff;
          letter-spacing: -0.025em;
          margin: 0 0 10px;
          line-height: 1.15;
        }
        .pwm-sub {
          position: relative;
          font-size: 14.5px; line-height: 1.6;
          color: #b5bac9;
          margin: 0 0 28px;
        }

        .pwm-columns {
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          margin-bottom: 22px;
        }
        @media (max-width: 620px) { .pwm-columns { grid-template-columns: 1fr; } }

        .pwm-col {
          padding: 18px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
        }
        .pwm-col-locked {
          background: rgba(245,158,11,0.05);
          border-color: rgba(245,158,11,0.20);
        }
        .pwm-col-head {
          display: flex; align-items: center; gap: 7px;
          font-size: 11.5px; font-weight: 700;
          color: #34d399;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          margin-bottom: 14px;
        }
        .pwm-col-head-locked { color: #fbbf24; }
        .pwm-col ul {
          list-style: none; padding: 0; margin: 0;
          display: flex; flex-direction: column; gap: 8px;
        }
        .pwm-col li {
          display: flex; align-items: flex-start; gap: 8px;
          font-size: 13px;
          line-height: 1.4;
          color: #d1d5db;
        }
        .pwm-col-incl li svg { color: #34d399; margin-top: 2px; flex-shrink: 0; }
        .pwm-col-locked li {
          color: #9ca3af;
          opacity: 0.85;
        }
        .pwm-col-locked li svg { color: #fbbf24; margin-top: 3px; flex-shrink: 0; }

        .pwm-hint {
          position: relative;
          display: flex; align-items: center; gap: 8px;
          padding: 11px 14px;
          background: linear-gradient(135deg, rgba(168,85,247,0.10), rgba(99,102,241,0.08));
          border: 1px solid rgba(168,85,247,0.22);
          color: #d8b4fe;
          border-radius: 10px;
          font-size: 13px;
          margin-bottom: 20px;
        }
        .pwm-hint svg { color: #c084fc; flex-shrink: 0; }

        .pwm-actions {
          position: relative;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        .pwm-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 11px 22px;
          border-radius: 11px;
          font-size: 13.5px; font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          border: none;
          transition: all 0.15s;
        }
        .pwm-btn-ghost {
          background: rgba(255,255,255,0.05);
          color: #d1d5db;
          border: 1px solid rgba(255,255,255,0.10);
        }
        .pwm-btn-ghost:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .pwm-btn-primary {
          background: linear-gradient(135deg, #f59e0b, #a855f7);
          color: #fff;
          box-shadow: 0 8px 22px rgba(168,85,247,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
        }
        .pwm-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 30px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.25);
        }
        .pwm-tone-starter .pwm-btn-primary {
          background: linear-gradient(135deg, #6366f1, #06b6d4);
          box-shadow: 0 8px 22px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
        }
        .pwm-tone-growth .pwm-btn-primary {
          background: linear-gradient(135deg, #a855f7, #ec4899);
          box-shadow: 0 8px 22px rgba(168,85,247,0.45), inset 0 1px 0 rgba(255,255,255,0.2);
        }

        @media (max-width: 520px) {
          .pwm-card { padding: 28px 22px; }
          .pwm-title { font-size: 22px; }
          .pwm-actions { flex-direction: column-reverse; }
          .pwm-btn { width: 100%; justify-content: center; }
        }
      `}</style>
    </div>
  );
}
