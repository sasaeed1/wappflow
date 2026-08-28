import DownloadClient from './DownloadClient';

// metadata only works in a Server Component, so the page stays server-side and
// the interactive half (OS detection, which build to offer) lives in the client
// component below it. Same split as app/page.js.
export const metadata = {
  title: 'Download WappFlow Desktop',
  description: 'The desktop app for studios with heavy local libraries — local AI scoring on your own hardware, background uploads, and everything the web app does.',
};

export default function DownloadPage() {
  return <DownloadClient />;
}
