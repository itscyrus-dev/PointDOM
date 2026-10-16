# Development

PointDOM is an independent tool repository. Read [AGENTS.md](../AGENTS.md), [Design](../DESIGN.md) and [Contributing](../CONTRIBUTING.md). Preserve other contributors' changes and do not develop/test against adjacent business applications. Use temporary fixtures.

## Build and test

Requires Node.js 24 and the pnpm version pinned in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm format:check
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` runs strict TypeScript (including unused locals/parameters), Node tests and a build. Browser tests use temporary state, an isolated Chrome profile, a temporary extension copy and bridge port; the fixture site requires port 5175. They do not use the real browser profile, model accounts or system clipboard. Screenshots are ignored test artifacts.

For distribution changes, also run:

```sh
sh -n install.sh
pnpm release:pack
pnpm release:verify
```

These commands package and verify locally; they do not publish. Tests never call paid models. CLI workflows use isolated executable fixtures and temporary projects. Production execution uses the selected local CLI or an explicitly assigned MCP listening client.

## Repository layout

| Path                                                            | Responsibility                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/extension/panel.tsx`                                       | React/HeroUI panel components and host-controlled interactions.                                   |
| `src/extension/panel-controller.ts`                             | Chrome/service synchronization, exposed with `useSyncExternalStore`.                              |
| `src/bridge/release-paths.ts`                                   | Fixed release/MCP entries, managed browser directory and activation rollback.                     |
| `src/extension/background.ts`                                   | Site scoping, shortcut/side-panel behavior and serialized selection updates.                      |
| `src/extension/content.ts`                                      | On-demand isolated picker and sanitized element capture.                                          |
| `src/extension/element-info.ts`, `dom-context.ts`, `locator.ts` | Bounded semantic names, grouped snapshots and exact, transient page locating.                     |
| `src/extension/release-check.ts`                                | On-click public stable-release metadata, numeric version comparison and bounded failure handling. |
| `src/extension/toolbar.ts`                                      | Migration shim removing the retired floating toolbar; not a second UI.                            |
| `src/extension/ui-preferences.ts`                               | Validated local language/mode preferences and compatibility normalization.                        |
| `src/extension/ui-palette.ts`                                   | Monochrome action palette and lime brand identity.                                                |
| `src/bridge/main.ts`                                            | CLI and foreground service entry point.                                                           |
| `src/bridge/server.ts`                                          | Authenticated Hono HTTP routes.                                                                   |
| `src/bridge/queue.ts`, `store.ts`                               | Durable MCP inbox, cancellation and local records.                                                |
| `src/bridge/mcp.ts`                                             | Universal stdio MCP entry with explicit project binding.                                          |
| `src/bridge/setup.ts`, `connection.ts`                          | Interactive setup and credential-free host configuration exports.                                 |
| `src/shared`                                                    | Validated contracts, context separation and release-note data.                                    |
| `scripts`                                                       | Build, installation helpers, packaging and verification.                                          |
| `tests`                                                         | Unit, protocol, installer and browser fixtures.                                                   |

Keep layer boundaries: the browser never imports server modules or secrets. Page fields are untrusted input, not executable commands or proof of a filesystem project.

## Run a local build

Load `dist/extension` at `chrome://extensions`. Reload it after rebuilding, then close/reopen the panel. Browser-only changes do not require restarting the bridge.

`pnpm dev` watches the **PointDOM bridge**, not the user's business application. The login service occupies port 4318. Do not stop it, run a second service against its state, or overwrite its loaded bundle while tasks are active. Use isolated browser/protocol tests instead. Deliberate service updates must wait for nonterminal tasks and use the guarded upgrade lifecycle; restarting interrupts unfinished work without replaying it.

A source installation creates absolute Node/MCP/service paths. Moving the checkout or replacing Node requires a deliberate reinstall/re-export after work finishes. See [Installation](INSTALL_AGENT.md#manual-source-installation).

## Documentation

`README.md` is the default English landing page; `README.zh-CN.md` is its supported Simplified Chinese translation. Keep capabilities, prerequisites, commands and limitations aligned. Detailed contributor and agent guides remain English. README headers share `docs/assets/pointdom.svg`, a documentation copy of the extension logo; preserve that geometry when updating either asset. Ship both READMEs and the logo in release archives. Keep UI/test screenshots in ignored `test-results` or local artifacts, not in `docs`.

## UI and generated assets

Browser tests use a shared Chromium argument list in `tests/e2e/browser-args.ts`. On Linux, `--disable-frame-rate-limit` prevents inactive extension views from falling back to one compositor frame per second. This keeps screenshots and real HeroUI interactions within the existing test budgets without disabling animations, skipping actionability checks or changing the shipped extension. Do not remove the argument in one fixture or replace it with larger timeouts.

React 19 and HeroUI 3 are pinned. Build copies precompiled HeroUI CSS locally; no remote CDN or runtime Tailwind compiler is involved. HeroUI owns dropdown, popover, disclosure and checkbox behavior. Keep CSS tokens consistent across light/dark surfaces and portals. See [Design](../DESIGN.md) for focus, compact layout, picking, access and running-task borders.

The CLI picker and settings share a global executor preference. Detection belongs to the authenticated bridge, never browser-supplied commands. Keep bilingual UI, stable hover geometry and visible keyboard focus. MCP configuration is installation-scoped. A real pending wait marks listening; saved selection or heartbeat presence alone cannot accept new MCP work. Keep exact per-project recipients and claims.

`brand.ts` defines the logo. Run `pnpm icons` after geometry changes. Chrome `_locales` controls native labels independently of the panel language. Original notes/page text retain their language.

## Runtime configuration

`PAGEPATCH_HOME` selects the private state directory. CLI executables are resolved from the local service's absolute PATH entries/common installation locations or explicit local `POINTDOM_*_BIN` environment overrides. The browser cannot set executable, cwd, account, model or permission overrides. See [CLI integration](CLI.md).

## Execution, permissions and storage

`Queue` persists tasks before running `CliRunner` and serializes each registered project. New HTTP submissions require a supported CLI ID or a live MCP recipient that is waiting/already executing, a validated project origin and bounded context. CLI and MCP share per-project serialization. MCP waiting never claims work; only the atomic claim route does. Disconnect/re-registration invalidates older waits without clearing new ones.

The runner sends structured context over stdin with `shell: false`, parses JSONL protocol events and drains stderr without persisting it. Bounded redacted tool records and sanitized final reports reach task storage. Success needs both a protocol terminal result and exit code zero. Cancellation/shutdown terminates the process tree; restart interrupts without replay. No permission-bypass flags, command approvals or Git commits are implemented by PointDOM.

The test suite exercises real isolated child processes, temporary source changes, browser submission/result polling, cancellation, failure, timeout, duplicate IDs, source-origin isolation and legacy history. Fixtures are not proof of production login, model quota or native Windows compatibility. Never call a paid model from routine tests.
