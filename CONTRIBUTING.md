# 协作与提交

使用独立分支，一个 PR 聚焦一个问题。先读 AGENTS.md 和 DESIGN.md，保留他人尚未提交的改动。

提交格式：`type(scope): description`。类型使用 feat、fix、docs、test、refactor、chore；scope 可选 extension、bridge、protocol、design。例如 `fix(extension): preserve selection when reopening panel`。

PR 说明写清问题、最终行为、验证和限制。协议与存储变更注明兼容性；UI 变更附隔离测试截图，不提交含用户隐私的页面截图。不要提交 dist、profile、配对码或 ~/.pagepatch 状态。

运行 `pnpm format:check`、`pnpm check`。涉及扩展到服务链路时运行 `pnpm test:e2e`；测试前停止已运行的本地桥接服务以释放端口 4318。真实模型 smoke test 不默认在 CI 执行。
