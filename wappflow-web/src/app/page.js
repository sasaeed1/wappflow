/* ==========================================================================
   Homepage route.

   Deliberately a Server Component so it can carry its own metadata — Next
   only honours the `metadata` export from server components, and the landing
   page itself is interactive (tabs, configurator, live pricing) so it has to
   be a client component. Splitting them lets the homepage have real SEO and
   a real Open Graph card instead of inheriting the generic app defaults.
   ========================================================================== */

import Landing from '@/components/landing/Landing';

const TITLE = 'WappFlow — the CRM your whole business runs on';
const DESCRIPTION =
  'One CRM. Every client. Everything connected. Leads, conversations, pipeline '
  + 'and AI at the core — with contracts, booking, invoicing, client portals, '
  + 'galleries and more as modules around it. One customer record, end to end.';

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
