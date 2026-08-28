import './globals.css'
import Providers from './providers'

export const metadata = {
  title: {
    default: 'WappFlow',
    template: '%s · WappFlow',
  },
  description: 'Never lose a lead again, wherever it came from. WappFlow captures enquiries from WhatsApp, Instagram, Facebook and your website as CRM leads automatically — then connects contracts, booking, invoicing, portals and more as modules around that one client record.',
  applicationName: 'WappFlow',
  authors: [{ name: 'RemoteOps' }],
  metadataBase: new URL('https://wappflow.remoteops.co'),
  openGraph: {
    title: 'WappFlow — never lose a lead again, wherever it came from',
    description: 'Enquiries from WhatsApp, Instagram, Facebook and your website become tracked CRM leads automatically. One CRM at the core, business modules connected around it.',
    url: 'https://wappflow.remoteops.co',
    siteName: 'WappFlow',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WappFlow — never lose a lead again, wherever it came from',
    description: 'Enquiries from WhatsApp, Instagram, Facebook and your website become tracked CRM leads automatically. One CRM at the core, business modules connected around it.',
  },
}

// Next 16: themeColor + viewport live in their own `viewport` export (not metadata).
// Pinning width=device-width guarantees correct mobile scaling.
export const viewport = {
  themeColor: '#6366f1',
  width: 'device-width',
  initialScale: 1,
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
            // "Session" persistence: sign out when the BROWSER closes, not when a
            // tab opens.
            //
            // This used to key off document.referrer, on the assumption that a tab
            // opened from the app always carries a same-origin one. It does not:
            // window.open(url, '_blank', 'noopener,noreferrer') strips the referrer
            // deliberately, so opening a shoot or a contract in a new tab looked
            // like a fresh external visit and wiped the token — logging out every
            // tab, including the one you were working in.
            //
            // A heartbeat is the honest signal. Any open tab refreshes wf_beat; if a
            // recent beat exists, the browser session is still alive and this new tab
            // inherits it. Only a genuinely cold start (every tab gone long enough
            // for the beat to go stale) clears the session.
            var BEAT = 'wf_beat', STALE = 90000;
            var last = parseInt(localStorage.getItem(BEAT) || '0', 10);
            var alive = sessionStorage.getItem('wf_alive') || (last && (Date.now() - last) < STALE);
            // An INSTALLED app is never treated as a dead browser session. Closing
            // an app from the home screen looks exactly like every tab going away,
            // so without this a session-scoped login is wiped every time the app is
            // closed — which is the "mobile app logs me out" complaint.
            var standalone = false;
            try {
              standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
                || window.navigator.standalone === true;
            } catch (e) {}
            if (!alive && !standalone && localStorage.getItem('wf_persist') === 'session') {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              localStorage.removeItem('workspace');
              localStorage.removeItem('wf_persist');
            }
            sessionStorage.setItem('wf_alive', '1');
            var beat = function () { try { localStorage.setItem(BEAT, String(Date.now())); } catch (e) {} };
            beat();
            setInterval(beat, 30000);
            document.addEventListener('visibilitychange', function () { if (!document.hidden) beat(); });
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
