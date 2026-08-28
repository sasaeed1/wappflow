'use client';

import { useState } from 'react';
import {
  HelpCircle, Search, ChevronDown, ChevronRight,
  MessageSquare, Users, DollarSign, BarChart2, Settings,
  Smartphone, Mail, Bell, Zap, BookOpen, Globe,
  CheckCircle, Star, Upload, Tag, Brain, UserCheck,
  FileText, Keyboard, Lightbulb, ArrowRight, Shield,
  RefreshCw, Volume2, Calendar, Layers
} from 'lucide-react';

import { MODULE_SECTIONS } from './sections-modules';

// The module sections live in their own file: this page was written when the
// product was a WhatsApp CRM, and everything built since — Media Studio,
// Contracts Studio, Booking, the client portal and print store, the reel
// editor, the apps, the plan model — was undocumented. Spliced in before
// Shortcuts so the reference material stays last.
const SECTIONS = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    icon: Zap,
    color: '#6366f1',
    description: 'Setup your workspace, connect WhatsApp, and start managing leads',
    articles: [
      { title: 'Connecting WhatsApp', body: 'Go to the WhatsApp page from the sidebar. You\'ll see a QR code — open WhatsApp on your phone, go to Settings → Linked Devices → Link a Device, then scan the QR code. Once connected, incoming messages will automatically create leads and appear in real-time.' },
      { title: 'Auto-creating leads from messages', body: 'When a customer sends you a WhatsApp message for the first time, WappFlow automatically creates a lead with their name, phone number, and message. All subsequent messages appear in that lead\'s chat panel.' },
      { title: 'Adding a lead manually', body: 'Click the "+ New Lead" button on the Dashboard. Fill in the customer\'s name, phone number, and any other details. You can also set the status, assign a team member, and add tags immediately.' },
      { title: 'Understanding the Kanban pipeline', body: 'The Kanban board shows all your leads organized by status: New → Contacted → Interested → Negotiating → Won/Lost. Drag and drop cards between columns to update their status, or click any card to open the full lead profile.' },
      { title: 'Bulk importing leads via CSV', body: 'Go to Dashboard → Bulk Upload, download the CSV template, fill in your lead data (name, phone, email, status, source), and upload. WappFlow will automatically skip duplicates based on phone number.' },
    ]
  },
  {
    id: 'leads',
    label: 'Leads Management',
    icon: Users,
    color: '#06b6d4',
    description: 'Create, assign, filter, and manage your entire lead pipeline',
    articles: [
      { title: 'Assigning leads to team members', body: 'Open the lead profile and find the "Assigned To" dropdown in the contact details. Select a team member. The lead will now appear in their assigned leads view. For bulk assignment, select multiple leads on the Dashboard and use Bulk Assign or Round Robin.' },
      { title: 'Round Robin assignment', body: 'Round Robin automatically distributes leads equally among all available team members. Select leads on the dashboard → Bulk Assign → Round Robin. WappFlow ensures each agent gets an equal share.' },
      { title: 'Lead tags and filtering', body: 'Tags are color-coded labels you can assign to any lead (e.g., Hot Lead, VIP, Follow Up). Create tags in Settings → Tags. Assign them from the lead profile\'s Tags section. Filter leads by tag on the dashboard.' },
      { title: 'Recovering deleted leads', body: 'Deleted leads go to the Trash and are kept for 90 days. Go to the Trash page (from the dashboard) to restore them. After 90 days, they are permanently deleted.' },
      { title: 'Contact history and activity log', body: 'Every action on a lead is automatically logged: messages sent/received, status changes, notes added, invoices created, reminders set, email workflows. View in the History tab of any lead profile.' },
      { title: 'Lead scoring and estimated value', body: 'You can set an "Estimated Value" on any lead profile. When a deal is won, record the "Actual Sale" amount. This drives the revenue metrics on your Dashboard and Reports page.' },
    ]
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Chat',
    icon: MessageSquare,
    color: '#25d366',
    description: 'Send messages, voice notes, images, use presets and auto-reply',
    articles: [
      { title: 'Sending a message', body: 'Open any lead profile. The WhatsApp chat panel is on the right side. Type your message in the input box and press Enter or click the green Send button. Messages are sent via your connected WhatsApp account.' },
      { title: 'Sending voice notes', body: 'In the chat input area, click the microphone icon. A recording indicator will appear. When done, click "Stop & Send" to send the voice note via WhatsApp.' },
      { title: 'Sending images and files', body: 'Click the paperclip icon in the chat input. Select any image, PDF, or document. It will be sent as a WhatsApp media message. Images show inline; other files appear as download links.' },
      { title: 'Message presets (quick replies)', body: 'Presets are saved message templates for common replies. Create them in Settings → Message Presets. In any chat, click the ⚡ Presets button to see your saved replies and insert them with one click.' },
      { title: 'Auto-reply rules', body: 'Auto-reply rules automatically respond when a customer sends a message containing specific keywords. Go to Settings → Auto-Reply Rules. Set a rule name, keywords (comma-separated), and the reply message. Match type can be "contains" or "exact".' },
      { title: 'WhatsApp formatting', body: 'Use WhatsApp markdown in the message input: *bold* for bold, _italic_ for italic. The chat toolbar also has Bold, Italic, and Bullet buttons. Click the emoji (😊) button to open the emoji picker.' },
      { title: 'Message history sync', body: 'When you open a lead profile, WappFlow automatically syncs the latest WhatsApp message history in the background. If new messages are found, the chat panel refreshes. You\'ll see a "Syncing history..." indicator.' },
    ]
  },
  {
    id: 'platforms',
    label: 'Platform Integrations',
    icon: Layers,
    color: '#6366f1',
    description: 'Connect Instagram, Facebook Messenger, and your website to capture leads automatically',
    articles: [
      { title: 'Connecting Instagram DMs', body: 'Go to Settings → Connections → Instagram → Add Account.\n\n1. Go to developers.facebook.com and create a Business app.\n2. Add the Instagram product to your app.\n3. Your App ID and App Secret are under Settings → Basic.\n4. Get a Page Access Token from Meta Business Manager → System Users. Create a System User, add your Instagram page as an asset, and generate a token with instagram_manage_messages and pages_messaging permissions.\n5. Get your Instagram Account ID from the Graph API: GET /me?fields=id using your access token.\n6. In your Meta App → Instagram → Webhooks → Configure. Use the Callback URL and Verify Token from your WappFlow Settings. Subscribe to the "messages" field.\n\nOnce connected, all Instagram DMs will automatically create leads in WappFlow.' },
      { title: 'Connecting Facebook Messenger', body: 'Go to Settings → Connections → Facebook → Add Account.\n\n1. Go to developers.facebook.com and create a Business app.\n2. Add the Messenger product to your app.\n3. Your App ID is under Settings → Basic. App Secret is right below it.\n4. In Messenger API Settings → Generate Token, pick your Facebook Page and copy the token.\n5. Your Page ID is in your Facebook Page\'s About section or Business Manager URL.\n6. In your Meta App → Messenger → Webhooks → Edit. Use the Callback URL and Verify Token from WappFlow Settings. Subscribe to messages and messaging_postbacks.\n\nAll Facebook Messenger conversations will become leads automatically.' },
      { title: 'Website Embed Widget', body: 'Go to Settings → Connections → Website → Add Account. Choose "Embed Widget" as the integration type.\n\nCopy the embed code snippet shown and paste it just before the </body> tag on your website. A floating "Contact Us" button appears in the bottom-right corner. When visitors fill in the form, a new lead is created in WappFlow instantly. You can customize the button color and title using the data-color and data-title attributes in the snippet.' },
      { title: 'Website Custom Webhook', body: 'Go to Settings → Connections → Website → Add Account. Choose "Custom Webhook" as the integration type.\n\nCopy the Webhook URL. In your own website\'s form handler, send a POST request to that URL with JSON: { name, phone, email, message }. No authentication header is required — the unique token in the URL handles that. The submission will appear as a lead in WappFlow within seconds.' },
      { title: 'Website Formspree Integration', body: 'Go to Settings → Connections → Website → Add Account. Choose "Formspree" as the integration type.\n\n1. Create an account at formspree.io and set up your form.\n2. In Formspree dashboard → your form → Integrations → Webhooks → Add a webhook.\n3. Paste the Webhook URL from WappFlow as the destination. Choose JSON format.\n4. Make sure your Formspree form has a "name" or "full_name" field and optionally "phone", "email", "message".\n\nEvery Formspree submission will be forwarded to WappFlow and appear as a new lead.' },
      { title: 'Filtering leads by platform', body: 'On the Dashboard (Kanban view), use the Platform filter row above the Pipeline Board to show only leads from a specific source — WhatsApp, Instagram, Facebook, or Website. You can switch between platforms with a single click.\n\nOn the Leads List page, the same filter is available at the top. You can also navigate there directly from the Platform dropdown in the top navigation bar. All filters are stateless — refresh the page to return to all leads.' },
      { title: 'Understanding platform_source on leads', body: 'Every lead in WappFlow has a platform_source field that records where the lead came from: whatsapp, instagram, facebook, or website. This is set automatically when the lead is created and cannot be changed.\n\nYou can see the platform source on the Leads List page (shown as a colored badge) and on individual lead profile pages. Analytics and Reports pages also show a breakdown of leads by platform.' },
    ]
  },
  {
    id: 'invoices',
    label: 'Invoices',
    icon: DollarSign,
    color: '#f59e0b',
    description: 'Create professional invoices, track payments, and send by email',
    articles: [
      { title: 'Creating an invoice', body: 'Open a lead profile and click the "Invoice" button in the top action bar. A modal will open. Add line items (description, quantity, rate), set the tax rate, due date, and any notes. Click Save Invoice to create it.' },
      { title: 'Viewing invoices', body: 'All invoices can be viewed on the Invoices page (sidebar → Invoices). Click any row or the "View" button to open the full invoice with all details, line items, totals, and company logo.' },
      { title: 'Printing and PDF export', body: 'Inside the invoice view modal, click "Print / PDF". A print-ready invoice opens in a new tab with your company logo, bill-to details, line items, totals, and a professional footer.' },
      { title: 'Marking invoices as paid', body: 'In the invoice view modal, click "Mark as Paid". The invoice status changes to Paid and updates on the Invoices page. Paid revenue is tracked on your Reports page.' },
      { title: 'Setting up currency and tax', body: 'Go to Settings → Currency & Billing. Choose your currency and symbol. Set your default tax name (GST, VAT, etc.) and rate. These appear on all new invoices automatically.' },
      { title: 'Invoice numbering', body: 'Invoice numbers are auto-generated based on your prefix setting. Go to Settings → Currency & Billing to set your invoice prefix (e.g., INV-1001). Each new invoice increments the number.' },
    ]
  },
  {
    id: 'analytics',
    label: 'Analytics & Reports',
    icon: BarChart2,
    color: '#f97316',
    description: 'Dashboard metrics, revenue insights, pipeline funnel, lead scoring',
    articles: [
      { title: 'Dashboard overview', body: 'The Dashboard shows key metrics at the top: Total Leads, Won Deals, Revenue, and Conversion Rate. Below is the Kanban pipeline, charts for lead trends over time, and a pipeline funnel.' },
      { title: 'Reports page', body: 'Go to Reports from the sidebar. Filter by time period: 7D, 30D, 90D, or 1Y. View: leads over time, revenue trends, pipeline funnel, lead sources breakdown, team performance table, and SLA/response time metrics.' },
      { title: 'Conversion rate', body: 'Conversion rate = (Closed Won / Total Leads) × 100%. It shows what percentage of your leads turn into sales. Visible on both the Dashboard and Reports page.' },
      { title: 'Average response time', body: 'This is the average time between a lead being created and your first reply. Lower is better — it shows how quickly your team responds to new inquiries. Visible on the Reports page.' },
      { title: 'Revenue by source', body: 'The Reports page shows which lead sources (WhatsApp, Instagram, Referral, etc.) generate the most revenue. Use this to focus your marketing efforts.' },
      { title: 'Team performance', body: 'The team performance table shows each team member\'s leads assigned, won deals, response time, and conversion rate. Use it to coach and improve team output.' },
    ]
  },
  {
    id: 'ai',
    label: 'Knowledge Base & AI',
    icon: Brain,
    color: '#8b5cf6',
    description: 'Upload documents, AI reply suggestions, lead analysis, AI command center',
    articles: [
      { title: 'AI Command Center', body: 'The AI Command Center (✨ floating button, bottom-right) lets you issue natural language commands: "Show hot leads", "Summarize today", "Find Ali", "Show won deals". Enable/disable it in Settings → AI Command.' },
      { title: 'AI reply suggestions', body: 'In a lead profile, go to the AI Assistant tab. Click "Get Reply Suggestions" to have the AI analyze the conversation history and suggest 3 personalized replies based on the context.' },
      { title: 'Lead AI summary', body: 'In the AI Assistant tab of a lead profile, click "Summarize Lead" to get a plain-English summary of the lead\'s history, status, and key points — useful for quick catch-up.' },
      { title: 'Lead analysis', body: 'Click "Analyze Lead" in the AI Assistant tab for a detailed analysis: lead quality score, buying intent signals, recommended next actions, and risk factors.' },
      { title: 'Knowledge Base', body: 'Go to Knowledge (sidebar). Upload documents (PDFs, text files) about your products, services, or FAQs. The AI uses this knowledge to give better reply suggestions and answer customer questions more accurately.' },
      { title: 'Industry AI (vertical intelligence)', body: 'In a lead profile, click the "Industry AI" tab. The AI detects the lead\'s industry and offers tailored actions (send pricing, send case study, schedule demo) specific to that vertical.' },
    ]
  },
  {
    id: 'team',
    label: 'Team & Workspace',
    icon: UserCheck,
    color: '#ec4899',
    description: 'Invite team members, set roles, manage permissions, round robin',
    articles: [
      { title: 'Inviting team members', body: 'Go to the Team page from the sidebar. Click "Add Member" and enter their email and role. They\'ll receive an invite email with a link to set their password and join the workspace.' },
      { title: 'Roles and permissions', body: 'Owner: Full access, workspace creator. Admin: Manage team, leads, settings, reports, invoices. Manager: Manage leads & reports, no team or global settings. Agent: Access assigned leads only.' },
      { title: 'Activity logs', body: 'The Activity Log (Team → Activity Logs) shows every significant action: who created/deleted leads, changed statuses, created invoices, updated settings — all tracked with timestamps.' },
      { title: 'Workspace settings', body: 'In Settings → Workspace, you can update your workspace name. This appears across the app and in the top-left of the sidebar. Only Admins and Owners can edit it.' },
    ]
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    color: 'var(--text-muted)',
    description: 'Company profile, SMTP email, notifications, AI toggle, appearance',
    articles: [
      { title: 'Company profile', body: 'Go to Settings → Company Profile. Set your company name, email, phone, address, and logo. This information appears on invoices and outgoing emails.' },
      { title: 'Email SMTP setup', body: 'Go to Settings → Email Sending. Enter your SMTP host, port, username, and password. For Gmail: enable 2FA, generate an App Password at myaccount.google.com/apppasswords, and use that as the password. Click "Send Test Email" to verify.' },
      { title: 'Email receiving (IMAP)', body: 'Go to Settings → Email Receiving. Configure your IMAP settings to automatically receive email replies from leads. WappFlow checks your inbox every 2 minutes and matches replies to leads by email address.' },
      { title: 'Dark and light mode', body: 'Go to Settings → Appearance. Choose Dark Mode (default) or Light Mode. The theme is saved in your browser and applies instantly. The sidebar always stays dark for premium aesthetics.' },
      { title: 'Push notifications', body: 'Go to Settings → Notifications. Click "Enable" to turn on browser push notifications for new leads, new messages, and reminders. You can also toggle each notification type individually.' },
      { title: 'Message presets', body: 'Go to Settings → Message Presets. Click "New Preset", give it a name and body text. Use the preset in any chat by clicking the ⚡ button. Supports WhatsApp markdown (*bold*, _italic_).' },
      { title: 'Auto-reply rules', body: 'Go to Settings → Auto-Reply Rules. Create rules with keywords and replies. When a customer message matches a keyword, the reply is automatically sent. Toggle rules on/off with the switch.' },
      { title: 'Email templates', body: 'Go to Settings → Email Templates. Create reusable email templates for follow-up sequences. Use variables: {name}, {phone}, {email}, {company} for personalization. Activate templates as email workflows on lead profiles.' },
    ]
  },
  ...MODULE_SECTIONS,
  {
    id: 'shortcuts',
    label: 'Keyboard Shortcuts & Tips',
    icon: Keyboard,
    color: '#10b981',
    description: 'Power-user tips, keyboard shortcuts, and productivity tricks',
    articles: [
      { title: 'Chat keyboard shortcuts', body: 'In the WhatsApp chat panel: Press Enter to send a message. Press Shift+Enter for a new line. Use the toolbar buttons for Bold (*), Italic (_), and bullet formatting before typing your text.' },
      { title: 'Quick lead navigation', body: 'On the Dashboard, click any Kanban card to open the lead profile. Use your browser\'s back button to return. From any lead, click "Dashboard" in the top-left to go back.' },
      { title: 'Bulk operations', body: 'On the Dashboard, switch to List view (the list icon). Check multiple leads to select them, then use the bulk actions bar: Bulk Assign, Round Robin, or Bulk Delete.' },
      { title: 'Pro tip: Pipeline stages', body: 'Use the pipeline stage dots in the lead profile sidebar to quickly advance a lead through stages. Click the dots (New → Contacted → Interested → Negotiating) without opening a dropdown.' },
      { title: 'Pro tip: Reminders', body: 'Set reminders directly from a lead profile (Reminders tab). You\'ll get a push notification when the reminder is due, even if the tab is in the background (push notifications must be enabled).' },
      { title: 'Pro tip: Message history sync', body: 'If you\'ve been chatting in WhatsApp directly and want to sync history, open the lead profile — WappFlow will automatically pull recent messages in the background.' },
    ]
  },
];

function ArticleItem({ title, body }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '16px 0', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.4 }}>{title}</p>
        {open
          ? <ChevronDown size={17} color="#6366f1" style={{ flexShrink: 0, marginTop: 2 }} />
          : <ChevronRight size={17} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 2 }} />
        }
      </button>
      {open && (
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: 16, paddingRight: 24 }}>{body}</p>
      )}
    </div>
  );
}

export default function HelpPage() {
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState('getting-started');

  const filtered = SECTIONS.map(sec => ({
    ...sec,
    articles: sec.articles.filter(a =>
      !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.body.toLowerCase().includes(search.toLowerCase())
    )
  })).filter(sec => !search || sec.articles.length > 0);

  const activeData = search ? filtered : SECTIONS.find(s => s.id === activeSection);
  const displaySections = search ? filtered : [activeData].filter(Boolean);

  return (
    <>
      <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

        {/* Hero */}
        <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)', padding: '52px 28px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 20, background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)', marginBottom: 20 }}>
            <HelpCircle size={14} color="#a5b4fc" />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', letterSpacing: '0.5px' }}>DOCUMENTATION</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: 'white', margin: '0 0 10px', letterSpacing: '-0.5px' }}>How can we help?</h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.65)', margin: '0 0 32px' }}>Complete documentation for WappFlow CRM</p>
          <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 14, padding: '13px 18px', backdropFilter: 'blur(10px)' }}>
            <Search size={18} color="rgba(255,255,255,0.5)" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documentation..."
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: 'white', background: 'transparent' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: 'white', fontSize: 12 }}>
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="r-col" style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', display: 'flex', gap: 28, alignItems: 'flex-start' }}>

          {/* Sidebar nav */}
          {!search && (
            <div className="r-full" style={{ width: 220, flexShrink: 0, position: 'sticky', top: 24 }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 10, boxShadow: 'var(--shadow)' }}>
                {SECTIONS.map(sec => {
                  const active = activeSection === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => setActiveSection(sec.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px',
                        borderRadius: 10, border: 'none',
                        background: active ? sec.color + '18' : 'transparent',
                        color: active ? sec.color : 'var(--text-muted)',
                        fontWeight: active ? 700 : 500, fontSize: 13,
                        cursor: 'pointer', textAlign: 'left', marginBottom: 2, transition: 'all 0.12s'
                      }}
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; } }}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                    >
                      <sec.icon size={14} style={{ flexShrink: 0 }} />
                      {sec.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {search && filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <Search size={40} color="var(--border)" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>No results for "{search}"</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Try different keywords or browse by category.</p>
              </div>
            ) : search ? (
              // Search results — show all matching sections
              filtered.map(sec => (
                <div key={sec.id} style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '14px 18px', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: sec.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <sec.icon size={17} color={sec.color} />
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{sec.label}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{sec.articles.length} result{sec.articles.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '4px 20px' }}>
                    {sec.articles.map(a => <ArticleItem key={a.title} title={a.title} body={a.body} />)}
                  </div>
                </div>
              ))
            ) : activeData ? (
              <div>
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: '20px 22px', background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 16, background: activeData.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <activeData.icon size={24} color={activeData.color} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{activeData.label}</h2>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{activeData.description}</p>
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, padding: '5px 12px', borderRadius: 20, background: activeData.color + '18', color: activeData.color }}>
                    {activeData.articles.length} articles
                  </div>
                </div>

                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '4px 22px' }}>
                  {activeData.articles.map(a => <ArticleItem key={a.title} title={a.title} body={a.body} />)}
                </div>

                {/* Other sections grid */}
                <div style={{ marginTop: 28 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>Other Sections</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                    {SECTIONS.filter(s => s.id !== activeSection).map(sec => (
                      <button
                        key={sec.id}
                        onClick={() => setActiveSection(sec.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = sec.color; e.currentTarget.style.background = sec.color + '0a'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: sec.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <sec.icon size={15} color={sec.color} />
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{sec.label}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{sec.articles.length} articles</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
