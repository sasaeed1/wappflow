'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  Zap, ArrowRight, Check, Sparkles, MessageCircle, Brain, Users,
  BarChart3, Shield, Globe, Bot, Send, Mic, Image as ImageIcon,
  FileText, Bell, Workflow, Star, ChevronDown, Menu, X, Play,
  Inbox, Tag, Calendar, CreditCard, Layers, Rocket, Lock, TrendingUp,
  Phone, Camera, MessageSquare, Mail, Database, Activity, Target,
  Languages, Wand2, GitBranch, CheckCircle2, Video, Plug, Volume2,
  Clock, ExternalLink, MapPin, Headphones, Palette, Hash, Images, Crown,
} from 'lucide-react';

import { FLUX_PARKED } from '@/lib/flux';
import { formatMoney } from '@/lib/plan';

// Flux — sibling AI Instagram content engine. Lives at its own URL.
const FLUX_URL = process.env.NEXT_PUBLIC_FLUX_URL || 'http://localhost:3000';

/* ========================================================================== */
/* LANDING PAGE — WappFlow                                                    */
/* ========================================================================== */

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  // Current workspace plan tier — used to make every pricing CTA tier-aware
  // ("Your plan", "Upgrade to Growth", etc.) and to render the user's badge
  // at the top of the pricing section. Null until we've checked auth/plan.
  const [currentPlan, setCurrentPlan] = useState(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    try {
      const t = localStorage.getItem('token');
      if (!t) return;
      setAuthed(true);
      // Fetch plan in the background — non-blocking, falls back gracefully.
      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      fetch(`${API}/workspace/plan`, {
        headers: { Authorization: `Bearer ${t}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const p = (d?.plan?.plan || d?.plan || '').toString().toLowerCase();
          if (p) setCurrentPlan(p);
        })
        .catch(() => {});
    } catch {}
  }, []);

  return (
    <div className="lp-root">
      <GlobalStyles />
      <BackgroundFX />
      <Nav scrolled={scrolled} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} authed={authed} />
      <main>
        <Hero authed={authed} />
        <TrustBar />
        <Problem />
        <FeatureGrid />
        <AISection />
        <FluxSection />
        <MediaStudioSection />
        <ContractsStudioSection />
        <MeetingsSection />
        <HuddleSection />
        <PlatformSection />
        <IntegrationsSection />
        <HowItWorks />
        <DashboardShowcase />
        <TeamSection />
        <Testimonials />
        <Pricing authed={authed} />
        <FAQ />
        <FinalCTA authed={authed} />
      </main>
      <Footer />
    </div>
  );
}

/* ========================================================================== */
/* NAV                                                                        */
/* ========================================================================== */

function Nav({ scrolled, mobileOpen, setMobileOpen, authed }) {
  return (
    <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="lp-container lp-nav-inner">
        <Link href="/" className="lp-brand">
          <div className="lp-brand-mark">
            <Zap size={18} />
          </div>
          <span>WappFlow</span>
        </Link>

        <nav className="lp-nav-links">
          <a href="#features">Features</a>
          <a href="#ai">AI</a>
          <a href="#flux" className="lp-nav-flux">
            Flux <span className="lp-nav-flux-pill">{FLUX_PARKED ? 'SOON' : 'NEW'}</span>
          </a>
          <a href="#studio">Studio</a>
          <a href="#contracts">Contracts</a>
          <a href="#meetings">Meetings</a>
          <a href="#platforms">Channels</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className="lp-nav-cta">
          {authed ? (
            <Link href="/dashboard" className="lp-btn lp-btn-primary">
              Open Dashboard <ArrowRight size={16} />
            </Link>
          ) : (
            <>
              <Link href="/login" className="lp-btn lp-btn-ghost">Sign in</Link>
              <Link href="/signup" className="lp-btn lp-btn-primary">
                Start free <ArrowRight size={16} />
              </Link>
            </>
          )}
        </div>

        <button className="lp-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="lp-mobile-menu">
          <a href="#features" onClick={() => setMobileOpen(false)}>Features</a>
          <a href="#ai" onClick={() => setMobileOpen(false)}>AI</a>
          <a href="#studio" onClick={() => setMobileOpen(false)}>Studio</a>
          <a href="#contracts" onClick={() => setMobileOpen(false)}>Contracts</a>
          <a href="#flux" onClick={() => setMobileOpen(false)} className="lp-nav-flux">
            Flux <span className="lp-nav-flux-pill">{FLUX_PARKED ? 'SOON' : 'NEW'}</span>
          </a>
          <a href="#meetings" onClick={() => setMobileOpen(false)}>Meetings</a>
          <a href="#platforms" onClick={() => setMobileOpen(false)}>Channels</a>
          <a href="#pricing" onClick={() => setMobileOpen(false)}>Pricing</a>
          <a href="#faq" onClick={() => setMobileOpen(false)}>FAQ</a>
          <div className="lp-mobile-cta">
            {authed ? (
              <Link href="/dashboard" className="lp-btn lp-btn-primary lp-btn-block">Open Dashboard</Link>
            ) : (
              <>
                <Link href="/login" className="lp-btn lp-btn-ghost lp-btn-block">Sign in</Link>
                <Link href="/signup" className="lp-btn lp-btn-primary lp-btn-block">Start free</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

/* ========================================================================== */
/* HERO                                                                       */
/* ========================================================================== */

function Hero({ authed }) {
  return (
    <section className="lp-hero">
      <div className="lp-container lp-hero-inner">
        <Reveal>
          <div className="lp-badge">
            <Sparkles size={13} />
            <span>AI-powered multi-channel customer operations</span>
            <span className="lp-badge-dot" />
            <span className="lp-badge-pulse">Live</span>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="lp-hero-title">
            Close every lead<br />
            that touches your <span className="lp-gradient">WhatsApp</span>.
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="lp-hero-sub">
            The AI-powered CRM built for the way modern teams actually sell — on WhatsApp,
            Instagram, Facebook, and your website. Score every lead, schedule meetings with one click,
            huddle with your team. One inbox. One brain. Zero leads slipping through.
          </p>
        </Reveal>

        <Reveal delay={220}>
          <div className="lp-hero-cta">
            {authed ? (
              <Link href="/dashboard" className="lp-btn lp-btn-primary lp-btn-lg">
                Open Dashboard <ArrowRight size={18} />
              </Link>
            ) : (
              <>
                <Link href="/signup" className="lp-btn lp-btn-primary lp-btn-lg">
                  Start free — no card <ArrowRight size={18} />
                </Link>
                <Link href="/login" className="lp-btn lp-btn-glass lp-btn-lg">
                  <Play size={16} /> Sign in
                </Link>
              </>
            )}
          </div>
        </Reveal>

        <Reveal delay={280}>
          <div className="lp-hero-microproof">
            <CheckRow>Set up in under 5 minutes</CheckRow>
            <CheckRow>No phone changes required</CheckRow>
            <CheckRow>Your data, your server</CheckRow>
          </div>
        </Reveal>

        <Reveal delay={360}>
          <HeroPreview />
        </Reveal>
      </div>
    </section>
  );
}

function CheckRow({ children }) {
  return (
    <div className="lp-check-row">
      <CheckCircle2 size={15} />
      <span>{children}</span>
    </div>
  );
}

/* Animated chat + AI panel preview */
function HeroPreview() {
  const messages = [
    { side: 'in',  text: 'Hey, is the 2bhk apartment in DHA still available?', time: '10:42' },
    { side: 'in',  text: 'Need to move next month, what\'s the rent?', time: '10:42' },
    { side: 'ai',  text: 'Lead detected • Hot 🔥 • Intent: pricing_inquiry', time: 'AI' },
    { side: 'out', text: 'Hi Ahmed! Yes it\'s available. PKR 180,000/mo, ready to move. Want a viewing tomorrow?', time: '10:43' },
    { side: 'in',  text: 'Yes please, 5pm works', time: '10:44' },
    { side: 'ai',  text: 'Reminder created • Tomorrow 5:00 PM', time: 'AI' },
  ];
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (visible >= messages.length) return;
    const t = setTimeout(() => setVisible(v => v + 1), 700);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <div className="lp-preview">
      <div className="lp-preview-glow" aria-hidden />
      <div className="lp-preview-frame">
        <div className="lp-preview-topbar">
          <div className="lp-dots"><span /><span /><span /></div>
          <div className="lp-preview-url">wappflow.app/leads/ahmed-malik</div>
          <div className="lp-preview-status"><span className="lp-status-dot" /> Live</div>
        </div>

        <div className="lp-preview-body">
          {/* Left: Chat */}
          <div className="lp-preview-chat">
            <div className="lp-preview-chathead">
              <div className="lp-avatar">AM</div>
              <div>
                <div className="lp-chat-name">Ahmed Malik</div>
                <div className="lp-chat-meta">
                  <Phone size={11} /> +92 300 1234567 · WhatsApp
                </div>
              </div>
              <div className="lp-tag lp-tag-hot">🔥 Hot</div>
            </div>

            <div className="lp-preview-thread">
              {messages.slice(0, visible).map((m, i) => (
                <Bubble key={i} side={m.side} text={m.text} time={m.time} />
              ))}
              {visible < messages.length && (
                <div className="lp-typing"><span /><span /><span /></div>
              )}
            </div>

            <div className="lp-preview-composer">
              <button aria-hidden="true" tabIndex={-1} className="lp-icon-btn"><ImageIcon size={15} /></button>
              <button aria-hidden="true" tabIndex={-1} className="lp-icon-btn"><Mic size={15} /></button>
              <div className="lp-fake-input">Type a message…</div>
              <button aria-hidden="true" tabIndex={-1} className="lp-send-btn"><Send size={14} /></button>
            </div>
          </div>

          {/* Right: AI panel */}
          <div className="lp-preview-ai">
            <div className="lp-ai-head">
              <Brain size={14} />
              <span>AI Intelligence</span>
              <span className="lp-ai-live">●</span>
            </div>

            <div className="lp-ai-grid">
              <Metric label="Score" value="9.2" trend="hot" />
              <Metric label="Sentiment" value="Positive" trend="up" />
              <Metric label="Urgency" value="High" trend="up" />
              <Metric label="Temp" value="Hot 🔥" trend="hot" />
            </div>

            <div className="lp-ai-section">
              <div className="lp-ai-label">Suggested reply</div>
              <div className="lp-ai-suggestion">
                {`"Perfect, Ahmed. I'll meet you at the building tomorrow at 5 PM. I'll send you the location now. Bring your CNIC for the viewing."`}
              </div>
              <div className="lp-ai-actions">
                <button className="lp-ai-pill">Send</button>
                <button className="lp-ai-pill ghost">Rewrite</button>
                <button className="lp-ai-pill ghost">Translate</button>
              </div>
            </div>

            <div className="lp-ai-section">
              <div className="lp-ai-label">Next best action</div>
              <div className="lp-ai-next">
                <Calendar size={13} />
                <span>Schedule viewing · Tomorrow 5:00 PM</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ side, text, time }) {
  const cls = side === 'in' ? 'lp-bubble lp-bubble-in'
            : side === 'out' ? 'lp-bubble lp-bubble-out'
            : 'lp-bubble lp-bubble-ai';
  return (
    <div className={cls}>
      <div className="lp-bubble-text">{text}</div>
      <div className="lp-bubble-time">{time}</div>
    </div>
  );
}

function Metric({ label, value, trend }) {
  return (
    <div className={`lp-metric lp-metric-${trend || 'neutral'}`}>
      <div className="lp-metric-label">{label}</div>
      <div className="lp-metric-value">{value}</div>
    </div>
  );
}

/* ========================================================================== */
/* TRUST BAR                                                                  */
/* ========================================================================== */

function TrustBar() {
  return (
    <section className="lp-trust">
      <div className="lp-container">
        <div className="lp-trust-label">Built for sales teams that actually live in WhatsApp</div>
        <div className="lp-trust-stats">
          <Stat number="160+" label="API endpoints" />
          <Divider />
          <Stat number="6" label="Channels unified" />
          <Divider />
          <Stat number="3s" label="Avg AI reply" />
          <Divider />
          <Stat number="1-click" label="Google Meet" />
          <Divider />
          <Stat number="24/7" label="Auto-reconnect" />
        </div>
      </div>
    </section>
  );
}

function Stat({ number, label }) {
  return (
    <div className="lp-stat">
      <div className="lp-stat-num">{number}</div>
      <div className="lp-stat-label">{label}</div>
    </div>
  );
}
function Divider() { return <div className="lp-trust-divider" />; }

/* ========================================================================== */
/* PROBLEM                                                                    */
/* ========================================================================== */

function Problem() {
  return (
    <section className="lp-section lp-problem">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-eyebrow">The problem</div>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="lp-section-title">
            Your best leads are on WhatsApp.<br />
            Your CRM has <span className="lp-gradient-warm">no idea they exist.</span>
          </h2>
        </Reveal>
        <Reveal delay={140}>
          <p className="lp-section-sub">
            Traditional CRMs were built for email and forms. But customers DM you. They voice-note you.
            They go quiet for three days and then ask for pricing at 11pm. WappFlow was built for that reality.
          </p>
        </Reveal>

        <div className="lp-problem-grid">
          {[
            { icon: <Inbox size={20} />, t: 'Scattered inboxes', d: 'WhatsApp on one phone, Instagram on another, email on a laptop. Leads die in the gaps.' },
            { icon: <Activity size={20} />, t: 'No visibility', d: 'You can\'t see what your team replied, when, or which leads went cold.' },
            { icon: <Brain size={20} />, t: 'No intelligence', d: 'Spreadsheets can\'t tell you which lead is hot, sentiment, or what to say next.' },
            { icon: <Lock size={20} />, t: 'Lost when staff leave', d: 'When someone quits, their WhatsApp history walks out the door with them.' },
          ].map((p, i) => (
            <Reveal key={i} delay={i * 60}>
              <div className="lp-problem-card">
                <div className="lp-problem-icon">{p.icon}</div>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== */
/* FEATURE GRID                                                               */
/* ========================================================================== */

function FeatureGrid() {
  const features = [
    {
      icon: <MessageCircle size={22} />,
      title: 'Unified inbox',
      desc: 'WhatsApp, Instagram, Facebook, and your website forms — all flowing into one timeline per lead.',
      tone: 'indigo',
    },
    {
      icon: <Brain size={22} />,
      title: 'AI sales brain',
      desc: 'Lead score, sentiment, urgency, intent, and 3 ready-to-send replies — generated in seconds.',
      tone: 'violet',
    },
    {
      icon: <Video size={22} />,
      title: 'One-click meetings',
      desc: 'Schedule Google Meet events with auto-generated dial-in. Or send your Calendly link in two taps.',
      tone: 'cyan',
    },
    {
      icon: <Headphones size={22} />,
      title: 'Team huddles',
      desc: 'Start a voice or video call from any channel. No setup, no third-party app. Powered by Jitsi.',
      tone: 'emerald',
    },
    {
      icon: <Workflow size={22} />,
      title: 'Visual pipeline',
      desc: 'Drag leads across stages. See your funnel, what\'s won, what\'s rotting. Per-team-member views.',
      tone: 'emerald',
    },
    {
      icon: <Users size={22} />,
      title: 'Team-grade roles',
      desc: 'Super admin, admin, manager, user — plus per-member overrides on 9 granular permissions.',
      tone: 'orange',
    },
    {
      icon: <CreditCard size={22} />,
      title: 'Invoicing built-in',
      desc: 'Create, send, and track invoices tied to each lead. PDF export, email delivery, payment status.',
      tone: 'cyan',
    },
    {
      icon: <Database size={22} />,
      title: 'Knowledge base',
      desc: 'Upload PDFs of your pricing, policies, FAQs. The AI uses them in every suggested reply.',
      tone: 'pink',
    },
    {
      icon: <Volume2 size={22} />,
      title: 'Distinct sound cues',
      desc: 'Five hand-tuned tones — reminder chime, WhatsApp pop, team double-tap, new-lead arpeggio, system ping. Mute per channel.',
      tone: 'yellow',
    },
    {
      icon: <Bell size={22} />,
      title: 'Real-time everything',
      desc: 'Server-Sent Events stream new messages, status changes, and reminders instantly to your team.',
      tone: 'indigo',
    },
    {
      icon: <BarChart3 size={22} />,
      title: 'Reports that matter',
      desc: 'Revenue trends, conversion funnels, per-rep performance. Export to CSV in one click.',
      tone: 'violet',
    },
    {
      icon: <Shield size={22} />,
      title: 'Your data, your server',
      desc: 'Self-hosted. SQLite on your VPS. HTTPS-enforced. No third party reads your customer chats.',
      tone: 'emerald',
    },
  ];

  return (
    <section id="features" className="lp-section">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-eyebrow">Everything you need</div>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="lp-section-title">
            One platform. <span className="lp-gradient">Twelve superpowers.</span>
          </h2>
        </Reveal>
        <Reveal delay={140}>
          <p className="lp-section-sub">
            Stop duct-taping five tools together. WappFlow is the inbox, the CRM, the AI, the analytics,
            and the invoice tool — all in one workspace.
          </p>
        </Reveal>

        <div className="lp-feature-grid">
          {features.map((f, i) => (
            <Reveal key={i} delay={(i % 3) * 80}>
              <div className={`lp-feature-card lp-tone-${f.tone}`}>
                <div className="lp-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                <div className="lp-feature-glow" aria-hidden />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== */
/* AI SECTION                                                                 */
/* ========================================================================== */

function AISection() {
  const items = [
    { icon: <Target size={16} />,    label: 'Intent detection',     desc: '8 intent classes from pricing to complaint' },
    { icon: <TrendingUp size={16} />, label: 'Lead scoring',         desc: '1–10 scale, updated per message' },
    { icon: <Wand2 size={16} />,     label: 'Reply suggestions',    desc: '3 ready-to-send replies in your voice' },
    { icon: <Languages size={16} />, label: 'Translate any reply',  desc: 'Urdu, English, Arabic, Spanish, more' },
    { icon: <Sparkles size={16} />,  label: 'Tone rewriter',        desc: 'Professional, casual, friendly, formal' },
    { icon: <Bot size={16} />,       label: 'AI commands',          desc: '“Mark all hot leads as interested”' },
  ];

  return (
    <section id="ai" className="lp-section lp-ai-section-wrap">
      <div className="lp-ai-orb" aria-hidden />
      <div className="lp-container lp-ai-layout">
        <div className="lp-ai-text">
          <Reveal>
            <div className="lp-section-eyebrow">
              <Brain size={13} /> The AI layer
            </div>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="lp-section-title left">
              An AI that <span className="lp-gradient">actually closes</span>.
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="lp-section-sub left">
              Powered by Groq, OpenAI, or Anthropic — your choice. The AI reads every conversation,
              knows your business from your knowledge base, and writes replies that sound like you.
            </p>
          </Reveal>

          <div className="lp-ai-features">
            {items.map((it, i) => (
              <Reveal key={i} delay={i * 50}>
                <div className="lp-ai-feature">
                  <div className="lp-ai-feature-icon">{it.icon}</div>
                  <div>
                    <div className="lp-ai-feature-label">{it.label}</div>
                    <div className="lp-ai-feature-desc">{it.desc}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={180}>
          <div className="lp-ai-card">
            <div className="lp-ai-card-head">
              <Brain size={15} />
              <span>Lead Intelligence</span>
              <span className="lp-ai-live">●</span>
            </div>
            <div className="lp-ai-card-grid">
              <BigMetric label="Lead score" value="9.2" sub="/ 10" trend="up" />
              <BigMetric label="Intent" value="Pricing" sub="inquiry" />
              <BigMetric label="Sentiment" value="Positive" sub="trending" trend="up" />
              <BigMetric label="Urgency" value="High" sub="reply now" trend="hot" />
            </div>
            <div className="lp-ai-card-replies">
              <div className="lp-ai-card-label">3 suggested replies</div>
              <SuggestionRow text="Hi Ahmed! The 2bhk in DHA is still available. PKR 180k/mo. Viewing tomorrow at 5?" />
              <SuggestionRow text="Yes, available! Want me to send the floor plan and rent details now?" />
              <SuggestionRow text="Still open. Quick call so I can show you the unit on video — 2 mins?" />
            </div>
            <div className="lp-ai-card-foot">
              <div className="lp-ai-foot-chip">Provider: Groq · llama-3.1-8b-instant</div>
              <div className="lp-ai-foot-time">Generated in 1.2s</div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function BigMetric({ label, value, sub, trend }) {
  return (
    <div className={`lp-bigmetric lp-trend-${trend || 'neutral'}`}>
      <div className="lp-bigmetric-label">{label}</div>
      <div className="lp-bigmetric-value">
        {value} <span className="lp-bigmetric-sub">{sub}</span>
      </div>
    </div>
  );
}

function SuggestionRow({ text }) {
  return (
    <div className="lp-suggestion-row">
      <Sparkles size={12} />
      <span>{text}</span>
    </div>
  );
}

/* ========================================================================== */
/* FLUX SECTION — AI Instagram content engine (sibling app)                   */
/* ========================================================================== */

function FluxSection() {
  const pillars = [
    {
      icon: <Wand2 size={16} />,
      label: 'Topic → Carousel',
      desc: 'Pick a topic. Flux researches, scripts, designs, captions, and queues — in minutes.',
    },
    {
      icon: <Brain size={16} />,
      label: 'Brand-aware AI',
      desc: 'Your tone, niche, do-not-use words, voice keywords. Every post sounds unmistakably you.',
    },
    {
      icon: <Palette size={16} />,
      label: 'On-brand visuals',
      desc: 'Nine theme presets, your colors, your typography. Slides rendered server-side in HTML+Chrome.',
    },
    {
      icon: <Send size={16} />,
      label: 'Approve & schedule',
      desc: 'Review in the library, hit approve, Flux queues to Instagram with caption + hashtags.',
    },
  ];

  return (
    <section id="flux" className="lp-section lp-flux-section">
      <div className="lp-flux-aurora" aria-hidden>
        <div className="lp-flux-blob lp-flux-blob-1" />
        <div className="lp-flux-blob lp-flux-blob-2" />
        <div className="lp-flux-blob lp-flux-blob-3" />
        <div className="lp-flux-grid" />
      </div>

      <div className="lp-container lp-flux-layout">
        <div className="lp-flux-text">
          <Reveal>
            <div className="lp-flux-eyebrow">
              <span className="lp-flux-eyebrow-dot" />
              <Sparkles size={12} />
              <span>Flux · New product</span>
              <span className="lp-flux-eyebrow-pill">Beta</span>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="lp-section-title left lp-flux-title">
              Your content engine.<br />
              <span className="lp-flux-gradient">On autopilot.</span>
            </h2>
          </Reveal>

          <Reveal delay={140}>
            <p className="lp-section-sub left lp-flux-sub">
              Same CRM. Brand-new superpower. <strong>Flux</strong> turns one topic into a finished,
              on-brand Instagram carousel — researched, written, designed, captioned, and queued.
              One platform. Zero designers.
            </p>
          </Reveal>

          <div className="lp-flux-pillars">
            {pillars.map((p, i) => (
              <Reveal key={i} delay={i * 70}>
                <div className="lp-flux-pillar">
                  <div className="lp-flux-pillar-icon">{p.icon}</div>
                  <div>
                    <div className="lp-flux-pillar-label">{p.label}</div>
                    <div className="lp-flux-pillar-desc">{p.desc}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={360}>
            <div className="lp-flux-cta-row">
              {FLUX_PARKED ? (
                <span
                  className="lp-flux-btn lp-flux-btn-primary"
                  style={{ opacity: 0.55, cursor: 'not-allowed', filter: 'grayscale(0.4)' }}
                  aria-disabled="true"
                >
                  Launch Flux
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                    textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999,
                    background: 'rgba(0,0,0,0.28)', color: '#fff',
                  }}>Coming soon</span>
                </span>
              ) : (
                <a
                  href={FLUX_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lp-flux-btn lp-flux-btn-primary"
                >
                  Launch Flux <ExternalLink size={15} />
                </a>
              )}
              <a href="#flux" className="lp-flux-btn lp-flux-btn-ghost">
                <Play size={14} /> See how it works
              </a>
            </div>
          </Reveal>

          <Reveal delay={420}>
            <div className="lp-flux-microproof">
              <CheckRow>One Groq key. Free tier covers thousands of posts/month.</CheckRow>
              <CheckRow>Built on the same multi-tenant engine as WappFlow.</CheckRow>
              <CheckRow>Self-hosted on your VPS. Your brand never leaves.</CheckRow>
            </div>
          </Reveal>
        </div>

        <Reveal delay={200}>
          <div className="lp-flux-preview">
            <div className="lp-flux-preview-glow" aria-hidden />

            <div className="lp-flux-slide lp-flux-slide-3">
              <div className="lp-flux-slide-tag">Slide 3 · CTA</div>
              <div className="lp-flux-slide-inner" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' }}>
                <div className="lp-flux-slide-eyebrow">Save this for later</div>
                <div className="lp-flux-slide-cta">
                  Follow for more<br />
                  <span className="lp-flux-slide-cta-handle">@your.brand</span>
                </div>
                <div className="lp-flux-slide-foot">
                  <Hash size={11} /> #content #ai #automation
                </div>
              </div>
            </div>

            <div className="lp-flux-slide lp-flux-slide-2">
              <div className="lp-flux-slide-tag">Slide 2 · Body</div>
              <div className="lp-flux-slide-inner" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
                <div className="lp-flux-slide-eyebrow">The shift</div>
                <ol className="lp-flux-slide-list">
                  <li><span>1</span> AI does the research</li>
                  <li><span>2</span> Writes in your voice</li>
                  <li><span>3</span> Renders the slides</li>
                  <li><span>4</span> Queues to Instagram</li>
                </ol>
              </div>
            </div>

            <div className="lp-flux-slide lp-flux-slide-1">
              <div className="lp-flux-slide-tag">Slide 1 · Hook</div>
              <div className="lp-flux-slide-inner lp-flux-slide-hook">
                <div className="lp-flux-slide-eyebrow lp-flux-slide-eyebrow-hook">Content automation</div>
                <h3 className="lp-flux-slide-hook-title">
                  Why your brand still doesn&apos;t post daily.
                </h3>
                <div className="lp-flux-slide-foot lp-flux-slide-foot-hook">
                  <Sparkles size={11} /> Generated by Flux
                </div>
              </div>
            </div>

            <div className="lp-flux-float lp-flux-float-tl">
              <div className="lp-flux-float-icon" style={{ background: 'rgba(167,139,250,0.18)' }}>
                <Brain size={12} color="#A78BFA" />
              </div>
              <div>
                <div className="lp-flux-float-label">AI script</div>
                <div className="lp-flux-float-meta">1.4s · Groq</div>
              </div>
            </div>

            <div className="lp-flux-float lp-flux-float-br">
              <div className="lp-flux-float-icon" style={{ background: 'rgba(34,211,238,0.18)' }}>
                <Images size={12} color="#22D3EE" />
              </div>
              <div>
                <div className="lp-flux-float-label">5 slides rendered</div>
                <div className="lp-flux-float-meta">ready to publish</div>
              </div>
            </div>

            <div className="lp-flux-float lp-flux-float-bl">
              <div className="lp-flux-float-icon" style={{ background: 'rgba(236,72,153,0.18)' }}>
                <Calendar size={12} color="#EC4899" />
              </div>
              <div>
                <div className="lp-flux-float-label">Scheduled</div>
                <div className="lp-flux-float-meta">Tomorrow · 9:00 AM</div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      <style>{`
        .lp-flux-section { position: relative; overflow: hidden; padding-top: 110px !important; padding-bottom: 120px !important; }
        .lp-flux-aurora { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
        .lp-flux-aurora .lp-flux-blob { position: absolute; border-radius: 50%; filter: blur(120px); opacity: 0.45; animation: fluxFloat 22s ease-in-out infinite; }
        .lp-flux-blob-1 { width: 560px; height: 560px; background: #A78BFA; top: -100px; left: -120px; }
        .lp-flux-blob-2 { width: 520px; height: 520px; background: #22D3EE; top: 200px; right: -120px; opacity: 0.35; animation-delay: -7s; }
        .lp-flux-blob-3 { width: 480px; height: 480px; background: #EC4899; bottom: -120px; left: 30%; opacity: 0.28; animation-delay: -14s; }
        .lp-flux-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px); background-size: 56px 56px; mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, #000 30%, transparent 80%); -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, #000 30%, transparent 80%); }
        @keyframes fluxFloat { 0%, 100% { transform: translate(0,0) rotate(0deg); } 33% { transform: translate(40px, -30px) rotate(40deg); } 66% { transform: translate(-30px, 20px) rotate(-25deg); } }

        .lp-flux-layout { position: relative; z-index: 1; display: grid; grid-template-columns: 1.05fr 1fr; gap: 64px; align-items: center; }
        @media (max-width: 960px) { .lp-flux-layout { grid-template-columns: 1fr; gap: 56px; } }

        .lp-flux-text { position: relative; }
        .lp-flux-eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px 6px 10px; border-radius: 999px; background: linear-gradient(135deg, rgba(167,139,250,0.14) 0%, rgba(34,211,238,0.14) 50%, rgba(236,72,153,0.14) 100%); border: 1px solid rgba(34,211,238,0.30); color: var(--lp-text); font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em; backdrop-filter: blur(8px); }
        .lp-flux-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: #22D3EE; box-shadow: 0 0 8px #22D3EE; animation: fluxPulse 2.5s ease-in-out infinite; }
        @keyframes fluxPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }
        .lp-flux-eyebrow-pill { margin-left: 4px; font-size: 9px; font-weight: 900; letter-spacing: 0.08em; padding: 2px 7px; border-radius: 5px; background: linear-gradient(135deg, #A78BFA, #EC4899); color: white; }

        .lp-flux-title { margin-top: 22px; font-size: clamp(38px, 5.5vw, 64px); line-height: 1.04; letter-spacing: -0.025em; font-weight: 800; }
        .lp-flux-gradient { background: linear-gradient(135deg, #A78BFA 0%, #22D3EE 50%, #EC4899 100%); background-size: 200% 200%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: fluxShift 8s ease infinite; }
        @keyframes fluxShift { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }

        .lp-flux-sub { margin-top: 20px; font-size: 17px; line-height: 1.65; color: var(--lp-text-dim); max-width: 540px; }
        .lp-flux-sub strong { color: var(--lp-text); background: linear-gradient(135deg, #A78BFA, #22D3EE, #EC4899); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 700; }

        .lp-flux-pillars { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 540px) { .lp-flux-pillars { grid-template-columns: 1fr; } }
        .lp-flux-pillar { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 14px; background: rgba(20, 22, 33, 0.55); border: 1px solid rgba(255,255,255,0.06); backdrop-filter: blur(10px); transition: all 0.2s ease; }
        .lp-flux-pillar:hover { border-color: rgba(34,211,238,0.35); transform: translateY(-2px); box-shadow: 0 18px 40px -16px rgba(34,211,238,0.18); }
        .lp-flux-pillar-icon { width: 32px; height: 32px; border-radius: 9px; background: linear-gradient(135deg, #A78BFA, #22D3EE, #EC4899); display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; box-shadow: 0 4px 14px -2px rgba(34,211,238,0.5); }
        .lp-flux-pillar-label { font-size: 13.5px; font-weight: 800; color: var(--lp-text); letter-spacing: -0.01em; }
        .lp-flux-pillar-desc { margin-top: 2px; font-size: 12.5px; line-height: 1.5; color: var(--lp-text-dim); }

        .lp-flux-cta-row { margin-top: 32px; display: flex; flex-wrap: wrap; gap: 12px; }
        .lp-flux-btn { display: inline-flex; align-items: center; gap: 8px; padding: 13px 22px; border-radius: 12px; font-size: 14.5px; font-weight: 700; letter-spacing: -0.005em; transition: all 0.2s ease; cursor: pointer; border: none; }
        .lp-flux-btn-primary { background: linear-gradient(135deg, #A78BFA 0%, #22D3EE 50%, #EC4899 100%); background-size: 200% 200%; color: #0a0a13; box-shadow: 0 10px 36px -10px rgba(34,211,238,0.55); }
        .lp-flux-btn-primary:hover { background-position: 100% 50%; transform: translateY(-2px); box-shadow: 0 14px 44px -10px rgba(236,72,153,0.55); }
        .lp-flux-btn-ghost { background: rgba(255,255,255,0.04); color: var(--lp-text); border: 1px solid var(--lp-border); }
        .lp-flux-btn-ghost:hover { background: rgba(255,255,255,0.08); border-color: rgba(34,211,238,0.4); }
        .lp-flux-microproof { margin-top: 28px; display: flex; flex-direction: column; gap: 10px; }

        .lp-flux-preview { position: relative; height: 540px; perspective: 1400px; }
        @media (max-width: 960px) { .lp-flux-preview { height: 460px; margin-top: 20px; } }
        @media (max-width: 540px) { .lp-flux-preview { height: 400px; } }
        .lp-flux-preview-glow { position: absolute; inset: 0; background: radial-gradient(circle at 50% 50%, rgba(34,211,238,0.25), transparent 65%); filter: blur(40px); }

        .lp-flux-slide { position: absolute; width: 280px; height: 360px; left: 50%; top: 50%; border-radius: 24px; overflow: hidden; transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1); box-shadow: 0 30px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06); }
        @media (max-width: 540px) { .lp-flux-slide { width: 220px; height: 290px; } }
        .lp-flux-slide-1 { transform: translate(-50%, -50%) rotate(-3deg); z-index: 3; }
        .lp-flux-slide-2 { transform: translate(calc(-50% + 56px), calc(-50% - 12px)) rotate(6deg); z-index: 2; opacity: 0.95; }
        .lp-flux-slide-3 { transform: translate(calc(-50% - 56px), calc(-50% + 14px)) rotate(-9deg); z-index: 1; opacity: 0.85; }
        .lp-flux-preview:hover .lp-flux-slide-1 { transform: translate(-50%, calc(-50% - 10px)) rotate(-2deg); }
        .lp-flux-preview:hover .lp-flux-slide-2 { transform: translate(calc(-50% + 80px), calc(-50% - 28px)) rotate(8deg); }
        .lp-flux-preview:hover .lp-flux-slide-3 { transform: translate(calc(-50% - 80px), calc(-50% + 32px)) rotate(-11deg); }

        .lp-flux-slide-tag { position: absolute; top: 12px; left: 12px; padding: 4px 10px; border-radius: 999px; background: rgba(0,0,0,0.55); backdrop-filter: blur(10px); color: white; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; z-index: 5; }
        .lp-flux-slide-inner { position: relative; width: 100%; height: 100%; padding: 28px 26px; display: flex; flex-direction: column; justify-content: space-between; color: white; }
        .lp-flux-slide-hook { background: linear-gradient(135deg, #0c0c1a 0%, #18162e 60%, #1e1239 100%) !important; }
        .lp-flux-slide-hook::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 25% 0%, rgba(167,139,250,0.32), transparent 50%), radial-gradient(circle at 80% 100%, rgba(236,72,153,0.28), transparent 55%); }
        .lp-flux-slide-eyebrow { font-size: 10.5px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.6); }
        .lp-flux-slide-eyebrow-hook { color: #22D3EE; position: relative; }
        .lp-flux-slide-hook-title { position: relative; font-size: 28px; font-weight: 800; line-height: 1.05; letter-spacing: -0.02em; margin: 0; background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .lp-flux-slide-foot { font-size: 10.5px; font-weight: 600; color: rgba(255,255,255,0.55); display: flex; align-items: center; gap: 6px; }
        .lp-flux-slide-foot-hook { position: relative; color: rgba(255,255,255,0.7); }
        .lp-flux-slide-list { list-style: none; padding: 0; margin: 18px 0 0; display: flex; flex-direction: column; gap: 11px; }
        .lp-flux-slide-list li { display: flex; align-items: center; gap: 11px; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.92); }
        .lp-flux-slide-list li span { width: 24px; height: 24px; border-radius: 7px; background: linear-gradient(135deg, #A78BFA, #22D3EE); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #0a0a13; flex-shrink: 0; }
        .lp-flux-slide-cta { font-size: 22px; font-weight: 800; line-height: 1.15; color: white; }
        .lp-flux-slide-cta-handle { display: inline-block; margin-top: 6px; font-size: 14px; font-weight: 600; background: linear-gradient(135deg, #A78BFA, #22D3EE); -webkit-background-clip: text; background-clip: text; color: transparent; }

        .lp-flux-float { position: absolute; display: flex; align-items: center; gap: 9px; padding: 10px 14px 10px 10px; border-radius: 14px; background: rgba(13, 14, 22, 0.88); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 16px 40px -12px rgba(0,0,0,0.6); z-index: 10; animation: fluxBob 6s ease-in-out infinite; }
        .lp-flux-float-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .lp-flux-float-label { font-size: 11.5px; font-weight: 700; color: var(--lp-text); letter-spacing: -0.005em; }
        .lp-flux-float-meta { font-size: 10px; font-weight: 600; color: var(--lp-text-muted); margin-top: 1px; }
        .lp-flux-float-tl { top: 26px;  left: -10px; animation-delay: -2s; }
        .lp-flux-float-br { bottom: 60px; right: -8px; animation-delay: -4s; }
        .lp-flux-float-bl { bottom: 20px; left: 8px;  animation-delay: -1s; }
        @media (max-width: 540px) { .lp-flux-float-tl { top: 6px; left: -4px; } .lp-flux-float-br { bottom: 30px; right: -4px; } .lp-flux-float-bl { bottom: 0; left: 4px; } }
        @keyframes fluxBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

        .lp-nav-flux { position: relative; display: inline-flex !important; align-items: center; gap: 6px; }
        .lp-nav-flux-pill { font-size: 9px; font-weight: 900; letter-spacing: 0.06em; padding: 2px 6px; border-radius: 4px; background: linear-gradient(135deg, #A78BFA, #EC4899); color: white; }
      `}</style>
    </section>
  );
}

/* ========================================================================== */
/* PLATFORM SECTION                                                           */
/* ========================================================================== */

/* ========================================================================== */
/* MEETINGS SECTION — Google Meet + Calendly                                  */
/* ========================================================================== */

function MediaStudioSection() {
  return (
    <section id="studio" className="lp-section lp-meetings-section">
      <div className="lp-container lp-meetings-layout">
        <div className="lp-meetings-text">
          <Reveal>
            <div className="lp-section-eyebrow"><Camera size={13} /> Media Studio</div>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="lp-section-title left">
              A full creative studio, <span className="lp-gradient">built into your CRM</span>.
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="lp-section-sub left">
              For photographers &amp; studios: ingest a shoot, cull with AI at your side (it advises — you decide),
              deliver breathtaking client galleries, cut reels, and publish a portfolio that sells itself — every
              shoot linked to the same client you already chat with on WhatsApp.
            </p>
          </Reveal>

          <div className="lp-meeting-bullets">
            <Reveal delay={60}>
              <div className="lp-meeting-bullet">
                <div className="lp-mb-icon lp-mb-google"><Wand2 size={16} /></div>
                <div>
                  <div className="lp-mb-title">Cull 10× faster, AI-assisted</div>
                  <div className="lp-mb-desc">Keyboard-first culling with focus, duplicate &amp; quality hints — advisory only, never automatic.</div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="lp-meeting-bullet">
                <div className="lp-mb-icon lp-mb-calendly"><Images size={16} /></div>
                <div>
                  <div className="lp-mb-title">Client galleries &amp; a stunning portfolio</div>
                  <div className="lp-mb-desc">Proofing, favourites, ZIP delivery, and a public portfolio with 10 themes — shareable in one click.</div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={180}>
              <div className="lp-meeting-bullet">
                <div className="lp-mb-icon lp-mb-emerald"><Video size={16} /></div>
                <div>
                  <div className="lp-mb-title">Reels &amp; video studio</div>
                  <div className="lp-mb-desc">Templates, AI drafts, colour grading &amp; one-click export — a shoot becomes a reel in minutes.</div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={240}>
              <div className="lp-meeting-bullet">
                <div className="lp-mb-icon" style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff' }}><Lock size={16} /></div>
                <div>
                  <div className="lp-mb-title">Watermark &amp; protect, in one click</div>
                  <div className="lp-mb-desc">Bulk-apply a logo or text watermark to client previews — your originals stay pristine, the gallery stays protected.</div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        <Reveal delay={120}>
          <div className="lp-meeting-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ position: 'relative', height: 184, background: 'linear-gradient(135deg,#1f2937 0%,#0ea5e9 55%,#a78bfa 100%)' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent 62%)' }} />
              <div style={{ position: 'absolute', right: 14, top: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, background: 'rgba(14,165,233,0.92)', color: '#fff', fontSize: 10.5, fontWeight: 700 }}><Lock size={11} /> Watermarked</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, background: 'rgba(16,185,129,0.92)', color: '#fff', fontSize: 11, fontWeight: 700 }}><CheckCircle2 size={12} /> Published</span>
              </div>
              <div style={{ position: 'absolute', left: 18, bottom: 16, color: '#fff' }}>
                <div style={{ fontSize: 10.5, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.82 }}>Wedding · delivered</div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Ayesha &amp; Bilal</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, padding: 12 }}>
              {['#f59e0b', '#ef4444', '#10b981', '#6366f1', '#ec4899'].map((c, i) => (
                <div key={i} style={{ aspectRatio: '1', borderRadius: 8, background: `linear-gradient(135deg, ${c}40, ${c})` }} />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 16px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#94a3b8' }}>
                <Camera size={13} /> 248 photos · 12 favourites
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#a78bfa' }}>
                <Palette size={13} /> Open portfolio <ArrowRight size={13} />
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ContractsStudioSection() {
  const PKGS = [
    { name: 'Essential', price: 2400 },
    { name: 'Signature', price: 3800, popular: true },
    { name: 'Luxe', price: 5600 },
  ];
  const ADDONS = [
    { label: 'Second shooter', price: 600 },
    { label: 'Drone coverage', price: 450 },
  ];
  const [pkg, setPkg] = useState(1);
  const [addons, setAddons] = useState({ 0: false, 1: false });
  const [signed, setSigned] = useState(false);
  const total = PKGS[pkg].price + ADDONS.reduce((s, a, i) => s + (addons[i] ? a.price : 0), 0);
  const money = (n) => `$${n.toLocaleString()}`;

  return (
    <section id="contracts" className="lp-section lp-meetings-section">
      <div className="lp-meetings-orb" aria-hidden />
      <div className="lp-container lp-meetings-layout">
        {/* Interactive proposal mock — the client experience, live */}
        <Reveal delay={120}>
          <div className="lp-meeting-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid rgba(99,102,241,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 16px', borderBottom: '1px solid rgba(148,163,184,0.16)', background: 'linear-gradient(135deg, rgba(14,165,233,0.14), rgba(99,102,241,0.14))' }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><FileText size={14} /></div>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#e2e8f0' }}>Wedding Photography Proposal</span>
              <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Live</span>
            </div>

            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Choose your collection</div>
              <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
                {PKGS.map((p, i) => {
                  const on = pkg === i;
                  return (
                    <button key={i} onClick={() => { setPkg(i); setSigned(false); }} style={{ position: 'relative', textAlign: 'left', cursor: 'pointer', padding: '11px 10px', borderRadius: 11, background: on ? 'rgba(99,102,241,0.16)' : 'rgba(148,163,184,0.06)', border: `1.5px solid ${on ? '#6366f1' : 'rgba(148,163,184,0.18)'}`, transition: 'all .15s' }}>
                      {p.popular && <span style={{ position: 'absolute', top: -8, right: 8, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', padding: '2px 7px', borderRadius: 999 }}>Popular</span>}
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{p.name}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: on ? '#a5b4fc' : '#cbd5e1', marginTop: 2 }}>{money(p.price)}</div>
                      <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: on ? '#a5b4fc' : '#64748b' }}>{on ? '✓ Selected' : 'Select'}</div>
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', margin: '14px 0 8px' }}>Add-ons</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {ADDONS.map((a, i) => {
                  const on = addons[i];
                  return (
                    <button key={i} onClick={() => { setAddons(s => ({ ...s, [i]: !s[i] })); setSigned(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '9px 12px', borderRadius: 10, background: on ? 'rgba(99,102,241,0.12)' : 'rgba(148,163,184,0.06)', border: `1px solid ${on ? '#6366f1' : 'rgba(148,163,184,0.18)'}` }}>
                      <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${on ? '#6366f1' : '#475569'}`, background: on ? '#6366f1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on && <Check size={11} color="#fff" />}</span>
                      <span style={{ flex: 1, fontSize: 12.5, color: '#cbd5e1', textAlign: 'left' }}>{a.label}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#94a3b8' }}>+{money(a.price)}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(148,163,184,0.16)' }}>
                <div>
                  <div style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>Total</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>{money(total)}</div>
                </div>
                <button onClick={() => setSigned(true)} style={{ padding: '12px 20px', borderRadius: 11, border: 'none', cursor: 'pointer', background: signed ? '#10b981' : 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff', fontWeight: 800, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 7, transition: 'background .2s' }}>
                  {signed ? <><Check size={15} /> Signed</> : <><Crown size={14} /> Accept &amp; sign</>}
                </button>
              </div>

              <div style={{ marginTop: 10, display: 'flex', gap: 7 }}>
                {[['Pipeline', Target], ['Invoice', CreditCard], ['Project', Camera]].map(([label, Icon], i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 9, fontSize: 11, fontWeight: 700, transition: 'all .3s', transitionDelay: `${i * 90}ms`, background: signed ? 'rgba(16,185,129,0.14)' : 'rgba(148,163,184,0.06)', color: signed ? '#34d399' : '#64748b', border: `1px solid ${signed ? 'rgba(16,185,129,0.4)' : 'rgba(148,163,184,0.14)'}` }}>
                    {signed ? <Check size={12} /> : <Icon size={12} />} {label}
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center', fontSize: 10.5, color: signed ? '#34d399' : '#64748b', marginTop: 8, transition: 'color .3s' }}>
                {signed ? 'Signed → pipeline moved, invoice & project created automatically' : 'On signing, the contract runs your business for you'}
              </div>
            </div>
          </div>
        </Reveal>

        <div className="lp-meetings-text">
          <Reveal>
            <div className="lp-section-eyebrow"><FileText size={13} /> Contracts Studio</div>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="lp-section-title left">
              Proposals &amp; contracts that <span className="lp-gradient">close themselves</span>.
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="lp-section-sub left">
              Not a PDF you email and chase. Build stunning, interactive documents block-by-block, let clients pick
              packages and sign on a beautiful page — then watch the signed deal move your pipeline, raise the invoice
              and spin up the project, all on its own. Try the live proposal &rarr;
            </p>
          </Reveal>

          <div className="lp-meeting-bullets">
            <Reveal delay={60}>
              <div className="lp-meeting-bullet">
                <div className="lp-mb-icon lp-mb-google"><Layers size={16} /></div>
                <div>
                  <div className="lp-mb-title">Block-based builder &amp; interactive proposals</div>
                  <div className="lp-mb-desc">19 block types, 3 luxury themes, selectable packages &amp; add-ons with a live total — or upload a PDF and send it to sign.</div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="lp-meeting-bullet">
                <div className="lp-mb-icon lp-mb-emerald"><CheckCircle2 size={16} /></div>
                <div>
                  <div className="lp-mb-title">Sign in seconds, legally binding</div>
                  <div className="lp-mb-desc">Draw or type a signature with ESIGN/UETA consent, multi-party signing, reminders, expiry &amp; a sealed audit trail.</div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={180}>
              <div className="lp-meeting-bullet">
                <div className="lp-mb-icon lp-mb-calendly"><Workflow size={16} /></div>
                <div>
                  <div className="lp-mb-title">It runs your business on signature</div>
                  <div className="lp-mb-desc">Auto-move the pipeline, create the invoice (with deposits), and launch a Media Studio project — delivered over WhatsApp &amp; email.</div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={240}>
              <div className="lp-meeting-bullet">
                <div className="lp-mb-icon" style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff' }}><Sparkles size={16} /></div>
                <div>
                  <div className="lp-mb-title">AI drafting, client Q&amp;A &amp; analytics</div>
                  <div className="lp-mb-desc">Draft a whole contract from a line, let clients ask questions on the page, and track views, time-on-page &amp; acceptance.</div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function MeetingsSection() {
  return (
    <section id="meetings" className="lp-section lp-meetings-section">
      <div className="lp-meetings-orb" aria-hidden />
      <div className="lp-container lp-meetings-layout">
        <Reveal delay={120}>
          <div className="lp-meeting-card">
            <div className="lp-meeting-head">
              <div className="lp-meeting-gcal">
                <GoogleCalIcon />
                <span>Google Calendar</span>
              </div>
              <div className="lp-meeting-status">
                <span className="lp-status-dot" /> Created · just now
              </div>
            </div>

            <div className="lp-meeting-body">
              <div className="lp-meeting-title">Meeting with Ahmed Malik</div>
              <div className="lp-meeting-when">
                <Clock size={13} />
                <span>Tomorrow · 5:00 PM – 5:30 PM PKT</span>
              </div>

              <div className="lp-meeting-meet">
                <div className="lp-meet-icon"><Video size={14} /></div>
                <div className="lp-meet-info">
                  <div className="lp-meet-label">Google Meet</div>
                  <div className="lp-meet-link">meet.google.com/atb-zxqe-pks</div>
                </div>
                <button className="lp-meet-join">Join</button>
              </div>

              <div className="lp-meeting-attendees">
                <div className="lp-attendee">
                  <span className="lp-attendee-dot lp-att-host" />
                  <span>sami@wappflow.app</span>
                  <span className="lp-attendee-role">Host</span>
                </div>
                <div className="lp-attendee">
                  <span className="lp-attendee-dot lp-att-guest" />
                  <span>ahmed.malik@gmail.com</span>
                  <span className="lp-attendee-role">Invited</span>
                </div>
              </div>

              <div className="lp-meeting-actions">
                <div className="lp-meeting-action-chip">
                  <Calendar size={12} /> Added to your calendar
                </div>
                <div className="lp-meeting-action-chip">
                  <Mail size={12} /> Invite sent
                </div>
                <div className="lp-meeting-action-chip">
                  <Activity size={12} /> Logged on lead
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        <div className="lp-meetings-text">
          <Reveal>
            <div className="lp-section-eyebrow">
              <Video size={13} /> Meetings
            </div>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="lp-section-title left">
              Schedule meetings without <span className="lp-gradient">leaving the CRM</span>.
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="lp-section-sub left">
              Click <strong>Schedule</strong> on any lead. Pick a time. WappFlow creates a real
              Google Calendar event with a Google Meet link, emails the invite, and logs it on the
              lead’s timeline. Done.
            </p>
          </Reveal>

          <div className="lp-meeting-bullets">
            <Reveal delay={60}>
              <div className="lp-meeting-bullet">
                <div className="lp-mb-icon lp-mb-google"><GoogleCalIcon size={16} /></div>
                <div>
                  <div className="lp-mb-title">Google Meet, in one click</div>
                  <div className="lp-mb-desc">Connect your Google account once. Every event auto-generates a Meet dial-in.</div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="lp-meeting-bullet">
                <div className="lp-mb-icon lp-mb-calendly"><Calendar size={16} /></div>
                <div>
                  <div className="lp-mb-title">Or send a Calendly link</div>
                  <div className="lp-mb-desc">Paste your URL in Settings. Send it to any lead on WhatsApp in two taps.</div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={180}>
              <div className="lp-meeting-bullet">
                <div className="lp-mb-icon lp-mb-emerald"><CheckCircle2 size={16} /></div>
                <div>
                  <div className="lp-mb-title">It all lands in the audit log</div>
                  <div className="lp-mb-desc">Every scheduled meeting appears on the lead timeline — searchable, exportable.</div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function GoogleCalIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" fill="#fff" stroke="#dadce0" />
      <rect x="3" y="5" width="18" height="4" rx="2" fill="#1a73e8" />
      <text x="12" y="17" textAnchor="middle" fontSize="8" fontWeight="700" fill="#1a73e8" fontFamily="system-ui, sans-serif">31</text>
    </svg>
  );
}

/* ========================================================================== */
/* HUDDLE SECTION — Jitsi voice/video                                         */
/* ========================================================================== */

function HuddleSection() {
  return (
    <section className="lp-section lp-huddle-section">
      <div className="lp-container lp-huddle-layout">
        <div className="lp-huddle-text">
          <Reveal>
            <div className="lp-section-eyebrow">
              <Headphones size={13} /> Team Huddles
            </div>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="lp-section-title left">
              Hop on a call. <span className="lp-gradient">Don&apos;t leave the app.</span>
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="lp-section-sub left">
              Hit <strong>Huddle</strong> in any team channel — voice or video. A call room opens
              instantly. No accounts, no app installs, no API keys. Powered by Jitsi.
            </p>
          </Reveal>

          <div className="lp-huddle-bullets">
            <Reveal delay={60}>
              <div className="lp-huddle-bullet">
                <CheckCircle2 size={15} />
                <span>Voice or video — your call (literally)</span>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="lp-huddle-bullet">
                <CheckCircle2 size={15} />
                <span>Screen share, mute, hand raise — all included</span>
              </div>
            </Reveal>
            <Reveal delay={140}>
              <div className="lp-huddle-bullet">
                <CheckCircle2 size={15} />
                <span>Copy invite link to share with the rest of the team</span>
              </div>
            </Reveal>
            <Reveal delay={180}>
              <div className="lp-huddle-bullet">
                <CheckCircle2 size={15} />
                <span>End-to-end encrypted via Jitsi infrastructure</span>
              </div>
            </Reveal>
          </div>
        </div>

        <Reveal delay={180}>
          <div className="lp-huddle-card">
            <div className="lp-preview-topbar">
              <div className="lp-dots"><span /><span /><span /></div>
              <div className="lp-preview-url">meet.jit.si/wappflow-sales-team</div>
              <div className="lp-preview-status"><span className="lp-status-dot" /> Live · 4 in call</div>
            </div>

            <div className="lp-huddle-grid">
              <HuddleTile name="Sami S." color="#6366f1" speaking video />
              <HuddleTile name="Ayesha K." color="#06b6d4" />
              <HuddleTile name="Bilal A." color="#10b981" video />
              <HuddleTile name="Fatima I." color="#f59e0b" muted />
            </div>

            <div className="lp-huddle-toolbar">
              <button aria-hidden="true" tabIndex={-1} className="lp-huddle-btn"><Mic size={14} /></button>
              <button aria-hidden="true" tabIndex={-1} className="lp-huddle-btn"><Video size={14} /></button>
              <button aria-hidden="true" tabIndex={-1} className="lp-huddle-btn"><MapPin size={14} /></button>
              <button className="lp-huddle-btn lp-huddle-end">End</button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function HuddleTile({ name, color, video, speaking, muted }) {
  const initials = name.split(' ').map(p => p[0]).join('');
  return (
    <div className={`lp-htile ${speaking ? 'speaking' : ''}`}>
      {video ? (
        <div className="lp-htile-video" style={{ background: `radial-gradient(circle at 50% 30%, ${color}66, ${color}22 60%, #111 80%)` }}>
          <div className="lp-htile-avatar" style={{ background: color }}>{initials}</div>
        </div>
      ) : (
        <div className="lp-htile-noVideo">
          <div className="lp-htile-avatar lg" style={{ background: color }}>{initials}</div>
        </div>
      )}
      <div className="lp-htile-foot">
        <span>{name}</span>
        {muted && <Mic size={11} className="lp-htile-mute" />}
        {speaking && <span className="lp-htile-pulse" aria-hidden />}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* INTEGRATIONS SECTION                                                       */
/* ========================================================================== */

function IntegrationsSection() {
  const items = [
    { name: 'Google Meet', desc: 'Auto-generated dial-ins on every event', color: '#1a73e8', icon: <Video size={16} /> },
    { name: 'Google Calendar', desc: 'Real calendar events from any lead', color: '#34a853', icon: <Calendar size={16} /> },
    { name: 'Calendly', desc: 'One-click send to lead on WhatsApp', color: '#006bff', icon: <Calendar size={16} /> },
    { name: 'Jitsi Meet', desc: 'Voice + video huddles, end-to-end encrypted', color: '#1e8c4a', icon: <Headphones size={16} /> },
    { name: 'Groq · OpenAI · Anthropic', desc: 'Bring your own LLM keys', color: '#a855f7', icon: <Brain size={16} /> },
    { name: 'SMTP · IMAP', desc: 'Send email, poll inbound replies', color: '#f59e0b', icon: <Mail size={16} /> },
    { name: 'Google OAuth', desc: 'One-click sign-in for your team', color: '#ea4335', icon: <Lock size={16} /> },
    { name: 'Web Push (VAPID)', desc: 'Browser notifications, even when closed', color: '#06b6d4', icon: <Bell size={16} /> },
  ];

  return (
    <section className="lp-section lp-int-section">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-eyebrow">
            <Plug size={13} /> Integrations
          </div>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="lp-section-title">
            Plugs into the <span className="lp-gradient">stack you already use</span>.
          </h2>
        </Reveal>
        <Reveal delay={140}>
          <p className="lp-section-sub">
            WappFlow connects to the services your team actually relies on — without giving up data ownership.
            Your keys. Your servers. Your control.
          </p>
        </Reveal>

        <div className="lp-int-grid">
          {items.map((it, i) => (
            <Reveal key={i} delay={(i % 4) * 50}>
              <div className="lp-int-card" style={{ '--c': it.color }}>
                <div className="lp-int-icon">{it.icon}</div>
                <div className="lp-int-text">
                  <div className="lp-int-name">{it.name}</div>
                  <div className="lp-int-desc">{it.desc}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformSection() {
  const platforms = [
    { icon: <MessageCircle size={22} />, name: 'WhatsApp',  desc: 'Multi-account, voice notes, media, groups.', color: '#25D366' },
    { icon: <Camera size={22} />,        name: 'Instagram', desc: 'DMs and comments via webhook.',             color: '#E1306C' },
    { icon: <MessageSquare size={22} />, name: 'Facebook',  desc: 'Messenger + lead form submissions.',         color: '#1877F2' },
    { icon: <Globe size={22} />,         name: 'Website',   desc: 'Custom form widget → instant lead.',         color: '#6366f1' },
    { icon: <Mail size={22} />,          name: 'Email',     desc: 'SMTP outbound + IMAP polling.',              color: '#F59E0B' },
    { icon: <Bell size={22} />,          name: 'Push',      desc: 'Browser notifications for every event.',     color: '#06B6D4' },
  ];

  return (
    <section id="platforms" className="lp-section lp-platform-section">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-eyebrow">Channels</div>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="lp-section-title">
            Six ways in. <span className="lp-gradient">One timeline.</span>
          </h2>
        </Reveal>
        <Reveal delay={140}>
          <p className="lp-section-sub">
            Stop tab-hopping. Every message a customer sends — on any channel — appears in a single,
            chronological thread on their lead profile.
          </p>
        </Reveal>

        <div className="lp-platforms-grid">
          {platforms.map((p, i) => (
            <Reveal key={i} delay={i * 50}>
              <div className="lp-platform-card" style={{ '--c': p.color }}>
                <div className="lp-platform-icon">{p.icon}</div>
                <div className="lp-platform-name">{p.name}</div>
                <div className="lp-platform-desc">{p.desc}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== */
/* HOW IT WORKS                                                               */
/* ========================================================================== */

function HowItWorks() {
  const steps = [
    { n: '01', t: 'Connect WhatsApp', d: 'Scan a QR with your phone. Multi-account supported. Sessions persist.', icon: <Phone size={18} /> },
    { n: '02', t: 'Invite your team', d: 'Email or invite link. Set roles. Override permissions per person.', icon: <Users size={18} /> },
    { n: '03', t: 'Sell faster', d: 'Leads flow in. The AI scores them. You hit Send. Reports update live.', icon: <Rocket size={18} /> },
  ];
  return (
    <section className="lp-section lp-how">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-eyebrow">How it works</div>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="lp-section-title">
            From signup to selling — <span className="lp-gradient">under 5 minutes</span>.
          </h2>
        </Reveal>

        <div className="lp-how-grid">
          {steps.map((s, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="lp-how-card">
                <div className="lp-how-step">{s.n}</div>
                <div className="lp-how-icon">{s.icon}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== */
/* DASHBOARD SHOWCASE                                                         */
/* ========================================================================== */

function DashboardShowcase() {
  return (
    <section className="lp-section lp-showcase">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-eyebrow">Built for operators</div>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="lp-section-title">
            A control room <span className="lp-gradient">for every conversation</span>.
          </h2>
        </Reveal>

        <Reveal delay={140}>
          <div className="lp-dashboard-card">
            <div className="lp-preview-topbar">
              <div className="lp-dots"><span /><span /><span /></div>
              <div className="lp-preview-url">wappflow.app/dashboard</div>
              <div className="lp-preview-status"><span className="lp-status-dot" /> Live</div>
            </div>
            <div className="lp-dash-grid">
              <DashStat label="Total leads" value="1,284" delta="+12%" tone="emerald" />
              <DashStat label="Hot leads" value="47" delta="+8" tone="orange" />
              <DashStat label="Won this month" value="PKR 4.2M" delta="+24%" tone="cyan" />
              <DashStat label="Avg response" value="3m 12s" delta="-41%" tone="violet" />

              <div className="lp-dash-wide">
                <div className="lp-dash-section-head">
                  <BarChart3 size={14} />
                  <span>Revenue trend · last 30 days</span>
                </div>
                <SparkChart />
              </div>

              <div className="lp-dash-side">
                <div className="lp-dash-section-head">
                  <Layers size={14} /><span>Pipeline</span>
                </div>
                <PipelineBar label="New"        v={42} pct={70} c="#6366f1" />
                <PipelineBar label="Contacted"  v={28} pct={55} c="#06b6d4" />
                <PipelineBar label="Qualified"  v={19} pct={42} c="#10b981" />
                <PipelineBar label="Proposal"   v={11} pct={28} c="#f59e0b" />
                <PipelineBar label="Won"        v={8}  pct={18} c="#22c55e" />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function DashStat({ label, value, delta, tone }) {
  return (
    <div className={`lp-dashstat lp-tone-${tone}`}>
      <div className="lp-dashstat-label">{label}</div>
      <div className="lp-dashstat-value">{value}</div>
      <div className="lp-dashstat-delta">{delta}</div>
    </div>
  );
}

function PipelineBar({ label, v, pct, c }) {
  return (
    <div className="lp-pipe-row">
      <div className="lp-pipe-label">{label}</div>
      <div className="lp-pipe-track">
        <div className="lp-pipe-fill" style={{ width: pct + '%', background: c }} />
      </div>
      <div className="lp-pipe-val">{v}</div>
    </div>
  );
}

function SparkChart() {
  const points = [10, 14, 12, 18, 22, 19, 26, 31, 28, 36, 42, 38, 45, 52, 49, 58, 64, 60, 71, 78];
  const max = Math.max(...points);
  const w = 100, h = 100;
  const step = w / (points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${i * step},${h - (p / max) * (h - 10) - 5}`).join(' ');
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="lp-spark">
      <defs>
        <linearGradient id="lp-spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.45)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lp-spark-grad)" />
      <path d={path} fill="none" stroke="#818cf8" strokeWidth="0.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ========================================================================== */
/* TEAM SECTION                                                               */
/* ========================================================================== */

function TeamSection() {
  return (
    <section className="lp-section lp-team-section">
      <div className="lp-container lp-team-layout">
        <div className="lp-team-text">
          <Reveal>
            <div className="lp-section-eyebrow">Built for teams</div>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="lp-section-title left">
              Your team. <span className="lp-gradient">Your rules.</span>
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="lp-section-sub left">
              Invite by email or shareable link. Assign roles. Override 9 permissions per person.
              See exactly who replied to what — and when — in the full audit log.
            </p>
          </Reveal>

          <div className="lp-team-points">
            {[
              ['4 role tiers', 'Super Admin, Admin, Manager, User'],
              ['9 permissions', 'Per-member granular overrides'],
              ['Round-robin', 'Auto-distribute leads evenly to team'],
              ['Audit logs', 'Every action, who, when, where'],
              ['Internal chat', 'Channels, reactions, rich formatting'],
            ].map((p, i) => (
              <Reveal key={i} delay={i * 50}>
                <div className="lp-team-point">
                  <CheckCircle2 size={16} />
                  <div>
                    <div className="lp-team-point-label">{p[0]}</div>
                    <div className="lp-team-point-desc">{p[1]}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={180}>
          <div className="lp-team-card">
            <div className="lp-team-card-head">
              <Users size={14} /><span>Workspace · 6 members</span>
            </div>
            {[
              { n: 'Sami Saeed',     r: 'Super Admin', a: 247, c: '#6366f1' },
              { n: 'Ayesha Khan',    r: 'Manager',     a: 188, c: '#06b6d4' },
              { n: 'Bilal Ahmed',    r: 'User',        a: 142, c: '#10b981' },
              { n: 'Fatima Iqbal',   r: 'User',        a: 119, c: '#f59e0b' },
              { n: 'Hassan Raza',    r: 'User',        a: 96,  c: '#ef4444' },
              { n: 'Nida Sheikh',    r: 'Admin',       a: 71,  c: '#a855f7' },
            ].map((m, i) => (
              <div key={i} className="lp-team-member">
                <div className="lp-avatar" style={{ background: m.c }}>
                  {m.n.split(' ').map(p => p[0]).join('')}
                </div>
                <div className="lp-team-info">
                  <div className="lp-team-name">{m.n}</div>
                  <div className="lp-team-role">{m.r}</div>
                </div>
                <div className="lp-team-count">{m.a} leads</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ========================================================================== */
/* TESTIMONIALS                                                               */
/* ========================================================================== */

function Testimonials() {
  const items = [
    {
      q: 'We were losing 40% of WhatsApp leads to "I\'ll get back to you" replies. WappFlow\'s AI now drafts the response before the customer finishes typing.',
      n: 'Owner, Karachi real estate agency',
    },
    {
      q: 'Schedule, meet, follow up — all in one window. The Google Meet integration alone saved my team six tabs.',
      n: 'Head of Sales, SaaS company',
    },
    {
      q: 'The unified inbox alone was worth switching. My team used to flip between three phones. Now everything is one tab.',
      n: 'Sales Lead, e-commerce brand',
    },
    {
      q: 'Self-hosted on our own VPS, fully under our control. We tried HubSpot for 3 months and went back the next day.',
      n: 'Founder, B2B services',
    },
  ];
  return (
    <section className="lp-section lp-testimonials">
      <div className="lp-container">
        <Reveal>
          <h2 className="lp-section-title">
            Operators are <span className="lp-gradient">switching</span>.
          </h2>
        </Reveal>

        <div className="lp-test-grid">
          {items.map((t, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="lp-test-card">
                <div className="lp-stars">
                  {[0,1,2,3,4].map(s => <Star key={s} size={14} fill="#facc15" stroke="#facc15" />)}
                </div>
                <p>&ldquo;{t.q}&rdquo;</p>
                <div className="lp-test-name">— {t.n}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== */
/* PRICING                                                                    */
/* ========================================================================== */

// Plan tier priority — lower number = lower tier. Used to decide whether
// the CTA on a card should say "Upgrade", "Your plan", or "Downgrade".
// Landing plan catalog (display copy per spec). Prices hydrate from /api/plans
// when reachable, so Command Center price changes flow through here too.
const LANDING_PLANS = [
  {
    key: 'creator', name: 'Creator', price: 7999, founding: 3999,
    tagline: 'For solo creators building their business.',
    limits: ['1 user', '200 new leads / month', '1 WhatsApp account', '50 GB storage', '25 contract / proposal sends'],
    features: ['CRM', 'Contracts Studio', 'Booking', 'Media Studio', 'Portfolio', 'Client Portal', 'Print Store'],
  },
  {
    key: 'studio', name: 'Studio', price: 14999, founding: 7499, featured: true,
    tagline: 'For growing studios and creative teams.',
    limits: ['5 users', '500 new leads / month', '2 WhatsApp accounts', '250 GB storage', '100 contract / proposal sends'],
    features: [
      'Everything in Creator', 'Instagram, Facebook & Website lead capture', 'Lead source tracking',
      'Team permissions', 'Advanced reporting', 'Knowledge base',
      'AI reply suggestions + lead intelligence', 'Next best actions',
      'Clause library, version history & redline', 'Approval workflows + bulk send',
      'Gallery collections, story sections & advanced proofing',
      'Studio Brain + AI asset scoring, hero-shot & culling', 'AI project intelligence',
      'Advanced automation', 'Desktop beta access',
    ],
  },
  {
    key: 'studio_plus', name: 'Studio+', price: 29999, founding: 14999,
    tagline: 'For established studios operating at scale.',
    limits: ['15 users', '5,000 new leads / month', '5 WhatsApp accounts', '1 TB storage', '500 contract / proposal sends'],
    features: [
      'Everything in Studio', 'White-label experience', 'Priority support',
      'Future style profiles, story & reel engines', 'Future AI editing workflows',
      'Desktop included + sync', 'Future local AI processing',
    ],
  },
  {
    key: 'enterprise', name: 'Enterprise', price: null, founding: null,
    tagline: 'For organizations requiring custom deployments.',
    limits: ['Unlimited users', 'Unlimited leads', 'Custom WhatsApp accounts (5+)', 'Custom storage', 'Unlimited contract sends'],
    features: [
      'Everything in Studio+', 'Custom integrations', 'Dedicated support',
      'Custom branding', 'Custom limits & SLAs', 'Custom deployment rules',
    ],
  },
];

const pkr = (n) => formatMoney(n); // shared formatter — lib/plan.js (single currency impl)

function Pricing({ authed }) {
  const [remote, setRemote] = useState(null);
  const [founding, setFounding] = useState({ open: true, remaining: 100, slots: 100 });

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    let on = true;
    fetch(`${API}/plans`).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!on || !d) return;
      const m = {}; (d.plans || []).forEach(p => { m[p.key] = p; });
      setRemote(m);
      if (d.founding) setFounding(d.founding);
    }).catch(() => {});
    return () => { on = false; };
  }, []);

  const priceOf = (p) => (remote && remote[p.key] && remote[p.key].price != null) ? remote[p.key].price : p.price;
  const foundOf = (p) => (remote && remote[p.key] && remote[p.key].founding_price != null) ? remote[p.key].founding_price : p.founding;

  return (
    <section id="pricing" className="lp-section lp-pricing">
      <div className="lp-container">
        <Reveal><div className="lp-section-eyebrow">Pricing</div></Reveal>
        <Reveal delay={80}>
          <h2 className="lp-section-title">Plans that scale with <span className="lp-gradient">your studio</span>.</h2>
        </Reveal>
        <Reveal delay={140}>
          <p className="lp-section-sub">
            Built for photographers, videographers, studios &amp; agencies. The first 100 studios lock in <strong>50% off — permanently</strong> with Founding&nbsp;100.
          </p>
        </Reveal>

        {founding.open && (
          <Reveal delay={170}>
            <div style={PS.foundingBanner}>
              <Crown size={15} />
              <span>
                <strong>Founding&nbsp;100</strong> — first 100 studios keep 50% off forever.
                {typeof founding.remaining === 'number' ? ` ${founding.remaining} of ${founding.slots || 100} spots left.` : ''}
              </span>
            </div>
          </Reveal>
        )}

        <div style={PS.grid}>
          {LANDING_PLANS.map((p, i) => {
            const price = priceOf(p), found = foundOf(p);
            return (
              <Reveal key={p.key} delay={80 + i * 60}>
                <div style={PS.card(p.featured)}>
                  {p.featured && <div style={PS.ribbonPopular}>★ Most popular</div>}
                  <div style={PS.tier}>{p.name}</div>
                  <div style={PS.tagline}>{p.tagline}</div>
                  <div style={PS.amountWrap}>
                    {price != null
                      ? <><span style={PS.amount}>{pkr(price)}</span><span style={PS.cadence}>/month</span></>
                      : <span style={PS.amount}>Custom</span>}
                  </div>
                  {found != null && founding.open
                    ? <div style={PS.founding}><Crown size={12} /> Founding&nbsp;100: <strong>&nbsp;{pkr(found)}/mo</strong></div>
                    : <div style={PS.foundingMuted}>{price != null ? 'Standard pricing' : 'Tailored to your organization'}</div>}
                  <a href={p.key === 'enterprise' ? 'mailto:sales@wappflow.app' : '/signup'} style={PS.cta(p.featured)}>
                    {p.key === 'enterprise' ? 'Talk to sales' : 'Get started'} <ArrowRight size={15} />
                  </a>
                  <div style={PS.limitsBox}>
                    {p.limits.map((l, j) => (
                      <div key={j} style={PS.limitRow}><Check size={13} style={{ color: '#10b981', flexShrink: 0 }} /> <span>{l}</span></div>
                    ))}
                  </div>
                  <ul style={PS.featList}>
                    {p.features.map((f, j) => (
                      <li key={j} style={PS.featRow}>
                        <Check size={13} style={{ color: p.featured ? '#8b5cf6' : '#6366f1', flexShrink: 0, marginTop: 3 }} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>

        <ComparisonTable />

        <Reveal delay={200}>
          <div style={PS.entCta}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Need a custom deployment?</div>
              <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
                Multi-location studios, franchises &amp; enterprise — unlimited everything, custom SLAs, dedicated support.
              </div>
            </div>
            <a href="mailto:sales@wappflow.app" style={{ ...PS.cta(true), width: 'auto', whiteSpace: 'nowrap' }}>Talk to sales <ArrowRight size={15} /></a>
          </div>
        </Reveal>

        <Reveal delay={300}>
          <div className="lp-price-foot">
            All plans include WhatsApp, the AI engine, audit logs &amp; data ownership. Founding&nbsp;100 pricing is locked permanently. Upgrade anytime.
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Feature comparison table (spec #7) ──────────────────────────────────────
const CMP_ROWS = [
  { group: 'Limits' },
  { label: 'New leads / month', vals: ['200', '500', '5,000', 'Unlimited'] },
  { label: 'Team members', vals: ['1', '5', '15', 'Unlimited'] },
  { label: 'WhatsApp accounts', vals: ['1', '2', '5', '5+ custom'] },
  { label: 'Storage', vals: ['50 GB', '250 GB', '1 TB', 'Custom'] },
  { label: 'Contract / proposal sends / mo', vals: ['25', '100', '500', 'Unlimited'] },
  { group: 'Core modules' },
  { label: 'CRM, Contracts, Booking, Media Studio', vals: [true, true, true, true] },
  { label: 'Portfolio, Client Portal, Print Store', vals: [true, true, true, true] },
  { group: 'Growth & AI' },
  { label: 'Instagram / Facebook / Website capture', vals: [false, true, true, true] },
  { label: 'Lead source tracking', vals: [false, true, true, true] },
  { label: 'Team permissions', vals: [false, true, true, true] },
  { label: 'Advanced reporting + Knowledge base', vals: [false, true, true, true] },
  { label: 'AI replies, lead intelligence, next best actions', vals: [false, true, true, true] },
  { label: 'Studio Brain, AI scoring, hero-shot, culling', vals: [false, true, true, true] },
  { group: 'Contracts & studio depth' },
  { label: 'Clause library, version history, redline, approvals', vals: [false, true, true, true] },
  { label: 'Bulk send', vals: [false, true, true, true] },
  { label: 'Gallery collections, story sections, proofing', vals: [false, true, true, true] },
  { label: 'Advanced automation', vals: [false, true, true, true] },
  { group: 'Scale & platform' },
  { label: 'White-label experience', vals: [false, false, true, true] },
  { label: 'Priority support', vals: [false, false, true, true] },
  { label: 'Desktop access', vals: [false, 'Beta', true, true] },
  { label: 'Future engines (style, story, reel, AI editing)', vals: [false, false, true, true] },
  { label: 'Custom integrations, SLAs, dedicated support', vals: [false, false, false, true] },
];

function ComparisonTable() {
  const cell = (v) => {
    if (v === true) return <Check size={15} style={{ color: '#10b981' }} />;
    if (v === false) return <span style={{ color: 'var(--text-dim)', opacity: 0.5 }}>—</span>;
    return <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{v}</span>;
  };
  return (
    <Reveal delay={120}>
      <div style={PS.cmpWrap}>
        <table style={PS.cmpTable}>
          <thead>
            <tr>
              <th style={{ ...PS.cmpTh, textAlign: 'left' }}>Compare plans</th>
              <th style={PS.cmpTh}>Creator</th>
              <th style={{ ...PS.cmpTh, color: '#8b5cf6' }}>Studio</th>
              <th style={PS.cmpTh}>Studio+</th>
              <th style={PS.cmpTh}>Enterprise</th>
            </tr>
          </thead>
          <tbody>
            {CMP_ROWS.map((r, i) => r.group ? (
              <tr key={i}><td colSpan={5} style={PS.cmpGroup}>{r.group}</td></tr>
            ) : (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={PS.cmpLabel}>{r.label}</td>
                {r.vals.map((v, j) => <td key={j} style={{ ...PS.cmpCell, ...(j === 1 ? { background: 'rgba(139,92,246,0.05)' } : {}) }}>{cell(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Reveal>
  );
}

// Inline styles for the pricing section (kept local so it never depends on
// undefined lp-* classes).
const PS = {
  foundingBanner: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, margin: '0 auto 28px', maxWidth: 620, padding: '10px 18px', borderRadius: 999, background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(139,92,246,0.12))', border: '1px solid rgba(245,158,11,0.35)', color: '#fbbf24', fontSize: 13.5, fontWeight: 600, textAlign: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 18, alignItems: 'start' },
  card: (f) => ({ position: 'relative', display: 'flex', flexDirection: 'column', padding: f ? '28px 22px' : '24px 22px', borderRadius: 18, background: f ? 'linear-gradient(180deg, rgba(139,92,246,0.10), rgba(99,102,241,0.04))' : 'var(--surface)', border: f ? '2px solid rgba(139,92,246,0.55)' : '1px solid var(--border)', boxShadow: f ? '0 24px 60px -24px rgba(139,92,246,0.5)' : '0 2px 10px rgba(0,0,0,0.04)' }),
  ribbonPopular: { position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: 999, background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', whiteSpace: 'nowrap', boxShadow: '0 6px 16px -4px rgba(139,92,246,0.6)' },
  tier: { fontSize: 19, fontWeight: 800, color: 'var(--text)', marginTop: 4 },
  tagline: { fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, minHeight: 34, lineHeight: 1.35 },
  amountWrap: { display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 12, flexWrap: 'wrap' },
  amount: { fontSize: 26, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em' },
  cadence: { fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 },
  founding: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12.5, color: '#d97706', fontWeight: 600 },
  foundingMuted: { marginTop: 6, fontSize: 12.5, color: 'var(--text-dim)' },
  cta: (f) => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 16, padding: '11px 16px', borderRadius: 11, textDecoration: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', border: f ? 'none' : '1.5px solid var(--border)', background: f ? 'linear-gradient(135deg,#8b5cf6,#6366f1)' : 'var(--surface2)', color: f ? '#fff' : 'var(--text)', boxShadow: f ? '0 10px 26px -8px rgba(139,92,246,0.55)' : 'none' }),
  limitsBox: { marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 },
  limitRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  featList: { listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  featRow: { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.4 },
  entCta: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginTop: 28, padding: '22px 24px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)' },
  cmpWrap: { marginTop: 40, overflowX: 'auto', borderRadius: 16, border: '1px solid var(--border)' },
  cmpTable: { width: '100%', minWidth: 720, borderCollapse: 'collapse', background: 'var(--surface)' },
  cmpTh: { padding: '14px 14px', fontSize: 13, fontWeight: 800, color: 'var(--text)', textAlign: 'center', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  cmpGroup: { padding: '12px 14px', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', background: 'var(--surface2)' },
  cmpLabel: { padding: '11px 14px', fontSize: 13, color: 'var(--text)' },
  cmpCell: { padding: '11px 14px', textAlign: 'center', verticalAlign: 'middle' },
};

function PriceList({ items }) {
  return (
    <ul className="lp-price-list">
      {items.map((it, i) => {
        // Backward-compat: items may be strings or { text, locked, highlight, requiredPlan }
        const obj = typeof it === 'string' ? { text: it } : it;
        const cls = [
          obj.locked && 'lp-price-li-locked',
          obj.highlight && 'lp-price-li-highlight',
        ].filter(Boolean).join(' ');
        return (
          <li key={i} className={cls}>
            {obj.locked ? (
              <Lock size={13} className="lp-price-li-lock-icon" />
            ) : obj.highlight ? (
              <Sparkles size={14} />
            ) : (
              <Check size={14} />
            )}
            <span className="lp-price-li-text">{obj.text}</span>
            {obj.locked && obj.requiredPlan && (
              <span className="lp-price-li-plan-pill">{obj.requiredPlan}+</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ========================================================================== */
/* FAQ                                                                        */
/* ========================================================================== */

function FAQ() {
  const items = [
    {
      q: 'Does WappFlow need WhatsApp Business API?',
      a: 'No. WappFlow connects directly to WhatsApp Web via a QR code — no API approval, no Meta paperwork. Multi-account is supported out of the box.',
    },
    {
      q: 'Is my customer data safe?',
      a: 'Yes. WappFlow is self-hosted on your own server. Your conversations, leads, and files never leave your infrastructure. All traffic is HTTPS-encrypted via Let\'s Encrypt.',
    },
    {
      q: 'Which AI provider does it use?',
      a: 'Your choice. WappFlow has built-in adapters for Groq (default, ultra-fast), OpenAI, and Anthropic. Use your own API keys — your data, your spend.',
    },
    {
      q: 'Can it really replace HubSpot or Salesforce?',
      a: 'For WhatsApp-driven sales teams in SMB and mid-market — yes, easily. WappFlow does the 80% of CRM you actually use, with AI built in, at a fraction of the price.',
    },
    {
      q: 'How does the team see each other\'s replies?',
      a: 'Every lead has a unified timeline of messages, notes, status changes, and reminders. The audit log records every action with timestamps. Internal team chat lives in /chat.',
    },
    {
      q: 'Can I migrate from another CRM?',
      a: 'Yes. CSV import is built in for leads and contacts. For complex migrations, our team can help — talk to sales.',
    },
    {
      q: 'How does Google Meet scheduling work?',
      a: 'Connect Google Calendar from Settings → Integrations (one-time OAuth). Then click Schedule on any lead — WappFlow creates a real Google Calendar event with an auto-generated Meet link, sends the invite to the lead\'s email, and logs the meeting on their timeline.',
    },
    {
      q: 'Do I need a Calendly account?',
      a: 'No, Calendly is optional. If you have one, paste the URL in Settings → Integrations. Then Schedule → Calendly link → "Send to lead on WhatsApp" delivers your booking page in a tap. Without Calendly, you can still use Google Meet scheduling.',
    },
    {
      q: 'Are team huddles really included?',
      a: 'Yes, no upcharge. Huddles run on Jitsi Meet — free, open-source, end-to-end encrypted. Voice and video supported. No accounts, no installs, no API keys needed.',
    },
    {
      q: 'What counts as a lead?',
      a: 'Your monthly lead allowance counts each NEW lead created in a calendar month — whether added manually, imported, or auto-created from a new WhatsApp, Instagram, Facebook, or website conversation. Messages, notes, edits, contracts, and bookings on existing leads do NOT count. Inbound customer messages are never dropped, even at the limit.',
    },
    {
      q: 'What counts as storage?',
      a: 'Storage is the actual file storage your workspace consumes — primarily Media Studio assets (photos/videos) and exports. It is measured in GB against your plan\'s allowance (50 GB on Creator, 250 GB on Studio, 1 TB on Studio+).',
    },
    {
      q: 'What counts as a contract / proposal send?',
      a: 'Each contract, proposal, or quote you send to a client counts once toward your monthly send allowance. Drafts, edits, and re-opens don\'t count — only sends.',
    },
    {
      q: 'How do limits reset?',
      a: 'Monthly limits (new leads and contract sends) reset on the 1st of each calendar month. Capacity limits (users, WhatsApp accounts, storage) reflect what you\'re currently using and free up as you remove items or upgrade.',
    },
    {
      q: 'What happens when I reach a limit?',
      a: 'You\'ll see a soft warning at 80% and an upgrade prompt at 90%. At 100% you can\'t add more of that item until the next reset or an upgrade — but nothing you\'ve already created is touched, and incoming customer messages are never blocked.',
    },
    {
      q: 'How does Founding 100 work?',
      a: 'The first 100 paying studios lock in 50% off — Creator PKR 3,999, Studio PKR 7,499, Studio+ PKR 14,999 — permanently, for as long as you stay subscribed. Founding members also get founder access, the roadmap, beta features, early desktop access, and a priority feedback channel.',
    },
  ];

  return (
    <section id="faq" className="lp-section lp-faq">
      <div className="lp-container lp-faq-inner">
        <Reveal>
          <div className="lp-section-eyebrow center">FAQ</div>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="lp-section-title">Frequently asked</h2>
        </Reveal>

        <div className="lp-faq-list">
          {items.map((it, i) => <FAQItem key={i} q={it.q} a={it.a} />)}
        </div>
      </div>
    </section>
  );
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <Reveal>
      <div className={`lp-faq-item ${open ? 'open' : ''}`}>
        <button className="lp-faq-q" onClick={() => setOpen(!open)}>
          <span>{q}</span>
          <ChevronDown size={18} />
        </button>
        <div className="lp-faq-a"><p>{a}</p></div>
      </div>
    </Reveal>
  );
}

/* ========================================================================== */
/* FINAL CTA                                                                  */
/* ========================================================================== */

function FinalCTA({ authed }) {
  return (
    <section className="lp-section lp-final">
      <div className="lp-container">
        <div className="lp-final-card">
          <div className="lp-final-glow" aria-hidden />
          <Reveal>
            <h2 className="lp-final-title">
              Stop losing leads to <span className="lp-gradient">{`"I'll get back to you."`}</span>
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="lp-final-sub">
              Get the AI-powered WhatsApp CRM your team will actually use. Set up in 5 minutes.
            </p>
          </Reveal>
          <Reveal delay={140}>
            <div className="lp-hero-cta center">
              {authed ? (
                <Link href="/dashboard" className="lp-btn lp-btn-primary lp-btn-lg">
                  Open Dashboard <ArrowRight size={18} />
                </Link>
              ) : (
                <>
                  <Link href="/signup" className="lp-btn lp-btn-primary lp-btn-lg">
                    Start free — no card <ArrowRight size={18} />
                  </Link>
                  <Link href="/login" className="lp-btn lp-btn-glass lp-btn-lg">Sign in</Link>
                </>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== */
/* FOOTER                                                                     */
/* ========================================================================== */

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer-inner">
        <div className="lp-footer-brand">
          <Link href="/" className="lp-brand">
            <div className="lp-brand-mark"><Zap size={18} /></div>
            <span>WappFlow</span>
          </Link>
          <p>AI-powered WhatsApp CRM for teams that sell on chat.</p>
        </div>

        <div className="lp-footer-cols">
          <div>
            <div className="lp-footer-col-head">Product</div>
            <a href="#features">Features</a>
            <a href="#ai">AI Engine</a>
            <a href="#platforms">Platforms</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div>
            <div className="lp-footer-col-head">Company</div>
            <a href="mailto:hello@wappflow.app">Contact</a>
            <a href="#faq">FAQ</a>
            <Link href="/login">Sign in</Link>
            <Link href="/signup">Start free</Link>
          </div>
          <div>
            <div className="lp-footer-col-head">Status</div>
            <div className="lp-footer-status">
              <span className="lp-status-dot" /> All systems operational
            </div>
          </div>
        </div>
      </div>
      <div className="lp-footer-bottom">
        <div className="lp-container lp-footer-bottom-row">
          <div>© {new Date().getFullYear()} WappFlow. All rights reserved.</div>
          <div className="lp-footer-mini">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ========================================================================== */
/* REVEAL — Scroll-in animation wrapper                                       */
/* ========================================================================== */

function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setTimeout(() => setShown(true), delay);
        obs.disconnect();
      }
    }, { threshold: 0.12 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={`lp-reveal ${shown ? 'in' : ''}`}>
      {children}
    </div>
  );
}

/* ========================================================================== */
/* BACKGROUND FX                                                              */
/* ========================================================================== */

function BackgroundFX() {
  return (
    <div className="lp-bg" aria-hidden>
      <div className="lp-bg-grid" />
      <div className="lp-bg-glow lp-bg-glow-1" />
      <div className="lp-bg-glow lp-bg-glow-2" />
      <div className="lp-bg-glow lp-bg-glow-3" />
    </div>
  );
}

/* ========================================================================== */
/* STYLES                                                                     */
/* ========================================================================== */

function GlobalStyles() {
  return (
    <style>{`
      :root {
        --lp-bg: #07080d;
        --lp-bg-2: #0b0d16;
        --lp-surface: rgba(20, 22, 33, 0.65);
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
      }

      html, body { background: var(--lp-bg); color: var(--lp-text); }
      body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }

      a { color: inherit; text-decoration: none; }
      button { font-family: inherit; }

      .lp-root { position: relative; min-height: 100vh; overflow-x: hidden; }
      .lp-container { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 24px; }

      /* ============== BACKGROUND ============== */
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
      .lp-bg-glow { position: absolute; border-radius: 50%; filter: blur(120px); opacity: 0.5; }
      .lp-bg-glow-1 { width: 720px; height: 720px; background: #6366f1; top: -200px; left: -100px; }
      .lp-bg-glow-2 { width: 600px; height: 600px; background: #a855f7; top: 200px; right: -150px; opacity: 0.35; }
      .lp-bg-glow-3 { width: 800px; height: 800px; background: #06b6d4; top: 1800px; left: -200px; opacity: 0.25; }

      main { position: relative; z-index: 1; }

      /* ============== NAV ============== */
      .lp-nav {
        position: fixed; top: 0; left: 0; right: 0; z-index: 50;
        padding: 14px 0;
        transition: all 0.3s ease;
      }
      .lp-nav.scrolled {
        background: rgba(7, 8, 13, 0.75);
        backdrop-filter: blur(18px) saturate(160%);
        -webkit-backdrop-filter: blur(18px) saturate(160%);
        border-bottom: 1px solid var(--lp-border);
        padding: 10px 0;
      }
      .lp-nav-inner { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
      .lp-brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 800; font-size: 18px; letter-spacing: -0.02em; }
      .lp-brand-mark {
        width: 32px; height: 32px; border-radius: 9px;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        display: grid; place-items: center; color: #fff;
        box-shadow: 0 6px 16px rgba(99,102,241,0.45);
      }
      .lp-nav-links { display: flex; gap: 32px; }
      .lp-nav-links a { color: var(--lp-text-dim); font-size: 14px; font-weight: 500; transition: color 0.15s; }
      .lp-nav-links a:hover { color: var(--lp-text); }
      .lp-nav-cta { display: flex; gap: 10px; align-items: center; }
      .lp-mobile-toggle { display: none; background: none; border: none; color: var(--lp-text); cursor: pointer; padding: 6px; }

      .lp-mobile-menu {
        display: none; flex-direction: column; gap: 4px;
        padding: 18px 24px 24px;
        background: rgba(7,8,13,0.95);
        backdrop-filter: blur(18px);
        border-top: 1px solid var(--lp-border);
      }
      .lp-mobile-menu a { padding: 12px 0; color: var(--lp-text-dim); font-weight: 500; }
      .lp-mobile-cta { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }

      /* ============== BUTTONS ============== */
      .lp-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: 14px;
        cursor: pointer; border: none; transition: all 0.2s; white-space: nowrap;
      }
      .lp-btn-primary {
        background: linear-gradient(135deg, #6366f1, #a855f7);
        color: #fff;
        box-shadow: 0 8px 24px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.2);
      }
      .lp-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 12px 32px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.25); }
      .lp-btn-glass {
        background: rgba(255,255,255,0.06);
        color: var(--lp-text);
        border: 1px solid var(--lp-border-strong);
        backdrop-filter: blur(10px);
      }
      .lp-btn-glass:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.22); }
      .lp-btn-ghost { background: transparent; color: var(--lp-text-dim); }
      .lp-btn-ghost:hover { color: var(--lp-text); }
      .lp-btn-lg { padding: 14px 24px; font-size: 15px; border-radius: 12px; }
      .lp-btn-block { width: 100%; }

      /* ============== HERO ============== */
      .lp-hero { padding: 160px 0 80px; position: relative; }
      .lp-hero-inner { text-align: center; max-width: 920px; margin: 0 auto; }
      .lp-badge {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 6px 14px; border-radius: 999px;
        background: rgba(99,102,241,0.1);
        border: 1px solid rgba(99,102,241,0.25);
        color: #c7d2fe;
        font-size: 13px; font-weight: 500;
        margin-bottom: 28px;
      }
      .lp-badge-dot { width: 3px; height: 3px; border-radius: 50%; background: #c7d2fe; opacity: 0.5; }
      .lp-badge-pulse { color: #34d399; position: relative; padding-left: 12px; }
      .lp-badge-pulse::before {
        content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
        width: 6px; height: 6px; border-radius: 50%; background: #34d399;
        box-shadow: 0 0 0 0 rgba(52,211,153,0.6); animation: lp-pulse 1.8s infinite;
      }
      @keyframes lp-pulse { 0% { box-shadow: 0 0 0 0 rgba(52,211,153,0.6); } 70% { box-shadow: 0 0 0 8px rgba(52,211,153,0); } 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); } }

      .lp-hero-title {
        font-size: clamp(40px, 6.5vw, 76px);
        font-weight: 800;
        line-height: 1.05;
        letter-spacing: -0.035em;
        margin-bottom: 24px;
      }
      .lp-gradient {
        background: linear-gradient(135deg, #818cf8 0%, #c084fc 50%, #f472b6 100%);
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .lp-gradient-warm {
        background: linear-gradient(135deg, #fbbf24 0%, #f472b6 50%, #f87171 100%);
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .lp-hero-sub {
        font-size: clamp(16px, 1.6vw, 19px);
        line-height: 1.6;
        color: var(--lp-text-dim);
        max-width: 680px; margin: 0 auto 36px;
      }
      .lp-hero-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
      .lp-hero-cta.center { justify-content: center; }

      .lp-hero-microproof {
        display: flex; gap: 28px; justify-content: center; flex-wrap: wrap;
        margin-top: 24px; margin-bottom: 64px;
      }
      .lp-check-row {
        display: inline-flex; align-items: center; gap: 6px;
        color: var(--lp-text-dim); font-size: 13px;
      }
      .lp-check-row svg { color: var(--lp-emerald); }

      /* ============== PREVIEW (Hero) ============== */
      .lp-preview { position: relative; max-width: 1100px; margin: 0 auto; }
      .lp-preview-glow {
        position: absolute; inset: -40px;
        background: radial-gradient(ellipse at center, rgba(99,102,241,0.35), transparent 70%);
        filter: blur(40px);
        z-index: 0;
      }
      .lp-preview-frame {
        position: relative; z-index: 1;
        background: rgba(13, 14, 22, 0.85);
        border: 1px solid var(--lp-border-strong);
        border-radius: 16px;
        overflow: hidden;
        backdrop-filter: blur(20px);
        box-shadow: 0 30px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
      }
      .lp-preview-topbar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 16px;
        background: rgba(255,255,255,0.02);
        border-bottom: 1px solid var(--lp-border);
        font-size: 12px;
      }
      .lp-dots { display: flex; gap: 6px; }
      .lp-dots span { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.18); }
      .lp-dots span:nth-child(1) { background: #ef4444; }
      .lp-dots span:nth-child(2) { background: #f59e0b; }
      .lp-dots span:nth-child(3) { background: #10b981; }
      .lp-preview-url {
        color: var(--lp-text-muted);
        background: rgba(255,255,255,0.04);
        padding: 5px 14px; border-radius: 6px;
        font-family: 'SF Mono', Menlo, monospace;
        font-size: 11px;
      }
      .lp-preview-status { display: inline-flex; align-items: center; gap: 6px; color: var(--lp-text-dim); font-size: 11px; }
      .lp-status-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #34d399;
        box-shadow: 0 0 8px #34d399;
        animation: lp-blink 2s infinite;
      }
      @keyframes lp-blink { 50% { opacity: 0.4; } }

      .lp-preview-body { display: grid; grid-template-columns: 1.4fr 1fr; min-height: 480px; }
      .lp-preview-chat { border-right: 1px solid var(--lp-border); display: flex; flex-direction: column; }
      .lp-preview-chathead {
        display: flex; align-items: center; gap: 12px;
        padding: 14px 18px; border-bottom: 1px solid var(--lp-border);
      }
      .lp-avatar {
        width: 36px; height: 36px; border-radius: 50%;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        display: grid; place-items: center;
        color: #fff; font-weight: 700; font-size: 13px;
        flex-shrink: 0;
      }
      .lp-chat-name { font-weight: 600; font-size: 14px; }
      .lp-chat-meta { display: flex; align-items: center; gap: 4px; color: var(--lp-text-muted); font-size: 11px; margin-top: 2px; }
      .lp-tag-hot {
        margin-left: auto;
        padding: 4px 10px; border-radius: 999px;
        background: rgba(239,68,68,0.12); color: #fca5a5;
        font-size: 11px; font-weight: 600;
        border: 1px solid rgba(239,68,68,0.25);
      }

      .lp-preview-thread {
        flex: 1; padding: 18px;
        display: flex; flex-direction: column; gap: 10px;
        overflow-y: auto;
        max-height: 360px;
      }
      .lp-bubble {
        max-width: 78%;
        padding: 10px 14px;
        border-radius: 14px;
        font-size: 13px;
        line-height: 1.4;
        animation: lp-bubble-in 0.4s ease;
        position: relative;
      }
      @keyframes lp-bubble-in {
        from { opacity: 0; transform: translateY(8px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .lp-bubble-in { align-self: flex-start; background: rgba(255,255,255,0.07); border: 1px solid var(--lp-border); }
      .lp-bubble-out {
        align-self: flex-end;
        background: linear-gradient(135deg, #6366f1, #7c3aed);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.1);
      }
      .lp-bubble-ai {
        align-self: center;
        background: rgba(168,85,247,0.1);
        color: #d8b4fe;
        border: 1px solid rgba(168,85,247,0.25);
        font-size: 11px;
        font-weight: 500;
        padding: 5px 12px;
      }
      .lp-bubble-time { font-size: 10px; opacity: 0.6; margin-top: 3px; }
      .lp-bubble-ai .lp-bubble-time { display: none; }

      .lp-typing { display: inline-flex; gap: 3px; padding: 10px 14px; align-self: flex-start; }
      .lp-typing span {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--lp-text-muted);
        animation: lp-bounce 1.2s infinite;
      }
      .lp-typing span:nth-child(2) { animation-delay: 0.15s; }
      .lp-typing span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes lp-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-5px); opacity: 1; } }

      .lp-preview-composer {
        display: flex; align-items: center; gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid var(--lp-border);
        background: rgba(255,255,255,0.02);
      }
      .lp-icon-btn {
        width: 32px; height: 32px; border-radius: 8px;
        background: rgba(255,255,255,0.05);
        border: 1px solid var(--lp-border);
        color: var(--lp-text-dim);
        display: grid; place-items: center;
        cursor: pointer;
      }
      .lp-fake-input {
        flex: 1; padding: 8px 14px;
        background: rgba(255,255,255,0.04);
        border-radius: 999px;
        color: var(--lp-text-muted);
        font-size: 13px;
      }
      .lp-send-btn {
        width: 32px; height: 32px; border-radius: 50%;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        color: #fff; border: none;
        display: grid; place-items: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(99,102,241,0.4);
      }

      .lp-preview-ai { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
      .lp-ai-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
      .lp-ai-head svg { color: var(--lp-accent-2); }
      .lp-ai-live { color: #34d399; font-size: 9px; animation: lp-blink 1.5s infinite; margin-left: auto; }
      .lp-ai-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .lp-metric {
        padding: 10px 12px;
        background: rgba(255,255,255,0.03);
        border: 1px solid var(--lp-border);
        border-radius: 10px;
      }
      .lp-metric-label { font-size: 10px; color: var(--lp-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
      .lp-metric-value { font-size: 16px; font-weight: 700; }
      .lp-metric-hot { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.06); }
      .lp-metric-up { border-color: rgba(52,211,153,0.3); background: rgba(52,211,153,0.06); }

      .lp-ai-section { display: flex; flex-direction: column; gap: 6px; }
      .lp-ai-label { font-size: 10px; color: var(--lp-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
      .lp-ai-suggestion {
        padding: 12px;
        background: rgba(168,85,247,0.08);
        border: 1px solid rgba(168,85,247,0.2);
        border-radius: 10px;
        font-size: 12px; line-height: 1.5;
      }
      .lp-ai-actions { display: flex; gap: 6px; flex-wrap: wrap; }
      .lp-ai-pill {
        padding: 5px 12px; border-radius: 999px;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        color: #fff; border: none; font-size: 11px; font-weight: 600; cursor: pointer;
      }
      .lp-ai-pill.ghost { background: rgba(255,255,255,0.06); border: 1px solid var(--lp-border); color: var(--lp-text-dim); }
      .lp-ai-next {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 12px;
        background: rgba(52,211,153,0.06);
        border: 1px solid rgba(52,211,153,0.2);
        border-radius: 10px;
        font-size: 12px; color: #6ee7b7;
      }

      /* ============== TRUST ============== */
      .lp-trust { padding: 56px 0 24px; border-bottom: 1px solid var(--lp-border); }
      .lp-trust-label { text-align: center; font-size: 12px; color: var(--lp-text-muted); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 28px; }
      .lp-trust-stats { display: flex; gap: 48px; justify-content: center; align-items: center; flex-wrap: wrap; }
      .lp-stat { text-align: center; }
      .lp-stat-num { font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -0.03em; background: linear-gradient(135deg, #fff 0%, #a3a8b9 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
      .lp-stat-label { font-size: 13px; color: var(--lp-text-muted); margin-top: 4px; }
      .lp-trust-divider { width: 1px; height: 36px; background: var(--lp-border); }

      /* ============== SECTIONS ============== */
      .lp-section { padding: 120px 0; position: relative; }
      .lp-section-eyebrow {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 12px; border-radius: 999px;
        background: rgba(255,255,255,0.05);
        border: 1px solid var(--lp-border);
        color: var(--lp-text-dim);
        font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;
        margin-bottom: 20px;
      }
      .lp-section-eyebrow.center { display: inline-flex; }
      .lp-section-title {
        font-size: clamp(32px, 4.5vw, 56px);
        font-weight: 800;
        line-height: 1.08;
        letter-spacing: -0.03em;
        margin-bottom: 18px;
        text-align: center;
      }
      .lp-section-title.left { text-align: left; }
      .lp-section-sub {
        font-size: 18px; line-height: 1.6;
        color: var(--lp-text-dim);
        max-width: 680px; margin: 0 auto 56px;
        text-align: center;
      }
      .lp-section-sub.left { margin-left: 0; text-align: left; }

      /* ============== PROBLEM ============== */
      .lp-problem-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
      .lp-problem-card {
        padding: 28px 24px;
        background: var(--lp-surface);
        border: 1px solid var(--lp-border);
        border-radius: 16px;
        backdrop-filter: blur(20px);
        transition: all 0.3s;
      }
      .lp-problem-card:hover { transform: translateY(-3px); border-color: var(--lp-border-strong); }
      .lp-problem-icon {
        width: 44px; height: 44px; border-radius: 12px;
        background: rgba(244,114,182,0.1);
        border: 1px solid rgba(244,114,182,0.2);
        color: #f472b6;
        display: grid; place-items: center;
        margin-bottom: 16px;
      }
      .lp-problem-card h3 { font-size: 17px; font-weight: 700; margin-bottom: 8px; }
      .lp-problem-card p { font-size: 14px; line-height: 1.6; color: var(--lp-text-dim); }

      /* ============== FEATURE GRID ============== */
      .lp-feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
      .lp-feature-card {
        position: relative; overflow: hidden;
        padding: 28px;
        background: var(--lp-surface);
        border: 1px solid var(--lp-border);
        border-radius: 16px;
        backdrop-filter: blur(20px);
        transition: all 0.3s;
      }
      .lp-feature-card:hover { transform: translateY(-3px); border-color: var(--lp-border-strong); }
      .lp-feature-icon { width: 48px; height: 48px; border-radius: 12px; display: grid; place-items: center; margin-bottom: 18px; position: relative; z-index: 1; }
      .lp-feature-card h3 { font-size: 18px; font-weight: 700; margin-bottom: 8px; position: relative; z-index: 1; }
      .lp-feature-card p { font-size: 14px; line-height: 1.6; color: var(--lp-text-dim); position: relative; z-index: 1; }
      .lp-feature-glow { position: absolute; top: -50%; right: -50%; width: 200px; height: 200px; border-radius: 50%; filter: blur(60px); opacity: 0.15; pointer-events: none; }

      .lp-tone-indigo .lp-feature-icon { background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.25); color: #818cf8; }
      .lp-tone-indigo .lp-feature-glow { background: #6366f1; }
      .lp-tone-violet .lp-feature-icon { background: rgba(168,85,247,0.12); border: 1px solid rgba(168,85,247,0.25); color: #c084fc; }
      .lp-tone-violet .lp-feature-glow { background: #a855f7; }
      .lp-tone-emerald .lp-feature-icon { background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.25); color: #34d399; }
      .lp-tone-emerald .lp-feature-glow { background: #10b981; }
      .lp-tone-orange .lp-feature-icon { background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.25); color: #fbbf24; }
      .lp-tone-orange .lp-feature-glow { background: #f59e0b; }
      .lp-tone-cyan .lp-feature-icon { background: rgba(6,182,212,0.12); border: 1px solid rgba(6,182,212,0.25); color: #22d3ee; }
      .lp-tone-cyan .lp-feature-glow { background: #06b6d4; }
      .lp-tone-pink .lp-feature-icon { background: rgba(244,114,182,0.12); border: 1px solid rgba(244,114,182,0.25); color: #f472b6; }
      .lp-tone-pink .lp-feature-glow { background: #ec4899; }
      .lp-tone-yellow .lp-feature-icon { background: rgba(250,204,21,0.12); border: 1px solid rgba(250,204,21,0.25); color: #fde047; }
      .lp-tone-yellow .lp-feature-glow { background: #eab308; }

      /* ============== AI SECTION ============== */
      .lp-ai-section-wrap { position: relative; }
      .lp-ai-orb {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 800px; height: 800px;
        background: radial-gradient(circle, rgba(168,85,247,0.18), transparent 60%);
        filter: blur(80px);
        pointer-events: none;
      }
      .lp-ai-layout {
        position: relative;
        display: grid; grid-template-columns: 1fr 1fr; gap: 64px;
        align-items: center;
      }
      .lp-ai-text .lp-section-eyebrow { color: #c4b5fd; background: rgba(168,85,247,0.1); border-color: rgba(168,85,247,0.25); }
      .lp-ai-features { display: flex; flex-direction: column; gap: 14px; margin-top: 32px; }
      .lp-ai-feature { display: flex; gap: 14px; align-items: flex-start; }
      .lp-ai-feature-icon {
        width: 32px; height: 32px; border-radius: 9px;
        background: rgba(168,85,247,0.12);
        border: 1px solid rgba(168,85,247,0.25);
        color: #c084fc;
        display: grid; place-items: center; flex-shrink: 0;
      }
      .lp-ai-feature-label { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
      .lp-ai-feature-desc { font-size: 13px; color: var(--lp-text-muted); }

      .lp-ai-card {
        background: rgba(20,22,33,0.85);
        border: 1px solid var(--lp-border-strong);
        border-radius: 20px;
        padding: 24px;
        backdrop-filter: blur(20px);
        box-shadow: 0 30px 60px rgba(0,0,0,0.4);
      }
      .lp-ai-card-head { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; margin-bottom: 18px; }
      .lp-ai-card-head svg { color: #c084fc; }
      .lp-ai-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 22px; }
      .lp-bigmetric {
        padding: 14px 16px;
        background: rgba(255,255,255,0.03);
        border: 1px solid var(--lp-border);
        border-radius: 12px;
      }
      .lp-bigmetric-label { font-size: 11px; color: var(--lp-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
      .lp-bigmetric-value { font-size: 20px; font-weight: 700; }
      .lp-bigmetric-sub { font-size: 12px; color: var(--lp-text-muted); font-weight: 400; }
      .lp-trend-up { border-color: rgba(52,211,153,0.3); background: rgba(52,211,153,0.05); }
      .lp-trend-hot { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.05); }

      .lp-ai-card-replies { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
      .lp-ai-card-label { font-size: 11px; color: var(--lp-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
      .lp-suggestion-row {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 12px 14px;
        background: rgba(168,85,247,0.06);
        border: 1px solid rgba(168,85,247,0.18);
        border-radius: 10px;
        font-size: 13px; line-height: 1.45;
      }
      .lp-suggestion-row svg { color: #c084fc; flex-shrink: 0; margin-top: 2px; }
      .lp-ai-card-foot { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--lp-text-muted); padding-top: 12px; border-top: 1px solid var(--lp-border); }
      .lp-ai-foot-chip { padding: 3px 8px; background: rgba(168,85,247,0.1); border-radius: 6px; color: #c084fc; }

      /* ============== MEETINGS ============== */
      .lp-meetings-section { position: relative; }
      .lp-meetings-orb {
        position: absolute; top: 30%; right: -10%;
        width: 700px; height: 700px;
        background: radial-gradient(circle, rgba(6,182,212,0.18), transparent 60%);
        filter: blur(80px);
        pointer-events: none;
      }
      .lp-meetings-layout {
        position: relative;
        display: grid; grid-template-columns: 1fr 1.05fr; gap: 64px;
        align-items: center;
      }
      .lp-meeting-card {
        background: rgba(20,22,33,0.85);
        border: 1px solid var(--lp-border-strong);
        border-radius: 20px;
        overflow: hidden;
        backdrop-filter: blur(20px);
        box-shadow: 0 30px 60px rgba(0,0,0,0.4);
      }
      .lp-meeting-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 20px;
        background: rgba(255,255,255,0.02);
        border-bottom: 1px solid var(--lp-border);
      }
      .lp-meeting-gcal {
        display: inline-flex; align-items: center; gap: 8px;
        font-size: 13px; font-weight: 600;
        color: var(--lp-text);
      }
      .lp-meeting-status {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 11.5px; color: var(--lp-text-dim);
      }
      .lp-meeting-body { padding: 22px; }
      .lp-meeting-title { font-size: 18px; font-weight: 800; letter-spacing: -0.015em; margin-bottom: 8px; color: #fff; }
      .lp-meeting-when {
        display: inline-flex; align-items: center; gap: 8px;
        font-size: 13px; color: var(--lp-text-dim);
        padding: 6px 12px;
        background: rgba(99,102,241,0.10);
        border: 1px solid rgba(99,102,241,0.22);
        border-radius: 999px;
        margin-bottom: 18px;
      }
      .lp-meeting-meet {
        display: flex; align-items: center; gap: 12px;
        padding: 13px 14px;
        background: rgba(26, 115, 232, 0.08);
        border: 1px solid rgba(26, 115, 232, 0.25);
        border-radius: 12px;
        margin-bottom: 16px;
      }
      .lp-meet-icon {
        width: 36px; height: 36px;
        border-radius: 9px;
        background: #1a73e8;
        color: #fff;
        display: grid; place-items: center;
      }
      .lp-meet-info { flex: 1; min-width: 0; }
      .lp-meet-label { font-size: 11px; color: #93c5fd; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
      .lp-meet-link { font-size: 13px; color: var(--lp-text); font-family: 'SF Mono', Menlo, monospace; word-break: break-all; }
      .lp-meet-join {
        padding: 8px 16px;
        background: #1a73e8;
        color: #fff;
        border: none; border-radius: 8px;
        font-size: 12.5px; font-weight: 700;
        cursor: pointer;
        font-family: inherit;
        box-shadow: 0 4px 12px rgba(26,115,232,0.4);
      }

      .lp-meeting-attendees {
        display: flex; flex-direction: column; gap: 6px;
        padding: 10px 14px;
        background: rgba(255,255,255,0.03);
        border: 1px solid var(--lp-border);
        border-radius: 10px;
        margin-bottom: 16px;
      }
      .lp-attendee {
        display: flex; align-items: center; gap: 10px;
        font-size: 12.5px; color: var(--lp-text-dim);
      }
      .lp-attendee-dot { width: 7px; height: 7px; border-radius: 50%; }
      .lp-att-host { background: #818cf8; box-shadow: 0 0 6px #818cf8; }
      .lp-att-guest { background: #34d399; box-shadow: 0 0 6px #34d399; }
      .lp-attendee-role { margin-left: auto; font-size: 10.5px; color: var(--lp-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }

      .lp-meeting-actions { display: flex; flex-wrap: wrap; gap: 6px; }
      .lp-meeting-action-chip {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 10px;
        background: rgba(52,211,153,0.08);
        border: 1px solid rgba(52,211,153,0.22);
        border-radius: 999px;
        font-size: 11px; color: #6ee7b7;
        font-weight: 500;
      }

      .lp-meetings-text .lp-section-eyebrow { background: rgba(6,182,212,0.1); border-color: rgba(6,182,212,0.25); color: #67e8f9; }
      .lp-meeting-bullets { display: flex; flex-direction: column; gap: 14px; margin-top: 28px; }
      .lp-meeting-bullet { display: flex; gap: 14px; align-items: flex-start; }
      .lp-mb-icon {
        width: 36px; height: 36px;
        border-radius: 9px;
        display: grid; place-items: center;
        flex-shrink: 0;
      }
      .lp-mb-google { background: rgba(26,115,232,0.12); border: 1px solid rgba(26,115,232,0.28); }
      .lp-mb-calendly { background: rgba(0,107,255,0.12); border: 1px solid rgba(0,107,255,0.28); color: #93c5fd; }
      .lp-mb-emerald { background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.28); color: #6ee7b7; }
      .lp-mb-title { font-weight: 700; font-size: 14.5px; color: #fff; margin-bottom: 2px; }
      .lp-mb-desc { font-size: 13px; color: var(--lp-text-muted); line-height: 1.5; }

      /* ============== HUDDLE ============== */
      .lp-huddle-section { position: relative; }
      .lp-huddle-layout {
        display: grid; grid-template-columns: 1fr 1.1fr; gap: 64px;
        align-items: center;
      }
      .lp-huddle-text .lp-section-eyebrow { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.25); color: #86efac; }
      .lp-huddle-bullets { display: flex; flex-direction: column; gap: 12px; margin-top: 28px; }
      .lp-huddle-bullet {
        display: inline-flex; align-items: center; gap: 10px;
        font-size: 14.5px; color: var(--lp-text-dim);
      }
      .lp-huddle-bullet svg { color: #34d399; flex-shrink: 0; }

      .lp-huddle-card {
        background: rgba(11,13,22,0.95);
        border: 1px solid var(--lp-border-strong);
        border-radius: 20px;
        overflow: hidden;
        backdrop-filter: blur(20px);
        box-shadow: 0 30px 60px rgba(0,0,0,0.5);
      }
      .lp-huddle-grid {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: 6px;
        padding: 6px;
        background: #000;
      }
      .lp-htile {
        position: relative;
        aspect-ratio: 4 / 3;
        border-radius: 12px;
        overflow: hidden;
        background: #0a0c14;
        border: 1px solid rgba(255,255,255,0.06);
      }
      .lp-htile.speaking { border-color: rgba(99,102,241,0.55); box-shadow: 0 0 0 2px rgba(99,102,241,0.25); }
      .lp-htile-video, .lp-htile-noVideo {
        position: absolute; inset: 0;
        display: grid; place-items: center;
      }
      .lp-htile-noVideo { background: #14161f; }
      .lp-htile-avatar {
        width: 36px; height: 36px;
        border-radius: 50%;
        display: grid; place-items: center;
        color: #fff; font-weight: 700; font-size: 13px;
      }
      .lp-htile-avatar.lg { width: 50px; height: 50px; font-size: 16px; }
      .lp-htile-foot {
        position: absolute; bottom: 6px; left: 6px;
        display: inline-flex; align-items: center; gap: 6px;
        padding: 3px 9px;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(6px);
        border-radius: 6px;
        font-size: 11px; color: #fff;
      }
      .lp-htile-mute { color: #f87171; }
      .lp-htile-pulse {
        width: 6px; height: 6px; border-radius: 50%;
        background: #34d399;
        box-shadow: 0 0 0 0 rgba(52,211,153,0.6);
        animation: lp-pulse 1.5s infinite;
      }
      .lp-huddle-toolbar {
        display: flex; justify-content: center; gap: 8px;
        padding: 14px;
        background: rgba(255,255,255,0.02);
        border-top: 1px solid var(--lp-border);
      }
      .lp-huddle-btn {
        width: 38px; height: 38px;
        border-radius: 50%;
        background: rgba(255,255,255,0.08);
        color: var(--lp-text);
        border: 1px solid var(--lp-border);
        cursor: pointer;
        display: grid; place-items: center;
        font-family: inherit;
      }
      .lp-huddle-btn:hover { background: rgba(255,255,255,0.14); }
      .lp-huddle-btn.lp-huddle-end {
        width: auto;
        padding: 0 16px;
        border-radius: 999px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: #fff;
        font-size: 13px; font-weight: 700;
        border: none;
        box-shadow: 0 4px 14px rgba(239,68,68,0.45);
      }

      /* ============== INTEGRATIONS ============== */
      .lp-int-section { position: relative; }
      .lp-int-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 14px;
      }
      .lp-int-card {
        display: flex; align-items: center; gap: 14px;
        padding: 18px 20px;
        background: var(--lp-surface);
        border: 1px solid var(--lp-border);
        border-radius: 14px;
        backdrop-filter: blur(20px);
        transition: all 0.25s;
      }
      .lp-int-card:hover {
        transform: translateY(-2px);
        border-color: var(--c);
        box-shadow: 0 12px 28px rgba(0,0,0,0.3), 0 0 18px color-mix(in srgb, var(--c) 25%, transparent);
      }
      .lp-int-icon {
        width: 38px; height: 38px;
        border-radius: 10px;
        background: color-mix(in srgb, var(--c) 13%, transparent);
        border: 1px solid color-mix(in srgb, var(--c) 32%, transparent);
        color: var(--c);
        display: grid; place-items: center;
        flex-shrink: 0;
      }
      .lp-int-name { font-weight: 700; font-size: 14px; color: var(--lp-text); }
      .lp-int-desc { font-size: 12.5px; color: var(--lp-text-muted); line-height: 1.45; margin-top: 2px; }

      /* ============== PLATFORM ============== */
      .lp-platforms-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
      .lp-platform-card {
        text-align: center;
        padding: 32px 20px;
        background: var(--lp-surface);
        border: 1px solid var(--lp-border);
        border-radius: 16px;
        transition: all 0.3s;
        backdrop-filter: blur(20px);
      }
      .lp-platform-card:hover { transform: translateY(-3px); border-color: var(--c); box-shadow: 0 14px 32px rgba(0,0,0,0.4), 0 0 24px color-mix(in srgb, var(--c) 25%, transparent); }
      .lp-platform-icon {
        width: 56px; height: 56px; border-radius: 14px;
        background: color-mix(in srgb, var(--c) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
        color: var(--c);
        display: grid; place-items: center;
        margin: 0 auto 16px;
      }
      .lp-platform-name { font-weight: 700; font-size: 16px; margin-bottom: 6px; }
      .lp-platform-desc { font-size: 13px; color: var(--lp-text-muted); line-height: 1.5; }

      /* ============== HOW ============== */
      .lp-how-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; max-width: 1000px; margin: 0 auto; }
      .lp-how-card {
        padding: 32px 28px;
        background: var(--lp-surface);
        border: 1px solid var(--lp-border);
        border-radius: 18px;
        backdrop-filter: blur(20px);
        position: relative;
        overflow: hidden;
      }
      .lp-how-step {
        position: absolute; top: -8px; right: 8px;
        font-size: 64px; font-weight: 900;
        background: linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.04));
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: -0.05em;
      }
      .lp-how-icon {
        width: 48px; height: 48px; border-radius: 12px;
        background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.1));
        border: 1px solid rgba(99,102,241,0.25);
        color: #818cf8;
        display: grid; place-items: center;
        margin-bottom: 18px;
        position: relative; z-index: 1;
      }
      .lp-how-card h3 { font-size: 18px; font-weight: 700; margin-bottom: 8px; position: relative; z-index: 1; }
      .lp-how-card p { font-size: 14px; line-height: 1.6; color: var(--lp-text-dim); position: relative; z-index: 1; }

      /* ============== DASHBOARD SHOWCASE ============== */
      .lp-dashboard-card {
        background: rgba(13,14,22,0.85);
        border: 1px solid var(--lp-border-strong);
        border-radius: 16px;
        overflow: hidden;
        backdrop-filter: blur(20px);
        box-shadow: 0 30px 80px rgba(0,0,0,0.5);
      }
      .lp-dash-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 1fr;
        gap: 14px;
        padding: 22px;
      }
      .lp-dashstat {
        padding: 16px;
        background: rgba(255,255,255,0.03);
        border: 1px solid var(--lp-border);
        border-radius: 12px;
      }
      .lp-dashstat-label { font-size: 11px; color: var(--lp-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
      .lp-dashstat-value { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
      .lp-dashstat-delta { font-size: 12px; color: var(--lp-emerald); margin-top: 4px; font-weight: 500; }

      .lp-dash-wide { grid-column: 1 / 3; padding: 16px; background: rgba(255,255,255,0.02); border: 1px solid var(--lp-border); border-radius: 12px; }
      .lp-dash-side { grid-column: 3 / 5; padding: 16px; background: rgba(255,255,255,0.02); border: 1px solid var(--lp-border); border-radius: 12px; display: flex; flex-direction: column; gap: 10px; }
      .lp-dash-section-head { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--lp-text-dim); margin-bottom: 12px; }
      .lp-spark { width: 100%; height: 120px; }

      .lp-pipe-row { display: grid; grid-template-columns: 90px 1fr 30px; gap: 10px; align-items: center; font-size: 12px; }
      .lp-pipe-label { color: var(--lp-text-dim); }
      .lp-pipe-track { height: 6px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
      .lp-pipe-fill { height: 100%; border-radius: 999px; }
      .lp-pipe-val { text-align: right; font-weight: 600; color: var(--lp-text); }

      /* ============== TEAM ============== */
      .lp-team-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; }
      .lp-team-points { display: flex; flex-direction: column; gap: 14px; margin-top: 32px; }
      .lp-team-point { display: flex; gap: 12px; align-items: flex-start; }
      .lp-team-point svg { color: var(--lp-emerald); flex-shrink: 0; margin-top: 2px; }
      .lp-team-point-label { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
      .lp-team-point-desc { font-size: 13px; color: var(--lp-text-muted); }

      .lp-team-card {
        background: rgba(20,22,33,0.85);
        border: 1px solid var(--lp-border-strong);
        border-radius: 20px;
        overflow: hidden;
        backdrop-filter: blur(20px);
        box-shadow: 0 30px 60px rgba(0,0,0,0.4);
      }
      .lp-team-card-head {
        display: flex; align-items: center; gap: 8px;
        padding: 16px 20px;
        background: rgba(255,255,255,0.02);
        border-bottom: 1px solid var(--lp-border);
        font-size: 13px; font-weight: 600; color: var(--lp-text-dim);
      }
      .lp-team-member {
        display: flex; align-items: center; gap: 12px;
        padding: 14px 20px;
        border-bottom: 1px solid var(--lp-border);
      }
      .lp-team-member:last-child { border-bottom: none; }
      .lp-team-info { flex: 1; }
      .lp-team-name { font-weight: 600; font-size: 14px; }
      .lp-team-role { font-size: 12px; color: var(--lp-text-muted); margin-top: 2px; }
      .lp-team-count { font-size: 13px; color: var(--lp-text-dim); font-weight: 500; }

      /* ============== TESTIMONIALS ============== */
      .lp-test-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; margin-top: 48px; }
      .lp-test-card {
        padding: 28px;
        background: var(--lp-surface);
        border: 1px solid var(--lp-border);
        border-radius: 16px;
        backdrop-filter: blur(20px);
      }
      .lp-stars { display: flex; gap: 2px; margin-bottom: 16px; }
      .lp-test-card p { font-size: 15px; line-height: 1.6; color: var(--lp-text); margin-bottom: 16px; }
      .lp-test-name { font-size: 13px; color: var(--lp-text-muted); }

      /* ============== PRICING ============== */
      .lp-pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; }
      .lp-pricing-4col { grid-template-columns: repeat(4, 1fr); gap: 16px; }
      @media (max-width: 1180px) { .lp-pricing-4col { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 620px)  { .lp-pricing-4col { grid-template-columns: 1fr; } }
      .lp-price-foot { text-align: center; font-size: 13px; color: var(--lp-text-muted); margin-top: 32px; max-width: 620px; margin-left: auto; margin-right: auto; }
      /* LOCKED ROW — visually dominant. Red-tint, sharp lock icon, plan pill on the right. */
      .lp-price-li-locked {
        position: relative;
        padding: 7px 12px 7px 10px;
        margin-left: -12px;
        margin-right: -12px;
        border-radius: 8px;
        background: linear-gradient(90deg, rgba(239,68,68,0.06) 0%, rgba(239,68,68,0.02) 70%, transparent 100%);
        border: 1px solid rgba(239,68,68,0.18);
        color: rgba(255,255,255,0.55);
        cursor: help;
        transition: all 0.18s ease;
        gap: 9px !important;
      }
      .lp-price-li-locked .lp-price-li-text {
        text-decoration: line-through;
        text-decoration-color: rgba(239,68,68,0.45);
        text-decoration-thickness: 1.5px;
      }
      .lp-price-li-locked .lp-price-li-lock-icon {
        color: #ef4444 !important;
        flex-shrink: 0;
      }
      .lp-price-li-locked:hover {
        background: linear-gradient(90deg, rgba(239,68,68,0.14) 0%, rgba(239,68,68,0.06) 100%);
        border-color: rgba(239,68,68,0.35);
        color: var(--lp-text);
      }
      .lp-price-li-locked:hover .lp-price-li-text { text-decoration-color: rgba(239,68,68,0.7); }
      .lp-price-li-plan-pill {
        margin-left: auto;
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 0.06em;
        padding: 3px 8px;
        border-radius: 5px;
        background: linear-gradient(135deg, #A78BFA 0%, #EC4899 100%);
        color: white;
        text-transform: uppercase;
        white-space: nowrap;
        flex-shrink: 0;
        box-shadow: 0 2px 8px -2px rgba(167,139,250,0.5);
      }
      .lp-price-li-text { flex: 1; }
      .lp-price-list li { gap: 10px; }
      /* HIGHLIGHTED ROW — the Flux feature on Growth/Enterprise. */
      .lp-price-li-highlight {
        position: relative;
        font-weight: 700;
        padding: 8px 12px 8px 10px;
        margin-left: -12px;
        margin-right: -12px;
        border-radius: 10px;
        background: linear-gradient(135deg, rgba(167,139,250,0.10) 0%, rgba(34,211,238,0.08) 50%, rgba(236,72,153,0.10) 100%);
        border: 1px solid rgba(34,211,238,0.20);
        background-clip: padding-box;
      }
      .lp-price-li-highlight svg {
        color: #22D3EE !important;
        filter: drop-shadow(0 0 4px rgba(34,211,238,0.5));
      }
      .lp-price-li-highlight .lp-price-li-text { flex: 1; }
      .lp-price-li-highlight::after {
        content: 'NEW';
        margin-left: auto;
        font-size: 9px;
        font-weight: 900;
        letter-spacing: 0.08em;
        padding: 2px 6px;
        border-radius: 4px;
        background: linear-gradient(135deg, #A78BFA, #EC4899);
        color: white;
      }

      /* CURRENT PLAN — card emphasis when the authed user is on this tier. */
      .lp-price-current {
        border-color: rgba(34,197,94,0.45) !important;
        box-shadow: 0 0 0 1px rgba(34,197,94,0.35), 0 18px 50px -22px rgba(34,197,94,0.35);
      }
      .lp-price-current-badge {
        position: absolute;
        top: -12px;
        left: 50%;
        transform: translateX(-50%);
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        background: linear-gradient(135deg, #16a34a, #22c55e);
        color: white;
        border-radius: 999px;
        box-shadow: 0 8px 22px -6px rgba(34,197,94,0.55);
        z-index: 2;
      }
      .lp-btn-current {
        background: rgba(34,197,94,0.14);
        color: #4ade80;
        border: 1px solid rgba(34,197,94,0.4);
        font-weight: 700;
        cursor: default;
        text-align: center;
        justify-content: center;
      }
      .lp-btn-glass-quiet {
        background: rgba(255,255,255,0.03);
        color: var(--lp-text-dim);
        border: 1px solid rgba(255,255,255,0.06);
      }
      .lp-btn-glass-quiet:hover {
        background: rgba(255,255,255,0.06);
        color: var(--lp-text);
        border-color: rgba(255,255,255,0.12);
      }

      /* "You're on the X plan" banner above the pricing grid */
      .lp-current-plan-banner {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        margin: 0 auto 32px;
        background: linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04));
        border: 1px solid rgba(34,197,94,0.32);
        border-radius: 999px;
        color: var(--lp-text);
        font-size: 13px;
        font-weight: 500;
      }
      .lp-current-plan-banner svg { color: #4ade80; }
      .lp-current-plan-banner strong {
        font-weight: 800;
        background: linear-gradient(135deg, #4ade80, #22c55e);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .lp-current-plan-link {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        margin-left: 4px;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        color: var(--lp-text);
        font-size: 11.5px;
        font-weight: 600;
        text-decoration: none;
        transition: background 0.15s;
      }
      .lp-current-plan-link:hover { background: rgba(255,255,255,0.12); }

      /* center the banner via its parent — wrap in a flex row */
      .lp-pricing > .lp-container > .lp-current-plan-banner,
      .lp-pricing .lp-current-plan-banner {
        display: flex;
        width: fit-content;
        margin-left: auto;
        margin-right: auto;
      }
      .lp-price-card {
        padding: 36px 28px;
        background: var(--lp-surface);
        border: 1px solid var(--lp-border);
        border-radius: 18px;
        backdrop-filter: blur(20px);
        display: flex; flex-direction: column;
        position: relative;
        transition: all 0.3s;
      }
      .lp-price-card:hover { transform: translateY(-3px); }
      .lp-price-featured {
        border: 1px solid rgba(99,102,241,0.4);
        background: linear-gradient(180deg, rgba(99,102,241,0.08), rgba(168,85,247,0.04));
        box-shadow: 0 20px 60px rgba(99,102,241,0.2);
      }
      .lp-price-ribbon {
        position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
        background: linear-gradient(135deg, #6366f1, #a855f7);
        color: #fff; font-size: 11px; font-weight: 700;
        padding: 5px 12px; border-radius: 999px;
        text-transform: uppercase; letter-spacing: 0.08em;
        box-shadow: 0 8px 20px rgba(99,102,241,0.4);
      }
      .lp-price-tier { font-size: 14px; font-weight: 600; color: var(--lp-text-dim); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
      .lp-price-amount { font-size: 44px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
      .lp-price-amount span { font-size: 16px; color: var(--lp-text-muted); font-weight: 500; }
      .lp-price-period { font-size: 13px; color: var(--lp-text-muted); margin-top: 4px; margin-bottom: 24px; }
      .lp-price-list { list-style: none; padding: 0; margin: 0 0 28px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
      .lp-price-list li { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--lp-text-dim); }
      .lp-price-list li svg { color: var(--lp-emerald); flex-shrink: 0; }

      /* ============== FAQ ============== */
      .lp-faq-inner { max-width: 720px; margin: 0 auto; }
      .lp-faq-list { display: flex; flex-direction: column; gap: 10px; margin-top: 32px; }
      .lp-faq-item {
        background: var(--lp-surface);
        border: 1px solid var(--lp-border);
        border-radius: 12px;
        overflow: hidden;
        transition: all 0.2s;
      }
      .lp-faq-item.open { border-color: var(--lp-border-strong); }
      .lp-faq-q {
        width: 100%;
        background: none; border: none; color: var(--lp-text);
        display: flex; align-items: center; justify-content: space-between; gap: 16px;
        padding: 20px 24px;
        font-size: 15px; font-weight: 600; text-align: left;
        cursor: pointer;
      }
      .lp-faq-q svg { transition: transform 0.2s; color: var(--lp-text-muted); flex-shrink: 0; }
      .lp-faq-item.open .lp-faq-q svg { transform: rotate(180deg); }
      .lp-faq-a {
        max-height: 0; overflow: hidden;
        transition: max-height 0.3s ease, padding 0.3s ease;
      }
      .lp-faq-item.open .lp-faq-a { max-height: 200px; padding: 0 24px 20px; }
      .lp-faq-a p { font-size: 14px; line-height: 1.65; color: var(--lp-text-dim); }

      /* ============== FINAL CTA ============== */
      .lp-final { padding-bottom: 100px; }
      .lp-final-card {
        position: relative; overflow: hidden;
        padding: 80px 40px;
        background: linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.08));
        border: 1px solid rgba(99,102,241,0.3);
        border-radius: 24px;
        text-align: center;
        backdrop-filter: blur(20px);
      }
      .lp-final-glow {
        position: absolute; inset: -50% -20%;
        background: radial-gradient(ellipse at center, rgba(168,85,247,0.25), transparent 60%);
        filter: blur(60px); pointer-events: none;
      }
      .lp-final-title { position: relative; font-size: clamp(28px, 4.5vw, 48px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; margin-bottom: 16px; }
      .lp-final-sub { position: relative; font-size: 17px; color: var(--lp-text-dim); max-width: 560px; margin: 0 auto 32px; line-height: 1.6; }

      /* ============== FOOTER ============== */
      .lp-footer { position: relative; z-index: 1; border-top: 1px solid var(--lp-border); padding-top: 56px; margin-top: 40px; }
      .lp-footer-inner { display: grid; grid-template-columns: 1.4fr 2fr; gap: 56px; padding-bottom: 48px; }
      .lp-footer-brand p { font-size: 13px; color: var(--lp-text-muted); margin-top: 14px; line-height: 1.6; max-width: 280px; }
      .lp-footer-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
      .lp-footer-col-head { font-size: 12px; font-weight: 600; color: var(--lp-text); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 14px; }
      .lp-footer-cols a { display: block; font-size: 14px; color: var(--lp-text-dim); padding: 5px 0; transition: color 0.15s; }
      .lp-footer-cols a:hover { color: var(--lp-text); }
      .lp-footer-status { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--lp-text-dim); }
      .lp-footer-bottom { border-top: 1px solid var(--lp-border); padding: 22px 0; }
      .lp-footer-bottom-row { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: var(--lp-text-muted); }
      .lp-footer-mini { display: flex; gap: 18px; }
      .lp-footer-mini a:hover { color: var(--lp-text); }

      /* ============== REVEAL ============== */
      .lp-reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.7s ease, transform 0.7s ease; }
      .lp-reveal.in { opacity: 1; transform: translateY(0); }

      /* ============== RESPONSIVE ============== */
      @media (max-width: 960px) {
        .lp-nav-links { display: none; }
        .lp-nav-cta { display: none; }
        .lp-mobile-toggle { display: inline-flex; }
        .lp-mobile-menu { display: flex; }
        .lp-preview-body { grid-template-columns: 1fr; }
        .lp-preview-chat { border-right: none; border-bottom: 1px solid var(--lp-border); }
        .lp-preview-thread { max-height: 280px; }
        .lp-ai-layout { grid-template-columns: 1fr; gap: 32px; }
        .lp-meetings-layout { grid-template-columns: 1fr; gap: 32px; }
        .lp-huddle-layout { grid-template-columns: 1fr; gap: 32px; }
        .lp-team-layout { grid-template-columns: 1fr; gap: 32px; }
        .lp-section-title.left, .lp-section-sub.left { text-align: center; }
        .lp-dash-grid { grid-template-columns: 1fr 1fr; }
        .lp-dash-wide, .lp-dash-side { grid-column: 1 / 3; }
        .lp-footer-inner { grid-template-columns: 1fr; gap: 32px; }
        .lp-footer-cols { grid-template-columns: 1fr 1fr 1fr; }
        .lp-section { padding: 80px 0; }
        .lp-hero { padding: 120px 0 60px; }
      }
      @media (max-width: 600px) {
        .lp-trust-stats { gap: 24px; }
        .lp-trust-divider { display: none; }
        .lp-hero-microproof { gap: 12px; }
        .lp-footer-cols { grid-template-columns: 1fr 1fr; }
        .lp-footer-bottom-row { flex-direction: column; gap: 10px; }
        .lp-final-card { padding: 56px 24px; }
        .lp-dash-grid { grid-template-columns: 1fr; }
        .lp-dash-wide, .lp-dash-side { grid-column: 1 / 2; }
      }
    `}</style>
  );
}
