import './studio.css';
import StudioThemeToggle from './StudioThemeToggle';

// Scopes the Media Studio design language to /studio/* only. WappFlow Core
// (dashboard, leads, inbox, etc.) is untouched — it keeps its own look.
export default function StudioLayout({ children }) {
  return (
    <div className="ms-root">
      {children}
      <StudioThemeToggle />
    </div>
  );
}
