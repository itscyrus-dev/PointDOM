<h1 align="center">PointDOM</h1>

<p align="center">Point at elements in Chrome. Describe a change. Let your local OpenCode CLI update the code.</p>

<p align="center">
  <a href="https://github.com/itscyrus-dev/PointDOM/actions/workflows/ci.yml"><img src="https://github.com/itscyrus-dev/PointDOM/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/itscyrus-dev/PointDOM/actions/workflows/release.yml"><img src="https://github.com/itscyrus-dev/PointDOM/actions/workflows/release.yml/badge.svg" alt="CD: release build" /></a>
  <a href="https://github.com/itscyrus-dev/PointDOM/releases"><img src="https://img.shields.io/github/v/release/itscyrus-dev/PointDOM" alt="Latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/itscyrus-dev/PointDOM" alt="MIT License" /></a>
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white" alt="Node.js 24" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white" alt="Hono" />
  <img src="https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Manifest V3" />
  <img src="https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white" alt="pnpm 10" />
</p>

## What PointDOM does

Select one or more elements in Chrome, describe the changes you want, and send the request to a coding agent working on your local project. PointDOM provides selectors, text, computed styles and element positions; the agent finds and edits the source files. Your development server displays the changes through its normal hot reload.

| Execution mode        | How it starts                                                              | Where model settings and approvals live                                                              |
| --------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **OpenCode CLI**      | Sending an annotation starts a local OpenCode task automatically.          | Model/provider configuration stays in OpenCode or CC Switch; review task approvals in the extension. |
| **Other Agent (MCP)** | Send an annotation, then ask your connected agent to claim and process it. | The host agent manages its model, editing tools and permissions.                                     |
| **Codex**             | Sending an annotation starts a local Codex task.                           | Requires an installed, authenticated Codex CLI; execution options appear in the extension.           |

## Install and load the extension

The release installer requires **macOS**, **Chrome 120+**, and a configured **OpenCode CLI**. It installs a private Node.js 24 runtime if needed; pnpm and a source build are not required.

```sh
curl -fsSL https://github.com/itscyrus-dev/PointDOM/releases/latest/download/install.sh | sh
```

If your terminal cannot find `pdo`, enable it for the current session:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

The installer also prints a persistent PATH setting for your shell. You can always use `~/.local/bin/pdo` instead. `pointdom` is a compatibility alias for `pdo`.

Open the extension setup:

```sh
pdo extension
```

On macOS this requests the Chrome extensions page and the extension folder in Finder, and copies the folder path to your clipboard. In Chrome:

1. Enable **Developer mode** at `chrome://extensions`.
2. Click **Load unpacked**.
3. Press **Cmd+Shift+G**, paste the copied path, and select the folder.
4. Pin the extension to your toolbar. It currently appears as **PagePatch**.

Chrome requires this manual loading confirmation. The command does not install the extension silently. To get the path without opening windows or changing the clipboard:

```sh
pdo extension --path
```

Pair the browser extension once:

```sh
pdo pair
```

Paste the pairing code into the extension's connection settings. Keep it local; it grants access to editing capabilities. Then open your development site and enable access to that site in the extension.

## Use OpenCode directly

From the source directory of the app you want to edit:

```sh
cd /path/to/your/project
pdo link --origin http://localhost:5173
pnpm dev
```

Use your project's actual development command and URL. In the extension, select **OpenCode CLI**, pick an element, describe a change and send. The background bridge starts OpenCode in the linked directory; you do not need to keep an OpenCode TUI open or manually claim MCP tasks. Review results and permission requests in the extension.

Link each project once. Repeating `link` updates its binding. Origins include the port: `http://localhost:5173`, `http://127.0.0.1:5173` and `http://localhost:3000` are different origins. Register each address you use. If several projects share an origin, choose the intended project in the extension.

Optional binding settings:

```sh
# Use a model ID already configured in OpenCode.
pdo link --origin http://localhost:5173 --model provider/model

# Bind a directory without changing your terminal's working directory.
pdo link --path /path/to/project --name my-app --origin http://localhost:5173
```

Replace `provider/model` with an actual model ID. Model credentials remain in your agent configuration, not in PointDOM.

## Use CC Switch and MCP

If you want annotations handled inside your own agent session, run this from your project's directory:

```sh
pdo connect --origin http://localhost:5173
```

This links the current project and requests a **CC Switch MCP import for OpenCode**. Confirm the import and restart OpenCode. In the browser extension, choose **Other Agent (MCP)**, select elements, describe the changes and send. Then ask OpenCode:

> Use PagePatch MCP to process pending annotations for this project. Read and claim a task before editing, follow the project rules, run relevant checks, and report the actual files changed and verification results.

MCP does not automatically wake an idle agent session. Your host must support local stdio MCP and project editing tools. An agent report is displayed as a report, not independent verification by PointDOM.

For a project already linked, `pdo connect` is enough. Additional options:

```sh
# Select the app enabled by the CC Switch import (default: opencode).
pdo connect --app codex
pdo connect --app claude

# Select an already registered project explicitly.
pdo connect --path /path/to/project

# Print a link without opening CC Switch.
pdo connect --url

# Print JSON for CC Switch's Add MCP screen.
pdo connect --json
```

If the import link does not open, paste the JSON into **Add MCP** in CC Switch and enable the checkbox for your app. Each project has a distinct entry. After upgrading PointDOM, rerun `pdo connect` and remove older unused PointDOM entries so your agent uses the current installation. See the [MCP guide](docs/MCP.md) for native OpenCode configuration and other clients.

## Command reference

Run `pdo help` to list commands. Commands that refer to a project use your current directory unless `--path` is supplied.

| Command                                        | Purpose / important behavior                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pdo extension`                                | Open Chrome extension setup and Finder, copy the extension path on macOS, and print the remaining manual steps.                     |
| `pdo extension --path`                         | Print only the extension directory for this CLI installation; no bridge or project binding needed.                                  |
| `pdo extension --help`                         | Show extension setup options.                                                                                                       |
| `pdo pair`                                     | Print the local pairing code for the browser extension.                                                                             |
| `pdo link --origin URL`                        | Bind the current source directory to a development-site origin through the running bridge.                                          |
| `pdo link --origin URL --model provider/model` | Set the linked project's OpenCode model. Also accepts `--path PATH` and `--name NAME`.                                              |
| `pdo connect --origin URL`                     | Link the project and request a CC Switch MCP import for OpenCode.                                                                   |
| `pdo connect`                                  | Request an import for the current, already linked project. Accepts `--path PATH` and `--app opencode\|codex\|claude`.               |
| `pdo connect --json`                           | Output credential-free MCP configuration for manual import.                                                                         |
| `pdo connect --url`                            | Output the CC Switch import link without opening an application.                                                                    |
| `pdo projects`                                 | List registered project names, paths and origins.                                                                                   |
| `pdo status`                                   | Check the local bridge; does not verify model credentials or provider availability.                                                 |
| `pdo upgrade`                                  | Download and verify the latest stable release, refuse pending/running work, and switch the background installation.                 |
| `pdo install`                                  | Install macOS login startup from this CLI installation and wait for the bridge to become ready. Normally handled by the installer.  |
| `pdo uninstall`                                | Stop and remove login startup while retaining pairings, project bindings, task history and CLI launchers. Stops active local tasks. |
| `pdo serve`                                    | Run the bridge in the foreground. Use when no background bridge is running; stop with Ctrl+C.                                       |
| `pdo help`                                     | Show CLI help; aliases: `-h`, `--help`.                                                                                             |
| `pdo version`                                  | Print the installed CLI version; aliases: `-v`, `--version`.                                                                        |

## Updates

From v0.2.0 onward:

```sh
pdo upgrade
pdo version
pdo extension
```

Finish or cancel pending tasks before upgrading. The updater verifies downloads before switching services and attempts to restore the previous service if the new setup fails. An already-current installation is left unchanged. Pairing, project bindings and task history are preserved.

After an upgrade, load the extension from the **new directory** shown by `pdo extension`; an old unpacked extension still points to its old directory. If Chrome shows both versions, disable/remove the older one after the new version works. Version directories remain on disk; do not delete a directory still used by your bridge or extension.

For v0.1.0, first finish tasks, then update once with:

```sh
pdo uninstall
curl -fsSL https://github.com/itscyrus-dev/PointDOM/releases/latest/download/install.sh | sh
```

## Troubleshooting

| Symptom                               | What to check                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pdo: command not found`              | Set PATH as above, or use `~/.local/bin/pdo`.                                                                                         |
| `pdo extension` is an unknown command | Upgrade to v0.2.1 or later.                                                                                                           |
| Chrome/Finder does not open           | Run `pdo extension --path` and load that folder manually at `chrome://extensions`.                                                    |
| The extension is disconnected         | Run `pdo status`, then pair the extension if necessary.                                                                               |
| No matching project                   | Run `pdo link --origin` with the exact origin used in Chrome, including the port.                                                     |
| MCP task stays awaiting claim         | Choose Other Agent (MCP), confirm CC Switch enabled the server for the correct app, restart the agent and ask it to process the task. |
| Model execution fails                 | Check your selected agent's model/provider settings and usage allowance. A ready bridge alone does not verify model execution.        |
| Upgrade is blocked                    | Finish or cancel queued/running tasks and retry. External MCP operations must also be stopped in their host application when needed.  |

## Scope and local data

The service listens only on `127.0.0.1:4318`. State is kept under `~/.pagepatch`; installed versions live under `~/.local/share/pointdom/versions`. Selected DOM context is provided to your agent under its own model configuration. PointDOM does not start your app, deploy it, or roll back files when a task is stopped. Avoid concurrent edits to the same files by different agents.

## Documentation

[Installation and updates](docs/INSTALL_AGENT.md) · [Other agents / MCP](docs/MCP.md) · [Development](docs/DEVELOPMENT.md) · [Contributing](CONTRIBUTING.md) · [Releases](docs/RELEASING.md) · [Security](SECURITY.md)

MIT licensed. Contribute through a new branch and pull request.
