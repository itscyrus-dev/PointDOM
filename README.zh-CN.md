<p align="center">
  <img src="docs/assets/pointdom.svg" alt="PointDOM 标志" width="80" height="80" />
</p>
<h1 align="center">PointDOM</h1>
<p align="center">选取网页元素，描述修改，让你的编程 Agent 修改源码。</p>
<p align="center">
  <a href="README.md" lang="en">English</a> · <strong>简体中文</strong>
</p>
<p align="center">
  <a href="docs/README.md">文档索引</a> ·
  <a href="https://github.com/itscyrus-dev/PointDOM/releases">版本发布</a> ·
  <a href="https://github.com/itscyrus-dev/PointDOM/issues">问题反馈</a> ·
  <a href="LICENSE">MIT 许可证</a>
</p>

PointDOM 将网页元素和修改描述交给本机编程 CLI，或通过 MCP 监听交给你正在使用的 Agent 客户端，展示实际执行记录和回传结果。

## 快速开始

1. 安装发布包中的 `pointdom-extension.zip`：打开 `chrome://extensions`，启用开发者模式，拖入 ZIP。
2. 打开插件设置，按提示复制本地服务安装命令，在终端执行；完成后自动配对。
3. 安装并登录一个支持的 CLI；使用 Agent 客户端时，在插件“设置 → 复制 MCP 配置”中获取通用配置。
4. 在代码项目目录运行 `pdo link --origin http://localhost:3000`，将 URL 换成真实开发地址。
5. 打开该网页，在插件中启用网页访问，选择执行工具，选取元素并提交。执行记录和结果显示在批注卡片。

### 使用 curl 安装（macOS）

运行以下命令安装最新发布版本并启动本地服务：

```sh
curl -fsSL https://github.com/itscyrus-dev/PointDOM/releases/latest/download/install.sh | sh
```

然后运行 `~/.local/bin/pdo setup` 打开扩展安装向导。加载扩展后，从扩展设置中复制并执行安装命令，授权自动配对。

## 支持的工具

[Codex](docs/agents/CODEX.md) · [Claude Code](docs/agents/CLAUDE_CODE.md) · [OpenCode](docs/agents/OPENCODE.md) · [Trae](docs/agents/TRAE.md)

先在本机安装并登录 CLI，再从提交旁的菜单选择。菜单只显示已检测到的工具；新安装后可点击“重新检测”。选择全局保存，所有项目共用。账号、模型和权限在对应 CLI 中配置。

希望在已有客户端对话中执行？选择 **MCP 监听**，将“复制监听指令”在该对话发送一次，再选择对应连接。Agent 持续等待期间，浏览器提交后会领取、执行并回传，无需每条批注再发消息。只有实际等待或正在执行任务的连接能接收新批注。宿主结束对话轮次或断线后，监听会停止；MCP 不能自行唤醒空闲客户端。详见 [MCP 监听说明](docs/MCP.md)。

同一项目按顺序执行。任务可停止；服务重启后不会自动重跑未完成的任务。失败后请检查已有变更，再重新提交。

## 项目与更新

新增项目在对应源码目录运行 `pdo link --origin 实际网址`，沿用全局执行方式。MCP 通用配置只需添加一次；新项目在客户端绑定工作区并开启监听，再在插件选择接收连接。打开网页前请先启动项目的开发服务。

发布包需要 Chrome 120+ 和 Node.js 24（安装器在需要时提供运行时）。macOS 为本地验证平台；Windows 安装和 CLI 路径处理仍需 Windows 原生验证。`pdo upgrade` 更新本地服务，ZIP 安装的扩展需手动更新。本 README 描述当前源码，尚未发布的修改不会通过升级自动获得。

## 文档与贡献

[安装说明](docs/INSTALL_AGENT.md) · [CLI 说明](docs/CLI.md) · [MCP 监听](docs/MCP.md) · [验证记录](docs/VERIFICATION.md) · [开发](docs/DEVELOPMENT.md) · [设计](DESIGN.md) · [贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md)

开发需要 Node.js 24 和 package.json 指定的 pnpm。运行 `pnpm check`、`pnpm test:e2e`、`pnpm format:check`。测试使用隔离的 CLI 替身、原生 stdio MCP 客户端和临时项目，不消耗真实模型额度。

## 许可证

[MIT](LICENSE)。发布包包含第三方许可声明。版本变更见 [CHANGELOG](CHANGELOG.md)。
