# CLI execution

PointDOM's CLI mode submits directly to a local CLI runner. The Chrome extension does not execute OS programs itself: it sends authenticated task requests to the loopback service, which starts the selected CLI in the registered canonical project directory. No PointDOM MCP configuration, listening loop, chat paste or desktop automation is required.

## Supported invocations

- Codex: `codex exec --json --color never --sandbox workspace-write -`.
- Claude Code: `claude --print --verbose --output-format stream-json`.
- OpenCode: `opencode run --format json`, plus `--standalone` when installed help advertises it.
- Trae: capability-detected `traecli exec --json --color never --sandbox workspace-write -`, or `traecli --print --output-format stream-json` for the print-mode distribution.

The bridge passes one JSON document on stdin. It contains explicit instructions, per-element instructions and bounded untrusted DOM context. No browser payload can choose an executable, working directory, environment, approval policy or arbitrary shell command. The process uses `shell: false` and the locally registered source directory. Existing account/model settings belong to the CLI. No bypass/yolo/auto-approve flags are added. Permission denials must be resolved in the CLI; a headless invocation cannot display an interactive terminal approval dialog in the extension.

Official references: [Codex noninteractive mode](https://developers.openai.com/codex/noninteractive/), [Claude programmatic use](https://code.claude.com/docs/en/headless), [OpenCode CLI](https://opencode.ai/docs/cli/), [Trae CLI parameters](https://docs.trae.cn/cli_command-line-parameters).

## Detection and selection

The local service searches absolute entries in its PATH and common per-user installation locations. Known Windows npm JavaScript entry points run through Node without evaluating `.cmd` shell text. Advanced local deployments can supply an absolute `POINTDOM_CODEX_BIN`, `POINTDOM_CLAUDE_BIN`, `POINTDOM_OPENCODE_BIN` or `POINTDOM_TRAE_BIN` when starting the service. Browser requests cannot modify these values.

Only read-only help and version probes are used to detect supported commands. Detected does **not** prove login, account eligibility, model access or available credit. Select a CLI once beside Submit; the preference is persisted globally. Every task snapshots its selected executor, so changing the preference affects future submissions only. Recheck bypasses the short detection cache after installation.

Each project still requires local `pdo link --origin URL`. The browser cannot infer a trusted source directory from a webpage. Runs are new CLI invocations, not resumption of an existing desktop conversation. No `--continue` or `--last` is used.

## Lifecycle and result boundaries

- Persist the task before starting. Duplicate task IDs return the same task and cannot change executor, instructions, project or DOM.
- Serialize runs for a project. Other projects may run independently.
- Stream real tool names, commands, file paths, reported states, exit codes and bounded redacted result excerpts. On failure, return only bounded redacted error-shaped stderr lines. Never persist thinking or complete account/configuration dumps.
- Require exit code zero and a nonempty final report, plus the CLI terminal event where provided. OpenCode v2 also supports clean process completion after text output: its noninteractive runner can complete without a step_finish event. Any reported error, cancellation or timeout still fails. A process exit with no report is never success.
- Treat permission denial, protocol errors, missing results, nonzero exits and timeout as failure. No automatic retry.
- Default wall-clock limit is 30 minutes; output is bounded. Cancellation sends termination to the process tree, with forced termination as a fallback.
- Service shutdown interrupts running work. Recovery marks unfinished CLI work interrupted rather than replaying it. Partial edits remain for user inspection.

Completed means the CLI returned a successful report. It is not independent certification that every requested change is correct. Read the reported checks and inspect the code.

## Migration

CLI remains available alongside [MCP listening](MCP.md). The executor preference is shared globally; each task retains its original executor and, for MCP, its exact recipient. Switching modes does not transfer existing work. MCP setup is installation-scoped and does not change CLI accounts, models or permissions. Legacy execution overrides remain rejected.

Windows path/process code is included but needs native Windows validation. Automated tests use executable fixtures and temporary projects, not paid models or real user sessions.

## Failure diagnostics

Authentication, unavailable-model and argument failures have distinct error codes and localized messages. Actual provider errors and bounded, redacted stderr diagnostics appear in Activity. Existing tasks whose stderr was discarded cannot recover that diagnostic retroactively. No failed task is automatically retried.

The locally installed Trae CLI is separate from a signed-in desktop app. Use `traecli login status` and, when needed, `traecli login` in a terminal. Headless Codebase Git authentication failures also require that authentication endpoint to be reachable. PointDOM does not log in, change credentials or alter network/proxy settings.

OpenCode v2 completion behavior is documented in its [v2.0.30 noninteractive runner source](https://github.com/anomalyco/opencode/blob/v2.0.30/packages/cli/src/run/noninteractive.ts).
