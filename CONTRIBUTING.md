# Contributing

Read [AGENTS.md](AGENTS.md), [design](DESIGN.md) and [architecture](docs/DESKTOP.md).
Use a focused branch and Conventional Commits. Keep changes reviewable, document
behavior and preserve compatibility for projects, pairing and existing task history.

## Development

Install Rust (see rust-toolchain.toml), Node 24 and the pinned pnpm version. Install
platform Tauri prerequisites, then `pnpm install --frozen-lockfile`.

- `pnpm desktop:dev`: native desktop development.
- `pnpm start`: native loopback service, without the desktop shell.
- `pnpm cli mcp`: native MCP stdio entry.
- `pnpm desktop:pack`: local unsigned installer for the current supported platform.

## Checks

For documentation-only edits:

```sh
pnpm format:check
node scripts/check-doc-links.ts
```

For code, workflows or packaged assets, run the full checks:

```sh
pnpm format:check
pnpm check
pnpm test:e2e
pnpm test:desktop
pnpm desktop:pack
```

`pnpm native:check` runs fmt, Clippy and Rust tests with the lockfile. Browser tests
use temporary state and profiles; never execute paid models or use actual conversations.
UI fixture screenshots prove rendering, not native OS integration. Keep platform and
signing limitations explicit. See [release verification](docs/RELEASING.md).

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Never
include tokens, private prompts, page content or signed URLs in logs, issues or PRs.

## Compatibility and review

Documentation-only PRs and main pushes run formatting and local-link checks on Ubuntu.
Changes to code, workflow files or packaged assets run the full test suite on Apple Silicon macOS.
PRs link native debug binaries; main pushes and version tags compile optimized release binaries.
The required `verify` check accepts only the successful selected path. Release also builds
and verifies the macOS DMG and extension ZIP before publishing.

Rust caching keeps dependency artifacts and removes workspace binaries and incremental output.
Successful main builds maintain the shared cache; PRs and tags restore it without uploading
branch-specific copies. The first build after a cache change may take longer.

New platform behavior needs disposable fixtures. Preserve migration backups, unknown
historical fields and exact recipient identity. Cancelled or terminal tasks must
reject late progress/reports. Configuration saved, MCP connected, listening and
executing are separate states. Do not fabricate execution or use real model sessions.

Generate protocol schemas with `pnpm native:contracts` after contract changes and
commit the result. Update both READMEs when changing setup or supported platforms.
