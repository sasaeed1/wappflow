'use client';

// ════════════════════════════════════════════════════════════════════════════
//  Help Centre — the modules that shipped after the original page was written.
//
//  page.js described a WhatsApp CRM and nothing else: no Media Studio, no
//  Contracts Studio, no Booking, no Client Portal, no print shop, no reel editor,
//  no apps. A help centre that does not mention half the product teaches people
//  the product is half the size — and every one of these has support cost when it
//  is undocumented.
//
//  Kept in its own file rather than appended to page.js because that file was
//  already long, and a help centre grows every time the product does.
// ════════════════════════════════════════════════════════════════════════════

import {
  Camera, Film, FileSignature, Calendar, ShoppingBag, Smartphone, Zap,
} from 'lucide-react';

export const MODULE_SECTIONS = [
  {
    id: 'studio',
    label: 'Media Studio',
    icon: Camera,
    color: '#f59e0b',
    description: 'Shoots, culling, galleries, albums and client delivery',
    articles: [
      { title: 'Creating a shoot', body: 'Media Studio → Shoots → New shoot. A shoot holds every photograph and clip from one job, plus the galleries you deliver from it. Link it to a lead so the work and the conversation stay on the same client record.' },
      { title: 'Uploading photos and video', body: 'Open a shoot and click Upload Media. Uploads continue while you work elsewhere in the app — a tray in the bottom-right shows percentage, speed and time remaining for each transfer, and you can cancel any of them. Keep the tab open: closing it stops the transfer.' },
      { title: 'Culling — choosing the keepers', body: 'Open a shoot and click Cull. Rate, flag, keep or reject each frame. AI focus and duplicate hints are advisory only — they never select, hide or deliver a photograph for you. Your decisions drive which shots AI drafts and templates prefer later.' },
      { title: 'Creating and delivering a gallery', body: 'From a shoot, click New gallery, then use Media (n) to tick exactly which photographs and clips belong in it. Publish & send delivers it to the client over WhatsApp if a number is on file, and gives you a share link to copy.' },
      { title: 'Visibility, passwords and expiry', body: 'A gallery can be public, unlisted or password-protected, and can be set to expire on a date — after which the client link stops opening. Change any of it from Settings on the gallery card.' },
      { title: 'Unpublishing a gallery', body: 'If a gallery went to the wrong client, or has the wrong photographs in it, click Unpublish on the gallery card. The share link stops working immediately, and works again when you publish it once more.' },
      { title: 'Client favourites and selections', body: 'Clients can heart photographs in their gallery, and you can formally request selections with a quota ("choose 30"). When they submit you see the count, and can approve or request changes from the gallery card.' },
      { title: 'Albums', body: 'Albums lay a set of photographs out across spreads for print. Open a shoot and click Albums. Album status and page count also appear in the client portal, so the client can follow along.' },
    ],
  },
  {
    id: 'reels',
    label: 'Reels & Video',
    icon: Film,
    color: '#a855f7',
    description: 'Turn a shoot into a finished vertical reel',
    articles: [
      { title: 'The fastest route: AI drafts', body: 'From a shoot, open Reels → AI Drafts. It asks four questions — what the reel is made of (photos, video or both), how it should feel (flashy, elegant or professional), what it is for, and how long — then narrows twelve looks to the ones that match. Pick one and it builds an editable timeline from your best shots.' },
      { title: 'Creative packs (templates)', body: 'Reels → Templates applies a production-ready recipe: a colour grade, a pacing rhythm, varied transitions, a title card and a closing call to action. Every pack fills to exactly 15, 30, 45 or 60 seconds, and what you get is a normal editable timeline — nothing is locked.' },
      { title: 'The timeline: tracks', body: 'The editor stacks tracks — media, overlay, text and audio. Use + Track to add another (up to twelve). Each track header carries its name, a mute toggle and a delete. Drag the grip at the top of the panel to make the timeline taller; it remembers the height.' },
      { title: 'Trimming, splitting and moving clips', body: 'Drag a clip to move it, drag its edges to trim, and press S to split at the playhead. Delete removes the selected clip; the arrow keys nudge the playhead; Space plays.' },
      { title: 'Framing a shot inside the frame', body: 'Select a clip and drag directly on the preview to reposition it; scroll to scale. This matters most for vertical reels, where a 9:16 crop of a landscape photograph throws away most of the width — dragging is how you keep the subject in shot.' },
      { title: 'Transitions', body: 'A transition is drawn on the clip bar itself at its real length, so you can see which clips have one, which edge it is on and how long it runs. Select a clip to change the type or duration in the inspector.' },
      { title: 'Text and music', body: 'Text adds a caption on its own text track — you can have several, which is how a title and a closing call to action stay independently editable. Music adds an audio bed; per-clip volume, mute and fades are in the inspector.' },
      { title: 'Aspect ratio, preview and export', body: 'Change the aspect from the header (9:16, 1:1, 4:5, 16:9). Press F or the fullscreen button to preview large. Export renders an MP4 you can download.' },
    ],
  },
  {
    id: 'contracts',
    label: 'Contracts Studio',
    icon: FileSignature,
    color: '#10b981',
    description: 'Proposals, contracts and legally-binding e-signature',
    articles: [
      { title: 'Building a document', body: 'Contracts → New. A document is a stack of blocks: headings, text, images, pricing tables, packages, optional add-ons, timelines, FAQs and more. Choose a theme, and the client sees a branded document rather than a PDF attachment.' },
      { title: 'Fillable fields — where the client signs', body: 'Add a Fillable field block wherever something needs completing: signature, initials, date, a text answer or a checkbox. Assign each to a signer (client, you, witness or co-signer) and mark it required. The client fills them in place — the initials sit beside the clause they initial — and cannot submit until everything required of them is done.' },
      { title: 'Signers and signing order', body: 'Add signers with a role and an order. Each signer sees and completes only the fields addressed to their role, so a witness can never sign on the client behalf.' },
      { title: 'Sending and tracking', body: 'Send delivers the document by WhatsApp and/or email. You can see when it was viewed, how far the client read, and when each signer completed. Signing is recorded with a timestamp, IP and device, and produces a signed PDF.' },
      { title: 'Pricing, packages and selections', body: 'Pricing tables, package cards and optional add-ons let the client choose what they are buying. Their selection is recorded alongside the signature, so what they agreed to is part of the record.' },
      { title: 'Clause library and templates', body: 'Save a document as a template to reuse, and keep frequently-used wording in the clause library, so a new contract starts from your standard terms rather than a blank page.' },
      { title: 'If a client has a question', body: 'The client copy has an Ask a question button that answers strictly from the document text, in plain language. It never guesses — if the answer is not in the document it tells them to ask you directly.' },
    ],
  },
  {
    id: 'booking',
    label: 'Booking',
    icon: Calendar,
    color: '#0ea5e9',
    description: 'Let clients book a time without messaging you',
    articles: [
      { title: 'Setting up your booking page', body: 'Settings → Integrations → Booking. Define your services (name, duration, price), your available hours and your timezone, and choose the link people will use. The page is public — share the link anywhere.' },
      { title: 'Intake questions', body: 'Add questions a client must answer when booking — venue, guest count, anything you need up front. Mark one required and the booking cannot be submitted without it.' },
      { title: 'What happens when someone books', body: 'A booking creates or matches a lead, records the appointment and confirms to the client. It appears on your Bookings page and in that lead history.' },
      { title: 'Google Calendar and Calendly', body: 'Settings → Integrations connects Google Calendar so bookings land in your own diary, and Calendly if you would rather keep scheduling there.' },
    ],
  },
  {
    id: 'delivery',
    label: 'Client Portal & Print Store',
    icon: ShoppingBag,
    color: '#ec4899',
    description: 'One place a client can see and pay for everything',
    articles: [
      { title: 'The client portal', body: 'Each client gets one private link showing everything they have with you: documents awaiting signature, galleries, albums, invoices, orders and project progress. Anything that needs them — an unsigned contract, an unpaid invoice — is shown first, with a button to act on it.' },
      { title: 'Selling prints', body: 'Media Studio → Print Store. Add products (prints, albums, digitals, frames) with size options and prices. Every published gallery automatically gets a shop link, listed on that page ready to copy.' },
      { title: 'How a client orders', body: 'The client chooses a photograph from their gallery first, then a size — so the order records exactly which image to print. It raises an invoice and a pay link automatically, and appears on the client CRM record.' },
      { title: 'Managing orders', body: 'Orders land on the Print Store page. Move each through new, in production and fulfilled, and jump straight to the client lead record from the order.' },
      { title: 'Your public portfolio', body: 'Media Studio → Portfolio publishes a public showcase at your own link, with a choice of themes. Use it as your site, or alongside one.' },
    ],
  },
  {
    id: 'apps',
    label: 'Apps & Devices',
    icon: Smartphone,
    color: '#8b5cf6',
    description: 'WappFlow on your phone and your desktop',
    articles: [
      { title: 'Installing on your phone', body: 'There is no App Store or Play Store listing — WappFlow installs straight from the browser, so there is no review delay and no separate account. On Android, open WappFlow and choose Add to Home screen, or tap Install when it is offered. On iPhone, open it in Safari, tap Share, then Add to Home Screen. Settings → Apps & Devices has the same options.' },
      { title: 'Turning on notifications', body: 'Settings → Notifications → Enable, then allow the prompt your phone shows. Choose which kinds you want: new leads, new messages and reminders. On iPhone, notifications only work once WappFlow is on your home screen, and need iOS 16.4 or later.' },
      { title: 'Staying signed in', body: 'Remember me on this device keeps you signed in and is on by default. An installed app always stays signed in — closing an app is not the same gesture as ending a browser session.' },
      { title: 'The desktop app', body: 'Get it from Settings → Apps & Devices, or the Download page. It adds AI scoring that runs on your own hardware, watched folders that upload a shoot as it lands, and work that continues when the connection does not. It is unsigned for now, so your system will warn about an unknown publisher — the download page explains exactly how to proceed on each platform.' },
    ],
  },
  {
    id: 'plans',
    label: 'Plans & Limits',
    icon: Zap,
    color: '#f43f5e',
    description: 'What each plan includes',
    articles: [
      { title: 'The plans', body: 'Creator, Studio, Studio+ and Enterprise. Creator covers the core modules for a solo operator; Studio adds the extra lead-capture channels, team collaboration, analytics, the deeper AI and contract features and automation; Studio+ adds white-label, the local AI engine and the creative engines; Enterprise adds API access, SSO, audit logs and custom integrations.' },
      { title: 'Limits as well as features', body: 'Each plan also sets how many new leads a month, team seats, WhatsApp numbers, gigabytes of storage and contract sends you get. Settings → Plan & Billing shows your current usage against each.' },
      { title: 'What happens at a limit', body: 'You are warned as you approach a limit, and blocked from creating more of that one thing once you reach it. Nothing already created is removed or hidden, and every other part of the product keeps working.' },
    ],
  },
];
