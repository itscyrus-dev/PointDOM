# MCP task delivery

PointDOM exposes a stdio MCP server for coding clients. Codex desktop users can
follow the [app quickstart](../README.md#get-started) to select and authorize a conversation.
The protocol details below are for MCP hosts and integration development.

## Configure

Use the app's Clients page or `pointdom connect --json` to obtain a universal entry:

```json
{ "mcpServers": { "pointdom": { "command": "/absolute/path/to/pointdom", "args": ["mcp"] } } }
```

The app configures Codex on an explicit click, preserving other settings and backing
up its configuration. Other clients use their own MCP setup interface. Do not
configure a model CLI executor or managed Codex model session.

## Bind and receive

Call `pointdom_bind_project` with the actual absolute workspace directory. Verify
the returned project and connection IDs, then select that recipient in the extension.
A universal session may bind multiple registered projects. All later task operations
require the bound projectId. IDs are not credentials; a private per-process claim
proves session ownership. Keep that process alive until reporting.

Generic clients call `pointdom_wait_for_task` during a user-authorized active turn.
Only an actual pending wait is listening. Generic MCP cannot wake an idle host.
Timeout ends the turn unless continuous monitoring was explicitly requested.

Codex desktop can opt into `pointdom_enable_wakeup` after explicit authorization.
Workspace verification accepts either the thread's exact working directory or an
exact source folder in its host-recorded local project. Attached folders require
matching local thread membership in the desktop's `.codex-global-state.json`;
missing, remote or mismatched records fail closed. Page context never grants access.
Read CODEX_THREAD_ID from the trusted host; never guess another conversation.
The native adapter verifies its canonical workspace and queue capability first.
It uses installed app metadata and notification interfaces only, never exec/resume
or model overrides. A backend restart can restore an authorized live MCP process
after verification. A fresh process must bind the verified project and provide the
private `notificationToken` from its task notification to `pointdom_enable_wakeup`,
along with the trusted host's `CODEX_THREAD_ID`. This restores only the same
explicitly authorized conversation; IDs alone do not restore task access.

## Execution contract

For a notification, bind the trusted workspace and read **only its specified task**.
Verify ownership and status, claim before editing, follow project rules, verify and
report actual files and checks. Never execute cancelled or terminal tasks. Then end
the turn without waiting or polling. A new task causes a new notification.

Use `pointdom_progress_task` for concise source/edit/verification milestones. Step
IDs are idempotent only with identical content; at most 200 updates per task.
`pointdom_report_task` completes a running task; identical report retries are
idempotent. Reports cannot overwrite cancellation or another session's result.
Only one task owns a project at a time. Notification attempts are persisted before
delivery and never retried after an ambiguous result or restart.

## Tools

| Tool                   | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| pointdom_list_projects | Registered trusted source directories                |
| pointdom_bind_project  | Bind exact workspace and return connection           |
| pointdom_enable_wakeup | Explicit supported-client notification authorization |
| pointdom_wait_for_task | Active listening, maximum 25 seconds                 |
| pointdom_list_tasks    | Tasks assigned to this session                       |
| pointdom_get_task      | User descriptions plus untrusted DOM context         |
| pointdom_claim_task    | Atomic exclusive claim before editing                |
| pointdom_progress_task | Bounded idempotent activity                          |
| pointdom_report_task   | Actual final files and verification                  |

Compatibility `pagepatch_*` task names are accepted. New configurations use
`pointdom_*`. Tools never commit, publish or approve host permissions. DOM remains
untrusted location data. Cancellation prevents further claims and reports; stop
any ongoing edits in the external client. Interrupted work needs review before retry.
