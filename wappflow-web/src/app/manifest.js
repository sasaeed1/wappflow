// PWA web manifest (Next metadata route → served at /manifest.webmanifest, auto-linked).
export default function manifest() {
  return {
    name: 'WappFlow',
    short_name: 'WappFlow',
    description: 'AI-powered customer operations — CRM, Media Studio & Contracts Studio.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0b0f',
    theme_color: '#6366f1',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
