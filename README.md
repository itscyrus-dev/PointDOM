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

PointDOM sends browser change requests to a local coding CLI or your coding client through MCP listening. Select an element, describe the change and submit. Follow actual execution records and reported results in the panel.

## Quick start

1. Install `pointdom-extension.zip` from a release: enable Developer mode at `chrome://extensions` and drag in the ZIP.
2. Open extension settings. Copy the local-service installation command and run it in your terminal; pairing completes automatically.
3. Install and sign in to a supported CLI, or configure your client using **Settings → Copy MCP configuration**.
4. In your source directory run `pdo link --origin http://localhost:3000`, replacing the URL with your actual development origin.
5. Open that page, enable page access in PointDOM, choose an executor, select elements and submit. Execution records and results appear in the annotation card.

## Supported tools

[Codex](docs/agents/CODEX.md) · [Claude Code](docs/agents/CLAUDE_CODE.md) · [OpenCode](docs/agents/OPENCODE.md) · [Trae](docs/agents/TRAE.md)

Install and sign in to a CLI, then select it beside Submit. The menu shows detected tools only; use Check again after installation. Your selection is shared across projects. Configure your account, model and permissions in that CLI.

Prefer an existing client conversation? Choose **MCP listening**, send **Copy watch instruction** to that conversation once, then select its connection. While the agent keeps waiting, browser submissions are claimed, executed and reported without another message per task. New work requires a real pending wait or an already-running assigned task. If the host ends the turn or disconnects, monitoring stops; MCP cannot wake an idle client. See [MCP listening](docs/MCP.md).

Tasks execute in order within each project. You can stop a task; a service restart does not replay unfinished work. Inspect partial changes before resubmitting a failed task.

## Projects and updates

Link each new source directory with `pdo link --origin URL`; no per-project agent configuration is needed. Start your development server before opening the linked page.

Release installation requires Chrome 120+ and Node.js 24 (the installer supplies a runtime when needed). macOS is the locally verified platform; Windows installation and CLI path handling still require native Windows verification. `pdo upgrade` updates the local service; ZIP-installed extensions need manual updates. This README describes the working tree, not necessarily the latest published release.

## Documentation and contributing

[Installation](docs/INSTALL_AGENT.md) · [CLI integration](docs/CLI.md) · [MCP listening](docs/MCP.md) · [Verification](docs/VERIFICATION.md) · [Development](docs/DEVELOPMENT.md) · [Design](DESIGN.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

Development requires Node.js 24 and the pnpm version pinned in package.json. Run `pnpm check`, `pnpm test:e2e` and `pnpm format:check`. Tests use isolated CLI fixtures, native stdio MCP clients and temporary projects, never paid models or real agent conversations.

## License

[MIT](LICENSE). Release packages include third-party notices. See [Changelog](CHANGELOG.md).
