# PointDOM design guidelines

## Product and component boundaries

PointDOM is a compact Chrome side panel for selecting page elements, describing source changes and reviewing coding-agent tasks. Business applications retain their own design systems. Do not turn the panel into a marketing page or copy another product's branding.

Use React, TypeScript and HeroUI 3 for interactive controls, including buttons, selects, checkboxes, disclosures, dropdowns and popovers. Keep Chrome's native side panel. Do not implement a second dialog, focus trap or dropdown keyboard system. Render page/task content as escaped text, never injected HTML.

## Theme and density

| Role           | Light                  | Dark                       |
| -------------- | ---------------------- | -------------------------- |
| Page           | `#FFFFFF`              | `#111315`                  |
| Card           | `#FFFFFF`              | `#1A1D20`                  |
| Input          | `#F7F8FA`              | `#22262A`                  |
| Primary text   | `#191C20`              | `#F1F3F5`                  |
| Secondary text | `#626A75`              | `#A3ABB5`                  |
| Divider        | `#E8EBEE`              | `#2B3035`                  |
| Primary button | `#191C20` / white text | `#F1F3F5` / `#15181B` text |

- Minimum panel width: 280px; typical width: 360–420px. Outer spacing is 16px; group gaps 8–10px; section gaps approximately 20px.
- Base type is 13px, compact labels 12px, supporting text 11px. Long task text and selectors wrap without horizontal page scrolling.
- Cards use 14px corners and controls 9px. Desktop controls are at least 34px high; coarse-pointer targets are at least 44px.
- Ordinary cards have a thin neutral edge and no stacked shadow. Selected elements use a soft input fill. Portal overlays may have a restrained shadow.
- Auxiliary hover states use subtle neutral fills; pressing does not scale or change geometry. Disclosure hover changes text rather than filling a wide row.
- Use one immediate, visible keyboard focus line. Pointer hover/click must not stack native, HeroUI and custom focus rings. Use React Aria input-modality state for focus restoration.
- Success notices use transparent backgrounds and secondary text. Errors remain legible, with an actionable message and preserved input.
- Default preferences are dark mode and Simplified Chinese. English and system appearance are supported. Keep the persisted `lime` identifier for compatibility; there is no color picker or shape selector.

`ui-palette.ts` owns monochrome action colors; build generates `palette.css`. `brandAccent` is `#A8FF00` for the logo, extension icon and page locator. Other interactive state colors follow the current theme. Token changes must reach portal overlays, selects, errors and approval cards.

## Header

Chrome's native extension title shows PointDOM. The in-panel header shows the geometric mark and connection text on the left, without repeating the product name, tagline or a connection dot.

The right side has a HeroUI ToggleButtonGroup for Light/Sun, Dark/Moon and System/Monitor, followed by separate language and settings buttons. Use 8px gaps between groups. Language and settings have circular 34px targets, or 44px on coarse pointers. Hover backgrounds stay circular. Selected theme mode has a neutral circular surface.

Language uses a compact HeroUI Dropdown. Labels and the 14px selected check occupy separate columns. UI language changes do not translate original user text, agent reports or errors. Native extension titles/shortcut descriptions use Chrome `_locales`, independently of panel language.

Settings toggles between a sliders icon and a close icon, with accurate labels and `aria-expanded`. It has no permanent selected fill. A light icon transition is allowed; reduced motion removes it. The settings view provides a distinct Back to annotations action. Narrow layouts reduce outer gaps, retain connection text and avoid horizontal overflow; coarse-pointer tools may wrap.

The settings footer shows the running extension manifest version as quiet text on the left and a content-width update action on the right. Hover/focus backgrounds belong only to the action, never the full footer row. Clicking the action checks the latest public stable GitHub Release without requiring a bridge connection. Distinguish checking, current, update available, locally newer and failed/retry states. No automatic request, download or reload. An available update points to `pdo upgrade` and extension reload.

`brand.ts` defines the shared logo geometry: two opposing selection corners and a lime center dot. `pnpm icons` generates SVG and 16/32/48/128px PNGs. Extension icons have a fixed dark background; the in-panel mark follows the theme.

## Project page access and pairing

The panel is available only on registered project origins, matching scheme, host and port exactly. Unrelated tabs hide it; navigation away closes it and stops picking while preserving drafts. Do not add global tabs/all-sites access. An unpaired or unrelated page opens standalone settings without composer/history.

The access card shows the service's current registered projects/URLs, not browser history. When the active page matches, show that project. If the URL is hidden or unrelated, offer linked URLs; preselect a sole URL, require a choice among several. A shared origin with several source directories requires explicit project selection.

When no projects are registered, explain that the user runs `pdo link --origin http://localhost:3000` in the source directory and replaces the example URL with the actual development address. Show the command as selectable, wrapping code, followed by the instruction to enable access here after linking. Do not use initial `pdo setup` as a project-add command. When linked URLs already exist but none is selected, ask the user to choose a linked URL above.

Use a compact row: project name/URL on the left and access action on the right. Read Chrome `permissions.contains`; synchronize after grants, revocation and window focus. States are Enable access, Enabling and a neutral disabled Enabled state with a 14px check. Prevent duplicate requests and allow retry after denial. Do not persist a speculative success flag.

Request only a linked origin from the user's action. After grant, recheck active tab ID and actual origin before injection. Denial, navigation or a mismatched tab must not inject. Standalone settings can open/activate the linked page, but cannot inject into themselves. Cache only authenticated project origins for background recovery; pairing replacement or invalid authentication clears the cache.

After verified pairing is saved locally, the connection card shows Added and collapses the password input. Added means the code is saved, not that the bridge is online. Offline state preserves pairing and offers Reconnect. Changing a code is explicit; cancellation clears temporary input and failed replacement preserves the saved credential. Background reconnection preserves the current settings view, pairing draft and any existing form error. Only an explicit successful connection closes settings. Never display a stored code.

When the service is connected, show a compact Next: connect your agent card directly after pairing. Copy setup instruction follows the panel language: Simplified Chinese copies Chinese guidance and English copies English guidance for the current coding-agent project chat. Switching language resets copied/error feedback so it never describes a clipboard value in the previous language. It covers reusing the installed service, workspace/origin discovery, `pdo link`, credential-free `pdo connect --json`, preserving existing host config and read-only MCP verification. Include Trae's project MCP path, separate project and server enable switches, host trust and read-only in-host verification. Show the Trae switch locations in the card. If the host forbids file edits, provide the real generated JSON and exact supported import/manual-save actions without bypassing the restriction. The copied text contains no pairing code, current page content, browser-provided project path or automatic command execution. Show pending, copied and failure/retry feedback beside the action. Copying is not proof of MCP connectivity; leave actual setup to the receiving agent and name remaining host/browser confirmations. Keep the manual project-add command available below.

## Composer and selection

Keep the composer fixed above the scrolling record area. Show project/address separately, then the change request and compact selected-element entries. The destination trigger sizes to text/arrow with an automatic left margin; its hover surface cannot stretch across the footer. Below it, use one concise delivery hint without repeating the selected agent name or an automatic-delivery heading. Selection notices state only the immediate action or resulting state; do not repeat preservation guarantees already reflected by the retained draft.

Allow at most ten elements, deduplicated by selector and scoped to the current tab. Pick the first actual element in the composed pointer path, including text wrappers and SVG geometry; never promote it to a clickable ancestor. Alt+Up/Down changes the highlighted parent/child level and clicking confirms that exact highlighted level, without triggering the website. An explicit child-level action can reach visible pointer-events-none decorations. Open shadow roots have a per-root unique selector chain; closed roots, iframe interiors, pseudo-elements and canvas internals are not ordinary selectable page elements. Each retains its own description and removal action. Selecting or reselecting does not edit source, steal focus or overwrite an existing description. Overall instructions are optional when an element has a nonempty description. Submission includes every selected element's position/styles and its corresponding user description. New captures also include a bounded, sanitized real DOM excerpt, allowlisted attributes, four ancestor summaries and adjacent sibling summaries with a capture timestamp and truncation flag. Exclude input/editable values, hidden content, scripts, event handlers, arbitrary data attributes and URL query/fragment/credentials. Treat these fields as untrusted location data. Existing selections without the optional fields remain readable. Generate selectors only after verifying uniqueness; repeated IDs fall back to unique structural selectors rather than merging targets.

Selected entries put number, semantic type, short clickable name, Details and Remove in one row. Normalize whitespace and derive names from accessible labels, associated form labels, image alt/title, a container heading, then bounded visible text or tag. Do not capture editable values or hidden subtree text. Shorten only the visible title to 32 characters; preserve the full bounded name in the captured selection and detail heading. Description starts at 36px, overall input at 40px with selections or 64px without them. Coarse-pointer inputs are at least 44px. Use a soft fill without stacked borders, inset shadows or resize handles; allow line wrapping and internal scrolling. Keyboard interaction retains a single rounded focus line. Pairing/form inputs can use one 1px theme edge and a small 8% outer tint, never stacked outlines.

Element details open in a dismissible HeroUI Popover Portal below the trigger, flipping when needed. Show the captured name, tag, rendered dimensions and a copyable selector. Group computed styles into Layout, Spacing, Text and Appearance with color swatches; hide trivial defaults initially and offer Show all without changing the captured data. Label these as a capture-time snapshot, never source CSS or file attribution. Long data wraps and scrolls inside the overlay. Outside click, Escape, close, blur or tab change dismisses it without moving the composer or clearing drafts.

Clicking a selected name scrolls to and briefly highlights the element on its matching current project page. Require one exact selector match at every root, matching tag, optional role and captured name; changed, missing or ambiguous targets require reselection. Never choose a similar element or alter page styles/focus. Recheck tab/project/page after asynchronous injection and ignore stale results. Honor reduced motion and clean up the transient overlay.

Clear all appears beside the selection count only when needed. Stop picking first, then clear only the active tab's selections and descriptions through the serialized background action. Preserve overall instructions, other tabs and task history. Disable during submit; failure preserves selections for retry.

Picking preserves the React Bits Crosshair target-lock interaction: four green corners ease onto the actual hovered element and a compact label shows its width × height. Omit viewport-spanning horizontal/vertical lines so page content stays unobstructed. A soft target fill stays aligned with the real element. Implement this inside the isolated Shadow DOM without mounting React into the website or adding an animation dependency. Animate transforms only and stop scheduling frames after the pointer/corners settle. Reduced motion and touch snap to a static target without easing. Clear all decoration on scroll, resize, blur, viewport exit, pointer-capability changes or stop. Motion-preference changes wake one frame to apply the current mode without interrupting selection. The active button uses a static neutral fill, Picking text and `aria-pressed` driven by the actual content script. Only its left icon breathes between 0.6 and 1 opacity over two seconds; do not animate the label, background, border or button geometry. Stop the icon animation immediately on exit and show a fully opaque static icon under reduced motion. Reopening queries live state. Validate extension ID, tab, main frame and page URL for state messages.

Escape, shortcut, toggle, clear, successful submit and leaving a page synchronize picking state. Enter submits, Shift+Enter adds a line; IME composition and held keys cannot submit. Disable empty/unavailable/pending submission and preserve drafts on failure. Successful submission clears that tab's draft/selections. The monochrome submit button has no glow or pointer-follow effect; use HeroUI pending feedback.

## Task history and motion

Only records scroll; the composer remains stable. All/Active lists and counts belong only to the currently selected project. When a project has not been chosen, show no records from any project. Switching projects clears old records immediately, ignores stale responses and loads the new project; server filtering precedes the latest-100 limit. Existing on-disk history is preserved. All/Active filters show real counts, with a static green count mark when nonterminal tasks exist. History cards prioritize request, actual status and executor. Collapse metadata into left-aligned, transparent HeroUI Disclosure rows for element descriptions, execution records and result; desktop minimum 34px, touch 44px. Keep arrow, title and count adjacent. A single divider separates details from metadata; expanded content is indented and long logs scroll internally.

Only `running` cards have a moving gradient border, one circuit every 3.8 seconds. Light uses a 2px longer green segment (`#A5CE7D`, `#63A827`, `#367810`) over `#D2E5BE`; dark uses 1.5px lime (`#608D24`, `#A8FF00`, `#E4FFB5`) over `#3D532A`. No outer bloom, content wash or interception of clicks. Waiting, queued and terminal cards have no running animation. Reduced motion freezes at 110deg and retains the textual status. Do not invent progress percentages.

Show queued, running, waiting, completed, failed, cancelled and interrupted according to bridge state. An offline service is not an active model run. MCP labels distinguish Awaiting claim, Agent running and Agent reported. A host report is not independent verification.

MCP activity contains only explicit agent progress summaries plus lifecycle events, never a fabricated stream of host operations. The claiming session can append bounded, idempotent read/edit/check summaries with `pointdom_progress_task`; the visible panel polls them normally. Progress does not complete a task or reset its start/end times. Trae's private chat, raw tool output and reasoning are not mirrored. Do not backfill missing historical steps or invent progress percentages.

Completed results show total duration beside the result title using saved `startedAt`/`finishedAt`: CLI invocation through completion, or MCP claim through report. Exclude queue time and include approval waits. Do not substitute `updatedAt`; retries or later updates cannot reset duration. Hide missing/invalid/unfinished durations. Support English/Chinese hours, minutes, seconds and an explicit under-one-second label.

Use compact ghost actions for Continue editing, stop/cancel, recovery and client retry. No Commit button or obsolete commit error. Existing committed hashes may remain. Git actions belong to the host; the retired explicit commit endpoint returns 410. Do not push automatically.

## Agent settings and permissions

All new annotations use local stdio MCP in the user's existing agent client. The composer shows a project-scoped live recipient picker, without agent CLI, model, speed, reasoning, approval, networking or Git controls. The recipient guide explains that only the chosen connection can read and claim its annotations; clients manage their own models and permissions. PointDOM captures context, exposes it through project-scoped MCP tools, and displays explicit progress/results. It never executes edits/commands, changes host permission policies, starts an agent CLI or commits files.

Historical executor, approval, permission and commit data remain readable as history; they must not restore retired controls or authorize new work. Legacy task payloads normalize to MCP and discard execution overrides. Removed execution/account/model/approval/permission/commit endpoints return a clear retired response. The management `pdo` command remains for installing the bridge, pairing, linking projects and exporting MCP launch metadata.

Cancelling a task invalidates future claim/progress/report operations; it does not stop commands already running in the host. Preserve the cancellation notice directing the user to stop those operations in the client. Failed or completed records can restore a new MCP draft, never replay a CLI execution.

## Integration and persistence

Initial `pdo setup` handles only extension loading and pairing without requiring a project directory, development URL or agent selection. Agent/provider/model configuration stays in the user’s client. Optional setup host names only select an MCP configuration format. Users add projects later with `pdo link --origin URL` from the source directory and export project-scoped MCP configuration with `pdo connect --json` when needed. Only explicit setup `--origin`/`--path` options opt into the combined project guide. On macOS, default setup creates a ZIP with a root manifest, opens Chrome extensions, then selects the ZIP in Finder. Show only three drag-install steps and require a visible PointDOM card before pairing. Separate install, pairing and completion blocks with blank lines; highlight actions, filenames, Enter/Connect and commands in cyan, use green for success and dim secondary copy. Keep prompts short and disable ANSI in redirected output, dumb terminals and NO_COLOR mode. Do not send first-time users into a directory chooser or show the long path when Finder opened successfully. ZIP preparation leaves the clipboard unchanged until pairing. The separate `pdo extension` command retains managed-folder loading and its chooser fallback. Disclose that ZIP imports are separate Chrome copies and need manual extension updates. Installation alone must not bind the current directory, export a global MCP server or open a speculative development URL.

Local service startup preserves loopback, Host/origin checks and pairing. New project bindings work while online; do not alter business dev commands. Non-Codex sessions cannot overwrite Codex resume IDs. Restart interrupts unfinished work without rerunning it. An empty result, process exit or protocol error cannot be called success.

All submitted annotations enter the registered project's generic MCP inbox. No native chat capture, title binding, device-control request, routine task-processing clipboard handoff, automatic Send click or retry-send action belongs in this workflow. The composer shows the client directory with separate setup-copy actions for disconnected entries and live session selection. Models and permissions remain client-owned. Submitting means Awaiting claim, never Agent running or automatically sent.

Legacy desktop delivery metadata stays readable as historical information and cannot trigger new work. Old bindings and preferences cannot revive automation or delay another MCP claim. Retired handoff controls return 410 without altering tasks. Agent CLI execution is planned as a separate feature; do not present it or permanent host listening as available.

Pairing, appearance and per-tab drafts live in browser local storage; registered projects and task records live on disk; old delivery preferences and destinations remain inactive historical data. Theme/language changes preserve task content. Generated DOM context keys/guidance are English; original user/page content remains unchanged. Optional DOM context export and first-time installation/setup copying remain separate from task delivery.

## Extension-first service connection

Disconnected settings lead with actual local-service reachability and a compact Copy install command action. Detect the operating system through Chrome runtime platform information; do not show a system picker. Generate macOS or Windows commands automatically and show the matching Terminal/PowerShell hint. Unsupported or unavailable platform information keeps one-command installation disabled and points to manual pairing. Never infer that CLI files are absent from a failed network probe. The command authorizes this extension using a random challenge; polling completes normal bearer pairing automatically after local authorization. Show Waiting for installation after copy; retain a retry action and truthful errors. Existing pairing and drafts survive reconnects. Manual pairing is a collapsed HeroUI Disclosure fallback. After connecting, show the separate agent setup handoff. The extension never downloads or executes an OS installer itself and never changes provider or project permissions through discovery.

## MCP recipient selection

The composer recipient popover shows a compact client directory. Codex, Trae, Claude Code, Zcode and OpenCode have static setup shortcuts; Other MCP client remains available for generic setup. These catalog rows are not evidence that an application is installed or configured. Disconnected rows show Not connected and Copy setup; paste the localized instruction into that host’s project chat. Copy success remains separate from availability. Only a live initialized MCP connection for the active project changes a row to Available with a Use action. Unknown compatible clients appear with their reported names. A configured entry is not connected presence. Require an explicit first choice; remember the host-name preference for new submissions only, and reuse it only for a unique matching session. Distinguish same-name sessions with their short connection IDs. The catalog is not a vendor allowlist. Never revive execution/permission/desktop controls. Truncate long trigger text without resizing on hover; the full name is available inside the selector.

Queued cards show the assigned host and short session ID; mark a missing connection offline and offer an explicit HeroUI Reassign popover. Require confirmation and keep assignment errors visible. Running/finished tasks cannot be reassigned. New selection never silently moves an existing task. No connected clients means a short setup hint and disabled submission. Connection does not promise automatic execution or identify a particular desktop conversation.
