# Contributing

Start every change on a separate `codex/` branch and keep each pull request focused on one problem. Open a PR to `main`; never commit or push directly to `main`, force-push it, or bypass its rules. Merge only after the required `verify` check passes and the branch is up to date. Merged feature branches are deleted automatically. Read [AGENTS.md](AGENTS.md) and [DESIGN.md](DESIGN.md) before making changes. Preserve other contributors' uncommitted work.

Use Conventional Commits: `type(scope): description`. Types include `feat`, `fix`, `docs`, `test`, `refactor` and `chore`. Optional scopes include `extension`, `bridge`, `protocol` and `design`. For example: `fix(extension): preserve selection when reopening panel`.

Describe the concrete problem, resulting behavior, validation and limitations in your pull request. Document compatibility changes to protocols and storage. Include isolated test screenshots for UI changes without private content. Do not commit build output, browser profiles, pairing codes, API keys or state from `~/.pagepatch`.

The default README, detailed repository guides, issue templates and generated MCP/context guidance are English. `README.zh-CN.md` is the supported Simplified Chinese translation; keep its commands, requirements and capability descriptions aligned with `README.md`. Language-navigation labels may be localized. Product UI remains Simplified Chinese/English, and original user/page content must not be translated as a side effect of changing UI language. Follow the [documentation map](README.md#development-and-contributing): keep onboarding in the installation runbook and host-specific details in `docs/agents`, rather than duplicating long instructions across pages.

## Validation

Run:

```sh
pnpm format:check
pnpm check
```

For changes to the extension/bridge workflow, also run `pnpm test:e2e`. Browser tests use an isolated bridge port and temporary extension copy, so you do not need to stop a running bridge. The fixture site still requires port 5175.

For installer or packaging changes, also run:

```sh
sh -n install.sh
pnpm release:pack
pnpm release:verify
```

`pnpm test:opencode` is an optional local check using the real OpenCode CLI with a local mock model and no paid model calls. CI does not install or authenticate user model accounts. Tests that call paid models are not part of default CI.

## Community and Releases

By contributing, you confirm that you have the right to provide your changes and agree to distribute them under the project's MIT license. Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security concerns privately according to [SECURITY.md](SECURITY.md); use GitHub issue templates for ordinary bugs and feature requests.

See [docs/RELEASING.md](docs/RELEASING.md) for the release process.
