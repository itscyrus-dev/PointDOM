<p align="center"><img src="docs/assets/pointdom.svg" alt="PointDOM 蓝色标志" width="72" /></p>
<h1 align="center">PointDOM</h1>
<p align="center">在网页指出问题，让你的代码客户端完成修改。</p>
<p align="center"><a href="README.md">English</a> · <strong>简体中文</strong></p>
<p align="center">
<a href="https://github.com/itscyrus-dev/PointDOM/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/itscyrus-dev/PointDOM/actions/workflows/ci.yml/badge.svg" /></a>
<a href="https://github.com/itscyrus-dev/PointDOM/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/itscyrus-dev/PointDOM" /></a>
<img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8D8" />
<img alt="Rust" src="https://img.shields.io/badge/Rust-2024-DEA584" />
<img alt="HeroUI 3" src="https://img.shields.io/badge/HeroUI-3-18181B" />
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-green" /></a>
</p>

PointDOM 将网页批注交给你的 MCP 代码客户端处理。选取一个或多个元素、描述修改，
在 Chrome 侧栏或桌面任务列表查看真实进度。源码修改、账号与权限由执行客户端管理。

## 安装

从 [Releases](https://github.com/itscyrus-dev/PointDOM/releases/latest) 下载 macOS 应用 DMG 和 `pointdom-extension-<version>.zip` 浏览器扩展。

| 平台      | 安装包 | 架构             |
| --------- | ------ | ---------------- |
| macOS 12+ | DMG    | 仅 Apple Silicon |

安装包未签名，macOS 版本未公证，不支持 Intel Mac。
从 0.5 升级前先退出旧服务，再启动 0.6。项目、配对和历史记录会保留并创建私有备份，
中断的任务不会自动重放。

本次升级后，在“客户端”刷新一次 Codex 配置；若不支持实时重载，重启 Codex 中的
PointDOM MCP 服务一次，以加载新工具定义。每次完成任务后无需重做配置。

## 使用

1. 安装并打开 PointDOM。在 `chrome://extensions` 开启“开发者模式”，加载 App 内置的扩展文件夹或解压后的 Release 扩展 ZIP。在插件点击“自动连接”，到 App 中允许连接一次。
2. 启动本地项目并打开网页。在插件点击“绑定项目”，到 App 确认“绑定并配置 Codex”。PointDOM 核实源码目录，保存 Codex MCP 配置并请求刷新。如果 Codex 无法刷新，在其 MCP servers 中启用 PointDOM 并点击 Restart。仅为绑定网页授予 Chrome 权限。
3. 在 App 项目卡片点击“连接对话”，选择匹配的 Codex 对话并确认“授权连接”。PointDOM 再次核对源码目录，将这个明确选择同步到插件，无需复制指令。也可以在插件点击“选择 Codex 对话”打开此入口。
4. 返回插件，选取网页元素、描述修改并提交。新批注自动唤醒已授权的 Codex 对话，完成并回传结果后结束。授权在 MCP 空闲断开及 App 重启后保留，中断任务不会自动重放。

其他 MCP 客户端使用 App“客户端”中的通用配置，在监听时接收任务。插件的接收菜单只列出可接收任务的对话，不按名称合并。App 的明确授权同步一次接收方；之后在插件手动选择的对话会保留，直到你在 App 再次授权。待确认的提交重试仍使用原接收方。

应用使用 Tauri 2、Rust、React 和 HeroUI 3，安装后不携带 Electron 或 Node 运行时，
也不会启动模型 CLI。客户端报告不等于独立验证。目前仅支持 Apple Silicon macOS，提供自动源码发现、Codex 桌面对话通知和通用 MCP 监听。

## 开发

安装 [Tauri 构建依赖](https://v2.tauri.app/start/prerequisites/)、`rust-toolchain.toml`
指定的 Rust 工具链、Node 24 和项目固定版本的 pnpm。

```sh
pnpm install --frozen-lockfile
pnpm desktop:dev
# 构建当前平台的原生安装包：
pnpm desktop:pack
```

构建不会替换已安装应用或正在运行的服务。检查和隔离测试说明见
[贡献指南](CONTRIBUTING.md)，打包与发布见 [发布流程](docs/RELEASING.md)。

[桌面安装与架构](docs/DESKTOP.md) · [MCP 协议](docs/MCP.md) · [安全报告](SECURITY.md) · [MIT 许可](LICENSE)
