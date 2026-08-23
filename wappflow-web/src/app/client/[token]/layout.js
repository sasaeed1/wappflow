import { studioMetadata } from '@/lib/publicMeta';

export async function generateMetadata({ params }) {
  const { token } = await params;
  return studioMetadata({
    path: `/api/client-portal/public/${encodeURIComponent(token)}`,
    fallbackTitle: 'Client portal',
    title: (d) => (d.brand?.name ? `${d.brand.name} · Client portal` : 'Client portal'),
    description: (d, studio) =>
      studio ? `Your galleries, documents and invoices from ${studio}, in one place.`
             : 'Your galleries, documents and invoices in one place.',
  });
}

export default function ClientPortalLayout({ children }) { return children; }
