<div align="center">

# Aperture for Omarchy

**An attention panel for your OMP sessions, built into Omarchy.**

[![release](https://img.shields.io/badge/release-0.1.1-2563eb)](./manifest.json)
[![Omarchy](https://img.shields.io/badge/Omarchy-shell%20plugin-7c3aed)](https://omarchy.org/manual/shell-plugins/)
[![OMP](https://img.shields.io/badge/OMP-18%2B-0f766e)](https://github.com/can1357/oh-my-pi)
[![license](https://img.shields.io/badge/license-MIT-6f42c1)](./LICENSE)

<img src="preview.png" alt="Aperture showing OMP attention across Now, Next, and Ambient" width="400">
<p></p>
</div>

See what needs you, inspect the details, and jump back to the right session.

- Follow requests for input or approval, failures, and completed work across OMP sessions.
- Separate attention into **NOW**, **NEXT**, and **AMBIENT**.
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

### 3. Add the recommended Magic + A shortcut

Add this to `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + A", "Aperture",
  "/usr/bin/env OMARCHY_PATH=/usr/share/omarchy /usr/bin/omarchy-shell shell toggle aperture")
```

`Magic` corresponds to `SUPER`. The binding is not installed automatically;
if you already use it, remove the conflicting binding or choose another key.
Reload your configuration:

```bash
hyprctl reload config-only
```

You can also click Aperture's bar mark. New installs place it on the right;
change placement in Omarchy's bar settings.

### 4. Try it

- Start a short task in a new OMP session in a supported terminal.
- When OMP reports an update, press **Magic + A** to open Aperture.
- Select the item and press **Enter**, or click its row, to return to its pane.

## Using Aperture

- **NOW:** needs current attention.
- **NEXT:** queued work that can wait.
- **AMBIENT:** quiet context; no action needed.
- **Nothing needs you now:** connected sessions are calm.

Controls:

- **Magic + A / bar mark:** open or close.
- **↑ / ↓:** select a focusable row.
- **Enter / row click:** focus its OMP pane.
- **D / inspection control:** inspect the full attention text without focusing.
- **← / →** while inspecting: browse items; **↑ / ↓:** scroll.
- **P / privacy control:** hide or reveal details in the open panel, including inspection.
- **A:** expand or collapse Ambient.
- **D / Esc** while inspecting: return to the list; otherwise **Esc:** close.

Inspection closes if its item changes; **Enter** does not focus while inspecting.
Enable **Start with details hidden** in settings for persistent privacy.
Panel privacy does not cover native OMP notification fallback.

New NOW items may show a brief preview without taking keyboard focus.
NEXT and AMBIENT never auto-open the panel. Unavailable or ambiguous focus
targets remain visible but cannot be activated.

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

- **OMP integration:** the Omarchy plugin runs outside OMP. The bundled extension
  runs inside OMP to supply structured events and session-focus information.
  It must be activated, and existing sessions restarted to load it.
- **Removal:** stock Omarchy has no pre-remove hook for cleaning up OMP
  registration before deleting the plugin. Deactivation performs that cleanup
  while the required files still exist.
- **Keyboard shortcut:** global bindings belong to your Hyprland configuration.
  Aperture recommends **Magic + A** rather than automatically editing that file
  and potentially replacing a personal shortcut. This is a configuration
  choice, not a technical impossibility.

## Relationship to Aperture

The main [Aperture repository](https://github.com/tomismeta/aperture) owns the
attention engine, SDK, CLI/TUI product, integrations, and signed worker
releases. This repository owns the Omarchy delivery channel for OMP. Installing
this plugin does not install or start the generic Aperture product runtime.

## License

[MIT](./LICENSE)

[focus]: https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#supported-focus
[update]: https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#update
[recovery]: https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#restart-or-repair
[removal]: https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#deactivate-and-remove
[reporting]: https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#reporting-an-issue
[readiness]: https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#integration-readiness
