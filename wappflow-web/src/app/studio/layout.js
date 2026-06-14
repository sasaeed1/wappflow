import './studio.css';

// Studio is its own module. Each page renders <StudioShell> (its own nav bar);
// this layout only loads the design system and sets the saved theme before paint
// (no flash). WappFlow Core is untouched.
export default function StudioLayout({ children }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: `try{var m={'dark-pro':'cinema',airy:'editorial',bold:'monochrome'},v=localStorage.getItem('ms-theme'),ok=['monochrome','editorial','cinema'];var t=ok.indexOf(v)>=0?v:(m[v]||'monochrome');document.documentElement.setAttribute('data-ms-theme',t)}catch(e){document.documentElement.setAttribute('data-ms-theme','monochrome')}` }} />
      {children}
    </>
  );
}
