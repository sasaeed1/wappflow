'use client';

// The full-page loading state for app pages (dashboard, lead page): a thin
// progress line at the top of the page and nothing else. The brand animation
// belongs to the launch intro alone (LaunchIntro.js); a logo loader on every
// page load read as the intro replaying on each refresh. The line only fades in
// if loading takes longer than ~250ms, so quick loads show nothing at all.
export default function BrandLoader({ lines = ['Loading…'], fullScreen = true }) {
  return (
    <div className={`wf-loader${fullScreen ? ' wf-loader--full' : ''}`} role="status" aria-live="polite">
      <div className="wf-loader__bar" aria-hidden="true"><span /></div>
      <span className="wf-loader__sr">{lines[0] || 'Loading…'}</span>
    </div>
  );
}
