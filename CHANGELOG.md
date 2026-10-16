# Changelog

Notable changes to PointDOM. Release archives and installers are available from [GitHub Releases](https://github.com/itscyrus-dev/PointDOM/releases).

## [0.4.0] - 2026-10-16

### Added

- A localized client directory for Codex, Trae, Claude Code, Zcode, OpenCode and other MCP hosts. Copy setup instructions into the selected host; availability requires a live project-bound MCP connection.
- Session registration, heartbeat expiry and explicit task recipients. Only the selected session can list, read and claim its tasks. Queued tasks can be reassigned explicitly; running tasks remain with their owner.
- Session-owned progress summaries and explicit completion reports, preserving project-isolated history.
- Extension-first service discovery, OS detection, one-command installation and extension-bound automatic pairing. Manual pairing remains an advanced fallback.
- A Windows PowerShell installer and isolated Windows CI coverage, alongside the macOS installer.

### Changed

- All new annotations use generic local stdio MCP in the user's own agent client. Removed agent CLI/ACP runners, desktop chat automation, client input filling and model/permission controls. Legacy history remains readable.
- Browser submission queues work for the chosen client; connecting MCP does not start an idle agent conversation. Agent CLI execution is deferred.
- Keep pdo for installation, updates, pairing, project registration and MCP configuration export. First-time setup no longer requires choosing a project; add projects later with pdo link.
- Simplify setup steps, highlight terminal actions and provide an extension ZIP for manual browser installation.
- Synchronize English and Chinese READMEs and host guides with the MCP workflow and native connection verification.

### Fixed

- Return MCP_RECONNECT_REQUIRED for unregistered old MCP processes instead of a misleading successful empty inbox. Setup verification requires the correct project and connection.id from a native tool call in the actual host conversation.
- Localize copied setup instructions to the extension language, preserve unrelated host configuration and distinguish configured services from connected sessions.
- Validate project directories with concise English CLI errors and preserve existing installation data during setup and upgrades.
- Compute Windows download checksums through .NET without depending on Get-FileHash module availability.

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
