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
  'The CRM for any business. Capture enquiries from WhatsApp, Instagram, Facebook '
  + 'and your website as leads automatically, then close and get paid with contracts, '
  + 'booking, invoicing and a client portal built in, plus industry modules for your '
  + 'trade, starting with Photography & Video.';

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
