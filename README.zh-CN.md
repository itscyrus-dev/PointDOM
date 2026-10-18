<p align="center"><img src="docs/assets/pointdom.svg" alt="PointDOM 蓝色标志" width="72" /></p>
<h1 align="center">PointDOM</h1>
<p align="center">在网页上指出修改，让 Codex 回到代码中实现。</p>
<p align="center"><a href="README.md">English</a> · <strong>简体中文</strong></p>
<p align="center">
<a href="https://github.com/itscyrus-dev/PointDOM/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/itscyrus-dev/PointDOM/actions/workflows/ci.yml/badge.svg" /></a>
<a href="https://github.com/itscyrus-dev/PointDOM/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/itscyrus-dev/PointDOM" /></a>
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-green" /></a>
</p>

PointDOM 将 Chrome 中的本地网页连接到正在处理该项目的 Codex 对话。
选中元素、描述修改并提交，PointDOM 会附上元素的 DOM 上下文。
你可以在浏览器侧栏或 macOS App 中查看进度和结果。

**无需截图（No screenshots required）。** 直接指出页面上的元素，省去准备截图、
查找并复制 HTML 的步骤。

## 可以用来做什么？

- **看到哪里要改，就在那里描述。** 选中按钮、卡片或页面区块，提出间距、尺寸、布局或文案修改。
- **一次提交多处批注。** 选中多个元素，分别填写描述，让每条要求对应到具体位置。
- **在选定的 Codex 对话中继续工作。** 新批注自动唤醒你已授权的对话，回传结果后结束任务，无需反复发送“继续监听”。

例如，选中一张卡片并提交：“内边距改为 16px，保持移动端布局不变。”
客户端会收到你的要求和该元素的上下文，在源码项目中处理修改。完成后回到本地网页查看效果。

## 开始使用

需要 **macOS 12+、Apple Silicon Mac、Chrome、Codex 桌面版和本地网页项目**。

1. **安装 App 和扩展。** 从同一个 [Release](https://github.com/itscyrus-dev/PointDOM/releases/latest)
   下载 DMG 和 `pointdom-extension-<version>.zip`。将 PointDOM 拖入“应用程序”并打开。
   解压扩展 ZIP，在 `chrome://extensions` 开启“开发者模式”，点击“加载已解压的扩展程序”，选择解压后的文件夹。
2. **连接 Chrome 与 App。** 在扩展中点击“自动连接”，到 PointDOM 中允许连接一次。
3. **绑定本地项目。** 启动开发服务器，在 Chrome 中打开网页。在扩展点击“绑定项目”，
   到 App 核对源码目录并确认“绑定并配置 Codex”。
4. **选择 Codex 对话。** 在 App 的“项目”页点击“连接对话”，选择该项目的对话并确认“授权连接”。
   扩展中的“选择 Codex 对话”也会打开同一个入口，无需向聊天中复制配置指令。
5. **选中、描述、提交。** 在网页中选取元素、填写修改要求并从侧栏提交。
   查看进度和最终报告，再回到网页检查效果。

绑定项目时，App 会配置 Codex MCP。若 Codex 无法实时刷新，在 Codex 的
“MCP servers”设置中启用 PointDOM，并点击一次 Restart。
每次完成任务后无需重复配置。

### 连接遇到问题？

- **“服务已连接”仅表示扩展连上了 App。** 提交任务前，还需选择并授权 Codex 对话。
- **没有匹配对话？** 在 Codex 中打开同一个源码目录，必要时新建对话，再到 App 的选择器点击“刷新对话”。
- **没有发现项目？** 在“设置 → 高级”中手动添加源码目录和本地地址。

安装包目前未签名、未公证。不支持 Intel Mac、Windows 和 Linux。
请使用同一版本的 App 和扩展。

## 其他代码客户端与开发

其他 MCP 客户端可使用 App“客户端”页中的通用配置，在监听时接收任务。
对话自动唤醒适用于已支持的 Codex 桌面版集成。详情见 [MCP 指南](docs/MCP.md)。

构建、测试和架构说明见 [贡献指南](CONTRIBUTING.md) 和 [桌面指南](docs/DESKTOP.md)。
报告漏洞前请阅读 [安全政策](SECURITY.md)。PointDOM 使用 [MIT 许可](LICENSE)。
