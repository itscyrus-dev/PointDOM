# Native desktop application

For installation and the first annotation, start with the [quickstart](../README.md#get-started).
This guide covers development, native behavior and architecture.

The macOS app uses Tauri 2, Rust, React and HeroUI 3. Node 24 and pnpm are build tools.
The browser extension delivers annotation tasks through MCP; the selected coding
client executes them. Historical task records remain readable.

## Build and run

Prerequisites: the Rust toolchain pinned in `rust-toolchain.toml`, Node 24, the pinned pnpm version, and the macOS
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). macOS requires Xcode
Command Line Tools. Versions are locked in Cargo.lock and pnpm-lock.yaml.

```sh
pnpm install --frozen-lockfile
pnpm desktop:dev
# Local unsigned macOS installer:
pnpm desktop:pack
```

The native service and MCP executable is `target/release/pointdom`; the desktop
bundle is produced under `target/release/bundle`. No installed application or live
service is replaced by these commands. Signing, notarization and release publishing
require separate authorization and credentials.

## Everyday workflow

- **Tasks:** filter by project and active status, inspect actual agent progress and
  final reports. Reports are provided by the executing client, not independent proof.
- **Projects:** start your development server normally, then confirm the discovered
  source directory and website once in the app. Ports update without rebinding.
  **Open website** uses a current verified address. Manual setup is in Settings >
  Advanced. Select the intended matching Codex conversation using **Connect** and approve the native **Authorize connection** dialog.
  Binding from the extension offers **Bind and configure Codex** in the native
  confirmation: save MCP configuration and request a reload, then open the native
  conversation chooser. Project binding alone does not authorize or choose a conversation.
  A separate native confirmation revalidates the chosen workspace, persists a wakeable
  target and synchronizes an explicit selection revision to the extension. It creates
  no model turn or MCP task access; a later notification supplies private restoration proof.
- **Clients:** configure Codex MCP explicitly, or copy universal stdio configuration
  into another MCP host. Settings and comments are retained and a private backup is
  created before changing Codex configuration. Conflicting remote entries are refused.
- **Settings:** install the unpacked Chrome extension, its first installation opens discovery automatically. Approve the pending Chrome
  connection in the app. No project, MCP or pairing-code entry is needed in the extension. Page access still requires
  an explicit Chrome permission grant. Appearance groups theme, language selection
  and “Show menu bar icon”. This switch controls the top menu-bar icon and is saved
  in `desktop-settings.json` in the state directory. The Dock remains available to
  reopen the main window when the menu-bar icon is hidden.

The main window and menu-bar panel share the saved light/dark/system theme.
Theme changes synchronize between windows and are refreshed on focus or visibility.

The menu bar icon opens a compact task panel. Click a task to inspect it in the main
window. Right-click provides navigation and Quit in the selected language. Running tasks animate the menu icon and
cards; queued, disconnected and completed states do not animate. System reduced
motion disables animation. Closing a window hides it without stopping the service.
Explicit Quit confirms when tasks are pending and interrupts owned work without
replaying it. Cancelling an annotation persists cancellation immediately and, where
supported, notifies its original Codex conversation. Notification delivery does not
prove the external turn stopped; stop it in the client when necessary.

## Migration and storage

The native service uses the existing `~/.pagepatch` directory (`PAGEPATCH_HOME` may
select isolated state). Project IDs, pairing token, clients, task records and unknown
historical fields are preserved. A private `native-migration-v1` snapshot precedes
migration. Existing non-MCP execution preferences become MCP; unfinished owned work
is interrupted, never replayed. A file lock excludes other native writers. File data is flushed before atomic replacement. Unix additionally flushes parent
directories and sets private modes on macOS.

Quit the previous service before starting the native app. A busy port fails visibly;
the application never kills an unrelated process or writes migration data while it
cannot bind. Reconnect retries binding the same port; it shows a pending state,
reports a continuing conflict explicitly, and confirms success only after reading a
connected native snapshot. Default loopback port is 4318. `POINTDOM_PORT` is a trusted local override
for isolated tests; extensions and MCP configuration must use the matching port.

## Architecture and future clients

- `crates/pointdom-core`: domain operations, storage, loopback API, MCP stdio transport,
  and client notification adapters.
- `crates/pointdom-cli`: native administrative/service and MCP entry point.
- `src-tauri`: native windows, menu bar, dialogs, deep links, permissions and lifecycle.
- `src/desktop`: React/HeroUI main window and task panel; native IPC only, no bearer token.
- `src/extension`: existing picker, sanitized DOM capture, MCP recipient selection and history.

Every MCP host can bind multiple projects, listen, claim, append progress and report.
Only actual pending waits count as listening. Generic MCP does not wake idle hosts.
The Codex adapter separately verifies its exact saved conversation workspace using the
installed app's metadata interface and sends a bounded task notification through its
queue command. It never starts an exec/resume turn or changes the user's model,
permissions or accounts. Other clients can add a notification adapter under
`crates/pointdom-core/src/clients.rs`; until implemented, they use ordinary listening.
No capability is inferred merely from an installed application name.

Tauri's main window has setup permissions; the menu-bar window only has task actions.
Neither grants a general shell, filesystem or remote IPC capability. CSP blocks remote
scripts and network access from the renderer. Deep links require exact syntax and a
native user confirmation; neither a webpage nor extension can authorize itself.
The `pointdom://bind` link accepts exactly one HTTP(S) origin proposal, never source
paths, commands or page content. Cancelling either native dialog leaves projects
unchanged. Binding does not grant Chrome page access or select an MCP recipient.

## Verification

```sh
pnpm check
pnpm test:e2e
pnpm test:desktop
pnpm desktop:pack
```

Native tests cover authorization, ownership, serialization, cancellation, idempotency,
write failures, restart recovery and migration. `native-mcp.spec.ts` uses the real Rust
binary, an independent MCP SDK client and a temporary Chrome profile. Desktop browser
QA uses supplied fixture state through the IPC boundary; it does not claim native OS
integration coverage. Native macOS window/tray lifecycle is smoke-tested separately.
Tauri WebDriver does not support macOS. Only Apple Silicon macOS packages are built and released.

## Compact interface

The main window starts at 460 × 640px, with a 400 × 480px minimum. Its height adapts
to the active page within the current monitor work area. HeroUI's top
Tabs replace the sidebar. Task counts use vertically stacked compact rows; selected details and settings
use vertically grouped round cards. The window never scrolls. Task records scroll inside the list; long settings and
details use bounded content regions with hidden scrollbars, leaving navigation and
the connection footer fixed. Project filters remain in Tasks, and form drafts survive
tab switches. Gravity UI icons are built from pinned `@iconify-json/gravity-ui` data
into a small local SVG sprite, with no icon API or CDN requests.

About has its own compact tab: brand, version from the native app binary, and fixed
public project/release/feedback links opened in the system browser. Theme and language
remain in Settings. Subscriptions are future scope: no invented plan, account status,
purchase action or billing backend is shown. Keep this distinct from task execution.

### Codex configuration refresh

Configure saves the MCP entry, then uses the installed desktop CLI's `app-server
proxy` to request `config/mcpServer/reload` on the running host. Only a matching
successful JSON-RPC response confirms reload; it does not prove an MCP connection.
The request is bounded and never starts a daemon, model turn or conversation.
If the host is closed, unsupported or rejects the request, keep the saved config
and direct the user to enable PointDOM and select Restart in Codex MCP servers
settings. Current stdio-only desktop hosts do not expose the proxy control socket;
they require this host-owned step. Saving configuration does not bind a project or
enable conversation wakeup.

### Local development discovery

The macOS observer uses bounded, read-only `lsof` and `ps` calls for the current
user's Node listeners. It requires a recognized development command (Vite, Astro,
Nuxt, webpack-dev-server, or a verified Next dev parent), a canonical working
directory containing package.json, and a bounded loopback HTTP HEAD response.
It rechecks process identity and socket ownership; it does not parse terminal logs,
execute project scripts, read browser-provided paths or launch any model client.

First confirmation persists `localDiscovery` on the existing directory-based project
(or creates its stable ID). Manually recorded loopback origins for that confirmed
project become temporary discovery leases; external manual origins and unknown
historical fields remain intact. Updates do not rename projects, change recipients
or replay tasks. Observed addresses are never saved as permanent permissions. Leases
expire after 12 seconds and are cleared on failed observation. Restart restores
identity but no stale ports. Both the extension allowlist and submission validation
use current effective origins. Localhost and numeric/IPv6 loopback aliases are
accepted only when observed; aliases shared by different source directories are
excluded. A port reused by another project does not inherit its predecessor's binding.

HTTPS-only servers, custom runtimes, containers and forwarded servers require
Advanced manual setup when source ownership cannot be verified.
Discovery never guesses those mappings. `POINTDOM_DISCOVERY_DISABLED=1` disables OS
observation for isolated native UI smoke tests. Debug builds also accept
`POINTDOM_DISCOVERY_TEST_PID` to restrict a native smoke run to one disposable
fixture process; release builds ignore that test selector. Native discovery tests restrict
observation to disposable fixture processes and source directories.

## Supported downloads

Releases contain the macOS 12+ Apple Silicon DMG,
`pointdom-extension-<version>.zip` and SHA-256 manifests. The app also bundles the
extension and native service executable. A separate CLI archive is not distributed.
Intel Macs, Windows and Linux are not supported. Installers are unsigned and not notarized.

Download the DMG and extension ZIP from the same release. Extract the ZIP, then open
`chrome://extensions`, enable Developer mode and load the extracted folder. Follow
the [quickstart](../README.md#get-started) to pair, bind the project and authorize a conversation.
