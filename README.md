<p align="center"><img src="docs/assets/pointdom.svg" alt="PointDOM blue logo" width="72" /></p>
<h1 align="center">PointDOM</h1>
<p align="center">Browser annotations. Your coding client.</p>
<p align="center"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>
<p align="center">
<a href="https://github.com/itscyrus-dev/PointDOM/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/itscyrus-dev/PointDOM/actions/workflows/ci.yml/badge.svg" /></a>
<a href="https://github.com/itscyrus-dev/PointDOM/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/itscyrus-dev/PointDOM" /></a>
<img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8D8" />
<img alt="Rust" src="https://img.shields.io/badge/Rust-2024-DEA584" />
<img alt="HeroUI 3" src="https://img.shields.io/badge/HeroUI-3-18181B" />
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-green" /></a>
</p>

PointDOM turns browser annotations into tasks for your MCP coding client. Select one
or more elements, describe the change and follow actual progress in the Chrome side
panel or desktop task list. Your client owns source edits, accounts and permissions.

## Install

Download the macOS application DMG and `pointdom-extension-<version>.zip` from [Releases](https://github.com/itscyrus-dev/PointDOM/releases/latest).

| Platform  | Download | Architecture       |
| --------- | -------- | ------------------ |
| macOS 12+ | DMG      | Apple Silicon only |

Installers are unsigned; macOS builds are not notarized. Intel Macs are not supported.
For upgrades from 0.5, quit the old service before starting 0.6. Projects, pairing and
history are preserved with a private backup; interrupted tasks are never replayed.

For this upgrade, refresh the Codex configuration in **Clients** once and restart
its PointDOM MCP server if live reload is unavailable. This loads the updated tool
contract; it is not required after each task.

## Use

1. Install and open PointDOM. Load the bundled extension folder or extracted release extension ZIP at `chrome://extensions` with Developer mode enabled. In the extension, click **Connect automatically** and allow the connection in the app once.
2. Start your local project and open its page. Click **Bind project** in the extension, then confirm **Bind and configure Codex** in the app. PointDOM verifies the source folder, saves the Codex MCP configuration and requests a live reload. If Codex cannot reload, enable PointDOM and click Restart in Codex MCP servers. Grant Chrome access only to the linked page.
3. In the app, click **Connect** on the project, select a matching Codex conversation and confirm **Authorize connection**. PointDOM verifies its workspace again and synchronizes this explicit choice to the extension. No instruction needs to be copied. The extension can also open this chooser with **Choose Codex conversation**.
4. Return to the extension, select page elements, describe the change and submit. New annotations wake the authorized Codex conversation; each task ends after reporting. Authorization survives idle MCP disconnection and app restart. Interrupted tasks are never replayed.

Other MCP clients use the universal configuration in **Clients** and receive tasks while listening. The extension's recipient menu lists only conversations that can receive work; it never merges recipients by name. An explicit App authorization selects the recipient once; later manual extension choices remain until you authorize a new App selection. Pending submission retries retain their original recipient.

The app uses Tauri 2, Rust, React and HeroUI 3. Installed builds contain no Electron
or Node runtime and never launch model CLIs. Client reports are not independent
verification. PointDOM currently supports macOS on Apple Silicon, including source discovery,
Codex desktop notifications and generic MCP listening.

## Develop

Install [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), the Rust toolchain
in `rust-toolchain.toml`, Node 24 and the pinned pnpm version.

```sh
pnpm install --frozen-lockfile
pnpm desktop:dev
# Build the native installer for your platform:
pnpm desktop:pack
```

Builds do not replace installed apps or running services. See [Contributing](CONTRIBUTING.md)
for checks and isolated fixtures, and [Release procedure](docs/RELEASING.md) for packaging.

[Desktop setup and architecture](docs/DESKTOP.md) · [MCP protocol](docs/MCP.md) · [Security](SECURITY.md) · [MIT license](LICENSE)
