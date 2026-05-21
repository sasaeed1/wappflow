import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service',
  description: 'WappFlow Terms of Service.',
};

const SECTIONS = [
  { h: '1. Agreement to These Terms', p: 'These Terms of Service ("Terms") govern your access to and use of WappFlow (the "Service"), operated by [Company Legal Name] ("we", "us", "our"). By creating an account or using the Service you agree to be bound by these Terms. If you do not agree, do not use the Service.' },
  { h: '2. The Service', p: 'WappFlow is a customer-relationship platform that unifies messaging channels (including WhatsApp, Instagram, Facebook and website chat), lead management, invoicing, team collaboration and AI-assisted features. We may add, change or remove features over time to improve the Service.' },
  { h: '3. Accounts & Eligibility', p: 'You must provide accurate information when registering and keep your credentials secure. You are responsible for all activity under your account and for your team members’ use of the workspace. You must be at least 18 years old and able to form a binding contract to use the Service.' },
  { h: '4. Acceptable Use', p: 'You agree not to use the Service to send spam or unlawful, deceptive, infringing or abusive content; to violate the terms of any connected platform (including WhatsApp’s and Meta’s policies); to attempt to breach security or disrupt the Service; or to resell the Service without authorization. You are solely responsible for obtaining consent to contact your customers where required by law.' },
  { h: '5. Subscriptions, Plans & Billing', p: 'The Service is offered on Free and paid plans. Paid plans are billed in advance on a recurring basis and are non-refundable except where required by law. Plan limits and pricing are described at sign-up and may change with reasonable notice. Failure to pay may result in suspension or downgrade of your account.' },
  { h: '6. Your Data & Content', p: 'You retain ownership of the leads, messages, files and other content you bring to or generate within the Service ("Customer Data"). You grant us a limited license to host, process and display Customer Data solely to provide and improve the Service. Each workspace’s data is logically isolated from other workspaces.' },
  { h: '7. AI Features', p: 'The Service includes AI-assisted features such as lead scoring, summaries, reply suggestions and a knowledge base. AI output may be inaccurate or incomplete and is provided to assist — not replace — your judgment. You are responsible for reviewing AI-generated content before relying on or sending it.' },
  { h: '8. Third-Party Services', p: 'The Service integrates with third-party platforms (for example WhatsApp, Meta, Google and email providers). Your use of those platforms is governed by their own terms, and we are not responsible for their availability, changes or actions. Connecting a third-party account authorizes us to exchange data with it as needed to provide the Service.' },
  { h: '9. Intellectual Property', p: 'The Service, including its software, design and branding, is owned by us and protected by intellectual-property laws. These Terms do not grant you any right in our intellectual property except the limited right to use the Service as permitted here.' },
  { h: '10. Disclaimers', p: 'The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied, including fitness for a particular purpose and non-infringement. We do not warrant that the Service will be uninterrupted, error-free or secure.' },
  { h: '11. Limitation of Liability', p: 'To the maximum extent permitted by law, we will not be liable for any indirect, incidental, special or consequential damages, or for lost profits, revenue or data. Our total liability for any claim relating to the Service is limited to the amount you paid us for the Service in the three months preceding the claim.' },
  { h: '12. Termination', p: 'You may stop using the Service and close your account at any time. We may suspend or terminate access if you breach these Terms or to comply with the law. On termination, your right to use the Service ends; you may request an export of Customer Data within a reasonable period before it is deleted.' },
  { h: '13. Changes to These Terms', p: 'We may update these Terms from time to time. Material changes will be communicated through the Service or by email. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.' },
  { h: '14. Governing Law', p: 'These Terms are governed by the laws of [jurisdiction], without regard to conflict-of-law rules. Any disputes will be subject to the exclusive jurisdiction of the courts located in [jurisdiction].' },
  { h: '15. Contact', p: 'Questions about these Terms can be sent to [legal@yourcompany.com].' },
];

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 22px 80px' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, textDecoration: 'none', marginBottom: 30 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: 15 }}>W</div>
          <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>WappFlow</span>
        </Link>

        <h1 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.5px' }}>Terms of Service</h1>
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
          <Link href="/privacy" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>Privacy Policy</Link>
          <Link href="/" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-dim)', textDecoration: 'none' }}>Back to WappFlow</Link>
        </div>
      </div>
    </div>
  );
}
