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

## Quick start

Requires **macOS**, **Chrome 120+**, and a configured **OpenCode CLI**.

```sh
curl -fsSL https://github.com/itscyrus-dev/PointDOM/releases/latest/download/install.sh | sh
```

Follow the installer's PATH instructions, then:

1. In `chrome://extensions`, enable **Developer mode** and **Load unpacked** from the printed extension directory.
2. Open the extension (currently named **PagePatch**), run `pdo pair`, and paste the code into its settings.
3. Grant access to your development site and select **OpenCode CLI**.

Link each project once from its directory:

```sh
pdo link --origin http://localhost:5173
pnpm dev
```

Open your app, select elements, describe a change, and send. The background service runs tasks automatically; review permission requests and results in the extension. Use `pdo help` for commands.

## Documentation

[Installation and updates](docs/INSTALL_AGENT.md) · [Other agents / MCP](docs/MCP.md) · [Development](docs/DEVELOPMENT.md) · [Contributing](CONTRIBUTING.md) · [Releases](docs/RELEASING.md) · [Security](SECURITY.md)

MIT licensed. Contribute through a new branch and pull request.
