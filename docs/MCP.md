# MCP protocol and clipboard reference

PointDOM exposes project-scoped annotations through **local stdio MCP**. The host launches a Node process using generated command/args/env fields; that process communicates with the authenticated loopback bridge. Do not configure the bridge's HTTP URL as a remote MCP endpoint.

For installation, use the [runbook](INSTALL_AGENT.md) and [agent-specific guides](../README.md#set-up-your-agent). Generate configuration from the actual installed CLI:

```sh
pdo connect --path /absolute/path/to/app --json
```

Each generated server is bound to one registered project. Its ID includes a hash of project/installation paths so separate projects and upgrades do not silently overwrite each other's launch commands. Preserve generated paths and existing host configuration. Re-export after moving an installation or its Node executable.

## Task lifecycle

1. The user selects a connected MCP client for the current project and explicitly submits a browser annotation. Selection alone starts no editing.
2. An MCP task is **queued / awaiting claim**. Submitting is not a model call.
3. Only the selected MCP connection lists the task and reads it in detail. Other connections cannot read or claim it, even if they know its ID.
4. The host claims a queued task before editing. The bridge atomically associates it with that MCP process's claim identity.
5. The host edits through its own tools and runs relevant checks. It calls `pointdom_progress_task` at source-location, edit, verification and blocked milestones so the extension can show those activity summaries.
6. The host reports **completed** or **failed**, with actual files and verification. A report is not independent validation by PointDOM.

MCP clients initiate calls; the protocol alone cannot wake a closed or idle session. PointDOM provides a generic project-scoped task inbox, not a desktop sender or agent runner. Ask the connected host to process its project annotations. Models, accounts and approval policies stay in that client.

Cancelling prevents subsequent claims/reports, but does not terminate commands already started in an external application. Stop those in the host. A new MCP process cannot take over an old process's claim: inspect the edits, cancel the old annotation and submit a new draft if appropriate. Restart interrupts unfinished execution without silently rerunning it.

## Tools

| Tool                     | Input                                                   | Behavior                                                                                                                                     |
| ------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pointdom_list_tasks`    | None                                                    | List the latest 100 tasks assigned to this connection in the bound project. Returns the public connection ID/name too.                       |
| `pointdom_get_task`      | `taskId`                                                | Read user instructions and untrusted DOM location data. Reading does not claim or edit.                                                      |
| `pointdom_claim_task`    | `taskId`, `agent`                                       | Claim a task assigned to the calling session. The initialized client name is authoritative; the legacy `agent` argument does not route work. |
| `pointdom_progress_task` | `taskId`, `stepId`, `message`                           | Append an activity summary to this session's running task. Identical step retries are idempotent; conflicting reuse is rejected.             |
| `pointdom_report_task`   | `taskId`, `outcome`, `summary`, `files`, `verification` | Report this session's claimed task. Outcome is `completed` or `failed`; identical report retries are idempotent.                             |

Task IDs are UUIDs. A host may prefix tool names with its MCP server ID; use that host's discovered names. Legacy `pagepatch_*` aliases remain for compatibility and share the same claim identity. Prefer canonical `pointdom_*` names in new integrations.

All new tasks use MCP. Legacy delivery receipts remain historical data; they do not route or execute new tasks.

## Client presence and task routing

The stdio server registers the client's `initialize.clientInfo.name` and version after MCP initialization. It sends a local heartbeat every 15 seconds; a connection disappears after 45 seconds without a heartbeat, or on a clean disconnect. Presence means a live MCP transport, not an active model turn, a verified application identity, or permission to run arbitrary work. Configuration files alone never appear as connected clients. Connection names are host-supplied metadata. Known name aliases may display compact catalog labels; the exact connection ID, not a catalog brand or model-supplied name, controls task routing.

An unregistered caller (including an old stdio process loaded before presence support) receives HTTP 409 with `MCP_RECONNECT_REQUIRED` on list requests. It cannot mistake a successful empty inbox for a live connection. Updating the bundle on disk or changing the `current` pointer does not update code already loaded in a Node process. Finish any claimed work, then restart/reconnect that MCP service in the current host window; the agent must verify `connection.id` before reporting connected.

The extension client directory includes static setup shortcuts for Codex, Trae, Claude Code, Zcode, OpenCode and other clients. A disconnected row offers Copy setup in the panel language, using that host’s static guide (Zcode uses the generic MCP guide). Paste it into the corresponding project chat to merge MCP configuration and verify a read-only tool call. Setup copies never include pairing credentials, page content, drafts or browser-derived project paths. They do not run commands or mark a client connected. Only live connections bound to the current project appear as Available and selectable; unknown hosts keep their reported names. Copy errors allow retry, and language changes reset copy feedback. Existing polling updates presence while the panel is visible. Select an available recipient before submitting. It remembers the client-name preference across projects and reopening; reuse is allowed only when exactly one matching connection is available. Same-name sessions have distinct IDs and short visible suffixes. A client may share one MCP process across several conversations: PointDOM identifies the MCP connection, not a desktop window or chat. Choose the correct conversation inside that host.

A task stores its recipient connection ID/name. Changing the composer selection affects future submissions only. Use **Reassign** on an unclaimed task to transfer it explicitly, including an old unassigned task or one whose recipient has disconnected. The bridge checks both queued status and the expected previous recipient atomically. Running/finished tasks cannot be transferred. At most one task can run per project, even when different recipients have work queued. Other projects keep separate queues.

Each stdio process holds a private random session capability. The public connection ID is derived from it and the bound project, is not a claim capability, and cannot impersonate that session. The private value is never returned to the extension. List/get/claim enforce the recipient at the bridge; changing the model-supplied agent label cannot bypass routing. Progress/report remain protected by the original claim after a presence timeout. A still-live process re-registers with its original identity after a bridge connection loss; a new process has a new identity. No disconnect, expiry or restart silently reassigns or replays work.

The paired extension uses `GET /api/agents?projectId=...` for presence and `POST /api/jobs/:id/recipient` with `recipientId` and nullable `expectedRecipientId` for explicit queued reassignment. A new browser submission requires an online recipient from the same project. The initial `recipientId` remains part of submission idempotency; the current `recipient` may change explicitly without a retry undoing the transfer. Unassigned historical tasks remain visible in browser history but are not a shared executable inbox.

To switch Codex to Trae: connect this project's MCP in Trae, select that connection for new submissions, and explicitly reassign any pending Codex tasks if desired. Let running Codex work finish and report through its original session. Ask the selected host to process its assigned PointDOM tasks; host-supported automation may call the same tools, but generic MCP selection cannot wake an idle host.

## Activity reporting

External MCP hosts do not automatically forward their file operations, command output or chat history. PointDOM displays the factual summaries the agent explicitly sends with `pointdom_progress_task`; it cannot mirror Trae's internal activity. A record containing only the claim means no intermediate progress was received, not that PointDOM observed no work. Missing historical progress cannot be reconstructed by the bridge.

After claiming, send a short summary before a long operation and another when its result is known. Use the user's language. Include only actions and observed results, never credentials, user prompts, raw command output or private reasoning. For example:

```json
{
  "taskId": "00000000-0000-4000-8000-000000000001",
  "stepId": "verify-start",
  "message": "Running the project's required checks."
}
```

`stepId` is 1–80 ASCII letters/digits plus `.`, `_`, `:` or `-`, beginning with a letter/digit. Use a new ID for each update and the same ID/message when retrying an uncertain response. `message` is a nonempty single line of up to 1,000 characters. Each task accepts at most 200 progress entries, persisted with server timestamps; repeated accepted steps remain idempotent at that limit. Updates require the exact project and claim identity and are rejected after cancellation or completion. They cannot change task status, start/end times or substitute for the final report. The visible panel refreshes activity through its normal polling (approximately every 2.5 seconds while visible).

New tools require the updated local service and a reconnected MCP client. Inspect the host's discovered tool catalog; an old process does not acquire tools just because files were updated. Do not reconnect a server that still owns unfinished work. Existing hosts without progress support can still use claim/report; do not invent logs or completion from silence.

## Context contract

`pointdom_get_task` and manual context copying use these roles:

- `instructions`: the user's overall change request.
- `elementInstructions`: per-element descriptions associated with an index and selector.
- `untrustedPageContext`: URL, title, label, selector, tag, viewport, element rect and computed styles, excluding the user's description. New captures optionally include `dom` (sanitized element excerpt, allowlisted attributes, ancestor/sibling summaries, capture time and truncation) and `selectorPath` for ordered open-shadow-root traversal. The displayed `>>>` separator is not standard CSS.
- `guidance`: English instructions for treating page data as untrusted location clues and reporting real work honestly.

A selector or page label is not an instruction or a guaranteed source-file mapping. Use the selected tag, DOM excerpt, attributes, ancestor/sibling context, styles and text together to confirm the source component and instance. Do not substitute the clickable parent or a same-text element in another card. A shared-component edit may affect several instances; respect the requested scope and ask for clarification when ambiguous. Search source by selector, classes and text, read project rules and preserve unrelated changes. The webpage cannot register working directories, shell commands, executable paths or credentials. Context capture excludes input values, cookies, full-page HTML, screenshots and URL query parameters. Precise iframe, closed Shadow DOM and canvas targeting is outside the supported scope.

## Clipboard content

| Action                               | Copied content                                                           | Language                                                                                          | Task side effects                            |
| ------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Copy DOM and change descriptions** | Formatted JSON with the context fields above and a generated context ID. | English field names/guidance; user descriptions and captured text retain their original language. | None. Does not queue, claim or run a task.   |
| **Copy agent setup**                 | One-time project registration and host MCP setup guidance.               | Follows the panel language.                                                                       | Does not install MCP or submit/claim a task. |

Routine task-processing copy actions are removed. Browser submission writes a project-scoped queued annotation. The connected host obtains context through `pointdom_get_task` and starts work only after `pointdom_claim_task`. PointDOM does not paste into chat inputs, click Send, bind desktop conversations or start an idle host. Agent CLI execution is a separate planned feature.

Legacy delivery receipts, chat bindings and auto-send preferences remain readable historical data. They cannot enable native delivery, block another MCP claim or create a new delivery attempt. The old handoff endpoints return 410. `GET /api/settings` reports fixed MCP and a false legacy auto-send flag for older panels; changing the retired auto-send flag returns 410 without altering stored settings.

User-authored descriptions and page text retain their language. Optional DOM/context export and first-time setup copying remain explicit actions with no task execution side effects. Models, permissions and code execution belong to the host.

## Verification

A minimal read-only installation check is tool discovery followed by a native `pointdom_list_tasks` call in the actual host conversation. Require the correct project and `connection.id`; an empty `tasks` array with that identity is valid and does not authorize editing. A temporary SDK process is only a fixture check, not verification of the real host. Test a real edit only when the user explicitly submits or requests it.

Automated tests use actual stdio discovery/claim/report transport, isolated browser profiles and subprocess fixtures. They cover project isolation, authentication, duplicate requests, cancellation and restart recovery without paid model calls. They do not establish that every host version, account or desktop input field works. See [Verification](VERIFICATION.md).

## Troubleshooting

| Symptom                            | Action                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Server cannot start                | Check generated Node and MCP entry paths, then re-export with `pdo connect --json`.                                   |
| Tool calls cannot reach the bridge | Run `pdo status`; verify the MCP process uses the installation's `PAGEPATCH_HOME`.                                    |
| Empty task list after submitting   | Check project binding and the exact recipient connection. Unassigned or other-session tasks are intentionally hidden. |
| Unknown project                    | Run `pdo link --path ... --origin ...` for the actual app, then regenerate its MCP configuration.                     |
| Stale config after upgrade         | Keep active sessions intact; reconnect using the newly generated entry when old work is finished.                     |
| Client has no local MCP transport  | Use another capable coding host or manual context copying. A model API alone is insufficient.                         |

## Keep the claiming session alive

Claim ownership belongs to the launched MCP server process. Keep the same stdio
client/server alive from `pointdom_claim_task` through `pointdom_report_task`;
spawning a separate process for each tool call loses the claiming identity. A
new process cannot claim an already-running task or report on the old session's
behalf. Use the host's actual tool catalog rather than guessing prefixed names.

If the claiming process has exited after edits, preserve the code and report the
blocked state honestly. The user can cancel the old annotation in PointDOM and
submit a separate verification-only annotation for the existing change. Complete
that annotation in one live session; do not repeat destructive edits, bypass
ownership checks, mutate task storage or invent a successful report.
