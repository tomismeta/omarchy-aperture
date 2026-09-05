<div align="center">

# Aperture for Omarchy

**The human-attention layer for an agentic operating system.**

[![release](https://img.shields.io/badge/release-0.1.0-2563eb)](./manifest.json)
[![Omarchy](https://img.shields.io/badge/Omarchy-shell%20plugin-7c3aed)](https://omarchy.org/manual/shell-plugins/)
[![OMP](https://img.shields.io/badge/OMP-18%2B-0f766e)](https://github.com/can1357/oh-my-pi)
[![license](https://img.shields.io/badge/license-MIT-6f42c1)](./LICENSE)

<img src="preview.png" alt="Aperture showing OMP attention across Now, Next, and Ambient" width="400">
<p></p>
</div>

**Agent work runs in parallel. Human attention stays finite.**

Typed OMP events become a clear `NOW`, `NEXT`, and `AMBIENT` attention view,
with exact, fail-closed focus back to the right pane. Aperture is OMP-only: it
does not inspect desktop notifications or notification text, and it never
handles approvals or answers on OMP's behalf.

## Install

Stock Omarchy installs third-party plugins as Git checkouts:

```bash
omarchy plugin add https://github.com/tomismeta/omarchy-aperture.git --enable
```

Installation does not change OMP configuration. Activate the authenticated OMP
extension explicitly, then restart any OMP sessions that were already open:

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate
```

Click the Aperture mark in the bar to open the panel. New installs place it in
the right section; move it with:

```bash
omarchy bar move aperture --section right
```

### Optional key binding

`Magic + A` is not built in. To add it yourself, put this binding in
`~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + A", "Aperture",
  "/usr/bin/env OMARCHY_PATH=/usr/share/omarchy /usr/bin/omarchy-shell shell toggle aperture")
```

## Use

| State | Meaning |
| --- | --- |
| **NOW** | Something needs current attention. |
| **NEXT** | Queued work can wait. |
| **AMBIENT** | Quiet context; no action is needed. |
| **Nothing needs you now** | Connected sessions are calm. |
| **No OMP sources connected** | The worker is ready, but no OMP source is connected. |

Panel controls:

- click the Aperture mark, or use your optional binding, to open or close
- `↑` / `↓`: select a visible focusable row
- `Enter` or a row click: focus its exact registered OMP pane
- `A`: expand or collapse `AMBIENT`
- `P`: temporarily hide or reveal details
- `Esc`: close

The only action is **Focus OMP session**. Unavailable or ambiguous targets stay
visible but cannot be activated. A new `NOW` item may reveal one brief passive
preview on the focused monitor; it never takes keyboard focus. `NEXT` and
`AMBIENT` never auto-open the panel.

When OMP supplies a usable bounded session name, Aperture can show it. Otherwise
it shows a stable, privacy-safe anonymous label so concurrent sessions remain
distinguishable. Names, anonymous labels, and other facets are presentation
only: they do not change identity, judgment, lanes, ordering, or continuity.

## Supported Focus

Focus is deliberately fail-closed:

| Backend | Supported target | Refused boundary |
| --- | --- | --- |
| Herdr 0.8.2 | Interactive OMP, one attached Herdr UI client, opaque pane ID, exact marked Foot surface | Missing or unsafe socket/pane, duplicate or lost marker, multiple UI clients |
| Foot 1.27 | Interactive OMP directly in Foot, exact one-shot terminal probe | Unknown class, missing or duplicate marker, ambiguous surface |
| tmux 3.7c | Interactive OMP pane, owned socket and pane, exactly one attached client | Detached, multiple, or nested clients; unsafe socket; missing pane; ambiguous surface |

Kitty, WezTerm, Zellij, Ghostty, Alacritty, GNU Screen/`STY`, generic xterm,
RPC/headless sessions, and unknown contexts are non-navigable. Aperture never
resumes or attaches a session, spawns a replacement terminal, interpolates a
shell command, responds to OMP, or sends ApertureCore feedback from focus.

## Requirements and Runtime

- stock Omarchy plugin APIs and an unmodified `/usr/share/omarchy/shell`
- OMP 18 or newer
- Node 22 or newer supplied by stock Omarchy's graphical-session environment
- Herdr 0.8.2, Foot 1.27, or tmux 3.7c for navigable focus

The plugin never bundles, downloads, or installs Node. It contains no
`node_modules` and has no third-party runtime dependencies. Its signed
CommonJS worker bundles first-party ApertureCore and otherwise uses Node
built-ins. There is no runtime installer, package manager, build hook, Docker
dependency, or first-run network bootstrap.

## Privacy and Delivery Failure

Details are visible by default. Enable **Start with details hidden** to replace
titles, summaries, and source labels with neutral placeholders without changing
frame identity, ordering, or focus identity. `P` changes presentation only for
the currently open panel. Private focus targets are volatile and are never
persisted or rendered.

The direct OMP-to-worker path is bounded and acknowledged. Native fallback is
allowed only after a definite failure before any direct bytes were written.
Ambiguous and post-write outcomes never emit fallback. The fallback is
token-bounded, runs outside Aperture, and is not covered by Aperture panel
privacy.

Missing or invalid payload, failed provenance, missing or incompatible Node,
malformed protocol, worker failure, no connected session, and calm remain
distinct states. Configuration failures latch; unexpected worker crashes use
bounded restart backoff.

## Lifecycle

### Update

```bash
omarchy plugin update aperture
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate
```

Stock update is fast-forward-only and rolls back when the updated checkout
fails plugin validation. Re-activation verifies and transactionally replaces
the OMP package registration. Restart open OMP sessions afterward.

### Restart or repair

The worker restarts automatically after an unexpected crash. To request an
immediate worker restart without changing OMP registration:

```bash
omarchy-shell aperture.worker restart
```

For an installation or integration failure, verify the checkout, re-activate
OMP, and restart open OMP sessions:

```bash
omarchy plugin validate ~/.config/omarchy/plugins/aperture
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-verify-payload --require-production
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate
```

If Node is missing or damaged, repair stock Omarchy rather than installing a
private runtime for Aperture. The stock `omarchy reinstall` recovery resets
Omarchy packages and configuration, so back up your configuration first.

### Deactivate and remove

Stock Omarchy has no plugin pre-remove hook. Disconnect OMP first:

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp deactivate
omarchy plugin remove aperture
```

Deactivation fails closed unless it can prove the worker, socket, timers,
queued requests, OMP package link, and owned OMP settings are gone.

### Reinstall and roll back

For a clean reinstall, deactivate before stock removal, then add the Git
checkout again:

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp deactivate
omarchy plugin remove aperture
omarchy plugin add https://github.com/tomismeta/omarchy-aperture.git --enable
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate
```

Restart open OMP sessions afterward. There is no stock per-plugin rollback
command after a successful update. A failed plugin update rolls itself back;
for a larger Omarchy update, restart and select the pre-update system snapshot
from the boot menu.

## Development and Distribution

This repository is the source tree. A stock `omarchy plugin add` clones it,
retaining development tests and tooling so stock `omarchy plugin update` can
continue to fast-forward the checkout.

An authenticated GitHub repository release, if approved, instead contains a
curated runtime archive: product QML/JavaScript, manifest, preview, launch and
lifecycle commands, active trust policy, and the complete immutable signed
upstream payload. It excludes tests, development fixtures, workflows, vendor
tooling, completed SDLC material, private acceptance data, Node, `node_modules`,
source maps, and third-party runtime dependencies. Extracting that archive is
not a substitute for the stock Git-clone installation and does not provide
stock Git-based plugin updates.

The vendored worker and OMP extension are authenticated upstream artifacts.
Never patch them downstream; make changes in
[`tomismeta/aperture`](https://github.com/tomismeta/aperture), publish an
authenticated signed worker release, and vendor that release transactionally.

The plugin package remains **0.1.0**. Repository-release publication requires
the protected-main checks, an authorized signed tag, release-environment
approval, and immutable-release enforcement. Plugin-catalog publication is
blocked pending an explicit readiness decision and is a separate manual gate.
This repository does not imply catalog readiness.

## Relationship to Aperture

The main [Aperture repository](https://github.com/tomismeta/aperture) owns the
attention engine, SDK, CLI/TUI product, integrations, and signed worker
releases. This repository owns the Omarchy delivery channel for OMP. Installing
this plugin does not install or start the generic Aperture product runtime.

## License

[MIT](./LICENSE)
