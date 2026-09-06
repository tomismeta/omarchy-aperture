<div align="center">

# Aperture for Omarchy

**An attention panel for your OMP sessions, built into Omarchy.**

[![release](https://img.shields.io/badge/release-0.1.2-2563eb)](https://github.com/tomismeta/omarchy-aperture/releases/tag/omarchy-aperture-v0.1.2)
[![Omarchy](https://img.shields.io/badge/Omarchy-shell%20plugin-7c3aed)](https://omarchy.org/manual/shell-plugins/)
[![OMP](https://img.shields.io/badge/OMP-18%2B-0f766e)](https://github.com/can1357/oh-my-pi)
[![license](https://img.shields.io/badge/license-MIT-6f42c1)](./LICENSE)

<img src="preview.png?v=0.1.2-review-2" alt="Aperture's current overview showing agent sessions with NOW and NEXT attention" width="400">
<p>Your agent sessions, at a glance.</p>
</div>

See what needs you, inspect the details, and jump back to the right session.

**0.1.2** includes authenticated signed worker **v0.8.13**.
See the [release notes][release-notes].

- Follow requests for input or approval, failures, and completed work across OMP sessions.
- Keep a compact, session-first view of **NOW** and **NEXT**, with quiet **AMBIENT** context.
- Jump to the matching OMP pane in a supported terminal setup.
- Inspect details without switching windows, or hide them for privacy.

Aperture uses OMP events, not desktop notification text. It never approves
requests or answers on your behalf.

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
- Select the item and press **Enter**, or click its row, to return to its pane.

## Using Aperture

- **NOW:** needs current attention.
- **NEXT:** queued work that can wait.
- **AMBIENT:** quiet context; no action needed.
- **Nothing needs you now:** connected sessions are calm.

The overview puts the session first and omits empty lanes. **Open Session**
appears on the hovered or keyboard-selected row without moving its text.
Row click and Enter return to the exact originating pane. **D** opens a
read-only Details view instead.

Controls:

- **Super + A / bar mark:** open or close.
- **↑ / ↓:** select a focusable row.
- **Enter / Open Session / row click:** open its OMP pane.
- **D:** open Details for the selected item without opening its session.
- **← / →** in Details: browse items; **↑ / ↓:** scroll.
- **P:** hide or reveal session text in the open panel and Details.
- **A:** expand or collapse Ambient.
- **D / Esc** in Details: return to the list; otherwise **Esc:** close.

Details closes if its item changes; **Enter** does not focus while in Details.
Enable **Start with details hidden** in settings for persistent privacy.
Panel privacy does not cover native OMP notification fallback.

Unseen NOW or NEXT attention opens a notification deck without taking keyboard
focus or opening the overview. AMBIENT never starts a notification.
Cards show supplied event titles and summaries; hover pauses expiry and reveals
**Open Session**, which removes only the activated card.

New arrivals append below held cards, up to **33 cards**. Scroll to reach
appended cards or long bodies; use the bar or your shortcut to open the
overview for remaining attention. Unavailable or ambiguous session targets
remain visible but cannot be activated.

If you choose another global binding, update **Open Aperture shortcut (display
only)** in settings to match. This changes the hint, not the Hyprland binding.

### A closer look
Illustrative OMP event metadata, rendered by the current plugin.


<img src="docs/images/notifications.png?v=0.1.2-review-2" alt="Aperture notification deck with session-specific attention and Open Session actions" width="400">

**Notifications:** event titles and summaries, with direct navigation to each
originating session.

<img src="docs/images/details.png?v=0.1.2-review-2" alt="Aperture Details view showing supplied attention text" width="400">

**Details (D):** the full attention text supplied by an OMP event; it may be
shorter than the agent's response.

<img src="docs/images/privacy.png?v=0.1.2-review-2" alt="Aperture overview with private session text replaced by neutral placeholders" width="400">

**Privacy (P):** neutral placeholders hide rendered session text without
changing ordering or session navigation.

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
