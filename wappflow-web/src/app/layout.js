import './globals.css'
import Providers from './providers'

export const metadata = {
  title: {
    default: 'WappFlow — AI-powered multi-channel customer operations',
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
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('theme') || 'dark';
            document.documentElement.classList.toggle('light', t === 'light');
          } catch(e) {}
        ` }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
