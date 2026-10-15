# Claude Code

First follow the shared [installation runbook](../INSTALL_AGENT.md). PointDOM can launch the installed Claude Code CLI through the official Agent SDK, or expose annotations to an existing Claude Code session through MCP.

## Automatic CLI execution

```sh
claude --version
pdo link --path /absolute/path/to/app --origin http://localhost:3000
```

The CLI must already be installed, authenticated and configured. Complete Chrome setup, then choose **Claude Code** in the extension. PointDOM uses the installed `claude` executable, its existing settings and the SDK's sandbox support. Install the sandbox prerequisites required by that Claude Code version; PointDOM does not fall back to unrestricted execution when the sandbox is unavailable.

Model/account setup remains in Claude Code. Missing executables, sandbox failures and protocol errors must be investigated rather than reported as a successful edit.

## MCP for an existing session

Generate the linked project's actual server definition:

```sh
pdo connect --path /absolute/path/to/app --json
```

For the current user's local project registration, run this from the application directory, substituting the generated values:

```sh
cd /absolute/path/to/app
claude mcp add --scope local --env PAGEPATCH_HOME=/absolute/path/to/local/state \
  --transport stdio GENERATED_SERVER_ID -- /absolute/path/to/node \
  /absolute/path/to/mcp.js --project /absolute/path/to/app
claude mcp list
```

Keep `--transport stdio` between the environment assignment and the server ID; Claude's `--env` parsing can otherwise consume the name as another assignment. Preserve other servers. Local scope avoids adding a machine-specific entry to a shared repository file.

If the user wants project configuration, merge the generated standard `mcpServers` entries into `.mcp.json` instead. Preserve existing entries, and have the user approve project MCP when the host asks. Writing the file does not grant trust. Do not commit absolute local paths automatically.

The interactive alternative is `pdo setup --agent claude --client standard --origin URL`, which prepares a registration command. Automated installation should use the non-interactive export and registration above.

Reconnect the session, inspect `/mcp` and call `pointdom_list_tasks`. In PointDOM choose **Agent (MCP)** to send work to that session. Choose **Claude Code** for a separate automatic CLI task when the executable is available.

Official reference: [Claude Code MCP configuration and scopes](https://code.claude.com/docs/en/mcp).
