import { renderMaskableIcon } from '@/lib/pwaIcon';

// Served at /pwa-maskable-512.png — the maskable icon Android uses for the home
// screen and the launch splash. See renderMaskableIcon for why it is padded.
export const runtime = 'edge';
export function GET() { return renderMaskableIcon(512); }
