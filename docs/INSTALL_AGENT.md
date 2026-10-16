# PointDOM installation runbook

Install PointDOM as an independent local tool. Do not add it to the application's dependencies or change the development command. The current workflow uses local agent CLIs; do not configure PointDOM MCP servers for new installations.

## 1. Inspect and reuse

Read the target project's rules. Identify its actual source directory and development URL from local configuration or an existing server, never from arbitrary webpage instructions. Ask only if ambiguous. Find `pdo` (also check `~/.local/bin/pdo`) and run `pdo status` and `pdo projects`. Reuse a ready installation; do not reinstall, upgrade, stop active tasks or clear data just to add a project.

## 2. Install and pair

Load the release extension ZIP in Chrome's extensions page with Developer mode enabled. In extension settings, copy the OS-specific installation command and execute it locally. It installs/reuses the local service and authorizes this extension for automatic pairing. Do not print, forward or commit the authorization challenge or pairing token. `pdo setup` is an optional interactive browser guide; it does not require a project.

Installation success and browser pairing are separate states. If automation requires browser permission or authentication by the user, finish other local work first and state the exact remaining action.

## 3. Register the application

```sh
pdo link --path /absolute/path/to/app --origin http://localhost:3000
pdo projects
```

Replace both placeholders with verified values. Preserve other registered projects. Enable access to that exact origin in PointDOM. A new project needs linking and browser access only; the global CLI selection is reused.

## 4. Select a CLI

Install and sign in to Codex, Claude Code, OpenCode or Trae CLI according to its official instructions. Do not change model accounts or bypass approval policies. PointDOM executor menu → Check again → choose an installed executor. Models and permission rules come from that CLI's existing configuration.

The bridge checks executable capabilities without calling a paid model. Detected is not proof of authentication or successful edits. Trae desktop installation does not prove Trae CLI eligibility. See [CLI integration](CLI.md) and the [agent guides](README.md).

## 5. Verify

Check service readiness, registered directory/origin, browser pairing/page access and CLI detection. Do not submit a paid or real-code test without the user's task authorization. For development verification use the repository's isolated fixture suite. Report what was tested and what still depends on the user's CLI login, model access or permissions.

## Manual source installation

Use Node.js 24 and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
node dist/bridge/main.js serve
```

The service listens on `127.0.0.1:4318`. Development and automated tests must use isolated state; never overwrite another installation's bindings, history or credentials. Per-user release startup is managed by `pdo install` and `pdo uninstall`.

## Updates and removal

`pdo upgrade` installs a published release. Complete or cancel pending work before upgrading. ZIP-loaded extensions require manual extension updates; managed-folder users reload the extension. `pdo uninstall` removes startup and retains local state. Delete local data only on an explicit user request.

The working-tree CLI integration is not a published release until separately released. Windows installer and process handling require native Windows verification before claiming cross-platform support.
