import './studio.css';

// Studio is its own module. Each page renders <StudioShell> (its own nav bar);
// this layout only loads the design system and sets the saved theme before paint
// (no flash). WappFlow Core is untouched.
export default function StudioLayout({ children }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.setAttribute('data-ms-theme',localStorage.getItem('ms-theme')||'dark-pro')}catch(e){}` }} />
      {children}
    </>
  );
}
