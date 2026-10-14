# PointDOM Design Guidelines

## Goal

Users select elements, describe changes, submit tasks and inspect results in a compact browser side panel. Do not turn the panel into a marketing page or a collection of large cards. Business websites keep their own design systems.

## Visuals

Use the hierarchy and rounded shapes of a compact dark interface without copying Oii branding, icons or assets. Colors: background `#101112`, cards `#191b1e`, inputs `#1d1f22`, primary text `#f1f2f3`, secondary text `#9ca2aa`, primary action `#a8ff00` with dark text, pale red for failures and soft yellow for confirmation states.

- Minimum panel width: 280px; typical width: 360–420px. Outer spacing: 16px; within groups: 8–10px; between groups: 20px.
- Base text: 13px; labels and task text: 12px; supporting text: 11px. Avoid excessive explanatory copy.
- Buttons are at least 34px high with 10px corners; cards have 12px corners. Body line height is 1.6–1.7.
- Inputs have no bright white border. Keep a green keyboard `focus-visible` indicator. Disable unavailable actions instead of implying they can run.
- Distinguish selected elements, user instructions and task status. Collapse selectors and styles; prioritize the requested change.
- Transitions are about 150ms and respect `prefers-reduced-motion`. Never invent progress percentages while waiting.

## Interaction

Selection mode uses a green outline and intercepts the website's original click behavior. Esc exits. Selection and drafts are stored per tab. Disable submission when the page has no registered project and explain how to link it.

Only an explicit submission starts a task. Selecting an element must not trigger code edits. Queued, running, waiting, completed, failed, cancelled and interrupted states must reflect the actual service state. An offline service must not appear to be an active model run.

Preserve results when the panel closes. Stopping a task does not promise rollback. Permission requests show their reason and command in the same panel, with equally accessible accept/decline actions and no automatic acceptance.

## Entry Point and Native Side Panel

After pairing, the user explicitly authorizes the current site. Do not show a floating page button or inject an editing panel, iframe or second overlay. Keep credentials in the extension context and inject only on authorized sites.

Use Chrome's native side panel. Its fixed composer contains compact selected-element cards, description inputs, selection controls, execution settings and send. Below it, History / Active tabs filter records; only the records area scrolls. Connection and project configuration use a separate settings view.

Execution settings open from the composer footer, use two compact columns, persist choices and snapshot them into each task. Model options come from the executor's catalog. Clicking outside or pressing Esc closes settings. Chrome's own close button closes the panel.

## Shortcuts and Submission

Display shortcuts actually registered by Chrome; show Not set for unavailable or conflicting shortcuts. Open Chrome's native shortcut manager from settings and refresh values on return. Defaults: Alt+Shift+A for element selection and Alt+Shift+P for the side panel; Alt is Option on macOS. Reuse Chrome's native action for panel visibility instead of maintaining a fragile visibility flag or intercepting page typing.

The selection shortcut toggles selection mode. Esc also exits. Clicking an element keeps selection active so users can select more. Remove outlines and intercepted events on exit; clear stale outlines on re-entry.

Use the primary send color for nonempty text. Disable send for empty input or while submitting. Enter sends, Shift+Enter inserts a newline; input-method composition and held keys must not send. A linked page may submit text without selected elements. Explain missing connections or projects.

Allow up to 10 elements on one page, deduplicated by selector. Each item has an independent description and removal action. Do not steal page focus while selecting. Submit every element's styles and position; Continue editing restores the selections and descriptions. Overall instructions are optional when at least one element has a description. Reselecting an element preserves its description. Keep user descriptions separate from untrusted page context and matched to the appropriate selector.

Esc exits selection from both page and side panel while preserving the draft. Successful submission exits selection and clears that tab's selections/draft; a failure preserves them for retry.

Long names, selectors, URLs and instructions wrap inside the panel. Set `min-width: 0` on grid/flex children. Nonterminal tasks give the Active tab a 1px green orbiting border with a 2.4s period; use a static border for reduced motion and remove it when no tasks remain.

## Local Commits

Completed tasks offer a manual Commit action. Automatic commit after completion is off by default, is saved with execution preferences, and is captured in each task. Generate a `fix:` message from the request with the task ID; show the short commit hash after success.

Commit only files that were clean at task start, changed during the task, and have not changed again afterward. Preserve unrelated staged changes. Explain refusal for pre-existing edits, changed HEAD, no changes, non-Git directories or older tasks without a tracked scope. Failures can be retried. Never push automatically.

## External Agents Through MCP

The Other Agent (MCP) mode hides Codex model, speed, reasoning, approval and auto-commit controls; the host application owns those settings. Statuses distinguish Awaiting claim, Agent running and Agent reported. A client's report is not independent verification.

Settings allow copying plain DOM context and descriptions. External tasks do not run Codex or auto-commit. Cancelling an annotation prevents further claims/reports but must explain that users still need to stop edits already running in the external application.

## OpenCode CLI and Background Startup

First installation registers a macOS user login service while preserving loopback, Host, pairing and extension-origin checks. Users link development origins from each project's local CLI; new bindings work while the service is online. Do not change a business project's development command. The extension submits registered project IDs, never filesystem registrations. When one origin matches several projects, require an explicit choice instead of reusing an automatically selected project.

OpenCode CLI mode runs queued tasks directly without MCP claims or an open TUI. Each task owns a fresh session in the registered project directory. Models come from local OpenCode configuration or a locally specified `provider/model`; hide Codex-only controls.

Request command/edit permissions and show confirmations/questions in the same panel. Approve only a single explicit request, never permanent approval. Deny external-directory access. Cancelling terminates the task's owned CLI process without rolling back writes. Do not rerun unfinished tasks after a restart. Reconnect automatically when the service returns and refresh project bindings dynamically. Codex and manual MCP modes remain available.
