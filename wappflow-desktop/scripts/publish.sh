#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Publish desktop installers to the download + auto-update host.
#
#  electron-builder writes the installers AND `latest.yml` (the manifest
#  electron-updater polls) into dist/. This copies them to the server, then
#  writes builds.json — which is what the /download page reads to decide which
#  platforms to offer. That file is generated from what is ACTUALLY on the
#  server, so the page can never advertise an installer that is not there.
#
#  Order matters: installers first, manifests last. A client that polls
#  mid-publish must never see a latest.yml promising a file that has not
#  finished uploading.
#
#  Usage, from wappflow-desktop/:
#     npm run build:win        # (or build:mac / build:linux, on that platform)
#     bash scripts/publish.sh
#
#  Signing: these builds are unsigned by decision. The /download page explains
#  the resulting OS warning. Nothing here needs to change when a certificate is
#  added — electron-builder signs during build, not during publish.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

HOST="${WAPPFLOW_HOST:-wappflow}"
REMOTE_DIR="${WAPPFLOW_DESKTOP_DIR:-/var/www/wappflow-desktop}"
BASE_URL="${WAPPFLOW_BASE_URL:-https://wappflow.remoteops.co}"
# Git Bash cannot see the Windows OpenSSH agent; this path can.
SSH_BIN="${SSH_BIN:-/c/Windows/System32/OpenSSH/ssh.exe}"
SCP_BIN="${SCP_BIN:-/c/Windows/System32/OpenSSH/scp.exe}"
[ -x "$SSH_BIN" ] || SSH_BIN=ssh
[ -x "$SCP_BIN" ] || SCP_BIN=scp

cd "$(dirname "$0")/.."
[ -d dist ] || { echo "No dist/ — run a build first (npm run build:win)."; exit 1; }

shopt -s nullglob
INSTALLERS=(dist/*.exe dist/*.dmg dist/*.AppImage)
MANIFESTS=(dist/latest*.yml dist/*.blockmap)
shopt -u nullglob

if [ ${#INSTALLERS[@]} -eq 0 ]; then
  echo "No installers in dist/ — nothing to publish."; exit 1
fi

echo "→ Publishing to ${HOST}:${REMOTE_DIR}"
for f in "${INSTALLERS[@]}"; do printf '   %-46s %s\n' "$(basename "$f")" "$(du -h "$f" | cut -f1)"; done

"$SSH_BIN" -o BatchMode=yes "$HOST" "mkdir -p '$REMOTE_DIR'"

# Installers FIRST — a client polling mid-publish must not find a manifest that
# points at a file still uploading.
echo "→ Uploading installers…"
"$SCP_BIN" -o BatchMode=yes "${INSTALLERS[@]}" "$HOST:$REMOTE_DIR/"

if [ ${#MANIFESTS[@]} -gt 0 ]; then
  echo "→ Uploading update manifests…"
  "$SCP_BIN" -o BatchMode=yes "${MANIFESTS[@]}" "$HOST:$REMOTE_DIR/"
fi

# builds.json is derived on the SERVER from the files that are really there,
# rather than from what this machine happens to have built. A publish from a Mac
# must not erase the Windows entry a previous publish left behind.
echo "→ Regenerating builds.json from what is on the server…"
"$SSH_BIN" -o BatchMode=yes "$HOST" "BASE_URL='$BASE_URL' REMOTE_DIR='$REMOTE_DIR' bash -s" <<'REMOTE'
set -e
cd "$REMOTE_DIR"
node -e '
const fs = require("fs"), path = require("path");
const base = process.env.BASE_URL, dir = process.env.REMOTE_DIR;
const files = fs.readdirSync(dir);
const KIND = [
  { id: "win",   test: /\.exe$/i },
  { id: "mac",   test: /\.dmg$/i },
  { id: "linux", test: /\.AppImage$/i },
];
const human = (n) => n > 1e9 ? (n/1e9).toFixed(2)+" GB" : (n/1e6).toFixed(0)+" MB";
const out = {};
for (const k of KIND) {
  // Newest by mtime, so re-publishing a version replaces rather than appends.
  const hit = files.filter(f => k.test.test(f))
    .map(f => ({ f, st: fs.statSync(path.join(dir, f)) }))
    .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs)[0];
  if (!hit) continue;
  const v = (hit.f.match(/(\d+\.\d+\.\d+)/) || [])[1] || null;
  out[k.id] = {
    file: hit.f,
    url: base + "/desktop/" + encodeURIComponent(hit.f),
    version: v,
    size: human(hit.st.size),
    released: hit.st.mtime.toISOString().slice(0, 10),
  };
}
fs.writeFileSync(path.join(dir, "builds.json"), JSON.stringify(out, null, 2));
console.log("builds.json:", JSON.stringify(Object.keys(out)));
'
REMOTE

echo "→ Verifying over HTTP…"
for u in /desktop/builds.json /desktop/latest.yml; do
  printf '   %-26s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}${u}")"
done
echo "✓ Published — ${BASE_URL}/download"
