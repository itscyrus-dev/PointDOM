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

These commands package and verify locally; they do not publish. Optional `pnpm test:opencode` uses a real OpenCode CLI with a local mock model. `pnpm test:codex` consumes actual model usage in a temporary fixture and requires an explicit request.

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
| `src/bridge/queue.ts`, `store.ts`                               | Execution lifecycle and durable local records.                                                    |
| `src/bridge/codex.ts`, `opencode.ts`, `acp.ts`, `claude.ts`     | Agent transports, permission decisions, cancellation and result handling.                         |
| `src/bridge/delivery.ts`, `client-handoff.ts`                   | CLI detection and bounded macOS client input delivery.                                            |
| `src/bridge/mcp.ts`                                             | Project-bound stdio MCP entry point.                                                              |
| `src/bridge/setup.ts`, `connection.ts`                          | Interactive setup and credential-free host configuration exports.                                 |
| `src/shared`                                                    | Validated contracts, context separation and release-note data.                                    |
| `scripts`                                                       | Build, installation helpers, packaging and explicit smoke checks.                                 |
| `tests`                                                         | Unit, protocol, installer and browser fixtures.                                                   |

Keep layer boundaries: the browser never imports server modules or secrets. Page fields are untrusted input, not executable commands or proof of a filesystem project.

## Run a local build

Load `dist/extension` at `chrome://extensions`. Reload it after rebuilding, then close/reopen the panel. Browser-only changes do not require restarting the bridge.

`pnpm dev` watches the **PointDOM bridge**, not the user's business application. The login service occupies port 4318. Do not stop it, run a second service against its state, or overwrite its loaded bundle while tasks are active. Use isolated browser/protocol tests instead. Deliberate service updates must wait for nonterminal tasks and use the guarded upgrade lifecycle; restarting interrupts unfinished work without replaying it.

A source installation creates absolute Node/MCP/service paths. Moving the checkout or replacing Node requires a deliberate reinstall/re-export after work finishes. See [Installation](INSTALL_AGENT.md#manual-source-installation).

## Documentation

`README.md` is the default English landing page; `README.zh-CN.md` is its supported Simplified Chinese translation. Keep capabilities, prerequisites, commands and limitations aligned. Detailed contributor and agent guides remain English. README headers share `docs/assets/pointdom.svg`, a documentation copy of the extension logo; preserve that geometry when updating either asset. Ship both READMEs and the logo in release archives. Keep UI/test screenshots in ignored `test-results` or local artifacts, not in `docs`.

## UI and generated assets

React 19 and HeroUI 3 are pinned. Build copies precompiled HeroUI CSS locally; no remote CDN or runtime Tailwind compiler is involved. HeroUI owns dropdown, popover, disclosure and checkbox behavior. Keep CSS tokens consistent across light/dark surfaces and portals. See [Design](../DESIGN.md) for focus, compact layout, picking, access and running-task borders.

`brand.ts` defines the logo. Run `pnpm icons` after geometry changes to regenerate SVG and 16/32/48/128px PNGs. Chrome `_locales` controls native labels; the panel's selected language is independent. Generated context guidance and MCP tool descriptions are English, while original notes/page text remain unchanged. Keep product UI bilingual.

The obsolete native `details` execution menu is gone; do not restore it alongside HeroUI. The `toolbar.ts` cleanup shim, legacy `pagepatch_*` MCP aliases, `PAGEPATCH_*` environment names, retired preference normalization and explicit commit endpoint remain compatibility surfaces, not removable dead code.

`scripts/mcp-config.mjs` is a legacy source-only exporter with a fixed `pagepatch` ID. New installation docs use `pdo connect`, which generates unique project/installation IDs. Keep the legacy helper's compatibility tests until it is deliberately retired.

## Runtime configuration

| Variable                                                                                                           | Purpose                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `PAGEPATCH_HOME`                                                                                                   | Private state directory; defaults to `~/.pagepatch`.                     |
| `PAGEPATCH_CODEX_BIN`                                                                                              | Trusted local Codex executable override.                                 |
| `PAGEPATCH_OPENCODE_BIN`                                                                                           | Trusted local OpenCode executable override.                              |
| `PAGEPATCH_CLAUDE_BIN`                                                                                             | Trusted local Claude Code executable override.                           |
| `PAGEPATCH_TRAE_BIN`                                                                                               | Trusted local Trae CLI executable override.                              |
| `PAGEPATCH_CODEX_APP`, `PAGEPATCH_OPENCODE_APP`, `PAGEPATCH_CLAUDE_APP`, `PAGEPATCH_TRAE_APP`, `PAGEPATCH_MCP_APP` | Optional trusted absolute macOS `.app` destinations for client fallback. |

These values belong to the bridge process environment, not browser forms or page payloads. Model/account configuration remains in the selected executor. Retired `executionSettings`, `PAGEPATCH_MODEL`, project model fields and automatic-commit flags do not override new tasks. Preserve storage compatibility without reviving their UI.

## Execution, permissions and storage

The bridge serializes tasks and persists full records in `jobs.json`. The panel requests the selected project's latest 100 tasks; filtering happens before the server's limit. Project switches clear visible history and stale responses are discarded. UI filtering also rejects foreign records returned by older bridges. An unknown/unselected project has no history request or visible records. The per-project display limit does not delete older records. The browser separately persists pairing/preferences and per-tab drafts/selections. No retention or database service is implied.

New submissions reference a registered project ID and exact origin. Explicitly saved project permissions are server-owned and snapshotted onto new jobs. They do not change global CLI configuration. Codex uses project writable roots; networking is separately opt-in. Reduced confirmation modes cannot make ACP commands, unverified paths or outside-project requests silently approved. See [Design](../DESIGN.md#agent-settings-and-permissions).

Task start/finish timestamps survive restart and duplicate reports. UI duration excludes queue time and does not guess from update timestamps. Successful tasks do not automatically commit. The legacy explicit commit endpoint preserves unrelated staging and rejects pre-existing/overlapping edits or a changed HEAD.

`DeliveryRouter` selects a CLI before queuing. Missing executables route to MCP/client delivery; an already-started CLI failure never reroutes automatically. Separate delivery state from execution state. Handoffs serialize, deduplicate requests and do not replay ambiguous input after restart. A fixed AppleScript recognizes an empty chat input, preserves drafts and never presses Send. Unavailable permissions/fields return copied, blocked or uncertain states, never false success.

## Verification boundaries

Tests exercise real stdio/JSONL transport and the packaged UI with temporary subprocesses. The Claude adapter uses the official SDK with a fixture executable; OpenCode 1.x HTTP, OpenCode 2.x ACP and Trae ACP are fixture-tested. This does not establish live authentication or paid model behavior in every host.

Selection names prioritize `aria-labelledby`, `aria-label`, associated field labels, alt/title, a container heading and bounded visible text. Editable values and hidden subtrees are excluded. The optional selection `role`, `dom` and `selectorPath` remain backward compatible with stored records. The composed event path is used as-is, with no clickable-ancestor promotion. Alt+Up/Down tracks explicit hierarchy selection; each open ShadowRoot has a separately verified unique selector. Duplicate IDs fall back to structural selectors. DOM excerpts visit at most 40 nodes/four child levels and reserve closing markup within a 3,200-byte budget. Surrounding context includes at most four ancestors and two siblings, allowlisted attributes and stripped HTTP(S) URL queries/fragments/credentials; each validated snapshot is at most 10,000 bytes. Editable values, hidden subtrees, scripts and arbitrary data attributes are omitted. DOM excerpts are escaped React text in the inspector, never injected HTML. MCP, manual copy and all direct CLI transports share the same `agentContext` guidance, including verification of the exact source component/instance and clarification when ambiguous. The panel shortens only its visible name and groups capture-time computed styles. Locating is injected on demand and requires the same active tab/project/page, one exact selector and matching tag/role/name; no fuzzy fallback.

The settings version action fetches only the fixed public GitHub latest-release endpoint, with omitted credentials, no task/page data, an eight-second timeout and no automatic request on mount. The manifest permits GitHub API fetches through a scoped host permission and CSP entry; executable code remains bundled locally. Failed, malformed or rate-limited responses cannot report an up-to-date state.

The picker captures selectors, visible text, bounded computed styles and geometry, excluding full HTML, screenshots, input values and query parameters. Iframes, closed Shadow DOM and canvas are not precise targets; Chrome internal pages prohibit injection. PointDOM does not deploy the application or run its development server.

See [Verification](VERIFICATION.md) for observed historical checks and unverified integrations. Keep release claims tied to executed evidence.

## Installation and update boundaries

`pdo setup` is the initial interactive guide; `pdo extension` reopens the browser installation instructions. Desktop actions report their actual result, and the directory path stays on the clipboard until the user confirms loading before setup copies a pairing code. `pdo upgrade` selects the latest published stable Release; repository changes are not an update channel.

Release installs activate a managed real `PointDOM Extension` directory and a `current` pointer only after readiness. The marker in the browser folder identifies installer-owned content; unmarked folders and unrelated pointers are refused. Folder content is staged with rollback before switching the MCP pointer. Source checkouts/extracted verification archives stay independent. New MCP exports use the fixed entry, while legacy version-specific configurations require a one-time re-import. Do not alter the user's host files automatically or delete referenced old runtimes/releases.

The Chromium upgrade test uses a disposable profile with Developer mode enabled, copies two builds into temporary release directories and invokes extension reload. It checks version change, stable ID and retained storage; it does not load the user's Chrome profile or update their installed service. Windows/Linux automatic release installation and Web Store delivery are not implied by these checks.
