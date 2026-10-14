# PointDOM

Select elements on a web page, describe the changes you want, and let your local **OpenCode CLI** update the linked project's source code. Once each project is linked, run its usual `pnpm dev` and send changes directly from the Chrome side panel.

PointDOM is a standalone Chrome Manifest V3 extension with a local Node.js/Hono bridge. On macOS, the bridge starts automatically at login. It starts an authenticated loopback `opencode serve` for each task in the registered project, returns results to the extension, and presents permission requests in the same side panel. No desktop OpenCode app, open TUI, MCP configuration or manual task claiming is required for this mode. Codex and external MCP agents remain available.

The extension and local state currently use the PagePatch name.

## One-command Install (macOS)

Install the prebuilt CLI, extension and login service with:

```sh
curl -fsSL https://github.com/itscyrus-dev/PointDOM/releases/latest/download/install.sh | sh
```

Requires an installed, configured OpenCode CLI. The installer checks SHA-256 hashes, uses Node.js 24+ if available or installs a private Node runtime, and needs neither pnpm nor source builds. It prints commands to add `~/.local/bin` to PATH for the current terminal and future zsh/bash sessions; shell profiles are not modified automatically. It prints the extension directory to load in Chrome; first pairing and per-site permission remain explicit browser actions. Existing installations are preserved. Run `pdo link --origin http://localhost:5173` once in each project, then use its usual `pnpm dev`.

Use `pdo help` to see available commands and `pdo version` (or `pdo -v`) to confirm the installed version. `pointdom` remains a compatibility alias. Published installers download the package from their own release tag; to install a specific version, use its script URL, such as `https://github.com/itscyrus-dev/PointDOM/releases/download/v0.1.0/install.sh`.

For source installation, use the setup below.

## Quick Setup (macOS)

Requirements: Node.js 24+, pnpm 10+, Chrome 120+, and an installed OpenCode CLI with a working model configuration. API keys remain in your existing OpenCode configuration. See the [AI installation guide](docs/INSTALL_AGENT.md) to delegate setup to your coding agent.

From this repository:

```sh
node scripts/setup.mjs --name my-app \
  --project /absolute/path/to/my-app \
  --origin http://localhost:5173
```

This installs dependencies, builds PointDOM, installs its login service, waits for it to become ready and links the project. Load `dist/extension` in Chrome, run `~/.local/bin/pdo pair` locally, and paste the pairing code into the extension once. Enable access to the development site and select **OpenCode CLI** in execution settings. Keep pairing codes out of chats and version control.

For each additional project, run this once from that project's directory:

```sh
~/.local/bin/pdo link --origin http://localhost:5174
```

Then use the project's existing `pnpm dev`. No service terminal or task-claiming step is needed. Repeating `link` updates the existing project; it also works while the bridge is running. For a per-project model, append `--model provider/model`. If multiple projects share the same web origin, explicitly choose the target project in the extension.

```sh
~/.local/bin/pdo status
~/.local/bin/pdo project list
~/.local/bin/pdo uninstall  # Stops the service; preserves pairing, bindings and history
```

If `~/.local/bin` is already in PATH, use `pdo` directly. The login service uses absolute paths to Node and OpenCode, so moving the installation or changing Node requires reinstalling the service. Uninstall before updating only after tasks have stopped. Automatic startup currently supports macOS. Other platforms can use the manual setup below.

## Installation

For manual setup, use Node.js 24+, pnpm 10+ and Chrome 120+. OpenCode execution requires a configured OpenCode CLI (validated with 1.18.29). Codex execution additionally requires an installed, authenticated Codex CLI; check `codex --version` and `codex login status`.

From the repository directory:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the project's **dist/extension** directory. Pin PagePatch to the toolbar. After updating the code and rebuilding, click **Reload** on the extension management page.

## Register a Project and Start the Service

Page URLs are used only to match registered projects. You register source directories locally; web pages cannot specify arbitrary filesystem paths. With an installed background service, use `pdo link` from the source directory. The legacy `project add` command also updates a running bridge through an authenticated local CLI endpoint. You can register multiple origins for the same project; the port is part of an origin.

Replace the example project name and path with your own:

```sh
pnpm cli project add --name my-app \
  --path /absolute/path/to/my-app \
  --origin http://127.0.0.1:5173
pnpm cli project add --name my-app \
  --path /absolute/path/to/my-app \
  --origin http://localhost:5173
pnpm start
```

Keep this terminal running. In another terminal, run the following from the repository directory:

```sh
pnpm cli pair
```

Copy the pairing code, open the target page, click PagePatch in the toolbar, and paste the code into the side panel to connect. The pairing code grants access to local editing capabilities. Do not share it or commit it to version control. Model authentication uses your local OpenCode or Codex configuration; you do not enter a model API key in the extension.

## Usage

1. On the target page, click the PagePatch toolbar icon to open the side panel and grant temporary access to the active tab.
2. Enable page annotations and grant access to the current site.
3. Use the selection control or shortcut to highlight and select elements. Press Esc to exit selection mode. Describe and submit changes in Chrome's native side panel; no editing overlay opens inside the page.
4. Enter a request, such as “Set this button's height to 40px and keep its rounded corners.” Confirm the matched project and submit the changes.
5. Select more elements and submit additional requests. Tasks run sequentially to avoid concurrent writes. The side panel shows task history, results, and failure details.
6. Respond to agent approval requests or follow-up questions in the side panel. Closing the panel does not cancel tasks; the local service must remain running.

Development servers such as Vite display source changes through their own hot reload mechanisms. The extension does not start your application or deploy your website. Use your project's existing deployment workflow. Avoid having other agents or editors modify the same files at the same time.

Tasks are saved in `~/.pagepatch/jobs.json`. Reopening the panel shows the latest 100 tasks; the full local history remains in the file. If the service restarts unexpectedly, unfinished tasks are marked as interrupted and are not automatically rerun, preventing duplicate edits. Stopping a task does not roll back changes already written to disk.

## Scope and Limitations

- Supports elements on ordinary HTTP/HTTPS pages. Captures selectors, visible text snippets, dimensions, and computed styles, but not full-page HTML, screenshots, input values, or URL query parameters.
- Precise selection inside iframes, closed Shadow DOM trees, and canvas objects is not supported. Injection is unavailable on restricted pages such as Chrome settings and the Chrome Web Store.
- A page element may not map uniquely to a React source component. The agent uses project source files to locate the relevant code; complex cases may need more explanation.
- Source code and selected page context are sent according to the selected executor's local configuration. OpenCode tasks consume usage from its configured provider; Codex tasks consume Codex usage.
- Independent App Server sessions are not guaranteed to appear in the current Codex desktop chat. Task results are available in the extension's side panel.
- The service listens only on `127.0.0.1:4318`. Remote multi-user access and a Chrome Web Store package are not provided. Login startup is available on macOS. Your application does not need an SDK.

## Development and Verification

```sh
pnpm check         # TypeScript, bridge/queue/protocol tests, and build
pnpm test:e2e      # Extension UI in an isolated Chromium profile with a test runner
pnpm test:opencode # Optional: real CLI with a local fake model; no paid model calls
pnpm test:codex    # Optional: real Codex edits a temporary CSS file; consumes usage
```

E2E tests require Playwright Chromium. If it is missing, run `pnpm exec playwright install chromium`. Tests grant fixture-site access only to a temporary copy of the extension. The distributed extension uses `activeTab` and optional permissions requested per site. The fixture site requires port 5175. The test bridge uses an isolated temporary port and rewrites only test copies of the extension and MCP entry.

Project structure:

- `src/extension`: browser extension.
- `src/bridge`: local service and Codex JSON-RPC adapter.
- `src/shared`: validated protocol definitions.
- `tests`: automated verification.
- `scripts`: build scripts and the real-execution smoke test.

Optional environment variables:

| Variable                 | Purpose                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `PAGEPATCH_HOME`         | State directory; defaults to `~/.pagepatch`.                                         |
| `PAGEPATCH_OPENCODE_BIN` | Absolute path to the OpenCode CLI, saved by the macOS service installer.             |
| `PAGEPATCH_CODEX_BIN`    | Path to the Codex executable; defaults to `codex`.                                   |
| `PAGEPATCH_MODEL`        | Explicit model name; otherwise uses the default returned by App Server `model/list`. |

Protocol references: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Chrome Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), and [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

When exactly one project matches, it is selected automatically without a project dropdown in the common workflow. After a task finishes, choose the option to continue editing, enter a new request, and submit again. Completion status comes from the Codex execution result; tasks cannot be manually marked as complete.

## Side Panel and Execution Settings

Editing and task results appear in Chrome's native side panel, without an editing iframe or floating editor inside the page. After updating the extension, refresh the page to remove any old injected UI. Close the panel with Chrome's close button. Click outside the execution settings or press Esc to dismiss them.

In Codex mode, model, speed, reasoning effort, and approval preferences are saved locally in the extension. Each submitted task stores a snapshot of these settings. Available models and options come from Codex `model/list`; unsupported options are hidden. Speed settings may affect account usage, as determined by the service.

Approval modes:

- **On request** (`on-request`): ask for approval when needed.
- **Strict** (`untrusted`): more commands require approval; trusted commands may run directly.
- **Never ask** (`never`): operations requiring permissions beyond the workspace fail rather than automatically receiving elevated access.

The model selected in the panel takes precedence over `PAGEPATCH_MODEL`. If neither is set, the model catalog's default is used.

OpenCode mode uses its local default model or the model bound with `pdo link --model provider/model`. Codex-only controls are hidden. Each task uses a fresh session with command/edit permissions requiring explicit confirmation and external-directory access denied. Cancellation stops the owned CLI process; completed writes are not rolled back.

### Local Commits

After a task finishes, click **Commit** to create a local commit with a message generated from the change request. You can enable automatic commits after completion in the execution settings below the input. This option is off by default and applies only to subsequently submitted tasks. A successful commit displays its short hash; it is not pushed to a remote.

If changes overlap with pre-existing edits, files have been modified again, or an older task lacks a recorded change scope, inspect and commit the changes directly in your project.

## CC Switch / OpenCode / Other Agent Integration

Project-scoped local stdio MCP is supported. Select the other-agent MCP execution mode in the side panel to provide an agent with DOM text and separate descriptions for multiple elements. Image understanding is not required. See the [MCP integration guide](docs/MCP.md) for setup and usage. Generate a configuration for your project with:

```sh
pnpm --silent mcp:config
```

With one registered project, the command selects it automatically; with multiple projects, append `--project /absolute/path/to/project`. In CC Switch, add an MCP server, paste the generated JSON, enable it for OpenCode or your chosen client, and restart that client. For native OpenCode configuration, use `pnpm --silent mcp:config --client opencode` and merge the output into your existing config. Codex authentication is only required for Codex execution; MCP tasks use the host agent’s model and credentials.

Standard MCP does not automatically wake an idle session. Ask the host application to read pending PagePatch tasks. The host application manages the model, editing, permissions, and commits.

## Contributing and Releases

Licensed under [MIT](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md) and the [release guide](docs/RELEASING.md).

GitHub CI runs format, type, unit, isolated browser and release-package checks. Version tags matching `package.json` build and publish `pointdom.tar.gz`, `pointdom-extension.zip`, `install.sh` and `SHA256SUMS`. The CLI archive bundles runtime dependencies and their license notices. Build outputs remain untracked.
