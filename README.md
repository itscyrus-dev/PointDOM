<p align="center"><img src="docs/assets/pointdom.svg" alt="PointDOM blue logo" width="72" /></p>
<h1 align="center">PointDOM</h1>
<p align="center">Point at your webpage. Describe the change. Let Codex work on the code.</p>
<p align="center"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>
<p align="center">
<a href="https://github.com/itscyrus-dev/PointDOM/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/itscyrus-dev/PointDOM/actions/workflows/ci.yml/badge.svg" /></a>
<a href="https://github.com/itscyrus-dev/PointDOM/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/itscyrus-dev/PointDOM" /></a>
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-green" /></a>
</p>

PointDOM connects your local webpage in Chrome to the Codex conversation working on
your project. Select an element, describe what should change and submit the request
with its DOM context. Review progress and results in the browser side panel or the
macOS app.

**No screenshots required.** Point to the actual element instead of preparing an
image or finding and copying its HTML yourself.

## What can I use it for?

- **Describe UI changes where you see them.** Select a button, card or section and ask
  for changes to its spacing, size, layout or text.
- **Send several annotations together.** Select multiple elements and add a note to
  each, keeping the request tied to the right parts of the page.
- **Continue work in your chosen Codex conversation.** New annotations wake the
  conversation you authorized. It reports the result and ends the task; you do not
  need to keep sending a “continue listening” instruction.

For example, select a card and submit: “Reduce the padding to 16px and keep the
mobile layout unchanged.” The client receives your request and the selected element's
context, then works on the source project. Review the result on your local site.

## Get started

You need **macOS 12+ on Apple Silicon**, Chrome, Codex desktop and a local web project.

1. **Install the app and extension.** Download the DMG and
   `pointdom-extension-<version>.zip` from the same
   [release](https://github.com/itscyrus-dev/PointDOM/releases/latest). Drag PointDOM
   into Applications and open it. Extract the extension ZIP, open
   `chrome://extensions`, enable **Developer mode** and use **Load unpacked** to
   select the extracted folder.
2. **Connect Chrome to the app.** In the extension, click **Connect automatically**
   and approve the connection in PointDOM once.
3. **Bind your local project.** Start the development server and open its page in
   Chrome. Click **Bind project** in the extension, confirm the source folder in the
   app and approve **Bind and configure Codex**.
4. **Choose the Codex conversation.** In the app's Projects tab, click **Connect**,
   select the conversation for this project and confirm **Authorize connection**.
   The extension's **Choose Codex conversation** button opens the same picker.
   No setup instruction needs to be copied into the chat.
5. **Point, describe and submit.** Select elements on the page, write the changes you
   want and submit from the side panel. Check progress and the final report, then
   review the changed page.

The app configures Codex MCP during project binding. If Codex cannot refresh it
live, enable PointDOM in Codex's **MCP servers** settings and click **Restart** once.
You do not need to repeat setup after each task.

### If something does not connect

- **“Service connected” is only the app connection.** Choose and authorize a Codex
  conversation before submitting work.
- **No matching conversation?** Open the same source folder in Codex and create a
  conversation if needed, then click **Refresh** in the app's picker.
- **Project not discovered?** Add its source folder and local address under
  **Settings → Advanced**.

Installers are currently unsigned and not notarized. Intel Macs, Windows and Linux
are not supported. Keep the app and extension on the same release.

## Other coding clients and development

Other MCP clients can use the universal configuration in the app's **Clients** tab;
they receive tasks while listening. Automatic conversation wakeup is available for
the supported Codex desktop integration. See the [MCP guide](docs/MCP.md).

For building, testing and architecture, see [Contributing](CONTRIBUTING.md) and the
[desktop guide](docs/DESKTOP.md). Read the [security policy](SECURITY.md) before
reporting a vulnerability. PointDOM is [MIT licensed](LICENSE).
