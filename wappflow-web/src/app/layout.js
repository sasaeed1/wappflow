import './globals.css'
import Providers from './providers'
import LaunchIntro from '@/components/LaunchIntro'

export const metadata = {
  title: {
    default: 'WappFlow',
    template: '%s · WappFlow',
  },
  description: 'Never lose a lead again, wherever it came from. WappFlow is the CRM for any business: enquiries from WhatsApp, Instagram, Facebook and your website become leads automatically, with contracts, booking, invoicing and a client portal built in, and industry modules for your trade.',
  applicationName: 'WappFlow',
  authors: [{ name: 'RemoteOps' }],
  metadataBase: new URL('https://wappflow.remoteops.co'),
  openGraph: {
    title: 'WappFlow — never lose a lead again, wherever it came from',
    description: 'The CRM for any business. Enquiries from WhatsApp, Instagram, Facebook and your website become leads automatically, with contracts, booking and invoicing built in.',
    url: 'https://wappflow.remoteops.co',
    siteName: 'WappFlow',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WappFlow — never lose a lead again, wherever it came from',
    description: 'The CRM for any business. Enquiries from WhatsApp, Instagram, Facebook and your website become leads automatically, with contracts, booking and invoicing built in.',
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
            // A refresh opens the page at the top. The browser's default restores the
            // old scroll position once the data has loaded, which on the dashboard
            // dropped people halfway down, on Revenue Insights.
            if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
          } catch(e) {}
          try {
            // Launch intro (components/LaunchIntro.js): plays on a COLD START only —
            // the app (every tab/window) was closed and opened again — never on a page
            // change, a reload or a new tab while the app is running. "Running" is the
            // same heartbeat the sign-in persistence below uses (wf_beat, refreshed by
            // any open tab; wf_alive for this tab), read before that code refreshes it.
            // Signed in + an app screen only: never a client's gallery, contract,
            // booking, payment or portfolio page. A cold start on the login screen is
            // remembered and plays on the first app screen after signing in.
            var APP = ['dashboard','leads','leads-list','clients','invoices','bookings','reports','settings','team','chat','knowledge','whatsapp','studio','contracts','profile','trash','help'];
            // Installed app: swiping it away from recents ends its session, which
            // clears sessionStorage, so "this session has not run yet" IS a cold start
            // (no waiting period). In a browser tab, a new tab also starts empty, so
            // the cross-tab heartbeat keeps a new tab from replaying it.
            var standaloneApp = false;
            try { standaloneApp = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; } catch (e) {}
            var lastBeat = parseInt(localStorage.getItem('wf_beat') || '0', 10);
            var running = sessionStorage.getItem('wf_alive') || (!standaloneApp && lastBeat && (Date.now() - lastBeat) < 90000);
            if (!running) sessionStorage.setItem('wf_intro_pending', '1');
            if (sessionStorage.getItem('wf_intro_pending') && APP.indexOf(location.pathname.split('/')[1]) !== -1 && localStorage.getItem('token')) {
              document.documentElement.setAttribute('data-wf-intro', '1');
              sessionStorage.removeItem('wf_intro_pending');
            }
          } catch(e) {}
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
        <LaunchIntro />
      </body>
    </html>
  )
}
