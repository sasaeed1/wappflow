/* ==========================================================================
   Homepage route.

   Deliberately a Server Component so it can carry its own metadata — Next
   only honours the `metadata` export from server components, and the landing
   page itself is interactive (tabs, configurator, live pricing) so it has to
   be a client component. Splitting them lets the homepage have real SEO and
   a real Open Graph card instead of inheriting the generic app defaults.
   ========================================================================== */

import Landing from '@/components/landing/Landing';

const TITLE = 'WappFlow — never lose a lead again, wherever it came from';
const DESCRIPTION =
  'Capture leads from WhatsApp, Instagram, Facebook and your website as organised '
  + 'CRM leads automatically — no more enquiries dying in the scroll. One CRM at '
  + 'the core: pipeline, conversations, activity and AI, with contracts, booking, '
  + 'invoicing and client portals as modules connected around it.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    siteName: 'WappFlow',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function Page() {
  return <Landing />;
}
