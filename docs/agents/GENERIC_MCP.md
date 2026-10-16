# Other local MCP clients

This is the universal integration path, not a fallback limited to a fixed agent list. No OpenCode, Codex, Claude Code or Trae CLI is required for MCP itself.

First follow the shared [installation runbook](../INSTALL_AGENT.md). A supported host must run local stdio MCP servers and have file-editing tools for the linked application. A model API or an ordinary chat website alone does not provide these capabilities.

## Configure the host

```sh
pdo connect --path /absolute/path/to/app --json
```

Import the generated `mcpServers` object into the host's existing configuration. If the host uses a form, choose **local / stdio** and map:

| Export field                   | Host setting                                                         |
| ------------------------------ | -------------------------------------------------------------------- |
| The generated `mcpServers` key | A unique server name.                                                |
| `command`                      | The executable path, entered separately from its arguments.          |
| `args`                         | The ordered argument list; keep paths with spaces as single entries. |
| `env`                          | Environment-variable names and string values.                        |

Keep the generated absolute paths and project binding. Never paste the pairing code into host configuration. `http://127.0.0.1:4318` is the authenticated bridge, not a remote HTTP MCP server to add to a client.

Preserve existing servers, reconnect/enable the new one, and verify the five `pointdom_*` tools appear. Ask the host to call `pointdom_list_tasks`; an empty result is valid.

## Process annotations

All PointDOM annotations use MCP. The host reads the selected DOM context, claims a queued task before editing, uses its own tools and configuration, reports progress and returns actual files and verification. PointDOM does not choose a model, start an agent CLI, approve commands or commit files.

Browser submission saves a queued annotation; ask the connected host to process the project's PointDOM tasks. MCP does not start an idle session, and PointDOM has no desktop-send adapter or routine processing-copy fallback. Agent CLI execution is planned separately. Cancelling an annotation prevents future claims/progress/reports but cannot stop already-running host commands; stop them in that client.

If a host cannot use MCP, **Copy DOM and change descriptions** provides a JSON text context. That manual copy does not create, claim or complete a task in PointDOM.

Read the [MCP reference](../MCP.md) for tool names, state transitions and language behavior.

## Select this connection in PointDOM

After the host initializes this project's MCP, its reported client name appears in the extension's recipient picker. Select that connection before submitting; only it can list/read/claim its assigned tasks. Distinguish duplicate names by their short session IDs. An empty list is valid when no tasks are assigned. Changing the picker affects future submissions; use Reassign on queued cards to transfer pending work explicitly. Running tasks must finish/report in their original session. A connected entry does not start an idle agent turn or identify a desktop chat. See [routing details](../MCP.md#client-presence-and-task-routing).

After an update, a running stdio process may still contain old code. Finish any claimed work, then restart/reconnect this project's PointDOM MCP in the current host. Verify with a native pointdom_list_tasks call in this conversation: it must return the correct project and connection.id. tasks: [] alone, a saved config, or a temporary SDK subprocess cannot prove this host is connected. If reconnection requires the user, provide the exact action instead of reporting setup complete.
