# PointDOM

Select elements on a web page, describe the changes you want, and let your local Codex update the linked project's source code. There is no need to return to a Codex chat and paste screenshots.

PointDOM is a standalone **Chrome Manifest V3 extension with a local Node.js/Hono service**. It runs tasks through the official Codex App Server, with a separate Codex session for each project. It does not automate typing into the Codex desktop chat or merely apply temporary DOM changes.

The extension and local configuration currently use the **PagePatch** name.

## Installation

Requirements: Node.js 24+, pnpm 10+, Chrome 120+, and an installed, authenticated Codex CLI. Run `codex --version` and `codex login status` to check your setup.

From the repository directory:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the project's **dist/extension** directory. Pin PagePatch to the toolbar. After updating the code and rebuilding, click **Reload** on the extension management page.

## Register a Project and Start the Service

Page URLs are used only to match registered projects. You register source directories locally; web pages cannot specify arbitrary filesystem paths. Stop the local service before registering a project. You can register multiple origins for the same project; the port is part of an origin.

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

Copy the pairing code, open the target page, click PagePatch in the toolbar, and paste the code into the side panel to connect. The pairing code grants access to local editing capabilities. Do not share it or commit it to version control. Authentication uses your local Codex CLI account; you do not enter an OpenAI API key in the extension.

## Usage

1. On the target page, click the PagePatch toolbar icon to open the side panel and grant temporary access to the active tab.
2. Enable page annotations and grant access to the current site.
3. Use the selection control or shortcut to highlight and select elements. Press Esc to exit selection mode. Describe and submit changes in Chrome's native side panel; no editing overlay opens inside the page.
4. Enter a request, such as “Set this button's height to 40px and keep its rounded corners.” Confirm the matched project and submit the changes.
5. Select more elements and submit additional requests. Tasks run sequentially to avoid concurrent writes. The side panel shows task history, results, and failure details.
6. Respond to Codex approval requests or follow-up questions in the side panel. Closing the panel does not cancel tasks; the local service must remain running.

Development servers such as Vite display source changes through their own hot reload mechanisms. The extension does not start your application or deploy your website. Use your project's existing deployment workflow. Avoid having other agents or editors modify the same files at the same time.

Tasks are saved in `~/.pagepatch/jobs.json`. Reopening the panel shows the latest 100 tasks; the full local history remains in the file. If the service restarts unexpectedly, unfinished tasks are marked as interrupted and are not automatically rerun, preventing duplicate edits. Stopping a task does not roll back changes already written to disk.

## Scope and Limitations

- Supports elements on ordinary HTTP/HTTPS pages. Captures selectors, visible text snippets, dimensions, and computed styles, but not full-page HTML, screenshots, input values, or URL query parameters.
- Precise selection inside iframes, closed Shadow DOM trees, and canvas objects is not supported. Injection is unavailable on restricted pages such as Chrome settings and the Chrome Web Store.
- A page element may not map uniquely to a React source component. Codex uses project source files to locate the relevant code; complex cases may need more explanation.
- Source code and selected page context are sent to the model service according to your local Codex configuration. Tasks consume your account's Codex usage allowance.
- Independent App Server sessions are not guaranteed to appear in the current Codex desktop chat. Task results are available in the extension's side panel.
- The service listens only on `127.0.0.1:4318`. Remote multi-user access, automatic startup, and a Chrome Web Store package are not provided. Your application does not need an SDK.

## Development and Verification

```sh
pnpm check         # TypeScript, bridge/queue/protocol tests, and build
pnpm test:e2e      # Extension UI in an isolated Chromium profile with a test runner
pnpm test:codex    # Optional: real Codex edits a temporary CSS file; consumes usage
```

E2E tests require Playwright Chromium. If it is missing, run `pnpm exec playwright install chromium`. Tests grant fixture-site access only to a temporary copy of the extension. The distributed extension uses `activeTab` and optional permissions requested per site. Ports 4318 and 5175 must be available.

Project structure:

- `src/extension`: browser extension.
- `src/bridge`: local service and Codex JSON-RPC adapter.
- `src/shared`: validated protocol definitions.
- `tests`: automated verification.
- `scripts`: build scripts and the real-execution smoke test.

Optional environment variables:

| Variable              | Purpose                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| `PAGEPATCH_HOME`      | State directory; defaults to `~/.pagepatch`.                                         |
| `PAGEPATCH_CODEX_BIN` | Path to the Codex executable; defaults to `codex`.                                   |
| `PAGEPATCH_MODEL`     | Explicit model name; otherwise uses the default returned by App Server `model/list`. |

Protocol references: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Chrome Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), and [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

When exactly one project matches, it is selected automatically without a project dropdown in the common workflow. After a task finishes, choose the option to continue editing, enter a new request, and submit again. Completion status comes from the Codex execution result; tasks cannot be manually marked as complete.

## Side Panel and Execution Settings

Editing and task results appear in Chrome's native side panel, without an editing iframe or floating editor inside the page. After updating the extension, refresh the page to remove any old injected UI. Close the panel with Chrome's close button. Click outside the execution settings or press Esc to dismiss them.

Model, speed, reasoning effort, and approval preferences are saved locally in the extension. Each submitted task stores a snapshot of these settings. Available models and options come from Codex `model/list`; unsupported options are hidden. Speed settings may affect account usage, as determined by the service.

Approval modes:

- **On request** (`on-request`): ask for approval when needed.
- **Strict** (`untrusted`): more commands require approval; trusted commands may run directly.
- **Never ask** (`never`): operations requiring permissions beyond the workspace fail rather than automatically receiving elevated access.

The model selected in the panel takes precedence over `PAGEPATCH_MODEL`. If neither is set, the model catalog's default is used.

### Local Commits

After a task finishes, click **Commit** to create a local commit with a message generated from the change request. You can enable automatic commits after completion in the execution settings below the input. This option is off by default and applies only to subsequently submitted tasks. A successful commit displays its short hash; it is not pushed to a remote.

If changes overlap with pre-existing edits, files have been modified again, or an older task lacks a recorded change scope, inspect and commit the changes directly in your project.

## Trae / ZCode / DeepSeek Agent Integration

Project-scoped local stdio MCP is supported. Select the other-agent MCP execution mode in the side panel to provide an agent with DOM text and separate descriptions for multiple elements. Image understanding is not required. See the [MCP integration guide](docs/MCP.md) for setup and usage. Generate a configuration for your project with:

```sh
pnpm --silent mcp:config --project /absolute/path/to/project
```

Standard MCP does not automatically wake an idle session. Ask the host application to read pending PagePatch tasks. The host application manages the model, editing, permissions, and commits.
