# Codex CLI

Follow the [installation runbook](../INSTALL_AGENT.md). PointDOM's new workflow starts the local `codex` process directly, with no PointDOM MCP server or repeated chat handoff.

1. Install and sign in to Codex CLI using its [official documentation](https://developers.openai.com/codex/noninteractive/). Keep your account, model and permissions configured there.
2. Register the source project with `pdo link --path /absolute/path/to/app --origin http://localhost:3000`, replacing the path and URL with verified values.
3. In the menu beside Submit, choose **Check again → Codex**. Detection confirms executable capability only, not authentication/model access.
4. Open the registered page, grant page access, select the DOM elements, describe the change and submit. Progress and the final CLI report appear in PointDOM.

The CLI invocation uses the registered source directory and does not target an existing desktop chat. No permission-bypass flags or automatic commits are added. If permission, authentication or model configuration blocks the run, the task reports failure; inspect partial edits before retrying. See [CLI execution](../CLI.md) for supported invocation formats, limits and cancellation behavior.
