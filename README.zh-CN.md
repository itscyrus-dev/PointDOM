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

PointDOM 把 Chrome 中的网页批注交给本地项目的编程 Agent。选取元素、填写修改要求并提交，Agent 获取 DOM 上下文、定位源码、使用自己的工具修改并回报结果。页面通过项目现有开发服务器的热更新展示改动。

**所有支持本地 stdio MCP、并具备项目文件编辑能力的 Agent 客户端都可以接入，不要求安装 OpenCode。** Codex、Claude Code、OpenCode 和 Trae 另有对应的 CLI 自动执行集成。模型、账号和供应商配置继续由你选择的 Agent 管理。

## 功能

- 最多选取 10 个独立 DOM 元素，包括可点击卡片内的文字和 SVG。按 **Alt / Option + ↑ / ↓** 切换父子层级。
- 为每个元素填写独立要求，在详情浮层查看选择器、尺寸、分组样式和经过过滤的 DOM 结构。
- 传递 DOM 片段、关键属性、父级、相邻节点和位置信息，帮助 Agent 确认具体组件及实例。浏览器 DOM 是源码定位线索，不等于源码文件位置。
- 使用任意兼容的 MCP 客户端，或通过受支持的 CLI 按本机默认配置执行；无需在扩展中重复设置模型、速度或思考程度。
- 关联多个本地项目，按项目隔离历史记录，查看真实任务状态，并保存项目级权限偏好。

## 使用要求

| 组件           | 要求                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| Release 安装器 | Apple Silicon 或 Intel Mac。需要时自动提供 Node.js 24，不要求自行构建或安装 pnpm。        |
| 浏览器         | Chrome 120+。目前手动加载已解压的扩展，Chrome Web Store 上架尚在计划中。                  |
| MCP 方式       | 支持**本地 stdio MCP**，并能编辑、验证当前项目的客户端。不要求安装某个特定 Agent 的 CLI。 |
| CLI 自动执行   | 对应 CLI 已安装、完成认证并配置可用。这是可选方式。                                       |
| 项目           | 本地源码目录和实际开发网址。PointDOM 不会启动或替换项目的开发服务器。                     |

其他平台可按[源码安装说明](docs/INSTALL_AGENT.md#manual-source-installation)手动配置，但存在平台限制。只有模型 API 或普通网页聊天界面，并不等于具备本地 MCP 和文件编辑能力。

## 快速开始

在 macOS 中执行：

```sh
curl -fsSL https://github.com/itscyrus-dev/PointDOM/releases/latest/download/install.sh | sh
cd /absolute/path/to/your/app
~/.local/bin/pdo setup --origin http://localhost:3000
```

将目录和网址替换为你的项目。首次使用执行 `pdo setup`，按引导关联项目、加载扩展、配对并选择 Agent。

1. 引导会打开 Chrome，在 Finder 中选中 **PointDOM Extension** 文件夹并复制路径。在 `chrome://extensions` 开启**开发者模式**，点击**加载已解压的扩展程序**。选择文件夹时按 **Cmd+Shift+G**，粘贴路径、回车并选择该文件夹。需要重新打开引导时执行 `pdo extension`。
2. 将本机配对码粘贴到 PointDOM 并连接。配对码只在本机使用。
3. 打开已关联的开发网址，在 PointDOM 中启用该网页访问权限。
4. 选取元素、填写要求、选择 Agent 并提交。根据实际任务状态检查结果和源码改动。

安装器获取的是**最新正式 GitHub Release 中打包好的扩展和 CLI**，不会直接跟随仓库主分支。本文描述当前检出的代码；尚未发布的功能需要发布新版本后，才能通过 `pdo upgrade` 获取。

## 让 Agent 帮你安装

将仓库链接和以下要求发送给当前项目中的编程 Agent：

```text
请为当前项目安装 https://github.com/itscyrus-dev/PointDOM 。
先阅读 README.md 和 docs/INSTALL_AGENT.md，再按当前 Agent 的安装指南操作。
使用非交互安装流程，保留我现有的配置，关联正确的开发网址，
验证本地服务和 MCP 连接。先完成可自动完成的步骤，再列出剩余的浏览器或客户端确认。
不要打印配对码，也不要修改业务项目的依赖或开发命令。
```

安装 Agent 应从[安装操作指南](docs/INSTALL_AGENT.md)开始，检查当前工作区、已有安装和配置，按对应客户端的格式合并 MCP 条目，并验证连接。只有无法从项目配置或运行环境确定网址时，才询问开发地址。

Chrome 加载、首次配对、网页访问授权，以及客户端的信任或启用操作仍需明确完成。本地服务就绪，不代表扩展、MCP 客户端或模型已经连接成功。

## 接入 Agent

MCP 接入范围不限于下列客户端。任何能启动本地 stdio MCP 服务、并能编辑当前项目的 Agent，都可以按通用指南配置。

| Agent / 客户端       | 可选的自动执行方式                   | 安装指南                                  |
| -------------------- | ------------------------------------ | ----------------------------------------- |
| Codex                | `codex` app-server                   | [Codex](docs/agents/CODEX.md)             |
| Claude Code          | `claude` 官方 Agent SDK              | [Claude Code](docs/agents/CLAUDE_CODE.md) |
| OpenCode             | `opencode`：1.x 本地 API，或 2.x ACP | [OpenCode](docs/agents/OPENCODE.md)       |
| Trae                 | `traecli` ACP                        | [Trae IDE 与 CLI](docs/agents/TRAE.md)    |
| 其他兼容的编程客户端 | 本地 stdio MCP，无需指定 CLI         | [通用 MCP](docs/agents/GENERIC_MCP.md)    |

在项目目录中导出实际的 MCP 配置：

```sh
pdo connect --json
```

把生成的条目合并进客户端现有配置，完成启用或信任，再验证 `pointdom_list_tasks`。保留生成的绝对路径；各客户端的配置格式见上表对应指南。

- **Agent（MCP）**：在扩展中提交批注后，将复制的处理指令发送给已连接的客户端。Agent 读取、领取任务，再编辑并回报文件和检查结果。MCP 本身不会唤醒空闲或已关闭的会话。
- **已安装对应 CLI**：选择具名 Agent 后，PointDOM 使用该 CLI 的本机模型和账号默认配置执行。模型等设置在 Agent 中管理。
- **未安装对应 CLI**：任务进入 MCP 待领取列表，同时复制处理指令，并尝试填入受支持的 macOS 客户端空白聊天输入框。由你按发送；无法自动填入时手动粘贴。已有输入草稿会保留。

已开始执行的 CLI 出错后，不会自动转交另一 Agent 重复执行。协议测试不能证明所有客户端版本、模型账号和桌面界面均兼容，详见[验证范围](docs/VERIFICATION.md)。

## 多项目

在每个业务项目的源码目录中，按其实际网址执行一次：

```sh
pdo link --origin http://localhost:3000
```

也可以明确指定目录：

```sh
pdo link --path /absolute/path/to/another-app --name another-app --origin http://localhost:5173
pdo projects
```

同一目录重复执行 `link` 会补充网址，不会重复创建项目。匹配包含协议、主机名和端口，`localhost:3000` 与 `127.0.0.1:3000` 是不同来源。切换已关联网页时会匹配对应项目；多个项目共用同一来源时，需要明确选择项目。无关网页不显示批注界面。历史列表和“全部 / 进行中”数量均按项目隔离。

“项目网页访问”展示当前注册的项目和网址，不是浏览历史。配对在本机安装中共享，每个网站仍需独立授予 Chrome 访问权限。

## 更新

后续更新执行：

```sh
pdo upgrade
```

更新器检查最新正式 Release、校验下载文件，并拒绝打断未完成的任务。版本相同时不下载安装器。新服务就绪后更新固定的 **PointDOM Extension** 目录和 MCP 入口，并打开 Chrome 给出重新加载说明。重新加载扩展、刷新项目页面，并重新连接 MCP 客户端；已解压扩展需要保持开发者模式开启。

项目绑定、配对和历史记录会保留。新安装使用固定的扩展及 MCP 路径，后续无需重复 setup 或重新导入配置。

较旧安装若仍使用 `versions/.../dist/extension` 或旧目录别名，执行 `pdo extension`，从固定文件夹加载一次。扩展 ID 改变时可能需要重新配对和授权。MCP 配置若指向具体版本目录，执行 `pdo connect --json` 重新生成，只替换旧 PointDOM 条目。旧运行时和版本目录应在确认无客户端引用后再清理，详见[更新指南](docs/INSTALL_AGENT.md#updates-and-removal)。

设置底部展示当前扩展版本，右侧“检查更新”仅查询公开 Release 信息，不会自动安装。

## 数据和权限

- 浏览器本地存储保存配对、偏好和每个标签页的草稿、选中元素；本地服务在 `~/.pagepatch` 保存项目绑定和任务记录。
- 面板展示当前项目最近 100 条任务。这是显示上限，不是删除或保留策略，更早记录仍在磁盘上。
- 采集有范围限制的 DOM 片段和样式，不采集整页 HTML、截图或输入框、可编辑区域的实时值。DOM 片段排除脚本、事件属性、任意数据属性和 URL 查询参数、片段。网页文字和用户要求保留原始语言。
- 自动生成的上下文字段及指引使用英文。用户要求与 `untrustedPageContext` 分开；网页内容仅作为不可信的定位数据，不作为待执行指令。
- 任务内容会传给你选择的 Agent，并受其模型或供应商的数据处理规则约束。主动检查更新时访问公开 GitHub API，不发送配对码、项目路径、任务或网页内容。
- 本地服务只监听 loopback，并检查配对、Host、来源和项目范围。网页权限仅在你的操作后针对已关联来源申请。
- 项目级确认和联网偏好只作用于该项目的新任务，不改写全局 CLI 配置。PointDOM 不会自动 commit、push 或部署。

“复制 DOM 与修改描述”复制结构化上下文，不会创建任务；“复制处理指令”复制简短的领取指令。任务生命周期、复制字段和取消行为见 [MCP 参考](docs/MCP.md#clipboard-content)。

## 命令参考

若终端找不到 `pdo`，可使用 `~/.local/bin/pdo`，或把 `$HOME/.local/bin` 加入 PATH。`pointdom` 是兼容别名。

| 命令                                   | 用途                                          |
| -------------------------------------- | --------------------------------------------- |
| `pdo setup --origin URL`               | 首次交互式设置项目、浏览器和 Agent。          |
| `pdo link --origin URL`                | 关联当前项目，支持 `--path` 和 `--name`。     |
| `pdo projects`                         | 查看已注册项目、目录和网址。                  |
| `pdo connect --json`                   | 导出项目级本地 stdio MCP 配置。               |
| `pdo connect --client opencode --json` | 导出 OpenCode 原生 MCP 配置片段。             |
| `pdo connect --client cc-switch`       | 请求 CC Switch 导入，`--app` 指定目标客户端。 |
| `pdo extension`                        | 定位并打开已解压扩展的安装引导。              |
| `pdo extension --reload`               | 打开重新加载说明，不覆盖剪贴板。              |
| `pdo extension --path`                 | 仅打印扩展目录，不打开应用。                  |
| `pdo pair --copy`                      | 在本机复制配对码，不打印。                    |
| `pdo status`                           | 检查本地服务是否就绪。                        |
| `pdo version`                          | 查看 CLI 版本。                               |
| `pdo upgrade`                          | 校验并安装最新正式版，拒绝打断未完成任务。    |
| `pdo uninstall`                        | 移除登录启动，保留配对、项目和历史记录。      |
| `pdo help`                             | 查看命令和可用选项。                          |

## 常见问题

| 问题               | 检查方法                                                                              |
| ------------------ | ------------------------------------------------------------------------------------- |
| 找不到 `pdo`       | 使用 `~/.local/bin/pdo`，或将 `$HOME/.local/bin` 加入 PATH。                          |
| 服务未连接         | 执行 `pdo status`，检查安装和 4318 端口，再决定是否调整服务。                         |
| 没有匹配项目       | 使用 Chrome 中实际网址关联，注意主机名和端口。                                        |
| 无法启用网页访问   | 连接服务、选择已关联网址，再检查网站权限。                                            |
| 任务一直等待 Agent | 验证 MCP 工具并让客户端领取任务；MCP 不会主动唤醒空闲会话。                           |
| CLI 或模型报错     | 检查所选 Agent 的程序、认证和本机配置。                                               |
| 没有自动填入客户端 | 使用受支持的空白聊天输入框，检查 macOS 权限，或手动粘贴已复制指令。                   |
| 扩展仍显示旧界面   | 执行 `pdo extension --reload`，重新加载并刷新页面。旧路径需要先从固定文件夹加载一次。 |

## 开发与贡献

PointDOM 由 Chrome Manifest V3 扩展和 Node.js / Hono 本地服务组成，使用严格 TypeScript；面板使用 React 和 HeroUI。源码开发需要 Node.js 24 和 `package.json` 固定的 pnpm 版本。

请先阅读[开发指南](docs/DEVELOPMENT.md)、[设计规范](DESIGN.md)和[贡献指南](CONTRIBUTING.md)。可复现的问题通过 [Issues](https://github.com/itscyrus-dev/PointDOM/issues)反馈，参与讨论请遵守[行为准则](CODE_OF_CONDUCT.md)，安全问题按[安全政策](SECURITY.md)私下报告。维护者的发布检查见[发布指南](docs/RELEASING.md)。

`README.md` 为默认英文入口，本文提供对应的简体中文说明。详细开发、贡献及 Agent 安装文档继续以英文维护。文档只保留项目 logo，测试截图保存在忽略版本控制的本地测试产物中。

## 许可证

[MIT](LICENSE)。发行包包含第三方依赖许可证声明。版本记录见[更新日志](CHANGELOG.md)。
