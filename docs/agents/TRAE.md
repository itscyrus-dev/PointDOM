# Trae

Use this guide after the shared [installation runbook](../INSTALL_AGENT.md). **PointDOM uses Trae's MCP connection in the current Agent conversation. No Trae CLI is required or launched.**

## Trae IDE: install into the current project

After browser pairing, click **Copy setup instruction** in PointDOM settings and paste/send it in the open project's Trae chat. The IDE agent can perform the project/MCP configuration steps below. Project-MCP enablement and host trust remain separate; only report a connection after a real read-only tool call succeeds.

An agent running inside Trae can install the bridge, link the open project and write its MCP configuration without asking the user to copy commands between terminals.

1. Follow the runbook's non-interactive service installation and project-registration steps.
2. Export the linked project's configuration:

   ```sh
   ~/.local/bin/pdo connect --path /absolute/path/to/app --json
   ```

3. Read `/absolute/path/to/app/.trae/mcp.json` if it exists. Merge the generated `mcpServers` entries into its existing `mcpServers` object. Create the directory/file yourself when absent; a missing file is not a reason to stop and ask the user to create it. If a write is actually denied by the host, identify the failed operation. Do not bypass protected-file restrictions: provide the complete generated JSON and the exact supported host import or manual editor-save step. Do not declare installation complete merely because a standalone MCP test passed. Preserve other entries and use the generated server ID, command, args and env unchanged. This is a local machine configuration; do not commit it automatically.
4. In Trae's **Settings → MCP**, enable project MCP and complete its trust confirmation, then enable the generated PointDOM server's own switch. Project MCP loads from `.trae/mcp.json` only after the host enables that feature. Confirm the PointDOM tools are available in the agent being used.
5. Complete the runbook's Chrome steps. PointDOM tasks use MCP in the current Trae session.
6. After updates, restart/reconnect this PointDOM MCP service in the same Trae window so it loads the latest program; unchanged command/args do not refresh a running Node process. Ask Trae to call `pointdom_list_tasks` natively in this conversation and require the correct project plus `connection.id`. An empty `tasks` array is valid only with that connection identity. A temporary SDK process cannot verify the actual Trae conversation. After a real browser submission, ask it to read, claim, edit and report the task. During execution it should call `pointdom_progress_task` at source-location, editing and verification milestones. PointDOM shows these reported summaries; Trae's private chat and tool log are not automatically forwarded. Keep the same MCP server process alive through the final report.

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

In the separate **Agent window**, stay in the user's chosen conversation. Open the account menu → **Settings → MCP → Local** to inspect the services loaded there. A project file or successful SDK subprocess does not prove that this Agent session exposes the tools. If its actual tool catalog is empty and project loading is unavailable there, use **Add → Manual configuration** with the same generated project-bound entry, preserving other entries. This is a client-level manual service registration, not a change to global approval policies; disclose that scope. Verify a read-only `pointdom_list_tasks` call from the same Agent conversation after loading. Do not force the user into the IDE window or claim that an empty service list proves an active connection.

Official reference: [Add MCP servers in Trae](https://docs.trae.cn/ide_add-mcp-servers). UI wording and project-MCP availability depend on the installed version. The PointDOM server runs locally, so choose the local execution environment when the host offers local/cloud choices.

## Process annotations through MCP

Use the user's existing Agent conversation. Once PointDOM tools are exposed there, ask the agent to process this project's annotations. It lists pending tasks, reads the selected DOM and user descriptions, claims before editing, uses its own file/terminal tools, reports read/edit/check milestones and finishes with an explicit result report. Keep the same MCP process alive from claim through report.

Browser submission does not start an idle Trae conversation. PointDOM does not paste instructions into its input, click Send, bind chats by title or request device-control permissions. The former desktop auto-send controls and `pdo handoff` command are retired. No processing-copy button is required by the task protocol.

The current feature is generic local stdio MCP and does not require or launch Trae CLI. Agent CLI execution is planned separately. Any host-managed automation must be independently supported and verified in that host.

## If it does not connect

Check `pdo status`, the generated absolute launch paths, project-MCP enablement and the host's MCP log. A config file on disk alone is not a connected server. If the extension stays Not connected despite an empty task response, check `connection.id` and restart/reconnect the old PointDOM MCP process in this Agent window. `MCP_RECONNECT_REQUIRED` explicitly means its session registration is missing; re-running configuration export alone is insufficient. If tasks stay queued, verify that the browser and Trae server refer to the same project and explicitly ask the active agent to claim the task.

## Select this connection in PointDOM

After the host initializes this project's MCP, its reported client name appears in the extension's recipient picker. Select that connection before submitting; only it can list/read/claim its assigned tasks. Distinguish duplicate names by their short session IDs. An empty list is valid when no tasks are assigned. Changing the picker affects future submissions; use Reassign on queued cards to transfer pending work explicitly. Running tasks must finish/report in their original session. A connected entry does not start an idle agent turn or identify a desktop chat. See [routing details](../MCP.md#client-presence-and-task-routing).
