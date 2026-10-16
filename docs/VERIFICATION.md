# Verification and compatibility

These are local working-tree checks, separate from a published release or GitHub Actions result. Fixtures do not establish compatibility with every agent account, model or host version.

## Working-tree checks: 2026-10-16

Node.js 24.13.0 and pnpm 10.34.7 are used locally.

| Check                                      | Scope                                                                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                               | Strict TypeScript, 98 passing MCP/bridge/installer tests and extension/bridge build. One Windows-native installation test is skipped on macOS.                                                 |
| `pnpm test:e2e`                            | Thirteen isolated Chromium workflows for the packaged React/HeroUI UI, real stdio MCP lifecycle, generic MCP submission, selection, drafts, access, updates, history and theme/focus behavior. |
| `pnpm format:check`, `git diff --check`    | Repository formatting and whitespace.                                                                                                                                                          |
| `sh -n install.sh`                         | Shell installer syntax.                                                                                                                                                                        |
| `pnpm release:pack`, `pnpm release:verify` | Local checksums, standalone management command, MCP exports, extension ZIP, installation guides and license notices. No publication.                                                           |

## MCP-only execution boundary

Regression tests first failed when legacy Codex/OpenCode/Claude choices attempted CLI detection, and when PointDOM still accepted project permission changes. All new submissions now normalize to MCP, including old payloads with model/approval/auto-commit fields. Execution overrides and old project permissions are not copied onto new tasks. MCP project context excludes retired model and permission settings while preserving them in historical local storage. The inbox never starts work; only a real MCP claim moves a task from queued to running. Model/account, approval, permission and Git endpoints return 410 without external actions.

A build-metadata regression verifies that the management service does not import removed Codex, Claude, OpenCode, ACP or Git runners. The Claude Agent SDK and paid model smoke scripts are removed. Tests for those retired executors were replaced with the MCP boundary and lifecycle checks; they are not evidence of current CLI support.

HTTP and real stdio tests cover authentication, Host/origin checks, local-only project binding, task/project ownership, duplicate submission and claim/report behavior, cancellation, restart interruption and bounded progress. Only the same claiming MCP session can update/report a task. Progress retries use stable step IDs and do not duplicate events. Completion requires an explicit host report; process exit, sending and empty results never fabricate success. Cancelling does not terminate commands already running in the external client.

The packaged browser workflow submits selected DOM descriptions to the real bridge, observes queued status before claiming, then uses a real stdio MCP client to read/claim/report milestones. The external test client edits only temporary CSS and reports actual files/checks. The UI updates through polling, records duration and preserves cancellation/history. No real user project, model account or agent client is used.

## Generic MCP submission

Regression tests first reproduced legacy auto-send preferences creating native delivery receipts, old handoff controls mutating routing, native sender modules remaining reachable, and recovery rewriting old queued receipts. New submissions now go directly to the durable MCP inbox with no desktop delivery fields. Old config/receipts remain readable but cannot start a send. Native handoff endpoints return 410 without mutation, and import-graph checks exclude desktop sending code.

The isolated packaged browser test first reproduced the old auto-send controls still appearing. It now verifies a live recipient picker, remembered preference and explicit reassignment, queued submissions across two projects with a legacy opt-in present, no auto-send/retry/copy-processing controls, project-isolated records, reopening and Chinese/English guidance. It does not claim a live client will wake automatically. Real stdio MCP tests continue to cover read/claim/progress/report and source changes only in dedicated temporary fixture projects.

No real user annotation, Trae window, paid model or private chat is used to test the generic MCP refactor. The former native sender and its OS fixtures are removed. Agent CLI execution and host-trigger integrations are future work.

## Browser context and isolation

Selection workflows cover nested text/SVG, explicit parent/child levels, pointer-events-none descendants, open shadow roots, duplicate IDs, unique selectors, sanitized DOM snapshots and prevention of website click actions. The same context and source-location guidance reach MCP and optional DOM export. Inspectors group captured styles, locate only exact matching elements, preserve drafts and handle missing/changed/ambiguous targets. Closed shadow roots, iframe interiors and canvas internals remain outside precise selection support.

History/counts follow the selected project, filter before the latest-100 limit and reject stale/foreign responses. Shared origins require an explicit project choice. Element descriptions, pairing, appearance and per-tab drafts survive reopening. Native Chrome access is checked again after requests; denied, changed-tab and changed-origin cases do not inject.

Theme/language, reduced motion, running borders, picker brackets, active-icon breathing, header focus and compact hover states are checked in isolated browser profiles. Version checks use intercepted public release metadata, including pending, failure, current, update and local-ahead states; they do not establish live GitHub availability.

## Installation and updates

Extension-first discovery refuses credentials before an authenticated, expiring extension-bound challenge grant. Host/Origin, challenge mismatch, expiry/capacity/restart and forged header cases are covered. Browser tests mock each reported macOS/Windows platform, copy the matching installation command, authorize locally, pair through the normal flow and preserve saved state on reopening. Installer tests use disposable homes, mock downloads/processes and fixed service labels; they do not install into the user's service.

Packaging/update checks cover checksums, failures, spaces in paths, repeated setup, fixed browser/MCP paths, migration of aliases, refusing unrelated folders, activation rollback and unchanged-version metadata without reinstalling. A temporary Chromium profile verifies that fixed-folder extension reload keeps the ID/storage while changing the version. Existing actual Chrome copies still need the new package loaded/reloaded; a successful build is not proof that the user's current panel runs it.

## Explicit limits

- MCP task tools support any compatible local stdio coding host; actual host enablement, trust and project connection still need verification in that host.
- Idle-client activation, native desktop sending and Agent CLI execution are not included. A connected MCP server does not prove an agent is running.
- Windows installation/startup is a candidate with CI/native verification still required; the Windows-only integration test is not treated as passing on macOS.
- No paid model, provider authentication or every-version host compatibility is established by fixture tests.
- Progress is explicitly reported through MCP, not an automatic mirror of the host's private tool log.
- Chrome Web Store distribution and automatic reload of arbitrary ZIP-installed copies are not implemented.

## Explicit recipient routing

The routing regression first failed on the missing connection-registration endpoint; the browser regression first failed on the missing recipient picker. Tests now cover actual MCP client-info registration via the stdio fixture, same-name distinct identities, heartbeat expiry/re-registration, private capability versus public ID, cross-project rejection, assigned list/get/claim visibility, spoofed model agent labels, explicit queued reassignment, stale assignment rejection, original submission idempotency after transfer, per-project execution serialization and reporting by the original owner after presence disappears. Unassigned old records cannot be claimed until explicitly assigned.

The browser fixture chooses Trae, submits in two projects, preserves the client preference after reopening, switches future submissions to Codex without moving old work, then explicitly reassigns a queued task. English/Chinese states and narrow popover rendering are checked. Fixture names do not establish live compatibility with Trae, Zcode, Codex or Claude Code, nor demonstrate automatic idle-host activation.

## Client setup directory

Unit regressions first failed on missing offline catalog entries and empty per-client setup instructions. The browser regression first failed because the recipient popover had no client list. The new workflow covers offline entries, cross-project presence exclusion, clipboard failure/pending/retry, Chinese and English copies, no credential/page/draft forwarding, no speculative availability after copying, actual polling-driven availability changes, selection, preserved drafts and task ownership after disconnection. A visible-side-panel state is simulated for polling in the isolated inactive-tab harness; service responses and rendering remain real. Narrow/light and normal/dark screenshots are local test artifacts. No real coding-agent installation or host configuration is performed by these tests.

## Old MCP process reconnect requirement

A local read-only diagnostic reproduced an empty real client-presence list after a host reported a successful empty inbox. Existing Trae child processes predated the installed presence implementation, despite pointing at the current bundle path. An isolated regression then reproduced an authenticated unregistered caller receiving HTTP 200 and an empty inbox. The bridge now requires session registration for list calls and returns HTTP 409 / MCP_RECONNECT_REQUIRED otherwise. Registered native sessions still receive their project and connection.id with an empty task list when appropriate.

Both generic and per-client setup copies now require host restart/reconnect, native in-conversation verification of project plus connection.id, and exact user steps when reconnection is host-controlled. They reject a temporary SDK process or tasks: [] alone as proof. Tests cover localized copies and the HTTP failure pattern. The actual user's host reconnection is intentionally left to their selected agent, per their request; no Trae MCP configuration is added or altered by PointDOM development.
