<div align="center">

# Aperture for Omarchy

**An attention panel for your OMP sessions, built into Omarchy.**

[![release](https://img.shields.io/badge/release-0.2.1-2563eb)](https://github.com/tomismeta/omarchy-aperture/releases/tag/omarchy-aperture-v0.2.1)
[![Omarchy](https://img.shields.io/badge/Omarchy-shell%20plugin-7c3aed)](https://omarchy.org/manual/shell-plugins/)
[![OMP](https://img.shields.io/badge/OMP-18%2B-0f766e)](https://github.com/can1357/oh-my-pi)
[![license](https://img.shields.io/badge/license-MIT-6f42c1)](./LICENSE)

<img src="preview.png?v=focused-hero" alt="Approved HTML illustration of Aperture notifications and overview with session metadata" width="1100">
<p>Your agent sessions, at a glance. Approved HTML illustration; not a runtime screenshot.</p>
</div>

See what needs you, inspect the details, and jump back to the right session.

**0.2.1** includes authenticated signed worker **v0.8.14**.
See the [release notes][release-notes].

- Follow requests for input or approval, failures, and completed work across OMP sessions.
- Keep a compact, session-first view of **NOW** and **NEXT**, with quiet **AMBIENT** context.
- Jump to the matching OMP pane in a supported terminal setup.
- Inspect repository, branch, worktree, provider, and model details, or hide them for privacy.
- Clear one item or all attention without stopping sessions or answering requests.

Aperture uses OMP events, not desktop notification text. It never approves
requests or answers on your behalf.

## See it in action

A short walkthrough of attention moving through NOW and NEXT,
inspecting session details, and returning to the originating session.

https://github.com/user-attachments/assets/a8c82807-4d6c-4119-a6b5-77f3bbc88c17

*Generated walkthrough, not a native screen recording. It illustrates
the interaction flow, not compatibility or accessibility acceptance.*

## Get started

Requirements:

- Stock Omarchy with shell-plugin support.
- OMP 18+ and Node 22+ available in the graphical session.
- For jump-to-session: Foot 1.27, Herdr 0.8.2 with one attached UI client, or
  tmux 3.7c with one attached client. See [supported focus configurations][focus]
  for details; other terminals and headless sessions are not navigable.

### 1. Install the plugin

```bash
omarchy plugin add https://github.com/tomismeta/omarchy-aperture.git --enable
```

No separate Aperture application, dependency installation, or build is needed.

### 2. Enable the included OMP extension

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate
```

**This step is required. Restart any already-open OMP sessions**, or start a new
one, to load the extension.

### 3. Add the recommended Super + A shortcut

Add this to `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + A", "Aperture",
  "/usr/bin/env OMARCHY_PATH=/usr/share/omarchy /usr/bin/omarchy-shell shell toggle aperture")
```

The binding is not installed automatically;
if you already use it, remove the conflicting binding or choose another key.
Reload your configuration:

```bash
hyprctl reload config-only
```

You can also click Aperture's bar mark. New installs place it on the right;
change placement in Omarchy's bar settings.

### 4. Try it

- Start a short task in a new OMP session in a supported terminal.
- When OMP reports an update, press **Super + A** to open Aperture.
- Select the item and press **Enter**, or choose **Open Session**, to return to its pane.

## Using Aperture

- **NOW:** needs current attention.
- **NEXT:** queued work that can wait.
- **AMBIENT:** quiet context; no action needed.
- **Nothing needs you now:** connected sessions are calm.

The overview puts the session first and omits empty lanes. Repository, branch,
and model add quiet context when supplied; Details also labels the provider
and worktree. Missing metadata is omitted.
**Open Session** appears on the hovered or keyboard-selected row without
moving its text. Click a row or press **D** to inspect it; **Enter** or
**Open Session** returns to its exact originating OMP session, including from Details.

Controls:

- **Super + A / bar mark:** open or close.
- **↑ / ↓:** select a focusable row.
- **Enter / Open Session:** open the selected or inspected item's exact OMP session.
- **Row click / D:** open Details without opening its session.
- **← / →** in Details: browse items; **↑ / ↓:** scroll.
- **C** in the overview: clear all current NOW and NEXT attention, including overflow.
- **C** in Details: clear only the inspected item and return to the overview.
- **P:** hide or reveal session text in the open panel and Details.
- **A:** expand or collapse Ambient.
- **D / Esc** in Details: return to the list; otherwise **Esc:** close.

Clearing attention never answers a request or stops an agent. Cleared revisions
stay dismissed across worker restarts; new attention can still appear.
Details closes if its item changes.
Enable **Start with details hidden** in settings for persistent privacy.
Panel privacy does not cover native OMP notification fallback.

Unseen NOW or NEXT attention opens a notification deck without taking keyboard
focus or opening the overview. AMBIENT never starts a notification.
Cards show the session and reason for attention, with supplied repository,
branch, and model context. Click a card to open the overview with that item
selected. Hover pauses expiry and reveals **Open Session**, which returns to
that exact session and removes only the activated card. Notifications have no
clear shortcut.

New arrivals append below held cards, up to **33 cards**. Scroll to reach
appended cards or long bodies; use the bar or your shortcut to open the
overview for remaining attention. Unavailable or ambiguous session targets
remain visible but cannot be activated.

If you choose another global binding, update **Open Aperture shortcut (display
only)** in settings to match. This changes the hint, not the Hyprland binding.

### A closer look
These approved HTML illustrations use the same three example sessions as the
hero. They are not runtime screenshots; colors in the plugin follow your
Omarchy theme. [HTML illustration source](docs/mockups/session-metadata.html).

<img src="docs/images/notifications.png?v=session-metadata" alt="HTML illustration of session-first Aperture notifications with repository, branch, and model context" width="480">

**Notifications:** recognize the session and its reason for attention. Click
the popup for the overview, or use **Open Session** to return directly.

<img src="docs/images/overview.png?v=panel-polish" alt="HTML illustration of the Aperture overview with Metadata adapter in NOW and Metadata presentation and Socket reconnect in NEXT" width="480">

**Overview:** scan sessions in Aperture's NOW and NEXT order. Click a row or
press **D** to inspect it; **Enter / Open Session** opens its session.

<img src="docs/images/details.png?v=panel-polish" alt="HTML illustration of Aperture Details with event context, repository, branch, worktree, provider, and model" width="480">

**Details:** complete supplied event context and labeled metadata; the event
text may be shorter than the agent's response. **C** clears this item only.

<img src="docs/images/privacy.png?v=panel-polish" alt="HTML illustration of private Aperture Details with neutral placeholders and a panel-only reveal action" width="480">

**Privacy (P):** neutral placeholders hide session text and metadata without
changing ordering or session navigation. Revealing the panel leaves
notifications private.

## Update and remove

### Update

Follow the [settings-preserving update procedure][update]: update the checkout,
shut down the worker and wait for it to exit, restart the shell, then activate
and restart existing OMP sessions. Do not deactivate for a normal update.

### Deactivate and remove

**Deactivate first; do not remove directly through the Omarchy menu.**

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp deactivate &&
  omarchy plugin remove aperture
```

- If deactivation fails, stop and keep the checkout; follow [recovery guidance][removal].
- Restart existing OMP sessions afterward to unload the extension.

## Troubleshooting

- **No OMP sources connected:** confirm extension activation, restart OMP,
  and run a short task.
- **An item cannot be focused:** check the [supported terminal setup][focus].
- **Worker or setup error:** inspect both statuses in the graphical session:

```bash
omarchy-shell aperture.worker status
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp status
```

Registration alone does not prove an existing session loaded the extension.
Missing worker IPC is expected when the plugin is disabled.
See [repair and recovery][recovery] or [report an issue with diagnostics][reporting].
Contributor documentation also tracks [screen-reader and catalog readiness][readiness].

## Why the extra setup?

- **OMP extension:** supplies structured attention and exact-session focus through
  stock OMP's ExtensionAPI; no modified OMP build is needed. Activation is
  explicit, and already-open sessions must restart. See the [integration research][research].
- **Removal:** stock Omarchy has no pre-remove hook. Deactivate before deleting
  the checkout so its cleanup code can remove OMP registration.
- **Shortcut:** global bindings belong to your Hyprland configuration. Aperture
  does not edit that file or replace your existing shortcuts.

## Relationship to Aperture

The main [Aperture repository](https://github.com/tomismeta/aperture) owns the
attention engine, SDK, CLI/TUI product, integrations, and signed worker
releases. This repository owns the Omarchy delivery channel for OMP. Installing
this plugin does not install or start the generic Aperture product runtime.

## License

[MIT](./LICENSE). Bundled components retain their licenses; see
[third-party notices](./THIRD-PARTY-NOTICES).

[focus]: https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#supported-focus
[update]: https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#update
[recovery]: https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#restart-or-repair
[removal]: https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#deactivate-and-remove
[reporting]: https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#reporting-an-issue
[readiness]: https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#integration-readiness
[research]: https://github.com/tomismeta/omarchy-aperture/blob/main/OMP-INTEGRATION-RESEARCH.md
[release-notes]: ./RELEASE-NOTES.md
