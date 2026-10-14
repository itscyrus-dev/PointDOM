# Verification History

These records describe observed checks, not guarantees for every environment.

## First Release: v0.1.0

On 2026-10-14, local verification used Node.js 24.13.0 and pnpm 10.34.7. Formatting, strict TypeScript, 15 unit/protocol/installer tests, isolated Chromium E2E and distribution checks passed. GitHub's Ubuntu CI and release workflow also passed.

Coverage includes pairing/origin/Host checks, local-only project registration, serialized and duplicate task handling, permission responses, cancellation, persistence, restart interruption, MCP task claims/reports, OpenCode task execution and installer checksum/download failures.

The real OpenCode CLI 1.18.29 was exercised with a local mock model in a dedicated temporary project: it requested edit permission, changed a CSS height from 32px to 40px and returned a result. No paid model was called. macOS login-service and pipe-to-shell installation were checked with isolated state, unique test service labels and temporary ports, including online multi-project binding and removal.

Published assets were downloaded and their SHA-256 hashes verified. The standalone CLI reported `pdo 0.1.0`, and the published installer pointed to its own versioned assets. Anonymous download through the latest installer URL was also verified.

## Initial Prototype

The earlier prototype record reported four tests for HTTP pairing/origin/directory constraints, queue serialization/idempotency/permissions/cancellation/persistence, restart recovery and real stdio JSONL transport. Its Playwright test loaded the built extension in an isolated profile, selected a real element without clicking the page button, submitted to the bridge and displayed results using a mock Codex runner.

That record also reported a real Codex App Server editing temporary CSS from 32px to 40px and reading it back. This paid-model check was not rerun during first-release packaging. No business project was edited.

Historical screenshots under this directory came from extension-page test fixtures. They are not proof of a current native side-panel session; users still perform the initial Chrome extension load and site authorization themselves. New screenshots are written to isolated test output.

## Not Verified

Chrome Web Store publication, Windows/Linux login-service installation, precise cross-origin iframe/closed Shadow DOM selection, remote multi-user access and desktop chat synchronization are not covered. Ubuntu browser/protocol tests do not establish full platform installation support.
