import { renderPwaIcon } from '@/lib/pwaIcon';

// Served at /pwa-icon-512.png — the large icon Chrome requires for install, and
// the one Android uses for the splash screen.
export const runtime = 'edge';
export function GET() { return renderPwaIcon(512); }
