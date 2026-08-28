import { renderPwaIcon } from '@/lib/pwaIcon';

// Served at /pwa-icon-192.png — the "any" icon the manifest points at.
export const runtime = 'edge';
export function GET() { return renderPwaIcon(192); }
