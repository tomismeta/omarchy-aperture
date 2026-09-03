# Aperture for Omarchy

**Stop babysitting OMP sessions.**

Aperture turns typed events from connected OMP sessions into one calm **Now, Next, and Ambient** panel in stock Omarchy. Its only action is **Focus OMP session**; approve, deny, and answer inside OMP.

> **Availability:** pre-publication. The authenticated production payload is vendored, but the public repository and marketplace submission remain gated on current stock-Omarchy acceptance.

## Install and connect OMP

Installation and OMP registration are separate, explicit steps. Plugin installation never mutates OMP state automatically.

After installing and enabling a verified checkout, connect OMP with:

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate
```

The public `omarchy plugin add … --enable` command will be added here only after the HTTPS repository exists. Do not substitute a private checkout or an unverified archive.

New installs place the widget in the right section. Omarchy preserves an existing position during updates; move it explicitly when needed:

```bash
omarchy bar move aperture --section right
```

## First use

The bar mark reflects attention pressure without a count badge:

- **NOW**: something needs current attention
- **NEXT**: queued work can wait
- **AMBIENT**: quiet context; no action needed
- **Nothing needs you now**: connected sessions are calm
- **No active OMP sessions**: the worker is ready but has no source coverage

Click the bar mark to open Aperture. `↑`/`↓` selects a focusable NOW or NEXT row, `Enter` focuses its exact registered OMP pane, `P` temporarily hides or reveals details for the open panel, and `Esc` closes it. Unavailable or ambiguous targets remain visible but cannot be activated.

An optional focused-monitor binding belongs in `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + A", "Aperture",
  "/usr/bin/env OMARCHY_PATH=/usr/share/omarchy /usr/bin/omarchy-shell shell toggle aperture")
```

On the verified stock keymap, `SUPER + A` is free; `SUPER + CTRL + A` is Audio and `SUPER + SHIFT + A` is ChatGPT.

## What it does—and does not do

Aperture for Omarchy is OMP-only. It does not aggregate Claude Code, Codex, OpenCode, Pi, arbitrary desktop notifications, or notification prose. It does not require a separately installed Aperture CLI/runtime, Docker, a separate Node/npm installation, an Omarchy or OMP source patch, or a first-run download.

The signed OMP extension maps allowlisted typed lifecycle events once. The signed worker owns ApertureCore judgment, continuity, bounded persistence, replay, direct delivery receipts, and focus coordination. QML renders complete accepted snapshots and sends only bounded opaque focus requests; it never ranks, deduplicates, changes lanes, parses OMP payloads, or handles approvals/input.

When direct delivery is definitely unavailable before any write, OMP may emit one bounded native notification as a fail-open user alert. That alert stays outside Aperture and is never read back. Ambiguous post-write outcomes retry the same event identity and never emit both semantic attention and fallback.

## Requirements and supported focus

- stock Omarchy plugin APIs and unmodified `/usr/share/omarchy/shell`
- OMP >=18.0.0
- Node >=22 supplied by stock Omarchy through the graphical-session PATH or standard mise shim
- no runtime installer, downloader, package manager, or build hook

Focus is deliberately fail-closed:

| Backend | Accepted target | Refused boundary |
| --- | --- | --- |
| Herdr 0.8.2 | Interactive OMP, one attached Herdr UI client, opaque pane ID, exact marked Foot surface | Missing/unsafe socket or pane, duplicate/lost marker, or multiple UI clients |
| Foot 1.27 | Interactive OMP directly in Foot, exact one-shot terminal probe | Unrecognized class, missing/duplicate marker, or ambiguous surface |
| tmux 3.7c | Interactive OMP pane, owned socket and pane, exactly one attached client | Detached/multiple/nested clients, unsafe socket, missing pane, or ambiguous surface |

Kitty, WezTerm, Zellij, Ghostty, Alacritty, GNU Screen/`STY`, generic xterm, RPC/headless sessions, and every unknown context are non-navigable. Focus never resumes, attaches, spawns a terminal, interpolates a shell command, responds to OMP, or sends ApertureCore feedback.

## Privacy and failure behavior

New installs start with typed OMP details visible. Enable **Start with details hidden** to replace titles, summaries, and source labels with neutral placeholders while preserving frame identity, canonical ordering, and opaque focus identity. `P` inverts that setting only for the current open panel; closing resets the override.

A new NOW identity may show one eight-second preview on the focused monitor. The persistent privacy setting controls that preview, so a new install shows the same bounded typed OMP details as the panel. Versions refresh visible content without restarting the timer; a 30-second cooldown prevents reveal storms; NEXT and AMBIENT never auto-reveal. The preview is keyboard-passive. It has no pointer input for its first 450 ms, then exposes an accessible **Open Aperture** action.

If exact focus expires or becomes unavailable, the panel reopens on the originating monitor and states the failure. Successful focus leaves it closed. There is no retry, approve, deny, or response action in the panel.


Missing files, non-production policy, failed provenance, missing Node, incompatible Node, malformed protocol, unexpected worker exit, and a valid calm snapshot remain distinct visible states. Configuration and compatibility failures latch instead of restarting in a loop; unexpected crashes use bounded restart backoff.
Direct state is limited to 24 hours, 1,024 records, and 4 MiB. Runtime/state directories use mode `0700`; files and the worker socket use `0600`. Private focus targets remain volatile and are never persisted or rendered.

## Deactivate and remove

Stock Omarchy has no pre-remove hook. Deactivate OMP before removing the plugin:

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp deactivate
omarchy plugin remove aperture
```

Deactivation and pre-remove cleanup must prove zero workers, listeners, sockets, timers, queued input/focus requests, OMP links, and owned lock/settings entries before checkout deletion.

## Version and artifact identity

These numbers are independent and are never synchronized or embedded in the product name:

| Track | Meaning |
| --- | --- |
| Aperture plugin `0.1.0` | Public SemVer for the Omarchy plugin (`id: aperture`, display name `Aperture`) |
| Embedded OMP package `0.1.0` | Private integration version reported by the authenticated signed payload |
| `aperture-worker-v…` | Immutable signed upstream payload provenance; new bytes require the next unused signed tag |
| Aperture/Core package versions | Source provenance for the embedded engine, not the plugin version or proof of npm publication |
| Wire/schema versions | Compatibility boundaries changed only with an explicit protocol migration |
| OMP/Node/Herdr/Foot/tmux versions | Third-party compatibility constraints |

Existing npm and signed-tag histories are immutable. In particular, the currently published `@tomismeta/aperture` npm release is `0.5.0`; the upstream main workspace is a later `0.10.0` candidate. Neither is renamed to `0.1.0`.

## Runtime architecture

```text
typed lifecycle events from OMP 18
  -> signed Aperture OMP extension
  -> worker-owned $XDG_RUNTIME_DIR/omarchy/aperture/attention.sock
  -> canonical OMP attention events + private focus control
  -> verified Node >=22 launcher
  -> signed dependency-free CommonJS worker + ApertureCore
  -> exact private worker-output JSONL snapshots
  -> keep-loaded Service.qml / WorkerModel.qml
  -> Panel.qml on every monitor

definite pre-write direct failure
  -> bounded native OMP alert outside Aperture
  -> never re-ingested
```

The extension runs inside OMP and starts no sidecar. One worker serves every monitor. The worker alone creates and owns the direct socket. `Service.qml` owns process/protocol state, bounded ASCII JSONL framing, restart/backoff, focus control, and teardown. A shell-owned one-shot cleanup process handles the stock loader's immediate service destruction without starting ApertureCore. `WorkerModel.qml` owns accepted protocol state. `Panel.qml` owns rendering and interaction.

The public Aperture stdio surface and the private Omarchy worker output are separate contracts. Both advertise an exact protocol version in their hello frame. Public surface frames cannot carry navigation; only private worker frames may carry `{kind: "opaque-focus", handle}`. Complete snapshot totals may exceed bounded visible prefixes, and the top header reports canonical totals—including source coverage—rather than recounting clipped arrays.

The combined signed payload contains the worker, private OMP manifest and extension, canonical schemas/fixtures, trusted validation evidence, and `BUILDINFO.json`. It excludes the generic Aperture HTTP runtime, registry discovery, bearer auth, CLI, TUI, installers, `node_modules`, source maps, and undeclared runtime imports. Every marketplace-sensitive text artifact must be at most 524,288 bytes.

## Authenticated release and remaining publication gate

`aperture-worker-v0.7.4` at `c3b5fc3a53a46c0bf937f8bac02c13bbe50d915d` is the current authenticated production payload. The exact successful chain is Release Check `33810950478`, Worker Artifact `33811637481`, dispatcher `33811765733`, Direct Release `33811772024`, and Release Evidence `33812115198`. The [immutable release](https://github.com/tomismeta/aperture/releases/tag/aperture-worker-v0.7.4) binds its payload (`45112823`), `BUILDINFO.json` (`45113177`), archive (`45113192`), and release report (`45113854`) attestations to `refs/tags/aperture-worker-v0.7.4` and that source commit.

The authenticated archive is 166,454 bytes with SHA-256 `021f5a6bb60de53283881a72cc577aca5f2f953ebcc6fe7c0513f33e27e288ad`. The bundled worker is 517,433 bytes and the OMP extension is 49,680 bytes, both below the 524,288-byte marketplace limit. The private OMP package reports `0.1.0`; upstream Aperture and ApertureCore retain `0.10.0` and `0.9.0`.

`aperture-worker-v0.7.3` and v0.7.2 are immutable superseded production evidence, not rollback targets. Stock direct-Foot testing exposed v0.7.2's early marker claim, which OMP's title generator could overwrite. v0.7.3 deferred that claim until actionable attention, but exact stock replay then exposed reuse of the canonical event ID with a different focus payload; the worker correctly rejected the conflict and left the card non-navigable. v0.7.4 uses a deterministic distinct focus-replay identity while preserving non-blocking initial attention. v0.7.0 produced no artifact after strict tag verification exposed checkout tag shadowing. v0.7.1 passed Artifact and Direct Release, but evidence dispatch was rejected while parsing a job-level runner context; it produced no release. v0.6 is superseded historical evidence, and v0.5.2 remains rejected evidence.

Authenticated vendoring completed through `.github/scripts/vendor-aperture-worker-release.mjs`. `config/artifact-policy.json` now requires `artifactAcceptance: production` and `productionEligible: true`. Remaining publication gates are:

- full local tests and the production verifier
- committed-plugin stock tests for missing/non-production/invalid payloads, missing/incompatible Node, malformed/oversized/mismatched protocol, calm, NOW/NEXT/AMBIENT, focus failure/success, restart, hard crash, disable/re-enable, activation/deactivation/removal/reinstall
- keyboard, pointer, dark/light theme, scale, overflow, and multi-monitor checks
- zero Omarchy/OMP source modifications and a Hyprland graphical-session cgroup owner

Production eligibility proves the signed artifact contract; it does not imply marketplace acceptance, user adoption, or a durable business moat.

## Product wedge and defensibility

This plugin is a focused OMP/Omarchy channel—not Aperture's primary go-to-market surface. The broader Aperture product's sharp initial wedge is local Claude Code babysitting relief: a fast first useful approval or question, one calm queue, and a supported response back to the originating agent. The Omarchy plugin demonstrates the complementary ambient path: see attention where you already work, then return safely to the exact OMP pane.

The defensible asset present today is engineering trust, not a claimed network effect: typed signals instead of scraped prose, deterministic inspectable judgment, normalized semantics, causal replay/continuity, exact fail-closed focus, and an atomic signed release chain. Capture/replay calibration, operator memory, adoption scale, and compounding data remain roadmap opportunities—not current moat claims.

## Repository boundaries

- canonical worker, OMP integration, schemas, and signed releases: [`tomismeta/aperture`](https://github.com/tomismeta/aperture)
- Omarchy packaging, QML, lifecycle, and stock acceptance: this repository
- Omarchy and OMP source trees: read-only platform boundaries

See [HANDOFF.md](./HANDOFF.md), [PROTOCOL.md](./PROTOCOL.md), [COORDINATION.md](./COORDINATION.md), and [PROTOCOL_BASELINE](./PROTOCOL_BASELINE) for normative engineering detail.
