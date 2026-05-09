import './globals.css'

export const metadata = {
  title: 'WappFlow - WhatsApp CRM',
  description: 'Simple CRM for small businesses',
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
      <body>{children}</body>
    </html>
  )
}
