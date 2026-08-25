'use client';

/* ==========================================================================
   WappFlow — landing page.

   Rebuilt from scratch. The organising idea is the thing the product actually
   does that a stack of separate tools cannot: one conversation becomes a lead,
   a signed contract, an invoice, a project, a booking and a delivery, with
   each step creating the next. The page is built around demonstrating that
   chain rather than listing features beside it.

   POSITIONING (2026-08-25): WappFlow is presented CRM-FIRST. The CRM — leads,
   conversations, pipeline, timeline, AI, team — is the core; everything else
   (contracts, booking, payments, portals, Media Studio…) is a module around
   it. Media Studio stays showcased, but as ONE module, never the identity.
   Platform-level copy stays industry-agnostic; vertical language belongs only
   inside module-scoped content and the worked example in the hero demo.

   Ground rules for anything added here:
     • Only claim what ships. Parked and beta work is labelled as such.
     • Prices come from GET /api/plans, so the site and the in-app Plan tab
       can never disagree. The constants below are the offline fallback.
     • Mock UI is decorative: aria-hidden + tabIndex={-1}, never a fake control
       a keyboard user can land on. Real controls are real buttons with names.

   Styles live in components/landing/LandingStyles.js.
   ========================================================================== */

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Zap, ArrowRight, Check, CheckCircle2, Sparkles, MessageCircle, Brain, Users,
  Shield, ShieldCheck, Globe, Send, FileText, Workflow, ChevronDown,
  Menu, X, Inbox, Calendar, CreditCard, Layers, Lock, TrendingUp, Camera,
  MessageSquare, Mail, Database, Target, Wand2, Video,
  Palette, Images, Crown, Star, Mic, Instagram, Facebook, Globe2, PenLine,
  Receipt, ShoppingBag, Aperture, HardDrive, ScrollText, RefreshCw,
  Smartphone, Monitor, FolderOpen, Eye, KeyRound, Wallet, BadgeCheck,
  Timer, Share2, Bell,
} from 'lucide-react';

import LandingStyles from '@/components/landing/LandingStyles';
import { FLUX_PARKED } from '@/lib/flux';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/* ────────────────────────────── scroll reveal ─────────────────────────── */

function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No observer support, or motion turned down — show it and move on.
    if (typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); obs.disconnect(); } },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`lp-reveal ${shown ? 'shown' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function SectionHead({ eyebrow, icon: Icon, title, sub }) {
  return (
    <div className="lp-section-head">
      <Reveal>
        <div className="lp-section-eyebrow">{Icon && <Icon size={13} />}{eyebrow}</div>
      </Reveal>
      <Reveal delay={70}><h2 className="lp-section-title">{title}</h2></Reveal>
      {sub && <Reveal delay={130}><p className="lp-section-sub">{sub}</p></Reveal>}
    </div>
  );
}

/* ══════════════════════════════════ NAV ══════════════════════════════════ */

const NAV = [
  { href: '#chain', label: 'How it works' },
  { href: '#modules', label: 'Platform' },
  { href: '#ai', label: 'AI' },
  { href: '#security', label: 'Security' },
  { href: '#pricing', label: 'Pricing' },
];

function Nav({ authed }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="lp-container lp-nav-inner">
        <Link href="/" className="lp-brand">
          <span className="lp-brand-mark"><Zap size={17} fill="currentColor" /></span>
          WappFlow
        </Link>

        <div className="lp-nav-links">
          {NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
        </div>

        <div className="lp-nav-cta">
          {authed ? (
            <Link href="/dashboard" className="lp-btn lp-btn-primary">
              Open WappFlow <ArrowRight size={15} />
            </Link>
          ) : (
            <>
              <Link href="/login" className="lp-btn lp-btn-ghost">Sign in</Link>
              <Link href="/signup" className="lp-btn lp-btn-primary">
                Start free <ArrowRight size={15} />
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="lp-mobile-toggle"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <div className={`lp-mobile-menu ${open ? 'open' : ''}`}>
        {NAV.map((n) => (
          <a key={n.href} href={n.href} onClick={() => setOpen(false)}>{n.label}</a>
        ))}
        <div className="lp-mobile-cta">
          {authed ? (
            <Link href="/dashboard" className="lp-btn lp-btn-primary lp-btn-block">Open WappFlow</Link>
          ) : (
            <>
              <Link href="/login" className="lp-btn lp-btn-ghost lp-btn-block">Sign in</Link>
              <Link href="/signup" className="lp-btn lp-btn-primary lp-btn-block">Start free</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════════════ HERO — the chain, demonstrated ═══════════════════ */

const T = (t) => <span className="lp-bubble-time">{t}</span>;

const STAGES = [
  {
    key: 'lead',
    tab: 'A message arrives',
    bubbles: [
      { side: 'in', text: <>Hi! Do you shoot weddings in December? We need two days of coverage in Lahore.{T('10:42')}</> },
    ],
    artifacts: [
      { icon: Users, title: 'Lead created', tag: 'AUTOMATIC',
        body: 'Ayesha Malik · WhatsApp · captured from the message itself. No form to fill in, nothing to copy across.' },
    ],
    note: 'Every WhatsApp, Instagram DM, Facebook message and website enquiry lands in one shared inbox — and becomes a lead the moment it arrives.',
  },
  {
    key: 'ai',
    tab: 'AI reads it',
    chip: 'Lead intelligence · high intent · wedding · December · 2 days',
    bubbles: [
      { side: 'in', text: <>Hi! Do you shoot weddings in December? We need two days of coverage in Lahore.{T('10:42')}</> },
      { side: 'out', text: <>Congratulations Ayesha! December books out early, and we still have two dates. Our two-day wedding coverage starts at $1,400 — shall I send the full package?{T('10:43')}</> },
    ],
    artifacts: [
      { icon: Brain, title: 'Lead scored', tag: 'AI',
        body: 'Intent, service, budget band and timeline pulled from the words the client actually used.' },
      { icon: Sparkles, title: 'Reply drafted in your voice', tag: 'AI',
        body: 'Trained on your knowledge base and past replies. You read it and press send — nothing goes out on its own.' },
      { icon: Target, title: 'Next best action', tag: 'AI',
        body: '“Send the December wedding package” — surfaced on the lead, not buried in a report.' },
    ],
    note: 'Bring your own API key if you would rather the AI ran on your account. Enterprise customers usually do.',
  },
  {
    key: 'contract',
    tab: 'Contract signed',
    bubbles: [
      { side: 'out', text: <>Here is your contract — everything we discussed, ready to review and sign.{T('11:02')}</> },
      { side: 'in', text: <>Signed! That was easy 🙌{T('11:09')}</> },
    ],
    artifacts: [
      { icon: FileText, title: 'Contract sent', tag: 'FROM TEMPLATE',
        body: 'Built from your clause library, delivered over WhatsApp and email, versioned and redline-comparable.' },
      { icon: PenLine, title: 'Signed and sealed', tag: 'AUDIT TRAIL',
        body: 'Signature, IP, device and timestamp recorded. The signed PDF is locked; every later change is a new version.' },
    ],
    note: 'The client never creates an account, never installs anything, and never leaves the thread they started in.',
  },
  {
    key: 'chain',
    tab: 'The studio catches up',
    bubbles: [
      { side: 'in', text: <>Signed! That was easy 🙌{T('11:09')}</> },
      { side: 'out', text: <>Perfect — you are booked for 12–13 December. Your deposit link and client portal are on their way.{T('11:09')}</> },
    ],
    artifacts: [
      { icon: Receipt, title: 'Invoice raised', tag: 'AUTOMATIC', body: '$1,400 · deposit terms taken straight from the signed contract.' },
      { icon: Camera, title: 'Shoot created', tag: 'AUTOMATIC', body: 'Two-day wedding project, client attached, ready for the crew.' },
      { icon: Calendar, title: 'Dates held', tag: 'AUTOMATIC', body: '12–13 December blocked. Double-bookings refused, blackout dates respected.' },
      { icon: Globe2, title: 'Client portal opened', tag: 'AUTOMATIC', body: 'One branded link: contract, invoice, booking and — later — the gallery.' },
    ],
    note: 'This is the step every other stack leaves to you. One signature, four records, zero retyping — and each one links back to the others.',
  },
  {
    key: 'shoot',
    tab: 'Shoot day',
    bubbles: [
      { side: 'out', text: <>Reminder: we are with you tomorrow at 9am. Deposit received — thank you!{T('Dec 11')}</> },
      { side: 'in', text: <>See you then! 🎉{T('Dec 11')}</> },
    ],
    artifacts: [
      { icon: Bell, title: 'Reminder sent', tag: 'AUTOMATED', body: 'On your schedule, in your tone, over the channel the client already replies on.' },
      { icon: RefreshCw, title: 'Google Calendar in sync', tag: 'TWO-WAY', body: 'Your calendar and the studio calendar agree — in the studio’s real timezone, not the server’s.' },
      { icon: Wallet, title: 'Deposit recorded', tag: 'LEDGER', body: 'Paid against the invoice and posted to the payments ledger. Outstanding balance updates everywhere at once.' },
    ],
    note: 'Availability is enforced server-side. Overlapping, straddling, after-hours, blackout and past-dated bookings are all refused — not politely discouraged.',
  },
  {
    key: 'deliver',
    tab: 'Delivered',
    bubbles: [
      { side: 'out', text: <>Your gallery is ready ✨ Pick your favourites and order prints straight from the page.{T('Dec 19')}</> },
      { side: 'in', text: <>They are beautiful. Ordering the album now!{T('Dec 19')}</> },
    ],
    artifacts: [
      { icon: Images, title: 'Gallery delivered', tag: 'BRANDED', body: 'Your studio name, logo and colour — on your own link. No third-party watermark anywhere.' },
      { icon: Eye, title: 'Client proofing', tag: 'LIVE', body: 'Favourites, comments and approvals come back into the project, not into your inbox.' },
      { icon: ShoppingBag, title: 'Print order placed', tag: 'REVENUE', body: 'The store bills through the same invoice and ledger as everything else.' },
      { icon: ScrollText, title: 'One timeline', tag: 'EVERY STEP', body: 'Message, contract, invoice, booking, delivery and order — one spine, in order, per client.' },
    ],
    note: 'Eight weeks of work, one thread, one record. Ask “what happened with this client?” and the answer is a single screen.',
  },
];

function ChainDemo() {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const t = setTimeout(() => setI((v) => (v + 1) % STAGES.length), 5000);
    return () => clearTimeout(t);
  }, [i, auto]);

  const stage = STAGES[i];
  const pick = (n) => { setAuto(false); setI(n); };

  return (
    <div className="lp-chain" id="chain">
      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--lp-text-muted)', margin: '0 0 18px', lineHeight: 1.6 }}>
        From one WhatsApp message to a delivered job — the whole relationship, without
        leaving the thread. This example follows a photography studio; the same chain
        runs for whatever your business sells.
      </p>
      <div className="lp-chain-rail" role="tablist" aria-label="Walk through one client, end to end">
        {STAGES.map((s, n) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            id={`lp-tab-${s.key}`}
            aria-selected={n === i}
            aria-controls="lp-chain-stage"
            className={`lp-chain-tab ${n === i ? 'active' : ''}`}
            onClick={() => pick(n)}
          >
            {n === i && auto && <span className="lp-chain-tab-fill" aria-hidden="true" />}
            <span>{n + 1}. {s.tab}</span>
          </button>
        ))}
      </div>

      <div
        className="lp-chain-stage"
        id="lp-chain-stage"
        role="tabpanel"
        aria-labelledby={`lp-tab-${stage.key}`}
      >
        {/* The phone is a picture of the product, not the product. */}
        <div className="lp-phone" aria-hidden="true" tabIndex={-1}>
          <div className="lp-phone-top">
            <div className="lp-avatar">AM</div>
            <div>
              <div className="lp-phone-name">Ayesha Malik</div>
              <div className="lp-phone-meta"><span className="lp-dot" /> online</div>
            </div>
            <span className="lp-chan">WHATSAPP</span>
          </div>

          <div className="lp-thread">
            {stage.chip && (
              <div className="lp-ai-chip"><Sparkles size={12} /> {stage.chip}</div>
            )}
            {stage.bubbles.map((b, n) => (
              <div key={`${stage.key}-${n}`} className={`lp-bubble lp-bubble-${b.side}`}
                   style={{ animationDelay: `${n * 260}ms` }}>
                {b.text}
              </div>
            ))}
          </div>

          <div className="lp-composer">
            <span className="lp-composer-fake">Message Ayesha…</span>
            <span className="lp-composer-btn"><Mic size={15} /></span>
            <span className="lp-composer-btn"><Send size={15} /></span>
          </div>
        </div>

        <div className="lp-out">
          <div className="lp-out-head">
            <span>What WappFlow just did</span>
            <span className="lp-out-line" />
          </div>

          {stage.artifacts.map((a, n) => (
            <div key={`${stage.key}-${a.title}`} className="lp-artifact"
                 style={{ animationDelay: `${120 + n * 130}ms` }}>
              <span className="lp-artifact-icon"><a.icon size={18} /></span>
              <div>
                <div className="lp-artifact-title">
                  {a.title}
                  <span className={`lp-tagpill ${/AUTO|AI/.test(a.tag) ? 'lp-tagpill-auto' : ''}`}>{a.tag}</span>
                </div>
                <div className="lp-artifact-body">{a.body}</div>
              </div>
            </div>
          ))}

          <p className="lp-stage-note">{stage.note}</p>
        </div>
      </div>
    </div>
  );
}

function Hero({ authed }) {
  return (
    <header className="lp-hero">
      <div className="lp-container">
        <div className="lp-hero-head">
          <Reveal>
            <span className="lp-badge">
              <span className="lp-badge-pill">WHATSAPP CRM</span>
              Every WhatsApp enquiry becomes a tracked lead — automatically
            </span>
          </Reveal>

          <Reveal delay={60}>
            <h1 className="lp-h1">
              Never lose a lead in{' '}
              <span className="lp-gradient">WhatsApp</span> again.
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="lp-lead">
              Your buyers are already messaging you — and the enquiries are already getting
              buried in the scroll. WappFlow turns every WhatsApp conversation into an
              organised CRM lead the moment it lands, then keeps the whole relationship
              connected: pipeline, contracts, booking, invoices and delivery.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="lp-hero-cta">
              {authed ? (
                <Link href="/dashboard" className="lp-btn lp-btn-primary lp-btn-lg">
                  Open WappFlow <ArrowRight size={17} />
                </Link>
              ) : (
                <Link href="/signup" className="lp-btn lp-btn-primary lp-btn-lg">
                  Start free <ArrowRight size={17} />
                </Link>
              )}
              <a href="#chain" className="lp-btn lp-btn-ghost lp-btn-lg">
                See how it works
              </a>
            </div>
          </Reveal>

          <Reveal delay={230}>
            <div className="lp-hero-note">
              <span><Check size={14} /> No credit card</span>
              <span><Check size={14} /> Your own WhatsApp number</span>
              <span><Check size={14} /> Set up in an afternoon</span>
            </div>
          </Reveal>

          {/* The one-line version of the whole product: the WhatsApp wedge, the CRM
              it feeds, and the modules around it. Sits directly under the hero so a
              visitor gets the hierarchy before they scroll anywhere. */}
          <Reveal delay={280}>
            <div className="lp-flow">
              <span className="lp-flow-step">
                <MessageCircle size={15} />
                <b>A WhatsApp message arrives</b>
                <em>Instagram, Facebook, email and web too</em>
              </span>
              <ArrowRight size={16} className="lp-flow-arrow" aria-hidden="true" />
              <span className="lp-flow-step lp-flow-step-core">
                <TrendingUp size={15} />
                <b>It becomes a CRM lead</b>
                <em>Captured, scored and on the pipeline</em>
              </span>
              <ArrowRight size={16} className="lp-flow-arrow" aria-hidden="true" />
              <span className="lp-flow-step">
                <Layers size={15} />
                <b>Modules take it from there</b>
                <em>Contracts, booking, invoices, delivery</em>
              </span>
            </div>
          </Reveal>
        </div>

        <Reveal delay={120}><ChainDemo /></Reveal>
      </div>
    </header>
  );
}

/* ═════════════════════════════ CAPABILITY STRIP ══════════════════════════ */

const STRIP = [
  { icon: MessageCircle, label: 'WhatsApp' },
  { icon: Instagram, label: 'Instagram DMs' },
  { icon: Facebook, label: 'Facebook' },
  { icon: Mail, label: 'Email' },
  { icon: Globe, label: 'Website capture' },
  { icon: Calendar, label: 'Google Calendar' },
  { icon: Video, label: 'Video huddles' },
  { icon: Smartphone, label: 'Installable app' },
];

function Strip() {
  return (
    <section className="lp-strip">
      <div className="lp-container">
        <p className="lp-strip-label">WhatsApp first — and every other channel they use</p>
        <div className="lp-strip-row">
          {STRIP.map((s, n) => (
            <Reveal key={s.label} delay={n * 45}>
              <span className="lp-strip-chip"><s.icon size={15} /> {s.label}</span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════ THE PROBLEM ══════════════════════════════ */

const SCATTER = [
  { icon: MessageSquare, name: 'WhatsApp', cost: 'leads lost in the scroll' },
  { icon: FileText, name: 'A signing tool', cost: '$25/mo' },
  { icon: Globe2, name: 'A client-portal tool', cost: '$40/mo' },
  { icon: Receipt, name: 'Invoicing software', cost: '$20/mo' },
  { icon: Calendar, name: 'A booking page', cost: '$15/mo' },
  { icon: Database, name: 'A spreadsheet CRM', cost: 'and the retyping' },
];

function Problem() {
  const [mode, setMode] = useState('before');

  return (
    <section className="lp-section">
      <div className="lp-container">
        <SectionHead
          eyebrow="The problem" icon={MessageSquare}
          title={<>Enquiries die in the <span className="lp-gradient">scroll</span>.</>}
          sub="A buyer messages you on WhatsApp at 11pm. By morning it is forty messages up the thread, in the same inbox as your family and your suppliers. Nothing captured it, nothing chased it, and nobody knows it existed — because the rest of your business lives in other tabs entirely."
        />

        <div className="lp-switch-wrap">
          <Reveal>
            <div className="lp-switch" role="group" aria-label="Compare a scattered stack with WappFlow">
              <button type="button" className={`lp-switch-btn ${mode === 'before' ? 'active' : ''}`}
                      aria-pressed={mode === 'before'} onClick={() => setMode('before')}>
                WhatsApp + six tools
              </button>
              <button type="button" className={`lp-switch-btn ${mode === 'after' ? 'active' : ''}`}
                      aria-pressed={mode === 'after'} onClick={() => setMode('after')}>
                One WappFlow
              </button>
            </div>
          </Reveal>
        </div>

        {mode === 'before' ? (
          <>
            <div className="lp-scatter">
              {SCATTER.map((s, n) => (
                <div key={s.name} className="lp-scatter-item" style={{ animationDelay: `${n * 60}ms` }}>
                  <span className="lp-scatter-icon"><s.icon size={18} /></span>
                  <div className="lp-scatter-name">{s.name}</div>
                  <div className="lp-scatter-cost">{s.cost}</div>
                </div>
              ))}
            </div>
            <div className="lp-cost-row">
              <span><b>~$100+/month</b> in subscriptions</span>
              <span><b>Six logins</b> to check one client</span>
              <span><b>Nothing</b> knows what anything else did</span>
            </div>
          </>
        ) : (
          <div className="lp-unified">
            <div className="lp-unified-mark"><Zap size={26} fill="currentColor" /></div>
            <h3 className="lp-split-h" style={{ marginBottom: 10 }}>
              Captured on arrival. Connected from then on.
            </h3>
            <p className="lp-section-sub" style={{ maxWidth: 540, margin: '0 auto' }}>
              The WhatsApp message becomes a lead the second it arrives. From there it is
              one client record — conversations and pipeline at the core, with contracts,
              bookings, invoices, portals and galleries as modules around them, sharing one
              database and one timeline.
            </p>
            <div className="lp-unified-list">
              <span>CRM &amp; pipeline</span><span>Shared inbox</span><span>AI</span>
              <span>Contracts Studio</span><span>Booking</span><span>Invoicing &amp; ledger</span>
              <span>Client portal</span><span>Media Studio</span><span>Print store</span><span>Portfolio</span>
            </div>
            <div className="lp-cost-row">
              <span>From <b>$29/month</b></span>
              <span><b>One</b> login</span>
              <span><b>Everything</b> writes to the same timeline</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ═══════════════════════════════ THE SPINE ═══════════════════════════════ */

const SPINE = [
  {
    n: 'Capture',
    sub: 'WhatsApp enquiries become leads',
    h: 'Nothing arrives without becoming a record',
    p: 'This is the part that stops the bleeding. A WhatsApp message creates a lead the moment it lands — no forms, no copying, no remembering. Instagram, Facebook, email and your website feed the same inbox, each tagged with where it came from, so your pipeline fills itself instead of waiting on you.',
    items: [
      { t: 'Shared team inbox', b: 'Assign, tag, snooze and reply together without stepping on each other.' },
      { t: 'Voice notes, transcribed', b: 'Long client voice messages become searchable text.' },
      { t: 'Source tracking', b: 'You can finally answer which channel actually pays.' },
      { t: 'Never lose a message', b: 'Missed-message sync reconciles anything the connection dropped.' },
    ],
  },
  {
    n: 'Qualify',
    sub: 'AI reads before you do',
    h: 'Know which enquiry matters before you open it',
    p: 'Lead intelligence reads the actual conversation and scores intent, service and timeline. Reply suggestions are drafted in your voice from your own knowledge base — and wait for you to approve them.',
    items: [
      { t: 'Lead scoring', b: 'Intent and budget band from the words the client used.' },
      { t: 'Reply suggestions', b: 'Drafted, never auto-sent. You stay the author.' },
      { t: 'Next best action', b: 'The one useful move, on the lead itself.' },
      { t: 'Knowledge base', b: 'Your packages and policies, so the AI answers like you would.' },
    ],
  },
  {
    n: 'Close',
    sub: 'Contracts that actually bind',
    h: 'Send, negotiate and sign without leaving the thread',
    p: 'Build from a clause library, send over WhatsApp and email, compare redlines between versions and collect a legally-sound e-signature with a full audit trail. The client signs on their phone in the conversation they started in.',
    items: [
      { t: 'Clause library', b: 'Your terms, reusable, versioned.' },
      { t: 'Redline comparison', b: 'See exactly what changed between drafts.' },
      { t: 'Approval workflows', b: 'Internal sign-off before anything goes out.' },
      { t: 'Tamper-evident audit', b: 'Signature, IP, device and timestamp on the record.' },
    ],
  },
  {
    n: 'Chain',
    sub: 'One signature, four records',
    h: 'The signature is what starts the work',
    p: 'This is the part that does not exist when your tools are separate. A signed contract raises the invoice on its own terms, opens the project, holds the dates and unlocks the client portal — all linked back to each other and to the lead.',
    items: [
      { t: 'Invoice from contract terms', b: 'Deposit and balance as signed, not as remembered.' },
      { t: 'Project created and staffed', b: 'A real piece of work your team can run from.' },
      { t: 'Dates held', b: 'Availability enforced server-side, clashes refused.' },
      { t: 'Portal unlocked', b: 'One branded link the client keeps for the whole job.' },
    ],
  },
  {
    n: 'Produce',
    sub: 'The right module for the work',
    h: 'Where a specialist module carries the load',
    p: 'Delivery looks different in every business, so it belongs to a module. For creative work that module is Media Studio: AI-assisted culling and hero-shot picks, client proofing, collections, expiring galleries and a print store that bills through the same ledger. Whichever module does the work, it writes back to the same client.',
    items: [
      { t: 'AI culling & scoring', b: 'Faces, smiles, sharpness — the obvious rejects, gone.' },
      { t: 'Client proofing', b: 'Favourites and comments land on the project.' },
      { t: 'Gallery expiry', b: 'Delivery windows that close on their own.' },
      { t: 'Print store', b: 'Orders become invoices and payments automatically.' },
    ],
  },
  {
    n: 'Remember',
    sub: 'One timeline per client',
    h: 'Ask what happened, get one screen',
    p: 'Every message, contract, invoice, payment, booking, delivery and order writes to a single universal timeline on the client. No archaeology across six tools — the history of the relationship is one scroll, in order.',
    items: [
      { t: 'Universal timeline', b: 'Every module writes to the same spine.' },
      { t: 'Analytics & reports', b: 'Pipeline, revenue and source performance.' },
      { t: 'Audit log', b: 'Who did what, when — for real accountability.' },
      { t: 'Export your data', b: 'It is yours. Take it whenever you like.' },
    ],
  },
];

function Spine() {
  const [i, setI] = useState(3); // open on "Chain" — the step that sells the product
  const s = SPINE[i];

  return (
    <section className="lp-section" id="how">
      <div className="lp-container">
        <SectionHead
          eyebrow="How it works" icon={Workflow}
          title={<>Six steps that <span className="lp-gradient">feed each other</span>.</>}
          sub="Not six features side by side — six stages where finishing one starts the next. Pick any step to see what it creates."
        />

        <div className="lp-spine">
          <div className="lp-spine-nav" role="tablist" aria-label="Stages of a client relationship" aria-orientation="vertical">
            {SPINE.map((x, n) => (
              <button
                key={x.n}
                type="button"
                role="tab"
                id={`lp-spine-tab-${n}`}
                aria-selected={n === i}
                aria-controls="lp-spine-panel"
                className={`lp-spine-btn ${n === i ? 'active' : ''}`}
                onClick={() => setI(n)}
              >
                <span className="lp-spine-num">{n + 1}</span>
                <span>
                  <span className="lp-spine-btn-title">{x.n}</span>
                  <span className="lp-spine-btn-sub">{x.sub}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="lp-spine-panel" id="lp-spine-panel" role="tabpanel" aria-labelledby={`lp-spine-tab-${i}`}>
            <h3 className="lp-spine-h">{s.h}</h3>
            <p className="lp-spine-p">{s.p}</p>
            <div className="lp-spine-grid">
              {s.items.map((it, n) => (
                <div key={it.t} className="lp-spine-item" style={{ animationDelay: `${n * 70}ms` }}>
                  <CheckCircle2 size={16} className="lp-check" />
                  <div>
                    <div className="lp-spine-item-t">{it.t}</div>
                    <div className="lp-spine-item-b">{it.b}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════ MODULE GRID ═══════════════════════════════ */

// The core — what WappFlow *is*, whatever the business sells; everything in
// MODULES below plugs into it. Cards describe the platform at full capability;
// tier placement (what is Creator vs Studio vs up) is disclosed in the pricing
// table, so don't headline these as universal per-plan claims.
const CORE = [
  {
    icon: TrendingUp, title: 'CRM & Pipeline', pill: null,
    body: 'The system of record. Enquiry to won to delivered, with the conversation attached to every card — every module below reads and writes this.',
    list: ['Multi-pipeline and saved views', 'Safe client merge', 'Source and revenue reporting', 'Clients, not just leads'],
  },
  {
    icon: Inbox, title: 'Conversations', pill: null,
    body: 'WhatsApp, Instagram, Facebook, email and website enquiries in one shared inbox, worked by your whole team.',
    list: ['Assignment, tags and snoozing', 'Voice notes transcribed', 'Templates and quick replies', 'Broadcasts and groups'],
  },
  {
    icon: ScrollText, title: 'Timeline, AI & automation', pill: null,
    body: 'One activity spine per client, AI that scores leads and drafts replies, and automations that keep the next step moving.',
    list: ['Universal client timeline', 'Lead scoring and reply drafts', 'Next best actions', 'Auto-replies and workflows'],
  },
  {
    icon: Users, title: 'Team & workspace', pill: null,
    body: 'Everyone works the same record without stepping on each other — and you can always see who did what.',
    list: ['Roles and permissions', 'Shared assignment', 'One login, every module', 'Full data export'],
  },
];

// The modules — each one optional, all of them writing to the core above.
const MODULES = [
  {
    icon: FileText, title: 'Contracts Studio', pill: null,
    body: 'Draft, negotiate and sign real contracts over WhatsApp and email — with the audit trail to back them up.',
    list: ['Clause library and templates', 'Version history and redlines', 'Approval workflows', 'Bulk send'],
  },
  {
    icon: Aperture, title: 'Media Studio', pill: null,
    body: 'Culling, proofing, collections and delivery for shoots that run to thousands of frames.',
    list: ['AI culling and hero-shot picks', 'Story sections and collections', 'Client proofing and favourites', 'Expiring galleries'],
  },
  {
    icon: Calendar, title: 'Booking', pill: null,
    body: 'A branded booking page that respects your real hours, buffers, blackout dates and existing commitments.',
    list: ['Server-enforced availability', 'Two-way Google Calendar sync', 'Real business-timezone handling', 'Turns into a project and invoice'],
  },
  {
    icon: CreditCard, title: 'Invoicing & Payments', pill: null,
    body: 'Invoices raised from signed terms, payment links your client can open in the thread, and one ledger behind it all.',
    list: ['Deposits and balances', 'Shareable payment links', 'Reconciled payments ledger', 'Outstanding at a glance'],
  },
  {
    icon: Globe2, title: 'Client Portal', pill: null,
    body: 'One branded link where the client finds their contract, invoice, booking and gallery. No account, no app.',
    list: ['Your logo, colour and name', 'Everything for the job in one place', 'Works on any phone', 'Nothing to install'],
  },
  {
    icon: ShoppingBag, title: 'Print Store', pill: null,
    body: 'Sell prints and albums from the gallery the client is already looking at.',
    list: ['Your products and pricing', 'Orders become invoices', 'Paid through the same ledger', 'Revenue on the timeline'],
  },
  {
    icon: Palette, title: 'Portfolio', pill: null,
    body: 'A public portfolio on your own vanity link, built from work already in the system.',
    list: ['Ten themes', 'Publish straight from a project', 'Enquiries land in the inbox', 'No separate website to maintain'],
  },
  {
    icon: Video, title: 'Video Huddles', pill: 'WEB',
    body: 'Jump on a call with a client or your team without a third-party meeting link.',
    list: ['Browser-based, nothing to install', 'Share the link in the thread', 'Attached to the client record'],
  },
  {
    icon: Monitor, title: 'Desktop App', pill: 'BETA',
    body: 'A desktop shell for teams with heavy local libraries, and a local AI engine for on-machine scoring.',
    list: ['One login, same workspace', 'Local AI scoring on your hardware', 'Built for large media volumes'],
  },
  {
    icon: Smartphone, title: 'Installable App', pill: null,
    body: 'Install WappFlow to your phone or desktop from the browser. Push notifications included.',
    list: ['Home-screen install', 'Push notifications', 'Fully responsive down to 375px'],
  },
];

function Modules() {
  const onMove = useCallback((e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, []);

  const card = (m, n) => (
    <Reveal key={m.title} delay={(n % 3) * 70}>
      <div className="lp-mod" onMouseMove={onMove}>
        <span className="lp-mod-icon"><m.icon size={21} /></span>
        <h3 className="lp-mod-title">
          {m.title}
          {m.pill && (
            <span className={`lp-mini-pill ${m.pill === 'BETA' ? 'lp-mini-pill-beta' : ''}`}>{m.pill}</span>
          )}
        </h3>
        <p className="lp-mod-body">{m.body}</p>
        <div className="lp-mod-list">
          {m.list.map((l) => (
            <span key={l}><Check size={13} className="lp-check" /> {l}</span>
          ))}
        </div>
      </div>
    </Reveal>
  );

  return (
    <section className="lp-section" id="modules">
      <div className="lp-container">
        <SectionHead
          eyebrow="The platform" icon={Layers}
          title={<>One CRM. <span className="lp-gradient">Every client.</span> Everything connected.</>}
          sub="Start with the CRM every business runs on — leads, conversations, pipeline, one timeline per client. Then add the modules you need around it: each optional, all of them sharing the same clients, the same billing and the same history. Nothing to wire together."
        />

        <Reveal><div className="lp-fire-h" style={{ marginBottom: 14 }}>The core — what every module plugs into</div></Reveal>
        <div className="lp-mods">{CORE.map(card)}</div>

        <Reveal><div className="lp-fire-h" style={{ marginTop: 38, marginBottom: 14 }}>The modules — add what fits your business</div></Reveal>
        <div className="lp-mods">{MODULES.map(card)}</div>

        <Reveal>
          <p className="lp-limits" style={{ marginTop: 30 }}>
            New modules land on the same core — the platform grows without your CRM ever changing shape.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════ AI ══════════════════════════════════ */

const AI_TABS = [
  {
    icon: MessageCircle, t: 'Reply suggestions',
    h: 'Drafted in your voice — sent by you',
    p: 'The AI reads the thread and your knowledge base and writes the reply you were going to write. It never sends on its own. You read it, edit it if you want, and press send.',
    demo: 'reply',
  },
  {
    icon: Brain, t: 'Lead intelligence',
    h: 'Know which enquiry is worth the morning',
    p: 'Every conversation is scored for intent, service, timeline and budget band — from what the client actually said, not from a form they never filled in.',
    demo: 'score',
  },
  {
    icon: Aperture, t: 'Culling & hero shots',
    h: 'Four thousand frames, sorted before coffee',
    p: 'Inside the Media Studio module, AI scores frames on faces, smiles, eyes and sharpness, throws out the obvious rejects and proposes the hero shot for the gallery cover. You keep the final say on every pick.',
    demo: 'cull',
  },
  {
    icon: Target, t: 'Next best actions',
    h: 'The one move that matters, on the record itself',
    p: 'Not a dashboard you have to remember to open. The suggested action sits on the lead: chase the quote, send the contract, ask for the review.',
    demo: 'nba',
  },
  {
    icon: Wand2, t: 'Studio brain',
    h: 'Your packages, policies and past answers',
    p: 'Feed it your pricing, FAQs and the way you talk about your work. Everything the AI writes comes back sounding like your business instead of a chatbot.',
    demo: 'brain',
  },
];

function AiDemo({ kind }) {
  if (kind === 'score') {
    return (
      <div className="lp-ai-demo">
        {[
          { t: 'Ayesha M. — December wedding, 2 days', b: 'Named a date, named a budget, asked for availability', s: '94', mid: false },
          { t: 'Bilal R. — “how much for photos?”', b: 'No date, no service, no budget signal', s: '31', mid: true },
          { t: 'Hina S. — corporate headshots, 40 staff', b: 'Volume, decision-maker, timeline this month', s: '88', mid: false },
        ].map((r) => (
          <div key={r.t} className="lp-ai-row">
            <div style={{ flex: 1 }}>
              <div className="lp-ai-row-t">{r.t}</div>
              <div className="lp-ai-row-b">{r.b}</div>
            </div>
            <span className={`lp-score ${r.mid ? 'lp-score-mid' : ''}`}>{r.s}</span>
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'cull') {
    return (
      <div className="lp-ai-demo">
        <div className="lp-gallery" aria-hidden="true">
          {[
            { pick: true, badge: '9.4', hero: true }, { pick: true, badge: '9.1' }, { pick: false, badge: '4.2' },
            { pick: true, badge: '8.8' }, { pick: false, badge: '3.6' }, { pick: true, badge: '8.5' },
          ].map((s, n) => (
            <div key={n} className={`lp-shot ${s.pick ? 'lp-shot-pick' : ''}`} style={{ opacity: s.pick ? 1 : 0.32 }}>
              <span className="lp-shot-badge">{s.badge}</span>
              {s.hero && <span className="lp-shot-hero">HERO</span>}
            </div>
          ))}
        </div>
        <div className="lp-ai-row" style={{ marginTop: 14, borderTop: '1px solid var(--lp-border)', paddingTop: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="lp-ai-row-t">4,182 frames scored</div>
            <div className="lp-ai-row-b">1,640 rejected on eyes, blur and duplicates · hero shot proposed for the cover</div>
          </div>
          <span className="lp-score">−39%</span>
        </div>
      </div>
    );
  }

  if (kind === 'nba') {
    return (
      <div className="lp-ai-demo">
        {[
          { i: Send, t: 'Send the December wedding package', b: 'Ayesha asked for pricing 41 minutes ago' },
          { i: FileText, t: 'Contract is unsigned after 6 days', b: 'Hina opened it twice and never signed — nudge her' },
          { i: Receipt, t: 'Balance due in 3 days', b: 'Bilal’s final payment on the corporate shoot' },
          { i: Star, t: 'Ask for a review', b: 'Gallery delivered 9 days ago and fully downloaded' },
        ].map((r) => (
          <div key={r.t} className="lp-ai-row">
            <span className="lp-artifact-icon" style={{ width: 30, height: 30 }}><r.i size={14} /></span>
            <div style={{ flex: 1 }}>
              <div className="lp-ai-row-t">{r.t}</div>
              <div className="lp-ai-row-b">{r.b}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'brain') {
    return (
      <div className="lp-ai-demo">
        {[
          { t: 'Packages & pricing', b: 'Wedding, corporate, portrait — what each includes and what it costs' },
          { t: 'Policies', b: 'Deposits, rescheduling, travel, turnaround times' },
          { t: 'Voice', b: 'How your business actually talks to clients' },
          { t: 'Past answers', b: 'The replies that worked, reused' },
        ].map((r) => (
          <div key={r.t} className="lp-ai-row">
            <CheckCircle2 size={16} className="lp-check" style={{ marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div className="lp-ai-row-t">{r.t}</div>
              <div className="lp-ai-row-b">{r.b}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // reply
  return (
    <div className="lp-ai-demo">
      <div className="lp-thread" style={{ padding: 0, gap: 10 }} aria-hidden="true">
        <div className="lp-bubble lp-bubble-in">Do you travel to Islamabad? And what’s the turnaround on the album?</div>
        <div className="lp-ai-chip"><Sparkles size={12} /> Suggested reply — from your knowledge base</div>
        <div className="lp-bubble lp-bubble-out">
          We do travel to Islamabad — travel is included for two-day bookings. Albums are
          hand-finished and take four to six weeks from your final selection.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <span className="lp-strip-chip" style={{ fontSize: 12 }}><Check size={13} /> Use it</span>
        <span className="lp-strip-chip" style={{ fontSize: 12 }}><PenLine size={13} /> Edit first</span>
        <span className="lp-strip-chip" style={{ fontSize: 12 }}><RefreshCw size={13} /> Try again</span>
      </div>
    </div>
  );
}

function Ai() {
  const [i, setI] = useState(0);
  const t = AI_TABS[i];

  return (
    <section className="lp-section" id="ai">
      <div className="lp-container">
        <SectionHead
          eyebrow="Artificial intelligence" icon={Sparkles}
          title={<>AI that does the <span className="lp-gradient">actual work</span>.</>}
          sub="Not a chatbot bolted to the corner of the screen. AI that reads your conversations, scores your leads and drafts in your voice — and, inside the Media Studio module, sorts thousands of frames. Always leaving the decision with you."
        />

        <div className="lp-ai-wrap">
          <div className="lp-ai-tabs" role="tablist" aria-label="What the AI does" aria-orientation="vertical">
            {AI_TABS.map((x, n) => (
              <button
                key={x.t}
                type="button"
                role="tab"
                id={`lp-ai-tab-${n}`}
                aria-selected={n === i}
                aria-controls="lp-ai-panel"
                className={`lp-ai-tab ${n === i ? 'active' : ''}`}
                onClick={() => setI(n)}
              >
                <span className="lp-ai-tab-icon"><x.icon size={16} /></span>
                <span className="lp-ai-tab-t">{x.t}</span>
              </button>
            ))}
          </div>

          <div className="lp-ai-panel" id="lp-ai-panel" role="tabpanel" aria-labelledby={`lp-ai-tab-${i}`}>
            <h3 className="lp-ai-panel-h">{t.h}</h3>
            <p className="lp-ai-panel-p">{t.p}</p>
            <AiDemo kind={t.demo} />
            <p style={{ fontSize: 12, color: 'var(--lp-text-muted)', margin: '10px 0 0', lineHeight: 1.6 }}>
              The demos continue the photography-studio example from above — the AI reads
              whatever your business actually talks about.
            </p>
            <p className="lp-byok">
              <KeyRound size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--lp-accent-2)' }} />
              <strong>Bring your own key.</strong> Enterprise workspaces can run every AI feature on
              their own provider account, so prompts and client data go where you decide they go.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════ CONTRACTS — live configurator ════════════════════ */

const PACKAGES = [
  { t: 'Half day', b: '4 hours · 1 photographer · 200 edited images', p: 700 },
  { t: 'Full day', b: '8 hours · 2 photographers · 500 edited images', p: 1400 },
  { t: 'Two-day wedding', b: 'Mehndi + Barat · 3 crew · full album', p: 2600 },
];

const ADDONS = [
  { t: 'Cinematic highlight film', b: '3–5 minute edit, delivered in 3 weeks', p: 600 },
  { t: 'Hand-finished album', b: '30 spreads, leather bound', p: 450 },
];

function Contracts() {
  const [pkg, setPkg] = useState(1);
  const [addons, setAddons] = useState({ 0: false, 1: false });
  const [signed, setSigned] = useState(false);

  const total = PACKAGES[pkg].p + ADDONS.reduce((sum, a, n) => sum + (addons[n] ? a.p : 0), 0);
  const money = (n) => `$${n.toLocaleString('en-US')}`;

  // Once it is signed, the downstream records light up in sequence — the same
  // chain the hero demo walks through, only here the visitor triggers it.
  const FIRE = [
    { t: `Invoice raised — ${money(total)}`, i: Receipt },
    { t: 'Shoot created and linked to the client', i: Camera },
    { t: 'Dates held on the studio calendar', i: Calendar },
    { t: 'Client portal unlocked', i: Globe2 },
    { t: 'Written to the client timeline', i: ScrollText },
  ];

  return (
    <section className="lp-section" id="contracts">
      <div className="lp-container">
        <SectionHead
          eyebrow="Contracts Studio" icon={FileText}
          title={<>Sign the deal <span className="lp-gradient">in the chat</span>.</>}
          sub="Have a go — choose a package, add what you like, then sign. The example continues the same fictional photography studio; your contracts carry your services and your prices. Watch what a signature is supposed to set off."
        />

        <div className="lp-cfg">
          <Reveal>
            <div className="lp-doc">
              <div className="lp-doc-bar">
                <FileText size={15} style={{ color: 'var(--lp-accent)' }} />
                <span className="lp-doc-title">Wedding Photography Agreement</span>
                <span className="lp-tagpill" style={{ marginLeft: 'auto' }}>
                  {signed ? 'SIGNED' : 'AWAITING SIGNATURE'}
                </span>
              </div>

              <div className="lp-doc-body">
                <h3 className="lp-doc-h">Coverage &amp; deliverables</h3>
                <p className="lp-doc-meta">Prepared for Ayesha Malik · 12–13 December</p>

                <fieldset style={{ border: 'none', padding: 0, margin: '0 0 18px' }}>
                  <legend className="lp-fire-h" style={{ marginBottom: 10 }}>Choose your coverage</legend>
                  {PACKAGES.map((p, n) => (
                    <button key={p.t} type="button" className={`lp-opt ${pkg === n ? 'on' : ''}`}
                            aria-pressed={pkg === n} onClick={() => { setPkg(n); setSigned(false); }}>
                      <span className="lp-radio">{pkg === n && <Check size={12} strokeWidth={4} color="#0b0d16" />}</span>
                      <span>
                        <span className="lp-opt-t">{p.t}</span>
                        <span className="lp-opt-b">{p.b}</span>
                      </span>
                      <span className="lp-opt-price">{money(p.p)}</span>
                    </button>
                  ))}
                </fieldset>

                <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                  <legend className="lp-fire-h" style={{ marginBottom: 10 }}>Optional extras</legend>
                  {ADDONS.map((a, n) => (
                    <button key={a.t} type="button" className={`lp-opt ${addons[n] ? 'on' : ''}`}
                            aria-pressed={!!addons[n]}
                            onClick={() => { setAddons((s) => ({ ...s, [n]: !s[n] })); setSigned(false); }}>
                      <span className="lp-radio lp-radio-box">{addons[n] && <Check size={12} strokeWidth={4} color="#0b0d16" />}</span>
                      <span>
                        <span className="lp-opt-t">{a.t}</span>
                        <span className="lp-opt-b">{a.b}</span>
                      </span>
                      <span className="lp-opt-price">+{money(a.p)}</span>
                    </button>
                  ))}
                </fieldset>

                <div className={`lp-sign-zone ${signed ? 'done' : ''}`}>
                  {signed ? (
                    <>
                      <div className="lp-sign-script">Ayesha Malik</div>
                      <div className="lp-doc-meta" style={{ marginTop: 8, marginBottom: 0 }}>
                        Signed · audit trail recorded · IP and device captured
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="lp-artifact-body" style={{ marginBottom: 14 }}>
                        The client signs here, on their phone, without making an account.
                      </p>
                      <button type="button" className="lp-btn lp-btn-primary" onClick={() => setSigned(true)}>
                        <PenLine size={15} /> Sign the contract
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={110}>
            <div className="lp-side">
              <div className="lp-total">
                <div className="lp-total-label">Contract value</div>
                <div className="lp-total-value">{money(total)}</div>
                <div className="lp-total-note">30% deposit ({money(Math.round(total * 0.3))}) due on signature</div>
              </div>

              <div className="lp-fire">
                <div className="lp-fire-h">On signature, WappFlow</div>
                {FIRE.map((f, n) => (
                  <div key={f.t} className={`lp-fire-row ${signed ? 'hot' : ''}`}
                       style={{ transitionDelay: signed ? `${n * 220}ms` : '0ms' }}>
                    <span className="lp-fire-dot" />
                    <f.i size={14} />
                    <span>{f.t}</span>
                  </div>
                ))}
                {signed && (
                  <p className="lp-artifact-body" style={{ marginTop: 12 }}>
                    Five records, one signature, no retyping. That is the whole idea.
                  </p>
                )}
              </div>

              {signed && (
                <button type="button" className="lp-btn lp-btn-ghost" onClick={() => setSigned(false)}>
                  <RefreshCw size={14} /> Run it again
                </button>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ MEDIA STUDIO SPLIT ══════════════════════════ */

function MediaStudio() {
  return (
    <section className="lp-section" id="studio">
      <div className="lp-container lp-split">
        <Reveal>
          <div>
            <div className="lp-section-eyebrow"><Aperture size={13} /> Module spotlight — Media Studio</div>
            <h2 className="lp-split-h">Four thousand frames in. One gallery out.</h2>
            <p className="lp-split-p">
              One module, shown in depth. If the work you sell is creative, Media Studio
              takes the heaviest part of the job: score and cull with AI, review by touch,
              arrange the story, and deliver a gallery that carries your name instead of
              somebody else’s — all of it written back to the same client record.
            </p>
            <div className="lp-feat-list">
              {[
                { i: Sparkles, t: 'AI culling and scoring', b: 'Faces, smiles, open eyes and sharpness. The obvious rejects go before you ever see them.' },
                { i: Star, t: 'Hero shot picked for you', b: 'A proposed cover for the gallery — accept it or overrule it.' },
                { i: FolderOpen, t: 'Collections and story sections', b: 'Arrange the day the way you would tell it, not as one endless grid.' },
                { i: Eye, t: 'Client proofing', b: 'Favourites and comments come back onto the project, not into your inbox.' },
                { i: Timer, t: 'Galleries that expire', b: 'Delivery windows that close on their own, with reminders before they do.' },
                { i: HardDrive, t: 'Trash, search and bulk work', b: 'Nothing is ever one misclick from gone.' },
              ].map((f) => (
                <div key={f.t} className="lp-feat">
                  <span className="lp-feat-icon"><f.i size={15} /></span>
                  <div>
                    <div className="lp-feat-t">{f.t}</div>
                    <div className="lp-feat-b">{f.b}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="lp-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
              <Images size={16} style={{ color: 'var(--lp-accent)' }} />
              <span className="lp-doc-title">Malik Wedding · Day 1</span>
              <span className="lp-tagpill" style={{ marginLeft: 'auto' }}>DELIVERED</span>
            </div>
            <div className="lp-gallery" aria-hidden="true">
              {[
                { pick: true, badge: '9.4', hero: true }, { pick: true, badge: '9.2' }, { pick: true, badge: '8.9' },
                { pick: true, badge: '8.7' }, { pick: false, badge: '4.1' }, { pick: true, badge: '8.4' },
                { pick: true, badge: '8.2' }, { pick: false, badge: '3.9' }, { pick: true, badge: '8.0' },
              ].map((s, n) => (
                <div key={n} className={`lp-shot ${s.pick ? 'lp-shot-pick' : ''}`} style={{ opacity: s.pick ? 1 : 0.3 }}>
                  <span className="lp-shot-badge">{s.badge}</span>
                  {s.hero && <span className="lp-shot-hero">HERO</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="lp-strip-chip" style={{ fontSize: 12 }}><Check size={13} /> 612 selected</span>
              <span className="lp-strip-chip" style={{ fontSize: 12 }}><Eye size={13} /> 41 client favourites</span>
              <span className="lp-strip-chip" style={{ fontSize: 12 }}><ShoppingBag size={13} /> 2 print orders</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ═══════════════════════ CLIENT EXPERIENCE / BRANDING ════════════════════ */

function ClientSide() {
  return (
    <section className="lp-section" id="clients">
      <div className="lp-container">
        <SectionHead
          eyebrow="What your client sees" icon={BadgeCheck}
          title={<>Eight public pages. <span className="lp-gradient">All of them yours</span>.</>}
          sub="Booking page, contract, invoice, payment link, gallery, proofing, print store and client portal — every one carries your business’s name, logo and colour. Your client never learns what software you use."
        />

        <div className="lp-sec-grid">
          {[
            { i: Palette, t: 'Your brand, resolved once', b: 'Name, logo, colour, website and contact details come from one place and appear identically on every public page.' },
            { i: Globe2, t: 'One portal for the whole job', b: 'Contract, invoice, booking and gallery behind a single link the client keeps from enquiry to delivery.' },
            { i: Smartphone, t: 'Built for a phone', b: 'Every client-facing page works down to 375px. Most of your clients will only ever see it on a phone.' },
            { i: Lock, t: 'No account required', b: 'No signup wall between your client and their own contract. Secure links, nothing to install.' },
            { i: Share2, t: 'Delivered where they already are', b: 'Links go out over WhatsApp and email — the channels they actually read.' },
            { i: Crown, t: 'White label', b: 'On Studio+ and above, remove every trace of WappFlow. The whole experience reads as your business.' },
          ].map((c, n) => (
            <Reveal key={c.t} delay={(n % 3) * 70}>
              <div className="lp-sec-card">
                <span className="lp-sec-icon" style={{ background: 'rgba(129,140,248,0.12)', color: 'var(--lp-accent)' }}>
                  <c.i size={18} />
                </span>
                <h3 className="lp-sec-t">{c.t}</h3>
                <p className="lp-sec-b">{c.b}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════ SECURITY ════════════════════════════════ */

function Security() {
  return (
    <section className="lp-section" id="security">
      <div className="lp-container">
        <SectionHead
          eyebrow="Security & trust" icon={ShieldCheck}
          title={<>Your clients’ data, <span className="lp-gradient">kept properly</span>.</>}
          sub="Signed contracts, payment records and private galleries are not the place to find out your vendor was casual about this. Here is what we actually do."
        />

        <div className="lp-sec-grid">
          {[
            { i: Shield, t: 'Tenant isolation, tested continuously', b: 'An automated suite discovers every authenticated route in the codebase and tries to reach one workspace’s data as another. A route added this month is tested the day it lands.' },
            { i: KeyRound, t: 'Sessions that expire and revoke', b: 'Tokens carry a real expiry, travel in headers rather than URLs, and every session can be invalidated at once when a password changes.' },
            { i: HardDrive, t: 'Verified backups, not hopeful copies', b: 'Backups are taken through SQLite’s online-backup API, then re-opened and row-counted to prove they restore. A backup that fails its own check is deleted rather than kept.' },
            { i: ScrollText, t: 'Audit log', b: 'Who changed what, and when — across contracts, invoices, bookings and client records.' },
            { i: Lock, t: 'Encrypted in transit', b: 'TLS everywhere, including every public client-facing page.' },
            { i: Database, t: 'Your data stays yours', b: 'Full export whenever you want it. No lock-in, no ransom at the door on the way out.' },
          ].map((c, n) => (
            <Reveal key={c.t} delay={(n % 3) * 70}>
              <div className="lp-sec-card">
                <span className="lp-sec-icon"><c.i size={18} /></span>
                <h3 className="lp-sec-t">{c.t}</h3>
                <p className="lp-sec-b">{c.b}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════ PRICING ═════════════════════════════════ */

// Offline fallback. The live numbers come from GET /api/plans, which reads the
// same catalog the in-app Plan tab does — so the two can never drift apart.
const PLANS = [
  {
    key: 'creator', name: 'Creator', price: 29, founding: 14,
    for: 'Solo operators running the whole business themselves.',
    feats: [
      'The CRM core plus every module, end to end',
      'CRM, Contracts Studio, Media Studio, Booking',
      'Client portal, print store and portfolio',
      'WhatsApp inbox with voice-note transcription',
      'Basic AI · 200 leads · 50 GB · 1 seat',
    ],
  },
  {
    key: 'studio', name: 'Studio', price: 59, founding: 29, popular: true,
    for: 'Growing teams with a full calendar.',
    feats: [
      'Everything in Creator, plus',
      'Instagram, Facebook and website capture',
      'Team collaboration, permissions and multi-pipeline',
      'Full AI: lead intelligence and next best actions, plus Media Studio culling and hero shots',
      'Contract depth: clause library, redlines, approvals, bulk send',
      'Analytics, reports and Google Calendar sync',
      '5 seats · 500 leads · 250 GB · desktop app (beta)',
    ],
  },
  {
    key: 'studio_plus', name: 'Studio+', price: 119, founding: 59,
    for: 'Established businesses that want it all under their own name.',
    feats: [
      'Everything in Studio, plus',
      'White label — remove every trace of WappFlow',
      'Desktop sync and the local AI engine',
      'Media Studio depth: style profiles and the story engine',
      'Priority support',
      '15 seats · 5,000 leads · 1 TB',
    ],
  },
  {
    key: 'enterprise', name: 'Enterprise', price: null, founding: null,
    for: 'Groups, franchises and businesses with their own rules.',
    feats: [
      'Everything in Studio+, plus',
      'API access and custom integrations',
      'Bring your own AI keys (BYOK)',
      'SSO and audit logs',
      'Dedicated support and custom branding',
      'Unlimited seats, leads and storage',
    ],
  },
];

const RANK = { creator: 1, studio: 2, studio_plus: 3, enterprise: 4 };

function Pricing({ authed, currentPlan }) {
  const [remote, setRemote] = useState(null);
  const [currency, setCurrency] = useState('USD');
  const [founding, setFounding] = useState({ open: true, remaining: 100, slots: 100 });
  const [showFounding, setShowFounding] = useState(true);

  useEffect(() => {
    let on = true;
    fetch(`${API}/plans`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!on || !d) return;
        const m = {};
        (d.plans || []).forEach((p) => { m[p.key] = p; });
        setRemote(m);
        if (d.currency) setCurrency(d.currency);
        if (d.founding) setFounding(d.founding);
      })
      .catch(() => {});
    return () => { on = false; };
  }, []);

  const sym = currency === 'USD' ? '$' : `${currency} `;
  const amount = (n) => (n == null ? null : `${sym}${Number(n).toLocaleString('en-US')}`);
  const std = (p) => (remote?.[p.key]?.price ?? p.price);
  const fnd = (p) => (remote?.[p.key]?.founding_price ?? p.founding);

  const live = founding.open && showFounding;

  return (
    <section className="lp-section" id="pricing">
      <div className="lp-container">
        <SectionHead
          eyebrow="Pricing" icon={CreditCard}
          title={<>One subscription instead of <span className="lp-gradient">seven</span>.</>}
          sub="Every plan includes the whole platform — the tiers differ in how much AI, team and depth you get, not in whether the modules exist."
        />

        {founding.open && (
          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <span className="lp-found-banner">
                <Crown size={15} />
                <span>
                  <strong>Founding 100</strong> — the first 100 businesses keep 50% off, permanently.
                  {founding.remaining != null && <> {founding.remaining} of {founding.slots} left.</>}
                </span>
              </span>
            </div>
          </Reveal>
        )}

        {founding.open && (
          <div className="lp-switch-wrap">
            <Reveal delay={60}>
              <div className="lp-switch" role="group" aria-label="Choose which price to show">
                <button type="button" className={`lp-switch-btn ${showFounding ? 'active' : ''}`}
                        aria-pressed={showFounding} onClick={() => setShowFounding(true)}>
                  Founding 100
                </button>
                <button type="button" className={`lp-switch-btn ${!showFounding ? 'active' : ''}`}
                        aria-pressed={!showFounding} onClick={() => setShowFounding(false)}>
                  Standard
                </button>
              </div>
            </Reveal>
          </div>
        )}

        <div className="lp-plans">
          {PLANS.map((p, n) => {
            const isCurrent = currentPlan === p.key;
            const showPrice = live && fnd(p) != null ? fnd(p) : std(p);
            const strike = live && fnd(p) != null ? std(p) : null;
            // Enterprise is always a conversation. Otherwise: strangers sign up,
            // and members get a tier-aware label — but only once we actually know
            // their tier. While the plan lookup is pending or has failed, "Upgrade
            // to Creator" would be a guess, and a wrong one for most of them.
            const cta = p.key === 'enterprise'
              ? { label: 'Talk to us', href: 'mailto:sales@wappflow.app?subject=Enterprise%20enquiry' }
              : !authed
                ? { label: 'Start free', href: '/signup' }
                : !currentPlan
                  ? { label: 'View plans', href: '/settings?tab=plan' }
                  : isCurrent
                    ? { label: 'Your plan', href: '/settings?tab=plan', disabled: true }
                    : RANK[p.key] > RANK[currentPlan]
                      ? { label: `Upgrade to ${p.name}`, href: '/settings?tab=plan' }
                      : { label: 'Change plan', href: '/settings?tab=plan' };

            return (
              <Reveal key={p.key} delay={n * 70}>
                <div className={`lp-plan ${p.popular ? 'lp-plan-pop' : ''}`}>
                  {p.popular && <span className="lp-plan-flag">MOST POPULAR</span>}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 className="lp-plan-name">{p.name}</h3>
                    {isCurrent && <span className="lp-plan-current"><Check size={11} /> CURRENT</span>}
                  </div>
                  <p className="lp-plan-for">{p.for}</p>

                  <div className="lp-plan-price">
                    <span className="lp-plan-amt">{amount(showPrice) ?? 'Custom'}</span>
                    {showPrice != null && <span className="lp-plan-per">/month</span>}
                  </div>
                  <div className="lp-plan-was">{strike != null ? `${amount(strike)} standard` : ' '}</div>

                  <div className="lp-plan-cta">
                    {cta.disabled ? (
                      <span className="lp-btn lp-btn-ghost lp-btn-block" aria-disabled="true" style={{ opacity: 0.65 }}>
                        {cta.label}
                      </span>
                    ) : cta.href.startsWith('/') ? (
                      <Link href={cta.href}
                            className={`lp-btn lp-btn-block ${p.popular ? 'lp-btn-primary' : 'lp-btn-ghost'}`}>
                        {cta.label} <ArrowRight size={15} />
                      </Link>
                    ) : (
                      // mailto — not a route, so not a <Link>.
                      <a href={cta.href}
                         className={`lp-btn lp-btn-block ${p.popular ? 'lp-btn-primary' : 'lp-btn-ghost'}`}>
                        {cta.label} <ArrowRight size={15} />
                      </a>
                    )}
                  </div>

                  <div className="lp-plan-feats">
                    {p.feats.map((f) => (
                      <span key={f} className="lp-plan-feat"><Check size={14} /> {f}</span>
                    ))}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal>
          <p className="lp-limits">
            Prices in {currency}, billed monthly. Every plan includes the CRM core — inbox,
            pipeline, timeline — plus every module: Contracts Studio, Media Studio, booking,
            client portal, print store and portfolio.
            <br />
            Cancel any time and export everything you have put in.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ═════════════════════════════════ FAQ ══════════════════════════════════ */

const FAQS = [
  {
    q: 'How does a WhatsApp message actually become a lead?',
    a: 'WappFlow connects to the WhatsApp number your clients already message. When someone new writes to you, a lead is created from that conversation on arrival — name, number, channel and the message itself — and lands on your pipeline. You do not fill in a form or copy anything across; the thread IS the record, and it stays attached to that client through contracts, invoices, bookings and delivery.',
  },
  {
    q: 'Is WappFlow only for photographers?',
    a: 'No. The core is an industry-agnostic CRM — leads, conversations, pipeline, one timeline per client — and everything else is a module on top of it. Media Studio is the module for businesses that ship creative work; if that is not you, you simply lean on the others: contracts, booking, invoicing, portals. New modules land on the same core, so the platform grows without the CRM ever changing shape.',
  },
  {
    q: 'Do I need a new phone number for WhatsApp?',
    a: 'No. WappFlow connects to the number your clients already message. Your history stays intact and your clients notice nothing except that you reply faster.',
  },
  {
    q: 'What actually happens when a contract is signed?',
    a: 'The invoice is raised on the terms in the signed contract, the project is created and linked to the client, the dates are held on your calendar, and the client portal opens. All four link back to the lead and write to one timeline. That chain is the reason the product exists — try it in the Contracts section above.',
  },
  {
    q: 'Does the AI message my clients on its own?',
    a: 'No. It drafts, scores and suggests — you approve. Nothing leaves your workspace without a person pressing send. If you would rather run the AI on your own provider account, Enterprise workspaces can bring their own keys.',
  },
  {
    q: 'Will my clients know I use WappFlow?',
    a: 'Only if you want them to. Every public page — booking, contract, invoice, gallery, portal, store — carries your business’s name, logo and colour. On Studio+ and above, white label removes every remaining trace.',
  },
  {
    q: 'Can I move off it later?',
    a: 'Yes, and we would rather say so plainly. Full data export is available on every plan. Your clients, contracts, invoices and media belong to you.',
  },
  {
    q: 'Do you handle timezones properly?',
    a: 'Yes — and it is a real problem, not a checkbox. Bookings are stored against your business’s actual timezone, so a 9am booking stays 9am for your client regardless of where the server is or when the clocks change.',
  },
  {
    q: 'Can my whole team use it?',
    a: 'From the Studio plan up. Shared inbox with assignment, role-based permissions and team collaboration on projects — everyone working the same client record without stepping on each other.',
  },
  {
    q: 'We ship creative work — what about really large shoots?',
    a: 'Media Studio is built for volume — bulk culling, scoring, collections and expiring galleries. Studios with heavy local libraries can add the desktop app (in beta) to run AI scoring on their own hardware.',
  },
];

function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <section className="lp-section" id="faq">
      <div className="lp-container">
        <SectionHead
          eyebrow="Questions" icon={MessageSquare}
          title={<>The things people <span className="lp-gradient">actually ask</span>.</>}
        />

        <div className="lp-faq">
          {FAQS.map((f, n) => (
            <Reveal key={f.q} delay={n * 40}>
              <div className={`lp-faq-item ${open === n ? 'open' : ''}`}>
                <button
                  type="button"
                  className="lp-faq-q"
                  aria-expanded={open === n}
                  aria-controls={`lp-faq-a-${n}`}
                  onClick={() => setOpen(open === n ? -1 : n)}
                >
                  <span>{f.q}</span>
                  <ChevronDown size={19} className="lp-faq-chev" />
                </button>
                {open === n && <div className="lp-faq-a" id={`lp-faq-a-${n}`}>{f.a}</div>}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════ FINAL CTA ═══════════════════════════════ */

function FinalCta({ authed }) {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal>
          <div className="lp-final">
            <h2 className="lp-final-h">
              How many leads did<br />WhatsApp swallow last month?
            </h2>
            <p className="lp-final-p">
              Connect your number, watch the next enquiry land as a tracked lead, and take
              that one client all the way through — contract, invoice, delivery. You will
              not want to go back to the scroll.
            </p>
            <div className="lp-hero-cta">
              {authed ? (
                <Link href="/dashboard" className="lp-btn lp-btn-primary lp-btn-lg">
                  Open WappFlow <ArrowRight size={17} />
                </Link>
              ) : (
                <>
                  <Link href="/signup" className="lp-btn lp-btn-primary lp-btn-lg">
                    Start free <ArrowRight size={17} />
                  </Link>
                  <a href="#pricing" className="lp-btn lp-btn-ghost lp-btn-lg">See pricing</a>
                </>
              )}
            </div>
            <div className="lp-hero-note">
              <span><Check size={14} /> No credit card</span>
              <span><Check size={14} /> Founding 100 locks 50% off forever</span>
              <span><Check size={14} /> Export your data any time</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ═══════════════════════════════ FOOTER ══════════════════════════════════ */

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid">
          <div>
            <Link href="/" className="lp-brand">
              <span className="lp-brand-mark"><Zap size={17} fill="currentColor" /></span>
              WappFlow
            </Link>
            <p className="lp-footer-about">
              One CRM at the core of your business, with the modules you need connected
              around it. One client record, one timeline — from the first message to the
              final delivery.
            </p>
          </div>

          <div>
            <div className="lp-footer-h">Platform</div>
            <div className="lp-footer-col">
              <a href="#modules">Modules</a>
              <a href="#chain">How it works</a>
              <a href="#ai">AI</a>
              <a href="#contracts">Contracts Studio</a>
              <a href="#studio">Media Studio</a>
            </div>
          </div>

          <div>
            <div className="lp-footer-h">Company</div>
            <div className="lp-footer-col">
              <a href="#pricing">Pricing</a>
              <a href="#security">Security</a>
              <a href="#faq">FAQ</a>
              <a href="mailto:hello@wappflow.app">Contact</a>
            </div>
          </div>

          <div>
            <div className="lp-footer-h">Account</div>
            <div className="lp-footer-col">
              <Link href="/login">Sign in</Link>
              <Link href="/signup">Start free</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </div>
          </div>
        </div>

        <div className="lp-footer-bar">
          <span>© {new Date().getFullYear()} WappFlow. All rights reserved.</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={13} /> Tenant isolation tested continuously
            </span>
            {FLUX_PARKED && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: 0.7 }}>
                <Sparkles size={13} /> Flux — content engine, coming soon
              </span>
            )}
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ═════════════════════════════════ PAGE ═════════════════════════════════ */

export default function Landing() {
  const [authed, setAuthed] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);

  // Signed-in visitors get "Open WappFlow" instead of "Start free", and their
  // own tier marked in the pricing table. Entirely non-blocking: if any of it
  // fails the page renders exactly as it does for a stranger.
  useEffect(() => {
    let token = null;
    try { token = localStorage.getItem('token'); } catch { /* storage blocked */ }
    if (!token) return;
    setAuthed(true);

    fetch(`${API}/workspace/plan`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const p = (d?.plan?.plan || d?.plan || '').toString().toLowerCase();
        if (p) setCurrentPlan(p);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="lp-root">
      <LandingStyles />

      <a href="#lp-main" className="lp-skip">Skip to content</a>

      <div className="lp-bg" aria-hidden="true">
        <div className="lp-bg-grid" />
        <div className="lp-bg-glow lp-bg-glow-1" />
        <div className="lp-bg-glow lp-bg-glow-2" />
        <div className="lp-bg-glow lp-bg-glow-3" />
        <div className="lp-bg-glow lp-bg-glow-4" />
      </div>

      <Nav authed={authed} />

      <main id="lp-main">
        <Hero authed={authed} />
        <Strip />
        <Problem />
        {/* What it IS (core + modules) before HOW it works — the hierarchy is the message. */}
        <Modules />
        <Spine />
        <Ai />
        <Contracts />
        <MediaStudio />
        <ClientSide />
        <Security />
        <Pricing authed={authed} currentPlan={currentPlan} />
        <Faq />
        <FinalCta authed={authed} />
      </main>

      <Footer />
    </div>
  );
}
