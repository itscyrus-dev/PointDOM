# Release procedure

## Supported artifacts

| Runner           | Rust target              | Desktop artifacts |
| ---------------- | ------------------------ | ----------------- |
| macos-14 (ARM64) | aarch64-apple-darwin     | DMG               |
| windows-2022     | x86_64-pc-windows-msvc   | NSIS EXE          |
| ubuntu-22.04     | x86_64-unknown-linux-gnu | DEB and AppImage  |

There is no Intel Mac target. Each platform also produces a native CLI archive
(tar.gz on Unix, ZIP on Windows), containing the extension, license and dependency
notices. macOS produces the portable Chrome extension ZIP once. Every artifact is
covered by a platform checksum manifest; publishing generates a combined SHA256SUMS.

## Prepare and validate

1. Update package.json, Cargo workspace version, src-tauri/tauri.conf.json and the
   Chrome manifest together. Regenerate lockfiles and update CHANGELOG.md.
2. Run the checks in CONTRIBUTING.md and an isolated native UI smoke test. Never
   replace an installed service or migrate user data to validate a candidate.
3. Run `pnpm desktop:pack`, then `pnpm release:pack` and `pnpm release:verify` on
   the native host. Packaging consumes the release binary and installers; it never
   substitutes a debug executable. Check dependency notices and archive boundaries.
4. Create a PR. The shared build workflow runs format, types, unit/native tests,
   generated-contract drift checks, browser/renderer integration and release-mode
   native compilation on all three platforms. The protected `verify` gate requires
   all of them. Installer creation, archive verification and release uploads run
   only for a version tag, after the same checks pass. Frontend output is reused
   within each job; Rust caches exclude incremental files and installer bundles.
   Failed runs save a separate partial cache so they cannot occupy the immutable
   cache key reserved for a successful, complete build.
5. After maintainer approval and successful checks, merge the reviewed commit and
   push its matching `v<version>` tag. Publishing needs explicit authorization.

Keep the locked `rust-ini` 0.21.1 dependency while using tauri-plugin-deep-link
2.6.2: rust-ini 0.21.3 adds required ParseOption fields and breaks the plugin's
Linux build. Recheck Linux compilation before updating this transitive dependency.

## Publish and recover

Tag pushes invoke Release. Manual dispatch accepts an **existing tag**, checks out
that tag and verifies all four version declarations. Three native build jobs upload
verified artifacts. A separate least-privilege publisher checks all target manifests,
requires every expected installer, rejects collisions/unexpected files and generates
SHA256SUMS before creating a draft release and publishing it.

A failed build never publishes a partial release. A failed upload leaves a draft;
rerun the workflow against the same tag to recover it. Published releases are
immutable: do not move tags or overwrite their assets. Fix a published defect with
a new version. Inspect workflow conclusions and release assets before announcing success.

Current installers are unsigned, and macOS builds are not notarized. Adding signing
requires maintainer-owned credentials and a separate verification pass. Never describe
an unsigned artifact as signed, notarized, or independently verified by its executing agent.
