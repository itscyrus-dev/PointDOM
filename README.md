<p align="center">
  <img src="docs/assets/pointdom.svg" alt="PointDOM logo" width="80" height="80" />
</p>
<h1 align="center">PointDOM</h1>
<p align="center">Point at a page. Describe a change. Let your coding agent edit the source.</p>
<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md" lang="zh-CN">简体中文</a>
</p>
<p align="center">
  <a href="docs/README.md">Documentation</a> ·
  <a href="https://github.com/itscyrus-dev/PointDOM/releases">Releases</a> ·
  <a href="https://github.com/itscyrus-dev/PointDOM/issues">Issues</a> ·
  <a href="LICENSE">MIT License</a>
</p>

PointDOM connects Chrome annotations to coding agents working on your local project. Select page elements, describe the changes, and submit. The agent receives DOM context, locates the source, edits it through its own tools, and reports the result. Your application's existing development server displays changes through its normal hot reload.

**Any coding agent client that supports local stdio MCP and can edit your project can use PointDOM. OpenCode is not required.** All tasks use MCP in your own agent session. PointDOM captures DOM context, exposes a project-scoped MCP inbox and receives progress/results. Models, accounts, permissions and code execution stay in your agent client.

## Features

- Select up to ten individual DOM elements, including text and SVG inside clickable cards. Use **Alt/Option + Up/Down** to switch parent/child levels.
- Give each element its own instructions. Inspect its selector, dimensions, grouped styles and sanitized DOM structure in a separate detail view.
- Send DOM excerpts, attributes, ancestor/sibling context and geometry to help the agent identify the correct component and instance. DOM context is a source-location clue, not a guaranteed source-file mapping.
- Use your existing MCP agent session. PointDOM does not launch agent CLIs or configure models, accounts or approval policies.
- Link multiple local projects, isolate their task history, review reported progress and results.

## Requirements

| Component         | Requirement                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Release installer | macOS arm64/x64; Windows x64/ARM64 installer candidate (native verification pending). Supplies Node.js 24 when needed.             |
| Browser           | Chrome 120+. The extension is currently loaded unpacked; Chrome Web Store distribution is planned.                                 |
| MCP workflow      | A client that supports **local stdio MCP**, with tools to edit and verify the linked project. No particular agent CLI is required. |
| Application       | A local source directory and its actual development URL. PointDOM does not start or replace your development server.               |

Source installation on other platforms is a manual workflow with limitations; see the [installation runbook](docs/INSTALL_AGENT.md#manual-source-installation). A model API or ordinary chat website alone does not provide local MCP and file-editing capabilities.

## Quick start

1. Download **pointdom-extension.zip** from [GitHub Releases](https://github.com/itscyrus-dev/PointDOM/releases/latest), or use the ZIP supplied by your teammate. In `chrome://extensions`, enable **Developer mode** and drag the ZIP onto the page.
2. Open PointDOM settings. If the local service is disconnected, click **Copy install command** and run it in **Terminal** on macOS or **PowerShell** on Windows. The command installs the CLI, a private Node runtime if needed, and per-user login startup. It also authorizes this extension; return to PointDOM and it connects automatically. No installer application or manual pairing code is needed.
3. Click **Copy setup instruction**, then paste and send it in your coding agent's project conversation to link the project and configure MCP. Enable the generated MCP server and grant project-page access when prompted.

The extension detects a reachable local service, not the presence of a CLI executable. The copied command is specific to the extension and release version. Existing installations are reused without clearing data, stopping active work or silently upgrading. Older services without automatic-pairing support require an explicit update or **Advanced: manual pairing**. Keep the extension open or reopen it after installation; local authorization expires after 15 minutes.

Windows installation and startup code is included in this revision; native Windows installation still needs validation on Windows before general distribution. Current macOS checks do not establish Windows compatibility. Until this revision is published, its version-specific copied installer URLs are not available from GitHub Releases.

For the existing CLI-first workflow on macOS, `install.sh` followed by `~/.local/bin/pdo setup` remains available. Setup loads/pairs the extension and does not require a project directory.

When you start developing a project:

```sh
cd /absolute/path/to/your/app
pdo link --origin http://localhost:3000
```

Replace the directory and URL with your project. Run `pdo connect --json` in that directory and add the exported configuration to your agent. Open the linked development URL, enable page access in PointDOM, select elements and submit. Repeat the project commands for each additional project; setup is only needed once.

To set up the browser and a project together, use `pdo setup --origin http://localhost:3000`. This optional mode confirms a valid source directory before linking. `--path /absolute/path/to/your/app` supplies the directory explicitly; root/home directories, files and unavailable folders are rejected.

The installer downloads the latest **published stable GitHub Release**, including a built extension. Repository pushes alone do not update installed copies. This README describes the checked-out revision; unreleased features require a new release before `pdo upgrade` can obtain them.

Run `pdo extension --zip` to prepare the ZIP again, or download `pointdom-extension.zip` from [GitHub Releases](https://github.com/itscyrus-dev/PointDOM/releases/latest). Chrome extracts its own copy, so the managed-folder `pdo upgrade`/Reload workflow does not update a ZIP-installed copy. ZIP installations require manual extension updates. For the managed-folder workflow, run `pdo extension` instead and follow its folder-loading instructions.

## Install with your agent

Already paired the browser extension? In PointDOM settings, click **Copy setup instruction**, then paste and send it in the project's Trae or other coding-agent chat. The copied instruction follows the panel language. In Trae, enable project MCP and the generated PointDOM server in **Settings → MCP**. If the separate Agent window has not loaded the entry, import the same project-bound configuration in that window's **Settings → MCP → Local** and restart the service; verify the tools in the same conversation. The agent can reuse the installed service, link the project, merge its MCP configuration and verify the tools. Host project-MCP enablement/trust and Chrome page-access confirmations may still require your action; a saved config is not proof of a live connection.

Give your coding agent the repository URL and this request:

```text
Install PointDOM from https://github.com/itscyrus-dev/PointDOM for this project.
Read README.md and docs/INSTALL_AGENT.md, then follow the guide for your agent.
Use the non-interactive installation steps, preserve my existing configuration,
link the correct development URL, and verify the local service and MCP connection.
Finish all automated steps before listing the remaining Chrome/host confirmations.
Do not print pairing codes or change my application's dependencies or dev command.
```

**Installing agent:** follow the [installation runbook](docs/INSTALL_AGENT.md). It covers workspace discovery, existing installations, non-interactive commands, configuration merging and verification. Use the project's established URL; ask only when it cannot be determined.

Chrome loading, initial pairing, page-access grants and host trust/enablement remain explicit browser or host actions. A ready service does not prove that the extension, MCP client or model is connected.

## Set up your agent

MCP support is not limited to the clients listed below. Use the generic guide for any client that can launch a local stdio MCP server and edit the linked project.

| Agent or client                    | Task transport                         | Installation guide                        |
| ---------------------------------- | -------------------------------------- | ----------------------------------------- |
| Codex                              | Local stdio MCP                        | [Codex](docs/agents/CODEX.md)             |
| Claude Code                        | Local stdio MCP                        | [Claude Code](docs/agents/CLAUDE_CODE.md) |
| OpenCode                           | Local stdio MCP                        | [OpenCode](docs/agents/OPENCODE.md)       |
| Trae                               | Current Agent conversation via MCP     | [Trae Agent](docs/agents/TRAE.md)         |
| Any other compatible coding client | Local stdio MCP; no named CLI required | [Generic MCP](docs/agents/GENERIC_MCP.md) |

Export MCP configuration from the project's directory:

```sh
pdo connect --json
```

Merge the generated entry into your client's existing local MCP configuration, enable/trust it, and verify `pointdom_list_tasks`. Keep the generated absolute paths. Host-specific configuration formats are covered in the guides above.

Open the recipient control beside Submit. The client list includes Codex, Trae, Claude Code, Zcode, OpenCode and other MCP clients. A disconnected row offers **Copy setup**: paste that instruction into the corresponding client's project chat to configure MCP. Copying does not mark a client available. The instruction requires restarting/reconnecting an old MCP process and a native `pointdom_list_tasks` response containing the correct project and `connection.id`; `tasks: []` alone is insufficient. A real MCP connection for this project changes its row to **Available**, with a **Use** action. Other compatible hosts appear under their reported names. Choose an available connection before submitting. Only that connection can list, read and claim its assigned tasks. Client preference is remembered; ambiguous same-name sessions require an explicit choice.

To switch from Codex to Trae, connect this project's MCP in Trae and select it for future submissions. Use **Reassign** on existing unclaimed annotations if they should move too. Running tasks stay with their original session through the final report. A disconnected recipient does not send work to another agent automatically. See [routing details](docs/MCP.md#client-presence-and-task-routing).

Every annotation enters the project’s MCP inbox. Your agent reads and claims it before editing, reports concise read/edit/check summaries with `pointdom_progress_task`, then returns files and verification with `pointdom_report_task`. PointDOM displays those reports; it does not execute code, inspect model accounts, approve host commands or commit files. A submitted annotation remains queued until the client actually claims it.

MCP is the only task transport. Legacy agent-choice fields are accepted for compatibility but normalized to MCP; execution overrides and old project permission preferences do not authorize new work. Historical records remain readable.

Submitting saves an annotation as **Awaiting claim**. In your connected coding-agent conversation, ask the agent to process the current project's PointDOM annotations. It reads the DOM context through MCP, claims before editing, and reports progress/results through the same connection. PointDOM does not paste into chat inputs, click Send or wake an idle client. No task-processing clipboard fallback is used.

Agent CLI execution is a separate planned feature and is not included in this MCP implementation. Host-side automation can invoke the same tools if the client supports it, but MCP configuration alone is not proof that an idle agent will start.

## Multiple projects

Run this once from each application's source directory, using its real URL:

```sh
pdo link --origin http://localhost:3000
```

Or choose the directory explicitly:

```sh
pdo link --path /absolute/path/to/another-app --name another-app --origin http://localhost:5173
pdo projects
```

Repeating `link` for the same directory adds the origin without duplicating the project. Matching uses the exact scheme, host and port: `localhost:3000` and `127.0.0.1:3000` are distinct. Switching between linked pages selects the matching project; a shared origin requires an explicit project choice. Unrelated pages do not show annotations. History and All/Active counts are scoped to the selected project.

The **Project page access** card shows registered projects/URLs, not browser history. Pairing is shared by the installation; each site still needs Chrome access permission.

## Updates

Use `pdo upgrade` for later updates:

```sh
pdo upgrade
```

The updater checks the latest stable Release, verifies downloads and refuses pending/running tasks. An unchanged version does not download an installer. After readiness, it updates the fixed **PointDOM Extension** folder and MCP entry, then opens Chrome with reload instructions. Reload PointDOM, refresh the project page and reconnect your MCP client. Keep Developer mode enabled.

Project bindings, pairing and history are preserved. New installations use fixed browser/MCP paths, so later updates do not require repeating setup or re-importing configuration.

For older installations using `versions/.../dist/extension` or a folder alias, run `pdo extension` and load the fixed folder once. An extension ID change may require pairing/site access again. If MCP configuration references a version directory, regenerate it with `pdo connect --json` and replace only the old PointDOM entry. Keep old runtimes/releases until no client references them. See the [update runbook](docs/INSTALL_AGENT.md#updates-and-removal).

Settings shows the running extension version. The compact **Check for updates** action checks public Release metadata and never installs automatically.

## Data and permissions

- Browser local storage holds pairing, preferences and per-tab drafts/selections. The local bridge stores project bindings and task records under `~/.pagepatch`.
- The panel displays the latest 100 tasks for the selected project. This is a display limit, not deletion or retention: older records remain on disk.
- Captures contain bounded, sanitized DOM excerpts and styles, not full-page HTML, screenshots or live input/editable values. Scripts, event handlers, arbitrary data attributes and URL queries/fragments are excluded from DOM excerpts. Original page text and user notes retain their language.
- Generated context fields and guidance are English. User instructions are separate from `untrustedPageContext`; page content is untrusted location data, never instructions to execute.
- Task content is passed to your chosen agent and is subject to that agent/provider's data handling. An explicit update check contacts the public GitHub API without sending pairing codes, project paths, tasks or page content.
- The bridge listens on loopback, with pairing, Host/origin checks and project scoping. Browser access is requested for a linked origin after your action.
- All model, account, confirmation and network settings belong to your agent client. PointDOM does not commit, push or deploy.

**Copy DOM and change descriptions** copies structured context without creating a task. Routine MCP task submission no longer offers a processing-copy action. See the [MCP reference](docs/MCP.md#clipboard-content) for task lifecycle, copied fields and cancellation behavior.

## CLI reference

If `pdo` is not on PATH, use `~/.local/bin/pdo` or add `$HOME/.local/bin` to PATH. `pointdom` is a compatibility alias.

| Command                                | Purpose                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `pdo setup`                            | Initial extension loading and browser pairing; add projects later.      |
| `pdo link --origin URL`                | Link the current project; accepts `--path` and `--name`.                |
| `pdo projects`                         | List registered projects, directories and origins.                      |
| `pdo connect --json`                   | Export project-scoped local stdio MCP configuration.                    |
| `pdo connect --client opencode --json` | Export the native OpenCode MCP fragment.                                |
| `pdo connect --client cc-switch`       | Request a CC Switch import; `--app` selects the destination.            |
| `pdo extension`                        | Locate/open unpacked extension setup.                                   |
| `pdo extension --reload`               | Open update reload instructions without replacing the clipboard.        |
| `pdo extension --path`                 | Print the extension directory without opening apps.                     |
| `pdo extension --zip`                  | Export a standalone ZIP; manual extension updates.                      |
| `pdo pair --copy`                      | Copy the local pairing code without printing it.                        |
| `pdo status`                           | Check local service readiness.                                          |
| `pdo version`                          | Print the CLI version.                                                  |
| `pdo upgrade`                          | Verify and install the latest stable release; refuses unfinished tasks. |
| `pdo uninstall`                        | Remove login startup while preserving pairing, bindings and history.    |
| `pdo help`                             | Show commands and available options.                                    |

## Troubleshooting

| Symptom                          | Check                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pdo: command not found`         | Use `~/.local/bin/pdo`, or add `$HOME/.local/bin` to PATH.                                                        |
| Service offline                  | Run `pdo status`; check installation and port 4318 before changing the service lifecycle.                         |
| No matching project              | Link the exact URL shown in Chrome, including hostname and port.                                                  |
| Access remains unavailable       | Connect the bridge, choose a linked project URL and review site permissions.                                      |
| Task waits for an agent          | Verify MCP tools and ask the host to claim it; an idle client is not awakened by MCP.                             |
| Client/model error               | Check the receiving client’s MCP connection, account and model configuration.                                     |
| Client input was not filled      | Use an empty supported chat input, check macOS permissions, or paste the copied instruction.                      |
| Extension still shows the old UI | Run `pdo extension --reload`, reload PointDOM and refresh the page. For legacy paths, load the fixed folder once. |

## Development and contributing

PointDOM is a Chrome Manifest V3 extension and a Node.js/Hono bridge in strict TypeScript, with React and HeroUI in the panel. Source development requires Node.js 24 and the pnpm version pinned in `package.json`.

Start with [Development](docs/DEVELOPMENT.md), [Design](DESIGN.md) and [Contributing](CONTRIBUTING.md). Use [Issues](https://github.com/itscyrus-dev/PointDOM/issues) for reproducible problems, follow the [Code of Conduct](CODE_OF_CONDUCT.md), and report vulnerabilities through the [Security policy](SECURITY.md). Maintainer distribution checks are in [Releasing](docs/RELEASING.md).

`README.md` is the default English entry point; [the Chinese README](README.zh-CN.md) covers the same workflow. Detailed contributor and agent installation guides remain English. Documentation uses the project logo only; test screenshots belong in ignored local test artifacts.

## License

[MIT](LICENSE). Release packages include third-party license notices. See [Changelog](CHANGELOG.md) for version history.
