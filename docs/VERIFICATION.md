# 验证记录

2026-10-14，本机 Node 24.13.0 / pnpm 10.34.7。

- TypeScript 严格类型检查通过。
- 4 个自动测试通过：HTTP 配对与 origin/目录约束；队列串行/幂等/确认/取消/持久化；重启中断恢复；真实 stdio JSONL 传输与连续审批请求。
- Playwright 使用隔离 Chromium profile 加载实际构建扩展，通过点选网页元素、桥接提交和任务结果显示；确认点选未误触网页按钮。该测试使用模拟 Codex runner，不消耗模型额度。
- 另用真实 Codex App Server 完成独立临时目录中的 CSS 修改，将按钮高度由 32px 改到 40px 并读取文件验证。没有修改业务项目。
- 实际扩展侧边栏布局截图：extension-test.png。测试将 panel.html 作为扩展页加载，点击操作通过 DOM 事件模拟侧边栏，因为普通测试 tab 的激活行为不同；仍需用户首次加载时确认 Chrome 原生侧边栏入口与 activeTab 授权。

未覆盖：Chrome 商店发布、Windows/Linux 实机、跨域 iframe/封闭 Shadow DOM、自动启动服务、远程多人使用、Codex 桌面聊天同步。
