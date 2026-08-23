import { studioMetadata } from '@/lib/publicMeta';

// The booking page is the ONE public surface meant to be found and shared widely,
// so unlike the token pages it is indexable.
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const meta = await studioMetadata({
    path: `/api/booking/public/${encodeURIComponent(slug)}`,
    fallbackTitle: 'Book a session',
    title: (d) => (d.brand?.name ? `Book with ${d.brand.name}` : 'Book a session'),
    description: (d, studio) =>
      studio ? `Choose a time that suits you and book with ${studio}.` : 'Choose a time and book your session.',
  });
  return { ...meta, robots: { index: true, follow: true } };
}

export default function BookLayout({ children }) { return children; }
