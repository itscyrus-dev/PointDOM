# Other local MCP clients

Any client that runs local stdio MCP servers and can edit the workspace can use PointDOM. A model API or ordinary chat page alone does not supply these capabilities. No particular Agent CLI is required.

```sh
pdo connect --json
```

Merge the generated `mcpServers.pointdom` entry once into the host's user-level MCP configuration. Map `command`, ordered `args` and `env` to its supported local stdio fields. Preserve unrelated settings. If the host has a different format, follow its official documentation; OpenCode uses `pdo connect --client opencode --json` instead.

Use the generated local installation paths, without a business-project path. The loopback bridge on port 4318 is not an HTTP MCP endpoint. Do not copy pairing codes into host configuration. If the host only supports project-scoped configuration, explain that host limitation rather than claiming global installation.

First follow the [installation runbook](../INSTALL_AGENT.md).

## Bind each workspace

Register a new source directory and its actual development URL once:

```sh
pdo link --path /absolute/path/to/app --origin http://localhost:YOUR_PORT
```

In the actual host conversation, call `pointdom_bind_project` with `path` set to that absolute source directory. Use the returned `project.id` as `projectId` on every list/get/claim/progress/report/wait call. Verify `pointdom_list_tasks` returns the intended project and a nonempty `connection.id`. An empty task list is valid; a saved config or temporary SDK subprocess is not proof that the host conversation is connected.

New projects reuse the same MCP configuration. A universal connection has no mutable default project: omitting `projectId` is an error, even after binding just one project. This prevents concurrent workspace calls from changing each other's scope. The local service still isolates history, recipients and claims by project.

## Choose a recipient and process work

In the browser, open the registered development page, enable page access and select the connected client. Choose MCP listening in the executor menu. Multiple connections with the same client name show short IDs; use the connection ID returned by the native tool call to choose the intended one. A connection identifies a stdio process, not necessarily one chat window. PointDOM never silently merges session ownership or broadcasts a task to every matching client.

Use Copy watch instruction in the panel and send it to the agent once. It may repeat `pointdom_wait_for_task`, then read, claim, edit, verify, report and wait again while its host turn remains active. Pass the same `projectId` throughout. MCP alone cannot wake an idle or closed host, and host limits can end watching. Only an outstanding wait is shown as Listening. Models and permissions stay in the host.

## Migrate old configuration

Finish claimed work before reconnecting. Replace obsolete `pointdom-<project>-<suffix>` entries with the single generated `pointdom` entry after confirming those old entries are unused. Inspect both user and project settings for duplicates; preserve unrelated servers and all task history. Do not delete or kill sessions with active work. Old `--project` launches remain supported and restricted to their original project, but new exports omit that argument. Reconnect, bind the workspace and verify natively again; reassign queued tasks explicitly if their old recipient disappeared.
