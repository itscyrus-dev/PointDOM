# Codex

First follow the shared [installation runbook](../INSTALL_AGENT.md). PointDOM supports automatic Codex CLI execution and project-scoped MCP for an existing Codex session. Both use your existing account/model configuration.

## Automatic CLI execution

Verify that Codex is already installed and authenticated:

```sh
codex --version
pdo link --path /absolute/path/to/app --origin http://localhost:3000
```

Complete Chrome loading, pairing and page access, then choose **Codex** in the extension. The bridge starts `codex app-server` in the linked project. Model, reasoning and speed stay in local Codex settings. Approval requests appear in the task card. Successful bridge installation does not establish model authentication or authorize a paid smoke test.

If `codex` is missing, PointDOM uses MCP/client delivery instead; the receiving client needs the MCP configuration below.

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

Alternatively, register the generated values through the CLI:

```sh
codex mcp add GENERATED_SERVER_ID --env PAGEPATCH_HOME=/absolute/path/to/local/state \
  -- /absolute/path/to/node /absolute/path/to/mcp.js --project /absolute/path/to/app
codex mcp list
```

CLI registration writes the user's Codex configuration; use project-local TOML when project-only host configuration is intended. In an interactive terminal, `pdo setup --agent codex --client standard --origin URL` prepares a correctly quoted registration command instead of requiring you to construct it manually. Do not run that interactive guide unattended.

Reconnect the host, inspect `/mcp` and call `pointdom_list_tasks`. In the extension choose **Agent (MCP)** when this existing session should claim and edit annotations. Choosing **Codex** requests a separate automatic CLI task when the binary is available.

Official references: [Codex MCP configuration](https://developers.openai.com/codex/mcp/) and [CLI commands](https://learn.chatgpt.com/docs/developer-commands#codex-mcp).
