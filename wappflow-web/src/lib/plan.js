'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from './api';

/**
 * Plan context — single source of truth for what's unlocked + current usage.
 *
 *   const { plan, planName, features, limits, usage, quota, founding,
 *           hasFeature, hasLimit, usageLevel, quotaFor, atLimit } = usePlan();
 *
 *   if (!hasFeature('google_calendar')) return <LockedCard .../>;
 *   if (atLimit('leads')) disable the "New Lead" button;
 *   quotaFor('leads') -> { used, limit, remaining, pct, level, reset_date }
 *
 * Soft-limit levels (from the backend): unlimited | ok | warn (>=80%) |
 * critical (>=90%) | reached (100%).
 */

const PlanContext = createContext(null);

export const PLAN_PRIORITY = { creator: 0, studio: 1, studio_plus: 2, enterprise: 3 };

// ── Shared plan vocabulary — the ONLY client-side tier→display mapping. ──────
// Mirrors backend/entitlements.js (creator/studio/studio_plus/enterprise). Null-safe:
// an unknown/legacy tier string degrades to the entry-plan label, never blank.
export const PLAN_META = {
  creator: { label: 'Creator', crown: false },
  studio: { label: 'Studio', crown: false },
  studio_plus: { label: 'Studio+', crown: true },
  enterprise: { label: 'Enterprise', crown: true },
};
export const planLabel = (plan) => PLAN_META[plan]?.label || 'Creator';

// The next tier up (upgrade target). enterprise → null (nothing above).
// Unknown/loading plan → 'studio' (the most common upgrade destination).
export function nextPlanFor(plan) {
  if (plan === 'creator') return 'studio';
  if (plan === 'studio') return 'studio_plus';
  if (plan === 'studio_plus') return 'enterprise';
  if (plan === 'enterprise') return null;
  return 'studio';
}
export const nextPlanLabel = (plan) => planLabel(nextPlanFor(plan) || plan);

// Every upgrade CTA routes here — one definition, no drift. ('plan' is the real
// settings tab id; 'billing' is accepted there as a legacy alias.)
export const UPGRADE_ROUTE = '/settings?tab=plan';

// One currency formatter for all plan pricing. Currency should always come from
// the price row (all_plans[].currency) — the default is only a last resort for a
// row that somehow arrived without one, and it tracks the catalog currency in
// backend/entitlements.js so the two can never quote different money.
export const formatMoney = (amount, currency = 'USD') =>
  amount == null ? 'Custom' : `${currency} ${Number(amount).toLocaleString('en-US')}`;

export function PlanProvider({ children }) {
  const [planInfo, setPlanInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPlan = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) { setLoading(false); return; }
      const res = await api.get('/workspace/plan-info');
      setPlanInfo(res.data);
    } catch (e) {
      // 401 unauthed / network — leave plan null (treated optimistically until known)
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
    const iv = setInterval(fetchPlan, 5 * 60 * 1000); // refresh in case plan/usage changes out of band
    return () => clearInterval(iv);
  }, [fetchPlan]);

  // Feature gate. Optimistic-unlocked until the plan loads, so gated pages don't
  // flash a lock on first paint; resolves to the real value once loaded.
  const hasFeature = (key) => {
    if (!planInfo) return true;
    const v = planInfo.features?.[key];
    return v === true || v === 'limited' || v === 'basic';
  };

  // Numeric limit gate (true = still under the limit / unlimited).
  const hasLimit = (key) => {
    if (!planInfo) return true;
    const q = planInfo.quota?.[key];
    if (q) return q.level !== 'reached' && q.limit !== 0;
    const limit = planInfo.limits?.[key];
    if (limit === -1 || limit == null) return true;
    const used = planInfo.usage?.[key] || 0;
    return used < limit;
  };

  // Soft-limit helpers driven by the backend `quota` block.
  const quotaFor = (metric) => planInfo?.quota?.[metric] || null;
  const usageLevel = (metric) => planInfo?.quota?.[metric]?.level || (planInfo ? 'ok' : 'unlimited');
  const atLimit = (metric) => usageLevel(metric) === 'reached';

  const plan = planInfo?.plan || null;
  const value = {
    plan,
    planName: planInfo?.name || null,
    loading,
    features: planInfo?.features || {},
    limits: planInfo?.limits || {},
    usage: planInfo?.usage || {},
    quota: planInfo?.quota || {},
    allPlans: planInfo?.all_plans || [],
    founding: planInfo?.founding || null,
    hasFeature,
    hasLimit,
    quotaFor,
    usageLevel,
    atLimit,
    refresh: fetchPlan,
    isCreator: plan === 'creator',
    isStudio: plan === 'studio',
    isStudioPlus: plan === 'studio_plus',
    isEnterprise: plan === 'enterprise',
    isPaid: !!plan,
    // Back-compat with older checks (no Free/Starter tiers anymore):
    isFree: false,
    isStarter: false,
    isGrowth: plan === 'studio',
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider (e.g. landing page).
    return {
      plan: null, planName: null, loading: false,
      features: {}, limits: {}, usage: {}, quota: {}, allPlans: [], founding: null,
      hasFeature: () => true, hasLimit: () => true,
      quotaFor: () => null, usageLevel: () => 'unlimited', atLimit: () => false,
      refresh: () => {},
      isCreator: false, isStudio: false, isStudioPlus: false, isEnterprise: false, isPaid: false,
      isFree: false, isStarter: false, isGrowth: false,
    };
  }
  return ctx;
}
