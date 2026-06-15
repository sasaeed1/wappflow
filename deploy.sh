#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  WappFlow — safe, atomic deploy.
#  A failed / OOM-killed frontend build can NEVER replace the live build:
#  we build into .next.staging and only swap it in AFTER a clean success.
#  Run from the repo root:  bash deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

echo "→ Pulling latest…"
git pull

echo "→ Disk / memory before build:"
df -h . | tail -1
free -h 2>/dev/null | sed -n '1,2p' || true

echo "→ Backend dependencies…"
( cd backend && npm install --omit=dev )

echo "→ Building frontend into .next.staging (live site stays up on the old build)…"
cd wappflow-web
npm install --omit=dev
rm -rf .next.staging
# If this build fails/OOMs, set -e aborts here — the live .next is untouched,
# nothing is restarted, and the site keeps serving the previous good build.
NEXT_DIST=.next.staging npm run build

echo "→ Build OK — swapping the new build in atomically…"
rm -rf .next.old
[ -d .next ] && mv .next .next.old
mv .next.staging .next
rm -rf .next.old
cd ..

echo "→ Restarting services…"
pm2 restart wappflow-api wappflow-web --update-env
pm2 save

echo "✓ Deployed cleanly."
