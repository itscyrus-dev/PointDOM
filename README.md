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

Download the installer and Chrome extension ZIP from [Releases](https://github.com/itscyrus-dev/PointDOM/releases/latest).

| Platform    | Download       | Architecture       |
| ----------- | -------------- | ------------------ |
| macOS 12+   | DMG            | Apple Silicon only |
| Windows 10+ | Setup EXE      | x64                |
| Linux       | DEB / AppImage | x64, WebKitGTK 4.1 |

Installers are unsigned; macOS builds are not notarized. Intel Macs are not supported.
For upgrades from 0.5, quit the old service before starting 0.6. Projects, pairing and
history are preserved with a private backup; interrupted tasks are never replayed.

## Use

1. Open PointDOM. Extract the extension ZIP, enable Developer mode at `chrome://extensions`, and choose **Load unpacked**. Approve the Chrome connection in the app.
2. Start your development server. On macOS, open the side panel and choose **Bind project**; confirm its verified source folder. Windows/Linux use **Settings → Advanced** to add the folder and address manually. Grant only the linked page's Chrome permission.
3. Configure your client from **Clients**. Connect its universal MCP entry and bind the exact project. Generic MCP clients receive tasks while listening; explicitly authorized Codex desktop conversations can receive notifications on macOS.
4. Select page elements, add an overall request or element notes, choose the MCP recipient and submit. Inspect progress, reports and cancellation from the task list.

The app uses Tauri 2, Rust, React and HeroUI 3. Installed builds contain no Electron
or Node runtime and never launch model CLIs. Client reports are not independent
verification. Automatic source discovery and Codex desktop notifications are currently
macOS-only; generic MCP listening works on all three platforms.

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
