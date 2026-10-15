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

**Any coding agent client that supports local stdio MCP and can edit your project can use PointDOM. OpenCode is not required.** Codex, Claude Code, OpenCode and Trae also have named CLI integrations. Model accounts and configuration stay in the agent you choose.

## Features

- Select up to ten individual DOM elements, including text and SVG inside clickable cards. Use **Alt/Option + Up/Down** to switch parent/child levels.
- Give each element its own instructions. Inspect its selector, dimensions, grouped styles and sanitized DOM structure in a separate detail view.
- Send DOM excerpts, attributes, ancestor/sibling context and geometry to help the agent identify the correct component and instance. DOM context is a source-location clue, not a guaranteed source-file mapping.
- Use any compatible MCP client, or run a supported CLI with its existing local defaults. No model, speed or reasoning setup in the extension.
- Link multiple local projects, isolate their task history, review real task states, and save project-scoped permission preferences.

## Requirements

| Component              | Requirement                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Release installer      | macOS on Apple Silicon or Intel. It supplies Node.js 24 when needed; a source build and pnpm are not required.                     |
| Browser                | Chrome 120+. The extension is currently loaded unpacked; Chrome Web Store distribution is planned.                                 |
| MCP workflow           | A client that supports **local stdio MCP**, with tools to edit and verify the linked project. No particular agent CLI is required. |
| Automatic CLI workflow | The selected CLI must be installed, authenticated and configured. This is optional.                                                |
| Application            | A local source directory and its actual development URL. PointDOM does not start or replace your development server.               |

Source installation on other platforms is a manual workflow with limitations; see the [installation runbook](docs/INSTALL_AGENT.md#manual-source-installation). A model API or ordinary chat website alone does not provide local MCP and file-editing capabilities.

## Quick start

On macOS:

```sh
curl -fsSL https://github.com/itscyrus-dev/PointDOM/releases/latest/download/install.sh | sh
cd /absolute/path/to/your/app
~/.local/bin/pdo setup --origin http://localhost:3000
```

Replace the directory and URL with your project. Use `pdo setup` for the first installation; it links the project and guides browser pairing and agent setup.

1. Setup opens Chrome and selects **PointDOM Extension** in Finder, with its path copied. At `chrome://extensions`, enable **Developer mode** and click **Load unpacked**. In the folder chooser, press **Cmd+Shift+G**, paste, press Return and click **Select**. If needed, run `pdo extension` to reopen these steps.
2. Paste the local pairing code into PointDOM and connect. Keep this code on your computer.
3. Open the linked development URL and enable its page access in PointDOM.
4. Select elements, add descriptions, choose your agent and submit. Review the actual task result and source changes.

The installer downloads the latest **published stable GitHub Release**, including a built extension. Repository pushes alone do not update installed copies. This README describes the checked-out revision; unreleased features require a new release before `pdo upgrade` can obtain them.

## Install with your agent

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

| Agent or client                    | Optional automatic execution           | Installation guide                        |
| ---------------------------------- | -------------------------------------- | ----------------------------------------- |
| Codex                              | `codex` via app-server                 | [Codex](docs/agents/CODEX.md)             |
| Claude Code                        | `claude` via the official Agent SDK    | [Claude Code](docs/agents/CLAUDE_CODE.md) |
| OpenCode                           | `opencode`: 1.x local API or 2.x ACP   | [OpenCode](docs/agents/OPENCODE.md)       |
| Trae                               | `traecli` via ACP                      | [Trae IDE and CLI](docs/agents/TRAE.md)   |
| Any other compatible coding client | Local stdio MCP; no named CLI required | [Generic MCP](docs/agents/GENERIC_MCP.md) |

Export MCP configuration from the project's directory:

```sh
pdo connect --json
```

Merge the generated entry into your client's existing local MCP configuration, enable/trust it, and verify `pointdom_list_tasks`. Keep the generated absolute paths. Host-specific configuration formats are covered in the guides above.

- **Agent (MCP):** submit an annotation, then send the copied processing instruction in your connected client. The agent reads and claims the task before editing, then reports its files and checks. MCP does not wake an idle or closed session by itself.
- **Named agent with a CLI:** PointDOM executes through that CLI using its local model and account defaults. Configure these in the agent, not PointDOM.
- **Named agent without a CLI:** PointDOM queues the task for MCP, copies an instruction and attempts to fill a supported macOS client's empty chat input. You press Send. If filling is unavailable, paste the instruction yourself. Existing drafts are preserved.

A CLI failure after execution starts does not automatically reroute the task. Protocol tests do not establish compatibility with every host version, model account or desktop UI; see [verification and limits](docs/VERIFICATION.md).

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
- Project confirmation/network preferences apply to new tasks in that project. They do not rewrite global CLI settings. PointDOM does not automatically commit, push or deploy.

**Copy DOM and change descriptions** copies structured context without creating a task. **Copy agent instruction** copies a short processing instruction. See the [MCP reference](docs/MCP.md#clipboard-content) for task lifecycle, copied fields and cancellation behavior.

## CLI reference

If `pdo` is not on PATH, use `~/.local/bin/pdo` or add `$HOME/.local/bin` to PATH. `pointdom` is a compatibility alias.

| Command                                | Purpose                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `pdo setup --origin URL`               | Initial interactive project, browser and agent setup.                   |
| `pdo link --origin URL`                | Link the current project; accepts `--path` and `--name`.                |
| `pdo projects`                         | List registered projects, directories and origins.                      |
| `pdo connect --json`                   | Export project-scoped local stdio MCP configuration.                    |
| `pdo connect --client opencode --json` | Export the native OpenCode MCP fragment.                                |
| `pdo connect --client cc-switch`       | Request a CC Switch import; `--app` selects the destination.            |
| `pdo extension`                        | Locate/open unpacked extension setup.                                   |
| `pdo extension --reload`               | Open update reload instructions without replacing the clipboard.        |
| `pdo extension --path`                 | Print the extension directory without opening apps.                     |
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
| CLI/model error                  | Check the selected agent's executable, authentication and configuration.                                          |
| Client input was not filled      | Use an empty supported chat input, check macOS permissions, or paste the copied instruction.                      |
| Extension still shows the old UI | Run `pdo extension --reload`, reload PointDOM and refresh the page. For legacy paths, load the fixed folder once. |

## Development and contributing

PointDOM is a Chrome Manifest V3 extension and a Node.js/Hono bridge in strict TypeScript, with React and HeroUI in the panel. Source development requires Node.js 24 and the pnpm version pinned in `package.json`.

Start with [Development](docs/DEVELOPMENT.md), [Design](DESIGN.md) and [Contributing](CONTRIBUTING.md). Use [Issues](https://github.com/itscyrus-dev/PointDOM/issues) for reproducible problems, follow the [Code of Conduct](CODE_OF_CONDUCT.md), and report vulnerabilities through the [Security policy](SECURITY.md). Maintainer distribution checks are in [Releasing](docs/RELEASING.md).

`README.md` is the default English entry point; [the Chinese README](README.zh-CN.md) covers the same workflow. Detailed contributor and agent installation guides remain English. Documentation uses the project logo only; test screenshots belong in ignored local test artifacts.

## License

[MIT](LICENSE). Release packages include third-party license notices. See [Changelog](CHANGELOG.md) for version history.
