// What a page should do when its primary record fails to load.
//
// Seven detail pages (a shoot, its cull/reels/reel editor/album, a contract) used
// to redirect back to their list on ANY failure. Only a record that is really
// gone — 404, or 403 for one that isn't yours — deserves that. A rate limit or a
// dropped connection bounced the user out too, and if the list's own fetch then
// failed it rendered its "nothing here yet" state: a blip read as data loss.
//
//   catch (e) {
//     if (isGone(e)) { router.push('/studio'); return; }
//     setLoadError(loadErrorText(e));
//   }
//   ...
//   if (loadError) return <ErrorState detail={loadError} onRetry={...} />;

export const isGone = (e) => {
  const st = e?.response?.status;
  return st === 404 || st === 403;
};

export const loadErrorText = (e) => e?.response?.data?.error || e?.message || 'Network error';
