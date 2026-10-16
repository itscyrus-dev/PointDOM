# Changelog

Notable changes to PointDOM. Release archives and installers are available from [GitHub Releases](https://github.com/itscyrus-dev/PointDOM/releases).

## [Unreleased]

### Added

- A compact client setup directory with offline Codex, Trae, Claude Code, Zcode, OpenCode and generic MCP entries. Copy localized per-host setup instructions from each disconnected row; availability and selection unlock only after real project-bound MCP initialization. Unknown hosts and duplicate sessions remain supported.

- Live, project-scoped MCP client presence and an explicit recipient picker. Only the chosen session can list/read/claim its tasks; same-name sessions remain distinct. Remember client preference for new submissions and allow explicit queued reassignment without moving running work. Disconnects never replay or distribute tasks.

### Fixed

- Reject unregistered/old MCP list calls with MCP_RECONNECT_REQUIRED instead of a misleading successful empty inbox. Setup copies require restarting/reconnecting old host processes and verifying the correct project plus connection.id through native tools in the actual conversation.

### Changed

- Scope this implementation to generic local stdio MCP: DOM context, project-scoped tasks, claim/progress/report, history and duration. Browser submission queues work; the host decides when to invoke tools.
- Remove desktop chat binding, native Trae sending, delivery retries and related controls. Legacy records/settings remain readable and cannot trigger native actions. Retired handoff APIs return 410.
- Keep `pdo` for service installation/pairing/project registration and MCP export. Agent CLI execution is deferred to a separate feature.

## [0.3.1] - 2026-10-15

### Changed

- All new annotations now use MCP in the user's own Agent client. Removed agent CLI/ACP runners, Claude Agent SDK, binary detection, model/account queries, execution/approval/network controls, Git operations and paid-model smoke scripts. Legacy task payloads normalize to MCP; historical records remain readable. PointDOM owns context capture, explicit automatic delivery and progress/result receipts only. The `pdo` management commands remain for installation, pairing and project/MCP setup.

### Added

- Extension-first local-service discovery and system-specific one-command installation, with short-lived extension-bound authorization and automatic browser pairing. Manual pairing remains an advanced fallback; existing data and active services are preserved. Windows PowerShell installation and per-user startup are included as a candidate pending native verification.

### Fixed

- MCP is the fixed task transport; Trae auto-send is a shared application preference. New projects detect their own chat on first submission, with cross-project destination checks and no routine processing-copy buttons. Blocked sends offer direct rediscovery on retry. Long hover labels size to their content.

- Trae auto-send focuses the verified accessibility input instead of relying on desktop coordinates. Explicit retries adopt the current project binding without replaying history; compact auto-send settings hide routine copy instructions while enabled and offer a direct retry on failure.

- Trae always uses MCP. Application auto-send with project-specific conversation routing adds submit-and-send on macOS, with draft/context checks, native acknowledgement, serialized delivery, disable controls and no automatic replay of uncertain sends. Sending remains separate from task claim and completion.

- MCP agents can send bounded, session-owned activity summaries with `pointdom_progress_task`; processing instructions request read/edit/check updates instead of leaving only a claim event. These are explicit host reports, not automatic access to private client logs.

- Claimed and finished tasks hide obsolete client-delivery warnings. Automatic MCP processing uses a task-specific instruction and an explicit same-session claim/report requirement; routine processing-copy buttons are removed.

- Concise setup instructions follow the selected panel language and reset copy feedback after language changes. Trae guidance calls out both enable switches and provides an exact configuration handoff when the host protects MCP files.

- Trae client delivery recognizes `Trae CN.app`; unconfigured universal MCP delivery no longer reports an unspecified desktop client as missing. Setup handoff requires agents to create missing project MCP files instead of handing that work back to the user.
- Paired settings offer a one-copy agent handoff for project registration, MCP configuration and read-only verification, with Trae project setup guidance and honest host-confirmation requirements.
- Unlinked-project settings show `pdo link --origin` with source-directory and development-URL guidance instead of sending users back to initial setup.
- Setup separates installation, pairing and completion into compact terminal blocks with highlighted actions and commands; redirected output and `NO_COLOR` remain plain.
- First-install setup creates and selects the extension ZIP in Finder for direct drag installation, without a directory chooser. Managed-folder installation remains available through `pdo extension`. `pdo extension --zip` exports a standalone bundle with manual-update guidance.
- Default setup only loads/pairs the extension without requiring a project or agent selection. Add projects later with `pdo link`; MCP configuration remains scoped to a linked project. Explicit `--origin`/`--path` options retain the combined project guide with correctable directory validation.
- Project-directory errors and setup failures use English messages without Node.js stack traces. Explicit paths use the same root/home, directory and symlink validation as the local bridge.

## [0.3.0] - 2026-10-15

### Added

- Named automatic execution for Codex, OpenCode, Claude Code and Trae, using each installed CLI's local configuration. Any coding client with local stdio MCP and project editing tools can use the generic MCP workflow without a particular CLI.
- Missing-CLI delivery through the MCP inbox, with a copied processing instruction and bounded attempts to fill a supported macOS client's empty input. The user sends it; existing input drafts are preserved.
- Project-scoped confirmation preferences and separate Codex networking, snapshotted onto new tasks without changing global CLI settings.
- Precise selection of nested text, SVG geometry and open-shadow-root elements, explicit parent/child selection with Alt/Option + Up/Down, and unique structural selectors when IDs repeat.
- Bounded, sanitized DOM excerpts with attributes, ancestor/sibling context, capture times and truncation markers. MCP, manual copying and direct CLI execution share guidance to verify the source component and instance.
- A dismissible element inspector with grouped computed styles, selector copying, DOM structure and exact page locating; a current-tab Clear all action.
- Recorded execution duration, project-scoped task history/counts, picker feedback and running-task border motion with reduced-motion support.
- Settings version display and an explicit stable-release check with retry and update instructions.
- A Simplified Chinese README, English-first documentation index, centered project logo and installation guides for each named client plus generic MCP hosts.

### Changed

- Rebuilt the extension panel with React/HeroUI, compact controls, English/Chinese preferences, monochrome light/dark themes and separate header appearance/language actions.
- CLI execution uses local defaults. Model, speed, reasoning and automatic-commit controls are removed from the panel; tasks do not automatically commit or push.
- First installation uses `pdo setup`; later updates use `pdo upgrade`. Setup exposes the Chrome folder clearly and reports actual pairing/page-access states.
- Release installations use a fixed managed extension folder and stable MCP entry. Updates check version metadata, verify assets, refuse unfinished tasks and preserve prior versions for recovery.

### Fixed

- Clicking a card's child text no longer promotes selection to the enclosing link/button.
- History clears and reloads when projects change, rejects stale or foreign results, and filters by project before applying the latest-100 display limit.
- Pointer interactions avoid stacked focus rings, permission controls remain operable, successful permission saves close their popover, and update-button hover is limited to its content width.
- Installation activation rejects unrelated folders and rolls back a failed fixed-entry switch.
- Documentation no longer treats OpenCode CLI as an installation requirement. Old test screenshots and decorative badge images are removed.

### Upgrade notes

- Run `pdo upgrade` after tasks finish, reload PointDOM in Chrome, refresh project pages and reconnect MCP clients.
- Older version-specific extension paths or aliases need a one-time load from the fixed folder via `pdo extension`. Version-specific MCP configurations need one regenerated entry from `pdo connect --json`.
- Existing pairing, projects and task records are retained. New DOM context fields are optional for older records; reselect elements to capture the richer context. Existing MCP claims remain subject to their original session identity.
- Chrome Web Store distribution is not included. Closed shadow trees, iframe interiors and canvas internals do not have supported precise selection. Live compatibility with every agent account/version is not implied by fixture tests; see [verification](docs/VERIFICATION.md).

## Earlier releases

- [0.2.1](https://github.com/itscyrus-dev/PointDOM/releases/tag/v0.2.1): extension setup path and CLI installation guide.
- [0.2.0](https://github.com/itscyrus-dev/PointDOM/releases/tag/v0.2.0): simplified setup and `pdo upgrade`.
- [0.1.0](https://github.com/itscyrus-dev/PointDOM/releases/tag/v0.1.0): initial release.

[0.3.1]: https://github.com/itscyrus-dev/PointDOM/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/itscyrus-dev/PointDOM/compare/v0.2.1...v0.3.0
