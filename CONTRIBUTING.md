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

CI builds and verifies installers on macOS ARM64, Windows x64 and Linux x64. The
required `verify` check succeeds only when all three platforms pass. Linux requires
the WebKitGTK 4.1 and AppIndicator development packages listed in Tauri prerequisites.
Use `xvfb-run -a` for browser tests on a headless Linux host.

New platform behavior needs disposable fixtures. Preserve migration backups, unknown
historical fields and exact recipient identity. Cancelled or terminal tasks must
reject late progress/reports. Configuration saved, MCP connected, listening and
executing are separate states. Do not fabricate execution or use real model sessions.

Generate protocol schemas with `pnpm native:contracts` after contract changes and
commit the result. Update both READMEs when changing setup or supported platforms.
