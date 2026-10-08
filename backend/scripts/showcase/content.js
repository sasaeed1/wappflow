'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Showcase content — the people, shoots and conversations seed-showcase.js
//  writes into a demo workspace. Pure data + small text builders, no I/O.
//
//  Every contact is fictional: phone numbers sit in Ofcom's drama range
//  (+44 7700 900000–900999, never allocated to a real handset) and email
//  addresses use the reserved example.com/.net/.org domains, so nothing the
//  app might send can ever reach a real person.
// ════════════════════════════════════════════════════════════════════════════

const TEAM = [
  { key: 'sana', name: 'Sana Malik', role: 'admin', title: 'Lead Photographer' },
  { key: 'omar', name: 'Omar Siddiqui', role: 'manager', title: 'Videographer' },
  { key: 'ayesha', name: 'Ayesha Raza', role: 'manager', title: 'Studio Manager' },
  { key: 'bilal', name: 'Bilal Ahmed', role: 'user', title: 'Editor & Second Shooter' },
];

// Services: what the studio sells, the price band and which pipeline it lives on.
const SERVICES = {
  wedding:    { label: 'Wedding', min: 2400, max: 5600, pipeline: 'weddings', pack: 'wedding-proposal', duration: 600 },
  engagement: { label: 'Engagement session', min: 450, max: 900, pipeline: 'weddings', pack: 'portrait-agreement', duration: 120 },
  event:      { label: 'Event coverage', min: 900, max: 2200, pipeline: 'weddings', pack: 'portrait-agreement', duration: 300 },
  corporate:  { label: 'Corporate event', min: 1200, max: 3500, pipeline: 'commercial', pack: 'commercial-sow', duration: 480 },
  product:    { label: 'Product campaign', min: 800, max: 4500, pipeline: 'commercial', pack: 'commercial-sow', duration: 360 },
  realestate: { label: 'Real estate shoot', min: 350, max: 900, pipeline: 'commercial', pack: 'commercial-sow', duration: 180 },
  family:     { label: 'Family portraits', min: 300, max: 650, pipeline: 'portraits', pack: 'portrait-agreement', duration: 90 },
  headshots:  { label: 'Team headshots', min: 450, max: 1400, pipeline: 'portraits', pack: 'portrait-agreement', duration: 180 },
  maternity:  { label: 'Maternity session', min: 350, max: 700, pipeline: 'portraits', pack: 'portrait-agreement', duration: 90 },
};

const PIPELINES = {
  weddings: { name: 'Weddings & Events', labels: { Interested: 'Proposal sent', Negotiating: 'Finalising package', 'Closed - Won': 'Booked' } },
  commercial: { name: 'Commercial & Brands', labels: { Contacted: 'Brief received', Interested: 'Quote sent', Negotiating: 'Negotiating terms', 'Closed - Won': 'Commissioned' } },
  portraits: { name: 'Portraits & Families', labels: { Interested: 'Session offered', 'Closed - Won': 'Booked' } },
};

const TAGS = [
  { name: 'VIP', color: '#f59e0b' }, { name: 'Referral', color: '#10b981' }, { name: 'Destination', color: '#6366f1' },
  { name: 'Repeat client', color: '#ec4899' }, { name: 'Corporate', color: '#0ea5e9' }, { name: 'Hot lead', color: '#ef4444' },
  { name: 'Album upsell', color: '#8b5cf6' }, { name: 'Needs follow-up', color: '#f97316' },
];

const LOST_REASONS = ['Budget too high', 'Chose another photographer', 'Date unavailable', 'Event postponed', 'No response', 'Went with a friend/family member'];

const VENUES = ['The Grand Pavilion', 'Rosewood Gardens', 'Marina Ballroom', 'Lakeview Estate', 'The Orchard House', 'Crescent Hall',
  'Silver Oak Farm', 'The Glasshouse', 'Harbour Lights Hotel', 'Willow Creek Manor', 'The Atrium', 'Palm Court Hotel'];

// The shoots that get real photos, galleries, albums and reels. `daysAgo` is the
// shoot date relative to today (negative = upcoming). `query` drives the photo
// search; `stage` decides how far through delivery the project is.
const STORIES = [
  { key: 'zara', client: 'Zara Hussain', partner: 'Hamza', service: 'wedding', title: 'Zara & Hamza — Wedding', venue: 'The Grand Pavilion', value: 5600, daysAgo: 96,
    query: ['wedding bride groom', 'wedding reception'], photos: 30, stage: 'delivered', album: true, reel: true, proofing: 'approved', tags: ['VIP', 'Album upsell'], source: 'Instagram', platform: 'instagram', owner: 'sana' },
  { key: 'mariam', client: 'Mariam Qureshi', partner: 'Daniyal', service: 'wedding', title: 'Mariam & Daniyal — Wedding', venue: 'Rosewood Gardens', value: 4200, daysAgo: 38,
    query: ['bride portrait', 'wedding ceremony'], photos: 28, stage: 'proofing', reel: true, proofing: 'submitted', tags: ['Referral'], source: 'Referral', platform: 'whatsapp', owner: 'sana' },
  { key: 'emily', client: 'Emily Carter', partner: 'James', service: 'wedding', title: 'Emily & James — Garden Wedding', venue: 'Silver Oak Farm', value: 3800, daysAgo: 210,
    query: ['outdoor wedding', 'wedding couple sunset'], photos: 26, stage: 'delivered', album: true, store: true, tags: ['Destination'], source: 'Website', platform: 'whatsapp', owner: 'omar' },
  { key: 'hira', client: 'Hira Shah', partner: 'Faisal', service: 'engagement', title: 'Hira & Faisal — Engagement Session', venue: 'Lakeview Estate', value: 750, daysAgo: 24,
    query: ['engagement couple', 'couple portrait'], photos: 24, stage: 'delivered', password: 'hira2026', favourites: true, tags: ['Hot lead'], source: 'Instagram', platform: 'instagram', owner: 'sana' },
  { key: 'nexa', client: 'Nexa Technologies', contact: 'Rahul Mehta', service: 'corporate', title: 'Nexa Summit 2026 — Conference', venue: 'Harbour Lights Hotel', value: 3200, daysAgo: 62,
    query: ['business conference', 'corporate event networking'], photos: 26, stage: 'delivered', reel: true, tags: ['Corporate', 'Repeat client'], source: 'Google Search', platform: 'whatsapp', owner: 'omar' },
  { key: 'bloom', client: 'Bloom Skincare', contact: 'Layla Haddad', service: 'product', title: 'Bloom Skincare — Autumn Campaign', venue: 'Studio A', value: 2800, daysAgo: 31,
    query: ['skincare product', 'cosmetics flat lay'], photos: 24, stage: 'delivered', tags: ['Corporate'], source: 'Instagram', platform: 'instagram', owner: 'bilal' },
  { key: 'palm', client: 'Palm Residences', contact: 'Imran Chaudhry', service: 'realestate', title: 'Palm Residences — Show Apartment', venue: 'Palm Residences, Tower B', value: 650, daysAgo: 14,
    query: ['luxury apartment interior', 'modern living room'], photos: 24, stage: 'delivered', reel: true, tags: ['Corporate'], source: 'Facebook', platform: 'facebook', owner: 'bilal' },
  { key: 'khan', client: 'Sadia Khan', service: 'family', title: 'The Khan Family — Autumn Portraits', venue: 'Rosewood Gardens', value: 450, daysAgo: 6,
    query: ['family portrait outdoor', 'children playing park'], photos: 24, stage: 'culling', tags: ['Repeat client'], source: 'WhatsApp', platform: 'whatsapp', owner: 'sana' },
  { key: 'sophia', client: 'Sophia Ahmed', partner: 'Ali', service: 'wedding', title: 'Sophia & Ali — Wedding', venue: 'Palm Court Hotel', value: 4800, daysAgo: -19,
    photos: 0, stage: 'planning', tags: ['VIP'], source: 'Instagram', platform: 'instagram', owner: 'sana' },
];

const FIRST = ['Aisha', 'Fatima', 'Noor', 'Amna', 'Sara', 'Hania', 'Mahnoor', 'Iqra', 'Laiba', 'Anaya', 'Zainab', 'Rida', 'Komal', 'Areeba', 'Mehwish',
  'Olivia', 'Grace', 'Chloe', 'Hannah', 'Priya', 'Ananya', 'Leila', 'Yasmin', 'Nadia', 'Sofia', 'Maya', 'Elena', 'Isabelle', 'Rania', 'Dina',
  'Ahmed', 'Usman', 'Hassan', 'Bilal', 'Kashif', 'Zain', 'Arsalan', 'Saad', 'Talha', 'Waleed', 'Adeel', 'Junaid', 'Rehan', 'Shahzaib', 'Fahad',
  'Daniel', 'Michael', 'Ryan', 'Lucas', 'Adam', 'Karim', 'Omar', 'Yusuf', 'Ibrahim', 'Tariq', 'Nikhil', 'Arjun', 'Marco', 'Leo', 'Ethan'];
const LAST = ['Khan', 'Ahmed', 'Malik', 'Hussain', 'Iqbal', 'Raza', 'Sheikh', 'Butt', 'Chaudhry', 'Qureshi', 'Siddiqui', 'Javed', 'Aslam', 'Farooq', 'Nawaz',
  'Patel', 'Sharma', 'Kapoor', 'Haddad', 'Mansour', 'Rahman', 'Karim', 'Saleh', 'Williams', 'Brown', 'Taylor', 'Evans', 'Wilson', 'Clarke', 'Hughes',
  'Rossi', 'Silva', 'Novak', 'Fischer', 'Lee', 'Chen', 'Okafor', 'Mensah', 'Costa', 'Murphy'];
const COMPANIES = ['Vertex Labs', 'Orbit Foods', 'Crescent Bank', 'Atlas Logistics', 'Lumen Architects', 'Sable & Co.', 'Northwind Retail', 'Kite Fintech',
  'Saffron Kitchen', 'Aurora Hotels', 'Pinnacle Realty', 'Tidewater Media', 'Cedar Interiors', 'Quill Publishing', 'Halo Fitness', 'Ember Coffee'];

// ── Conversation builders ───────────────────────────────────────────────────
// Each returns [{ me: 0|1, b: text }] for a lead at a given pipeline stage.
const pick = (rng, a) => a[Math.floor(rng() * a.length)];

const OPEN = {
  wedding: [
    'Hi! We’re getting married on {date} at {venue} and love your work 😍 Are you available?',
    'Assalam o alaikum, wanted to ask about wedding photography for {date}. It’s a 3-day event (mehndi, baraat, walima).',
    'Hello, saw your reel on Instagram. Do you have availability for our wedding on {date}? Venue is {venue}.',
    'Hi there, my sister recommended you. Can you share your wedding packages?',
    'Hey! Looking for a photographer + videographer for our wedding in {month}. What do your packages include?',
  ],
  engagement: ['Hi! We just got engaged 💍 and would love a shoot. Do you do engagement sessions?', 'Hello, how much is a couple shoot? Thinking golden hour at {venue}.'],
  event: ['Hi, we need coverage for a birthday dinner on {date}, around 4 hours. Are you free?', 'Hello! Can you cover our anniversary party at {venue} on {date}?'],
  corporate: ['Hello, I’m organising our annual conference on {date} and need event photography for the full day. Can you send a quote?', 'Hi, we need photos of our product launch event at {venue}. Do you also do short video recaps?'],
  product: ['Hi! We’re launching a new range and need product photos for our website and Instagram — roughly 25 products. What would that cost?', 'Hello, do you shoot e-commerce + lifestyle product images? We have a campaign going live next month.'],
  realestate: ['Hi, we have a 3-bed show apartment that needs photos for a listing this week. What are your rates?', 'Hello, we’re a property developer looking for a regular photographer for our listings. Can we discuss?'],
  family: ['Hi! Looking to book a family shoot — 2 adults, 2 kids. Do you have weekend slots?', 'Hello, how much for family portraits outdoors? We’d love autumn colours 🍂'],
  headshots: ['Hi, we need headshots for about {n} people in our team. Can you come to our office?', 'Hello, do you do corporate headshots? Need new photos for our website.'],
  maternity: ['Hi! I’m 30 weeks along and would love a maternity shoot. Do you have availability soon?', 'Hello, what do your maternity sessions include?'],
};
const ASK_DETAILS = [
  'Thank you so much for reaching out! 😊 Could you share the date, venue and roughly how many hours of coverage you need?',
  'Hi! Thanks for getting in touch. Congratulations! What date are you planning and where will it be?',
  'Thanks for your message! Happy to help — could you tell me a bit more about what you have in mind?',
];
const GIVE_DETAILS = [
  'It’s on {date} at {venue}, probably 8–10 hours.', 'Date is {date}, venue {venue}. Around 150 guests.', '{date}, at {venue}. We’d like both photos and a short film if possible.',
  'We’re flexible on dates but thinking {month}. Location would be {venue}.',
];
const PRICING = {
  wedding: 'Lovely! {date} is still open 🎉 Our wedding collections start at $2,400 (6 hrs, 400+ edited images) and our most popular is Signature at $3,800 with two photographers, an engagement shoot and an heirloom album. I’ll send the full proposal here so you can pick what suits you.',
  engagement: 'Our engagement session is $450 for 90 minutes at one location, with 40+ edited images in a private online gallery. Golden hour at {venue} would be beautiful!',
  event: 'For 4 hours of event coverage it’s $900, including 200+ edited images delivered within 10 days.',
  corporate: 'Full-day conference coverage is $2,400 with one photographer, or $3,200 with a second shooter. A 60-second highlight reel is +$600. I can send a statement of work with the details.',
  product: 'For 25 products we’d quote $1,800 for clean e-commerce shots plus 10 styled lifestyle images. Turnaround is 7 working days. I’ll send a proposal with usage rights included.',
  realestate: 'A 3-bed apartment is $450 for 25 edited images, delivered within 48 hours. Twilight exteriors and a short walkthrough video are available as add-ons.',
  family: 'Family sessions are $350 for an hour outdoors, with 30+ edited images. Weekend mornings are lovely for little ones 😊',
  headshots: 'On-site headshots are $95 per person with a backdrop and lighting setup, minimum 6 people. Everyone gets 2 retouched images.',
  maternity: 'Maternity sessions are $395 — 75 minutes, two outfits, 30+ edited images. We have dresses you can borrow too!',
};
const CLIENT_Q = [
  'Do you charge extra for travel?', 'How long does it take to get the photos back?', 'Can we get the raw files as well?', 'Is a deposit required to lock the date?',
  'Can we add a second photographer?', 'Do you also make albums?', 'Could we split the payment?', 'Would you be able to send some full galleries to look at?',
];
const ANSWER = {
  'Do you charge extra for travel?': 'Travel within 50 km is included. Beyond that we just charge fuel and accommodation at cost.',
  'How long does it take to get the photos back?': 'You’ll get a sneak peek within 72 hours and the full gallery in 3–5 weeks.',
  'Can we get the raw files as well?': 'We deliver fully edited images only — every keeper is colour-graded by hand. We don’t release RAW files.',
  'Is a deposit required to lock the date?': 'Yes, a 30% retainer and a signed agreement secure your date. The balance is due a week before.',
  'Can we add a second photographer?': 'Absolutely, a second shooter is $600 for the day and is included in Signature and Luxe.',
  'Do you also make albums?': 'Yes! Our heirloom albums are lay-flat, 30 spreads, linen or leather. You’ll proof the design online before printing.',
  'Could we split the payment?': 'Of course — 30% to book, 40% a month before and the rest on delivery works for most couples.',
  'Would you be able to send some full galleries to look at?': 'Sure! Here are a couple of full galleries and our portfolio link — let me know which style you love.',
};
const NEGOTIATE = ['Is there any flexibility on the price if we book both days with you?', 'Our budget is a bit tight — could you do the Signature package for {offer}?', 'Could you include the album if we confirm this week?'];
const COUNTER = ['I can include the engagement shoot at no extra cost if you confirm this week 😊', 'We can do {offer} if we drop the second album copy — would that work?', 'Let me check with the team and come back to you today.'];
const WON = ['Perfect, let’s do it! Just signed the agreement 🙌', 'Deposit sent! So excited 😍', 'Booked! Thank you so much, see you on the day.', 'Contract signed and paid the retainer. Can’t wait!'];
const WON_REPLY = ['Wonderful, you’re all booked in! 🎉 I’ll send a planning questionnaire closer to the date.', 'Thank you! Your date is locked. We’ll be in touch about the timeline soon.'];
const POST = {
  delivered: ['Your gallery is ready! 📸 We had the best time with you both — the link and password are in your client portal.', 'OMG we love them!! Crying happy tears 😭❤️', 'So glad you love them! Let us know if you’d like to order prints or an album.'],
  proofing: ['Your sneak peek is in the gallery 🎉 Please pick your 60 favourites for the album when you get a chance.', 'Done! We’ve chosen our favourites. The ones by the lake are stunning.'],
  culling: ['Thank you for today! The kids were amazing. We’re editing now — gallery in about a week.', 'Thank YOU! Can’t wait to see them 😊'],
  planning: ['Hi! Just a reminder that your timeline questionnaire is due this week 📝', 'Thanks! Filling it in tonight. Can we also do a few photos at the hotel before the ceremony?', 'Of course, we’ll add 30 minutes of getting-ready coverage at the hotel.'],
};
const LOST = ['Thanks for all the info, but we’ve decided to go with someone else this time.', 'Sorry, it’s a bit over our budget right now.', 'Our event has been postponed — we’ll get back to you when we have a new date.', 'Thanks, we found a photographer closer to the venue.'];
const LOST_REPLY = ['Totally understand — thank you for considering us, and congratulations! 💛', 'No problem at all. Feel free to reach out if anything changes.'];
const NUDGE = ['Hi! Just checking in — did you get a chance to look at the proposal?', 'Hi, following up on my last message. Happy to jump on a quick call if that’s easier!'];

function fill(t, v) { return t.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)); }

/** A conversation for a lead at `status`. `v` fills {date}/{venue}/{month}/{offer}/{n}. */
function conversation(rng, service, status, v, extra = {}) {
  const s = SERVICES[service] ? service : 'wedding';
  const msgs = [];
  const me = (b) => msgs.push({ me: 1, b: fill(b, v) });
  const them = (b) => msgs.push({ me: 0, b: fill(b, v) });
  them(pick(rng, OPEN[s]));
  if (status === 'New') { if (rng() < 0.35) them('Also, do you have a price list?'); return msgs; }
  me(pick(rng, ASK_DETAILS));
  them(pick(rng, GIVE_DETAILS));
  if (status === 'Contacted') { if (rng() < 0.5) me('Thanks! Let me check the calendar and I’ll get back to you shortly.'); return msgs; }
  me(PRICING[s]);
  const q = pick(rng, CLIENT_Q); them(q); me(ANSWER[q]);
  if (status === 'Interested') { if (rng() < 0.5) me(pick(rng, NUDGE)); else them('Thank you, we’ll discuss and let you know this week!'); return msgs; }
  if (status === 'Closed - Lost') { if (rng() < 0.4) me(pick(rng, NUDGE)); them(pick(rng, LOST)); me(pick(rng, LOST_REPLY)); return msgs; }
  them(pick(rng, NEGOTIATE)); me(pick(rng, COUNTER));
  if (status === 'Negotiating') { if (rng() < 0.6) them('Let me talk to my partner and confirm by Friday 🙏'); return msgs; }
  // Closed - Won
  them(pick(rng, WON)); me(pick(rng, WON_REPLY));
  const post = POST[extra.stage];
  if (post) post.forEach((b, i) => (i % 2 === 0 ? me(b) : them(b)));
  return msgs;
}

const NOTES = [
  'Prefers WhatsApp over calls. Very responsive in the evenings.', 'Asked about a same-day highlight reel — upsell opportunity.',
  'Mother of the bride is the main decision maker on budget.', 'Wants candid, documentary style. Not keen on posed group shots.',
  'Venue has strict no-flash rule during the ceremony — bring fast primes.', 'Budget is around {offer}. Open to an album if we can phase payments.',
  'Referred by a past client — offer the referral discount.', 'Needs invoice addressed to the company, not personal name.',
  'Shot list received. Priority: speakers, sponsor booths, group photo at 4pm.', 'Follow up after their board meeting next week.',
];
const REMINDERS = ['Follow up on proposal', 'Send planning questionnaire', 'Call to confirm timeline', 'Check if deposit has cleared', 'Send album design proof', 'Ask for a Google review'];

// Knowledge base the AI assistant answers from.
const KNOWLEDGE = [
  { name: 'Wedding Collections 2026.pdf', type: 'pdf', text: 'Wedding collections. Essential $2,400: 6 hours coverage, 1 photographer, 400+ edited images, online gallery. Signature $3,800: 10 hours, 2 photographers, 700+ images, engagement session, heirloom album. Luxe $5,600: full day, 2 photographers + assistant, unlimited images, engagement and bridal sessions, premium album with two parent copies. Add-ons: second shooter $600, drone $450, same-day highlight reel $800, extra hour $350.' },
  { name: 'Studio Policies.docx', type: 'docx', text: 'Booking requires a signed agreement and a 30% retainer. Balance due 7 days before the event. Rescheduling is free up to 30 days before; the retainer transfers once. Travel within 50 km included; beyond that charged at cost. Sneak peek within 72 hours, full gallery within 3–5 weeks. Galleries stay online for 12 months. RAW files are not released.' },
  { name: 'Commercial Rate Card.pdf', type: 'pdf', text: 'Commercial: half day $1,400, full day $2,400, second shooter +$800/day. Product photography from $45 per product (e-commerce), lifestyle sets from $650. Real estate from $350 (up to 25 images), twilight +$150, walkthrough video +$300. Corporate headshots $95 per person on-site, minimum 6. Usage: web and social included; print/advertising licensed separately.' },
  { name: 'FAQ.txt', type: 'text', text: 'How many photos will we get? Every keeper, fully edited. Do you travel? Yes, worldwide. Can we choose album photos? Yes, through online proofing. Do you offer payment plans? Yes, up to three instalments. Can family members order prints? Yes, directly from the gallery store.' },
];
const MEMORIES = [
  ['pricing', 'Essential wedding collection', '$2,400 — 6 hours, 1 photographer, 400+ edited images'],
  ['pricing', 'Signature wedding collection', '$3,800 — 10 hours, 2 photographers, engagement session, heirloom album'],
  ['pricing', 'Luxe wedding collection', '$5,600 — full day, 2 photographers + assistant, unlimited images, premium album'],
  ['pricing', 'Engagement session', '$450 — 90 minutes, one location, 40+ edited images'],
  ['pricing', 'Family session', '$350 — 1 hour outdoors, 30+ edited images'],
  ['pricing', 'Corporate headshots', '$95 per person on-site, minimum 6 people'],
  ['pricing', 'Real estate', 'From $350 for up to 25 images, delivered in 48 hours'],
  ['service', 'Second shooter', 'Available for $600 per day; included in Signature and Luxe'],
  ['service', 'Highlight reel', 'Same-day highlight reel $800; 60-second event recap $600'],
  ['service', 'Albums', 'Lay-flat heirloom albums, 30 spreads, linen or leather, proofed online'],
  ['policy', 'Retainer', '30% retainer plus signed agreement secures the date'],
  ['policy', 'Balance', 'Balance due 7 days before the event'],
  ['policy', 'Rescheduling', 'Free up to 30 days before; retainer transfers once'],
  ['policy', 'RAW files', 'RAW files are not released; every keeper is edited by hand'],
  ['schedule', 'Delivery time', 'Sneak peek within 72 hours, full gallery in 3–5 weeks'],
  ['schedule', 'Studio hours', 'Mon–Sat, 10am–7pm. Shoots any day by appointment'],
  ['faq', 'Travel', 'Travel within 50 km included; beyond that at cost'],
  ['faq', 'Payment plans', 'Up to three instalments available'],
  ['contact', 'Studio email', 'hello@goldenhour.example.com'],
];

const CHAT = {
  general: [
    ['ayesha', 'Morning team ☀️ 3 new enquiries overnight — I’ve assigned them on the board.'],
    ['sana', 'Thanks! I’ll take the Rosewood one, I know the venue well.'],
    ['bilal', 'Khan family edits are 60% done, should have the gallery ready Thursday.'],
    ['owner', 'Great work everyone. Reminder: team meeting Friday 11am to plan the November weddings.'],
    ['omar', 'Can someone check if the second drone battery is charged for Saturday?'],
    ['ayesha', 'Charged and packed 👍'],
  ],
  shoots: [
    ['sana', 'Shot list for Sophia & Ali is in their project. Ceremony at 4:30, golden hour portraits at 5:45.'],
    ['omar', 'I’ll run video. Bringing the gimbal and two wireless mics for the vows.'],
    ['owner', 'Venue coordinator confirmed we can use the rooftop for 20 minutes.'],
    ['sana', 'Perfect 🌇'],
  ],
  editing: [
    ['bilal', 'Uploaded the culled set for Palm Residences — 24 keepers. Reel is rendering.'],
    ['sana', 'Mariam & Daniyal picked their 60 for the album, proofing is submitted ✅'],
    ['bilal', 'On it. Album draft by Monday.'],
  ],
};

module.exports = {
  TEAM, SERVICES, PIPELINES, TAGS, LOST_REASONS, VENUES, STORIES, FIRST, LAST, COMPANIES,
  conversation, fill, pick, NOTES, REMINDERS, KNOWLEDGE, MEMORIES, CHAT,
};
