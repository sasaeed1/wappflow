'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  Zap, ArrowRight, Check, Sparkles, MessageCircle, Brain, Users,
  BarChart3, Shield, Globe, Bot, Send, Mic, Image as ImageIcon,
  FileText, Bell, Workflow, Star, ChevronDown, Menu, X, Play,
  Inbox, Tag, Calendar, CreditCard, Layers, Rocket, Lock, TrendingUp,
  Phone, Instagram, Facebook, Mail, Database, Activity, Target,
  Languages, Wand2, GitBranch, CheckCircle2,
} from 'lucide-react';

/* ========================================================================== */
/* LANDING PAGE — WappFlow                                                    */
/* ========================================================================== */

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    try {
      const t = localStorage.getItem('token');
      if (t) setAuthed(true);
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
        <PlatformSection />
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
          <a href="#platforms">Platforms</a>
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
          <a href="#platforms" onClick={() => setMobileOpen(false)}>Platforms</a>
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
            <span>AI-native CRM for WhatsApp</span>
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
            WappFlow is the AI-powered CRM built around the way modern teams actually sell — on WhatsApp,
            Instagram, Facebook, and your website. One inbox. One brain. Zero leads slipping through.
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
              <button className="lp-icon-btn"><ImageIcon size={15} /></button>
              <button className="lp-icon-btn"><Mic size={15} /></button>
              <div className="lp-fake-input">Type a message…</div>
              <button className="lp-send-btn"><Send size={14} /></button>
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
          <Stat number="150+" label="API endpoints" />
          <Divider />
          <Stat number="4" label="Platforms unified" />
          <Divider />
          <Stat number="3s" label="Avg reply suggestion" />
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
      icon: <Bell size={22} />,
      title: 'Real-time everything',
      desc: 'Server-Sent Events stream new messages, status changes, and reminders instantly to your team.',
      tone: 'yellow',
    },
    {
      icon: <BarChart3 size={22} />,
      title: 'Reports that matter',
      desc: 'Revenue trends, conversion funnels, per-rep performance. Export to CSV in one click.',
      tone: 'indigo',
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
            One platform. <span className="lp-gradient">Nine superpowers.</span>
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
/* PLATFORM SECTION                                                           */
/* ========================================================================== */

function PlatformSection() {
  const platforms = [
    { icon: <MessageCircle size={22} />, name: 'WhatsApp',  desc: 'Multi-account, voice notes, media, groups.', color: '#25D366' },
    { icon: <Instagram size={22} />,     name: 'Instagram', desc: 'DMs and comments via webhook.',             color: '#E1306C' },
    { icon: <Facebook size={22} />,      name: 'Facebook',  desc: 'Messenger + lead form submissions.',         color: '#1877F2' },
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

function Pricing({ authed }) {
  return (
    <section id="pricing" className="lp-section lp-pricing">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-eyebrow">Pricing</div>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="lp-section-title">
            One plan. <span className="lp-gradient">Everything included.</span>
          </h2>
        </Reveal>
        <Reveal delay={140}>
          <p className="lp-section-sub">
            {`No usage tiers. No "AI add-on". No per-seat gotchas. Just one price for the whole platform.`}
          </p>
        </Reveal>

        <div className="lp-pricing-grid">
          <Reveal delay={120}>
            <div className="lp-price-card">
              <div className="lp-price-tier">Starter</div>
              <div className="lp-price-amount">Free</div>
              <div className="lp-price-period">for early access</div>
              <PriceList items={[
                'Up to 3 team members',
                '1 WhatsApp account',
                'Full AI suite',
                'Unlimited leads',
                'Self-hosted',
              ]} />
              <Link href="/signup" className="lp-btn lp-btn-glass lp-btn-block">Start free</Link>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="lp-price-card lp-price-featured">
              <div className="lp-price-ribbon">Most popular</div>
              <div className="lp-price-tier">Growth</div>
              <div className="lp-price-amount">$49<span>/mo</span></div>
              <div className="lp-price-period">billed monthly · cancel anytime</div>
              <PriceList items={[
                'Unlimited team members',
                'Unlimited WhatsApp accounts',
                'Multi-platform inbox',
                'Full AI engine + knowledge base',
                'Invoicing + reports',
                'Email integrations (SMTP/IMAP)',
                'Priority support',
              ]} />
              <Link href={authed ? '/dashboard' : '/signup'} className="lp-btn lp-btn-primary lp-btn-block">
                {authed ? 'Open Dashboard' : 'Start 14-day trial'} <ArrowRight size={16} />
              </Link>
            </div>
          </Reveal>

          <Reveal delay={280}>
            <div className="lp-price-card">
              <div className="lp-price-tier">Enterprise</div>
              <div className="lp-price-amount">Custom</div>
              <div className="lp-price-period">for 25+ agents</div>
              <PriceList items={[
                'Everything in Growth',
                'Dedicated infrastructure',
                'SSO + advanced security',
                'Custom integrations',
                'SLA + onboarding',
                'Bring your own LLM keys',
              ]} />
              <a href="mailto:sales@wappflow.app" className="lp-btn lp-btn-glass lp-btn-block">Talk to sales</a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function PriceList({ items }) {
  return (
    <ul className="lp-price-list">
      {items.map((it, i) => (
        <li key={i}><Check size={14} /> {it}</li>
      ))}
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
      .lp-pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
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
