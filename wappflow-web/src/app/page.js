/* ==========================================================================
   Homepage route.

   Deliberately a Server Component so it can carry its own metadata — Next
   only honours the `metadata` export from server components, and the landing
   page itself is interactive (tabs, configurator, live pricing) so it has to
   be a client component. Splitting them lets the homepage have real SEO and
   a real Open Graph card instead of inheriting the generic app defaults.
   ========================================================================== */

import Landing from '@/components/landing/Landing';

const TITLE = 'WappFlow — never lose a lead in WhatsApp again';
const DESCRIPTION =
  'WappFlow turns every WhatsApp conversation into an organised CRM lead '
  + 'automatically, so enquiries stop dying in the scroll. One CRM at the core — '
  + 'leads, pipeline, clients, AI — with contracts, booking, invoicing, client '
  + 'portals and more as modules connected around it.';

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
