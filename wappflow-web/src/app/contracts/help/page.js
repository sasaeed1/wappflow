'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, FileText, Package, Upload, Palette, Image as ImageIcon, Send, Eye,
  PenLine, Users, Bell, ShieldCheck, Zap, CreditCard, Sparkles, BarChart3, FolderOpen,
} from 'lucide-react';

const SECTIONS = [
  { icon: FileText, title: 'What is Contracts Studio?', body: [
    'Contracts Studio turns proposals, contracts and agreements into a premium, interactive client experience — not a static PDF. Documents are built from content blocks, sent over WhatsApp/email/link, signed on a beautiful mobile page, and tied directly into your CRM, invoices and projects.',
    'Every document lives inside the relationship: the client it belongs to, the pipeline stage it moves, the invoice it creates, the project it kicks off.',
  ] },
  { icon: Package, title: 'Creating a document', body: [
    'Click New document. Start three ways:',
    '• From a starter pack — curated, ready-to-edit templates (Wedding Proposal, Portrait Agreement, Commercial SOW, NDA).',
    '• Blank — pick a type (contract, proposal, quote, NDA, SOW, retainer, agreement) and build from scratch.',
    '• Upload a file — attach an existing PDF or image and send it straight for signing.',
    'Link a client (lead) so the document is filed under them and automations can act on the relationship.',
  ] },
  { icon: Palette, title: 'The block builder', body: [
    'Documents are made of blocks: headings, text, callouts, images, galleries, video, pricing tables, packages, optional add-ons, timelines, checklists, FAQs, testimonials, signature and approval blocks, and more.',
    'Add a block with the + between any two blocks, reorder with the arrows, and edit inline. Everything autosaves.',
    'Three workspace themes — Monochrome, Editorial, Executive — restyle the entire document instantly. Set a default in Settings.',
  ] },
  { icon: Package, title: 'Interactive proposals', body: [
    'Package and add-on blocks are selectable by the client. They tap the package they want and toggle add-ons, and the running total updates live on the page — turning a quote into an interactive checkout.',
    'Whatever they choose is captured at signing and flows into the auto-created invoice.',
  ] },
  { icon: ImageIcon, title: 'Letterhead', body: [
    'Upload a letterhead image once in Settings. It appears at the top of every document automatically.',
    'It’s optional per document — toggle it off in a document’s ⚙ settings when you don’t want it.',
  ] },
  { icon: Upload, title: 'Uploading a file to sign', body: [
    'Already have a PDF or signed-elsewhere contract? Attach it when creating a document, or in a document’s ⚙ settings → Document → Upload file.',
    'The client sees the file rendered in the portal and signs it with the same secure flow — signature, consent, timestamp and hash.',
  ] },
  { icon: Send, title: 'Sending', body: [
    'Hit Send to generate a secure, tokenized link and deliver it over WhatsApp and/or email to the linked client — or just copy the link to share yourself.',
    'Set an expiry (3/7/14/30 days or never). Expired links show the client a clean “link expired” screen.',
  ] },
  { icon: Eye, title: 'The client experience', body: [
    'Clients open a fast, mobile-first page styled in your theme — no login required, the link is the key.',
    'They can ask questions with the “Ask a question” widget — answered instantly and grounded only in your document.',
  ] },
  { icon: PenLine, title: 'Signing', body: [
    'Clients type their legal name, draw their signature, and agree to an ESIGN/UETA consent. IP, timestamp and device are recorded, and a SHA-256 hash seals the signed document.',
  ] },
  { icon: Users, title: 'Multiple signers', body: [
    'Add signers (client, company, witness, co-signer) in the Signers & activity panel. Signing proceeds in order; the document completes when everyone has signed.',
    'The same panel shows each signer’s live status and the full activity timeline.',
  ] },
  { icon: Bell, title: 'Reminders & expiration', body: [
    'Send a reminder to anyone who hasn’t signed yet — re-delivers the link over WhatsApp/email. Expired documents are marked automatically.',
  ] },
  { icon: ShieldCheck, title: 'Approvals', body: [
    'Require internal sign-off before a document can be sent. Turn on “Require approval” in ⚙ settings; sending is locked until someone approves.',
  ] },
  { icon: Zap, title: 'Automations', body: [
    'In ⚙ settings, choose what happens the moment a document is signed: move the client down the pipeline, create an invoice from their selection, and/or spin up a Media Studio project — automatically.',
  ] },
  { icon: CreditCard, title: 'Payments', body: [
    'Attach payment terms — deposit (% or fixed), full, milestones, plan or retainer. On signing, the auto-created invoice bills the right amount and notes the balance.',
  ] },
  { icon: Sparkles, title: 'AI assistant', body: [
    'Draft a whole document from a one-line brief, improve any block’s wording, summarize the document, or flag risky/missing clauses — all from the ✦ AI panel in the builder.',
  ] },
  { icon: BarChart3, title: 'Analytics', body: [
    'The Analytics page shows your funnel (sent → viewed → signed), acceptance rate, signed revenue, total views, average time on page, and time-to-sign — plus your most-viewed documents.',
  ] },
  { icon: FolderOpen, title: 'Client Vault', body: [
    'Every client’s documents filed together — counts, signed totals, contact info, and one-click access to each document.',
  ] },
];

export default function ContractsHelpPage() {
  const router = useRouter();
  const [open, setOpen] = useState(0);
  return (
    <>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px 60px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px', letterSpacing: '-0.5px' }}>Help &amp; guide</h1>
        <p style={{ fontSize: 14.5, color: 'var(--text-muted)', margin: '0 0 24px' }}>Everything Contracts Studio can do — from your first proposal to a signed deal that runs itself.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SECTIONS.map((s, i) => {
            const isOpen = open === i;
            return (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                <button onClick={() => setOpen(isOpen ? -1 : i)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '15px 18px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><s.icon size={17} style={{ color: 'var(--accent)' }} /></span>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{s.title}</span>
                  <ChevronDown size={18} style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
                </button>
                {isOpen && (
                  <div style={{ padding: '0 18px 18px 65px' }}>
                    {s.body.map((p, j) => <p key={j} style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.65, margin: '0 0 8px' }}>{p}</p>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 28, padding: 20, borderRadius: 14, background: 'var(--accent-light)', border: '1px solid var(--border)', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--text)', margin: '0 0 12px', fontWeight: 600 }}>Ready to send your first document?</p>
          <button onClick={() => router.push('/contracts')} style={{ padding: '11px 22px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14 }}>Go to Overview</button>
        </div>
      </div>
    </>
  );
}
