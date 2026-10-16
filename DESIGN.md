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

Use one compact executor menu beside Submit, listing only detected CLI tools. Remove the duplicate CLI settings card and the footer account/model description. Use 36px desktop rows with no divider or extra vertical padding, retaining 44px coarse-pointer targets. Keep Check again in the menu; if no tools are detected, show a short empty state and keep detection available. Detection checks executable capabilities, not account readiness. Save one global executor preference across projects. No MCP config, watch instruction, copied task handoff or desktop conversation binding appears in the new workflow.

## Composer and selection

Keep the composer fixed above the scrolling record area. Show project/address separately, then the change request and compact selected-element entries. The destination trigger sizes to text/arrow with an automatic left margin; its hover surface cannot stretch across the footer. Do not add static delivery instructions beneath the composer or technical workflow explanations beneath settings actions. Keep actionable setup guidance and actual error/status feedback. Selection notices state only the immediate action or resulting state; do not repeat preservation guarantees already reflected by the retained draft.

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

Show queued, running, waiting, completed, failed, cancelled and interrupted according to bridge state. An offline service is not an active model run. Use Queued, Running and Completed for CLI tasks. A returned report is not independent verification.

MCP activity contains only explicit agent progress summaries plus lifecycle events, never a fabricated stream of host operations. The claiming session can append bounded, idempotent read/edit/check summaries with `pointdom_progress_task`; the visible panel polls them normally. Progress does not complete a task or reset its start/end times. Trae's private chat, raw tool output and reasoning are not mirrored. Do not backfill missing historical steps or invent progress percentages.

Completed results show total duration beside the result title using saved `startedAt`/`finishedAt`: CLI invocation through completion, or MCP claim through report. Exclude queue time and include approval waits. Do not substitute `updatedAt`; retries or later updates cannot reset duration. Hide missing/invalid/unfinished durations. Support English/Chinese hours, minutes, seconds and an explicit under-one-second label.

Use compact ghost actions for Continue editing, stop/cancel, recovery and client retry. No Commit button or obsolete commit error. Existing committed hashes may remain. Git actions belong to the host; the retired explicit commit endpoint returns 410. Do not push automatically.

## CLI execution

The browser submits only a task ID, registered project ID, selected CLI ID, explicit user instructions and captured DOM. The bridge resolves the canonical working directory and CLI executable; it never uses a browser-provided filesystem path or shell command. The CLI receives bounded JSON context through stdin. DOM remains untrusted location data. Use the user's CLI account/model configuration, no bypass flags or automatic commits. CLI permission denials and authentication/model failures are failures with actionable messages, never successful edits.

The compact executor picker has one row per supported CLI. The full row selects it; show name and one trailing detected/not-detected/check state. Keep hover geometry fixed and keyboard focus visible. Settings and composer share the same globally saved choice. New projects require only `pdo link --origin URL` and Chrome page access, not separate agent configuration.

Submitting starts a local CLI process; queued means another task owns that project. Run one task per project. Tasks in different registered directories remain isolated. Do not resume an unrelated latest CLI session. Save actual tool names, commands, file paths, reported states, exit codes and bounded redacted result excerpts. Exclude stderr, reasoning and credentials. Persist a sanitized final assistant report only after a recognized successful protocol terminal event and successful process exit. Completion reports what the CLI returned, not independent proof of correct edits.

Cancellation terminates the task process tree. Stop/restart interrupts unfinished runs without replaying them. Do not automatically retry ambiguous failures. Preserve drafts on submit errors, deduplicate the same task ID, and never transfer an existing task when the global executor preference changes. Keep historical MCP records readable; the new UI does not offer claim, reassign, watch or copy-MCP actions.

## Installation

Retain browser-based OS detection, one-command local-service installation and automatic pairing. The Chrome extension cannot execute native programs itself; the authenticated loopback service launches the selected local CLI. Initial setup loads/pairs the extension without requiring a project. The CLI account must be installed/logged in by its owner. Project linking remains a local `pdo link` action and does not change the app's development command.

Windows command shims must not be invoked with arbitrary shell text. Resolve supported native executables or known npm JavaScript entry points. Missing or unsupported installations remain disabled. macOS fixture results do not establish native Windows compatibility.
