'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Rocket, Images, ListChecks, SlidersHorizontal, Share2, CheckSquare,
  BookOpen, Film, Globe, Palette, Keyboard, HelpCircle, LifeBuoy, ChevronRight,
} from 'lucide-react';
import NavBar from '../../../components/StudioShell';

function Kbd({ children }) {
  return <kbd style={{ display: 'inline-block', minWidth: 20, textAlign: 'center', padding: '2px 7px', borderRadius: 6, border: '1px solid var(--ms-line)', background: 'var(--ms-surface-2)', fontFamily: 'var(--ms-font-label)', fontSize: 11, fontWeight: 600, color: 'var(--ms-ink)' }}>{children}</kbd>;
}
function P({ children }) { return <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ms-ink-2)', margin: '0 0 12px' }}>{children}</p>; }
function Steps({ items }) {
  return (
    <ol style={{ margin: '0 0 12px', padding: 0, listStyle: 'none', counterReset: 'step' }}>
      {items.map((t, i) => (
        <li key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 999, background: 'var(--ms-accent)', color: 'var(--ms-on-accent)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
          <span style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ms-ink-2)' }}>{t}</span>
        </li>
      ))}
    </ol>
  );
}
function ShortcutTable({ rows }) {
  return (
    <div style={{ border: '1px solid var(--ms-line)', borderRadius: 10, overflow: 'hidden' }}>
      {rows.map(([k, d], i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderTop: i ? '1px solid var(--ms-line)' : 'none' }}>
          <span style={{ minWidth: 132, display: 'flex', gap: 5, flexWrap: 'wrap' }}>{k.map((key, j) => <Kbd key={j}>{key}</Kbd>)}</span>
          <span style={{ fontSize: 13.5, color: 'var(--ms-ink-2)' }}>{d}</span>
        </div>
      ))}
    </div>
  );
}

const SECTIONS = [
  {
    id: 'start', icon: Rocket, title: 'Getting started', keywords: 'welcome intro overview shoot project begin first',
    body: (
      <>
        <P>Studio is your control-first creative suite — bring photographs and video in, cull with AI beside you (never deciding for you), deliver beautiful client galleries, cut reels, and publish a portfolio that sells itself.</P>
        <Steps items={[
          <>From <strong>Shoots</strong>, click <em>New shoot</em> and name it (optionally link a CRM client).</>,
          <>Open the shoot and <strong>Upload</strong> photos and videos — they share one uploader.</>,
          <>Use <strong>Cull</strong> to keep the best, <strong>Galleries</strong> to deliver, and <strong>Reels</strong> for video.</>,
          <>Turn your best published work into a public <strong>Portfolio</strong>.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'library', icon: Images, title: 'Shoots & library', keywords: 'upload photos videos media all photos videos toggle grid collage lightbox view',
    body: (
      <>
        <P>Each shoot holds all its media. Upload photos and video together — the same <strong>Upload media</strong> button accepts both.</P>
        <P>The <strong>All / Photos / Videos</strong> switch at the top of the Library filters what you see. Videos show a poster, a play badge and their duration; click any item to open it full-screen (video plays inline).</P>
        <P>Use the view control to switch between <strong>Collage</strong> (natural sizes — the default), grid sizes, and large. Set your preferred default in <em>Settings → Defaults</em>.</P>
      </>
    ),
  },
  {
    id: 'cull', icon: ListChecks, title: 'Culling', keywords: 'cull keep reject maybe rating stars zoom compare duplicates keyboard loupe filmstrip',
    body: (
      <>
        <P>Culling is keyboard-first. The photo fills the screen; advisory AI (focus, exposure, quality, duplicates) sits beside your decision — it never culls for you.</P>
        <P>Mark <strong>Keep / Maybe / Reject</strong>, rate 1–5, zoom to 100%, and compare duplicate sets side by side. When you&apos;re happy, build a gallery straight from your keepers.</P>
        <ShortcutTable rows={[
          [['←', '→'], 'Previous / next photo'],
          [['P'], 'Keep'], [['X'], 'Reject'], [['M'], 'Maybe'], [['U'], 'Undo decision'],
          [['1', '–', '5'], 'Star rating (0 clears)'],
          [['Z'], 'Zoom to 100% (scroll to zoom, drag to pan)'],
          [['C'], 'Compare / duplicate set'],
          [['E'], 'Edit'], [['F'], 'Presets'], [['I'], 'Info & AI'],
        ]} />
      </>
    ),
  },
  {
    id: 'edit', icon: SlidersHorizontal, title: 'Editing & presets', keywords: 'edit exposure contrast warmth crop straighten rotate presets before after reset cancel auto enhance copy paste keepers',
    body: (
      <>
        <P>Open <strong>Edit</strong> (<Kbd>E</Kbd>) for exposure, contrast, warmth, tint, saturation, fade, vignette, grain, B&amp;W, rotate/straighten and crop. Edits are non-destructive — your original is never overwritten.</P>
        <P><strong>Before / After</strong> (<Kbd>B</Kbd>): drag the centre divider to compare your edit against the untouched original. <strong>Presets</strong> (<Kbd>F</Kbd>) include an <em>Original</em> tile to revert.</P>
        <P><strong>Cancel</strong> discards unsaved changes; <strong>Reset to original</strong> snaps everything back and clears any baked edits. <strong>Apply to keepers</strong> renders the same look across every Keep in one go. Copy/paste a look with <Kbd>⇧C</Kbd> / <Kbd>⇧V</Kbd>.</P>
      </>
    ),
  },
  {
    id: 'galleries', icon: Share2, title: 'Galleries & delivery', keywords: 'gallery deliver publish share link whatsapp visibility password download export zip client',
    body: (
      <>
        <P>Group photos into a <strong>Gallery</strong>, set its visibility (private, password, or public) and download policy, then <strong>Publish &amp; send</strong> — the share link goes to your client over WhatsApp automatically (or copy it to share yourself).</P>
        <P><strong>Export ZIP</strong> bundles the gallery; high-res ships clean originals while web exports can carry your watermark.</P>
      </>
    ),
  },
  {
    id: 'proofing', icon: CheckSquare, title: 'Proofing & selections', keywords: 'proofing selection client favourites approve request changes quota',
    body: (
      <>
        <P><strong>Request selections</strong> lets your client pick favourites right inside their gallery, with an optional quota. You&apos;ll see their picks live and can <strong>Approve</strong> or <strong>Request changes</strong>.</P>
      </>
    ),
  },
  {
    id: 'albums', icon: BookOpen, title: 'Albums', keywords: 'album layout spreads pages autofill pdf export design',
    body: (
      <>
        <P>Lay out print-ready <strong>Albums</strong> with spreads and flexible layouts. Autofill from your keepers, reorder pages, and export a PDF.</P>
      </>
    ),
  },
  {
    id: 'reels', icon: Film, title: 'Reels & Video Studio', keywords: 'reels video editor timeline templates ai drafts export aspect music text luts grade keyframes',
    body: (
      <>
        <P>Turn footage and photos into reels. Start from a <strong>Template</strong> (12 named packs, 15/30/45/60s), an <strong>AI Draft</strong> (built from your best, highest-rated shots), or a blank timeline.</P>
        <P>The editor gives you a media rail, a preview stage with safe-area guides, a draggable/trim timeline, colour grading + LUT looks, text, music, keyframed motion, and one-click export across 9 presets (up to 4K).</P>
      </>
    ),
  },
  {
    id: 'portfolio', icon: Globe, title: 'Portfolio', keywords: 'portfolio public link handle share themes curate auto include published showcase website',
    body: (
      <>
        <P>Your <strong>Portfolio</strong> is a public, shareable showcase. Published galleries flow in automatically (raw shoots never do) — and you stay in full control of what appears.</P>
        <Steps items={[
          <>Open <strong>Portfolio</strong> and choose one of <strong>10 themes</strong>.</>,
          <>Add work via <em>Add from published</em>, or upload showcase pieces directly. Drag to reorder, ★ to feature, set any image as the cover.</>,
          <>Set your identity, contact and a memorable <strong>/folio/handle</strong> link.</>,
          <>Toggle <strong>Public</strong>, then <strong>Copy link</strong> or <strong>Send to client</strong> over WhatsApp — one click.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'themes', icon: Palette, title: 'Studio themes', keywords: 'theme monochrome editorial cinema appearance look dark light',
    body: (
      <>
        <P>The whole Studio comes in three identities — <strong>Monochrome</strong> (museum), <strong>Editorial</strong> (magazine), and <strong>Cinema</strong> (film). Switch from the top bar or <em>Settings → Appearance</em>; it changes typography, colour and motion everywhere.</P>
        <P>Your <em>portfolio</em> has its own separate set of 10 themes — independent of the studio look.</P>
      </>
    ),
  },
  {
    id: 'shortcuts', icon: Keyboard, title: 'Keyboard shortcuts', keywords: 'keyboard shortcuts keys hotkeys reference cull',
    body: (
      <>
        <P>Most speed lives in the cull view:</P>
        <ShortcutTable rows={[
          [['←', '→'], 'Navigate photos'], [['P', 'X', 'M'], 'Keep / Reject / Maybe'], [['U'], 'Undo decision'],
          [['1–5'], 'Rate'], [['Z'], 'Zoom 100%'], [['C'], 'Compare'], [['B'], 'Before / after (in edit)'],
          [['E', 'F', 'I'], 'Edit / Presets / Info'], [['⇧C', '⇧V'], 'Copy / paste edits'], [['Esc'], 'Close / exit'],
        ]} />
      </>
    ),
  },
  {
    id: 'faq', icon: HelpCircle, title: 'FAQ & troubleshooting', keywords: 'faq help problem cache refresh whatsapp not connected video processing raw support',
    body: (
      <>
        <P><strong>I deployed but don&apos;t see changes.</strong> Hard-refresh the page (<Kbd>Ctrl</Kbd>+<Kbd>⇧</Kbd>+<Kbd>R</Kbd>) — your browser may be holding the old version.</P>
        <P><strong>WhatsApp send didn&apos;t work.</strong> Connect a number in WappFlow CRM settings, and make sure the client has a phone on file. You can always copy the link instead.</P>
        <P><strong>A video has no poster yet.</strong> Posters and previews are generated in the background shortly after upload — give it a moment and refresh.</P>
        <P><strong>AI hints are wrong / missing.</strong> They&apos;re advisory and computed on upload; older photos may pre-date a metric. They never change your decisions.</P>
      </>
    ),
  },
];

export default function StudioHelpPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState('start');

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) router.push('/login?next=/studio/help');
  }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return SECTIONS;
    return SECTIONS.filter(s => (s.title + ' ' + s.keywords).toLowerCase().includes(t));
  }, [q]);

  const go = (id) => {
    setActive(id);
    const el = document.getElementById(`help-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <NavBar>
      <div className="ms-page" style={{ maxWidth: 1180 }}>
        {/* hero */}
        <div style={{ textAlign: 'center', padding: 'clamp(10px,3vw,30px) 0 clamp(20px,3vw,34px)' }}>
          <span style={{ display: 'inline-flex', width: 52, height: 52, borderRadius: 14, background: 'var(--ms-accent)', color: 'var(--ms-on-accent)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><LifeBuoy size={24} /></span>
          <h1 className="ms-display" style={{ fontSize: 'clamp(32px, 5vw, 64px)', marginBottom: 10 }}>How can we help?</h1>
          <p className="ms-lede" style={{ margin: '0 auto', maxWidth: 540 }}>Everything about shoots, culling, galleries, reels and your portfolio.</p>
          <div style={{ position: 'relative', maxWidth: 520, margin: '24px auto 0' }}>
            <Search size={17} style={{ position: 'absolute', left: 16, top: 14, color: 'var(--ms-ink-3)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search help…" className="ms-input" style={{ paddingLeft: 44, height: 48, fontSize: 15, borderRadius: 999 }} autoFocus />
          </div>
        </div>

        <div className="ms-workgrid" style={{ gridTemplateColumns: '230px minmax(0,1fr)', alignItems: 'start' }}>
          {/* sidebar TOC */}
          <aside className="ms-workaside" style={{ top: 76 }}>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {SECTIONS.map(s => (
                <button key={s.id} onClick={() => go(s.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: active === s.id ? 'var(--ms-surface-2)' : 'transparent', color: active === s.id ? 'var(--ms-ink)' : 'var(--ms-ink-2)',
                  fontSize: 13, fontWeight: active === s.id ? 600 : 400, fontFamily: 'var(--ms-font-ui)',
                }}>
                  <s.icon size={15} style={{ flexShrink: 0, opacity: 0.8 }} /> <span style={{ flex: 1 }}>{s.title}</span>
                  {active === s.id && <ChevronRight size={13} />}
                </button>
              ))}
            </nav>
          </aside>

          {/* content */}
          <div className="ms-workmain">
            {shown.length === 0 ? (
              <div className="ms-empty-soft">No help articles match “{q}”. Try another term.</div>
            ) : shown.map(s => (
              <section key={s.id} id={`help-${s.id}`} style={{ marginBottom: 40, scrollMarginTop: 80 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ display: 'inline-flex', width: 36, height: 36, borderRadius: 10, background: 'var(--ms-surface-2)', color: 'var(--ms-spark)', alignItems: 'center', justifyContent: 'center' }}><s.icon size={18} /></span>
                  <h2 className="ms-h2" style={{ fontSize: 'clamp(20px, 2.4vw, 28px)' }}>{s.title}</h2>
                </div>
                <div className="ms-panel" style={{ padding: 'clamp(18px, 2.2vw, 26px)' }}>{s.body}</div>
              </section>
            ))}

            <div style={{ borderTop: '1px solid var(--ms-line)', paddingTop: 22, marginTop: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, color: 'var(--ms-ink-2)', flex: 1 }}>Still stuck? The Studio Copilot (bottom-right) can answer in context and take actions for you.</span>
              <button onClick={() => router.push('/studio/settings')} className="ms-btn-ghost">Back to settings</button>
            </div>
          </div>
        </div>
      </div>
    </NavBar>
  );
}
