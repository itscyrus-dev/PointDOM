# Release process

The workflows run on GitHub-hosted Ubuntu with Node.js 24 and the pnpm version pinned in `package.json`. Pull requests/main pushes run CI without write permissions. A `v*` tag runs release checks; publication has `contents: write` and uses the built-in GitHub token. Third-party action references are pinned to verified commit hashes and updated by Dependabot.

## Before publishing

1. Enable GitHub Actions and private vulnerability reporting in repository settings. The repository and Release assets must be public for anonymous `curl` installation; adding a license does not change GitHub visibility.
2. Update `package.json` version and release documentation. Keep the lockfile committed. Do not tag unfinished or unreviewed work.
3. Run:

   ```sh
   sh -n install.sh
   pnpm format:check
   pnpm check
   pnpm test:e2e
   pnpm release:pack
   pnpm release:verify
   ```

4. Review the generated assets in `dist/release`. The archive includes the bundled CLI, extension, MIT license and third-party notices; it contains no Node runtime, dependency install directory, credentials or browser state. `install.sh` installs an official, checksum-verified Node runtime only if needed. Automatic login installation supports macOS arm64/x64; the release package is portable JavaScript, not a native executable.
5. After maintainer review, commit and push the code, then create and push the tag matching the package version. For example, package version `0.1.0` requires tag `v0.1.0`. These are publishing operations; do not run them as part of ordinary implementation/testing.

Maintainers can start a release check manually for an unpublished version tag with `gh workflow run release.yml --ref v0.1.0`. The version guard also applies to manual runs; running against a branch fails before publication.

## Release Notes

The workflow fetches full tag history and runs `scripts/release-notes.ts`. Notes include a commit/contributor summary, feature and fix highlights, Conventional Commit categories, commit links, changes grouped by author, and a comparison link. The range is the previous reachable version tag through the current tag; a first release includes the full tagged history. GitHub author usernames are used when available, otherwise only the author name is shown. Commit bodies and email addresses are not published.

This also supports historical direct commits, unlike PR-only notes. [Release Drafter](https://github.com/release-drafter/release-drafter) maintains release drafts from merged PRs; [Release Changelog Builder](https://github.com/mikepenz/release-changelog-builder-action) supports PR/commit templates. PointDOM uses its existing GitHub CLI workflow with a small formatter to match the desired summary and per-author layout without adding a separate Action dependency.

Generate notes for review without publishing:

```sh
pnpm exec tsx scripts/release-notes.ts v0.1.0 /tmp/pointdom-release-notes.md
```

Do not edit existing release artifacts or move published tags. Maintainers may explicitly request a release-description correction after reviewing generated notes.

## Automated release

The tag workflow checks the version, installs frozen dependencies, runs formatting/type/unit/browser checks, packages and verifies the distribution, then uses `gh release create --verify-tag --notes-file` to publish:

- `pointdom.tar.gz`: standalone CLI plus unpacked Chrome extension.
- `pointdom-extension.zip`: browser-only package for manual loading.
- `install.sh`: one-command macOS installer.
- `SHA256SUMS`: hashes of all three downloadable files.

Tags containing a prerelease suffix create prereleases and do not become the normal latest installer target. Stable releases are available through:

```sh
curl -fsSL https://github.com/itscyrus-dev/PointDOM/releases/latest/download/install.sh | sh
```

Do not overwrite a published version or silently replace an existing installation. From v0.2.0 onward, run `pdo upgrade` after tasks finish, then reload the Chrome extension from the newly printed directory. It verifies release downloads, refuses pending/running tasks, pauses new submissions during the switch and attempts rollback on installation failure. v0.1.0 users must run `pdo uninstall` and the release installer once to obtain this command. Pairing, registered projects and history remain in `~/.pagepatch`. Old version directories remain available; remove them manually only after checking that the installed service no longer references them.

GitHub publication cannot be confirmed by local workflow validation. Check the Actions run and download/verify the actual Release assets after the authorized tag push.
