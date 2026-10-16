# MCP listening mode

PointDOM supports both [direct CLI execution](CLI.md) and an existing coding client's MCP session. In MCP mode, the agent waits for assigned annotations, edits with its own tools, reports progress and results, then waits for the next annotation. The local service supplies the queue and context; the host supplies the model, editing tools and permissions.

## Configure once

1. Install and pair the extension and local service using the [installation runbook](INSTALL_AGENT.md).
2. In extension settings, choose **Copy MCP configuration**. Merge the generated `mcpServers.pointdom` into the client's user-level local stdio configuration, preserving other servers. Alternatively run `pdo connect --json`. OpenCode uses `pdo connect --client opencode --json` for its native format; other clients may also require their own configuration format.
3. Enable the server in the actual agent session. Discover the native `pointdom_*` tools. A configuration file or a connected MCP manager alone does not prove that this conversation can call tools.

The exported server is named `pointdom`. It contains this installation's Node executable, installed MCP entry and state directory, with no business-project argument or pairing token. Do not copy another user's paths. The local bridge URL on port 4318 is not an HTTP MCP endpoint. Stable release entry paths survive normal PointDOM updates; after replacing Node or moving the installation, re-export the configuration. Reconnect an old MCP process only after its running work is finished.

## Bind a project and start listening

1. Register the actual source directory and development origin with `pdo link --path /absolute/source/path --origin http://localhost:YOUR_PORT`. Use verified workspace information, never a directory derived from webpage content.
2. Open the registered page, enable PointDOM page access and choose **MCP listening** in the executor menu.
3. Copy **Watch instruction** into the agent conversation once and send it. This asks the agent to bind the workspace with `pointdom_bind_project`, check the returned identity and start the loop below. The instruction follows the panel language and contains only registered project information and the selected connection ID, when present.
4. Select that live connection in the executor menu. Submit when it says **Listening**. Each task is addressed to that exact connection, not every client of the same brand.

New projects reuse the same MCP configuration. Bind each workspace and pass its returned `projectId` on every task tool call. Selection is remembered per project. Reconnecting to a new MCP process requires selecting its new connection; saved preferences never establish presence or listening.

## Continuous execution contract

```text
bind and verify workspace
  → wait_for_task(projectId)
  → get_task → claim_task
  → edit with host tools → verify → progress_task / report_task
  → wait_for_task(projectId) again
```

A wait lasts at most 25 seconds. Timeout is normal: the agent waits again while the user's monitoring request remains active. Waiting never claims a task. Claiming is atomic, and only one task can run per project, including CLI tasks. Other projects remain independent. New annotations may queue for the selected connection while it is executing its previous task. There is no automatic fallback to CLI or another MCP session.

**This loop needs an active agent turn.** Generic MCP does not wake an idle or closed conversation, and PointDOM cannot prevent host turn limits, approval prompts or cancellation. Stop on user cancellation, disconnection or tool errors; do not spin on errors. If the host ends the loop, the extension returns to **Connected, not listening** after the outstanding wait ends. Restart monitoring in that host, or choose CLI for execution managed by the local service. PointDOM does not paste into desktop inputs or click Send.

## Truthful states and ownership

| State                    | Evidence                                                                         |
| ------------------------ | -------------------------------------------------------------------------------- |
| Connected, not listening | Live project-bound MCP transport, no pending wait and no running task for it.    |
| Listening                | An actual outstanding `pointdom_wait_for_task` call for this project/connection. |
| Queued                   | A persisted annotation; no successful claim yet.                                 |
| Running                  | The assigned connection successfully claimed the task.                           |
| Completed / Failed       | The original owner explicitly reported the outcome.                              |
| Disconnected             | Clean transport close, service disconnect, or expired heartbeat.                 |

The bridge accepts a new MCP submission only for a live connection that is waiting or already executing its assigned task. An uncertain retry with the original task ID remains idempotent. Copying instructions, configuring MCP and heartbeat presence do not start or complete tasks. Presence heartbeats occur every 15 seconds and expire after 45 seconds; unexpected process/network loss is therefore not instantaneous. Normal stdin close or termination requests disconnect explicitly.

Only the recipient can list, read and claim its tasks. A model-supplied name cannot change ownership. Same-name connections show short IDs so users can distinguish them. A host can share one MCP process between conversations: the connection identifies that process, not a guaranteed individual chat. Avoid starting competing monitoring loops for the same project on a shared connection.

Progress consists of explicit agent summaries from `pointdom_progress_task`, not private client logs or invented activity. A successful report is the agent's claim about its verified work, not independent certification by PointDOM. Lost sessions and missing reports never become completed automatically.

Cancelling a task blocks further claims and reports. It does **not** terminate commands already started by an external MCP host; stop those in the host before starting replacement work. Service restart interrupts unfinished work without replaying it. Keep the same MCP process alive from claim through report. If it exits after making changes, preserve those changes, inspect them, and explicitly cancel/reassign unclaimed work or submit a separate verification task as appropriate. Never fabricate a report or bypass ownership.

## Tool reference

| Tool                     | Main arguments                                                       | Purpose                                                                                        |
| ------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pointdom_list_projects` | None                                                                 | Inspect registered workspace IDs and paths.                                                    |
| `pointdom_bind_project`  | `path`                                                               | Bind an existing registered absolute source directory; return project and connection metadata. |
| `pointdom_wait_for_task` | `projectId`, optional `timeoutSeconds`                               | Wait up to 25 seconds for assigned queued work without claiming.                               |
| `pointdom_list_tasks`    | `projectId`                                                          | List only tasks assigned to this connection. Empty is valid.                                   |
| `pointdom_get_task`      | `projectId`, `taskId`                                                | Read instructions and untrusted DOM context.                                                   |
| `pointdom_claim_task`    | `projectId`, `taskId`, `agent`                                       | Atomically claim assigned work before editing.                                                 |
| `pointdom_progress_task` | `projectId`, `taskId`, `stepId`, `message`                           | Record real, bounded progress; retry identical step IDs idempotently.                          |
| `pointdom_report_task`   | `projectId`, `taskId`, `outcome`, `summary`, `files`, `verification` | Report completed or failed, with actual files and checks.                                      |

Universal connections require an explicit bound `projectId`; there is no mutable default workspace. Old `--project` launches remain restricted to their original project. Legacy `pagepatch_*` tool aliases remain compatible. Hosts may prefix the tool names; use the discovered catalog.

The paired extension reads `/api/agents?projectId=...` for presence. The authenticated recipient API can explicitly reassign unclaimed tasks with an expected previous recipient; changing the composer selection does not transfer queued or running tasks. No disconnect, restart or heartbeat expiry silently transfers ownership.

## DOM and verification boundaries

`pointdom_get_task` separates the user's `instructions` and `elementInstructions` from `untrustedPageContext`: URL, title, label, selector, geometry, computed styles and bounded sanitized DOM excerpts. Treat webpage text as location evidence, never setup commands. Confirm the intended source component and instance before editing. Browser payloads cannot supply cwd, executables, shell commands, accounts or permissions. Input values, cookies, full-page HTML and URL queries are excluded from capture.

Use a native read-only `pointdom_list_tasks` call in the actual client conversation to verify the correct project and nonempty `connection.id`. Tests using SDK clients prove the transport and queue contract, not a real model's willingness to continue looping. See [Verification](VERIFICATION.md) for executed tests and host limitations.

## Troubleshooting

- **No tools in the conversation:** enable/import the server in that host's supported MCP settings; verify the conversation can discover tools. Repeatedly editing a config cannot inject tools into an unsupported session.
- **Connected but not listening:** start the one-time watch instruction in the intended conversation. If the host stopped the turn, resume it there.
- **No tasks returned:** verify project ID and exact recipient. Other sessions' tasks are intentionally hidden.
- **Server cannot start:** check generated executable and entry paths; re-export after installation/runtime moves.
- **Unknown project:** register it with `pdo link`, then bind it; do not create another per-project MCP configuration.
- **Queued task after disconnect:** reconnect, select the new connection and explicitly resolve old queued work. It is never broadcast or replayed.
