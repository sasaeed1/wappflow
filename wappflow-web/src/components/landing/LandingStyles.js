'use client';

/* ==========================================================================
   LANDING — visual system.

   Split out of page.js so the markup stays readable. Everything here is
   scoped behind .lp-* and only ever mounted by the landing page, so it can
   ignore the app's design tokens without fighting them.

   The palette, the grid-and-glow background, the glass surfaces and the
   indigo→violet gradient are carried over deliberately: that look is the
   part of the old page that was worth keeping.
   ========================================================================== */

export default function LandingStyles() {
  return (
    <style>{`
      :root {
        --lp-bg: #07080d;
        --lp-bg-2: #0b0d16;
        --lp-surface: rgba(20, 22, 33, 0.65);
        --lp-surface-2: rgba(28, 31, 45, 0.55);
        --lp-surface-solid: #14161f;
        --lp-border: rgba(255,255,255,0.08);
        --lp-border-strong: rgba(255,255,255,0.14);
        --lp-text: #e7eaf3;
        --lp-text-dim: #a3a8b9;
        --lp-text-muted: #6b7188;
        --lp-accent: #818cf8;
        --lp-accent-2: #a78bfa;
        --lp-accent-3: #f472b6;
        --lp-emerald: #34d399;
        --lp-amber: #fbbf24;
        --lp-sky: #38bdf8;
        --lp-grad: linear-gradient(135deg, #6366f1, #a855f7);
        --lp-ease: cubic-bezier(0.22, 1, 0.36, 1);
      }

      html { scroll-behavior: smooth; scroll-padding-top: 84px; }
      html, body { background: var(--lp-bg); color: var(--lp-text); }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
      a { color: inherit; text-decoration: none; }
      button { font-family: inherit; }
      ::selection { background: rgba(129,140,248,0.35); color: #fff; }

      .lp-root { position: relative; min-height: 100vh; overflow-x: hidden; }
      .lp-container { width: 100%; max-width: 1180px; margin: 0 auto; padding: 0 24px; }
      main { position: relative; z-index: 1; }

      /* Keyboard users must be able to see where they are. */
      .lp-root :focus-visible {
        outline: 2px solid var(--lp-accent);
        outline-offset: 3px;
        border-radius: 6px;
      }
      .lp-skip {
        position: absolute; left: -9999px; top: 8px; z-index: 200;
        background: var(--lp-surface-solid); color: var(--lp-text);
        border: 1px solid var(--lp-border-strong); border-radius: 8px;
        padding: 10px 16px; font-weight: 600; font-size: 14px;
      }
      .lp-skip:focus { left: 16px; }

      /* ══════════════ BACKGROUND ══════════════ */
      .lp-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
      .lp-bg-grid {
        position: absolute; inset: 0;
        background-image:
          linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
        background-size: 56px 56px;
        mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 70%);
        -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 70%);
      }
      .lp-bg-glow { position: absolute; border-radius: 50%; filter: blur(120px); }
      .lp-bg-glow-1 { width: 720px; height: 720px; background: #6366f1; top: -220px; left: -120px; opacity: 0.5; }
      .lp-bg-glow-2 { width: 600px; height: 600px; background: #a855f7; top: 180px; right: -160px; opacity: 0.33; }
      .lp-bg-glow-3 { width: 820px; height: 820px; background: #06b6d4; top: 1900px; left: -220px; opacity: 0.22; }
      .lp-bg-glow-4 { width: 700px; height: 700px; background: #ec4899; top: 3600px; right: -200px; opacity: 0.18; }

      /* ══════════════ NAV ══════════════ */
      .lp-nav {
        position: fixed; top: 0; left: 0; right: 0; z-index: 50;
        padding: 14px 0; transition: all 0.3s var(--lp-ease);
      }
      .lp-nav.scrolled {
        background: rgba(7, 8, 13, 0.72);
        backdrop-filter: blur(18px) saturate(160%);
        -webkit-backdrop-filter: blur(18px) saturate(160%);
        border-bottom: 1px solid var(--lp-border);
        padding: 10px 0;
      }
      .lp-nav-inner { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
      .lp-brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 800; font-size: 18px; letter-spacing: -0.02em; }
      .lp-brand-mark {
        width: 32px; height: 32px; border-radius: 9px; background: var(--lp-grad);
        display: grid; place-items: center; color: #fff; flex-shrink: 0;
        box-shadow: 0 6px 16px rgba(99,102,241,0.45);
      }
      .lp-nav-links { display: flex; gap: 30px; }
      .lp-nav-links a { color: var(--lp-text-dim); font-size: 14px; font-weight: 500; transition: color 0.15s; }
      .lp-nav-links a:hover { color: var(--lp-text); }
      .lp-nav-cta { display: flex; gap: 10px; align-items: center; }
      .lp-mobile-toggle { display: none; background: none; border: none; color: var(--lp-text); cursor: pointer; padding: 6px; }
      .lp-mobile-menu {
        display: none; flex-direction: column; gap: 2px; padding: 16px 24px 22px;
        background: rgba(7,8,13,0.97);
        backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
        border-top: 1px solid var(--lp-border);
      }
      .lp-mobile-menu a { padding: 12px 0; color: var(--lp-text-dim); font-weight: 500; }
      .lp-mobile-cta { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }

      /* ══════════════ BUTTONS ══════════════ */
      .lp-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: 14px;
        cursor: pointer; border: 1px solid transparent; transition: all 0.2s var(--lp-ease);
        white-space: nowrap; text-align: center;
      }
      .lp-btn-primary {
        background: var(--lp-grad); color: #fff;
        box-shadow: 0 8px 24px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.2);
      }
      .lp-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 14px 34px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.25); }
      .lp-btn-ghost { background: rgba(255,255,255,0.04); color: var(--lp-text); border-color: var(--lp-border-strong); }
      .lp-btn-ghost:hover { background: rgba(255,255,255,0.09); transform: translateY(-2px); }
      .lp-btn-lg { padding: 14px 26px; font-size: 15px; border-radius: 12px; }
      .lp-btn-block { width: 100%; }

      /* ══════════════ SECTION FURNITURE ══════════════ */
      .lp-section { position: relative; padding: 108px 0; }
      .lp-section-head { max-width: 720px; margin: 0 auto 56px; text-align: center; }
      .lp-section-eyebrow {
        display: inline-flex; align-items: center; gap: 7px;
        font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
        color: var(--lp-accent); margin-bottom: 16px;
      }
      .lp-section-title {
        font-size: clamp(30px, 4.4vw, 46px); font-weight: 800; letter-spacing: -0.035em;
        line-height: 1.1; margin: 0 0 18px;
      }
      .lp-section-sub { font-size: 17px; line-height: 1.65; color: var(--lp-text-dim); margin: 0; }
      .lp-gradient {
        background: linear-gradient(120deg, #818cf8, #c084fc 45%, #f472b6);
        -webkit-background-clip: text; background-clip: text; color: transparent;
      }

      .lp-reveal { opacity: 0; transform: translateY(26px); transition: opacity 0.75s var(--lp-ease), transform 0.75s var(--lp-ease); }
      .lp-reveal.shown { opacity: 1; transform: none; }

      .lp-card {
        background: var(--lp-surface); border: 1px solid var(--lp-border);
        border-radius: 16px; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      }

      /* ══════════════ HERO ══════════════ */
      .lp-hero { position: relative; padding: 156px 0 88px; }
      .lp-hero-head { max-width: 880px; margin: 0 auto; text-align: center; }
      .lp-badge {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 6px 14px 6px 7px; border-radius: 999px;
        background: rgba(129,140,248,0.10); border: 1px solid rgba(129,140,248,0.28);
        font-size: 13px; color: #c7cbff; margin-bottom: 26px;
      }
      .lp-badge-pill {
        background: var(--lp-grad); color: #fff; font-size: 10px; font-weight: 800;
        letter-spacing: 0.08em; padding: 3px 8px; border-radius: 999px;
      }
      .lp-h1 {
        font-size: clamp(38px, 6.4vw, 70px); font-weight: 800; letter-spacing: -0.045em;
        line-height: 1.04; margin: 0 0 22px;
      }
      .lp-lead {
        font-size: clamp(16px, 2vw, 19px); line-height: 1.62; color: var(--lp-text-dim);
        max-width: 660px; margin: 0 auto 32px;
      }
      .lp-hero-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
      .lp-hero-note {
        margin-top: 18px; font-size: 13px; color: var(--lp-text-muted);
        display: flex; gap: 18px; justify-content: center; flex-wrap: wrap;
      }
      .lp-hero-note span { display: inline-flex; align-items: center; gap: 6px; }

      /* ══════════════ HERO — THE CHAIN DEMO ══════════════ */
      .lp-chain { margin-top: 64px; }
      .lp-chain-rail {
        display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;
        margin-bottom: 22px;
      }
      .lp-chain-tab {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 8px 14px; border-radius: 999px; cursor: pointer;
        background: rgba(255,255,255,0.03); border: 1px solid var(--lp-border);
        color: var(--lp-text-muted); font-size: 13px; font-weight: 600;
        transition: all 0.25s var(--lp-ease); position: relative; overflow: hidden;
      }
      .lp-chain-tab:hover { color: var(--lp-text-dim); border-color: var(--lp-border-strong); }
      .lp-chain-tab.active {
        color: #fff; border-color: rgba(129,140,248,0.5);
        background: rgba(129,140,248,0.14);
      }
      .lp-chain-tab-fill {
        position: absolute; left: 0; top: 0; bottom: 0; width: 0;
        background: rgba(129,140,248,0.18); z-index: 0;
      }
      .lp-chain-tab.active .lp-chain-tab-fill { animation: lpFill 5s linear forwards; }
      .lp-chain-tab > * { position: relative; z-index: 1; }
      @keyframes lpFill { from { width: 0; } to { width: 100%; } }

      .lp-chain-stage {
        display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
        gap: 20px; align-items: stretch;
      }

      .lp-phone {
        background: linear-gradient(180deg, rgba(20,22,33,0.9), rgba(13,15,23,0.9));
        border: 1px solid var(--lp-border-strong); border-radius: 20px; overflow: hidden;
        box-shadow: 0 30px 70px rgba(0,0,0,0.55); display: flex; flex-direction: column;
        min-height: 420px;
      }
      .lp-phone-top {
        display: flex; align-items: center; gap: 10px; padding: 13px 16px;
        border-bottom: 1px solid var(--lp-border); background: rgba(255,255,255,0.02);
      }
      .lp-avatar {
        width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
        background: linear-gradient(135deg, #f472b6, #a855f7);
        display: grid; place-items: center; font-size: 13px; font-weight: 700; color: #fff;
      }
      .lp-phone-name { font-size: 14px; font-weight: 700; }
      .lp-phone-meta { font-size: 11px; color: var(--lp-emerald); display: flex; align-items: center; gap: 5px; }
      .lp-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--lp-emerald); }
      .lp-chan {
        margin-left: auto; font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
        padding: 4px 9px; border-radius: 6px; background: rgba(52,211,153,0.14);
        color: var(--lp-emerald); border: 1px solid rgba(52,211,153,0.25);
      }
      .lp-thread { flex: 1; padding: 18px 16px; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
      .lp-bubble {
        max-width: 84%; padding: 10px 13px; border-radius: 14px; font-size: 13.5px; line-height: 1.5;
        animation: lpPop 0.45s var(--lp-ease) both;
      }
      .lp-bubble-in { align-self: flex-start; background: rgba(255,255,255,0.06); border: 1px solid var(--lp-border); border-bottom-left-radius: 5px; }
      .lp-bubble-out { align-self: flex-end; background: var(--lp-grad); color: #fff; border-bottom-right-radius: 5px; box-shadow: 0 6px 18px rgba(99,102,241,0.3); }
      .lp-bubble-time { display: block; font-size: 10px; opacity: 0.6; margin-top: 5px; }
      @keyframes lpPop { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: none; } }

      .lp-ai-chip {
        align-self: flex-start; display: inline-flex; align-items: center; gap: 7px;
        font-size: 11.5px; padding: 6px 11px; border-radius: 999px;
        background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.3);
        color: #d8ccff; animation: lpPop 0.45s var(--lp-ease) both;
      }
      .lp-composer {
        display: flex; align-items: center; gap: 9px; padding: 11px 14px;
        border-top: 1px solid var(--lp-border); background: rgba(255,255,255,0.02);
      }
      .lp-composer-fake {
        flex: 1; height: 34px; border-radius: 999px; background: rgba(255,255,255,0.05);
        border: 1px solid var(--lp-border); display: flex; align-items: center;
        padding: 0 14px; font-size: 12.5px; color: var(--lp-text-muted);
      }
      .lp-composer-btn {
        width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
        background: var(--lp-grad); color: #fff; flex-shrink: 0;
      }

      .lp-out { display: flex; flex-direction: column; gap: 12px; }
      .lp-out-head {
        display: flex; align-items: center; gap: 9px; font-size: 12px;
        font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--lp-text-muted);
      }
      .lp-out-line { flex: 1; height: 1px; background: var(--lp-border); }
      .lp-artifact {
        display: flex; gap: 13px; padding: 14px 16px; border-radius: 14px;
        background: var(--lp-surface); border: 1px solid var(--lp-border);
        animation: lpSlide 0.5s var(--lp-ease) both;
      }
      @keyframes lpSlide { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
      .lp-artifact-icon {
        width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center;
        flex-shrink: 0; background: rgba(129,140,248,0.14); color: var(--lp-accent);
      }
      .lp-artifact-title { font-size: 14px; font-weight: 700; margin-bottom: 3px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .lp-artifact-body { font-size: 12.5px; color: var(--lp-text-dim); line-height: 1.55; }
      .lp-tagpill {
        font-size: 10px; font-weight: 700; letter-spacing: 0.05em; padding: 2px 7px;
        border-radius: 5px; background: rgba(52,211,153,0.14); color: var(--lp-emerald);
        border: 1px solid rgba(52,211,153,0.25);
      }
      .lp-tagpill-auto { background: rgba(167,139,250,0.14); color: #c4b5fd; border-color: rgba(167,139,250,0.28); }
      .lp-stage-note {
        font-size: 12.5px; color: var(--lp-text-muted); line-height: 1.6;
        padding: 12px 15px; border-radius: 11px; border: 1px dashed var(--lp-border-strong);
        background: rgba(255,255,255,0.015);
      }

      /* ══════════════ LOGO / CAPABILITY STRIP ══════════════ */
      .lp-strip { padding: 26px 0 8px; border-top: 1px solid var(--lp-border); border-bottom: 1px solid var(--lp-border); }
      .lp-strip-label { text-align: center; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--lp-text-muted); margin-bottom: 18px; }
      .lp-strip-row { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; padding-bottom: 22px; }
      .lp-strip-chip {
        display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px;
        border-radius: 999px; background: rgba(255,255,255,0.03);
        border: 1px solid var(--lp-border); font-size: 13px; color: var(--lp-text-dim);
        transition: all 0.2s var(--lp-ease);
      }
      .lp-strip-chip:hover { border-color: rgba(129,140,248,0.4); color: var(--lp-text); transform: translateY(-2px); }

      /* ══════════════ PROBLEM ══════════════ */
      .lp-switch {
        display: inline-flex; padding: 4px; border-radius: 12px; gap: 4px;
        background: rgba(255,255,255,0.04); border: 1px solid var(--lp-border); margin: 0 auto 40px;
      }
      .lp-switch-btn {
        padding: 9px 20px; border-radius: 9px; border: none; cursor: pointer;
        background: transparent; color: var(--lp-text-muted); font-size: 14px; font-weight: 600;
        transition: all 0.25s var(--lp-ease);
      }
      .lp-switch-btn.active { background: var(--lp-grad); color: #fff; box-shadow: 0 6px 18px rgba(99,102,241,0.3); }
      .lp-switch-wrap { display: flex; justify-content: center; }

      .lp-scatter { display: grid; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); gap: 12px; }
      .lp-scatter-item {
        padding: 18px 16px; border-radius: 14px; text-align: center;
        background: var(--lp-surface); border: 1px solid var(--lp-border);
        animation: lpPop 0.45s var(--lp-ease) both;
      }
      .lp-scatter-name { font-size: 14px; font-weight: 700; margin: 10px 0 4px; }
      .lp-scatter-cost { font-size: 12px; color: #fca5a5; }
      .lp-scatter-icon { width: 38px; height: 38px; margin: 0 auto; border-radius: 10px; display: grid; place-items: center; background: rgba(248,113,113,0.10); color: #fca5a5; }
      .lp-unified {
        padding: 34px; border-radius: 20px; text-align: center;
        background: linear-gradient(135deg, rgba(99,102,241,0.14), rgba(168,85,247,0.10));
        border: 1px solid rgba(129,140,248,0.32); animation: lpPop 0.5s var(--lp-ease) both;
      }
      .lp-unified-mark {
        width: 60px; height: 60px; margin: 0 auto 16px; border-radius: 16px;
        background: var(--lp-grad); display: grid; place-items: center; color: #fff;
        box-shadow: 0 14px 34px rgba(99,102,241,0.45);
      }
      .lp-unified-list { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 20px; }
      .lp-unified-list span {
        font-size: 12.5px; padding: 6px 12px; border-radius: 999px;
        background: rgba(255,255,255,0.06); border: 1px solid var(--lp-border-strong);
      }
      .lp-cost-row {
        display: flex; gap: 26px; justify-content: center; margin-top: 26px;
        flex-wrap: wrap; font-size: 13.5px; color: var(--lp-text-dim);
      }
      .lp-cost-row b { color: var(--lp-text); }

      /* ══════════════ SPINE ══════════════ */
      .lp-spine { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 26px; align-items: start; }
      .lp-spine-nav { display: flex; flex-direction: column; gap: 6px; position: relative; }
      .lp-spine-btn {
        display: flex; align-items: flex-start; gap: 13px; padding: 14px 15px;
        border-radius: 13px; cursor: pointer; text-align: left; width: 100%;
        background: transparent; border: 1px solid transparent; color: var(--lp-text-dim);
        transition: all 0.25s var(--lp-ease);
      }
      .lp-spine-btn:hover { background: rgba(255,255,255,0.03); color: var(--lp-text); }
      .lp-spine-btn.active {
        background: var(--lp-surface); border-color: rgba(129,140,248,0.4); color: var(--lp-text);
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      }
      .lp-spine-num {
        width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0; display: grid; place-items: center;
        font-size: 12px; font-weight: 800; background: rgba(255,255,255,0.06); color: var(--lp-text-muted);
        transition: all 0.25s var(--lp-ease);
      }
      .lp-spine-btn.active .lp-spine-num { background: var(--lp-grad); color: #fff; }
      .lp-spine-btn-title { font-size: 14px; font-weight: 700; margin-bottom: 3px; }
      .lp-spine-btn-sub { font-size: 12px; color: var(--lp-text-muted); line-height: 1.5; }
      .lp-spine-panel { padding: 30px; border-radius: 18px; background: var(--lp-surface); border: 1px solid var(--lp-border); min-height: 380px; }
      .lp-spine-h { font-size: 22px; font-weight: 800; letter-spacing: -0.025em; margin: 0 0 10px; }
      .lp-spine-p { font-size: 15px; line-height: 1.68; color: var(--lp-text-dim); margin: 0 0 24px; }
      .lp-spine-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 11px; }
      .lp-spine-item {
        display: flex; gap: 11px; padding: 13px 14px; border-radius: 12px;
        background: rgba(255,255,255,0.03); border: 1px solid var(--lp-border);
        animation: lpPop 0.4s var(--lp-ease) both;
      }
      .lp-spine-item-t { font-size: 13px; font-weight: 700; margin-bottom: 3px; }
      .lp-spine-item-b { font-size: 12px; color: var(--lp-text-muted); line-height: 1.5; }
      .lp-check { color: var(--lp-emerald); flex-shrink: 0; margin-top: 1px; }

      /* ══════════════ MODULE GRID ══════════════ */
      .lp-mods { display: grid; grid-template-columns: repeat(auto-fit, minmax(272px, 1fr)); gap: 16px; }
      .lp-mod {
        position: relative; padding: 26px 24px; border-radius: 18px; overflow: hidden;
        background: var(--lp-surface); border: 1px solid var(--lp-border);
        transition: transform 0.3s var(--lp-ease), border-color 0.3s var(--lp-ease), box-shadow 0.3s var(--lp-ease);
      }
      .lp-mod::before {
        content: ''; position: absolute; inset: 0; opacity: 0;
        background: radial-gradient(420px circle at var(--mx, 50%) var(--my, 0%), rgba(129,140,248,0.13), transparent 42%);
        transition: opacity 0.3s; pointer-events: none;
      }
      .lp-mod:hover { transform: translateY(-5px); border-color: var(--lp-border-strong); box-shadow: 0 22px 50px rgba(0,0,0,0.4); }
      .lp-mod:hover::before { opacity: 1; }
      .lp-mod-icon {
        width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center;
        margin-bottom: 16px; background: rgba(129,140,248,0.13); color: var(--lp-accent);
      }
      .lp-mod-title { font-size: 17px; font-weight: 700; letter-spacing: -0.015em; margin: 0 0 8px; display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
      .lp-mod-body { font-size: 13.5px; line-height: 1.62; color: var(--lp-text-dim); margin: 0 0 14px; }
      .lp-mod-list { display: flex; flex-direction: column; gap: 6px; }
      .lp-mod-list span { font-size: 12.5px; color: var(--lp-text-muted); display: flex; gap: 8px; align-items: flex-start; line-height: 1.5; }
      .lp-mini-pill {
        font-size: 9.5px; font-weight: 800; letter-spacing: 0.07em; padding: 3px 7px; border-radius: 5px;
        background: rgba(255,255,255,0.07); color: var(--lp-text-muted); border: 1px solid var(--lp-border);
      }
      .lp-mini-pill-new { background: rgba(52,211,153,0.14); color: var(--lp-emerald); border-color: rgba(52,211,153,0.28); }
      .lp-mini-pill-beta { background: rgba(251,191,36,0.13); color: var(--lp-amber); border-color: rgba(251,191,36,0.26); }

      /* ══════════════ AI ══════════════ */
      .lp-ai-wrap { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 26px; align-items: start; }
      .lp-ai-tabs { display: flex; flex-direction: column; gap: 6px; }
      .lp-ai-tab {
        display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 13px;
        cursor: pointer; text-align: left; width: 100%; background: transparent;
        border: 1px solid transparent; color: var(--lp-text-dim); transition: all 0.25s var(--lp-ease);
      }
      .lp-ai-tab:hover { background: rgba(255,255,255,0.03); color: var(--lp-text); }
      .lp-ai-tab.active { background: var(--lp-surface); border-color: rgba(167,139,250,0.4); color: var(--lp-text); }
      .lp-ai-tab-icon { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; background: rgba(167,139,250,0.13); color: var(--lp-accent-2); flex-shrink: 0; }
      .lp-ai-tab-t { font-size: 14px; font-weight: 700; }
      .lp-ai-panel {
        padding: 28px; border-radius: 18px; min-height: 360px;
        background: linear-gradient(150deg, rgba(167,139,250,0.09), rgba(20,22,33,0.65) 55%);
        border: 1px solid var(--lp-border-strong);
      }
      .lp-ai-panel-h { font-size: 21px; font-weight: 800; letter-spacing: -0.025em; margin: 0 0 10px; }
      .lp-ai-panel-p { font-size: 14.5px; line-height: 1.68; color: var(--lp-text-dim); margin: 0 0 22px; }
      .lp-ai-demo { padding: 18px; border-radius: 14px; background: rgba(7,8,13,0.5); border: 1px solid var(--lp-border); }
      .lp-ai-row { display: flex; gap: 11px; align-items: flex-start; padding: 11px 0; border-bottom: 1px solid var(--lp-border); }
      .lp-ai-row:last-child { border-bottom: none; }
      .lp-ai-row-t { font-size: 13.5px; font-weight: 600; margin-bottom: 3px; }
      .lp-ai-row-b { font-size: 12.5px; color: var(--lp-text-muted); line-height: 1.55; }
      .lp-score {
        margin-left: auto; font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 7px;
        background: rgba(52,211,153,0.14); color: var(--lp-emerald); flex-shrink: 0;
      }
      .lp-score-mid { background: rgba(251,191,36,0.13); color: var(--lp-amber); }
      .lp-byok {
        margin-top: 18px; padding: 14px 16px; border-radius: 12px; font-size: 12.5px;
        line-height: 1.6; color: var(--lp-text-dim);
        background: rgba(255,255,255,0.025); border: 1px solid var(--lp-border);
      }

      /* ══════════════ CONTRACT CONFIGURATOR ══════════════ */
      .lp-cfg { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 22px; align-items: start; }
      .lp-doc {
        border-radius: 18px; overflow: hidden; border: 1px solid var(--lp-border-strong);
        background: linear-gradient(180deg, rgba(24,26,38,0.9), rgba(14,16,24,0.9));
        box-shadow: 0 30px 70px rgba(0,0,0,0.5);
      }
      .lp-doc-bar {
        display: flex; align-items: center; gap: 9px; padding: 13px 18px;
        border-bottom: 1px solid var(--lp-border); background: rgba(255,255,255,0.02);
      }
      .lp-doc-title { font-size: 13.5px; font-weight: 700; }
      .lp-doc-body { padding: 26px 28px 30px; }
      .lp-doc-h { font-size: 19px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 5px; }
      .lp-doc-meta { font-size: 12px; color: var(--lp-text-muted); margin-bottom: 22px; }
      .lp-opt {
        display: flex; align-items: center; gap: 13px; width: 100%; text-align: left;
        padding: 14px 16px; border-radius: 12px; cursor: pointer; margin-bottom: 9px;
        background: rgba(255,255,255,0.025); border: 1px solid var(--lp-border);
        color: var(--lp-text); transition: all 0.22s var(--lp-ease);
      }
      .lp-opt:hover { border-color: var(--lp-border-strong); background: rgba(255,255,255,0.05); }
      .lp-opt.on { border-color: rgba(129,140,248,0.55); background: rgba(129,140,248,0.10); }
      .lp-radio {
        width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
        border: 2px solid var(--lp-text-muted); display: grid; place-items: center;
        transition: all 0.22s var(--lp-ease);
      }
      .lp-opt.on .lp-radio { border-color: var(--lp-accent); background: var(--lp-accent); }
      .lp-radio-box { border-radius: 6px; }
      .lp-opt-t { font-size: 14px; font-weight: 700; }
      .lp-opt-b { font-size: 12px; color: var(--lp-text-muted); margin-top: 2px; }
      .lp-opt-price { margin-left: auto; font-size: 14px; font-weight: 800; flex-shrink: 0; }
      .lp-sign-zone {
        margin-top: 22px; padding: 22px; border-radius: 14px; text-align: center;
        border: 2px dashed var(--lp-border-strong); transition: all 0.3s var(--lp-ease);
      }
      .lp-sign-zone.done { border-style: solid; border-color: rgba(52,211,153,0.5); background: rgba(52,211,153,0.07); }
      .lp-sign-script { font-family: 'Segoe Script', 'Brush Script MT', cursive; font-size: 30px; color: var(--lp-emerald); }
      .lp-side { display: flex; flex-direction: column; gap: 12px; }
      .lp-total {
        padding: 20px; border-radius: 16px;
        background: linear-gradient(135deg, rgba(99,102,241,0.16), rgba(168,85,247,0.10));
        border: 1px solid rgba(129,140,248,0.32);
      }
      .lp-total-label { font-size: 11.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--lp-text-muted); }
      .lp-total-value { font-size: 34px; font-weight: 800; letter-spacing: -0.03em; margin: 6px 0 2px; }
      .lp-total-note { font-size: 12px; color: var(--lp-text-dim); }
      .lp-fire {
        padding: 16px 18px; border-radius: 14px;
        background: var(--lp-surface); border: 1px solid var(--lp-border);
      }
      .lp-fire-h { font-size: 12px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--lp-text-muted); margin-bottom: 12px; }
      .lp-fire-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 13px; color: var(--lp-text-muted); transition: color 0.4s; }
      .lp-fire-row.hot { color: var(--lp-text); }
      .lp-fire-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.14); flex-shrink: 0; transition: all 0.4s; }
      .lp-fire-row.hot .lp-fire-dot { background: var(--lp-emerald); box-shadow: 0 0 0 4px rgba(52,211,153,0.16); }

      /* ══════════════ SPLIT FEATURE ══════════════ */
      .lp-split { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 44px; align-items: center; }
      .lp-split-h { font-size: clamp(26px, 3.4vw, 36px); font-weight: 800; letter-spacing: -0.032em; line-height: 1.14; margin: 0 0 16px; }
      .lp-split-p { font-size: 16px; line-height: 1.68; color: var(--lp-text-dim); margin: 0 0 24px; }
      .lp-feat-list { display: flex; flex-direction: column; gap: 14px; }
      .lp-feat { display: flex; gap: 13px; align-items: flex-start; }
      .lp-feat-icon { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; background: rgba(129,140,248,0.13); color: var(--lp-accent); }
      .lp-feat-t { font-size: 14.5px; font-weight: 700; margin-bottom: 3px; }
      .lp-feat-b { font-size: 13px; color: var(--lp-text-muted); line-height: 1.6; }

      .lp-gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
      .lp-shot {
        aspect-ratio: 3 / 4; border-radius: 11px; position: relative; overflow: hidden;
        border: 1px solid var(--lp-border); display: grid; place-items: center;
        transition: all 0.3s var(--lp-ease);
      }
      .lp-shot:nth-child(3n+1) { background: linear-gradient(150deg, #312e81, #6d28d9); }
      .lp-shot:nth-child(3n+2) { background: linear-gradient(150deg, #9d174d, #be185d); }
      .lp-shot:nth-child(3n+3) { background: linear-gradient(150deg, #075985, #0e7490); }
      .lp-shot-pick { border-color: rgba(52,211,153,0.6); box-shadow: 0 0 0 2px rgba(52,211,153,0.24); }
      .lp-shot-badge {
        position: absolute; top: 7px; right: 7px; padding: 3px 7px; border-radius: 6px;
        font-size: 10px; font-weight: 800; background: rgba(7,8,13,0.75); backdrop-filter: blur(6px);
      }
      .lp-shot-hero { position: absolute; bottom: 7px; left: 7px; padding: 3px 7px; border-radius: 6px; font-size: 10px; font-weight: 800; background: rgba(251,191,36,0.9); color: #1c1408; }

      /* ══════════════ SECURITY ══════════════ */
      .lp-sec-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px; }
      .lp-sec-card {
        padding: 22px; border-radius: 16px; background: var(--lp-surface); border: 1px solid var(--lp-border);
        transition: all 0.3s var(--lp-ease);
      }
      .lp-sec-card:hover { border-color: rgba(52,211,153,0.32); transform: translateY(-4px); }
      .lp-sec-icon { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; margin-bottom: 14px; background: rgba(52,211,153,0.11); color: var(--lp-emerald); }
      .lp-sec-t { font-size: 15.5px; font-weight: 700; margin: 0 0 7px; }
      .lp-sec-b { font-size: 13px; line-height: 1.62; color: var(--lp-text-dim); margin: 0; }

      /* ══════════════ PRICING ══════════════ */
      .lp-found-banner {
        display: inline-flex; align-items: center; gap: 10px; padding: 10px 18px; border-radius: 999px;
        background: linear-gradient(135deg, rgba(251,191,36,0.14), rgba(244,114,182,0.10));
        border: 1px solid rgba(251,191,36,0.32); color: #fde68a; font-size: 13.5px;
        margin: 0 auto 28px;
      }
      .lp-plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; align-items: stretch; }
      .lp-plan {
        display: flex; flex-direction: column; padding: 26px 24px; border-radius: 18px;
        background: var(--lp-surface); border: 1px solid var(--lp-border);
        transition: all 0.3s var(--lp-ease); position: relative;
      }
      .lp-plan:hover { transform: translateY(-5px); border-color: var(--lp-border-strong); }
      .lp-plan-pop {
        border-color: rgba(129,140,248,0.5);
        background: linear-gradient(165deg, rgba(99,102,241,0.13), var(--lp-surface) 46%);
        box-shadow: 0 22px 56px rgba(99,102,241,0.18);
      }
      .lp-plan-flag {
        position: absolute; top: -11px; left: 50%; transform: translateX(-50%);
        background: var(--lp-grad); color: #fff; font-size: 10.5px; font-weight: 800;
        letter-spacing: 0.09em; padding: 5px 13px; border-radius: 999px; white-space: nowrap;
        box-shadow: 0 8px 20px rgba(99,102,241,0.42);
      }
      .lp-plan-name { font-size: 17px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 5px; }
      .lp-plan-for { font-size: 12.5px; color: var(--lp-text-muted); line-height: 1.5; min-height: 38px; }
      .lp-plan-price { display: flex; align-items: baseline; gap: 5px; margin: 16px 0 3px; }
      .lp-plan-amt { font-size: 38px; font-weight: 800; letter-spacing: -0.035em; line-height: 1; }
      .lp-plan-per { font-size: 13px; color: var(--lp-text-muted); }
      .lp-plan-was { font-size: 12.5px; color: var(--lp-text-muted); text-decoration: line-through; min-height: 18px; }
      .lp-plan-cta { margin: 18px 0 20px; }
      .lp-plan-feats { display: flex; flex-direction: column; gap: 9px; flex: 1; }
      .lp-plan-feat { display: flex; gap: 9px; align-items: flex-start; font-size: 13px; color: var(--lp-text-dim); line-height: 1.5; }
      .lp-plan-feat svg { flex-shrink: 0; margin-top: 2px; color: var(--lp-emerald); }
      .lp-plan-head-note {
        font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
        color: var(--lp-text-muted); padding-top: 16px; margin-top: 4px; border-top: 1px solid var(--lp-border);
      }
      .lp-plan-current {
        display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800;
        letter-spacing: 0.06em; padding: 4px 9px; border-radius: 6px;
        background: rgba(52,211,153,0.14); color: var(--lp-emerald);
      }
      .lp-limits { margin-top: 34px; text-align: center; font-size: 13px; color: var(--lp-text-muted); line-height: 1.8; }

      /* ══════════════ FAQ ══════════════ */
      .lp-faq { max-width: 780px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px; }
      .lp-faq-item { border-radius: 14px; background: var(--lp-surface); border: 1px solid var(--lp-border); overflow: hidden; transition: border-color 0.25s; }
      .lp-faq-item.open { border-color: var(--lp-border-strong); }
      .lp-faq-q {
        display: flex; align-items: center; gap: 14px; width: 100%; text-align: left;
        padding: 19px 22px; background: transparent; border: none; cursor: pointer;
        color: var(--lp-text); font-size: 15.5px; font-weight: 600;
      }
      .lp-faq-q span { flex: 1; }
      .lp-faq-chev { transition: transform 0.3s var(--lp-ease); color: var(--lp-text-muted); flex-shrink: 0; }
      .lp-faq-item.open .lp-faq-chev { transform: rotate(180deg); }
      .lp-faq-a { padding: 0 22px 21px; font-size: 14px; line-height: 1.72; color: var(--lp-text-dim); }

      /* ══════════════ FINAL CTA ══════════════ */
      .lp-final {
        position: relative; overflow: hidden; padding: 68px 40px; border-radius: 26px; text-align: center;
        background: linear-gradient(140deg, rgba(99,102,241,0.20), rgba(168,85,247,0.13) 50%, rgba(244,114,182,0.10));
        border: 1px solid rgba(129,140,248,0.32);
      }
      .lp-final-h { font-size: clamp(28px, 4.4vw, 44px); font-weight: 800; letter-spacing: -0.038em; line-height: 1.1; margin: 0 0 16px; }
      .lp-final-p { font-size: 17px; line-height: 1.62; color: var(--lp-text-dim); max-width: 560px; margin: 0 auto 30px; }

      /* ══════════════ FOOTER ══════════════ */
      .lp-footer { border-top: 1px solid var(--lp-border); padding: 52px 0 34px; margin-top: 96px; }
      .lp-footer-grid { display: grid; grid-template-columns: 1.6fr repeat(3, 1fr); gap: 36px; margin-bottom: 38px; }
      .lp-footer-about { font-size: 13.5px; line-height: 1.68; color: var(--lp-text-muted); margin: 14px 0 0; max-width: 320px; }
      .lp-footer-h { font-size: 12px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--lp-text-muted); margin-bottom: 15px; }
      .lp-footer-col { display: flex; flex-direction: column; gap: 10px; }
      .lp-footer-col a { font-size: 13.5px; color: var(--lp-text-dim); transition: color 0.15s; }
      .lp-footer-col a:hover { color: var(--lp-text); }
      .lp-footer-bar {
        display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap;
        padding-top: 26px; border-top: 1px solid var(--lp-border); font-size: 12.5px; color: var(--lp-text-muted);
      }

      /* ══════════════ RESPONSIVE ══════════════ */
      @media (max-width: 1000px) {
        .lp-spine { grid-template-columns: 1fr; }
        .lp-spine-nav { flex-direction: row; overflow-x: auto; padding-bottom: 6px; }
        .lp-spine-btn { min-width: 210px; flex-shrink: 0; }
        .lp-ai-wrap { grid-template-columns: 1fr; }
        .lp-ai-tabs { flex-direction: row; overflow-x: auto; padding-bottom: 6px; }
        .lp-ai-tab { min-width: 190px; flex-shrink: 0; }
        .lp-cfg { grid-template-columns: 1fr; }
        .lp-footer-grid { grid-template-columns: 1fr 1fr; gap: 30px; }
      }
      @media (max-width: 860px) {
        .lp-nav-links { display: none; }
        .lp-nav-cta { display: none; }
        .lp-mobile-toggle { display: block; }
        .lp-mobile-menu.open { display: flex; }
        .lp-chain-stage { grid-template-columns: 1fr; }
        .lp-hero { padding: 128px 0 64px; }
        .lp-section { padding: 76px 0; }
      }
      @media (max-width: 560px) {
        .lp-container { padding: 0 18px; }
        .lp-hero-note { flex-direction: column; gap: 9px; align-items: center; }
        .lp-final { padding: 44px 22px; border-radius: 20px; }
        .lp-footer-grid { grid-template-columns: 1fr; }
        .lp-spine-panel, .lp-ai-panel { padding: 22px 18px; }
        .lp-gallery { grid-template-columns: repeat(2, 1fr); }
        .lp-chain-tab { font-size: 12px; padding: 7px 11px; }
      }

      /* Motion is decoration here — never a prerequisite for reading the page. */
      @media (prefers-reduced-motion: reduce) {
        html { scroll-behavior: auto; }
        .lp-reveal { opacity: 1; transform: none; transition: none; }
        .lp-bubble, .lp-artifact, .lp-spine-item, .lp-scatter-item, .lp-unified, .lp-ai-chip { animation: none; }
        .lp-chain-tab.active .lp-chain-tab-fill { animation: none; width: 100%; }
        .lp-btn:hover, .lp-mod:hover, .lp-plan:hover, .lp-sec-card:hover, .lp-strip-chip:hover { transform: none; }
        * { transition-duration: 0.01ms !important; }
      }
    `}</style>
  );
}
