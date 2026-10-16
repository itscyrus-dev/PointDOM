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

These commands package and verify locally; they do not publish. Tests never call paid models or start an Agent CLI; real execution belongs to the user’s connected MCP host.

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
| `src/bridge/mcp.ts`                                             | Project-bound stdio MCP entry point.                                                              |
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

`src/shared/agent-setup.ts` owns the concise Chinese and English post-pairing setup messages; detailed host steps stay in the linked installation guide. The settings action chooses the static message matching the panel language and resets copy feedback on language changes. It copies only that text, never the saved pairing code, active page or a browser-supplied working directory. The receiving coding agent resolves the host workspace, links it through `pdo`, merges project MCP settings and verifies a read-only tool call. Browser copy success is not a host-connection status. Keep retry/pending feedback in the card and leave configuration/command execution outside the browser.

`brand.ts` defines the logo. Run `pnpm icons` after geometry changes to regenerate SVG and 16/32/48/128px PNGs. Chrome `_locales` controls native labels; the panel's selected language is independent. Generated DOM context guidance, automatic bridge instructions and MCP tool descriptions are English. Manual setup copies follow the selected panel language; routine task-processing copy actions are removed; original notes/page text remain unchanged. Keep product UI bilingual.

The obsolete native `details` execution menu is gone; do not restore it alongside HeroUI. The `toolbar.ts` cleanup shim, legacy `pagepatch_*` MCP aliases, `PAGEPATCH_*` environment names, retired preference normalization remain compatibility surfaces, not removable dead code.

`scripts/mcp-config.mjs` is a legacy source-only exporter with a fixed `pagepatch` ID. New installation docs use `pdo connect`, which generates unique project/installation IDs. Keep the legacy helper's compatibility tests until it is deliberately retired.

## Runtime configuration

`PAGEPATCH_HOME` selects the private state directory. The MCP process receives only local launch metadata and reads the bridge credential from private state. Agent binary/provider/model overrides are no longer read. User models, accounts, command approval and network settings stay in the host client.

## Execution, permissions and storage

`Queue` is a durable MCP inbox with no runner, subprocess, automatic file edit, command approval or Git implementation. Every new submission normalizes to `executor: mcp`; legacy execution/permission fields are not copied to it. Registered origins, the pending-task cap, request deduplication, cancellation and stopping checks still apply. The bridge persists records in `jobs.json`; only an authenticated host MCP claim starts execution, and only its matching claim can report progress/results. Reports remain factual host assertions, not independent verification. Start/finish timestamps exclude queue time and survive duplicate reports/restart.

Historical records retain their executor/permission/commit fields for reading. Store migration changes the default executor to MCP; it does not rewrite completed tasks or rerun queued CLI work. The removed model/account/permissions/approval/commit HTTP endpoints return 410. The management `pdo` command remains for installing/starting/updating the bridge, pairing, linking project origins and exporting credential-free MCP configuration.

Desktop automation is retired. Submissions go directly to the durable MCP inbox without delivery receipts or native process/UI calls. Old bindings, receipts and auto-send preferences remain readable but inactive. `GET /api/settings` returns fixed MCP and a false compatibility flag. Retired handoff endpoints and updates to native auto-send return 410 without changing state. No project chat discovery, clipboard delivery or desktop-control permission is required.

Project histories filter before the latest-100 limit and reject stale/foreign browser results. Project/tab drafts stay separate. New tasks never snapshot or alter host approval policies. Cancelling invalidates subsequent MCP reports, but users stop external commands in their client. MCP agents must keep the same stdio process alive from claim through final report.

## Verification boundaries

Tests exercise actual stdio MCP claim/progress/report transport, authenticated HTTP boundaries and the packaged UI in temporary projects. Dependency-graph tests ensure native sending modules are not reachable; generic submission tests keep old opt-ins inactive. There are no paid model smoke scripts or direct Agent CLI dependencies. Host accounts and idle-client activation are not implied by these checks. Agent CLI execution belongs to a future feature.

Selection names prioritize `aria-labelledby`, `aria-label`, associated field labels, alt/title, a container heading and bounded visible text. Editable values and hidden subtrees are excluded. The optional selection `role`, `dom` and `selectorPath` remain backward compatible with stored records. The composed event path is used as-is, with no clickable-ancestor promotion. Alt+Up/Down tracks explicit hierarchy selection; each open ShadowRoot has a separately verified unique selector. Duplicate IDs fall back to structural selectors. DOM excerpts visit at most 40 nodes/four child levels and reserve closing markup within a 3,200-byte budget. Surrounding context includes at most four ancestors and two siblings, allowlisted attributes and stripped HTTP(S) URL queries/fragments/credentials; each validated snapshot is at most 10,000 bytes. Editable values, hidden subtrees, scripts and arbitrary data attributes are omitted. DOM excerpts are escaped React text in the inspector, never injected HTML. MCP and optional DOM context export share the same `agentContext` guidance, including verification of the exact source component/instance and clarification when ambiguous. The panel shortens only its visible name and groups capture-time computed styles. Locating is injected on demand and requires the same active tab/project/page, one exact selector and matching tag/role/name; no fuzzy fallback.

The settings version action fetches only the fixed public GitHub latest-release endpoint, with omitted credentials, no task/page data, an eight-second timeout and no automatic request on mount. The manifest permits GitHub API fetches through a scoped host permission and CSP entry; executable code remains bundled locally. Failed, malformed or rate-limited responses cannot report an up-to-date state.

The picker captures selectors, visible text, bounded computed styles and geometry, excluding full HTML, screenshots, input values and query parameters. Iframes, closed Shadow DOM and canvas are not precise targets; Chrome internal pages prohibit injection. PointDOM does not deploy the application or run its development server.

See [Verification](VERIFICATION.md) for observed historical checks and unverified integrations. Keep release claims tied to executed evidence.

## Installation and update boundaries

`pdo setup` is the initial interactive guide; `pdo extension` reopens the browser installation instructions. Default setup only loads/pairs the extension, regardless of the current directory; it does not ask for or change the agent preference unless an agent/client option is supplied. It never requests a project or exports project-scoped MCP settings. Projects are added later with `pdo link --origin URL`; `pdo connect --json` exports the selected project’s MCP settings. Only optional `setup --origin URL` or `setup --path PATH` validates a confirmed project folder before sending a binding. Root/home aliases, missing directories and files are refused; interactive errors allow correction. Explicit `--path` bypasses the folder prompt but uses the same validation as the bridge. Setup uses short, spaced blocks: cyan action/command emphasis, green receipts and dim supporting copy. ANSI styling is disabled for redirected output, dumb terminals and `NO_COLOR`. Setup failures print English messages without Node stacks, and cancellation retains exit code 130. Setup generates a ZIP, opens Chrome first and then selects the ZIP in Finder so the exact install file is foreground. Its instructions contain no directory-selection steps. The separate `pdo extension` command retains managed-folder installation and a chooser fallback. `pdo extension --zip` exports only the extension bundle with a root manifest, never pairing or installer markers. ZIP imports are manual copies owned by Chrome; the managed-folder reload/update contract does not apply to them. Desktop actions report their actual result, and ZIP preparation leaves the clipboard unchanged until the user confirms loading and setup copies a pairing code. `pdo upgrade` selects the latest published stable Release; repository changes are not an update channel.

Release installs activate a managed real `PointDOM Extension` directory and a `current` pointer only after readiness. The marker in the browser folder identifies installer-owned content; unmarked folders and unrelated pointers are refused. Folder content is staged with rollback before switching the MCP pointer. Source checkouts/extracted verification archives stay independent. New MCP exports use the fixed entry, while legacy version-specific configurations require a one-time re-import. Do not alter the user's host files automatically or delete referenced old runtimes/releases.

The Chromium upgrade test uses a disposable profile with Developer mode enabled, copies two builds into temporary release directories and invokes extension reload. It checks version change, stable ID and retained storage; it does not load the user's Chrome profile or update their installed service. Windows/Linux automatic release installation and Web Store delivery are not implied by these checks.

## MCP client presence

`agent-connections.ts` maintains bounded, ephemeral project-bound presence. The initialized stdio client registers and heartbeats; no native app detection is involved. Public connection IDs cannot authorize claims. `agent-api.ts` filters list/get and checks claim against the private session capability and persisted task recipient. `queue.ts` preserves the original recipient ID for duplicate submission checks. Explicit reassignment updates only queued tasks, checks the expected previous recipient, and preserves the original submission fingerprint. Presence is not durable task state; expiry cannot reassign or resume a task. See [MCP routing](MCP.md#client-presence-and-task-routing).

`src/shared/agent-clients.ts` owns catalog aliases, offline setup entries and static, localized per-host setup handoffs. Catalog presence is not installation detection. The primary recipient popover shows copy/setup for disconnected entries and Use for initialized connections; it preserves unknown hosts and duplicate sessions. Keep live IDs as the only selectable values, isolate copy state per row/language, and let existing project-scoped polling update availability. The explicit queued-reassignment control still lists live sessions only.
