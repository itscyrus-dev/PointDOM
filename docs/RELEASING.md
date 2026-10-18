# Release procedure

## Supported artifacts

Only Apple Silicon macOS is supported. The macos-14 runner builds the
`aarch64-apple-darwin` application DMG. The CLI and extension remain bundled inside the app.
A separate `pointdom-extension-<version>.zip` contains the unpacked Chrome extension,
with manifest.json at the archive root. SHA256 manifests cover both the DMG and ZIP. Intel Macs,
Windows and Linux are not release targets.

## Prepare and validate

1. Update package.json, Cargo workspace version, src-tauri/tauri.conf.json and the
   Chrome manifest together. Regenerate lockfiles and update CHANGELOG.md.
2. Run the checks in CONTRIBUTING.md and an isolated native UI smoke test. Never
   replace an installed service or migrate user data to validate a candidate.
3. Run `pnpm desktop:pack`, then `pnpm release:pack` and `pnpm release:verify` on
   the native host. Packaging consumes the release binary and installers; it never
   substitutes a debug executable. Check dependency notices and archive boundaries.
   Mount the candidate DMG without installing it and verify the compact window,
   bilingual background and app-to-Applications drag layout. CI must keep
   `TAURI_BUNDLER_DMG_IGNORE_CI=true` on the packaging step; otherwise Tauri skips
   Finder customization. Regenerate background artwork on macOS with
   `node scripts/generate-dmg-background.mjs` after editing its SVG source.
4. Create a PR. Markdown-only guide changes run formatting and local-link checks on Ubuntu.
   Any code, workflow or packaged-asset change runs format, types, unit/native tests,
   generated-contract drift checks, browser/renderer integration and native debug linking
   on Apple Silicon macOS. Main pushes compile optimized release binaries; version tags
   repeat the complete checks and build the installers. The `verify` gate requires the
   selected path to succeed and rejects failed or cancelled checks. Frontend output is
   reused within each job. Rust dependency caching excludes workspace binaries, stale
   artifacts and incremental output; only successful main builds save the shared cache.
5. After maintainer approval and successful checks, merge the reviewed commit and
   push its matching `v<version>` tag. Publishing needs explicit authorization.

## Publish and recover

Tag pushes invoke Release. Manual dispatch accepts an **existing tag**, checks out
that tag and verifies all four version declarations. The macOS build job uploads verified artifacts. A separate least-privilege publisher checks all target manifests,
requires the expected installer and extension ZIP, rejects collisions/unexpected files and generates
SHA256SUMS before creating a draft release and publishing it.

A failed build never publishes a partial release. A failed upload leaves a draft;
rerun the workflow against the same tag to recover it. Published releases are
immutable: do not move tags or overwrite their assets. Fix a published defect with
a new version. Inspect workflow conclusions and release assets before announcing success.

Current installers are unsigned, and macOS builds are not notarized. Adding signing
requires maintainer-owned credentials and a separate verification pass. Never describe
an unsigned artifact as signed, notarized, or independently verified by its executing agent.
