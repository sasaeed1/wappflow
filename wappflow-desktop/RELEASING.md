# Releasing WappFlow Desktop

Installers and the auto-update feed are served from
`https://wappflow.remoteops.co/desktop/`, off disk at `/var/www/wappflow-desktop`
on the OVH box — deliberately outside the git checkout, so `deploy.sh` can never
wipe a release.

The whole release is two commands:

```bash
npm run build:win        # or build:mac / build:linux, on that platform
bash scripts/publish.sh
```

`publish.sh` uploads installers **first** and manifests **last** (a client
polling mid-publish must never see a `latest.yml` promising a file that is still
uploading), then regenerates `builds.json` **on the server** from the files
actually present. That last detail matters: publishing from a Mac cannot erase
the Windows entry a previous publish left behind.

`/download` reads `builds.json` at runtime, so a platform with no build yet shows
"coming soon" rather than a dead link.

---

## Status

| Platform | State | Notes |
|---|---|---|
| **Windows** | **Published** | `WappFlow-Setup-0.1.0.exe`, built and verified on the owner's machine |
| Linux | Blocked — see below | Needs Developer Mode, or any Linux/WSL box |
| macOS | Blocked — needs a Mac | Cannot be built or notarised from Windows |

---

## Windows: the symlink problem

A stock Windows box cannot build this without one change, and it bites twice:

1. **electron-builder fetches a `winCodeSign` toolchain** whose archive contains
   macOS symlinks (`libcrypto.dylib`, `libssl.dylib`). Windows refuses to create
   symlinks without elevation or Developer Mode, and electron-builder retries
   into a *new random cache directory* each run — so pre-extracting the archive
   by hand does not help.

   **Worked around permanently:** `win.signAndEditExecutable: false` in
   `electron-builder.yml`. We ship unsigned, so that toolchain is pure overhead.
   The cost is that the `.exe` does not get icon/version metadata stamped by
   rcedit. No custom icon is configured today, so nothing is lost — but when a
   signing certificate is bought, set it back to `true` and both signing and
   stamping return together.

2. **The Linux AppImage target needs a symlink of its own**
   (`usr/share/icons/hicolor/256x256/apps/…`). That one is required by the
   AppImage format and cannot be configured away.

**To unblock Linux builds on this machine:** Settings → System → For developers →
turn on **Developer Mode**, then `npm run build:linux`. Developer Mode lets a
non-elevated process create symlinks, which is all either problem needs.

Alternatively build Linux anywhere with a real filesystem — WSL, a VM, a CI
runner — and run `scripts/publish.sh` from there.

---

## macOS

Must be built on a Mac; there is no cross-compile path.

```bash
npm ci
npm run build:mac
bash scripts/publish.sh
```

Unsigned, a `.dmg` is blocked by Gatekeeper on first launch — the user has to
right-click → **Open** → confirm. `/download` already explains this per platform
before the user clicks.

To remove that warning you need an Apple Developer account ($99/yr), a
Developer ID certificate, and notarisation. That is a purchase decision, not a
code change; the config is ready for it.

---

## Signing, when you get a certificate

Nothing in `publish.sh` changes — electron-builder signs during **build**, not
during publish.

- **Windows:** set `CSC_LINK` (path or base64 of the `.pfx`) and `CSC_KEY_PASSWORD`
  as environment variables, and set `win.signAndEditExecutable` back to `true`.
- **macOS:** set `CSC_LINK` / `CSC_KEY_PASSWORD` plus `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` for notarisation.

Never commit either — they are credentials.

Once builds are signed, delete the "install warning" section from
`app/download/DownloadClient.js`; it exists only because they are not.
