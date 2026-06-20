// Flux is parked while the product is paused.
//
// When FLUX_PARKED is true, every WappFlow entry point into Flux (the
// app-switcher tile, the Studio shell menu item, and the "Launch Flux" CTA on
// the marketing landing page) renders greyed-out with a "Coming soon" tag
// instead of opening Flux.
//
// To bring Flux back: set this to false (or set NEXT_PUBLIC_FLUX_PARKED=false
// in the web env) and redeploy the web app. The companion flag on the Flux
// side lives at flux-content-engine/web/src/lib/parked.ts — flip both to fully
// re-open Flux.
export const FLUX_PARKED =
  (process.env.NEXT_PUBLIC_FLUX_PARKED ?? 'true') !== 'false';
