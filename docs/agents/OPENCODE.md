# OpenCode

First follow the shared [installation runbook](../INSTALL_AGENT.md). PointDOM uses MCP in an existing OpenCode session; it does not launch an OpenCode HTTP/ACP server or run its CLI. Models, credentials and permissions remain in OpenCode.

## MCP for an existing session

Export native configuration for the registered project:

```sh
pdo connect --path /absolute/path/to/app --client opencode --json
```

This emits a fragment such as:

```json
{
  "mcp": {
    "pointdom-generated-project-id": {
      "type": "local",
      "command": [
        "/absolute/path/to/node",
        "/absolute/path/to/mcp.js",
        "--project",
        "/absolute/path/to/app"
      ],
      "environment": { "PAGEPATCH_HOME": "/absolute/path/to/local/state" },
      "enabled": true
    }
  }
}
```

Use the real generated ID and paths. Read the application's existing `opencode.json` / `opencode.jsonc`, then merge only these MCP entries. Do not overwrite models, providers, other servers or JSONC comments. A user-level config can also be used when explicitly desired. Keep machine-specific paths out of commits.

Verify the configuration shape against the installed OpenCode version's schema. The exported fragment uses `mcp.SERVER_ID`, as documented by the linked MCP reference; do not assume that a future schema or a different OpenCode distribution is identical without checking the installed client.

Start/reconnect OpenCode in the linked application directory:

```sh
opencode mcp list
```

Ask it to call `pointdom_list_tasks`. Use this same live MCP session to read, claim, report progress and finish the task. Submission queues a task; PointDOM does not operate client windows or start an idle conversation.

## Optional CC Switch import

```sh
pdo connect --path /absolute/path/to/app --client cc-switch --app opencode
```

This requests an import, which the user confirms and enables in CC Switch. PointDOM does not install CC Switch or assert that the import was accepted. Each project/installation has a distinct server ID; remove an old entry only after verifying that no session uses it.

Official references: [OpenCode local MCP configuration](https://opencode.ai/docs/mcp-servers/) and [CC Switch MCP import protocol](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/en/5-faq/5.3-deeplink.md).

## Select this connection in PointDOM

After the host initializes this project's MCP, its reported client name appears in the extension's recipient picker. Select that connection before submitting; only it can list/read/claim its assigned tasks. Distinguish duplicate names by their short session IDs. An empty list is valid when no tasks are assigned. Changing the picker affects future submissions; use Reassign on queued cards to transfer pending work explicitly. Running tasks must finish/report in their original session. A connected entry does not start an idle agent turn or identify a desktop chat. See [routing details](../MCP.md#client-presence-and-task-routing).

After an update, a running stdio process may still contain old code. Finish any claimed work, then restart/reconnect this project's PointDOM MCP in the current host. Verify with a native pointdom_list_tasks call in this conversation: it must return the correct project and connection.id. tasks: [] alone, a saved config, or a temporary SDK subprocess cannot prove this host is connected. If reconnection requires the user, provide the exact action instead of reporting setup complete.
