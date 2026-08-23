import { studioMetadata } from '@/lib/publicMeta';

export async function generateMetadata({ params }) {
  const { token } = await params;
  return studioMetadata({
    path: `/api/payments/public/${encodeURIComponent(token)}`,
    fallbackTitle: 'Payment',
    // Deliberately does NOT put the amount in the title: a payment link previewed
    // in a group chat should not announce what somebody owes.
    title: () => 'Secure payment',
    description: (d, studio) => (studio ? `A payment request from ${studio}.` : 'A payment request.'),
  });
}

export default function PayLayout({ children }) { return children; }
