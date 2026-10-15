# OpenCode

First follow the shared [installation runbook](../INSTALL_AGENT.md). OpenCode's automatic execution and MCP client configuration are independent: an installed CLI can run PointDOM tasks directly, while an existing OpenCode session can claim them through MCP.

## Automatic CLI execution

```sh
opencode --version
pdo link --path /absolute/path/to/app --origin http://localhost:3000
```

Complete Chrome setup and choose **OpenCode** in PointDOM. The bridge uses a private loopback API for OpenCode 1.x or ACP for 2.x. Configure authentication and the model through OpenCode first; PointDOM does not override model defaults. It reports actual task events and permission requests in the panel.

An installed executable does not prove the account/provider is ready. If it fails after starting a task, PointDOM does not automatically run that task again in another client.

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

Verify the configuration shape against the installed OpenCode version's schema. The exported fragment uses `mcp.SERVER_ID`, as documented by the linked MCP reference; do not assume that a future schema or a different OpenCode distribution is identical merely because direct ACP execution is supported.

Start/reconnect OpenCode in the linked application directory:

```sh
opencode mcp list
```

Ask it to call `pointdom_list_tasks`. In the browser choose **Agent (MCP)** when this session should claim the task; choose **OpenCode** for automatic CLI execution.

## Optional CC Switch import

```sh
pdo connect --path /absolute/path/to/app --client cc-switch --app opencode
```

This requests an import, which the user confirms and enables in CC Switch. PointDOM does not install CC Switch or assert that the import was accepted. Each project/installation has a distinct server ID; remove an old entry only after verifying that no session uses it.

Official references: [OpenCode local MCP configuration](https://opencode.ai/docs/mcp-servers/) and [CC Switch MCP import protocol](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/en/5-faq/5.3-deeplink.md).
