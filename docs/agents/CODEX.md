# Codex

First follow the shared [installation runbook](../INSTALL_AGENT.md). PointDOM uses MCP in the user's existing Codex session. Configure models, accounts and permissions in Codex; PointDOM does not launch `codex app-server` or a separate coding process.

## MCP for the current project

Export the actual server definition:

```sh
pdo connect --path /absolute/path/to/app --json
```

Read the generated `mcpServers` entry and merge it into the application's `.codex/config.toml`. Convert its fields as follows, using the generated server ID:

```toml
[mcp_servers.pointdom_generated_id]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/mcp.js", "--project", "/absolute/path/to/app"]

[mcp_servers.pointdom_generated_id.env]
PAGEPATCH_HOME = "/absolute/path/to/local/state"
```

The values above are illustrative. Preserve existing TOML, servers, comments and account settings. Project configuration is loaded for trusted projects; the user must accept the host's trust decisions. Do not commit machine-specific absolute paths automatically.

Reconnect the host, inspect its MCP tools and call `pointdom_list_tasks`. Read, claim, update and report submitted annotations in that same live MCP session. A written configuration file is not proof of connectivity. PointDOM does not wake idle conversations, operate client windows or run an Agent CLI; host execution remains in your control.

Official references: [Codex MCP configuration](https://developers.openai.com/codex/mcp/) and [CLI commands](https://learn.chatgpt.com/docs/developer-commands#codex-mcp).

## Select this connection in PointDOM

After the host initializes this project's MCP, its reported client name appears in the extension's recipient picker. Select that connection before submitting; only it can list/read/claim its assigned tasks. Distinguish duplicate names by their short session IDs. An empty list is valid when no tasks are assigned. Changing the picker affects future submissions; use Reassign on queued cards to transfer pending work explicitly. Running tasks must finish/report in their original session. A connected entry does not start an idle agent turn or identify a desktop chat. See [routing details](../MCP.md#client-presence-and-task-routing).

After an update, a running stdio process may still contain old code. Finish any claimed work, then restart/reconnect this project's PointDOM MCP in the current host. Verify with a native pointdom_list_tasks call in this conversation: it must return the correct project and connection.id. tasks: [] alone, a saved config, or a temporary SDK subprocess cannot prove this host is connected. If reconnection requires the user, provide the exact action instead of reporting setup complete.
