import { studioMetadata } from '@/lib/publicMeta';

export async function generateMetadata({ params }) {
  const { token } = await params;
  return studioMetadata({
    path: `/api/cs/public/${encodeURIComponent(token)}`,
    fallbackTitle: 'Document',
    title: (d) => d.title || 'Document',
    description: (d, studio) =>
      studio ? `A ${d.type || 'document'} from ${studio}, ready for your signature.` : 'Ready for your signature.',
  });
}

export default function DocumentLayout({ children }) { return children; }
