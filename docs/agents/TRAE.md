# Trae

Use this guide after the shared [installation runbook](../INSTALL_AGENT.md). **Trae IDE and `traecli` are separate integration paths.** Installing the IDE does not imply that `traecli` exists.

## Trae IDE: install into the current project

An agent running inside Trae can install the bridge, link the open project and write its MCP configuration without asking the user to copy commands between terminals.

1. Follow the runbook's non-interactive service installation and project-registration steps.
2. Export the linked project's configuration:

   ```sh
   ~/.local/bin/pdo connect --path /absolute/path/to/app --json
   ```

3. Read `/absolute/path/to/app/.trae/mcp.json` if it exists. Merge the generated `mcpServers` entries into its existing `mcpServers` object. Create the directory/file when absent. Preserve other entries and use the generated server ID, command, args and env unchanged. This is a local machine configuration; do not commit it automatically.
4. In Trae's **Settings → MCP**, enable project MCP and complete its trust confirmation. Project MCP loads from `.trae/mcp.json` only after the host enables that feature. Confirm the PointDOM tools are available in the agent being used.
5. Complete the runbook's Chrome steps. In PointDOM, use **Agent (MCP)** to process tasks in the current Trae session.
6. Ask Trae to call `pointdom_list_tasks`. An empty result verifies the read path without editing files. After a real browser submission, ask it to read, claim, edit and report the task.

The JSON has this shape; use actual generated values rather than copying these example paths:

```json
{
  "mcpServers": {
    "pointdom-generated-project-id": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/mcp.js", "--project", "/absolute/path/to/app"],
      "env": { "PAGEPATCH_HOME": "/absolute/path/to/local/state" }
    }
  }
}
```

If the installed Trae version does not offer project MCP, use **Settings → MCP → Add → Add manually**, or its raw JSON editor, and merge the same standard export. Report that the host setting is global even though the generated PointDOM server is bound to one project. Do not guess an undocumented user-config path.

Official reference: [Add MCP servers in Trae](https://docs.trae.cn/ide_add-mcp-servers). UI wording and project-MCP availability depend on the installed version. The PointDOM server runs locally, so choose the local execution environment when the host offers local/cloud choices.

## Automatic execution with Trae CLI

If the user already has an authenticated `traecli`:

```sh
traecli --version
pdo link --path /absolute/path/to/app --origin http://localhost:3000
```

Choose **Trae** in PointDOM. The bridge launches an ACP session through `traecli` in the registered project, using its local model configuration. Without the executable, the named destination falls back to MCP/client delivery; configure the IDE's MCP first and press Send in the receiving client.

Do not install a CLI, change model accounts or enable reduced confirmations as a side effect of installing PointDOM. Trae's native account integration and desktop input filling must be verified on the actual machine; protocol fixtures do not prove them.

## If it does not connect

Check `pdo status`, the generated absolute launch paths, project-MCP enablement and the host's MCP log. A config file on disk alone is not a connected server. If tasks stay queued, verify that the browser and Trae server refer to the same project and explicitly ask the active agent to claim the task.
