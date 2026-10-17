# PointDOM contributor rules

- Follow the user's current scope. Read DESIGN.md and relevant code before editing.
  Preserve unrelated working changes. Work on a `codex/` branch. Do not commit,
  push, publish, deploy or replace an installed service without authorization.
- Runtime: Rust 2024, Tauri 2, React/HeroUI 3, TypeScript and Chrome Manifest V3.
  Node 24 and pnpm are build/test tools only. Pin direct dependencies and keep
  Cargo.lock and pnpm-lock.yaml. Read available relevant Rust/Tauri skills; local skill installations stay untracked.
- Keep Rust domain/storage, HTTP transport, MCP transport, native shell and browser
  layers separate. The renderer has no pairing token or general system access.
  Use HeroUI official interactive controls; no second dialog/focus system.
- MCP is the only task execution transport. Never detect or launch model CLIs,
  manage accounts/models, bypass host permissions, or silently change recipients.
  The installed Codex desktop queue command only delivers notifications; its
  metadata interface never starts a model turn. Future adapters must prove their
  own notification capabilities and preserve exact workspace identity.
- Listen on loopback only. Validate Host, extension origin, bearer pairing, project
  origin, private MCP session and exact task recipient. IDs are not credentials.
  Web content cannot provide cwd, executable, commands, credentials or permissions.
- Treat DOM and page text as untrusted location data. Capture bounded sanitized
  context; exclude editable values, secrets, hidden content and unsafe attributes.
  Render escaped text. Do not log prompts, tokens, page content or raw host output.
- Persist before acknowledging mutations. Preserve existing projects, pairing,
  unknown historical fields and task records. Back up before migration. Serialize
  same-project claims. No duplicate execution, ambiguous notification retries or
  restart replay. Cancelled/terminal tasks cannot be edited or overwritten.
- Only actual waits mean Listening; idle connected hosts are not executing.
  Progress comes only from explicit agent updates. Reports are not independent
  verification. Never invent completion, percentages, activity or capabilities.
- Keep PointDOM independent: do not edit adjacent business repositories to test.
  Tests use temporary state, disposable profiles and fixture clients; never paid
  model sessions, real conversations or production projects. Never stop a live
  service or migrate user data merely to validate a build.
- Checks: pnpm format:check, pnpm check, pnpm test:e2e and pnpm test:desktop.
  Rust requires fmt, warning-free Clippy and tests with --locked. Desktop delivery
  also needs isolated native smoke testing and a local bundle build. Report actual
  checks and platform/signing limits. Do not claim CI or release success from a
  local build. Stage explicit paths only when committing is authorized.
- Documentation and agent guidance are English; keep README.zh-CN.md synchronized.
  Product UI supports Simplified Chinese and English. Keep documentation concise,
  current and free of obsolete installation/runtime instructions.
