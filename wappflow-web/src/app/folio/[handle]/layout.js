import { studioMetadata } from '@/lib/publicMeta';

// A portfolio exists to be found. Indexable, and the only public page where that
// is unambiguously what the studio wants.
export async function generateMetadata({ params }) {
  const { handle } = await params;
  const meta = await studioMetadata({
    path: `/api/media/public/portfolio/${encodeURIComponent(handle)}`,
    fallbackTitle: 'Portfolio',
    title: (d) => d.title || (d.brand?.name ? `${d.brand.name} — Portfolio` : 'Portfolio'),
    description: (d, studio) => d.tagline || d.bio || (studio ? `Selected work by ${studio}.` : 'Selected work.'),
  });
  return { ...meta, robots: { index: true, follow: true } };
}

export default function FolioLayout({ children }) { return children; }
