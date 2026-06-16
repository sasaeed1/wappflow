import './globals.css'
import Providers from './providers'

export const metadata = {
  title: {
    default: 'WappFlow',
    template: '%s · WappFlow',
  },
  description: 'AI-powered customer operations platform for teams that close deals on WhatsApp, Instagram, Facebook, and the web. Unified inbox, Google Meet scheduling, team huddles.',
  applicationName: 'WappFlow',
  authors: [{ name: 'RemoteOps' }],
  metadataBase: new URL('https://wappflow.remoteops.co'),
  openGraph: {
    title: 'WappFlow — AI-powered customer operations',
    description: 'The AI-native WhatsApp CRM. One inbox for every channel.',
    url: 'https://wappflow.remoteops.co',
    siteName: 'WappFlow',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WappFlow — AI-powered customer operations',
    description: 'The AI-native WhatsApp CRM. One inbox for every channel.',
  },
  themeColor: '#6366f1',
}

export default function RootLayout({ children }) {
  return (
    // pre-hydration inline script below mutates <html> (theme class / data-ms-theme),
    // so suppress the expected attribute hydration warning on this element only.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('theme') || 'dark';
            document.documentElement.classList.toggle('light', t === 'light');
          } catch(e) {}
          try {
            // A new tab opened FROM the app (same-origin referrer) inherits the session —
            // only genuinely fresh visits (typed URL / external / browser restart) clear it.
            var sameOrigin = document.referrer && document.referrer.indexOf(location.origin) === 0;
            if (!sameOrigin && localStorage.getItem('wf_persist') === 'session' && !sessionStorage.getItem('wf_alive')) {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              localStorage.removeItem('workspace');
              localStorage.removeItem('wf_persist');
            }
            sessionStorage.setItem('wf_alive', '1');
          } catch(e) {}
          try { if ('serviceWorker' in navigator) window.addEventListener('load', function(){ navigator.serviceWorker.register('/sw.js').catch(function(){}); }); } catch(e) {}
        ` }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
