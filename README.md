<div align="center">

# Aperture for Omarchy

**The human-attention layer for an agentic operating system.**

[![release](https://img.shields.io/badge/release-0.1.1-2563eb)](./manifest.json)
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

## Current Constraints and Upstream Work

**Aperture is not yet ready for the Omarchy plugin catalog.** Two upstream
constraints remain; installing this plugin does not patch Omarchy or Quickshell.

| Constraint | Impact today | Upstream work and acceptance still needed |
| --- | --- | --- |
| **Safe removal — Omarchy** | Stock CLI/menu removal skips Aperture's OMP cleanup and can leave dangling registration. Always use the [two-step deactivation/removal workflow](#deactivate-and-remove), and stop if deactivation fails. | An Omarchy PR is needed for a pre-remove lifecycle hook whose failure prevents removal. Catalog readiness requires that support to ship and pass end-to-end removal checks; the manual workaround does not clear this blocker. |
| **Screen readers — Quickshell** | Quickshell 0.3.1 does not expose its managed windows through AT-SPI, so screen readers cannot discover Aperture controls. Keyboard and pointer interaction are verified; screen-reader interaction is not. | The [upstream fix already exists](https://github.com/quickshell-mirror/quickshell/issues/1006); a duplicate fix PR is not needed. Stock Omarchy must ship a Quickshell build containing it, followed by fresh Orca checks for discovery, announcements, privacy, and actions. |

These are open integration/readiness constraints, not features supplied by this
repository. We do not claim standard removal is safe or screen-reader support
is verified, and we do not claim the required Omarchy removal-hook PR has landed.

## Install

Stock Omarchy installs third-party plugins as Git checkouts:

```bash
omarchy plugin add https://github.com/tomismeta/omarchy-aperture.git --enable
```

Identify a Git installation by its package version, Git commit, and
`config/artifact-policy.json`, not package version alone. Git updates can change
the checkout between immutable releases; see [Reporting an issue](#reporting-an-issue)
for commands that capture all three.

The OMP extension is included in this package; no separate download is needed.
Installation does not change OMP configuration. Activate it explicitly, then
restart any OMP sessions that were already open:

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate
```

Click the Aperture mark in the bar to open the panel. New installs place it in
the right section. Use Omarchy's bar settings to change placement.

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
- `Enter` or a row-body click: focus its exact registered OMP pane
- `A`: expand or collapse `AMBIENT`
- `P` or the privacy control: temporarily hide or reveal details
- `D` or a row's inspection control: inspect its full text without focusing
- while inspecting, `←` / `→` browse visible frames and `↑` / `↓` scroll
- `D` or `Esc` returns from inspection; otherwise `Esc` closes the panel

Inspection uses the same privacy setting and closes if the inspected frame
changes. `Enter` does not focus a session while inspection is open.

The only external action is **Focus OMP session**. Unavailable or ambiguous
targets stay visible but cannot be activated. A new `NOW` item may reveal one
brief passive preview on the focused monitor; it never takes keyboard focus.
`NEXT` and `AMBIENT` never auto-open the panel.

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

**Screen readers:** Quickshell 0.3.1 does not expose its managed windows through
AT-SPI, so screen readers cannot discover Aperture controls on that runtime.
Keyboard and pointer controls remain available. Screen-reader use requires a
stock Quickshell build containing the [upstream accessibility fix](https://github.com/quickshell-mirror/quickshell/issues/1006)
and a fresh acceptance check; it is not yet verified here.

The plugin never bundles, downloads, or installs Node. It contains no
`node_modules` and has no third-party runtime dependencies. Its signed
CommonJS worker bundles first-party ApertureCore and otherwise uses Node
built-ins. There is no runtime installer, package manager, build hook, Docker
dependency, or first-run network bootstrap.

## Privacy and Delivery Failure

Details are visible by default. Enable **Start with details hidden** to replace
titles, summaries, and source labels with neutral placeholders without changing
frame identity, ordering, or focus identity. `P` and the privacy control change
presentation only for the currently open panel, including inspection text.
Private focus targets are volatile and are never persisted or rendered.

The direct OMP-to-worker path is bounded and acknowledged. Native fallback is
allowed only after a definite failure before any direct bytes were written.
Ambiguous and post-write outcomes never emit fallback. The fallback is
token-bounded, runs outside Aperture, and is not covered by Aperture panel
privacy.

Missing or invalid payload, failed provenance, missing or incompatible Node,
malformed protocol, worker failure, no connected session, and calm remain
distinct states. Configuration failures latch; unexpected worker crashes and
temporary contention with a still-exiting OMP socket owner use bounded restart
backoff. Unsafe socket paths, ownership, permissions, or identity failures
latch without automatic retry. The worker must report ready before Aperture
presents calm/attention or accepts focus input.

## Lifecycle

### Update

Update from an unlocked graphical session, then request graceful worker
shutdown. Stop if either command fails:

```bash
omarchy plugin update aperture &&
  omarchy-shell aperture.worker shutdown
```

Check `omarchy-shell aperture.worker status` until `activeProcessCount` and
`processReferenceCount` are both `0`. Then load the updated QML/JavaScript with
the stock shell restart and re-activate:

```bash
omarchy-restart-shell &&
  ~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate
```

The explicit restart is an operational precaution, not evidence that stock
reload is broken. Do not replace it with a custom kill command. This sequence
preserves OMP registration, bar placement, and privacy settings; deactivation
is unnecessary for an update.

Stock update is fast-forward-only and rolls back when the updated checkout
fails plugin validation. If shutdown does not complete or another step fails,
inspect both lifecycle statuses below and resolve the error before continuing.

**Restart already-open OMP sessions afterward.** Updating the package link and
registration does not replace their loaded extension.

### Restart or repair

The worker restarts automatically after an unexpected crash. To request an
immediate worker restart without changing OMP registration:

```bash
omarchy-shell aperture.worker restart
```

Inspect the two independent lifecycle states before repairing:

```bash
omarchy-shell aperture.worker status
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp status
```

The first reports worker status, errors, process counts, and shutdown state;
the second reports OMP package registration (`[]` means absent). Registration
does not prove an already-open OMP session has loaded the extension. When the
shell plugin is disabled its worker IPC is absent; activation re-enables it.

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

Stock Omarchy has no plugin pre-remove hook. **Deactivation must succeed before
removal**; stop if the first command fails:

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp deactivate &&
  omarchy plugin remove aperture
```

Deactivation verifies worker shutdown and owned socket cleanup, removes the
owned OMP package link and registration/settings, disables Aperture through
stock Omarchy, and clears owned worker state. Disabling persists across shell
reloads and removes the bar widget. Deactivation also works if Aperture was
already disabled, provided the shell registry and owned paths can be verified.

Deactivation can fail **after OMP registration has already been removed**, for
example if final worker-state cleanup cannot prove ownership. Keep the checkout
in place: a failure does not mean all earlier changes were rolled back. Use the
two status commands above to distinguish registration state from worker state;
missing worker IPC is expected when the shell plugin is disabled. Resolve the
reported error without force-deleting unverified paths, then rerun `deactivate`.
Only proceed with removal after that command succeeds; reactivation is not a
prerequisite for retrying cleanup.

**Restart already-open OMP sessions after deactivation.** Removing registration
does not unload their in-memory extension, timers, or native notification
fallback. The shutdown proof covers the Aperture worker, not those OMP processes.

Running `activate` again re-enables the shell plugin. Stock disable/re-enable
resets its widget entry: reapply custom placement and privacy settings before
resuming attention delivery.

Removing Aperture directly through the stock CLI/menu skips this cleanup and
can leave a dangling OMP registration. This remains a catalog blocker; the
documented two-step workflow is not a claim that standard removal is safe.

### Reinstall and roll back

For a clean reinstall, deactivate before stock removal, then add the Git
checkout again:

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp deactivate &&
  omarchy plugin remove aperture &&
  omarchy plugin add https://github.com/tomismeta/omarchy-aperture.git --enable &&
  ~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate
```

Restart open OMP sessions afterward. There is no stock per-plugin rollback
command after a successful update. A failed plugin update rolls itself back;
for a larger Omarchy update, restart and select the pre-update system snapshot
from the boot menu.

## Reporting an issue

Run these commands in the affected graphical session and include their output,
including any failure, with the steps to reproduce, expected behavior, and
actual behavior:

```bash
plugin="$HOME/.config/omarchy/plugins/aperture"
jq '{id, version}' "$plugin/manifest.json"
git -C "$plugin" rev-parse HEAD
git -C "$plugin" status --short
jq . "$plugin/config/artifact-policy.json"
omarchy-shell aperture.worker status
"$plugin/bin/omarchy-aperture-omp" status
omarchy-version
pacman -Q quickshell
node --version
omp --version
```

The two status commands describe different states: include both even when one
fails. Missing worker IPC is expected for a disabled plugin; OMP registration
alone does not prove an existing session loaded the extension. `omarchy-version`
is the stock version command, and `pacman -Q quickshell` reports the installed
Quickshell package version without relying on a Quickshell version flag.

Also say whether you restarted the shell and existing OMP sessions after an
update. For focus issues, include the terminal/multiplexer and its version; for
visual or accessibility issues, include theme, scale, monitor arrangement, and
assistive technology/version. Review output and screenshots for private paths,
session text, or other sensitive details before posting; redact those details
but retain release identity and error information.

## Development and Distribution

This repository is the source tree. A stock `omarchy plugin add` clones it,
retaining development tests and tooling so stock `omarchy plugin update` can
continue to fast-forward the checkout.

An authenticated GitHub repository release instead contains a
curated runtime archive: product QML/JavaScript, manifest, preview, launch and
lifecycle commands, active trust policy, and the complete immutable signed
upstream payload. It excludes tests, development fixtures, workflows, vendor
tooling, completed SDLC material, private acceptance data, Node, `node_modules`,
source maps, and third-party runtime dependencies. Extracting that archive is
not a substitute for the stock Git-clone installation and does not provide
stock Git-based plugin updates.

The immutable `omarchy-aperture-v0.1.0` archive contains worker `v0.8.7` and
plugin package `0.1.0`; later Git-main fixes also used `0.1.0`. That historical
archive and tag remain unchanged. Release `omarchy-aperture-v0.1.1` pairs plugin
package `0.1.1` with authenticated worker `v0.8.9`; its archive must match the
tagged source and signed payload. The current Git commit and
`config/artifact-policy.json` identify the checkout and accepted worker release;
the package version alone cannot identify installed bytes.

Release identity is not wire identity. BUILDINFO schema version `2` records
canonical protocol versions, paths, and hashes under `schemas`, and the OMP
package version under `integrations.omp.packageVersion`. Protocol versions
change only with their contracts, not with each package release. The artifact
policy pins authenticated release provenance and hashes; component identity
comes from that hash-authenticated BUILDINFO rather than duplicate policy
version fields.

The vendored worker and OMP extension are authenticated upstream artifacts.
Never patch them downstream; make changes in
[`tomismeta/aperture`](https://github.com/tomismeta/aperture), publish an
authenticated signed worker release, and vendor that release with the guarded
replacement command documented in [CONTRIBUTING.md](https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md).
That document also covers the isolated real-Quickshell regression scenarios.

The plugin package is **0.1.1**. Repository-release publication requires
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
