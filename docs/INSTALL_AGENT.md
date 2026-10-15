# Installation and Agent Setup

PointDOM connects a Chrome extension to your local OpenCode CLI through an authenticated loopback bridge. A desktop OpenCode application, an open TUI and manual MCP task claims are not required.

## Install from a Release (macOS)

Install and configure OpenCode CLI first, then run:

```sh
curl -fsSL https://github.com/itscyrus-dev/PointDOM/releases/latest/download/install.sh | sh
```

The installer downloads prebuilt CLI/extension files and verifies SHA-256 hashes. No pnpm or source build is required. If Node.js 24+ is unavailable, it installs a private runtime under `~/.local/share/pointdom/runtime`. Application versions are stored under `~/.local/share/pointdom/versions`.

The installer shows four progress steps followed by three setup actions: load the extension, pair it, and link a project. All installer and service-setup messages are in English. If `~/.local/bin` is missing from PATH, it prints a command for the current terminal and a persistent setting for your detected shell (zsh or bash). If PATH is already configured, those instructions are omitted. Output is plain when redirected; terminal colors respect `NO_COLOR`. The installer does not modify shell profiles automatically, overwrite an existing installation or stop active tasks. Use `pdo help` for commands and `pdo version` to check the installed version. `pointdom` remains a compatibility alias.

To pin a version, use that release's installer URL:

```sh
curl -fsSL https://github.com/itscyrus-dev/PointDOM/releases/download/v0.1.0/install.sh | sh
```

Published installers download their own tagged package. `POINTDOM_RELEASE_BASE_URL` can override the asset source for testing.

## Chrome Setup

1. Run `pdo extension`. On macOS, it requests the Chrome extensions page and extension folder in Finder, and copies the folder path to your clipboard. Enable Developer mode, click Load unpacked, press Cmd+Shift+G and paste the path. Select the folder to load it. The extension currently appears as PagePatch. If Chrome/Finder/clipboard access fails, follow the printed manual steps. Other platforms print manual instructions. Use `pdo extension --path` to print the path without opening apps or changing the clipboard; it works without a running bridge or project binding.
2. Run `pdo pair` locally and copy the pairing code into the extension's connection settings. Do not send the code to an agent, chat, issue or repository.
3. Open your development page, authorize access to the current site and choose OpenCode CLI in execution settings. New installations default to this mode; existing executor preferences are preserved.

Chrome requires manual confirmation to load an unpacked extension; the command does not change browser profiles, enable Developer mode, or claim installation succeeded. After upgrading, run `pdo extension` again to locate the extension shipped with the CLI you are using. There is no Chrome Web Store package.

## Use CC Switch for MCP

If you already manage OpenCode through CC Switch, run this once from your project directory:

```sh
pdo connect --origin http://localhost:5173
```

Confirm the MCP import in CC Switch and restart OpenCode. In the extension choose **Other Agent (MCP)**, submit a request, and ask OpenCode to process the pending PagePatch tasks. No manual JSON editing is required. This is separate from the direct OpenCode CLI mode below. See the [MCP guide](MCP.md) for fallback imports and other applications.

## Link Each Project Once

From the source directory:

```sh
pdo link --origin http://localhost:5173
```

The CLI uses the current directory and its name. Repeating the command updates that project's binding instead of creating a duplicate. Registration works while the bridge is running.

To specify a model, use an ID available in your OpenCode configuration:

```sh
pdo link --origin http://localhost:5173 --model provider/model
```

Run the project's usual `pnpm dev`, open the page, select elements, enter descriptions and send. The bridge starts `opencode serve` in the linked directory for each task and closes it afterward. Confirm permissions in the extension; they are not approved automatically. Model configuration and credentials stay in OpenCode or CC Switch. The integration was validated with OpenCode CLI 1.18.29 and requires its session, permission/question and event APIs.

Origins include the port. `localhost` and `127.0.0.1` are different origins. If an origin is reused by multiple projects, the extension requires an explicit choice.

## Status, Updates and Removal

```sh
pdo status
pdo projects
pdo upgrade
pdo uninstall
```

Verify the service is online, the extension is paired, the site is authorized, the origin matches and OpenCode CLI is selected. A ready bridge does not prove that a model/provider call will succeed; check OpenCode's model settings and usage allowance when execution fails.

To update from v0.2.0 onward, run `pdo upgrade`. It downloads and verifies the latest stable installer and package before stopping the service. Pending/running tasks block the upgrade; new submissions are briefly paused during the switch. If service setup fails, it attempts to restore the previous installation. Then reload the extension from the newly printed directory. If you are still on v0.1.0, wait for tasks to finish, run `pdo uninstall`, and rerun the release installer once. Uninstalling stops active tasks but preserves pairing, project bindings, history and CLI launchers. Old version directories remain; remove them only after checking that no installed service references them.

The login service uses absolute executable paths. Moving a source installation or replacing its Node executable requires reinstalling it. On macOS, installation creates:

- `~/.local/bin/pdo` and the compatibility launcher `pointdom`.
- `~/Library/LaunchAgents/dev.pointdom.bridge.plist` for login startup and restart, listening only on `127.0.0.1:4318`.
- Permission-restricted state under `~/.pagepatch`. Installer files do not contain model keys.

## Source Installation

Requires Node.js 24+, pnpm 10+, Chrome 120+ and a configured OpenCode CLI. Clone into an independent tool directory, not a business repository:

```sh
git clone https://github.com/itscyrus-dev/PointDOM.git
cd PointDOM
node scripts/setup.mjs --name my-app \
  --project /absolute/path/to/my-app \
  --origin http://localhost:5173
```

This installs locked dependencies, builds the tool, installs macOS login startup, waits for readiness and links the project. Use only once; additional projects use `pdo link`.

For source updates, stop the login service after tasks finish, then run from the tool repository:

```sh
pnpm install --frozen-lockfile
pnpm build
node dist/bridge/main.js install
```

Automatic installation/startup supports macOS. For other platforms, build from source, register the project and keep the manual bridge running:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm cli project add --name my-app \
  --path /absolute/path/to/my-app \
  --origin http://localhost:5173
pnpm start
```

In another tool-repository terminal, run `pnpm cli pair`. Model authentication remains in the selected executor's configuration. Codex execution also requires an installed, authenticated Codex CLI. There is no npm installation package.

## Ask an Agent to Set Up PointDOM

Replace the example path and origin before sending:

> Install https://github.com/itscyrus-dev/PointDOM for my local OpenCode CLI. Read docs/INSTALL_AGENT.md and AGENTS.md first. My project is `/absolute/path/to/my-app`, served at `http://localhost:5173`. Install the tool independently and link the project without changing its development command or dependencies. Tell me the extension's absolute directory and remaining browser steps. Preserve existing bindings and tasks, do not interrupt active edits, do not commit/publish code, and do not read or forward pairing codes or API keys.

Do not claim model execution was verified unless it actually was. Agents that prefer manual MCP claims can use the separate [MCP guide](MCP.md).
