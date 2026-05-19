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

  const hasFeature = (key) => {
    if (!planInfo) return false;
    const v = planInfo.features?.[key];
    return v === true || v === 'limited' || v === 'basic';
  };

  const hasLimit = (key) => {
    if (!planInfo) return true; // optimistic — don't block before plan loads
    const limit = planInfo.limits?.[key];
    if (limit === -1 || limit == null) return true;
    const usage = planInfo.usage?.[key] || 0;
    return usage < limit;
  };

  const value = {
    plan: planInfo?.plan || null,
    planName: planInfo?.name || null,
    loading,
    features: planInfo?.features || {},
    limits: planInfo?.limits || {},
    usage: planInfo?.usage || {},
    allPlans: planInfo?.all_plans || [],
    hasFeature,
    hasLimit,
    refresh: fetchPlan,
    isFree: planInfo?.plan === 'free',
    isStarter: planInfo?.plan === 'starter',
    isGrowth: planInfo?.plan === 'growth',
    isEnterprise: planInfo?.plan === 'enterprise',
    isPaid: planInfo?.plan && planInfo.plan !== 'free',
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
