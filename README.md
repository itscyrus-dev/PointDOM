# PagePatch

在网页点选元素、写修改意见，直接让本机 Codex 修改绑定项目的代码。无需回到 Codex 聊天窗口粘贴截图。

这是独立的 **Chrome Manifest V3 扩展 + Node.js/Hono 本地服务**。不是向 Codex 桌面聊天框自动输入的插件，也不会只临时更改网页 DOM。通过官方 Codex App Server 运行任务；每个项目保留自己的 Codex 会话。

## 安装

需要 Node.js 24+、pnpm 10+、Chrome 120+、已安装并登录的 Codex CLI。先运行 `codex --version` 和 `codex login status` 确认环境。

```sh
cd /Users/ranen/workspace/agents/pagepatch
pnpm install --frozen-lockfile
pnpm build
```

打开 `chrome://extensions`，开启「开发者模式」，点击「加载已解压的扩展程序」，选择项目里的 **dist/extension** 目录。将 PagePatch 固定到工具栏。更新代码并重新构建后，在扩展管理页点「重新加载」。

## 绑定项目与启动

网页地址只用于匹配项目，代码目录由你在本机注册，网页不能指定任意磁盘路径。注册时本地服务必须停止。同一个项目可以重复注册多个网页 origin；端口属于 origin 的一部分。

```sh
pnpm cli project add --name lycoboai \
  --path /Users/ranen/workspace/agents/lycoboai \
  --origin http://127.0.0.1:5173
pnpm cli project add --name lycoboai \
  --path /Users/ranen/workspace/agents/lycoboai \
  --origin http://localhost:5173
pnpm start
```

保持这个终端运行。在另一个终端执行：

```sh
cd /Users/ranen/workspace/agents/pagepatch
pnpm cli pair
```

复制输出的配对码，进入目标网页，点击工具栏 PagePatch，在侧边栏粘贴配对码并连接。配对码相当于本地修改权限，请不要发给别人或放入版本库。账号认证沿用本机 Codex CLI，不在扩展里填写 OpenAI API key。

## 使用

1. 在目标网页点击 PagePatch 工具栏图标，打开侧边栏并授予当前标签页的临时访问权。
2. 点击「启用网页批注」，允许当前网站的访问权限。网页右下角会出现「批注」「批注列表」，之后可关闭侧边栏。授权网站刷新后仍会显示入口。
3. 在网页点击「批注」，移动鼠标查看高亮，点击要修改的元素。按 Esc 退出选取。选中后在 Chrome 原生右侧栏描述并提交修改，网页中不会打开编辑浮层。
4. 填写修改意见，例如「这个按钮高度改为 40px，保留圆角」。确认匹配的代码项目，点击「提交修改」。
5. 继续选择其他位置、提交其他修改；任务按顺序执行，避免多个任务同时写代码。侧边栏显示执行记录、结果与失败原因。
6. 遇到 Codex 权限确认或补充问题，直接在侧边栏处理。关闭侧边栏不取消任务；本地服务必须保持运行。

Vite 等开发服务器会通过自己的热更新呈现改动；插件不负责启动业务项目或部署线上网站。上线仍需项目原有流程。不要同时让其他代理或编辑器修改相同文件。

任务保存在 `~/.pagepatch/jobs.json`，重新打开侧边栏可查看最近 100 条；完整本地记录保留在文件中。服务意外重启后未完成任务会标为「已中断」，不会自动重做，以免重复修改。停止任务不会回滚已经写入的代码。

## 当前范围与限制

- 支持普通 http/https 页面元素，采集选择器、可见文本片段、尺寸和计算样式；不采集整页 HTML、截图、输入框值或 URL 查询参数。
- iframe 内部、封闭 Shadow DOM 内部、Canvas 内部对象暂不支持精确选择。Chrome 设置页、扩展商店等受限页面不能注入。
- 页面元素不一定能唯一对应 React 源组件。Codex 会结合项目源文件定位，复杂情况可能需要补充说明。
- 源代码及选取的页面上下文会按本机 Codex 的配置发送给模型服务。任务会消耗该账号的 Codex 使用额度。
- 独立 App Server 会话不保证自动出现在 Codex 桌面当前聊天中；结果入口是扩展侧边栏。
- 服务仅监听 `127.0.0.1:4318`，不支持远程多人共享、开机自启动或扩展商店安装包。无需给业务项目添加 SDK。

## 开发与验证

```sh
pnpm check         # TypeScript、桥接/队列/协议测试、构建
pnpm test:e2e      # 独立 Chromium profile 中验证扩展 UI；模型执行用测试 runner
pnpm test:codex    # 可选：真实 Codex 修改临时 CSS 文件，会消耗使用额度
```

E2E 需要 Playwright Chromium：缺少浏览器时运行 `pnpm exec playwright install chromium`。测试仅给临时扩展副本授予 fixture 网站权限；发布扩展使用 activeTab 加按站点请求的可选权限。端口 4318、5175 必须空闲。

目录：`src/extension` 为扩展，`src/bridge` 为本地服务与 Codex JSON-RPC 适配器，`src/shared` 为校验协议，`tests` 为自动验证，`scripts` 为构建与真实执行 smoke test。

可选环境变量：

| 变量                  | 用途                                                              |
| --------------------- | ----------------------------------------------------------------- |
| `PAGEPATCH_HOME`      | 状态目录，默认 `~/.pagepatch`                                     |
| `PAGEPATCH_CODEX_BIN` | Codex 可执行文件路径，默认 `codex`                                |
| `PAGEPATCH_MODEL`     | 显式模型名称；未设置时使用 App Server `model/list` 返回的默认模型 |

协议依据：[Codex App Server](https://learn.chatgpt.com/docs/app-server)、[Chrome Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)、[activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)。

匹配到唯一项目时自动选择，常用操作不显示项目下拉框。完成任务可点击「继续修改」，填写新意见后再次提交。「已完成」由 Codex 执行结果决定，没有手动标记功能。

## 右侧栏与执行设置

编辑与任务结果统一在 Chrome 原生右侧栏显示。网页中仅保留「批注」「批注列表」入口，没有编辑 iframe 或浮层。扩展更新后刷新网页，清除旧浮层。用 Chrome 侧栏右上角 × 关闭；执行设置点击外部或 Esc 收起。

模型、速度、思考程度和操作确认保存在扩展本地；每次提交记录参数快照。可选模型和档位来自 Codex model/list，不支持的选项不展示。速度档位可能影响账号额度，具体由服务端决定。

确认方式：需要时确认（on-request）；严格确认（untrusted，更多命令需确认，可信命令可直接运行）；不弹确认（never，需要越过工作区权限的操作会失败，不自动批准权限升级）。

网页设置的模型优先于 PAGEPATCH_MODEL；两者未指定时使用模型目录默认值。旧的网页内面板描述已被本节替代。

### 本地提交

任务完成后点击 **Commit**，自动根据修改要求生成提交说明并提交本地。输入框底栏的执行设置中可勾选 **修改完成后自动 Commit**，默认关闭，仅影响之后提交的任务。完成后显示短哈希；不会推送远端。混入已有未提交改动、文件被后续修改或旧任务未记录改动范围时，请在项目中检查并提交。

## Trae / ZCode / DeepSeek Agent 接入

现支持项目限定的本地 stdio MCP。侧栏执行方式选择“其他 Agent（MCP）”，向 Agent 提供 DOM 文本和多元素独立描述；不需要图片理解能力。配置与使用见 [MCP 接入指南](docs/MCP.md)。生成当前项目的配置：

```sh
pnpm --silent mcp:config --project /absolute/path/to/project
```

标准 MCP 不会自动唤醒闲置会话；在宿主 App 中请求读取 PagePatch 待处理任务。模型、编辑、权限和提交由宿主 App 管理。
