<p align="center"><img src="docs/assets/pointdom.svg" alt="PointDOM" width="72" /></p>
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

从 [Releases](https://github.com/itscyrus-dev/PointDOM/releases/latest) 下载对应安装包和 Chrome 扩展 ZIP。

| 平台        | 安装包         | 架构               |
| ----------- | -------------- | ------------------ |
| macOS 12+   | DMG            | 仅 Apple Silicon   |
| Windows 10+ | Setup EXE      | x64                |
| Linux       | DEB / AppImage | x64，WebKitGTK 4.1 |

安装包未签名，macOS 版本未公证，不支持 Intel Mac。
从 0.5 升级前先退出旧服务，再启动 0.6。项目、配对和历史记录会保留并创建私有备份，
中断的任务不会自动重放。

## 使用

1. 打开 PointDOM。解压扩展 ZIP，在 `chrome://extensions` 开启“开发者模式”，选择“加载已解压的扩展程序”，然后在 App 中批准 Chrome 连接。
2. 启动本地开发服务。macOS 在侧栏点击“绑定项目”，确认识别到的源码文件夹；Windows/Linux 在“设置 → 高级”手动添加源码文件夹和网页地址。仅为绑定网页授予 Chrome 权限。
3. 在“客户端”配置你的代码客户端，连接通用 MCP 并绑定准确项目。通用 MCP 客户端在监听时接收任务；macOS 的 Codex 桌面对话可在明确授权后接收任务通知。
4. 选取网页元素，填写整体需求或各元素描述，选择 MCP 接收方并提交。在任务列表查看进度、结果并取消任务。

应用使用 Tauri 2、Rust、React 和 HeroUI 3，安装后不携带 Electron 或 Node 运行时，
也不会启动模型 CLI。客户端报告不等于独立验证。自动源码发现和 Codex 桌面对话通知
目前仅支持 macOS；通用 MCP 监听支持以上三种平台。

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
