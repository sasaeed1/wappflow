import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy',
  description: 'WappFlow Privacy Policy.',
};

const SECTIONS = [
  { h: '1. Introduction', p: 'This Privacy Policy explains how WappFlow, operated by [Company Legal Name] ("we", "us", "our"), collects, uses and protects information when you use our customer-relationship platform (the "Service"). By using the Service you agree to the practices described here.' },
  { h: '2. Information You Provide', p: 'We collect the information you give us when you create an account and use the Service — including your name, business name, email address, phone number, billing details, team members you invite, and the content you create such as leads, notes, invoices and knowledge-base documents.' },
  { h: '3. Customer & Messaging Data', p: 'To provide the Service we process the contact details and conversations of the customers you communicate with through connected channels (WhatsApp, Instagram, Facebook, website chat and email). This data belongs to you; we act as a processor on your behalf and only use it to operate the Service. You are responsible for having a lawful basis to collect and message your customers.' },
  { h: '4. Information Collected Automatically', p: 'When you use the Service we automatically collect technical data such as log records, device and browser type, IP address and usage activity. This helps us keep the Service secure, diagnose problems and improve performance.' },
  { h: '5. How We Use Information', p: 'We use information to provide and maintain the Service; to power features such as the unified inbox, lead intelligence and AI assistance; to process payments; to communicate with you about your account; to provide support; to ensure security and prevent abuse; and to comply with legal obligations.' },
  { h: '6. AI Processing', p: 'Some features use AI models to analyze conversations and generate summaries, scores and suggestions. Content needed for these features may be sent to AI providers strictly to produce a result for your workspace. Your data is not used to train third-party public models, and AI output is not shared between workspaces.' },
  { h: '7. How We Share Information', p: 'We do not sell your personal information. We share data only with service providers who help us run the Service (such as hosting, AI, email and payment providers) under appropriate confidentiality and data-protection commitments, with connected platforms you choose to integrate, or where required by law.' },
  { h: '8. Cookies', p: 'We use essential cookies and local storage to keep you signed in, remember your preferences (such as theme) and operate the Service. We do not use cookies for third-party advertising. You can clear cookies in your browser, though some features may stop working.' },
  { h: '9. Data Security', p: 'We use technical and organizational measures — including encrypted connections (HTTPS), access controls and workspace-level data isolation — to protect your information. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.' },
  { h: '10. Data Retention', p: 'We retain your information for as long as your account is active and as needed to provide the Service. Deleted leads are kept in Trash for a limited period before permanent removal. After account closure we delete or anonymize data within a reasonable period, except where retention is required by law.' },
  { h: '11. Your Rights', p: 'Depending on your location, you may have the right to access, correct, export or delete your personal information, and to object to or restrict certain processing. You can exercise many of these rights directly in the Service, or by contacting us using the details below.' },
  { h: '12. International Transfers', p: 'Your information may be processed in countries other than your own. Where it is, we take steps to ensure it receives an adequate level of protection consistent with applicable data-protection law.' },
  { h: '13. Children', p: 'The Service is intended for businesses and is not directed to children under 18. We do not knowingly collect personal information from children.' },
  { h: '14. Changes to This Policy', p: 'We may update this Privacy Policy from time to time. Material changes will be communicated through the Service or by email, and the "Last updated" date above will be revised.' },
  { h: '15. Contact', p: 'For privacy questions or to exercise your rights, contact us at [privacy@yourcompany.com].' },
];

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 22px 80px' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, textDecoration: 'none', marginBottom: 30 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: 15 }}>W</div>
          <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>WappFlow</span>
        </Link>

        <h1 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.5px' }}>Privacy Policy</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 20px' }}>Last updated: May 2026</p>

        <div style={{ padding: '14px 18px', background: 'var(--warning-bg)', border: '1.5px solid var(--warning-border)', borderRadius: 12, marginBottom: 32 }}>
          <p style={{ fontSize: 13, color: 'var(--warning-text)', margin: 0, lineHeight: 1.6 }}>
            This is a starting-point draft. Replace the bracketed placeholders with your company details and have it reviewed by a qualified lawyer before publishing.
          </p>
        </div>

        {SECTIONS.map(s => (
          <section key={s.h} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 7px', color: 'var(--text)' }}>{s.h}</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.7, color: 'var(--text-muted)', margin: 0 }}>{s.p}</p>
          </section>
        ))}

        <div style={{ marginTop: 40, paddingTop: 22, borderTop: '1px solid var(--border)', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <Link href="/terms" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>Terms of Service</Link>
          <Link href="/" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-dim)', textDecoration: 'none' }}>Back to WappFlow</Link>
        </div>
      </div>
    </div>
  );
}
