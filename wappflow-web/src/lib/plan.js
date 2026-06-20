'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from './api';

/**
 * Plan context — single source of truth for which features are unlocked.
 *
 * Use anywhere:
 *   const { plan, features, limits, usage, hasFeature, hasLimit } = usePlan();
 *
 *   if (!hasFeature('google_calendar')) return <LockedCard featureName="Google Calendar" />;
 *   if (!hasLimit('leads')) return <LeadLimitReached />;
 */

const PlanContext = createContext(null);

export const PLAN_PRIORITY = { free: 0, starter: 1, growth: 2, enterprise: 3 };

// Pricing/plans retired — every feature is on and every limit is unlimited.
// Proxies so ANY key (even un-seeded ones) reads unlocked.
const ALL_OPEN_FEATURES = new Proxy({}, { get: () => true, has: () => true });
const ALL_OPEN_LIMITS = new Proxy({}, { get: () => -1, has: () => true });

export function PlanProvider({ children }) {
  const [planInfo, setPlanInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPlan = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        setLoading(false);
        return;
      }
      const res = await api.get('/workspace/plan-info');
      setPlanInfo(res.data);
    } catch (e) {
      // 401 means unauthed — leave plan null. Don't bomb out.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
    // Refresh plan every 5 min (in case it's upgraded out of band)
    const iv = setInterval(fetchPlan, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [fetchPlan]);

  // Pricing/plans retired 2026-06-21 — every feature is open to every user and
  // there are no limits. These always-true gates dissolve all in-app locks.
  const hasFeature = () => true;
  const hasLimit = () => true;

  // Pricing/plans retired 2026-06-21 — report a fully-unlocked, unlimited
  // workspace. features[...] reads true for any key, limits[...] reads -1
  // (unlimited) for any key, so even the call sites that read limits/usage
  // DIRECTLY (lead cap, platform-account caps, usage chips) see "open" too.
  const value = {
    // Report the top tier so any residual `plan.plan !== 'enterprise'` tier
    // comparison treats the user as fully unlocked (no upgrade CTA can fire).
    // No plan name is shown anywhere in the UI anymore.
    plan: 'enterprise',
    planName: 'Enterprise',
    loading,
    features: ALL_OPEN_FEATURES,
    limits: ALL_OPEN_LIMITS,
    usage: {},
    allPlans: planInfo?.all_plans || [],
    hasFeature,
    hasLimit,
    refresh: fetchPlan,
    isFree: false,
    isStarter: false,
    isGrowth: false,
    isEnterprise: true,
    isPaid: true,
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    // Fallback for components rendered outside provider (e.g. landing page)
    return {
      plan: null, planName: null, loading: false,
      features: {}, limits: {}, usage: {}, allPlans: [],
      hasFeature: () => true, hasLimit: () => true,
      refresh: () => {},
      isFree: false, isStarter: false, isGrowth: false, isEnterprise: false, isPaid: false,
    };
  }
  return ctx;
}
