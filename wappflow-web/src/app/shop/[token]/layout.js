import { studioMetadata } from '@/lib/publicMeta';

export async function generateMetadata({ params }) {
  const { token } = await params;
  return studioMetadata({
    path: `/api/store/public/${encodeURIComponent(token)}`,
    fallbackTitle: 'Print shop',
    title: (d) => (d.brand?.name ? `${d.brand.name} Print Shop` : 'Print shop'),
    description: (d, studio) =>
      studio ? `Order prints from ${studio}.` : 'Order prints of your photographs.',
  });
}

export default function ShopLayout({ children }) { return children; }
