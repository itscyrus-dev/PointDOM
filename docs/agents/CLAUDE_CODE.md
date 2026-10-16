# Claude Code

First follow the shared [installation runbook](../INSTALL_AGENT.md). PointDOM uses MCP in the user's existing Claude Code session. Models, provider accounts, sandboxing and approval policies remain in the client. No Claude Agent SDK or separate CLI execution is used by PointDOM.

## MCP for an existing session

Generate the linked project's actual server definition:

```sh
pdo connect --path /absolute/path/to/app --json
```

Merge the generated standard `mcpServers` entries into the host-supported local/project MCP configuration, such as the project's `.mcp.json`. Preserve other servers and settings. The user handles host trust and enablement; writing a file does not grant trust. Never commit machine-specific paths automatically.

Reconnect the session, inspect its actual MCP tool catalog and call `pointdom_list_tasks`. Read/claim/progress/report a user-submitted annotation in the same live session. Submission queues a task; use the connected agent to process it through MCP. PointDOM does not operate client windows or start an idle conversation.

Official reference: [Claude Code MCP configuration and scopes](https://code.claude.com/docs/en/mcp).

## Select this connection in PointDOM

After the host initializes this project's MCP, its reported client name appears in the extension's recipient picker. Select that connection before submitting; only it can list/read/claim its assigned tasks. Distinguish duplicate names by their short session IDs. An empty list is valid when no tasks are assigned. Changing the picker affects future submissions; use Reassign on queued cards to transfer pending work explicitly. Running tasks must finish/report in their original session. A connected entry does not start an idle agent turn or identify a desktop chat. See [routing details](../MCP.md#client-presence-and-task-routing).

After an update, a running stdio process may still contain old code. Finish any claimed work, then restart/reconnect this project's PointDOM MCP in the current host. Verify with a native pointdom_list_tasks call in this conversation: it must return the correct project and connection.id. tasks: [] alone, a saved config, or a temporary SDK subprocess cannot prove this host is connected. If reconnection requires the user, provide the exact action instead of reporting setup complete.
