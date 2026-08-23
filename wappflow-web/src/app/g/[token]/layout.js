import { studioMetadata } from '@/lib/publicMeta';

// A gallery is the most-shared link in the product. Pasted into WhatsApp it used to
// preview as WappFlow marketing copy; now it previews as the studio's work.
export async function generateMetadata({ params }) {
  const { token } = await params;                      // Next 16: params is a Promise
  return studioMetadata({
    path: `/api/media/portal/${encodeURIComponent(token)}`,
    fallbackTitle: 'Private gallery',
    title: (d) => d.title || 'Your gallery',
    description: (d, studio) =>
      studio ? `Photographs by ${studio}.` : 'Your photographs are ready to view.',
  });
}

export default function GalleryLayout({ children }) { return children; }
