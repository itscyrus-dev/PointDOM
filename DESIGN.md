# PointDOM design system

## Product

Minimize learning cost. The app owns setup; the extension owns annotation. Keep
Chrome permission prompts in Chrome and client authorization in the client.

PointDOM connects browser annotations to an explicitly selected MCP coding client.
The desktop app manages projects, connections and task visibility. Clients own code
changes, accounts, models, permissions and Git actions. Product screens describe
actual actions and states, not implementation previews or fictional progress.

## Components and visual language

Use React, TypeScript and official HeroUI 3 controls. Keep Chrome's native side panel.
No second dialog, focus trap, dropdown keyboard system or marketing-style homepage.

App and extension use the official `@radix-ui/colors` 3.0.0 Gray and Blue scales,
including their dark variants. Semantic roles live in `src/extension/ui-palette.ts`;
both renderers consume the same generated CSS variables. Do not add local hex overrides.
Follow [Radix scale roles](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale).

| Role                            | Light                         | Dark                               |
| ------------------------------- | ----------------------------- | ---------------------------------- |
| Page / card                     | Gray 1 / 2                    | Gray Dark 1 / 2                    |
| Control / hover / pressed       | Gray 3 / 4 / 5                | Gray Dark 3 / 4 / 5                |
| Separator / input border        | Gray 4 / 7                    | Gray Dark 4 / 7                    |
| Body / secondary text           | Gray 12 / 11                  | Gray Dark 12 / 11                  |
| Disabled text                   | Gray 9                        | Gray Dark 9                        |
| Selected main navigation        | Gray 2; Blue 9 label and icon | Gray Dark 3; Blue 9 label and icon |
| Selected filters                | Gray 3 + Gray 12              | Gray Dark 3 + Gray Dark 12         |
| Running badge                   | Blue 3 + Blue 12              | Blue Dark 3 + Blue Dark 12         |
| Primary / hover / pressed       | Blue 11 / 12 / 12             | Blue Dark 11 / 12 / 12             |
| Primary text                    | Gray 1                        | Blue Dark 1                        |
| Completed / paired badge        | Gray 3 + Gray 11              | Gray Dark 3 + Gray Dark 11         |
| Enabled switch / picker outline | Blue 9                        | Blue Dark 9                        |

Primary fills use step 11 so normal-size labels meet 4.5:1 contrast. Neutral controls
use step 12 labels; quiet text actions use step 11 and step 12 on hover. Disabled
controls use step 9 and remain distinguishable from enabled actions. Unselected tabs
stay transparent on hover and press; selected tabs retain their selection surface.
Errors and warnings use Radix Red and Amber semantic roles rather than the blue accent.
Ordinary cards are borderless in both appearances; use surface contrast for grouping.
Use Gray 4 / Gray Dark 4 for subtle internal separators between card items, including
appearance settings, task metrics and About links. Inset separators to the content
edges and omit them after the final item. Retain input boundaries and visible keyboard focus. Keep project
actions free of hover tooltips. About-page resource links remain transparent on hover
and press; only their text color changes, with keyboard focus retained. Logo artwork retains its dark tile and white selection frame;
its center point uses Blue 9 (#0090FF), with a subtle cyan-blue highlight. Retain persisted theme identifiers without migration.

Desktop: 16px cards, 9px controls, 13px body, 16px page headings. Extension:
14px cards, 9px controls, 13px body, outer spacing 16px.

Thin neutral edges and restrained overlay shadows; no stacked rings, heavy shadows
or geometry changes on hover. Controls have visible keyboard focus and labels.
Desktop targets are at least 34px; coarse-pointer targets are at least 44px.
Support light/dark/system themes, Chinese/English, long text, narrow windows and reduced motion.
Keep the persisted extension theme identifiers compatible. Never inject HTML for
page text, descriptions, progress, reports or client errors.

## Desktop

Use a compact native utility layout, not a dashboard sidebar. The main window starts at
460 × 640px (minimum 400 × 480px) and adapts its height to the active page, clamped
to the current monitor work area. Preserve its width and respect maximized/fullscreen mode. Official HeroUI Tabs place Tasks,
Projects, Clients, Settings and About in a top toolbar (任务、项目、客户端、设置、关于 in
Chinese), with a 20px icon centered above each label. SVG symbols scale into an
explicit shared viewport so the visible glyph and label share the same center axis. Tab targets are a fixed 68px wide; hover never expands them.
Use @iconify-json/gravity-ui for interface icons, bundled as an offline local sprite.
Language uses the Lucide Languages icon shown in HeroUI docs, bundled locally with its license.
Keep the main toolbar free of branding and appearance shortcuts; theme and language belong in Settings. No Unicode icon substitutes or remote icon fetches.

Use vertically grouped round cards with 16–18px internal spacing, compact count rows
and a small persistent connection footer. Keep newest tasks first and assign descending numbers from the complete task list.
Main-window and menu-bar rows share the same number for each task, including when
filtered or when the menu bar prioritizes active tasks. Completed rows show the
number, title, metadata and right-hand status badge without a duplicate checkmark
or icon block. Running rows retain their activity animation. App and extension task titles use the first sentence of the overall user request; when absent, use the first nonempty element note. Resolve historical generated instructions at display time without rewriting stored tasks or changing execution scope. Preserve full descriptions in task details. Expand selected details immediately below their row
in the same scrolling list; clicking again collapses them. Task rows scroll naturally,
never sticky. A centered Collapse label and upward chevron at the bottom also close
the detail, returning focus and the viewport to its task row. Animate expansion and collapse for 200ms using Motion; reduced motion
removes the transition. Keep list viewport and native window height stable during
expansion, with no forced scrolling when opening or window resizing on animation frames. Show task details only after selection;
do not reserve an empty detail column. Project filters live above the task list.
The task list sizes to at most five collapsed cards, including their gaps, and
shortens the window when fewer cards remain. Empty task states use their natural
card height without a list-height cap or internal scrollbar. Extra records and expanded details
scroll inside that same viewport; screen work-area limits can reduce its height.
Keep toolbar/footer fixed without a window-level scrollbar. Scroll task records inside
their bounded list; long details and settings remain scrollable with wheel, touchpad
and keyboard. Align task cards with the content above. Place the narrow rounded
scrollbar in the right workspace margin, with a reserved gutter outside the card
width. Measure filter mutations before paint so stale list heights cannot briefly
show an unnecessary scrollbar. Other scrollbars stay hidden. Never clip otherwise unreachable
controls. Preserve access at the minimum window size. Installation guidance belongs to
Settings. Preserve drafts, filters and selected tasks when switching tabs; background
completion never navigates. Support keyboard tab navigation and reduced motion.

- Tasks: running/queued/connection counts, project and active filters, task cards,
  activity, final report and cancellation. Activity is supplied by the actual client.
- Projects: show automatically discovered local development services. The native observer
  verifies an owned listening process, its canonical source directory and a local HTTP
  response. Show discovery candidates only when present, without a permanent introduction
  or scanning card. Add project opens Settings > Advanced with manual setup expanded.
  When no projects or candidates exist, show a centered empty state with one short
  description and the Add project button below it. Otherwise keep Add project in
  the page heading. Disable adding while the service is offline. Successful manual
  setup returns to the project list. First connection requires one app confirmation. Persist project identity,
  not discovered ports. Refresh temporary address leases as services change; stopped,
  expired, changed-owner or ambiguous endpoints cannot authorize submissions.
  Accept exact loopback hosts only, never URL prefix matching or all-local-port grants.
  Show manual folder/address entry only under Settings > Advanced. Preserve drafts.
  Copy the project-scoped Codex instruction for the user to send in their intended
  conversation; never choose a recipient or fabricate a host connection.
  Project cards keep Open, Copy and View on one compact row, without hover
  tooltips. Copy confirms inline with a check for two seconds, without changing
  button geometry; reduced motion removes its transition. Remove uses native
  confirmation and refuses projects with pending tasks. Persist a removed marker,
  revoke active access, and retain source files, metadata and task history. Discovery
  hides removed source directories; adding them again in Advanced requires explicit
  setup and gets a fresh identity.
- Clients: save Codex MCP configuration and request live reload through the installed
  desktop host's `app-server proxy` and `config/mcpServer/reload`. Require a matching
  acknowledgement; never start a model turn or a separate app-server as fallback.
  Configuration saved, reload acknowledged and MCP connected are separate facts.
  Failed/unsupported reload keeps the saved configuration and directs the user to
  enable PointDOM and use Restart in Codex MCP servers settings;
  never demand a restart after every configuration click. Explicit Codex MCP configuration and universal MCP configuration for other
  hosts. Distinguish configured, connected, listening, wakeable and running states.
- Settings: extension setup, pairing and Appearance. Appearance groups the native
  “Show menu bar icon” switch, theme and language. Use the official HeroUI large switch
  size for a clearly visible track and thumb. Menu-bar visibility persists across
  restarts and does not change Dock visibility. No separate App settings card.
  Persist language in native preferences, migrating the existing renderer choice
  only when no native language is saved. Switching language updates both windows,
  tray menu, tooltip and application-owned native dialogs. Use one selected language
  at a time; retain product names and the language selector's native language names.
  Do not expose bearer tokens.

## Menu bar

Click the icon to open a 380px round task panel: connection, running/queued counts,
active tasks, recent results and open-main action. A task opens its detail in the
main window. Right-click provides Open, Tasks, Projects, Clients, Settings, About
and Quit, separated into navigation and lifecycle groups. The menu opens the requested
main-window tab and dismisses the task panel. Use a 2x antialiased monochrome macOS template icon: transparent background,
curved selection brackets and an idle center point. macOS renders it black on a
light menu bar and white on a dark menu bar. During execution only the center
breathes smoothly over a 2.4-second cycle at 25fps; the brackets stay fixed.
Reduced motion keeps the point static. Keep template rendering enabled both when
creating and updating the icon.
The app icon shares the selection frame and blue point, with
a restrained dark surface gradient and subtle edge highlight. The task panel uses a transparent native window
and transparent document roots behind its clipped 16px rounded surface; CSS rounding
alone must not leave opaque square corners. macOS transparency uses Tauri's
`macos-private-api` feature. Closing a window hides it; Quit
confirms pending work. Hiding the menu-bar icon also dismisses its task panel; the
main app remains accessible from the Dock. Offscreen positioning must be clamped to
the active monitor.

Only running tasks animate. Menu icon frames and task activity indicators follow
actual state. Queued, completed, cancelled, failed, interrupted and offline states
are static. System reduced motion freezes animation while preserving textual state.
Never invent percentages or estimated duration. Duration uses valid startedAt and
finishedAt only, excluding queue time.

## Extension

The header has the geometric brand mark, connection text, theme, language and settings.
Do not repeat the product name/tagline. Keep settings back/close discoverable and
preserve pairing drafts and descriptions on reconnect failures.

The execution picker lists only live MCP recipients for the current project. Distinguish
same-name sessions by short ID. Connected does not imply listening.
An explicitly authorized project/conversation remains an idle, wakeable recipient
when its MCP process exits or the app restarts; do not describe it as connected or
listening. EOF detaches the private session without revoking the authorization.
Explicit disconnect revokes it. A new MCP session must bind the exact workspace,
restore the same host-verified conversation with pointdom_enable_wakeup, proving receipt
of its queued notification with a private random notificationToken, and check
the notified recipient before claiming. Merely registering a fresh session never
inherits a saved recipient. IDs alone cannot grant task access. Persist only the
notification token hash, hide it from public task data, and never replay a delivered
notification to recover an ambiguous attempt. Reject changes to a conversation's active task ownership.
Revalidate the host conversation and source folder before each notification. Queue
one notification, handle it through MCP, report and end; never keep waiting after
a task. Restoring availability does not replay old notifications or interrupted work. Enable submission
only for an actual waiting/wakeable recipient or one already running its previous task.
No CLI options, discovery, managed model sessions or fallback actions. Keep historical
executor labels readable without restoring old execution controls.

Request page access only for an explicitly registered origin (scheme/host/port).
Unbound loopback development pages may open the side panel for setup, with a prominent
Bind project action. This grants no page-content access or execution permission.
Unbound online pages cannot open the panel and never redirect to a settings tab.
Binding hands only the origin to the native app. Native discovery may preselect a
single verified exact-origin development source; the user confirms once, and the
observer revalidates socket/process identity before persisting. Missing or ambiguous
matches use the native folder picker. Never infer a directory from page content.
Unrelated tabs hide the workspace. Shared origins require explicit project choice.
Switching projects clears visible records immediately and ignores stale responses.
Filters and counts are project-scoped; server filtering precedes the latest-100 cap.

First extension installation opens connection discovery automatically. The app shows
the pending extension identity and approves its exact nonce challenge on an explicit
click. Requests expire, remain bounded and never expose tokens before approval.
Existing deep-link pairing remains available as recovery.
Saved pairing is not evidence that the service is online. Failed replacement preserves
saved credentials. Never display a stored token. Advanced manual pairing is explicit.
Updates are user-initiated checks against public releases, never automatic installation.

## Picking and context

Keep the composer stable above scrolling records. Select up to ten exact elements,
deduplicated by selector and current tab. Preserve per-element notes and overall text.
Picking/reselection never edits source, triggers the website or steals description focus.

Use the first actual composed pointer target, including SVG paths and text wrappers;
never automatically promote to a clickable ancestor. Alt+Up/Down changes the highlighted
hierarchy. Clicking confirms that exact level. Support open shadow-root selector chains,
repeated IDs and visible pointer-events-none children. Closed shadow roots, iframe
interiors, pseudo-elements and canvas internals are not ordinary selectable elements.

Capture bounded sanitized DOM, allowlisted attributes, ancestor/sibling summaries,
styles, geometry and timestamp. Exclude editable values, hidden content, scripts,
event handlers, arbitrary data attributes, credentials and URL query/fragment. These
are untrusted location data, never source locations or executable instructions.

Element details use HeroUI Popover with grouped styles, exact selector and captured DOM.
Outside click/Escape dismiss without losing drafts. Locating requires one exact match
at every root, matching tag and captured identity; stale/ambiguous elements need reselection.
Clear-all affects only the current tab. Escape, shortcut, navigation, clear and successful
submit synchronize actual picking state. Enter submits, Shift+Enter inserts a newline;
IME composition and held keys cannot accidentally submit.

## Tasks and motion

Show queued, running, waiting, completed, failed, cancelled and interrupted from the
native service. Only running extension cards have the existing 3.8s moving border;
reduced motion freezes it. No running animation for offline, queued or terminal tasks.
MCP progress consists only of explicit bounded read/edit/check summaries and lifecycle
events. A final report contains actual changed files and verification; it is not
independent proof. Do not fabricate host tools, logs, reasoning or progress percentages.

Cancellation persists the cancelled state even for running, notified tasks, then
rejects later claims, progress and reports. It never reports that external edits
were stopped. For a task already notified to Codex, send a task-scoped stop request
to its original saved thread after persisting cancellation and revalidating workspace
identity. Show whether delivery was accepted or unconfirmed; never resend on an
ambiguous failure, repeated cancel or restart. Generic MCP recipients require manual
stop in their host. A delivered notification is not confirmation of interruption.
External host edits must be stopped in
that host; do not pretend PointDOM can kill any client conversation. Native service
restart interrupts owned work and never replays ambiguous notifications. Preserve
historical records but expose no retired CLI or managed-session approval actions.

About has its own compact tab: brand, version from the native app binary, and fixed
public project/release/feedback links opened in the system browser. The release row
shows the current native app version; update actions remain future scope. Theme and language
remain in Settings. Subscriptions are future scope: no invented plan, account status,
purchase action or billing backend is shown. Keep this distinct from task execution.

## Product copy and appearance controls

Keep page headings and descriptions terse and action-oriented. Empty states say
“No tasks” rather than a slogan; the footer says “Service connected” or “Service
offline” (服务已连接 / 服务未连接). Keep setup steps and actionable recovery details.
The composer footer shows one concise client state and one copy-instruction action.
Avoid repeated unavailable/help paragraphs and selection tutorials. Copied wakeup
instructions stay brief while retaining exact project/recipient scope, the current
host thread identity, mismatch handling and the task-only execution lifecycle.
Keep settings terse: a short section heading, row label and control. Theme and
language use compact icons with accessible names and visible keyboard focus.
Theme is a compact, mutually exclusive sun/moon/display group for Light, Dark and
System; System responds to OS appearance changes and remains selected across restarts.
Use a 34px-high neutral pill with 30px circular selected surfaces and uniform 16px
appearance icons; retain 34px hit targets (44px with coarse pointers). Appearance
rows are 44px high on desktop with no extra gap or bottom padding after the last row. Hover never
changes its fill.
Language uses an unfilled translation-icon trigger; no text pills for current values. Language opens an official single-selection menu with native language
names and a fixed leading checkmark column, backed by an extensible list of supported
locales. Menu hover has no fill, outline or shadow; keyboard focus uses a contained
inset outline. Keep popup padding and shadows restrained without clipping item focus.
Preserve keyboard activation and 44px coarse-pointer targets. Unselected navigation stays transparent on hover in both appearances; selected main navigation retains its neutral surface and bright Blue 9 labels and icons. Keyboard focus remains visible.

Window close hides the app while its local service continues running. The menu bar
provides task access and Quit. Running animations respect system reduced motion.
These are design/lifecycle rules, not helper paragraphs in the product settings UI.
Do not repeat implementation details or routine operating instructions in settings
cards. Add explanatory copy only when it helps a concrete action or recovery. Reconnect
shows pending feedback, prevents duplicate clicks, and distinguishes a repeated
port conflict from successful recovery. Never stop another service automatically.

Operation feedback uses one compact HeroUI Toast centered above the footer, with a
Gravity UI indicator and a visible close icon. Dismiss after four seconds, pause
while hovered or focused, and clear on navigation or a new action. Toasts overlay
content without changing the window height. Service errors and pending connection
approvals stay inline until resolved.

Extension compose controls use a dashed selection square, a single downward chevron,
and a diagonally upward send arrow. The 90px picker button reserves its label space
and changes from a dashed selection square to a stop icon while selecting. Dropdown
chevrons are 12px, rotate with their real open state over 160ms, and respect reduced motion. Keep filled Gravity UI paths free of additional strokes;
control icons retain consistent sizing and their existing accessible button labels.
