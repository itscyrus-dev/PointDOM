# Verification and compatibility

These are local working-tree checks, not a published release or proof of all provider/model combinations.

## CLI execution revision — 2026-10-16

- Node.js 24.13.0; pnpm 10.34.7.
- `pnpm check`: strict TypeScript, 117 passing tests and one Windows-native skip, followed by extension/bridge build.
- `pnpm test:e2e`: 14 passing isolated workflows. The browser submits DOM context to the real bridge; an isolated executable modifies a temporary CSS file and returns structured events. Tests cover four adapter parsers, global selection, disabled missing tools, settings persistence, drafts, focus/hover, narrow layouts and project origin/history isolation.
- Activity regressions cover actual Codex/Trae commands, Claude tool-result correlation, OpenCode tool states, repeated-event deduplication, credential redaction and truncation. Browser assertions verify a real fixture subprocess command/output, not generic activity text. Historical discarded output is never fabricated.
- Runner regressions cover duplicate IDs, same-project ordering, cancellation of an actually started child, timeout/nonzero exit, missing protocol completion, permission denial and restart without replay. OpenCode v2 regressions cover installed-version detection and clean completion without step_finish, while rejecting reported errors and empty output. Failure diagnostics distinguish authentication/model/argument errors and redact credentials.
- Account/provider requests are not made. Successful fixtures do not prove login, quota, production model edits or interactive approval behavior.
- Windows path resolution and process-tree termination require native Windows validation. Browser OS-detection fixtures are not equivalent to a Windows process test.

New submissions reject MCP and legacy execution overrides. Legacy MCP tests remain for history/compatibility only; their success is not required to execute CLI tasks. CLI results are reports from the selected tool, not independent verification of requested code changes.

## Browser context and isolation

Selection workflows cover nested text/SVG, explicit parent/child levels, pointer-events-none descendants, open shadow roots, duplicate IDs, unique selectors, sanitized DOM snapshots and prevention of website click actions. The same context and source-location guidance reach CLI tasks, legacy MCP tasks and optional DOM export. Inspectors group captured styles, locate only exact matching elements, preserve drafts and handle missing/changed/ambiguous targets. Closed shadow roots, iframe interiors and canvas internals remain outside precise selection support.

History/counts follow the selected project, filter before the latest-100 limit and reject stale/foreign responses. Shared origins require an explicit project choice. Element descriptions, pairing, appearance and per-tab drafts survive reopening. Native Chrome access is checked again after requests; denied, changed-tab and changed-origin cases do not inject.

Theme/language, reduced motion, running borders, picker brackets, active-icon breathing, header focus and compact hover states are checked in isolated browser profiles. Version checks use intercepted public release metadata, including pending, failure, current, update and local-ahead states; they do not establish live GitHub availability.

## Installation and updates

Extension-first discovery refuses credentials before an authenticated, expiring extension-bound challenge grant. Host/Origin, challenge mismatch, expiry/capacity/restart and forged header cases are covered. Browser tests mock each reported macOS/Windows platform, copy the matching installation command, authorize locally, pair through the normal flow and preserve saved state on reopening. Installer tests use disposable homes, mock downloads/processes and fixed service labels; they do not install into the user's service.

Packaging/update checks cover checksums, failures, spaces in paths, repeated setup, fixed browser/MCP paths, migration of aliases, refusing unrelated folders, activation rollback and unchanged-version metadata without reinstalling. A temporary Chromium profile verifies that fixed-folder extension reload keeps the ID/storage while changing the version. Existing actual Chrome copies still need the new package loaded/reloaded; a successful build is not proof that the user's current panel runs it.

## Explicit limits

- CLI runs use the locally installed tool's account, model and permissions. Real provider requests, quota and code-change quality are not established by fixture tests. Completion reports are not independent validation of every edit.
- A read-only local preflight found the installed Trae CLI unauthenticated and returning a headless Codebase Git authentication error. No login, network/proxy or credential configuration was changed; successful authenticated Trae execution remains unverified.
- Windows installation/startup is a candidate with native verification still required; the Windows-only integration test is not treated as passing on macOS.
- Idle MCP-client activation and native desktop sending are not included. New browser tasks execute through CLI, rather than an existing desktop conversation.
- Chrome Web Store distribution and automatic reload of arbitrary ZIP-installed copies are not implemented.

## Legacy MCP compatibility

The checks below apply to retained compatibility APIs and task history. They do not describe the current browser UI or imply that new submissions use MCP.

### Explicit recipient routing

The routing regression first failed on the missing connection-registration endpoint; the browser regression first failed on the missing recipient picker. Tests now cover actual MCP client-info registration via the stdio fixture, same-name distinct identities, heartbeat expiry/re-registration, private capability versus public ID, cross-project rejection, assigned list/get/claim visibility, spoofed model agent labels, explicit queued reassignment, stale assignment rejection, original submission idempotency after transfer, per-project execution serialization and reporting by the original owner after presence disappears. Unassigned old records cannot be claimed until explicitly assigned.

Server regressions retain explicit recipient ownership and queued reassignment checks for legacy MCP tasks. Current browser tests select CLI executors and check global preference persistence and project isolation. Fixture names do not establish live account compatibility or automatic idle-host activation.

### Client setup directory

Unit regressions first failed on missing offline catalog entries and empty per-client setup instructions. The browser regression first failed because the recipient popover had no client list. Retained unit checks cover offline catalog entries, project presence exclusion, localized setup copies and credential/page/draft isolation. The former browser setup directory has been replaced by the CLI executor menu; its old clipboard/client-presence workflow is not part of current browser verification. No real coding-agent installation or host configuration is performed by these tests.

### Old MCP process reconnect requirement

A local read-only diagnostic reproduced an empty real client-presence list after a host reported a successful empty inbox. Existing Trae child processes predated the installed presence implementation, despite pointing at the current bundle path. An isolated regression then reproduced an authenticated unregistered caller receiving HTTP 200 and an empty inbox. The bridge now requires session registration for list calls and returns HTTP 409 / MCP_RECONNECT_REQUIRED otherwise. Registered native sessions still receive their project and connection.id with an empty task list when appropriate.

Both generic and per-client setup copies now require host restart/reconnect, native in-conversation verification of project plus connection.id, and exact user steps when reconnection is host-controlled. They reject a temporary SDK process or tasks: [] alone as proof. Tests cover localized copies and the HTTP failure pattern. The actual user's host reconnection is intentionally left to their selected agent, per their request; no Trae MCP configuration is added or altered by PointDOM development.

### Universal MCP and grouped recipients

TDD regressions first failed because export still included `--project`, universal stdio startup rejected missing project arguments, and the client directory emitted separate same-name top-level rows. A later negative test caught relative workspace paths being accepted; bind now requires an absolute source directory.

The real stdio fixture initializes without a project, binds two registered workspaces in the same process, requires explicit project IDs, verifies idempotent binding, rejects unknown/unregistered scopes and cross-project reads/claims, and waits/claims/progresses/reports both tasks independently. Legacy fixed-project lifecycle tests remain enabled. Unit regressions retain grouping of same-name connections; the current browser UI no longer selects MCP sessions. The browser compatibility test verifies that MCP export omits a fixed project argument. No actual agent account, user project edits or desktop automation are involved.

Host configuration migration is documented but not executed against the user's clients. Multiple host processes remain independent recipients; grouping is not evidence that a host has only one process or conversation. Windows-only installation checks remain skipped on macOS.
