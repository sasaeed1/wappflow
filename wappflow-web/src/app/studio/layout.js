import './studio.css';
import AppShell from '@/components/shell/AppShell';

// Tab title for every /studio/* route (absolute → overrides the root template).
export const metadata = { title: { absolute: 'Media Studio' } };

// Phase 2: the shell is mounted here instead of by each of the 13 pages. Studio keeps
// its identity — AppShell wraps content in .ms-root (the D8 token-remap scope, so
// primitives inside keep wearing the Studio look and studio.css's focus treatment
// still matches) and renders the theme switcher as a module action.
//
// The pre-paint script stays: it puts data-ms-theme on <html> BEFORE first paint so
// there is no flash. Its retired-id mapping must stay in step with
// components/shell/StudioThemeSwitch.js, which owns the same mapping at runtime.
export default function StudioLayout({ children }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: `try{var m={'dark-pro':'cinema',airy:'editorial',bold:'monochrome'},v=localStorage.getItem('ms-theme'),ok=['monochrome','editorial','cinema'];var t=ok.indexOf(v)>=0?v:(m[v]||'monochrome');document.documentElement.setAttribute('data-ms-theme',t)}catch(e){document.documentElement.setAttribute('data-ms-theme','monochrome')}` }} />
      <AppShell module="studio">{children}</AppShell>
    </>
  );
}
