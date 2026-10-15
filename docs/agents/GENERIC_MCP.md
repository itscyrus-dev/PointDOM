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

Preserve existing servers, reconnect/enable the new one, and verify the four `pointdom_*` tools appear. Ask the host to call `pointdom_list_tasks`; an empty result is valid.

## Process annotations

In PointDOM choose **Agent (MCP)**, select elements, add descriptions and submit. Send the copied English processing instruction in the connected host. The host must read details, claim a queued task before editing, use its own editing/testing tools and report actual files and verification.

MCP does not start an idle session automatically. A host loop/automation is required for continuous processing. Without a selected desktop destination, generic MCP delivery copies the instruction and leaves sending to the user. Cancelling the annotation cannot stop work already launched in another application; stop that work there too.

If a host cannot use MCP, **Copy DOM and change descriptions** provides a JSON text context. That manual copy does not create, claim or complete a task in PointDOM.

Read the [MCP reference](../MCP.md) for tool names, state transitions and language behavior.
