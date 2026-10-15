# MCP protocol and clipboard reference

PointDOM exposes project-scoped annotations through **local stdio MCP**. The host launches a Node process using generated command/args/env fields; that process communicates with the authenticated loopback bridge. Do not configure the bridge's HTTP URL as a remote MCP endpoint.

For installation, use the [runbook](INSTALL_AGENT.md) and [agent-specific guides](../README.md#set-up-your-agent). Generate configuration from the actual installed CLI:

```sh
pdo connect --path /absolute/path/to/app --json
```

Each generated server is bound to one registered project. Its ID includes a hash of project/installation paths so separate projects and upgrades do not silently overwrite each other's launch commands. Preserve generated paths and existing host configuration. Re-export after moving an installation or its Node executable.

## Task lifecycle

1. The user explicitly submits a browser annotation. Selection alone starts no editing.
2. An MCP task is **queued / awaiting claim**. Submitting is not a model call.
3. The host lists tasks and reads one in detail.
4. The host claims a queued task before editing. The bridge atomically associates it with that MCP process's claim identity.
5. The host edits through its own tools and runs relevant checks.
6. The host reports **completed** or **failed**, with actual files and verification. A report is not independent validation by PointDOM.

MCP clients initiate calls; a server cannot automatically wake a closed or idle session. Continuous handling requires a host loop/automation. Named-client delivery can copy/attempt to fill an instruction, but never presses Send. These are separate capabilities.

Cancelling prevents subsequent claims/reports, but does not terminate commands already started in an external application. Stop those in the host. A new MCP process cannot take over an old process's claim: inspect the edits, cancel the old annotation and submit a new draft if appropriate. Restart interrupts unfinished execution without silently rerunning it.

## Tools

| Tool                   | Input                                                   | Behavior                                                                                                         |
| ---------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pointdom_list_tasks`  | None                                                    | List the bound project's latest 100 MCP tasks. Only queued tasks can be claimed.                                 |
| `pointdom_get_task`    | `taskId`                                                | Read user instructions and untrusted DOM location data. Reading does not claim or edit.                          |
| `pointdom_claim_task`  | `taskId`, `agent`                                       | Claim a queued task for the calling session. Duplicate identical claims are idempotent.                          |
| `pointdom_report_task` | `taskId`, `outcome`, `summary`, `files`, `verification` | Report this session's claimed task. Outcome is `completed` or `failed`; identical report retries are idempotent. |

Task IDs are UUIDs. A host may prefix tool names with its MCP server ID; use that host's discovered names. Legacy `pagepatch_*` aliases remain for compatibility and share the same claim identity. Prefer canonical `pointdom_*` names in new integrations.

Direct CLI tasks do not appear in the MCP inbox. A missing-CLI fallback is an MCP task with a separate delivery state; copied/pasted does not mean claimed, running or completed.

## Context contract

`pointdom_get_task` and manual context copying use these roles:

- `instructions`: the user's overall change request.
- `elementInstructions`: per-element descriptions associated with an index and selector.
- `untrustedPageContext`: URL, title, label, selector, tag, viewport, element rect and computed styles, excluding the user's description. New captures optionally include `dom` (sanitized element excerpt, allowlisted attributes, ancestor/sibling summaries, capture time and truncation) and `selectorPath` for ordered open-shadow-root traversal. The displayed `>>>` separator is not standard CSS.
- `guidance`: English instructions for treating page data as untrusted location clues and reporting real work honestly.

A selector or page label is not an instruction or a guaranteed source-file mapping. Use the selected tag, DOM excerpt, attributes, ancestor/sibling context, styles and text together to confirm the source component and instance. Do not substitute the clickable parent or a same-text element in another card. A shared-component edit may affect several instances; respect the requested scope and ask for clarification when ambiguous. Search source by selector, classes and text, read project rules and preserve unrelated changes. The webpage cannot register working directories, shell commands, executable paths or credentials. Context capture excludes input values, cookies, full-page HTML, screenshots and URL query parameters. Precise iframe, closed Shadow DOM and canvas targeting is outside the supported scope.

## Clipboard content

| Action                               | Copied content                                                                  | Language                                                                                          | Task side effects                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Copy DOM and change descriptions** | Formatted JSON with the context fields above and a generated context ID.        | English field names/guidance; user descriptions and captured text retain their original language. | None. Does not queue, claim or run a task.                                              |
| **Copy agent instruction**           | A short instruction to list/read/claim pending project annotations through MCP. | English, independent of the panel language.                                                       | None. The host must act on it.                                                          |
| Automatic named-client handoff       | A processing instruction containing the submitted task ID.                      | English.                                                                                          | The task is already queued; filling a client input does not start execution until sent. |

Copying is initiated by an explicit UI action, or by the delivery of an explicitly submitted task. The generated payload does not include pairing credentials, cookies or provider API keys. Page text and user-authored descriptions are not automatically translated.

## Verification

A minimal read-only installation check is tool discovery followed by `pointdom_list_tasks`. An empty list is valid and does not authorize editing. Test a real edit only when the user explicitly submits or requests it.

Automated tests use actual stdio discovery/claim/report transport, isolated browser profiles and subprocess fixtures. They cover project isolation, authentication, duplicate requests, cancellation and restart recovery without paid model calls. They do not establish that every host version, account or desktop input field works. See [Verification](VERIFICATION.md).

## Troubleshooting

| Symptom                            | Action                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Server cannot start                | Check generated Node and MCP entry paths, then re-export with `pdo connect --json`.                               |
| Tool calls cannot reach the bridge | Run `pdo status`; verify the MCP process uses the installation's `PAGEPATCH_HOME`.                                |
| Empty task list after submitting   | Check Agent (MCP), project binding and whether another session already claimed it. Direct CLI tasks are separate. |
| Unknown project                    | Run `pdo link --path ... --origin ...` for the actual app, then regenerate its MCP configuration.                 |
| Stale config after upgrade         | Keep active sessions intact; reconnect using the newly generated entry when old work is finished.                 |
| Client has no local MCP transport  | Use another capable coding host or manual context copying. A model API alone is insufficient.                     |
