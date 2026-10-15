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

Use a compact row: project name/URL on the left and access action on the right. Read Chrome `permissions.contains`; synchronize after grants, revocation and window focus. States are Enable access, Enabling and a neutral disabled Enabled state with a 14px check. Prevent duplicate requests and allow retry after denial. Do not persist a speculative success flag.

Request only a linked origin from the user's action. After grant, recheck active tab ID and actual origin before injection. Denial, navigation or a mismatched tab must not inject. Standalone settings can open/activate the linked page, but cannot inject into themselves. Cache only authenticated project origins for background recovery; pairing replacement or invalid authentication clears the cache.

After verified pairing is saved locally, the connection card shows Added and collapses the password input. Added means the code is saved, not that the bridge is online. Offline state preserves pairing and offers Reconnect. Changing a code is explicit; cancellation clears temporary input and failed replacement preserves the saved credential. Background reconnection preserves the current settings view, pairing draft and any existing form error. Only an explicit successful connection closes settings. Never display a stored code.

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

Completed results show total duration beside the result title using saved `startedAt`/`finishedAt`: CLI invocation through completion, or MCP claim through report. Exclude queue time and include approval waits. Do not substitute `updatedAt`; retries or later updates cannot reset duration. Hide missing/invalid/unfinished durations. Support English/Chinese hours, minutes, seconds and an explicit under-one-second label.

Use compact ghost actions for Continue editing, stop/cancel, recovery and client retry. No Commit button or obsolete commit error. Existing committed hashes may remain. Automatic commit is disabled; retain the explicit legacy bridge endpoint's safeguards for compatibility. Do not push automatically.

## Agent settings and permissions

The dismissible destination popover offers Agent (MCP), Codex, OpenCode, Claude Code and Trae. No model, speed, reasoning or automatic-commit controls. Named agents use local CLI defaults; missing CLI routes to MCP/client delivery. A started CLI failure does not automatically reroute and risk duplicate execution.

Project permissions are explicitly saved for the selected registered project. New submissions snapshot server-owned confirmation/network policy; browser submissions cannot supply overrides. Defaults retain required decisions. Reduced confirmations map to native bounded modes: Codex on-request/workspace-write, Claude acceptEdits with sandboxed Bash auto-allow, Trae auto, OpenCode 1.x project edit rules, and ACP path-verified project edits. ACP commands, missing paths and external access cannot be auto-approved. Codex networking is independently opt-in and cannot expand writable roots. Do not edit global CLI configuration or enable these settings for a real project on the user's behalf.

The HeroUI networking checkbox uses a 16px control and 10px check, with clickable label and keyboard Space support. Saving disables edits/repeated requests. On success close the popover, return focus and show the receipt in the main view; failure keeps input/error in place for retry. Keep the form mounted across save updates and reset only when switching projects.

Permission cards show request reason and command with equally accessible Allow once and Decline actions. Cancellation stops the owned process, not prior writes; for external MCP work, instruct the user to stop the host's already-running operations too.

## Integration and persistence

Local service startup preserves loopback, Host/origin checks and pairing. New project bindings work while online; do not alter business dev commands. Non-Codex sessions cannot overwrite Codex resume IDs. Restart interrupts unfinished work without rerunning it. An empty result, process exit or protocol error cannot be called success.

Client input filling is macOS-only, for the explicitly selected application and a recognized empty chat field. Preserve drafts and never write to editors, terminals or search fields. Never press Send. Report copied/blocked/uncertain honestly, serialize handoffs and do not replay ambiguous delivery after restart. MCP tool names are canonical `pointdom_*`; legacy aliases remain compatible.

Pairing, preferences and per-tab drafts live in browser local storage; service bindings and task records live on disk. Closing the panel preserves them. Theme/language changes preserve task content and drafts. Generated context keys/guidance and copied MCP processing instructions are English; original user/page content remains in its original language. Manual context copying never queues a task.
