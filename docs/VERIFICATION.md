# Verification and compatibility

These are observed checks, not guarantees for every account, operating system or host version. Local working-tree verification is separate from a published release and its GitHub Actions result.

## Working-tree checks: 2026-10-15

Using Node.js 24.13.0 and pnpm 10.34.7, the following checks passed locally:

| Check                                         | Observed scope                                                                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                  | Strict TypeScript with unused-local/parameter checks, 83 Node tests, extension/bridge build.                                                                                          |
| `pnpm test:e2e`                               | Eight isolated Chromium tests covering the packaged React/HeroUI UI, task lifecycle, header focus, project history, fixed-directory upgrades and project-permission/access states.    |
| `pnpm format:check` and `git diff --check`    | Repository formatting and whitespace checks.                                                                                                                                          |
| `sh -n install.sh`                            | Installer shell syntax.                                                                                                                                                               |
| `pnpm release:pack` and `pnpm release:verify` | Checksums, standalone CLI, MCP exports, extension ZIP, English installation guides and license notices in the local archive. No publication.                                          |
| Documentation checks                          | English default and Simplified Chinese READMEs, relative links/anchors, language navigation, logo paths and shell/JSON/TOML examples checked without executing installation commands. |

The tests use disposable projects, subprocess fixtures, isolated browser profiles and temporary state/ports. They do not call paid models or change the user's actual client configuration. Copied context tests verify English generated guidance, preservation of original user/page languages, and separation of per-element instructions from untrusted page data.

Protocol tests cover pairing, Host/origin checks, project isolation, serialized/deduplicated jobs, approvals, cancellation, persistent results, restart interruption and idempotent MCP claims/reports. Installer tests exercise checksums, download failures, paths containing spaces and repeated installation. Browser tests cover drafts, language/theme persistence, permission-save closure/retry, compact access-card state, moving task borders with reduced-motion fallback, Crosshair target brackets/measurement without viewport lines, active-icon breathing and reduced-motion/exit cleanup in light and dark pages, and project-scoped history/counts across tab changes, shared origins and reopening. Project-history checks also cover filtering before the latest-100 limit, stale responses, older bridges and preserving persisted records.

A guarded local service restart also verified scoped history queries for two registered projects while preserving all 17 existing records and pairing/project configuration. A later guarded reload for the precise-selection update preserved all 18 then-current records and the complete pairing/project configuration; a read-only MCP detail request confirmed the updated structural-context guidance. The restart was permitted only after the service reported no pending or running tasks; no real task was cancelled or rerun. Browser tests used the rebuilt extension in an isolated profile; an already loaded Chrome extension still requires reloading.

A nested-card regression first reproduced the merged-card selection and passed after removing clickable-ancestor promotion. Precise-selection checks cover independent left/right text, SVG paths, parent/child level selection, pointer-events-none descendants, open-shadow-root selection/locating, duplicate IDs, sanitized DOM context through persisted tasks/MCP/direct prompts, bounded truncation and prevented website actions.

Element-inspection checks cover semantic names, editable-value exclusion, grouped/default styles, selector copying, exact locating, missing/changed/ambiguous targets, draft preservation and narrow layouts. Version checks use intercepted public metadata, including pending/duplicate protection, current/newer/local-ahead states, failed requests and retry, both languages and unpaired settings. They do not establish live GitHub availability.

Installation/update checks exercise clipboard/manual fallbacks, fixed browser and MCP paths across two releases, migration of legacy aliases, refusal to overwrite unrelated folders, activation rollback, and unchanged-version metadata checks without installation. A disposable Chromium profile with Developer mode enabled verified that a fixed-directory extension reload changes its version while preserving its ID and browser storage. These are isolated checks; the user's installed release and host configuration were not upgraded or rewritten as part of this update.

## Agent compatibility evidence

| Integration                | Evidence                                                                                                                                                                                 | Not established by that evidence                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Local stdio MCP            | Actual initialization, tool discovery, list/get/claim/report and duplicate/cancellation/restart scenarios.                                                                               | Every host UI or its trust/configuration flow.                                          |
| Codex app-server           | JSONL subprocess fixtures exercise project sandbox, default/reduced permissions, multiple approvals and completion. A prototype paid-model smoke test historically edited temporary CSS. | A fresh paid-model run in this documentation update or every account/model.             |
| OpenCode 1.x               | HTTP executor fixtures; historical OpenCode 1.18.29 with a local mock model changed temporary CSS after permission.                                                                      | Every provider or model configuration.                                                  |
| OpenCode 2.x               | ACP subprocess fixtures; a historical 2.0.29 handshake created a session without a paid prompt.                                                                                          | Every version's host MCP config schema or live provider access.                         |
| Claude Code                | Official Agent SDK with a fixture executable; a historical 2.1.252 SDK initialization without a paid prompt.                                                                             | Live authentication, model calls or every platform's sandbox dependencies.              |
| Trae CLI                   | ACP fixtures cover permissions, cancellation and completion/failure behavior.                                                                                                            | Real `traecli` account integration; it was not installed for the recorded local checks. |
| macOS client input filling | Fake desktop actions test routing, cancellation, duplicate/uncertain delivery and draft preservation; the fixed AppleScript compiled locally.                                            | Each app's live accessibility tree, permissions and actual input field.                 |

Host installation guides reference official configuration documentation. Their JSON/TOML/shell examples were syntax-checked. This does not mean the installation was executed inside every named agent. In particular, Trae project MCP still requires host enablement/trust, and Chrome loading/pairing/site access require the user's confirmed workflow.

## Historical release evidence

For v0.1.0 on 2026-10-14, local formatting, TypeScript, 15 unit/protocol/installer tests, isolated Chromium and distribution checks passed; GitHub Ubuntu CI and release workflows also passed. Published asset downloads and SHA-256 checks were verified, including the versioned installer and anonymous latest-release download.

Historical macOS service/install checks used isolated state, unique test service labels and temporary ports. Earlier prototype records reported a real Codex model editing only temporary CSS. Those observations are not automatically rerun or inherited by every later release.

## Outside the verified scope

- Chrome Web Store publication; users currently load an unpacked extension.
- Automatic Windows/Linux login-service installation and desktop input filling.
- Precise cross-origin iframe, closed Shadow DOM or canvas element targeting.
- Remote/multi-user bridge access or remote HTTP MCP transport.
- Every host/client version, provider login and paid model behavior.
- Live Trae account execution and end-to-end desktop input delivery across all supported app labels.

Verify service readiness, host connectivity, browser access and an actual edit separately. Never use a clean screenshot, exported configuration or ready bridge as proof that all four succeeded.
