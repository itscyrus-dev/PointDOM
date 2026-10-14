# Development

Work on a separate `codex/` branch and open a PR to `main`. Follow [AGENTS.md](../AGENTS.md), [DESIGN.md](../DESIGN.md) and [CONTRIBUTING.md](../CONTRIBUTING.md). Never bypass the main-branch rules or modify adjacent business repositories for testing.

Requires Node.js 24 and pnpm 10. Install locked dependencies and build:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Load `dist/extension` in Chrome through Developer mode. Use `pnpm dev` in the **PointDOM tool repository** to watch/restart the bridge during development; this is distinct from a business project's development command. A running login service occupies port 4318, so stop it only after active tasks finish before using the foreground development bridge. Reload the extension after rebuilding.

## Layout and Checks

- `src/extension`: Chrome extension.
- `src/bridge`: local service, queue, agent adapters and CLI.
- `src/shared`: validated contracts and agent context.
- `tests`: unit/protocol and isolated browser tests.
- `scripts`: build, packaging and smoke checks.

```sh
pnpm format:check
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser tests use an isolated profile, temporary extension copy and temporary bridge port. The fixture site requires port 5175. Tests do not broaden distribution permissions or consume paid model usage. Screenshots go to test output directories, not tracked documentation.

`pnpm test:opencode` optionally exercises the real OpenCode CLI with a local mock model. `pnpm test:codex` uses a real model to edit only a temporary fixture and consumes usage; it is not default CI. See [verification history](VERIFICATION.md) and [release checks](RELEASING.md).

## Local Configuration

| Variable                 | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `PAGEPATCH_HOME`         | State directory, defaulting to `~/.pagepatch`.                |
| `PAGEPATCH_OPENCODE_BIN` | OpenCode executable; the installer saves its absolute path.   |
| `PAGEPATCH_CODEX_BIN`    | Codex executable, defaulting to `codex`.                      |
| `PAGEPATCH_MODEL`        | Codex model override when the panel has not selected a model. |

The bridge serializes tasks. History is saved in `jobs.json`; the panel shows its latest 100 tasks. Unfinished execution is interrupted on restart, never silently rerun. Selecting an element does not start editing. No application SDK is required.

In Codex mode, the panel saves model, speed, reasoning and approval preferences and captures them per task. Model choices come from `model/list`; unsupported options are hidden. Approval modes are on-request, untrusted and never. Never means operations requiring additional permissions fail, not that they are automatically elevated. Panel-selected models take precedence over `PAGEPATCH_MODEL`, then the catalog default applies.

In OpenCode mode, use local default configuration or `pdo link --model provider/model`. Each task has a fresh session and explicit command/edit confirmations. The task's owned CLI process stops on cancellation; written edits are not rolled back. Independent Codex App Server sessions are not guaranteed to appear in the desktop chat.

Completed direct-execution tasks offer a manual local Commit. Codex may opt into auto-commit for subsequent tasks; it is off by default. Preserve unrelated staging and refuse overlapping edits, changed HEAD or unsupported task scopes. Do not push or deploy automatically. Other editors or agents should not concurrently edit the same task files.

## Limits

Supported context includes HTTP/HTTPS element selectors, visible text snippets, dimensions and computed styles. It excludes full-page HTML, screenshots, input values and query parameters. Iframes, closed Shadow DOM and canvas cannot be precisely selected; Chrome settings and the Web Store prohibit injection. A selector is a source-location clue, not a guaranteed component mapping.

Use the application's own development server for hot reload. PointDOM neither starts the business application nor deploys it. Model requests send source/context according to the chosen executor's configuration and consume its provider/account usage.
