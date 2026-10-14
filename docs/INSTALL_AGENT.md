# 让 AI 配置 PointDOM 与 OpenCode CLI

仓库：[itscyrus-dev/PointDOM](https://github.com/itscyrus-dev/PointDOM)。优先接入本机 OpenCode CLI，无需桌面客户端、全局 MCP 配置或手动领取批注。

## 给 AI 的请求

替换项目目录与网页地址，将下面文字发给代码 Agent：

> 帮我安装 https://github.com/itscyrus-dev/PointDOM 并使用本机 OpenCode CLI 执行网页批注。先读取 docs/INSTALL_AGENT.md 和 AGENTS.md。我的项目目录是 `/absolute/path/to/my-app`，网页地址是 `http://localhost:5173`。把工具克隆到独立目录，安装 macOS 登录后台服务并绑定项目；不要修改业务项目的 pnpm dev 或依赖。最后告诉我 Chrome 扩展绝对目录和首次配对步骤。保留已有项目绑定和任务，不要中断正在执行的任务，不提交或发布代码，不读取或转发配对码和密钥。

## 一键安装（macOS）

已安装且配置好 OpenCode CLI 时，在本地终端执行：

```sh
curl -fsSL https://github.com/itscyrus-dev/PointDOM/releases/latest/download/install.sh | sh
```

安装器下载已构建的 CLI 和扩展并验证 SHA-256，不需要 pnpm 或源码构建。Node.js 24+ 不存在时，会安装专用运行时到 `~/.local/share/pointdom/runtime`。安装应用保存在 `~/.local/share/pointdom/versions`，打印 Chrome 应加载的扩展绝对目录，并安装登录后台服务。已有安装不覆盖，不自动停止现有任务。需要从源码开发时使用下方源码安装。

安装后按输出的 zsh/bash 命令将 `~/.local/bin` 加入 PATH；安装器不会自动修改 shell 配置。然后执行 `pdo link --origin http://localhost:5173` 即可绑定当前项目。首次 Chrome 加载、配对和站点授权按下方步骤完成。

## 首次源码安装（macOS）

需要 Node.js 24+、pnpm 10+、Chrome 120+，以及已配置可用模型的 OpenCode CLI。先运行 `opencode --version`；API 地址、Key 和默认模型继续在 OpenCode / CC Switch 中配置，不放进插件。

在独立工具目录克隆仓库：

```sh
git clone https://github.com/itscyrus-dev/PointDOM.git
cd PointDOM
node scripts/setup.mjs --name my-app \
  --project /absolute/path/to/my-app \
  --origin http://localhost:5173
```

此命令安装锁定依赖、构建扩展与服务、注册 macOS 用户级登录启动、等待服务就绪并绑定项目。首次执行即可；已安装用户增加项目时使用下节的 `link`。私有仓库需要已有 GitHub 访问权限，不要要求用户把密钥发到聊天中。

安装创建：

- `~/.local/bin/pdo`：CLI，固定使用本机 Node 和工具的绝对路径。若该目录已在 PATH，可以直接用 `pointdom`。
- `~/Library/LaunchAgents/dev.pointdom.bridge.plist`：登录时自动启动并保持桥接服务运行，仅监听 `127.0.0.1:4318`。
- `~/.pagepatch`：权限受限的本机配对、绑定和任务状态。配置与安装文件不写入模型 Key。

接着引导用户完成一次浏览器操作：

1. Chrome 打开 `chrome://extensions`，开启开发者模式，加载 PointDOM 的 `dist/extension` 绝对目录。
2. 用户在本地终端执行 `~/.local/bin/pdo pair`，自行复制配对码到扩展；不要读取或转发配对码。
3. 打开目标网页，授权当前站点。在执行设置中选择 **OpenCode CLI**。新安装默认使用此方式；已有用户的执行偏好保留。

不需要在 OpenCode 中接入 PointDOM MCP，也不需要开着 `pnpm start` 或 OpenCode TUI。每次发送批注，桥接服务自动启动本机 `opencode serve`，创建当前项目的独立会话，完成后关闭该进程。模型用 OpenCode 默认配置；工具权限通过插件确认，不自动批准。当前集成需要支持 session permission、permission/question 和事件接口的 OpenCode CLI（本机验证版本 1.18.29）。

## 每个项目绑定一次

在业务项目目录执行：

```sh
~/.local/bin/pdo link --origin http://localhost:5173
```

目录和项目名自动来自当前目录，重复执行不会创建重复项目。服务运行中即可绑定，无需重启。若要指定该项目模型，使用 OpenCode 中实际可用的 ID：

```sh
~/.local/bin/pdo link --origin http://localhost:5173 --model provider/model
```

以后运行该项目的 `pnpm dev`，打开开发页面，选中元素、填写描述并发送即可。多个项目分别绑定其开发地址；localhost 和 127.0.0.1 是不同 origin，端口也是 origin 的一部分。地址被多个项目复用时，插件要求明确选择项目，不能猜测当前业务目录。

## 检查、更新与卸载

```sh
~/.local/bin/pdo status
~/.local/bin/pdo project list
```

先确认服务在线，再检查扩展已配对、当前网页已授权、origin 匹配、执行方式为 OpenCode CLI。任务失败时检查 OpenCode 模型配置和额度；不能把服务就绪描述为模型调用验证成功。

更新前确认没有正在执行的任务。服务固定引用安装目录与 Node 的绝对路径，移动目录或更换 Node 后需要重装后台启动：

```sh
~/.local/bin/pdo uninstall
# 在 PointDOM 仓库目录更新、构建后：
pnpm install --frozen-lockfile
pnpm build
node dist/bridge/main.js install
```

卸载后台启动会停止执行中的任务，但保留项目绑定、配对和修改记录，也保留 CLI。Chrome 扩展更新后需在扩展管理页重新加载。当前自动启动仅支持 macOS，其他平台仍可用 `pnpm start` 手动运行服务；尚未提供 npm 发布包或 Chrome 商店安装。

Trae 等已有会话希望手动领取任务时，仍可使用 [MCP 接入指南](MCP.md)，与 OpenCode CLI 自动执行方式独立。
